import { SIM_HEIGHT, SIM_WIDTH, WORKGROUP_SIZE } from "./constants";
import { float32ToFloat16 } from "./float16";
import type { MouseState } from "./types";
import RENDER_WGSL from "./shaders/render.wgsl?raw";
import BLUR_WGSL from "./shaders/blur.wgsl?raw";
import SPLAT_WGSL from "./shaders/splat.wgsl?raw";

type InitResult = {
  device: GPUDevice;
  context: GPUCanvasContext;
  format: GPUTextureFormat;
};

async function initWebGPU(canvas: HTMLCanvasElement): Promise<InitResult> {
  if (!("gpu" in navigator)) throw new Error("WebGPU is not supported in this browser.");

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error("No GPU adapter available for WebGPU.");

  const device = await adapter.requestDevice();
  const context = canvas.getContext("webgpu") as GPUCanvasContext | null;
  if (!context) throw new Error("Unable to acquire a WebGPU canvas context.");

  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: "premultiplied" });

  return { device, context, format };
}

export class NeonSmokeRenderer {
  private canvas: HTMLCanvasElement;
  private device!: GPUDevice;
  private context!: GPUCanvasContext;
  private format!: GPUTextureFormat;

  private rafId: number | null = null;

  private renderPipeline!: GPURenderPipeline;
  private blurPipeline!: GPUComputePipeline;
  private splatPipeline!: GPUComputePipeline;

  private resolutionBuffer!: GPUBuffer;
  private mouseBuffer!: GPUBuffer;
  private timeBuffer!: GPUBuffer;

  private simTexture!: GPUTexture;
  private scratchTexture!: GPUTexture;

  private sampler!: GPUSampler;

  private resolutionBindGroup!: GPUBindGroup;
  private renderBindGroup!: GPUBindGroup;
  private blurBindGroup!: GPUBindGroup;
  private splatBindGroup!: GPUBindGroup;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  async init() {
    const { device, context, format } = await initWebGPU(this.canvas);
    this.device = device;
    this.context = context;
    this.format = format;

    this.createPipelines();
    this.createBuffers();
    this.createTextures();
    this.createBindGroups();
    this.seedTextures();
  }

  start(getMouse: () => MouseState) {
    const frame = () => {
      this.updateCanvasResolution();
      this.tick(getMouse());
      this.rafId = requestAnimationFrame(frame);
    };
    this.rafId = requestAnimationFrame(frame);
  }

  stop() {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  destroy() {
    this.stop();
    this.device?.destroy();
  }

  private createPipelines() {
    const renderShader = this.device.createShaderModule({ code: RENDER_WGSL });
    const blurShader = this.device.createShaderModule({ code: BLUR_WGSL });
    const splatShader = this.device.createShaderModule({ code: SPLAT_WGSL });

    this.renderPipeline = this.device.createRenderPipeline({
      layout: "auto",
      vertex: { module: renderShader, entryPoint: "vs_main" },
      fragment: {
        module: renderShader,
        entryPoint: "fs_main",
        targets: [{ format: this.format }],
      },
      primitive: { topology: "triangle-list" },
    });

    this.blurPipeline = this.device.createComputePipeline({
      layout: "auto",
      compute: { module: blurShader, entryPoint: "cs_main" },
    });

    this.splatPipeline = this.device.createComputePipeline({
      layout: "auto",
      compute: { module: splatShader, entryPoint: "cs_main" },
    });
  }

  private createBuffers() {
    this.resolutionBuffer = this.device.createBuffer({
      size: 8,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.mouseBuffer = this.device.createBuffer({
      size: 32,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.timeBuffer = this.device.createBuffer({
      size: 32,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  private createTextures() {
    const texDesc: GPUTextureDescriptor = {
      size: { width: SIM_WIDTH, height: SIM_HEIGHT, depthOrArrayLayers: 1 },
      format: "rgba16float",
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.STORAGE_BINDING |
        GPUTextureUsage.COPY_DST,
    };

    this.simTexture = this.device.createTexture(texDesc);
    this.scratchTexture = this.device.createTexture(texDesc);

    this.sampler = this.device.createSampler({
      magFilter: "linear",
      minFilter: "linear",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
    });
  }

  private createBindGroups() {
    this.resolutionBindGroup = this.device.createBindGroup({
      layout: this.renderPipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.resolutionBuffer } }],
    });

    this.renderBindGroup = this.device.createBindGroup({
      layout: this.renderPipeline.getBindGroupLayout(1),
      entries: [
        { binding: 0, resource: this.sampler },
        { binding: 1, resource: this.simTexture.createView() },
      ],
    });

    this.blurBindGroup = this.device.createBindGroup({
      layout: this.blurPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.scratchTexture.createView() },
        { binding: 1, resource: this.simTexture.createView() },
        { binding: 2, resource: { buffer: this.timeBuffer } },
      ],
    });

    this.splatBindGroup = this.device.createBindGroup({
      layout: this.splatPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.mouseBuffer } },
        { binding: 1, resource: this.scratchTexture.createView() },
        { binding: 2, resource: this.simTexture.createView() },
      ],
    });
  }

