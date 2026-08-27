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
// ## 2단계 (2026-08-20) — 간격 · 타입 · 폰트
//
// 1단계는 레이아웃 치수를 안 건드리는 것들만 바꿨다(라운드 · 깊이 · 모션 · 색).
// 2단계가 나머지다. 셋은 **함께** 움직여야 한다 — 간격만 절반으로 줄이고 16px
// 본문을 두면 화면이 조이기만 하고, 타입만 내리고 폰트를 안 넣으면 Galmuri 가
// 없는 크기로 렌더된다.
//
//   간격  `--u` 4px -> **2px** (D1). s1..s8 이 전부 절반이 된다.
//   타입  M3 15역할 -> Galmuri 격자 **10/12/15/24/30/45px 만**, tracking 0
//   폰트  Galmuri 4종 추가 (14 · 9 · Mono11 · 11Bold). 11 은 원래 있었다.
//
// ### 크기가 곧 서체다 — 이 파일에서 제일 중요한 규칙
//
// Galmuri 는 비트맵 픽셀 폰트라 **자기 고유 크기의 정수배에서만 선명하다.**
// upem 이 곧 그 크기다(100 units = 1px):
//
//   Galmuri9  upem 1000 -> 10px  (x1 10 · x2 20 · x3 30)
//   Galmuri11 upem 1200 -> 12px  (x1 12 · x2 24 · x3 36)
//   Galmuri14 upem 1500 -> 15px  (x1 15 · x2 30 · x3 45)
//
// 그래서 아래 `m3Type` 의 크기 여섯 개는 임의로 고른 값이 아니라 **저 정수배의
// 합집합**이다(PRD §2-4 가 "10/12/15/24/30/45px만" 이라고 못박은 이유). 어느 역할이
// 어느 서체로 그려질지는 `src/components/m3/typeface.ts` 가 **크기에서** 정한다.
//
// ⚠ 그래서 인수 번들을 그대로 옮기지 않은 곳이 네 군데 있다. `px-bridge.css` 는
// 크기와 서체를 따로 지정하는데 그 둘이 격자에서 어긋나는 행이 있다 —
// `headline-small` 은 24px 을 `--font-display`(Galmuri14, 1.6배)에 얹고,
// `title-large`/`title-medium`/`body-large` 는 15px 을 `--font-ui`(Galmuri11,
// 1.25배)에 얹는다. 번들 자신의 타입 토큰 주석이 반대로 적고 있다 —
// `_ds/tokens/typography.css` 는 `--t-lg:15px /* Galmuri14 x1 */` ·
// `--t-xl:24px /* Galmuri11 x2 */`, `_ds/css/typography.css:4-6` 도 h3(15px)을
// Galmuri14 로 그린다. **격자가 이기게 했다.** 안 그러면 제일 많이 쓰는 두 크기가
// 전부 흐려진다.
//
// ### 굵기는 Galmuri11 에만 있다
//
// `galmuri` 패키지가 Bold 를 파는 서체는 Galmuri11 하나다(dist 실측: Galmuri14 ·
// Galmuri9 · GalmuriMono11 은 400 뿐). RN 은 얼굴이 없는 굵기를 요청하면 안드로이드에서
// 가짜 굵기를 만들거나 시스템 폰트로 떨어지는데, 픽셀 폰트에서는 둘 다 격자를 깬다.
// 그래서 **700 은 12px·24px(Galmuri11) 에서만** 쓴다. 15px·30px·45px·10px 역할은
// 번들이 700 을 지시해도 여기서는 400 이다. 각 행에 이유를 적어뒀다.
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
  // 규칙 4(정적 opacity 금지) — 패널(#141b2e) 위에서 이 알파가 만들던 바로 그 색.
  // ⚠ tokens.ts 의 `deepSpace.soulLine` 과 **같은 값이어야 한다** —
  // constellation-home-m3 가드가 둘을 묶고 있고, 실제로 한쪽만 옮긴 것을 잡아냈다.
  polarisLine: "#5e5394",
  moodPositive: "#5FF0C0",
  moodNeutral: "#A78BFA",
  moodNegative: "#FF7A90",
  /** Amber for a flat / receding brightness bar (밝기 변화 non-rising star). */
  trendFlat: "#F7B955",
  /** Sky copy on the deep-space background: body cyan / emphasized near-white. */
  skyText: "#5FD4FF",
  skyTextHi: "#E8F7FF",
  /** Mid-navy wash behind the constellation glow disc. */
  // 캐논 --c01. tokens.ts 의 `deepSpace.bgMid` 와 **같은 값이어야 한다** —
  // constellation-home-m3 가드가 두 거울을 묶어 두고 있고, 실제로 이 표면 그룹을
  // 옮길 때 그 가드가 한쪽만 바뀐 것을 잡아냈다.
  skySurface: "#141b2e",
  /** App-wide deepest background behind the nebula (m3-theme.css `body`). */
  spaceBody: "#05070B",
  /** Dark ink placed on a bright persona-accent fill (chat send/mic glyph). */
  onAccentInk: "#06121f",

  // ---- rev2 constellation home (reference-app sb-home.jsx / sb-app.jsx).
  // Values transcribed 1:1 from the prototype; alpha is applied at the callsite
  // via withAlpha so each token stays a plain hex.
  // ⚠ 이 둘은 2026-08-30 에 캐논 바닥(--c00 #0a0e18)으로 올렸다. 원래 값은
  // rev2 프로토타입에서 1:1 로 옮긴 #060912 / #070A13 인데, 둘 다 PIXEL-CLAY
  // midnight 램프보다 **어둡다.** 그런데 이 둘이 화면에서 가장 넓은 색이다
  // (SbStarfield 의 바닥 + 홈 무대 + windowed 스크림). 실측: 앱 스크린샷의
  // 최대 면적 색이 #080b15(=cosmicBase 위 성운 워시)로 20~53% 였고, 같은
  // 레퍼런스 프레임의 최대 면적 색은 #232e4a 였다. 램프 밖 바닥이 화면 전체를
  // 캐논에서 끌어내리고 있었다.
  /** Cosmic base under every sky layer (sb-app SB_COSMIC base). */
  cosmicBase: "#0a0e18",
  /** Home stage radial floor (sb-home stage gradient end / vignette base). */
  stageFloor: "#0a0e18",
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
// ⚠ `softBg` · `glow` 는 **미리 합성한 불투명 색**이다(PIXEL-CLAY 규칙 4).
//   레퍼런스는 `rgba(...)` 로 적고 있지만 알파는 아래 깔린 것에 따라 결과가
//   달라진다. 여기서 바탕은 대화 표면(`m3ColorDark.surface`)이다 — 칩과 배너가
//   그 위에 앉는다.
const PERSONA_GROUND = m3ColorDark.surface;

