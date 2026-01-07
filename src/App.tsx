import { useEffect, useRef, useState } from 'react';
import './App.css';

const SIM_WIDTH = 256;
const SIM_HEIGHT = 256;

// konwersja liczby JS (float32) na 16-bitowy float do rgba16float
function float32ToFloat16(value: number): number {
  const floatView = new Float32Array(1);
  const intView = new Uint32Array(floatView.buffer);

  floatView[0] = value;
  const x = intView[0];

  const sign = (x >> 16) & 0x8000;
  const mantissa = x & 0x7fffff;
  const exp = (x >> 23) & 0xff;

  if (exp === 0) {
    // zero / subnormal -> 0
    return sign;
  }
  if (exp === 0xff) {
    // inf / NaN
    return sign | 0x7c00;
  }

  let newExp = exp - 127 + 15;
  if (newExp >= 0x1f) {
    // overflow -> inf
    return sign | 0x7c00;
  }
  if (newExp <= 0) {
    // subnormal
    if (newExp < -10) {
      return sign;
    }
    const subMantissa = (mantissa | 0x800000) >> (1 - newExp);
    return sign | (subMantissa >> 13);
  }

  return sign | (newExp << 10) | (mantissa >> 13);
}

type MouseState = {
  x: number;
  y: number;
  down: boolean;
};

