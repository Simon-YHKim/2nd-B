// 토큰 기반 — **PIXEL-CLAY v4** (Simon 결정 V1 2026-08-19, 이식 결정 P1~P5 2026-08-20).
//
// ## 이름은 M3, 값은 PIXEL-CLAY
//
// 이 파일의 **이름(`m3.color.primary` 같은 역할 이름)은 그대로 두고 값만 갈아끼운다.**
// 35개 파일이 `StyleSheet.create` 안에서 모듈 스코프로 `m3.*` 를 읽기 때문에
// (`check:cycles` 가 무관용 게이트인 이유), 이름을 바꾸면 그 전부를 건드려야 한다.
// 인수 번들도 웹에서 정확히 같은 일을 한다 — `design/pixel_clay_v4/app/px-bridge.css`
// 가 M3 어휘 30개를 PIXEL-CLAY 시맨틱으로 별칭한다. 이 파일은 그 브리지의 RN 판이다.
//
// 매핑은 지어내지 않고 그 브리지와 `_ds/tokens/{palettes,semantic}.css` 를 그대로 따랐다.
//
// ## 팔레트: midnight 고정 (P2)
//
// 번들은 45개 팔레트를 런타임 교체하지만 배포된 프로토타입은 `midnight` 하나로 고정돼
// 있고, Simon 이 런타임 교체를 **안 가져오기로** 정했다. 그래서 여기 값은 상수다.
//
//   c00 #0a0e18  c01 #141b2e  c02 #232e4a  c03 #3d4866
//   c04 #8b96b0  c05 #b0b9cc  c06 #d4dae6  c07 #eaeef5
//   c08 #ffffff  c09 #5b8def  c10 #2f5fc0  c11 #9db8f5
//   c12 #3fa88a  c13 #4d8fd6  c14 #e0a63c  c15 #db5b57
//
// dark 시맨틱(`semantic.css` `.theme-dark`):
//   bg=c00 · panel=c01 · panel-2=c02 · sunken=c00 · fg=c07 · fg-muted=c04
//   edge=c00 · edge-soft=c02 · bevel-hi=c03 · bevel-lo=c00 · focus=c11
//
// ## 아직 안 바꾼 것 — 다음 단계
//
// **간격(`m3Spacing`)과 타입(`m3Type`)은 그대로 두었다.** 그 둘은 레이아웃 치수를
// 바꾸므로 함께 움직여야 한다 — PIXEL-CLAY 의 `--u:2px` 격자는 간격을 절반으로
// 만들고 타입도 10~15px 로 내린다. 간격만 절반으로 줄이고 16px 본문을 두면 화면이
// 조이기만 한다. 폰트 3종 추가(P3)도 같은 단계다.
//
// 지금 바뀐 것은 **레이아웃 치수를 건드리지 않는 것들**이다: 라운드 · 깊이 · 모션 · 색.
//
// ADDITIVE: this does NOT replace `tokens.ts`. Screens migrate to `m3.*` phase by
// phase (REV2-MIGRATION.md P2+). For a migrated component, `m3.color.*` is the
// approved semantic source — do NOT use hex literals (same rule as `semantic.*`).
// The legacy cosmic-pixel skin keeps using the existing tokens.