export const m3Persona = {
  /** 2nd-B (공감) — empathetic main lens. */
  secondb: {
    accent: "#A78BFA",
    soft: "#E2D6FF",
    softBg: flatten("#A78BFA", 0.16, PERSONA_GROUND),
    glow: flatten("#A78BFA", 0.5, PERSONA_GROUND),
  },
  /** 메타비 / Meta-B (객관) — objective mirror. */
  meta: {
    accent: "#46B6FF",
    soft: "#BFE7FF",
    softBg: flatten("#46B6FF", 0.16, PERSONA_GROUND),
    glow: flatten("#46B6FF", 0.5, PERSONA_GROUND),
  },
  /** 트위비 / Twi-B — creative wild-card (Divergent). */
  twi: {
    accent: "#CFC4E8",
    soft: "#EDE7F7",
    softBg: flatten("#CFC4E8", 0.16, PERSONA_GROUND),
    glow: flatten("#F5E6BE", 0.55, PERSONA_GROUND),
  },
} as const;

/**
 * Typefaces — Galmuri 픽셀 폰트 (PIXEL-CLAY 2단계). 값은 `src/theme/typography.ts`
 * 의 `fontAssets` **키와 문자 그대로 같아야 한다** — RN 은 이 문자열로 등록된 얼굴을
 * 찾고, 못 찾으면 조용히 시스템 폰트로 떨어진다. `typography-m3-fonts.test.ts` 가
 * 그 짝을 지킨다.
 *
 * ⚠ `brand` 가 Galmuri14(디스플레이)가 **아니다.** 이름만 보면 그래야 할 것 같지만
 * 이 저장소에서 `m3.font.brand` 는 실제로 본문 서체로 쓰인다 — 138곳 중 대부분이
 * 11~14px 이고(실측: 13px x5 · 11 · 12.5 · 14 · 15 · 44), 15px 은 한 곳뿐이다.
 * Galmuri14 를 여기 넣으면 그 138곳이 전부 1.25배 이하의 분수 배율로 흐려진다.
 * 디스플레이 서체는 크기가 맞는 자리에서 `typeface.ts` 가 붙인다.
 */
