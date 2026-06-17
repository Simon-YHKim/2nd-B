// @deprecated LEGACY - Phytoncide tokens (pre-deep-space). Superseded by the tokens
// in src/lib/theme/tokens.ts (deepSpace.* / semantic.* / cosmic.*). Do NOT use for
// new screens; kept only for legacy-skin code. Canonical concept: docs/CONCEPT.md.
//
// 2nd-Brain design tokens — Option C "Phytoncide" (5월 아침 편백 숲의 그린).
// Single source of truth for color, spacing, radius and type scale. Components
// pull from here (or the NativeWind classes generated from these) and never
// hardcode hex literals.

export const colors = {
  // Base — Birch + Mist (자작나무 + 아침 안개)
  paper: "#F2EFE5",
  paper2: "#E8E4D6",
  paper3: "#DAD5C3",
  mist: "#EDF0EA",
  rule: "#C9C2AB",
  ruleSoft: "#DAD5C3",

  // Ink — Earth (흙·나무껍질)
  ink: "#2A2418",
  ink2: "#4F4633",
  ink3: "#7A715B",

  // Brand — Pine Needle (침엽수)
  pine: "#2D4A3A",
  pineDeep: "#1A3025",
  pineSoft: "#4E6F5C",
  pineTint: "#A8BFAE",

  // Accents — Spring / Sunlight / Earth / Sky
  leaf: "#8FAA5E",
  leafSoft: "#B5CB85",
  sun: "#D4B463",
  earth: "#8B6F47",
  sky: "#C5D5DC",
  skyDeep: "#9DB4C0",

  // Safety zones (자연 톤)
  sage: "#7B9A82",
  amber: "#C68B3D",
  clay: "#A14D33",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  "2xl": 32,
  "3xl": 48,
  "4xl": 64,
} as const;

export const radius = {
  sm: 4,
  md: 6,
  lg: 8,
  xl: 12,
  "2xl": 16,
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
