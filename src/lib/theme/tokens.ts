// Semantic theme tokens.
//
// 2026-05-29 — palette pivot #3: "Cosmic Pixel Graph Village" / 밤빛
// 조각마을. The handoff doc (uploads/.../2ndB_pixel_graph_village_revised
// _handoff.html) replaces the dark-sky tone with a deep-space + neural
// + pixel-village palette. The `semantic` keys stay identical so the 21
// screens that import `semantic.*` get the new tone without per-screen
// edits — only the values move.
//
// 2026-05-27 — palette pivot #2 (dark-sky) is preserved as `darkSky`
// for any historic consumer (LoadingScreen.tsx, etc.). New work should
// reach for `semantic` or the `cosmic` raw palette below.
//
// `lightSky` stays as the light-mode counterpart for ThemeContext until
// a cosmic-light palette is designed; the handoff explicitly says
// "main screen remains dark even in light mode" (Prompt D), so a near-
// term light variant only matters for non-graph surfaces.

// ─── Cosmic Pixel palette — raw colors from the 2026-05-29 handoff ──
// Group naming mirrors the handoff CSS variables so designers can
// cross-reference the doc 1:1.
export const cosmic = {
  // Deep space backgrounds — pure black is forbidden; bg uses the
  // deepest ink instead.
  space950: "#070A18", // Deep Space Ink — primary bg
  space900: "#0D1530", // Night Navy
  space800: "#16213E", // Graph Slate — surface
  space700: "#243056",
  lineDim: "#2A345A", // Dim Neural Line — inactive edges, borders

  // Signal accents — applied to active connections, AI presence,
  // discoveries, imagination, and safety states.
  signalBlue: "#4CC9F0", // Archi accent
  signalMint: "#72F2C7", // Electric Mint — active connections, Lulu, brand
  soulViolet: "#A78BFA", // SecondB / AI presence
  soulViolet2: "#7C5EE8",
  pixelLamp: "#FFD166", // New record / discovery, Momo accent
  dreamPink: "#FF9FD6", // Imagine / Vela accent
  guardRose: "#FF7A90", // Safety / Gadi accent

  // Neutrals.
  moonWhite: "#E8ECF8", // Primary text
  softWhite: "#F7F8FF",
  mistGray: "#8D98B8", // Muted text
  quietGray: "#64708E", // Subtle text
} as const;

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

// Default `semantic` = Cosmic Pixel tones. Keys mirror the legacy
// shape so every existing `semantic.background` / `semantic.text` /
// `semantic.brand` consumer keeps working. The shape is also what the
// light-mode runtime palette returns via useThemePalette() — same keys,
// different values.
export const semantic = {
  background: cosmic.space950,
  surface: "rgba(167,139,250,0.07)", // soul-violet washed, like the handoff cards
  surfaceAlt: "rgba(114,242,199,0.06)", // mint-washed, slightly more "active" surface
  border: cosmic.lineDim,
  text: cosmic.moonWhite,
  textMuted: "#C9D0E6", // slightly above mist-gray for body text
  textSubtle: cosmic.mistGray,
  brand: cosmic.signalMint, // active-connection mint = primary accent
  // Zone tones — kept saturated so they read in both modes.
  zoneGreen: cosmic.signalMint,
  zoneYellow: cosmic.pixelLamp,
  zoneRed: cosmic.guardRose,
  // Info / success / warning / danger — mapped onto cosmic signals.
  info: cosmic.signalBlue,
  success: cosmic.signalMint,
  warning: cosmic.pixelLamp,
  danger: cosmic.guardRose,
} as const;

// Same-shape light palette. Returned by useThemePalette() when the
// active mode is "light". Per handoff Prompt D, the main graph screen
// stays dark in light mode — this palette is for secondary surfaces
// (settings, sign-in, etc.) where light is meaningful.
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

// ─── Characters — 6 pixel residents of the Graph Village ────────────
// Source: handoff §5 "Character System". Each is anchored to one
// cosmic accent so the village reads as a small consistent cast across
// the graph, popovers, and chat avatars. Routes the character is tied
// to live in src/lib/characters.ts.
export const characters = {
  secondb: cosmic.soulViolet, // AI guide — /jarvis, floating button
  momo: cosmic.pixelLamp, // Record keeper — /journal, /audit, /wiki
  lulu: cosmic.signalMint, // Capture collector — /capture
  archi: cosmic.signalBlue, // Connection architect — /persona, /core-brain
  vela: cosmic.dreamPink, // Imagination guide — /imagine
  gadi: cosmic.guardRose, // Safety / boundary — safety classifier
} as const;

export type CharacterName = keyof typeof characters;

// Brain Stack v1.1 mascot palette — kept for backwards compatibility
// with screens that still reference `mascot.*`. New screens should use
// `characters.*` (the 6-resident cast) or raw `cosmic.*` colors.
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
