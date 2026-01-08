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
  let texColor = textureSample(uTexture, uSampler, uv);

  var c = texColor.rgb;
  let intensity = max(max(c.r, c.g), c.b);
  c = c * (1.2 + intensity * 1.6);
  c = clamp(c, vec3<f32>(0.0), vec3<f32>(1.0));

  return vec4<f32>(c, 1.0);
}
