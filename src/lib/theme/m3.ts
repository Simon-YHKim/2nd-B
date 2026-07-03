// Material 3 token foundation for the rev2 (PRD v2.0) migration — P1.
//
// Source of truth: the rev2 prototype `m3-theme.css` (cyan palette = "별자리 시안":
// azure primary + violet tertiary = the 세컨비 head). The app default is the CYAN
// DARK theme (PRD §13: "기본은 다크"). Values below are transcribed 1:1 from the
// prototype so migrated screens match it exactly.
//
// ADDITIVE: this does NOT replace `tokens.ts`. Screens migrate to `m3.*` phase by
// phase (REV2-MIGRATION.md P2+). For a migrated component, `m3.color.*` is the
// approved semantic source — do NOT use hex literals (same rule as `semantic.*`).
// The legacy cosmic-pixel skin keeps using the existing tokens.

/** M3 color roles — cyan palette, DARK theme (the app default). */
export const m3ColorDark = {
  primary: "#86CFFF",
  onPrimary: "#00344C",
  primaryContainer: "#004C6D",
  onPrimaryContainer: "#C8E6FF",
  inversePrimary: "#00658F",

  secondary: "#B6CAD8",
  onSecondary: "#20333E",
  secondaryContainer: "#374955",
  onSecondaryContainer: "#D2E5F4",

  // Tertiary = the 세컨비 head violet.
  tertiary: "#D4BBFF",
  onTertiary: "#3B1E72",
  tertiaryContainer: "#523B8B",
  onTertiaryContainer: "#EADDFF",

  error: "#F2B8B5",
  onError: "#601410",
  errorContainer: "#8C1D18",
  onErrorContainer: "#F9DEDC",

  background: "#0B0F14",
  onBackground: "#DEE3E8",
  surface: "#0B0F14",
  onSurface: "#DEE3E8",
  surfaceVariant: "#41484D",
  onSurfaceVariant: "#C1C7CE",
  surfaceDim: "#0B0F14",
  surfaceBright: "#31353A",

  surfaceContainerLowest: "#06090D",
  surfaceContainerLow: "#131820",
  surfaceContainer: "#171D25",
  surfaceContainerHigh: "#222833",
  surfaceContainerHighest: "#2C333E",

  inverseSurface: "#DEE3E8",
  inverseOnSurface: "#2D3135",
  outline: "#8B9298",
  outlineVariant: "#41484D",
  surfaceTint: "#86CFFF",
  scrim: "#000000",
} as const;

/**
 * Deep-space accents (palette-independent — used by the constellation home and
 * shared graph/museum "sky"). These stay constant across light/dark/palette.
 */
