// Phytoncide compatibility layer. The semantic color tokens below derive from
// the phytoncide design system (src/theme/tokens.ts), so every existing screen
// -- all of which import `semantic` from here -- renders in the light forest
// palette with no per-component change. `spacing`, `radii` and `typography`
// are layout primitives and are unchanged.
//
// New components should import design primitives directly from "@/theme" and
// use the NativeWind classes. This file bridges the pre-phytoncide screens
// until they migrate to that module.

import { colors } from "@/theme/tokens";

export const semantic = {
  background: colors.paper, // birch -- app background
  surface: colors.paper2, // raised cards
  surfaceAlt: colors.mist, // tinted panels
  border: colors.rule,
  text: colors.ink, // earth-dark text on light
  textMuted: colors.ink2,
  textSubtle: colors.ink3,
  brand: colors.pine, // pine needle
  // Zone colors aligned with the safety classifier output.
  zoneGreen: colors.sage,
  zoneYellow: colors.amber,
  zoneRed: colors.clay,
  // Info / success / warning / danger.
  info: colors.skyDeep,
  success: colors.sage,
  warning: colors.amber,
  danger: colors.clay,
} as const;

// Dark-sky palette — used by the loader, landing graph, and sign-in
// screen so they share a single source of truth. Kept as a separate
// export so the `semantic` object stays a flat ColorValue map (every
// member assignable to React Native's ColorValue type).
export const darkSky = {
  bg: "#02040A",
  surface: "rgba(255,255,255,0.04)",
  border: "rgba(143,183,244,0.18)",
  text: "#E5EDFA",
  textMuted: "#C7D4EA",
  textSubtle: "#7FB3F4",
  brand: "#2F97FC",
  accent: "#7FB3F4",
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