  private seedTextures() {
    const seedData = new Uint16Array(SIM_WIDTH * SIM_HEIGHT * 4);
    for (let i = 0; i < seedData.length; i += 4) {
      seedData[i + 0] = float32ToFloat16(0.0);
      seedData[i + 1] = float32ToFloat16(0.0);
      seedData[i + 2] = float32ToFloat16(0.0);
      seedData[i + 3] = float32ToFloat16(1.0);
    }

    const writeTex = (texture: GPUTexture) => {
      this.device.queue.writeTexture(
        { texture },
        seedData,
        { offset: 0, bytesPerRow: SIM_WIDTH * 4 * 2, rowsPerImage: SIM_HEIGHT },
        { width: SIM_WIDTH, height: SIM_HEIGHT, depthOrArrayLayers: 1 }
      );
    };

    writeTex(this.simTexture);
    writeTex(this.scratchTexture);
  }

  private updateCanvasResolution() {
    const dpr = window.devicePixelRatio || 1;
    const width = Math.floor(this.canvas.clientWidth * dpr);
    const height = Math.floor(this.canvas.clientHeight * dpr);

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    this.device.queue.writeBuffer(
      this.resolutionBuffer,
      0,
      new Float32Array([this.canvas.width, this.canvas.height])
    );
  }

  private tick(mouse: MouseState) {
    const t = performance.now() / 1000;

    this.device.queue.writeBuffer(
      this.mouseBuffer,
      0,
      new Float32Array([mouse.x, mouse.y, mouse.down ? 1 : 0, 18.0, t])
    );

    this.device.queue.writeBuffer(this.timeBuffer, 0, new Float32Array([t, 0, 0, 0]));

    const encoder = this.device.createCommandEncoder();

    const wx = Math.ceil(SIM_WIDTH / WORKGROUP_SIZE);
    const wy = Math.ceil(SIM_HEIGHT / WORKGROUP_SIZE);

    const compute = encoder.beginComputePass();
    compute.setPipeline(this.splatPipeline);
    compute.setBindGroup(0, this.splatBindGroup);
    compute.dispatchWorkgroups(wx, wy);

    compute.setPipeline(this.blurPipeline);
    compute.setBindGroup(0, this.blurBindGroup);
    compute.dispatchWorkgroups(wx, wy);
    compute.end();

    const view = this.context.getCurrentTexture().createView();
    const render = encoder.beginRenderPass({
      colorAttachments: [
        {
          view,
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });

    render.setPipeline(this.renderPipeline);
    render.setBindGroup(0, this.resolutionBindGroup);
    render.setBindGroup(1, this.renderBindGroup);
    render.draw(3, 1, 0, 0);
    render.end();

    this.device.queue.submit([encoder.finish()]);
  }
}