export const m3Font = {
  /** 본문·UI 기본 얼굴 (native 12px). */
  brand: "Galmuri11",
  plain: "Galmuri11",
  /** 숫자·라벨 고정폭 (native 12px). */
  mono: "GalmuriMono11",
  /** 크롬/라벨 얼굴. 2단계 전에는 Roboto 였다. */
  chrome: "Galmuri11",
  /** 500 은 남겨두되 어떤 타입 역할도 쓰지 않는다 — Galmuri 에는 400/700 뿐이다. */
  weight: { regular: "400", medium: "500", bold: "700" },
} as const;

interface TypeRole {
  size: number;
  line: number;
  tracking: number;
  weight: "400" | "500" | "700";
}
/**
 * 타입 스케일 — Galmuri 격자 (`px-bridge.css:53-67` 의 15행을 옮긴 것).
 *
 * **크기**는 `px-bridge.css` 그대로다. **서체**는 크기가 정한다(파일 상단 참조).
 * **tracking 은 전부 0** — 브리지가 `font:` 단축 속성만 쓰고 letter-spacing 을
 * 한 번도 선언하지 않는다(= normal). 분수 자간은 글리프를 반픽셀에 앉혀서
 * 격자를 깬다.
 *
 * **line 은 브리지의 1.5배를 정수로 반올림한 값**이다. RN 의 `lineHeight` 는 dp 라
 * 분수를 주면 줄 상자가 반픽셀에 앉는다. 45x1.5=67.5 -> 68, 15x1.5=22.5 -> 23;
 * 나머지 넷은 원래 정수다. (번들도 여기서 자기모순이다 —
 * `_ds/tokens/typography.css:17` 은 1.5 를 12px 에서만 정수라고 정당화하고,
 * `_ds/css/data.css:98` 은 1.5 를 픽셀아트를 다시 흐리게 만드는 배수로 지목한다.
 * 반올림이 그 둘을 모두 만족시키는 유일한 선택이다.)
 *
 * ⚠ **역할 15개가 크기 6개로 접히므로 몇 쌍은 시각적으로 같아진다** —
 * (titleSmall · labelLarge) · (titleLarge · titleMedium · bodyLarge) ·
 * (bodySmall · labelMedium · labelSmall). 웹 브리지도 똑같이 접힌다. 새 크기를
 * 발명해서 풀지 말 것 — PRD §2-4 가 여섯 개만 허용한다. 화면에서 역할을 갈라야
 * 하면 크기가 아니라 **색과 자리**로 가른다(P5 몫).
 */