function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let rafId: number | null = null;

    let device: GPUDevice | null = null;
    let context: GPUCanvasContext | null = null;

    let renderPipeline: GPURenderPipeline | null = null;
    let blurPipeline: GPUComputePipeline | null = null;
    let splatPipeline: GPUComputePipeline | null = null;

    let resolutionBuffer: GPUBuffer | null = null;
    let resolutionBindGroup: GPUBindGroup | null = null;

    let mouseBuffer: GPUBuffer | null = null;

    let simTexture: GPUTexture | null = null;
    let simViewSample: GPUTextureView | null = null;
    let simViewStorage: GPUTextureView | null = null;

    let scratchTexture: GPUTexture | null = null;
    let scratchViewSample: GPUTextureView | null = null;
    let scratchViewStorage: GPUTextureView | null = null;

    let sampler: GPUSampler | null = null;

    let renderBindGroup: GPUBindGroup | null = null;
    let blurBindGroup: GPUBindGroup | null = null;
    let splatBindGroup: GPUBindGroup | null = null;

    const mouse: MouseState = { x: 0, y: 0, down: false };

    const init = async () => {
      if (!('gpu' in navigator)) {
        setError('WebGPU is not supported in this browser.');
        return;
      }

      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) {
        setError('No GPU adapter available for WebGPU.');
        return;
      }

      device = await adapter.requestDevice();
      const canvas = canvasRef.current;
      if (!canvas) return;

      context = canvas.getContext('webgpu') as GPUCanvasContext | null;
      if (!context) {
        setError('Unable to acquire a WebGPU canvas context.');
        return;
      }

      const format = navigator.gpu.getPreferredCanvasFormat();
      context.configure({
        device,
        format,
        alphaMode: 'premultiplied',
      });

      // -------------------- SHADERS --------------------

      const renderShaderModule = device.createShaderModule({
        code: `
@group(0) @binding(0)
var<uniform> uResolution : vec2<f32>;

@group(1) @binding(0)
var uSampler : sampler;

@group(1) @binding(1)
var uTexture : texture_2d<f32>;

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex : u32) -> @builtin(position) vec4<f32> {
    var positions = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -3.0),
        vec2<f32>( 3.0,  1.0),
        vec2<f32>(-1.0,  1.0)
    );
    let pos = positions[vertexIndex];
    return vec4<f32>(pos, 0.0, 1.0);
}

@fragment
fn fs_main(@builtin(position) fragCoord : vec4<f32>) -> @location(0) vec4<f32> {
    let uv = fragCoord.xy / uResolution;
    let color = textureSample(uTexture, uSampler, uv);
    return vec4<f32>(color.rgb, 1.0);
}
        `,
      });

      const blurShaderModule = device.createShaderModule({
        code: `
@group(0) @binding(0)
var srcTex : texture_2d<f32>;

@group(0) @binding(1)
var dstTex : texture_storage_2d<rgba16float, write>;

fn sample_tex(coord : vec2<i32>) -> vec4<f32> {
    let dims = textureDimensions(srcTex);
    let clamped = vec2<i32>(
        clamp(coord.x, 0, i32(dims.x) - 1),
        clamp(coord.y, 0, i32(dims.y) - 1)
    );
    return textureLoad(srcTex, clamped, 0);
}

@compute @workgroup_size(8, 8)
fn cs_main(@builtin(global_invocation_id) gid : vec3<u32>) {
    let dims = textureDimensions(srcTex);
    if (gid.x >= dims.x || gid.y >= dims.y) {
        return;
    }

    let coord = vec2<i32>(i32(gid.x), i32(gid.y));

    let center = sample_tex(coord);
    let left   = sample_tex(coord + vec2<i32>(-1,  0));
    let right  = sample_tex(coord + vec2<i32>( 1,  0));
    let up     = sample_tex(coord + vec2<i32>( 0, -1));
    let down   = sample_tex(coord + vec2<i32>( 0,  1));

    // Slightly biased towards center so it doesn't flatten too fast
    let avg = (center * 4.0 + left + right + up + down) / 8.0;

    textureStore(dstTex, coord, avg);
}
        `,
      });

      const splatShaderModule = device.createShaderModule({
        code: `
// ====== RAINBOW SPLAT SHADER ======

struct Mouse {
  pos    : vec2<f32>,
  down   : f32,
  radius : f32,
  time   : f32,
};

@group(0) @binding(0)
var<uniform> uMouse : Mouse;

@group(0) @binding(1)
var dstTex : texture_storage_2d<rgba16float, write>;

@group(0) @binding(2)
var srcTex : texture_2d<f32>;

// pomocnicze funkcje HSL -> RGB, inspirowane JS-ową wersją z drugiego snippetu

fn hsl_k(n: f32, h: f32) -> f32 {
  return (n + h * 12.0) % 12.0;
}

fn hsl_f(n: f32, h: f32, s: f32, l: f32) -> f32 {
  let a = s * min(l, 1.0 - l);
  let k = hsl_k(n, h);
  return l - a * max(-1.0, min(k - 3.0, min(9.0 - k, 1.0)));
}

fn hsl2rgb(h: f32, s: f32, l: f32) -> vec3<f32> {
  let r = hsl_f(0.0, h, s, l);
  let g = hsl_f(8.0, h, s, l);
  let b = hsl_f(4.0, h, s, l);
  return vec3<f32>(r, g, b);
}

@compute @workgroup_size(8, 8)
fn cs_main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let dims = textureDimensions(dstTex);
  if (gid.x >= dims.x || gid.y >= dims.y) {
    return;
  }

  let coord = vec2<f32>(f32(gid.x), f32(gid.y));
  let base = textureLoad(srcTex, vec2<i32>(i32(coord.x), i32(coord.y)), 0);

  var color = base;

  if (uMouse.down > 0.5) {
    let d = distance(coord, uMouse.pos);
    if (d < uMouse.radius) {
      let t = 1.0 - (d / uMouse.radius);

      // tęczowy hue zależny od czasu + pozycji
      let hue = fract(uMouse.time * 0.2 + coord.x / f32(dims.x));
      let rgb = hsl2rgb(hue, 0.95, 0.55);

      let ink = rgb;
      let mixed = mix(color.rgb, ink, t);
      color = vec4<f32>(mixed, color.a);
    }
  }

  textureStore(dstTex, vec2<i32>(i32(coord.x), i32(coord.y)), color);
}
        `,
      });

      // -------------------- PIPELINES --------------------

      renderPipeline = device.createRenderPipeline({
        layout: 'auto',
        vertex: {
          module: renderShaderModule,
          entryPoint: 'vs_main',
        },
        fragment: {
          module: renderShaderModule,
          entryPoint: 'fs_main',
          targets: [{ format }],
        },
        primitive: {
          topology: 'triangle-list',
        },
      });

      blurPipeline = device.createComputePipeline({
        layout: 'auto',
        compute: {
          module: blurShaderModule,
          entryPoint: 'cs_main',
        },
      });

      splatPipeline = device.createComputePipeline({
        layout: 'auto',
        compute: {
          module: splatShaderModule,
          entryPoint: 'cs_main',
        },
      });

      // -------------------- BUFFERS --------------------

      resolutionBuffer = device.createBuffer({
        size: 8,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });

      const resolutionLayout = renderPipeline.getBindGroupLayout(0);
      resolutionBindGroup = device.createBindGroup({
        layout: resolutionLayout,
        entries: [
          {
            binding: 0,
            resource: { buffer: resolutionBuffer },
          },
        ],
      });

      // Mouse: vec2 + 3 scalary (down, radius, time) => 5 floatów,
      // ale rozmiar zaokrąglamy do 32 bajtów (wymóg wyrównania).
      mouseBuffer = device.createBuffer({
        size: 32,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });

      // -------------------- TEXTURES --------------------

      const texDesc: GPUTextureDescriptor = {
        size: { width: SIM_WIDTH, height: SIM_HEIGHT, depthOrArrayLayers: 1 },
        format: 'rgba16float',
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.STORAGE_BINDING |
          GPUTextureUsage.COPY_DST,
      };

      simTexture = device.createTexture(texDesc);
      scratchTexture = device.createTexture(texDesc);

      simViewSample = simTexture.createView();
      simViewStorage = simTexture.createView();
      scratchViewSample = scratchTexture.createView();
      scratchViewStorage = scratchTexture.createView();

      // -------------------- SEED DATA --------------------

      const seedData = new Uint16Array(SIM_WIDTH * SIM_HEIGHT * 4);

      for (let y = 0; y < SIM_HEIGHT; y++) {
        for (let x = 0; x < SIM_WIDTH; x++) {
          const i = (y * SIM_WIDTH + x) * 4;

          // czysta biel: (1, 1, 1, 1)
          seedData[i + 0] = float32ToFloat16(1.0); // R
          seedData[i + 1] = float32ToFloat16(1.0); // G
          seedData[i + 2] = float32ToFloat16(1.0); // B
          seedData[i + 3] = float32ToFloat16(1.0); // A
        }
      }

      const writeTex = (texture: GPUTexture) => {
        device!.queue.writeTexture(
          { texture },
          seedData,
          {
            offset: 0,
            bytesPerRow: SIM_WIDTH * 4 * 2, // 4 kanały * 2 bajty
            rowsPerImage: SIM_HEIGHT,
          },
          {
            width: SIM_WIDTH,
            height: SIM_HEIGHT,
            depthOrArrayLayers: 1,
          }
        );
      };

      writeTex(simTexture);
      writeTex(scratchTexture);

      // -------------------- SAMPLER + BIND GROUPS --------------------

      sampler = device.createSampler({
        magFilter: 'linear',
        minFilter: 'linear',
        addressModeU: 'clamp-to-edge',
        addressModeV: 'clamp-to-edge',
      });

      const renderTextureLayout = renderPipeline.getBindGroupLayout(1);
      renderBindGroup = device.createBindGroup({
        layout: renderTextureLayout,
        entries: [
          { binding: 0, resource: sampler },
          { binding: 1, resource: simViewSample },
        ],
      });

      const blurLayout = blurPipeline.getBindGroupLayout(0);
      blurBindGroup = device.createBindGroup({
        layout: blurLayout,
        entries: [
          { binding: 0, resource: scratchViewSample! }, // srcTex
          { binding: 1, resource: simViewStorage! },    // dstTex
        ],
      });

      const splatLayout = splatPipeline.getBindGroupLayout(0);
      splatBindGroup = device.createBindGroup({
        layout: splatLayout,
        entries: [
          { binding: 0, resource: { buffer: mouseBuffer } }, // uMouse
          { binding: 1, resource: scratchViewStorage! },     // dstTex
          { binding: 2, resource: simViewSample! },          // srcTex
        ],
      });

      // -------------------- MOUSE EVENTS --------------------

      const setupMouse = () => {
        const canvasEl = canvasRef.current;
        if (!canvasEl) return;

        const handleDown = () => {
          mouse.down = true;
        };

        const handleUp = () => {
          mouse.down = false;
        };

        const handleMove = (e: MouseEvent) => {
          const rect = canvasEl.getBoundingClientRect();
          const nx = (e.clientX - rect.left) / rect.width;
          const ny = (e.clientY - rect.top) / rect.height;
          // map to simulation grid space
          mouse.x = nx * SIM_WIDTH;
          mouse.y = ny * SIM_HEIGHT;
        };

        canvasEl.addEventListener('mousedown', handleDown);
        window.addEventListener('mouseup', handleUp);
        canvasEl.addEventListener('mousemove', handleMove);

        return () => {
          canvasEl.removeEventListener('mousedown', handleDown);
          window.removeEventListener('mouseup', handleUp);
          canvasEl.removeEventListener('mousemove', handleMove);
        };
      };

      const removeMouse = setupMouse();

      // -------------------- RENDER LOOP --------------------

      const updateCanvasSizeAndResolution = () => {
        if (!canvasRef.current || !device || !resolutionBuffer) return;

        const canvasEl = canvasRef.current;
        const dpr = window.devicePixelRatio || 1;
        const width = Math.floor(canvasEl.clientWidth * dpr);
        const height = Math.floor(canvasEl.clientHeight * dpr);

        if (canvasEl.width !== width || canvasEl.height !== height) {
          canvasEl.width = width;
          canvasEl.height = height;
        }

        const data = new Float32Array([canvasEl.width, canvasEl.height]);
        device.queue.writeBuffer(resolutionBuffer, 0, data.buffer);
      };

      const frame = () => {
        if (
          !device ||
          !context ||
          !renderPipeline ||
          !blurPipeline ||
          !splatPipeline ||
          !resolutionBindGroup ||
          !renderBindGroup ||
          !blurBindGroup ||
          !splatBindGroup ||
          !mouseBuffer
        ) {
          return;
        }

        updateCanvasSizeAndResolution();

        const timeSeconds = performance.now() / 1000;

        // mouse uniform: x, y, down, radius, time
        const mouseData = new Float32Array([
          mouse.x,
          mouse.y,
          mouse.down ? 1.0 : 0.0,
          25.0,
          timeSeconds,
        ]);
        device.queue.writeBuffer(mouseBuffer, 0, mouseData.buffer);

        const encoder = device.createCommandEncoder();

        const workgroupCountX = Math.ceil(SIM_WIDTH / 8);
        const workgroupCountY = Math.ceil(SIM_HEIGHT / 8);

        // compute pass: splat -> blur
        const computePass = encoder.beginComputePass();
        computePass.setPipeline(splatPipeline);
        computePass.setBindGroup(0, splatBindGroup);
        computePass.dispatchWorkgroups(workgroupCountX, workgroupCountY);

        computePass.setPipeline(blurPipeline);
        computePass.setBindGroup(0, blurBindGroup);
        computePass.dispatchWorkgroups(workgroupCountX, workgroupCountY);
        computePass.end();

        // render pass
        const textureView = context.getCurrentTexture().createView();
        const renderPass = encoder.beginRenderPass({
          colorAttachments: [
            {
              view: textureView,
              clearValue: { r: 0, g: 0, b: 0, a: 1 },
              loadOp: 'clear',
              storeOp: 'store',
            },
          ],
        });

        renderPass.setPipeline(renderPipeline);
        renderPass.setBindGroup(0, resolutionBindGroup);
        renderPass.setBindGroup(1, renderBindGroup);
        renderPass.draw(3, 1, 0, 0);
        renderPass.end();

        device.queue.submit([encoder.finish()]);

        rafId = requestAnimationFrame(frame);
      };

      rafId = requestAnimationFrame(frame);

      // cleanup z init
      return () => {
        if (rafId !== null) cancelAnimationFrame(rafId);
        removeMouse && removeMouse();
        device?.destroy();
      };
    };

    init();

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      device?.destroy();
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-6">
      <div className="w-full max-w-4xl space-y-4">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-slate-400">WebGPU</p>
            <h1 className="text-3xl font-semibold">Rainbow Fluid Demo</h1>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-900/40 text-emerald-200 border border-emerald-800">
            Live
          </span>
        </header>

        <div className="relative aspect-video rounded-2xl overflow-hidden border border-slate-800/60 shadow-2xl shadow-emerald-900/20">
          <canvas ref={canvasRef} className="h-full w-full block" />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-slate-950/50 via-transparent to-emerald-500/10" />
        </div>

        {error && (
          <div className="rounded-xl border border-rose-800/60 bg-rose-900/30 px-4 py-3 text-rose-100">
            {error}
          </div>
        )}

        <p className="text-sm text-slate-400">
          Jeśli nic nie widać, spróbuj w Chrome/Edge z włączonym WebGPU w flagach.
        </p>
      </div>
    </div>
  );
}

export default App;
