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
import { UI_MODE } from "../ui-mode";

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
  signalBlue: "#4CC9F0", // Growth Core / Archon accent
  signalMint: "#72F2C7", // Electric Mint — active connections, Wisdom Core / Lumen, brand
  soulViolet: "#A78BFA", // Soul Core / SecondB / AI presence
  soulViolet2: "#7C5EE8", // SecondB Divergent-mode variant (worldview v-final)
  pixelLamp: "#FFD166", // Bond Core / Relia accent + new-record/discovery + zoneYellow (dual-context)
  dreamPink: "#FF9FD6", // Muse Core / Lumina accent
  guardRose: "#FF7A90", // Safety / crisis — system-only (no mascot)

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
  panelBg: "rgba(13,21,48,0.9)", // --panel-bg
  panelBorder: "rgba(141,152,184,0.34)", // --panel-border
  coreGlow: "rgba(167,139,250,0.42)", // --core-glow
  mintGlow: "rgba(114,242,199,0.34)", // --mint-glow
  skyDriftBlue: "#1E88EE",
  skyDriftViolet: "#8F70F0",
  skyDriftCyan: "#00FFFF",
  insightSurface: "#302D56",
} as const;

// Compose an rgba() string from a hex palette token + alpha (0..1). Lets
// components use translucent shades of the cosmic palette WITHOUT hardcoding
// rgba() literals (DESIGN.md: no hex/rgba literals in components). Accepts
// #RGB or #RRGGBB. Pure; safe to call inside StyleSheet.create.
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const darkSkyLegacy = {
  bg: "#02040A",
  surface: "rgba(255,255,255,0.04)",
  border: "rgba(143,183,244,0.18)",
  text: "#E5EDFA",
  textMuted: "#C7D4EA",
  textSubtle: "#7FB3F4",
  brand: "#2F97FC",
  accent: "#7FB3F4",
} as const;

