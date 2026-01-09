@group(0) @binding(0)
var srcTex : texture_2d<f32>;

@group(0) @binding(1)
var dstTex : texture_storage_2d<rgba16float, write>;

struct TimeUniform {
  value : f32,
  pad   : vec3<f32>,
};

@group(0) @binding(2)
var<uniform> uTime : TimeUniform;

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

  let uv = vec2<f32>(f32(gid.x), f32(gid.y)) / vec2<f32>(f32(dims.x), f32(dims.y));
  let angle = sin(uv.x * 9.0 + uTime.value * 1.4) + cos(uv.y * 11.0 - uTime.value * 1.2);
  let dir = vec2<f32>(-sin(angle), cos(angle));
  let swirlStrength = 0.9;
  let swirlOffset = vec2<i32>(i32(dir.x * swirlStrength), i32(dir.y * swirlStrength));

  let center = sample_tex(coord + swirlOffset);
  let left   = sample_tex(coord + swirlOffset + vec2<i32>(-1,  0));
  let right  = sample_tex(coord + swirlOffset + vec2<i32>( 1,  0));
  let up     = sample_tex(coord + swirlOffset + vec2<i32>( 0, -1));
  let down   = sample_tex(coord + swirlOffset + vec2<i32>( 0,  1));

  let avg = (center * 4.0 + left + right + up + down) / 8.0;

  let fade = 0.990;
  let faded = vec4<f32>(avg.rgb * fade, avg.a);

  textureStore(dstTex, coord, faded);
}
