export interface ThemeSampleInput {
  depth: number;
  normW: number;
}

export type ThemeSampler = (input: ThemeSampleInput) => [number, number, number];

export interface HyperThemeUi {
  mode: 'dark' | 'light';
  background: string;
  surfaceShadow: string;
  deepShadow: string;
  insetShadow: string;
  divider: string;
  inputAccent: string;
  checkboxAccent: string;
  overlayText: string;
  labelBackground: string;
  labelBorder: string;
  labelText: string;
  labelShadow: string;
  labelTextShadow: string;
  labelFocusBackground: string;
  labelFocusBorder: string;
  labelFocusText: string;
  labelFocusShadow: string;
  labelFocusTextShadow: string;
  toolbarBackground: string;
  toolbarBorder: string;
  toolbarText: string;
  controlBackground: string;
  controlBorder: string;
  controlText: string;
  controlShadow: string;
  controlHoverBackground: string;
  controlHoverShadow: string;
  imageStripBackground: string;
  imageStripBorder: string;
  imageBorder: string;
  imageShadow: string;
  panelBackground: string;
  panelBorder: string;
  panelText: string;
  panelMutedText: string;
  analysisBackground: string;
  analysisPanelBackground: string;
  metricBackground: string;
  pillBackground: string;
  pillBorder: string;
  pillText: string;
  pillActiveBackground: string;
  pillActiveText: string;
  colorRuleBackground: string;
  colorRuleBorder: string;
  scrollbarThumb: string;
}

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
  ui: HyperThemeUi;
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

