export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function blendGraphChannel(base: number, theme: number, strength: number): number {
  const blend = clamp01(strength);
  return clamp01(base * (1 - blend) + theme * blend);
}

export function blendGraphRgb(
  base: [number, number, number],
  theme: [number, number, number],
  strength: number
): [number, number, number] {
  return [
    blendGraphChannel(base[0], theme[0], strength),
    blendGraphChannel(base[1], theme[1], strength),
    blendGraphChannel(base[2], theme[2], strength),
  ];
}