export const m3Type = {
  // ── Galmuri14 (native 15px) ────────────────────────────────────────
  displayLarge: { size: 45, line: 68, tracking: 0, weight: "400" }, // x3
  displayMedium: { size: 45, line: 68, tracking: 0, weight: "400" }, // x3
  displaySmall: { size: 30, line: 45, tracking: 0, weight: "400" }, // x2
  headlineLarge: { size: 30, line: 45, tracking: 0, weight: "400" }, // x2
  headlineMedium: { size: 30, line: 45, tracking: 0, weight: "400" }, // x2
  // ── Galmuri11 (native 12px) ────────────────────────────────────────
  // 브리지는 24px 을 --font-display 에 얹지만 24 는 Galmuri14 의 1.6배다.
  // 번들의 타입 토큰(`--t-xl:24px /* Galmuri11 x2 */`)이 맞는 쪽이다.
  headlineSmall: { size: 24, line: 36, tracking: 0, weight: "400" }, // x2
  // 15px 은 Galmuri14 x1 이고 그 얼굴에는 Bold 가 없다 -> 브리지의 700 을 400 으로.
  titleLarge: { size: 15, line: 23, tracking: 0, weight: "400" },
  titleMedium: { size: 15, line: 23, tracking: 0, weight: "400" },
  // 12px = Galmuri11 x1. **여기서만 진짜 Bold 얼굴이 있다.**
  titleSmall: { size: 12, line: 18, tracking: 0, weight: "700" },
  bodyLarge: { size: 15, line: 23, tracking: 0, weight: "400" },
  bodyMedium: { size: 12, line: 18, tracking: 0, weight: "400" },
  // ── Galmuri9 (native 10px) ─────────────────────────────────────────
  bodySmall: { size: 10, line: 15, tracking: 0, weight: "400" },
  labelLarge: { size: 12, line: 18, tracking: 0, weight: "700" },
  // 브리지는 700 을 지시하지만 Galmuri9 에는 Bold 얼굴이 없다.
  labelMedium: { size: 10, line: 15, tracking: 0, weight: "400" },
  labelSmall: { size: 10, line: 15, tracking: 0, weight: "400" },
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

/**
 * 최소 터치 규격(dp). `--u` 를 2px 로 내리면서 처음으로 **토큰이 필요해진** 값이다.
 *
 * PIXEL-CLAY 이주가 "안 바꾼다" 고 못박은 셋 중 하나가 터치 44px 이다
 * (`docs/PIXEL-CLAY-MIGRATION.md` §6). 그런데 이 저장소는 그 44 를 프리미티브마다
 * 리터럴로 흩뿌려 갖고 있었다(MdButton 48 · MdChip 44 · SegBtn 48 · MdNavBar 52 ·
 * Field 56). 그래서 **그 목록에 없던 것들**(MdCard 의 press · DatePicker 의 연도 칸과
 * 텍스트 버튼)이 간격만 절반이 되자 조용히 44 밑으로 내려갔다.
 *
 * 새로 바닥을 까는 자리는 이 토큰을 쓴다. 리터럴을 하나 더 늘리지 말 것 —
 * 다음 토큰 변경 때 또 같은 방식으로 샌다. CI 에 44 를 강제하는 검사는 없다.
 */
export const m3MinTouch = 44;

/** M3 interactive state-layer opacities (overlay currentColor at these). */
export const m3State = {
  hover: 0.08,
  focus: 0.1,
  pressed: 0.1,
} as const;

/**
 * 반투명을 **미리 합성해** 불투명 색 하나로 만든다 (PIXEL-CLAY 절대 규칙 4).
 *
 * `lib/theme/tokens.ts` 의 `flattenAlpha` 와 같은 계산인데 여기 한 벌 더 있는
 * 이유는 경계 때문이다: `m3-primitives.test.ts` 가 M3 프리미티브의
 * `theme/tokens` import 를 막는다. m3 트랙은 자족해야 한다는 규율이고,
 * 그 규율을 깨는 대신 합성을 이쪽으로 가져왔다.
 *
 * ⚠ `ground` 가 실제로 뒤에 깔린 색과 달라지면 결과가 미묘하게 틀리고,
 *   그건 알파를 그냥 두는 것보다 나쁘다. 호출부는 바탕을 명시할 것.
 */
function flatten(hex: string, alpha: number, ground: string): string {
  const parse = (v: string): [number, number, number] => {
    const h = v.replace("#", "");
    const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
    return [
      parseInt(full.slice(0, 2), 16),
      parseInt(full.slice(2, 4), 16),
      parseInt(full.slice(4, 6), 16),
    ];
  };
  const a = Math.max(0, Math.min(1, alpha));
  const fg = parse(hex);
  const bg = parse(ground);
  const mix = fg.map((c, i) => Math.round(a * c + (1 - a) * bg[i]));
  return `#${mix.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * M3 비활성 상태의 **불투명** 색.
 *
 * 전에는 프리미티브마다 `opacity: 0.38` 한 줄이었다. `MdButton` 의 그 한 줄이
 * 2026-08-27 화면 실측에서 **네 라우트에 여섯 번** 나타났다. 규칙 4 는 정적
 * 불투명도를 금하므로 값을 미리 합성해 색으로 만든다.
 *
 * ⚠ **바탕은 `m3ColorDark.surface`** 다. 프리미티브는 카드/시트 위에 앉지 무대
 *   바닥에 직접 앉지 않는다. 더 어두운 바닥 위에 놓이는 호출부가 생기면 그
 *   화면에서 값을 다시 재고 이 주석을 고칠 것.
 *
 * 컨테이너와 전경을 **둘 다** 낸다. 컨테이너만 바꾸고 전경을 그대로 두면
 * 비활성이 활성보다 또렷해진다 (옛 `opacity` 는 글자까지 함께 덮었다).
 */
const DISABLED_ALPHA = 0.38;

/**
 * 별 밝기 사다리 (PIXEL-CLAY 절대 규칙 4 · Simon 결정 2026-08-27).
 *
 * 홈의 별은 "내가 나를 얼마나 알아냈나"를 밝기로 보여준다. **장식이 아니라
 * 의미**라서 값을 새로 고르지 않았다. 지금까지 알파가 내던 값을 그대로 미리
 * 합성해 **불투명 색 다섯 개**로 만든다. 결과 픽셀이 같아야 이주지 변경이 아니다.
 *
 * 사다리 분수는 프로토타입(sb-home.jsx)의 것이다: `0.36 + L / 5 * 0.64`.
 * L1 부터 L5 까지 다섯 값이고, 원래 이산적이었으므로 5단 밴딩에 **손실이 없다.**
 *
 * ⚠ **바탕은 하늘 바닥**(`m3ColorDark.surface`, 무대 바닥과 같은 값)이다.
 *   별은 하늘 위에 놓인다. 성운 워시가 지나가는 자리에서는 한 단계 어긋날 수
 *   있는데, 워시 자체가 캐논 램프 안이라 눈에 띄는 차이는 아니다.
 *
 * ⚠ 배열 색인은 **0 부터**다. `LADDER[level - 1]` 로 읽을 것.
 */
const LADDER_FRACTIONS = [1, 2, 3, 4, 5].map((l) => 0.36 + (l / 5) * 0.64);

function ladderOf(hex: string): readonly string[] {
  return LADDER_FRACTIONS.map((f) => flatten(hex, f, m3ColorDark.surface));
}

export const m3StarLadder = {
  /** 도메인 별의 심 (평상시). */
  rest: ladderOf(m3Accent.star),
  /** 도메인 별의 심 (탭해서 초점이 간 상태). */
  focus: ladderOf(m3Accent.starFocus),
  /** 북극성 중간층. */
  polarisMid: ladderOf(m3Accent.polarisSoft),
  /** 북극성 심. */
  polarisCore: ladderOf(m3Accent.skyStarWhite),
} as const;

/**
 * 0..1 집계 밝기를 사다리 한 칸(1..5)으로 떨어뜨린다.
 *
 * ⚠ 북극성은 원래 **연속값**이었다. Simon 결정으로 5단 밴딩을 택했고,
 *   그래서 미세한 변화는 사라진다 ("감수한다"고 명시). 도메인 별과 달리
 *   여기는 **손실이 있는** 변환이라는 것을 알고 쓸 것.
 *
 * 바닥이 1 인 이유: 밝기 0 인 새 사용자에게도 북극성은 보여야 한다. 옛
 * `soulCoreOpacity` 도 0.6 을 바닥으로 깔았다.
 */
export function m3BrightnessBand(brightness: number): 1 | 2 | 3 | 4 | 5 {
  const b = Number.isNaN(brightness) ? 0 : Math.min(1, Math.max(0, brightness));
  const band = Math.round(b * 4) + 1;
  return band as 1 | 2 | 3 | 4 | 5;
}

export const m3Disabled = {
  /** 비활성 채움 버튼의 바탕. */
  primary: flatten(m3ColorDark.primary, DISABLED_ALPHA, m3ColorDark.surface),
  /** 비활성 채움 버튼의 글자. */
  onPrimary: flatten(m3ColorDark.onPrimary, DISABLED_ALPHA, m3ColorDark.surface),
  /** 비활성 톤 버튼의 바탕. */
  secondaryContainer: flatten(m3ColorDark.secondaryContainer, DISABLED_ALPHA, m3ColorDark.surface),
  /** 비활성 톤 버튼의 글자. */
  onSecondaryContainer: flatten(m3ColorDark.onSecondaryContainer, DISABLED_ALPHA, m3ColorDark.surface),
  /** 비활성 외곽선. */
  outline: flatten(m3ColorDark.outline, DISABLED_ALPHA, m3ColorDark.surface),
  /** 비활성 elevated 바탕. */
  surfaceContainerLow: flatten(m3ColorDark.surfaceContainerLow, DISABLED_ALPHA, m3ColorDark.surface),
  /** 표면 위 비활성 잉크 (아웃라인/텍스트 변형의 글자). */
  onSurface: flatten(m3ColorDark.onSurface, DISABLED_ALPHA, m3ColorDark.surface),
} as const;

/**
 * 간격 — `--u = 2px` 격자 (D1, Simon 2026-08-20). 키 이름이 곧 배수다: `sN = u * N`.
 *
 * ⚠ 인수 스크린샷 12장은 `--u:4px`(데스크톱 창)에서 찍혔다. 2px 로 만든 화면은
 * 그 시안보다 촘촘해 보이는 것이 **정상**이다 — 시안이 실제 폰의 두 배로 찍혀
 * 있었던 것이다(`_ds/tokens/space.css` 의 뷰포트 분기). 되돌리려면 아래 일곱 값을
 * 두 배로 되돌리면 된다.
 *
 * ⚠ **높이를 패딩만으로 만드는 자리는 44px 최소 터치 규격을 다시 재야 한다.**
 * m3 프리미티브는 자기 높이를 리터럴로 바닥에 깔아둬서(MdButton 48 · MdChip 44 ·
 * SegBtn 48 · MdNavBar 52 · Field 56) 안 움직이지만, `MdCard` 의 `press` 는
 * 패딩뿐이라 그 위에 얹힌 카드가 같이 내려간다. 2단계에서 확인된 자리는
 * `MdCard` 자체에 바닥을 깔아 막았다 — 아래 P5 목록은 `docs/HANDOFF.md` 참조.
 */
export const m3Spacing = {
  s1: 2,
  s2: 4,
  s3: 6,
  s4: 8,
  s5: 10,
  s6: 12,
  s8: 16,
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
  disabled: m3Disabled,
  starLadder: m3StarLadder,
  minTouch: m3MinTouch,
  spacing: m3Spacing,
  motion: m3Motion,
} as const;

export type M3ColorRole = keyof typeof m3ColorDark;
export type M3TypeRole = keyof typeof m3Type;
export type M3Persona = keyof typeof m3Persona;
export type M3 = typeof m3;