export const m3Accent = {
  star: "#CCFAFF",
  starCore: "#46B6FF",
  /** Receding / faint star cyan (constellation arcs, dim stars). */
  starDim: "#7FC9F0",
  polaris: "#C8B6FF",
  /** 북극성 orb radial edge (pairs with `polaris` as the center stop). */
  polarisEdge: "#8B7BD8",
  /** Pointer link toward 북극성 (soul violet, pre-multiplied 50%). */
  polarisLine: "rgba(167,139,250,0.50)",
  moodPositive: "#5FF0C0",
  moodNeutral: "#A78BFA",
  moodNegative: "#FF7A90",
  /** Amber for a flat / receding brightness bar (밝기 변화 non-rising star). */
  trendFlat: "#F7B955",
  /** Sky copy on the deep-space background: body cyan / emphasized near-white. */
  skyText: "#5FD4FF",
  skyTextHi: "#E8F7FF",
  /** Mid-navy wash behind the constellation glow disc. */
  skySurface: "#0B2142",
  /** App-wide deepest background behind the nebula (m3-theme.css `body`). */
  spaceBody: "#05070B",
  /** Dark ink placed on a bright persona-accent fill (chat send/mic glyph). */
  onAccentInk: "#06121f",

  // ---- rev2 constellation home (reference-app sb-home.jsx / sb-app.jsx).
  // Values transcribed 1:1 from the prototype; alpha is applied at the callsite
  // via withAlpha so each token stays a plain hex.
  /** Cosmic base under every sky layer (sb-app SB_COSMIC base). */
  cosmicBase: "#060912",
  /** Home stage radial floor (sb-home stage gradient end / vignette base). */
  stageFloor: "#070A13",
  /** Home stage radial center wash rgb(26,72,120) (used at .5 alpha). */
  stageGlow: "#1A4878",
  /** SB_COSMIC nebula washes: blue rgb(40,86,150) / violet rgb(120,96,210). */
  nebulaBlue: "#285696",
  nebulaViolet: "#7860D2",
  /** Shared starfield star tints (sb-app SB_SKY_STARS palette). */
  skyStarBlue: "#CFE0FF",
  skyStarViolet: "#C9BEFF",
  skyStarWhite: "#FFFFFF",
  /** Shared starfield faint constellation line tints (SB_SKY_CONST). */
  skyConstA: "#5B9DFF",
  skyConstB: "#9A86FF",
  skyConstC: "#7FA8FF",
  skyConstD: "#8FB6FF",
  /** Dipper outline starlight rgb(127,227,255) (used at .34 alpha). */
  dipperLine: "#7FE3FF",
  /** 북극성 dot radial mid-stop / polaris label tint rgb(214,196,255). */
  polarisSoft: "#D6C4FF",
  /** Polaris glow rims rgb(183,148,246) (1 / .7 alpha in the prototype). */
  polarisGlow: "#B794F6",
  /** Star label starlight rgb(190,225,255) (used at .78 alpha). */
  starLabel: "#BEE1FF",
  /** Focused star/bubble-title near-white (#EAF7FF ≠ skyTextHi on purpose). */
  starFocus: "#EAF7FF",
  /** Speech bubble: surface rgb(9,20,40) (.95), body copy #A7E0FF. */
  bubbleSurface: "#091428",
  bubbleText: "#A7E0FF",
  /** Home inbox bell: chip rgb(20,30,52) (.7), glyph #CFE6FF, badge #FF8A5B. */
  bellSurface: "#141E34",
  bellGlyph: "#CFE6FF",
  alertDot: "#FF8A5B",
  /** Windowed-screen 1px rim rgb(150,180,230) (used at .16 — sb-app data-window). */
  windowRim: "#96B4E6",
  // ---- 공유 카드 (sb-more ShareCardScreen) — 1080×1080 card palette.
  /** Card eyebrow/rim starlight rgb(127,208,255) (rim at .18). */
  shareEyebrow: "#7FD0FF",
  /** Card headline ink. */
  shareInk: "#EAF2FF",
  /** Card body/footer ink rgb(220,230,255) (used at .65–.7). */
  shareInkSoft: "#DCE6FF",
  /** Lit constellation dot on the card. */
  shareStarOn: "#BFE9FF",
  /** Card background radial top stop (→ stageFloor). */
  shareBgTop: "#16203A",

  // ---- rev2 entry flow (onboarding carousel + TTFV first-light). Transcribed
  // 1:1 from sb-flows.jsx OnboardingScreen + sb-ops.jsx FirstInsight.
  /** Onboarding mono tag + TTFV evidence accent rgb(127,182,255). */
  entryTag: "#7FB6FF",
  /** Onboarding body copy rgb(214,230,255) (applied at .72 alpha). */
  entryBody: "#D6E6FF",
  /** TTFV insight phrase highlight (‘먼저 다가가는’). */
  insightHi: "#82D8F6",
  /** 북극성 caption + outlined-button ink rgb(207,230,255). */
  starCaption: "#CFE6FF",
  /** TTFV consent footer rgb(200,210,240) (applied at .5 alpha). */
  consentFootnote: "#C8D2F0",
} as const;

/**
 * 세컨비 — one character, three personas (PRD §02 / §05). Each shares the head
 * silhouette; only the accent + top signature differ.
 */
// `soft` = the light on-accent ink (reference CHAT_MODES.onSoft — text/glyph on
// a tinted lens fill). `softBg` = the translucent lens fill behind chips /
// banners / selected toggles (reference CHAT_MODES.soft). `glow` = the accent
// bloom under the persona status dot (reference CHAT_MODES.glow). Values
// transcribed 1:1 from reference-app/sb-data.jsx CHAT_MODES so the chat surface
// recolors per selected lens exactly like the prototype.
export const m3Persona = {
  /** 2nd-B (공감) — empathetic main lens. */
  secondb: { accent: "#A78BFA", soft: "#E2D6FF", softBg: "rgba(167,139,250,0.16)", glow: "rgba(167,139,250,0.5)" },
  /** 메타비 / Meta-B (객관) — objective mirror. */
  meta: { accent: "#46B6FF", soft: "#BFE7FF", softBg: "rgba(70,182,255,0.16)", glow: "rgba(70,182,255,0.5)" },
  /** 트위비·안티비 / Anti-B (공상) — creative wild-card. */
  twi: { accent: "#CFC4E8", soft: "#EDE7F7", softBg: "rgba(207,196,232,0.16)", glow: "rgba(245,230,190,0.55)" },
} as const;

