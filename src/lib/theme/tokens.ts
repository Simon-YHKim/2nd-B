// Okabe-Ito color-blind-safe palette + dark-mode-first semantic tokens.
// Single source of truth for color. Components should never use literal hex.

export const okabeIto = {
  black: "#000000",
  orange: "#E69F00",
  skyBlue: "#56B4E9",
  bluishGreen: "#009E73",
  yellow: "#F0E442",
  blue: "#0072B2",
  vermillion: "#D55E00",
  reddishPurple: "#CC79A7",
} as const;

export const palette = {
  bg: "#0B0E0C",
  panel: "#11161A",
  panel2: "#161B20",
  line: "#222B33",
  ink: "#E8ECEF",
  ink2: "#A8B2BC",
  ink3: "#6B7680",
  brand: "#7DD3FC",
} as const;

export const semantic = {
  background: palette.bg,
  surface: palette.panel,
  surfaceAlt: palette.panel2,
  border: palette.line,
  text: palette.ink,
  textMuted: palette.ink2,
  textSubtle: palette.ink3,
  brand: palette.brand,
  // Zone colors aligned with safety classifier output.
  zoneGreen: okabeIto.bluishGreen,
  zoneYellow: okabeIto.yellow,
  zoneRed: okabeIto.vermillion,
  // Info/success/warning/danger.
  info: okabeIto.skyBlue,
  success: okabeIto.bluishGreen,
  warning: okabeIto.yellow,
  danger: okabeIto.vermillion,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radii = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
} as const;

export const typography = {
  fontFamily: "System",
  sizes: {
    xs: 11,
    sm: 13,
    md: 15,
    lg: 18,
    xl: 22,
    xxl: 28,
    display: 40,
  },
  weights: {
    regular: "400",
    medium: "500",
    semibold: "600",
    bold: "700",
    extrabold: "800",
  },
} as const;
