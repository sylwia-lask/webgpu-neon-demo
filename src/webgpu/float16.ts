export function float32ToFloat16(value: number): number {
  const floatView = new Float32Array(1);
  const intView = new Uint32Array(floatView.buffer);

  floatView[0] = value;
  const x = intView[0];

  const sign = (x >> 16) & 0x8000;
  const mantissa = x & 0x7fffff;
  const exp = (x >> 23) & 0xff;

  if (exp === 0) return sign;
  if (exp === 0xff) return sign | 0x7c00;

  const newExp = exp - 127 + 15;
  if (newExp >= 0x1f) return sign | 0x7c00;
  if (newExp <= 0) {
    if (newExp < -10) return sign;
    const subMantissa = (mantissa | 0x800000) >> (1 - newExp);
    return sign | (subMantissa >> 13);
  }

  return sign | (newExp << 10) | (mantissa >> 13);
}
