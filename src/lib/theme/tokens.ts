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
// `lightSky` stays only for the raw sky/loader layer (useSkyPalette).
// The cosmic-light palette (`lightCosmic` / `semanticLight`, queue item G)
// is the real light mode for card surfaces. The handoff says "main screen
// remains dark even in light mode" (Prompt D), so the light variant only
// applies to non-graph surfaces (settings, sign-in).

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

  // Composite FX tokens — merged from the asset pack's
  // 2ndb-cosmic-pixel-tokens.css so code references named tokens instead
  // of inline rgba(). Edge / panel / glow surfaces of the graph village.
  edgeDefault: "rgba(141,152,184,0.28)", // --edge-default
  edgeRecent: "#FFD166", // --edge-recent (= pixelLamp)
  panelBg: "rgba(13,21,48,0.88)", // --panel-bg
  panelBorder: "rgba(141,152,184,0.28)", // --panel-border
  coreGlow: "rgba(167,139,250,0.42)", // --core-glow
  mintGlow: "rgba(114,242,199,0.34)", // --mint-glow
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

// Legacy light-mode counterpart in the sky-blue family. Still consumed by
// useSkyPalette() for the loader / raw-sky surfaces. Kept as-is; the
// cosmic-light palette below is what secondary card surfaces now use.
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

// ─── Cosmic-light palette (queue item G, 2026-05-29) ────────────────
// The light counterpart to `cosmic`. Same hue family (deep-space navy ink
// + electric-mint signal) at inverted luminance, for secondary surfaces
// (settings, sign-in) where light is meaningful. Per the handoff, the main
// graph screen stays dark even in light mode, so this never touches the
// sky/graph layer. Mint is darkened to a deep teal-mint so it clears WCAG
// AA contrast (>= 4.5:1) as text/CTA on the light haze background.
export const lightCosmic = {
  bg: "#F4F5FC", // Moon Haze — faint violet-tinted light, never pure white
  surface: "rgba(124,94,232,0.06)", // soul-violet wash, mirrors the dark card
  surfaceAlt: "rgba(10,122,87,0.07)", // deep-mint wash, the "active" surface
  border: "#D6DAEC", // light neural line
  text: "#0D1530", // Night Navy ink
  textMuted: "#3C476A",
  textSubtle: "#6A7693",
  brand: "#0A7A57", // deep Electric Mint — AA-safe on light
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

// Same-shape light palette. Returned by useThemePalette() when the active
// mode is "light". Now built on the cosmic-light palette (queue item G)
// rather than sky-blue, so light mode carries the same mint/violet
// identity as dark. Per handoff Prompt D the main graph screen stays dark
// in light mode — this palette is for secondary surfaces only. Zone tones
// are darkened cosmic signals tuned for AA contrast on the light haze.
export const semanticLight = {
  background: lightCosmic.bg,
  surface: lightCosmic.surface,
  surfaceAlt: lightCosmic.surfaceAlt,
  border: lightCosmic.border,
  text: lightCosmic.text,
  textMuted: lightCosmic.textMuted,
  textSubtle: lightCosmic.textSubtle,
  brand: lightCosmic.brand,
  zoneGreen: lightCosmic.brand, // deep mint
  zoneYellow: "#9A6A00", // deep pixel-lamp
  zoneRed: "#C2403F", // deep guard-rose
  info: "#1E6FA8", // deep signal-blue
  success: lightCosmic.brand,
  warning: "#9A6A00",
  danger: "#C2403F",
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
