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

/**
 * 합성 FX 토큰들이 앉는 바탕. `cosmic.space950` 과 **같은 값**이어야 한다 —
 * 객체를 정의하는 중이라 자기 자신을 못 가리켜서 리터럴로 둔다.
 * ⚠ 어긋나면 조용히 틀린 색이 나온다. `theme-tokens.test.ts` 가 둘을 묶는다.
 */
const FX_GROUND = "#070A18";

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
  // ⚠ **미리 합성한 색이다** (PIXEL-CLAY 절대 규칙 4 — 정적 반투명 금지).
  //   원래 `rgba(...)` 리터럴이었고, **토큰 정의 자체가 알파를 들고 있어서**
  //   이걸 쓰는 화면이 전부 반투명을 그렸다(`/esm` 의 카드 바탕이 `panelBg` 였다).
  //
  //   바탕은 `FX_GROUND`(= 가장 깊은 배경). 다른 바탕 위에 놓이는 자리가 생기면
  //   그 자리에서 따로 잴 것 — 바탕이 틀리면 알파를 그냥 두는 것보다 나쁘다.
  //   값은 손으로 계산하지 않는다. 손계산은 틀려도 아무도 모른다.
  edgeDefault: flattenAlpha("#8D98B8", 0.28, FX_GROUND), // --edge-default
  edgeRecent: "#FFD166", // --edge-recent (= pixelLamp)
  panelBg: flattenAlpha("#0D1530", 0.9, FX_GROUND), // --panel-bg
  panelBorder: flattenAlpha("#8D98B8", 0.34, FX_GROUND), // --panel-border
  coreGlow: flattenAlpha("#A78BFA", 0.42, FX_GROUND), // --core-glow
  mintGlow: flattenAlpha("#72F2C7", 0.34, FX_GROUND), // --mint-glow
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

/**
 * `withAlpha` 의 짝 — 반투명을 **미리 합성해 불투명 색 하나로** 만든다.
 *
 * PIXEL-CLAY 절대 규칙 4(정적 불투명도 금지 → 색 밴딩)가 요구하는 계산이다.
 * `withAlpha(c, 0.4)` 가 렌더 때 배경과 섞이는 것을, 여기서는 **미리** 섞어
 * 리터럴 하나로 만든다. 결과가 같은 픽셀이면 왜 규칙인가 하면 — 알파는
 * 아래 깔린 것이 무엇이냐에 따라 결과가 달라지고(겹치면 색이 미끄러진다),
 * 픽셀아트는 색이 **셀 수 있는 몇 개**여야 하기 때문이다.
 *
 * ⚠ `ground` 를 정확히 넘겨야 한다. 실제로 뒤에 깔린 색과 다르면 결과가
 *   미묘하게 틀리고, 그건 알파를 쓰는 것보다 나쁘다(틀린 걸 박제한 셈).
 */