// Cosmic entry palette — same SHAPE as `darkSky` (bg/surface/border/text/
// textMuted/textSubtle/brand/accent) so the unauthenticated entry surface
// (sign-in, loaders) can drop-in replace the legacy sky-blue look with the
// Cosmic Pixel identity (deep-space bg + mint brand + violet accent). This
// is what makes the rebrand visible before login.
const cosmicSkyLegacy = {
  bg: cosmic.space950,
  surface: "rgba(167,139,250,0.07)",
  border: cosmic.lineDim,
  text: cosmic.moonWhite,
  textMuted: "#C9D0E6",
  textSubtle: cosmic.mistGray,
  brand: cosmic.signalMint,
  accent: cosmic.soulViolet,
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

// Cyan global pivot (2026-06-18, Phase 2): the unauthenticated entry surface
// (sign-in, reset-password) + raw-sky / loader layer read as eye-cyan in the
// deep-space build. Same 8-key shape as darkSky/cosmicSky, so useSkyPalette()
// and the entry screens swap in with no edits. Legacy keeps the cosmic / sky-blue
// values for rollback.
const skyDeepSpace = {
  bg: "#0A0E1A",
  surface: "rgba(70,182,255,0.07)",
  border: "rgba(70,182,255,0.24)",
  text: "#E8F7FF",
  textMuted: "rgba(159,228,255,0.80)",
  textSubtle: "rgba(159,228,255,0.55)",
  brand: "#46B6FF",
  accent: "#5FD4FF",
} as const;

export const darkSky = UI_MODE === "deep-space" ? skyDeepSpace : darkSkyLegacy;
export const cosmicSky = UI_MODE === "deep-space" ? skyDeepSpace : cosmicSkyLegacy;

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
export const semanticCosmic = {
  background: cosmic.space950,
  surface: "rgba(13,21,48,0.84)", // glassy night panel, aligned to premium village cards
  surfaceAlt: "rgba(22,33,62,0.68)", // graph-slate wash for nested controls
  border: "rgba(141,152,184,0.3)",
  backdrop: "rgba(0,0,0,0.6)",
  // Stronger tinted scrim for full-screen takeover modals (quant intro /
  // celebration) — deeper + blue-tinted so the cosmic background fully
  // recedes. Same value in both modes, like backdrop.
  backdropStrong: "rgba(2,4,10,0.78)",
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
  deepSpaceBg: "#0A0E1A",
  deepSpaceAccent: "#46B6FF",
  deepSpaceText: "#5FD4FF",
  deepSpaceTextMuted: "rgba(95,212,255,0.62)",
  deepSpaceCard: "rgba(70,182,255,0.06)",
  deepSpaceCardPressed: "rgba(70,182,255,0.12)",
  deepSpaceCardLine: "rgba(70,182,255,0.24)",
} as const;

// Cyan global pivot (2026-06-18): the deep-space build maps the SAME semantic
// keys onto the eye-cyan identity, so every `semantic.*` consumer (most screens)
// reads as deep-space — not just the character shell. Surfaces stay a solid dark
// navy panel so cards keep their substance; the cyan comes from brand/border/
// text/accents. Keys are identical to semanticCosmic, so screens inherit the
// tone with no per-screen edit (the repo's established palette-pivot pattern).
// The legacy build (EXPO_PUBLIC_UI=legacy) keeps the cosmic tones; cosmic stays
// exported for tests + the legacy track.
const semanticDeepSpace = {
  background: "#0A0E1A",
  surface: "rgba(11,33,66,0.84)", // deep-navy panel (bgMid), keeps card substance
  surfaceAlt: "rgba(16,40,76,0.70)",
  border: "rgba(70,182,255,0.24)",
  backdrop: "rgba(0,0,0,0.6)",
  backdropStrong: "rgba(2,4,10,0.78)",
  text: "#E8F7FF",
  textMuted: "rgba(159,228,255,0.80)",
  textSubtle: "rgba(159,228,255,0.55)",
  brand: "#46B6FF", // eye-cyan primary accent
  zoneGreen: "#5FF0C0",
  zoneYellow: "#FFD166",
  zoneRed: "#FF7A90",
  info: "#46B6FF",
  success: "#5FF0C0",
  warning: "#FFD166",
  danger: "#FF7A90",
  deepSpaceBg: "#0A0E1A",
  deepSpaceAccent: "#46B6FF",
  deepSpaceText: "#5FD4FF",
  deepSpaceTextMuted: "rgba(95,212,255,0.62)",
  deepSpaceCard: "rgba(70,182,255,0.06)",
  deepSpaceCardPressed: "rgba(70,182,255,0.12)",
  deepSpaceCardLine: "rgba(70,182,255,0.24)",
} as const;

// Active palette for this build. UI_MODE is the build-time EXPO_PUBLIC_UI flag.
export const semantic = UI_MODE === "deep-space" ? semanticDeepSpace : semanticCosmic;

// O-23 (D-22/D-23): deep-space character UI track tokens. Eye-cyan monotone so the
// whole UI reads as the character's body/screen — kept to <=3 core colors per D-22
// (accent + text + bg), matching the live landing concept (public/landing). Used
// only by the deep-space shell (EXPO_PUBLIC_UI=deep-space); the legacy palette is
// untouched. danger keeps a functional exception.
export const deepSpace = {
  bg: semantic.deepSpaceBg, // deep-space body (tinted near-black, never pure black)
  bgEdge: "#070A13", // darker frame edges / deepest space
  bgMid: "#0B2142", // mid-navy stop for the screen-edge space wash (design handoff 2026-06-17)
  bgGlow: "rgba(26,72,120,0.40)", // top light-source glow over the body
  accent: semantic.deepSpaceAccent, // eye outer cyan = primary accent (#46B6FF)
  accentBright: "#CCFAFF", // eye inner bright highlight / pixel titles
  accentSoft: "#9FE4FF", // bright star / icon cyan
  accentDim: "#7FC9F0", // faint star / receding node cyan
  text: semantic.deepSpaceText, // cyan body text (the character's mouth color, #5FD4FF)
  textHi: "#E8F7FF", // emphasized body / speech-bubble copy
  textMuted: semantic.deepSpaceTextMuted, // rgba(95,212,255,0.62)
  textMid: "rgba(159,228,255,0.80)", // secondary body
  textLo: "rgba(159,228,255,0.55)", // tertiary / captions
  card: semantic.deepSpaceCard, // rgba(70,182,255,0.06)
  cardPressed: semantic.deepSpaceCardPressed, // rgba(70,182,255,0.12)
  cardLine: semantic.deepSpaceCardLine, // rgba(70,182,255,0.24) (default border)
  cardLineStrong: "rgba(70,182,255,0.30)", // emphasized / focused border
  // Soul / 북극성 / AI presence (violet).
  soul: "#C8B6FF", // Soul Core bright fill / north-star
  soulDeep: "#8B7BD8", // Soul Core deep edge (orb radial outer)
  soulLine: "rgba(167,139,250,0.50)", // constellation links / soul borders
  // Mint — TIP labels, positive deltas, trust/level signals.
  mint: "#5FF0C0",
  mintLine: "rgba(95,240,192,0.35)", // mint border (active/positive chips)
  mintBg: "rgba(95,240,192,0.08)", // mint fill (active chips, consent line)
  onMint: "#04241C", // dark text on a mint-filled CTA
  onAccent: "#04101E", // dark text on an accent-filled CTA
  // Warning — needs-attention (permission needed, rate-limited). Functional only.
  warning: "#FFC478",
  warningLine: "rgba(255,196,120,0.35)",
  warningBg: "rgba(255,196,120,0.06)",
  // Danger — overdue / error states. Functional only.
  dangerText: "#FF9B9B",
  dangerLine: "rgba(255,150,150,0.30)",
  dangerBg: "rgba(255,120,120,0.05)",
  danger: cosmic.guardRose, // functional-color exception only
  // Auth provider pill — the white "Apple/Google로 계속" surface from the auth
  // canon (sb-surfaces AuthScreen). White is a brand-provider requirement, not a
  // decorative fill, so it is exempt from the cyan-only palette like `danger`.
  providerLightBg: "#FFFFFF", // white provider pill surface (Apple / Google)
  providerLightFg: "#111318", // near-black label/glyph on the white pill
  providerLightLine: "rgba(180,205,255,0.16)", // hairline edge on the white pill
} as const;

// Deep-space radius + spacing scales (design handoff 2026-06-17). Softer/rounder
// than the legacy `radii`/`spacing` above, so deep-space screens read as the
// character's rounded body. Kept separate so legacy screens are untouched.
export const deepSpaceRadii = { sm: 9, md: 13, lg: 18, pill: 999, phone: 38 } as const;
export const deepSpaceSpacing = { xs: 6, sm: 10, md: 14, lg: 18, xl: 24 } as const;

// Deep-space gradients (2026-06-17 design adoption; DESIGN.md "Color rules"
// exception). Stop arrays for react-native-svg <LinearGradient> / <RadialGradient>
// react-native-svg is already a dependency, so no new package. Every stop stays
// inside the cyan / soul / mint identity so a gradient reads as the character's
// glow, never a decorative fill. Off-palette gradients remain forbidden.
export const deepSpaceGradients = {
  cta: ["#46B6FF", "#5FD4FF"], // primary filled CTA (left -> right)
  ctaPositive: ["#5FF0C0", "#46B6FF"], // positive / upward-delta emphasis fill
  progress: ["#46B6FF", "#5FD4FF"], // trait / progress bar fill
  soulCore: ["#C8B6FF", "#8B7BD8"], // 북극성 orb (radial: center -> edge)
  idenSend: ["#8B7BD8", "#A78BFA"], // "AI에 전달" violet action
  screenBg: ["rgba(26,72,120,0.40)", "rgba(11,33,66,0.24)", "#070A13"], // space wash (top -> bottom)
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
  backdrop: "rgba(0,0,0,0.6)",
  backdropStrong: "rgba(2,4,10,0.78)",
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
  deepSpaceBg: semantic.deepSpaceBg,
  deepSpaceAccent: semantic.deepSpaceAccent,
  deepSpaceText: semantic.deepSpaceText,
  deepSpaceTextMuted: semantic.deepSpaceTextMuted,
  deepSpaceCard: semantic.deepSpaceCard,
  deepSpaceCardPressed: semantic.deepSpaceCardPressed,
  deepSpaceCardLine: semantic.deepSpaceCardLine,
} as const;

// ─── Characters — 6 pixel residents of the Graph Village ────────────
// Source: handoff §5 "Character System". Each is anchored to one
// cosmic accent so the village reads as a small consistent cast across
// the graph, popovers, and chat avatars. Routes the character is tied
// to live in src/lib/characters.ts.
// Worldview v-final (2026-06): accents map to the 5 Pattern Cores + Soul Core.
// Safety is now system-only (guardRose), separated from any mascot. Internal
// keys stay (asset filenames / personas key off them); only color + meaning move.
export const characters = {
  secondb: cosmic.soulViolet, // Soul Core / SecondB — AI presence
  momo: cosmic.moonWhite, // Narrative Core / Foreman Momo + crew — monochrome
  lulu: cosmic.signalMint, // Wisdom Core / Lumen
  archi: cosmic.signalBlue, // Growth Core / Archon
  gadi: cosmic.pixelLamp, // Bond Core / Relia — amber (dual-context with zoneYellow; see DESIGN.md)
  lumi: cosmic.dreamPink, // Muse Core / Lumina — taste + inspiration
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
    xs: 12,
    sm: 14,
    md: 16,
    lg: 20,
    xl: 25,
    xxl: 31,
    display: 39,
  },
  weights: {
    regular: "400",
    medium: "500",
    semibold: "600",
    bold: "700",
    extrabold: "800",
  },
} as const;
