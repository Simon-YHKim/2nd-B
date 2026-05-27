// Semantic theme tokens.
//
// 2026-05-27 — palette pivot: the `semantic` object used to map to the
// phytoncide forest palette (paper / ink / pine). Per user directive,
// every screen now adopts the dark-sky tone of the loader + main
// navigator. `semantic` keys stay identical (`background`, `text`,
// `brand`, …) so the 21 screens that already import `semantic.*` get
// the new tone with zero per-screen edits.
//
// The phytoncide colors module (src/theme/tokens.ts) is intact for
// historic reference and any external utility; semantic just no longer
// pulls from it.
//
// `darkSky` stays exported as a verbose alias for screens that want
// the loader's raw palette by name (LoadingScreen.tsx, etc).
// `lightSky` is the new light-mode counterpart. Together they back the
// ThemeContext (src/lib/theme/ThemeContext.tsx) so users can toggle.

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

// Light-mode counterpart. Same hue family (sky-blue) so the visual
// identity carries over — just inverted luminance. Tuned for WCAG AA
// contrast on the matching background.
export const lightSky = {
  bg: "#F2F7FF",
  surface: "rgba(15,40,80,0.04)",
  border: "rgba(47,151,252,0.20)",
  text: "#1A2B45",
  textMuted: "#3A4F6B",
  textSubtle: "#6B7F99",
  brand: "#1E70C8",
  accent: "#2F97FC",
} as const;

// Default `semantic` = dark-sky tones. Keys mirror the legacy phytoncide
// shape so every existing `semantic.background` / `semantic.text` /
// `semantic.brand` consumer keeps working. The shape is also what the
// light-mode runtime palette returns via useThemePalette() — same keys,
// different values.
export const semantic = {
  background: darkSky.bg,
  surface: darkSky.surface,
  surfaceAlt: "rgba(143,183,244,0.08)",
  border: darkSky.border,
  text: darkSky.text,
  textMuted: darkSky.textMuted,
  textSubtle: darkSky.textSubtle,
  brand: darkSky.brand,
  // Zone tones — kept saturated so they read in both modes.
  zoneGreen: "#74E0A8",
  zoneYellow: "#FFB55C",
  zoneRed: "#FF6B6B",
  // Info / success / warning / danger — match the zone tones.
  info: darkSky.brand,
  success: "#74E0A8",
  warning: "#FFB55C",
  danger: "#FF6B6B",
} as const;

// Same-shape light palette. Returned by useThemePalette() when the
// active mode is "light". Zone tones reuse the dark values for cross-
// mode recognizability (a red warning stays the same red).
export const semanticLight = {
  background: lightSky.bg,
  surface: lightSky.surface,
  surfaceAlt: "rgba(47,151,252,0.08)",
  border: lightSky.border,
  text: lightSky.text,
  textMuted: lightSky.textMuted,
  textSubtle: lightSky.textSubtle,
  brand: lightSky.brand,
  zoneGreen: "#3AA76C",
  zoneYellow: "#C97A1F",
  zoneRed: "#C23B3B",
  info: lightSky.brand,
  success: "#3AA76C",
  warning: "#C97A1F",
  danger: "#C23B3B",
} as const;

// Brain Stack v1.1 mascot palette — 9 characters, one color each.
// Source: docs/ux/2026-05-27-mascot-compatibility.html + the external
// Final Spec v1.1. Augment Brain locked to indigo #5A6FB4 — the Q1
// diagnostic fix vs cool-blue collision with darkSky.brand/accent.
// WCAG AA verified on darkSky.bg.
export const mascot = {
  core: "#f0c862",
  self: "#e36464",
  field: "#9ba0a8",
  augment: "#5A6FB4",
  engram: "#c9a374",
  signal: "#a8d4c0",
  mirror: "#7ec4c0",
  trinity: "#b48ec4",
  audit: "#e89c5a",
} as const;

export type MascotName = keyof typeof mascot;

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