function withUi(
  mode: HyperThemeUi['mode'],
  overrides: Partial<HyperThemeUi> = {}
): HyperThemeUi {
  const darkBase: HyperThemeUi = {
    mode: 'dark',
    background: 'radial-gradient(circle at 20% 20%, #1a2438 0%, #050810 78%)',
    surfaceShadow: '0 14px 32px rgba(5, 12, 26, 0.55)',
    deepShadow: '0 20px 44px rgba(5, 12, 26, 0.65)',
    insetShadow: 'inset 0 0 12px rgba(8, 14, 28, 0.6)',
    divider: 'rgba(120, 170, 240, 0.18)',
    inputAccent: 'rgba(120, 180, 255, 0.95)',
    checkboxAccent: 'rgba(120, 180, 255, 0.95)',
    overlayText: 'rgba(235, 244, 255, 0.92)',
    labelBackground: 'linear-gradient(135deg, rgba(6, 16, 34, 0.75), rgba(4, 12, 26, 0.55))',
    labelBorder: 'rgba(120, 180, 255, 0.35)',
    labelText: 'rgba(240, 248, 255, 0.96)',
    labelShadow: '0 10px 26px rgba(4, 8, 20, 0.55)',
    labelTextShadow: '0 3px 12px rgba(6, 12, 32, 0.85)',
    labelFocusBackground: 'linear-gradient(140deg, rgba(36, 102, 230, 0.88), rgba(18, 48, 140, 0.68))',
    labelFocusBorder: 'rgba(140, 210, 255, 0.55)',
    labelFocusText: 'rgba(250, 253, 255, 0.98)',
    labelFocusShadow: '0 16px 32px rgba(20, 60, 150, 0.48)',
    labelFocusTextShadow: '0 4px 14px rgba(20, 70, 180, 0.68)',
    toolbarBackground: 'rgba(10, 18, 36, 0.85)',
    toolbarBorder: 'rgba(140, 190, 255, 0.35)',
    toolbarText: 'rgba(230, 240, 255, 0.92)',
    controlBackground: 'rgba(28, 46, 80, 0.92)',
    controlBorder: 'rgba(160, 208, 255, 0.55)',
    controlText: 'rgba(235, 244, 255, 0.96)',
    controlShadow: '0 6px 14px rgba(12, 24, 48, 0.32)',
    controlHoverBackground: 'rgba(70, 140, 220, 0.95)',
    controlHoverShadow: '0 8px 18px rgba(10, 32, 68, 0.45)',
    imageStripBackground: 'rgba(12, 22, 40, 0.88)',
    imageStripBorder: 'rgba(140, 190, 255, 0.28)',
    imageBorder: '1px solid rgba(160, 208, 255, 0.5)',
    imageShadow: '0 6px 18px rgba(10, 20, 44, 0.55)',
    panelBackground: 'rgba(10, 18, 36, 0.95)',
    panelBorder: 'rgba(140, 190, 255, 0.38)',
    panelText: 'rgba(220, 232, 255, 0.94)',
    panelMutedText: 'rgba(188, 208, 240, 0.78)',
    analysisBackground: 'rgba(8, 16, 32, 0.96)',
    analysisPanelBackground: 'rgba(18, 30, 56, 0.55)',
    metricBackground: 'rgba(12, 22, 40, 0.7)',
    pillBackground: 'rgba(28, 46, 80, 0.8)',
    pillBorder: 'rgba(140, 190, 255, 0.3)',
    pillText: 'rgba(220, 232, 255, 0.92)',
    pillActiveBackground: 'rgba(110, 180, 255, 0.98)',
    pillActiveText: 'rgba(10, 26, 46, 0.95)',
    colorRuleBackground: 'rgba(20, 34, 60, 0.65)',
    colorRuleBorder: 'rgba(140, 190, 255, 0.25)',
    scrollbarThumb: 'rgba(150, 205, 255, 0.45)',
  };

  const lightBase: HyperThemeUi = {
    mode: 'light',
    background: 'radial-gradient(circle at 14% 12%, #ffffff 0%, #edf4ff 55%, #d7e4f7 100%)',
    surfaceShadow: '0 12px 24px rgba(106, 134, 170, 0.24)',
    deepShadow: '0 18px 36px rgba(98, 128, 166, 0.26)',
    insetShadow: 'inset 0 0 8px rgba(184, 206, 234, 0.55)',
    divider: 'rgba(122, 154, 194, 0.34)',
    inputAccent: 'rgba(84, 140, 216, 0.95)',
    checkboxAccent: 'rgba(84, 140, 216, 0.95)',
    overlayText: 'rgba(24, 40, 62, 0.92)',
    labelBackground: 'linear-gradient(135deg, rgba(255, 255, 255, 0.9), rgba(232, 241, 255, 0.8))',
    labelBorder: 'rgba(86, 122, 168, 0.36)',
    labelText: 'rgba(28, 42, 64, 0.95)',
    labelShadow: '0 10px 20px rgba(132, 162, 200, 0.26)',
    labelTextShadow: '0 1px 0 rgba(255, 255, 255, 0.55)',
    labelFocusBackground: 'linear-gradient(140deg, rgba(121, 179, 255, 0.92), rgba(84, 144, 236, 0.86))',
    labelFocusBorder: 'rgba(58, 107, 182, 0.65)',
    labelFocusText: 'rgba(250, 253, 255, 0.98)',
    labelFocusShadow: '0 14px 28px rgba(80, 132, 204, 0.34)',
    labelFocusTextShadow: '0 1px 0 rgba(30, 62, 108, 0.35)',
    toolbarBackground: 'rgba(250, 252, 255, 0.88)',
    toolbarBorder: 'rgba(94, 129, 173, 0.35)',
    toolbarText: 'rgba(28, 42, 64, 0.92)',
    controlBackground: 'rgba(240, 246, 255, 0.96)',
    controlBorder: 'rgba(104, 138, 182, 0.5)',
    controlText: 'rgba(25, 40, 60, 0.94)',
    controlShadow: '0 6px 12px rgba(98, 128, 166, 0.26)',
    controlHoverBackground: 'rgba(126, 178, 246, 0.95)',
    controlHoverShadow: '0 8px 18px rgba(72, 120, 188, 0.35)',
    imageStripBackground: 'rgba(247, 252, 255, 0.92)',
    imageStripBorder: 'rgba(106, 140, 184, 0.32)',
    imageBorder: '1px solid rgba(128, 162, 206, 0.52)',
    imageShadow: '0 6px 14px rgba(118, 152, 196, 0.32)',
    panelBackground: 'rgba(252, 255, 255, 0.95)',
    panelBorder: 'rgba(104, 138, 182, 0.36)',
    panelText: 'rgba(30, 44, 66, 0.95)',
    panelMutedText: 'rgba(68, 92, 124, 0.82)',
    analysisBackground: 'rgba(252, 255, 255, 0.95)',
    analysisPanelBackground: 'rgba(233, 242, 255, 0.62)',
    metricBackground: 'rgba(236, 245, 255, 0.78)',
    pillBackground: 'rgba(234, 244, 255, 0.88)',
    pillBorder: 'rgba(105, 142, 188, 0.34)',
    pillText: 'rgba(29, 46, 68, 0.92)',
    pillActiveBackground: 'rgba(92, 156, 236, 0.98)',
    pillActiveText: 'rgba(248, 252, 255, 0.98)',
    colorRuleBackground: 'rgba(235, 244, 255, 0.82)',
    colorRuleBorder: 'rgba(110, 142, 184, 0.3)',
    scrollbarThumb: 'rgba(104, 138, 182, 0.5)',
  };

  const base = mode === 'light' ? lightBase : darkBase;
  return { ...base, ...overrides, mode };
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
    ui: withUi('dark', {
      background: 'radial-gradient(circle at 18% 16%, #1f2a4b 0%, #070b17 78%)',
      controlHoverBackground: 'rgba(94, 132, 255, 0.95)',
    }),
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
    ui: withUi('light', {
      background: 'radial-gradient(circle at 16% 12%, #fffefa 0%, #f6fbff 50%, #e5f1ff 100%)',
      controlHoverBackground: 'rgba(255, 172, 216, 0.95)',
      pillActiveBackground: 'rgba(255, 156, 209, 0.95)',
    }),
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
    ui: withUi('dark', {
      background: 'radial-gradient(circle at 16% 12%, #3b2230 0%, #1c121b 42%, #090709 100%)',
      toolbarBorder: 'rgba(255, 167, 88, 0.4)',
      controlHoverBackground: 'rgba(255, 134, 72, 0.95)',
      pillActiveBackground: 'rgba(255, 153, 71, 0.98)',
    }),
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
    ui: withUi('dark', {
      background: 'radial-gradient(circle at 14% 12%, #2a2a2a 0%, #121212 62%, #060606 100%)',
      toolbarBorder: 'rgba(192, 192, 192, 0.35)',
      controlHoverBackground: 'rgba(130, 130, 130, 0.95)',
      pillActiveBackground: 'rgba(208, 208, 208, 0.95)',
      pillActiveText: 'rgba(18, 18, 18, 0.95)',
    }),
  },
  daylight: {
    name: 'Daylight',
    lineOpacity: 0.5,
    pointOpacity: 0.85,
    sliceOpacity: 0.92,
    shadowOpacity: 0.2,
    lineColor: ({ depth }) => gradientColor(clamp01(depth), [
      { at: 0, color: hexToRgbArray('#95c2ff') },
      { at: 0.5, color: hexToRgbArray('#89e5d0') },
      { at: 1, color: hexToRgbArray('#f6b7a8') },
    ]),
    pointColor: ({ normW }) => gradientColor(normW, [
      { at: 0, color: hexToRgbArray('#72b6ff') },
      { at: 1, color: hexToRgbArray('#ff9e8a') },
    ]),
    sliceColor: ({ depth }) => gradientColor(clamp01(depth), [
      { at: 0, color: hexToRgbArray('#8ac5ff') },
      { at: 1, color: hexToRgbArray('#ffd58e') },
    ]),
    shadowColor: ({ depth }) => gradientColor(clamp01(depth), [
      { at: 0, color: hexToRgbArray('#90a8d9') },
      { at: 1, color: hexToRgbArray('#d4b2e4') },
    ]),
    ui: withUi('light', {
      background: 'radial-gradient(circle at 10% 10%, #ffffff 0%, #eef7ff 52%, #ddeeff 100%)',
      controlHoverBackground: 'rgba(117, 184, 250, 0.95)',
      pillActiveBackground: 'rgba(85, 157, 236, 0.98)',
    }),
  },
};

export function getTheme(name: string): HyperThemeDefinition {
  return THEMES[name] || THEMES.neon;
}

export function themeList(): Array<{ id: string } & HyperThemeDefinition> {
  return Object.entries(THEMES).map(([id, theme]) => ({ id, ...theme }));
}
