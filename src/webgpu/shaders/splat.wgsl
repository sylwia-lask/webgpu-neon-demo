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

struct SimUniforms {
  time : f32,
  fade : f32,
  swirlStrength : f32,
  intensity : f32,
  baseHue : f32,
  hueSpeed : f32,
  radius : f32,
  pad0 : f32,
};

@group(0) @binding(3)
var<uniform> uSim : SimUniforms;

fn hsl_k(n: f32, h: f32) -> f32 { return (n + h * 12.0) % 12.0; }

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
    let r = uSim.radius; 
    if (d < r) {
      let falloff = 1.0 - (d / r);

      let hue = fract(uSim.baseHue + uSim.time * uSim.hueSpeed + coord.x / f32(dims.x) * 0.15);
      let rgb = hsl2rgb(hue, 0.95, 0.55);

      var newColor = color.rgb + rgb * falloff * (0.6 + uSim.intensity * 1.2);
      newColor = clamp(newColor, vec3<f32>(0.0), vec3<f32>(3.0));
      color = vec4<f32>(newColor, color.a);
    }
  }

  textureStore(dstTex, vec2<i32>(i32(coord.x), i32(coord.y)), color);
}
