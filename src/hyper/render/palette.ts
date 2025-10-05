export interface ThemeSampleInput {
  depth: number;
  normW: number;
}

export type ThemeSampler = (input: ThemeSampleInput) => [number, number, number];

export interface HyperThemeDefinition {
  name: string;
  lineOpacity: number;
  pointOpacity: number;
  sliceOpacity: number;
  shadowOpacity: number;
  lineColor: ThemeSampler;
  pointColor: ThemeSampler;
  sliceColor: ThemeSampler;
  shadowColor: ThemeSampler;
}

function hexToRgbArray(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  const int = parseInt(value, 16);
  if (value.length === 6) {
    return [
      ((int >> 16) & 0xff) / 255,
      ((int >> 8) & 0xff) / 255,
      (int & 0xff) / 255,
    ];
  }
  return [1, 1, 1];
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpColor(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [
    lerp(a[0], b[0], t),
    lerp(a[1], b[1], t),
    lerp(a[2], b[2], t),
  ];
}

interface GradientStop {
  at: number;
  color: [number, number, number];
}

function gradientColor(t: number, stops: GradientStop[]): [number, number, number] {
  if (t <= stops[0].at) return stops[0].color;
  if (t >= stops[stops.length - 1].at) return stops[stops.length - 1].color;
  for (let i = 0; i < stops.length - 1; i += 1) {
    const a = stops[i];
    const b = stops[i + 1];
    if (t >= a.at && t <= b.at) {
      const local = (t - a.at) / (b.at - a.at);
      return lerpColor(a.color, b.color, local);
    }
  }
  return stops[0].color;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

const THEMES: Record<string, HyperThemeDefinition> = {
  neon: {
    name: 'Neon Wire',
    lineOpacity: 0.55,
    pointOpacity: 0.95,
    sliceOpacity: 1,
    shadowOpacity: 0.28,
    lineColor: ({ normW }) => gradientColor(normW, [
      { at: 0, color: hexToRgbArray('#2fd4ff') },
      { at: 0.5, color: hexToRgbArray('#7a3bff') },
      { at: 1, color: hexToRgbArray('#ff2fd9') },
    ]),
    pointColor: ({ depth }) => gradientColor(clamp01(depth), [
      { at: 0, color: hexToRgbArray('#c5f4ff') },
      { at: 1, color: hexToRgbArray('#412b77') },
    ]),
    sliceColor: ({ normW }) => gradientColor(normW, [
      { at: 0, color: hexToRgbArray('#9cffe6') },
      { at: 1, color: hexToRgbArray('#ffd19c') },
    ]),
    shadowColor: ({ depth }) => gradientColor(clamp01(depth), [
      { at: 0, color: hexToRgbArray('#3f89ff') },
      { at: 1, color: hexToRgbArray('#b368ff') },
    ]),
  },
  pastel: {
    name: 'Pastel Solid',
    lineOpacity: 0.42,
    pointOpacity: 0.75,
    sliceOpacity: 0.85,
    shadowOpacity: 0.25,
    lineColor: ({ depth }) => gradientColor(clamp01(depth), [
      { at: 0, color: hexToRgbArray('#ffe0f0') },
      { at: 0.5, color: hexToRgbArray('#d0f0ff') },
      { at: 1, color: hexToRgbArray('#b6f3d1') },
    ]),
    pointColor: ({ normW }) => gradientColor(normW, [
      { at: 0, color: hexToRgbArray('#ffc6d9') },
      { at: 1, color: hexToRgbArray('#b7eaff') },
    ]),
    sliceColor: ({ depth }) => gradientColor(clamp01(depth), [
      { at: 0, color: hexToRgbArray('#ffefc1') },
      { at: 1, color: hexToRgbArray('#bde8c1') },
    ]),
    shadowColor: ({ depth }) => gradientColor(clamp01(depth), [
      { at: 0, color: hexToRgbArray('#ffe6cf') },
      { at: 1, color: hexToRgbArray('#cde5ff') },
    ]),
  },
  heat: {
    name: 'Heat Depth',
    lineOpacity: 0.6,
    pointOpacity: 0.9,
    sliceOpacity: 1,
    shadowOpacity: 0.35,
    lineColor: ({ depth }) => gradientColor(clamp01(depth), [
      { at: 0, color: hexToRgbArray('#1b1f3a') },
      { at: 0.5, color: hexToRgbArray('#ff7a18') },
      { at: 1, color: hexToRgbArray('#ffd200') },
    ]),
    pointColor: ({ normW }) => gradientColor(normW, [
      { at: 0, color: hexToRgbArray('#2b7bff') },
      { at: 1, color: hexToRgbArray('#ff4f38') },
    ]),
    sliceColor: ({ normW }) => gradientColor(normW, [
      { at: 0, color: hexToRgbArray('#1e68ff') },
      { at: 1, color: hexToRgbArray('#ffce2a') },
    ]),
    shadowColor: ({ depth }) => gradientColor(clamp01(depth), [
      { at: 0, color: hexToRgbArray('#5714ff') },
      { at: 1, color: hexToRgbArray('#ff005e') },
    ]),
  },
  mono: {
    name: 'Monochrome',
    lineOpacity: 0.35,
    pointOpacity: 0.75,
    sliceOpacity: 0.9,
    shadowOpacity: 0.22,
    lineColor: ({ depth }) => {
      const shade = 0.2 + clamp01(depth) * 0.7;
      return [shade, shade, shade];
    },
    pointColor: ({ depth }) => {
      const shade = 0.4 + clamp01(depth) * 0.5;
      return [shade, shade, shade];
    },
    sliceColor: () => [0.95, 0.95, 0.95],
    shadowColor: ({ depth }) => {
      const shade = 0.1 + clamp01(depth) * 0.4;
      return [shade, shade, shade];
    },
  },
};

export function getTheme(name: string): HyperThemeDefinition {
  return THEMES[name] || THEMES.neon;
}

export function themeList(): Array<{ id: string } & HyperThemeDefinition> {
  return Object.entries(THEMES).map(([id, theme]) => ({ id, ...theme }));
}
