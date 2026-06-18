// Deep-Space (eye-cyan) tokens — 디자인 정본에서 추출.
// Keep the legacy token keys as aliases so existing screens continue to compile
// while new deepspace screens can use the canonical keys directly.

export const colors = {
  // Canonical deep-space keys.
  bgDeep: "#070A13",
  bgMid: "#0B2142",
  bgGlow: "rgba(26,72,120,0.40)",
  cyan: "#46B6FF",
  cyanBright: "#5FD4FF",
  cyanSoft: "#9FE4FF",
  cyanDim: "#7FC9F0",
  textHi: "#E8F7FF",
  textMid: "rgba(159,228,255,0.80)",
  textLo: "rgba(159,228,255,0.55)",
  textTitle: "#CCFAFF",
  soul: "#C8B6FF",
  soulDeep: "#8B7BD8",
  soulLine: "rgba(167,139,250,0.50)",
  mint: "#5FF0C0",
  border: "rgba(70,182,255,0.22)",
  borderHi: "rgba(70,182,255,0.30)",
  cardBg: "rgba(70,182,255,0.06)",

  // Backward-compatible aliases for existing imports.
  paper: "#070A13",
  paper2: "#0B2142",
  paper3: "rgba(26,72,120,0.40)",
  mist: "rgba(70,182,255,0.06)",
  rule: "rgba(70,182,255,0.22)",
  ruleSoft: "rgba(70,182,255,0.12)",
  ink: "#E8F7FF",
  ink2: "rgba(159,228,255,0.80)",
  ink3: "rgba(159,228,255,0.55)",
  pine: "#46B6FF",
  pineDeep: "#0B2142",
  pineSoft: "#7FC9F0",
  pineTint: "#9FE4FF",
  leaf: "#5FF0C0",
  leafSoft: "#9FE4FF",
  sun: "#C8B6FF",
  earth: "#8B7BD8",
  sky: "#9FE4FF",
  skyDeep: "#7FC9F0",
  sage: "#5FF0C0",
  amber: "#C8B6FF",
  clay: "#FF8FB8",
} as const;

export const spacing = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  "2xl": 32,
  "3xl": 48,
  "4xl": 64,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 9,
  md: 13,
  lg: 18,
  pill: 999,
  phone: 38,
  xl: 18,
  "2xl": 24,
  full: 9999,
} as const;

export const fontSize = {
  xs: 12,
  sm: 14,
  base: 16,
  md: 20,
  lg: 25,
  xl: 31,
  "2xl": 39,
  "3xl": 39,
  "4xl": 39,
} as const;

export type ColorToken = keyof typeof colors;
export type SpacingToken = keyof typeof spacing;
export type RadiusToken = keyof typeof radius;
export type FontSizeToken = keyof typeof fontSize;