/** Typefaces (PRD §13): Pretendard KO body + Roboto M3 chrome; Roboto Mono numerics. */
export const m3Font = {
  brand: "Pretendard",
  plain: "Pretendard",
  mono: "RobotoMono",
  /** Roboto is the M3 chrome/label fallback; registered when the first M3 screen mounts (P2). */
  chrome: "Roboto",
  weight: { regular: "400", medium: "500", bold: "700" },
} as const;

interface TypeRole {
  size: number;
  line: number;
  tracking: number;
  weight: "400" | "500" | "700";
}
/** M3 type scale (size / line-height / letter-spacing in px, transcribed 1:1). */
export const m3Type = {
  displayLarge: { size: 57, line: 64, tracking: -0.25, weight: "400" },
  displayMedium: { size: 45, line: 52, tracking: 0, weight: "400" },
  displaySmall: { size: 36, line: 44, tracking: 0, weight: "400" },
  headlineLarge: { size: 32, line: 40, tracking: 0, weight: "400" },
  headlineMedium: { size: 28, line: 36, tracking: 0, weight: "400" },
  headlineSmall: { size: 24, line: 32, tracking: 0, weight: "500" },
  titleLarge: { size: 22, line: 28, tracking: 0, weight: "500" },
  titleMedium: { size: 16, line: 24, tracking: 0.15, weight: "500" },
  titleSmall: { size: 14, line: 20, tracking: 0.1, weight: "500" },
  bodyLarge: { size: 16, line: 24, tracking: 0.5, weight: "400" },
  bodyMedium: { size: 14, line: 20, tracking: 0.25, weight: "400" },
  bodySmall: { size: 12, line: 16, tracking: 0.4, weight: "400" },
  labelLarge: { size: 14, line: 20, tracking: 0.1, weight: "500" },
  labelMedium: { size: 12, line: 16, tracking: 0.5, weight: "500" },
  labelSmall: { size: 11, line: 16, tracking: 0.5, weight: "500" },
} as const satisfies Record<string, TypeRole>;

/** M3 shape corner radii (px). */
export const m3Shape = {
  none: 0,
  extraSmall: 4,
  small: 8,
  medium: 12,
  large: 16,
  largeIncreased: 20,
  extraLarge: 28,
  extraLargeIncreased: 32,
  full: 9999,
} as const;

interface Elevation {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
}
/**
 * M3 elevation levels 0..5, expressed as RN shadow props (approximating the M3
 * umbra; `elevation` drives Android). Dark theme uses black shadows.
 */
export const m3Elevation = {
  level0: { shadowColor: "#000", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0, shadowRadius: 0, elevation: 0 },
  level1: { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.3, shadowRadius: 3, elevation: 1 },
  level2: { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 3 },
  level3: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
  level4: { shadowColor: "#000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 8 },
  level5: { shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 12 },
} as const satisfies Record<string, Elevation>;

/** M3 interactive state-layer opacities (overlay currentColor at these). */
export const m3State = {
  hover: 0.08,
  focus: 0.1,
  pressed: 0.1,
} as const;

/** M3 spacing (4dp grid). */
export const m3Spacing = {
  s1: 4,
  s2: 8,
  s3: 12,
  s4: 16,
  s5: 20,
  s6: 24,
  s8: 32,
} as const;

/** M3 motion — easing bezier control points (for Easing.bezier) + durations (ms). */
export const m3Motion = {
  easing: {
    standard: [0.2, 0, 0, 1],
    emphasized: [0.2, 0, 0, 1],
    emphasizedDecelerate: [0.05, 0.7, 0.1, 1],
    emphasizedAccelerate: [0.3, 0, 0.8, 0.15],
  },
  duration: { short3: 150, short4: 200, medium2: 300, medium4: 400, long2: 500 },
} as const;

/** The M3 token bundle. Import `m3` and read `m3.color.primary`, `m3.type.titleLarge`, etc. */
export const m3 = {
  color: m3ColorDark,
  accent: m3Accent,
  persona: m3Persona,
  font: m3Font,
  type: m3Type,
  shape: m3Shape,
  elevation: m3Elevation,
  state: m3State,
  spacing: m3Spacing,
  motion: m3Motion,
} as const;

export type M3ColorRole = keyof typeof m3ColorDark;
export type M3TypeRole = keyof typeof m3Type;
export type M3Persona = keyof typeof m3Persona;
export type M3 = typeof m3;