/** M3 color roles — cyan palette, DARK theme (the app default). */
export const m3ColorDark = {
  // primary = --accent(c09) / on-primary = --accent-fg(c01) / container = --accent-deep(c10)
  primary: "#5b8def",
  onPrimary: "#141b2e",
  primaryContainer: "#2f5fc0",
  onPrimaryContainer: "#eaeef5",
  inversePrimary: "#2f5fc0",

  // secondary = c04 / on = c01 / container = panel-2(c02) / on-container = c06
  secondary: "#8b96b0",
  onSecondary: "#141b2e",
  secondaryContainer: "#232e4a",
  onSecondaryContainer: "#d4dae6",

  // tertiary = 세컨비 머리 보라 (--ds-nebula). 딥스페이스 브랜드 레이어의 값이라
  // 팔레트가 아니라 pixel-deepspace.css 에서 온다.
  tertiary: "#A78BFA",
  onTertiary: "#141b2e",
  tertiaryContainer: "#4C3A8C",
  onTertiaryContainer: "#E2D6FF",

  error: "#db5b57",
  onError: "#141b2e",
  errorContainer: "#db5b57",
  onErrorContainer: "#141b2e",

  background: "#0a0e18",
  onBackground: "#eaeef5",
  surface: "#0a0e18",
  onSurface: "#eaeef5",
  // surface-variant = --sunken(c00) / on = --fg-muted(c04)
  surfaceVariant: "#0a0e18",
  onSurfaceVariant: "#8b96b0",
  surfaceDim: "#0a0e18",
  surfaceBright: "#3d4866",

  // 브리지: lowest/low/container = --panel(c01), high/highest = --panel-2(c02)
  surfaceContainerLowest: "#141b2e",
  surfaceContainerLow: "#141b2e",
  surfaceContainer: "#141b2e",
  surfaceContainerHigh: "#232e4a",
  surfaceContainerHighest: "#232e4a",

  inverseSurface: "#eaeef5",
  inverseOnSurface: "#141b2e",
  // ⚠ outline / outline-variant 는 브리지에서 **둘 다 --edge-soft(c02)** 다.
  // PRD §2-2 가 명시적으로 금지한다: `C('outline')` 을 본문 텍스트에 쓰지 말 것 —
  // 보더 전용이라 배경과 구분되지 않는다. 본문 보조는 onSurfaceVariant 를 쓴다.
  outline: "#232e4a",
  outlineVariant: "#232e4a",
  surfaceTint: "#5b8def",
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
  /** 트위비 / Twi-B — creative wild-card (Divergent). */
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
  // PIXEL-CLAY 절대 규칙 2: `border-radius: 0` — 전 화면 강제.
  // 브리지도 `--md-sys-shape-corner-*` 아홉 개를 전부 0 으로 만든다
  // ("shape: the grid has no corners"). 이름을 남긴 이유는 호출부 수백 곳을
  // 건드리지 않기 위해서다 — `full` 까지 0 이라 알약 모양도 사각이 된다.
  none: 0,
  extraSmall: 0,
  small: 0,
  medium: 0,
  large: 0,
  largeIncreased: 0,
  extraLarge: 0,
  extraLargeIncreased: 0,
  full: 0,
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
  // PIXEL-CLAY 절대 규칙 3: 블러 금지. 그래서 그림자가 없다 — 깊이는 **4방향 베벨과
  // 쌓임 순서**로만 표현한다(`_ds/tokens/elevation.css`: "There is no shadow-based
  // elevation in this system (blur is banned)"). 브리지도 level1~5 를 전부 같은
  // `--ds-edge` 로 만든다.
  //
  // 레벨 이름을 남긴 이유는 호출부를 안 건드리기 위해서다. 값은 전부 평평하다 —
  // RN `shadowRadius` 는 블러 반경이므로 0 이 아니면 규칙 위반이다.
  //
  // 베벨 프리미티브는 다음 단계다(P4 와 함께). 지금은 **그림자를 없애는 것**까지다.
  level0: { shadowColor: "#000", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0, shadowRadius: 0, elevation: 0 },
  level1: { shadowColor: "#000", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0, shadowRadius: 0, elevation: 0 },
  level2: { shadowColor: "#000", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0, shadowRadius: 0, elevation: 0 },
  level3: { shadowColor: "#000", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0, shadowRadius: 0, elevation: 0 },
  level4: { shadowColor: "#000", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0, shadowRadius: 0, elevation: 0 },
  level5: { shadowColor: "#000", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0, shadowRadius: 0, elevation: 0 },
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
  // PIXEL-CLAY 절대 규칙 5: `steps()` 이징만. 곡선 이징은 **부분 픽셀 위치**를
  // 만들어서 픽셀 격자가 흐려진다(`_ds/tokens/motion.css`: "ease / cubic-bezier /
  // linear produce sub-pixel positions").
  //
  // 웹은 `steps(n,end)` 를 쓰고 RN 에는 `Easing.step0/step1` 밖에 없다. 그래서
  // **베지어 배열의 모양은 유지하되 계단에 가까운 제어점**을 쓴다 — 호출부가
  // `Easing.bezier(...m3.motion.easing.standard)` 로 쓰고 있어 배열이 아니면 깨진다.
  // 진짜 계단 이징은 프리미티브 단계에서 `Easing.steps` 로 바꾼다.
  //
  // 지속시간은 번들 값(60 / 120 / 240ms)에 맞춰 내렸다. 원래 M3 값(150~500ms)은
  // 픽셀아트에는 느리다.
  easing: {
    standard: [0.99, 0, 1, 1],
    emphasized: [0.99, 0, 1, 1],
    emphasizedDecelerate: [0.99, 0, 1, 1],
    emphasizedAccelerate: [0.99, 0, 1, 1],
  },
  duration: { short3: 60, short4: 60, medium2: 120, medium4: 120, long2: 240 },
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