export function flattenAlpha(hex: string, alpha: number, ground: string): string {
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
  const mix = fg.map((c, i) => Math.round(c * a + bg[i] * (1 - a)));
  return "#" + mix.map((c) => c.toString(16).padStart(2, "0")).join("");
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
  // 표면 그룹 — 위 semanticDeepSpace 와 같은 캐논 램프를 쓴다(c00/c01/c02).
  bg: "#0a0e18",
  surface: "#141b2e",
  border: "#232e4a",
  text: "#E8F7FF",
  textMuted: "#83bcd5",
  textSubtle: "#608aa1",
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
  // ⚠ `backdrop` / `backdropStrong` 은 2026-08-27 에 **없앴다.**
  //   모달 스크림은 바탕을 모르는 자리라(어느 화면 위에도 뜬다) 미리 합성이
  //   불가능하고, PIXEL-CLAY 규칙 4 가 정확히 이 경우를 위해 "평탄화 말고
  //   디더"라고 못박고 있다. 여덟 호출부 전부 `<PixelScrim />` 로 옮겼다.
  //   되살리지 말 것 — 알파 스크림을 다시 들이면 규칙 4 가드가 잡는다.
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
  deepSpaceTextMuted: "#428eb0",
  // 셋 다 원래 `rgba(70,182,255, …)` 였고 미리 합성한 값으로 바꿨다(규칙 4).
  //
  // ⚠ **2026-08-26 정정 — 여기 적혀 있던 "딥스페이스 카드는 이 토큰으로
  //   칠해진다 … 가장 큰 단일 지렛대" 는 틀렸다.** 이 블록은 `semanticCosmic`
  //   즉 **레거시 스킨**이다(191행). 배포되는 쪽은 `semanticDeepSpace`(235행)이고
  //   그쪽의 같은 세 토큰은 **이미 단색**이었다(262~264행: #141b2e / #232e4a).
  //   갈라지는 지점은 268행의 `UI_MODE === "deep-space"` 다.
  //
  //   그래서 이 세 줄은 배포 빌드에 아무 영향이 없다. 같은 커밋이 함께 한
  //   **12개 파일 일괄 재데이트(164곳)와 `dds-styles`(19곳)가 실제 일을 했다.**
  //   수치가 떨어졌다고 그 원인을 맞혀놓은 것은 아니다 — 화면 실측은 한 커밋
  //   안의 여러 변경을 갈라보지 못한다.
  //
  //   바닥은 레거시 우주 바닥(#0a0e18)이다.
  deepSpaceCard: "#0e1826", // = rgba(70,182,255,0.06) over #0a0e18
  deepSpaceCardPressed: "#112234", // = rgba(70,182,255,0.12) over #0a0e18
  deepSpaceCardLine: "#18364f", // = rgba(70,182,255,0.24) over #0a0e18
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
  // PIXEL-CLAY 표면 그룹 (2026-08-30). 캐논 midnight 램프의 c00~c02 단색이다
  // (design/pixel_clay_260825/data/tokens.json 의 --c00/--c01/--c02).
  // 전에는 투명 네이비 위에 시안을 6% 얹는 방식이라 패널이 배경과 거의 구분되지
  // 않았다 — 레퍼런스 프레임에서 #232e4a 가 화면의 38~47% 를 차지하는데 앱
  // 스크린샷 상위 5색에는 한 번도 안 나왔다(실측 2026-08-30). 패널 층이 없었다.
  background: "#0a0e18",
  surface: "#141b2e",
  surfaceAlt: "#232e4a",
  border: "#232e4a",
  // ⚠ `backdrop` / `backdropStrong` 은 2026-08-27 에 **없앴다.**
  //   모달 스크림은 바탕을 모르는 자리라(어느 화면 위에도 뜬다) 미리 합성이
  //   불가능하고, PIXEL-CLAY 규칙 4 가 정확히 이 경우를 위해 "평탄화 말고
  //   디더"라고 못박고 있다. 여덟 호출부 전부 `<PixelScrim />` 로 옮겼다.
  //   되살리지 말 것 — 알파 스크림을 다시 들이면 규칙 4 가드가 잡는다.
  text: "#E8F7FF",
  textMuted: "#83bcd5",
  textSubtle: "#608aa1",
  // UI 전역 강조색. 레퍼런스 `--accent` 와 같은 값이다.
  //
  // ⚠ 전에는 시안 #46B6FF 로, **별 심과 같은 색**이었다. 그래서 버튼·테두리·
  //   글자 같은 평범한 UI 가 별과 구분이 안 됐다. 레퍼런스는 둘을 가른다 —
  //   `--accent`(파랑, 번들에서 64회)와 `--ds-core`(시안, 4회·딥스페이스 심 전용).
  //   별 심은 `m3.accent.starCore` 가 이미 따로 들고 있고 그쪽은 시안 그대로다.
  brand: "#5b8def",
  zoneGreen: "#5FF0C0",
  zoneYellow: "#FFD166",
  zoneRed: "#FF7A90",
  info: "#46B6FF",
  success: "#5FF0C0",
  warning: "#FFD166",
  danger: "#FF7A90",
  deepSpaceBg: "#0a0e18",
  deepSpaceAccent: "#46B6FF",
  deepSpaceText: "#5FD4FF",
  deepSpaceTextMuted: "#428eb0",
  deepSpaceCard: "#141b2e",
  deepSpaceCardPressed: "#232e4a",
  deepSpaceCardLine: "#232e4a",
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
  bgEdge: "#0a0e18", // 캐논 --c00. 전에는 #070A13 로 캐논보다 더 어두운 자기
  // 값이었고, 그것이 앱 스크린샷에서 가장 넓은 색이었다(20~53%).
  bgMid: "#141b2e", // 캐논 --c01. 화면 가장자리 우주 워시의 중간 스톱.
  bgGlow: "#232e4a", // 캐논 --c02. 상단 광원. PIXEL-CLAY 는 불투명도 대신 색
  // 밴딩을 쓰므로 반투명 파랑 대신 램프의 한 칸을 그대로 쓴다.
  accent: semantic.deepSpaceAccent, // eye outer cyan = primary accent (#46B6FF)
  accentBright: "#CCFAFF", // eye inner bright highlight / pixel titles
  accentSoft: "#9FE4FF", // bright star / icon cyan
  accentDim: "#7FC9F0", // faint star / receding node cyan
  // 발광의 **밴드**. PIXEL-CLAY 규칙 3·6 은 블러 그림자를 금지하는데, 세컨비의
  // 눈·입은 그 블러로 빛나고 있었다(shadowRadius 6). 픽셀아트에서 빛은 흐림이
  // 아니라 **한 칸 어두운 테두리**로 표현한다 — 이 값이 그 한 칸이다.
  // 밝은 심(accent #46B6FF)과 패널(#141b2e) 사이의 단색이라, 흐리지 않으면서
  // "빛이 번진다"로 읽힌다. ⚠ 알파가 아니다 — 규칙 4 도 정적 opacity 를 막는다.
  accentGlow: "#2d6896",
  text: semantic.deepSpaceText, // cyan body text (the character's mouth color, #5FD4FF)
  textHi: "#E8F7FF", // emphasized body / speech-bubble copy
  textMuted: semantic.deepSpaceTextMuted, // rgba(95,212,255,0.62)
  textMid: "#83bcd5", // secondary body
  textLo: "#608aa1", // tertiary / captions
  card: semantic.deepSpaceCard, // rgba(70,182,255,0.06)
  cardPressed: semantic.deepSpaceCardPressed, // rgba(70,182,255,0.12)
  cardLine: semantic.deepSpaceCardLine, // rgba(70,182,255,0.24) (default border)
  cardLineStrong: "#234a6d", // emphasized / focused border
  // Soul / 북극성 / AI presence (violet).
  soul: "#C8B6FF", // Soul Core bright fill / north-star
  soulDeep: "#8B7BD8", // Soul Core deep edge (orb radial outer)
  soulLine: "#5e5394", // constellation links / soul borders
  // Mint — TIP labels, positive deltas, trust/level signals.
  mint: "#5FF0C0",
  mintLine: "#2e6661", // mint border (active/positive chips)
  mintBg: "#1a2c3a", // mint fill (active chips, consent line)
  onMint: "#04241C", // dark text on a mint-filled CTA
  onAccent: "#04101E", // dark text on an accent-filled CTA
  // Warning — needs-attention (permission needed, rate-limited). Functional only.
  warning: "#FFC478",
  warningLine: "#665648",
  warningBg: "#222532",
  // Danger — overdue / error states. Functional only.
  dangerText: "#FF9B9B",
  dangerLine: "#5a404d",
  dangerBg: "#202032",
  danger: cosmic.guardRose, // functional-color exception only
  // Auth provider pill — the white "Apple/Google로 계속" surface from the auth
  // canon (sb-surfaces AuthScreen). White is a brand-provider requirement, not a
  // decorative fill, so it is exempt from the cyan-only palette like `danger`.
  providerLightBg: "#FFFFFF", // white provider pill surface (Apple / Google)
  providerLightFg: "#111318", // near-black label/glyph on the white pill
  providerLightLine: "#f3f7ff", // hairline edge on the white pill
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
  // 우주 워시(위→아래). 캐논 midnight 램프 c02→c01→c00 세 칸이다.
  // ⚠ 아직 **그라디언트 구조는 남아 있다.** PIXEL-CLAY 는 그라디언트 대신
  // 디더/색 밴딩을 요구하므로 이건 색만 맞춘 중간 단계다 — 밴딩으로 바꾸는
  // 것은 토큰이 아니라 컴포넌트 변경이라 별건으로 남긴다.
  screenBg: ["#232e4a", "#141b2e", "#0a0e18"],
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
  // ⚠ `backdrop` / `backdropStrong` 은 2026-08-27 에 **없앴다.**
  //   모달 스크림은 바탕을 모르는 자리라(어느 화면 위에도 뜬다) 미리 합성이
  //   불가능하고, PIXEL-CLAY 규칙 4 가 정확히 이 경우를 위해 "평탄화 말고
  //   디더"라고 못박고 있다. 여덟 호출부 전부 `<PixelScrim />` 로 옮겼다.
  //   되살리지 말 것 — 알파 스크림을 다시 들이면 규칙 4 가드가 잡는다.
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

// PIXEL-CLAY 절대 규칙 2: `border-radius: 0` — 전 화면 강제.
//
// 이름을 남긴 이유는 `m3Shape` 과 같다 — 호출부 96곳(37파일)을 건드리지
// 않기 위해서다. 값만 0 으로 내린다.
//
// ⚠ 이 세트가 **세 번째 반경 토큰**이었다. 가드가 허용 목록으로 바뀜 뒤에도
//   값은 4/8/12/16 로 남아 있어서, 규칙 2 위반 252건 중 대부분이 여기서 나왔다.
//   `/support` 의 8px 라운드도 이 `md` 다.
export const radii = {
  sm: 0,
  md: 0,
  lg: 0,
  xl: 0,
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
