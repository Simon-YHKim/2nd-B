// check:pixel-rules -- PIXEL-CLAY 절대 규칙을 지킨다.
//
//   규칙 1  정수 rect 만 (곡선 도형 금지) — **전 소스 무관용**
//   규칙 2  `border-radius: 0`, 전 화면 강제
//   규칙 3  블러 금지 (그림자 대신 4방향 베벨 + 쌓임 순서)
//   규칙 5  계단 이징만 (곡선 이징·스프링 금지)
//
// 두 규칙을 한 파일에 둔 이유: 둘 다 "이식된 화면이 되돌아가지 않는가" 를 묻는
// 같은 질문이고, 목록도 같다. 따로 두면 목록이 두 벌이 되어 어긋난다.
//
// 왜 파일 목록을 들고 있나 (그리고 왜 그게 래칫인가)
// ------------------------------------------------
// 규칙은 결정 시점부터 "전 화면" 이지만 화면 이식은 단계적이다(P5). 그래서
// **이미 옮긴 파일이 되돌아가지 않는 것**을 지키고, 아직 안 옮긴 파일은 건드리지
// 않는다. 목록은 늘어나기만 한다. 전 화면을 덮는 날 목록을 버리고 `src/` 를 훑는다.
//
// 래칫은 이 저장소가 보통 싫어하는 형태다(`check:cycles` 는 무관용이다). 여기서
// 예외인 이유는 규칙이 약해서가 아니라 **작업이 아직 안 끝나서**다.
//
// ⚠ **아트/그래프 제외도 2026-08-21 에 없어졌다.** 그 제외는 "별을 어느 도형으로
// 그릴 것인가" 가 미결이라 걸어둔 것이었는데, Simon 이 답했다 -- **정수 rect 로
// 만든 4방향 별 모양**. 그래서 별자리 홈·기록 그래프·위키 그래프·스프라이트가
// 전부 목록에 있다. 도형 자체는 `src/components/pixel/pixel-star.ts` 다.
//
// 남은 예외는 **`elevation: <상수>`** 하나뿐이다. 안드로이드에서 그건 그림자가
// 아니라 **쌓임 순서**로 쓰이고(ANDROID_QA_GUIDELINES 의 "Shine-through z-index
// inversion"), 그걸 0 으로 만들면 규칙 3 을 지키려다 문서화된 심각한 버그를
// 되살린다. 그래서 숫자 리터럴 elevation 만 막고 상수 elevation 은 통과시킨다.
//
// ⚠ **레거시 제외는 2026-08-21 에 없어졌다.** Simon 이 "레거시 스킨을 앞으로도
// 지킬까요" 에 **안 지킨다**로 답했다 -- 배포 4곳이 전부 `deep-space` 로 못박혀
// 있어서 그 스킨은 어디에도 안 나가고, 지키는 대가로 20여 개 파일이 둥근 채
// 남아 있었다. 그래서 `(auth)/*` 도 `components/premium/*` 도 이제 목록에 있다.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = process.cwd();

// 이식 완료 파일. 늘어나기만 한다. 줄이려면 그 화면을 되돌린다는 뜻이므로
// PR 에 이유를 적을 것.
const MIGRATED: readonly string[] = [
  "src/app/(auth)/complete-profile.tsx",
  "src/app/(auth)/sign-in.tsx",
  "src/app/(auth)/sign-up.tsx",
  "src/app/audit.tsx",
  "src/app/iden.tsx",
  "src/app/import.tsx",
  "src/app/insights.tsx",
  "src/app/profile.tsx",
  "src/components/premium/SceneHero.tsx",
  "src/components/ui/BackArrow.tsx",
  "src/screens/deepspace/DeepSpaceFlowMapScreen.tsx",
  "src/app/beyond.tsx",
  "src/app/brightness.tsx",
  "src/app/call-reflection.tsx",
  "src/app/career-drilldown.tsx",
  "src/app/career.tsx",
  "src/app/community/[room].tsx",
  "src/app/core-brain.tsx",
  "src/app/interview.tsx",
  "src/app/northstar.tsx",
  "src/app/notices.tsx",
  "src/app/onboarding.tsx",
  "src/app/peer/[token].tsx",
  "src/app/people.tsx",
  "src/app/persona.tsx",
  "src/app/ratifications.tsx",
  "src/app/reasoning.tsx",
  "src/app/rest.tsx",
  "src/app/settings.tsx",
  "src/app/star/[domain].tsx",
  "src/app/trinity.tsx",
  "src/app/digest.tsx",
  "src/app/profile-details.tsx",
  "src/app/secondb.tsx",
  "src/components/deepspace/BackgroundTaskDock.tsx",
  "src/components/deep-space/AutoReasoningIntroSheet.tsx",
  "src/components/deep-space/AxisCheck.tsx",
  "src/components/deep-space/DeepSpaceLinks.tsx",
  "src/components/deep-space/DeepSpaceScreen.tsx",
  "src/components/deep-space/DeepSpaceViews.tsx",
  "src/components/deep-space/DomainStarLens.tsx",
  "src/components/deep-space/HomeCoachmarks.tsx",
  "src/components/deep-space/PolarisDeck.tsx",
  "src/components/deep-space/ReasoningLimitSheet.tsx",
  "src/components/deepspace/CompletionToast.tsx",
  "src/components/deepspace/DeepSpaceLoader.tsx",
  "src/components/deepspace/RewardedSheet.tsx",
  "src/components/deepspace/ShareCard.tsx",
  "src/components/deepspace/ops/kit.tsx",
  "src/components/deepspace/shell/PhoneShell.tsx",
  "src/components/m3/MdTopAppBar.tsx",
  "src/components/m3/ProgressLinear.tsx",
  "src/components/m3/SegBtn.tsx",
  "src/components/m3/date-picker/DatePicker.tsx",
  "src/components/persona/FacetBreakdown.tsx",
  "src/components/pixel/PixelDither.tsx",
  "src/components/pixel/PixelPressable.tsx",
  "src/components/pixel/PixelSurface.tsx",
  "src/components/quant/QuantIntroModal.tsx",
  "src/components/quant/QuantPager.tsx",
  "src/components/records/AdvisorFollowupNote.tsx",
  "src/components/ui/DrillProgress.tsx",
  "src/components/ui/PreferenceToggle.tsx",
  "src/components/wiki/FormatSchemaView.tsx",
  "src/screens/deepspace/DeepSpaceComponentsPreview.tsx",
  "src/screens/deepspace/DeepSpaceDesignScreens.tsx",
  "src/screens/deepspace/DeepSpaceHomeScreen.tsx",
  "src/screens/deepspace/DeepSpaceHubDockScreen.tsx",
  "src/screens/deepspace/dds-import-inbox-screens.tsx",
  "src/screens/deepspace/dds-legal-doc-screen.tsx",
  "src/screens/deepspace/dds-plans-screen.tsx",
  "src/screens/deepspace/dds-styles.ts",
  "src/screens/deepspace/dds-wiki-records-screens.tsx",
  "src/screens/deepspace/growth/WeeklyGrowthScreen.tsx",
  "src/screens/deepspace/import/ImportHubScreen.tsx",
  "src/screens/deepspace/museum/AiMuseumScreen.tsx",
  "src/screens/deepspace/museum/MuseumTimelineScreen.tsx",
  "src/screens/deepspace/onboarding/TTFVScreen.tsx",
  "src/screens/deepspace/ops/screens.tsx",
  "src/screens/deepspace/trends/TrendsScreen.tsx",
  "src/components/art/CompanionSprite.tsx",
  "src/components/art/SecondBSprite.tsx",
  "src/components/art/SoulcoreFinalArt.tsx",
  "src/components/deep-space/ConstellationHome.tsx",
  "src/components/deep-space/RecordsGraph.tsx",
  "src/components/deep-space/WikiGraph.tsx",
  "src/components/graph/CharacterPathLayer.tsx",
  "src/components/graph/NavGraph.tsx",
  "src/components/pixel/PixelStarSvg.tsx",
  // 2026-08-26 — 딥스페이스 표면을 전수로 편입한다. 목록 밖에 두면 가드가
  // 안 보므로 되돌아가도 아무도 모른다. 실측: 아래 19개 중 **17개는 이미**
  // 규칙 2·3 위반이 0건이었다 — 목록에만 없었을 뿐이다. 나머지 둘
  // (SecondbStatusHeader 반경 4 · deepspace/SecondbHead 그림자 3+elevation 3)은
  // 같은 PR 에서 고쳤다.
  "src/app/deepspace-flowmap.tsx",
  "src/app/deepspace-home.tsx",
  "src/app/deepspace-hub.tsx",
  "src/app/deepspace-preview.tsx",
  "src/components/deep-space/DeepSpaceDock.tsx",
  "src/components/deep-space/DeepSpaceShell.tsx",
  "src/components/deep-space/SbStarfield.tsx",
  "src/components/deep-space/SecondbHead.tsx",
  "src/components/deep-space/SecondbStatusHeader.tsx",
  "src/components/deepspace/DeepSpaceBackdrop.tsx",
  "src/components/deepspace/DeepSpaceHubDock.tsx",
  "src/components/deepspace/SecondbHead.tsx",
  "src/components/deepspace/SecondbHeadTrack.tsx",
  "src/components/deepspace/shell/SbIcon.tsx",
  "src/components/deepspace/shell/SbNavBar.tsx",
  "src/components/deepspace/shell/SbStarfield.tsx",
  "src/components/deepspace/shell/SbStatusBar.tsx",
  "src/screens/deepspace/dds-auth-screens.tsx",
  "src/screens/deepspace/dds-consent-notice-screen.tsx",
];

// ── 규칙 2 ─────────────────────────────────────────────────────────────
// **허용 목록**으로 본다. 반경 계열 프로퍼티에 올 수 있는 값은 딱 둘이다:
// 리터럴 `0`, 또는 `m3.shape.*`(전부 0 이고 m3.test.ts 가 그걸 지킨다).
// 그 밖은 숫자든 토큰이든 계산식이든 전부 위반이다.
//
// ⚠ **금지 목록으로 하다가 두 번 뚫렸다. 그래서 허용 목록으로 뒤집었다.**
//
//   1차(2026-08-21 오전) `deepSpaceRadii` 가 빠져 있었다. 이름이 `Radii` 라
//     `radius\.` 정규식에 안 걸렸고, **PASS 라고 보고한 파일 안에 둥근 모서리가
//     64곳** 있었다.
//   2차(같은 날 오후) 아트/그래프를 목록에 넣으면서 다시 세어보니 **또 100곳**이
//     PASS 뒤에 숨어 있었다. 이번 범인은 셋이다 --
//       · `radii.*` (`src/lib/theme/tokens.ts`, sm 4 / md 8 / lg 12 / xl 16)
//         → **세 번째 반경 토큰 세트였다.** 헤더에 "세 벌"이라고 적어놨던 것도 틀렸다.
//       · `borderTopLeftRadius` 류 -- 정규식이 `borderRadius:` 만 봤다.
//       · `borderRadius: islandSize * 0.46` 같은 **계산식** -- 숫자가 아니라 통과.
//
// 교훈은 같다: 가드가 PASS 를 뱉는다고 규칙이 지켜지는 게 아니다. **무엇을 안
// 보는지**를 세어봐야 안다. 허용 목록이면 새 토큰 세트가 생겨도 자동으로 걸린다.
// ── 규칙 4 — 정적 불투명도 금지 ─────────────────────────────────────────────
//
// **이 가드는 2026-08-27 까지 없었다.** 규칙 1·2·3·5·6 은 있었는데 4 만 없어서,
// 고쳐도 다시 늘어나는 것을 아무도 못 봤다.
//
// 무엇을 막는가: `opacity: 0.38` 처럼 **값이 박힌** 반투명. 대신 `flattenAlpha`
// 로 미리 합성하거나(바탕을 알 때) 디더를 쓴다(바탕이 애매할 때).
//
// ⚠ **동적 불투명도는 막지 않는다.** `opacity={fadeAnim}` 은 화면 전환이고
//   규칙 5(이징) 소관이다. 섞어서 세면 "고칠 수 없는 위반"이 목록을 채워
//   가드가 못 쓰게 된다. 그래서 값이 숫자 리터럴인 것만 본다.
//
// ⚠ 주석은 반드시 걷는다. 이 저장소에서 주석 때문에 난 거짓 양성이 이 세션에만
//   네 번이다 — 이주 메모에 `opacity` 라는 낱말이 널려 있다.
const NUM_LIT = String.raw`(?:0?\.\d+|0|1(?:\.0+)?)`;

/** `opacity: 0.38` — StyleSheet 안의 정적 값. */
const OPACITY_STYLE = new RegExp(String.raw`\bopacity\s*:\s*(${NUM_LIT})\b`, "g");
/** `opacity={0.4}` · `opacity="0.4"` — JSX(주로 react-native-svg). */
const OPACITY_JSX = new RegExp(String.raw`\bopacity=(?:\{\s*${NUM_LIT}\s*\}|"${NUM_LIT}")`, "g");
/** `fillOpacity` · `strokeOpacity` — SVG 전용 알파. */
const OPACITY_SVG = new RegExp(
  String.raw`\b(?:fill|stroke)Opacity=(?:\{\s*${NUM_LIT}\s*\}|"${NUM_LIT}")`,
  "g",
);
/** 리터럴 `rgba(r,g,b,a)` — a 가 1 미만이면 반투명이다. */
const RGBA_LIT = /\brgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*0?\.\d+\s*\)/g;
/** `withAlpha(...)` 호출 — 렌더 때 섞으므로 미리 합성한 것과 다르다. */
const WITH_ALPHA = /\bwithAlpha\s*\(/g;

const RULE4_PATTERNS: readonly { re: RegExp; why: string }[] = [
  { re: OPACITY_STYLE, why: "규칙 4 -- 정적 불투명도. `flattenAlpha(색, 알파, 바탕)` 으로 미리 합성하거나 디더를 쓸 것" },
  { re: OPACITY_JSX, why: "규칙 4 -- JSX 정적 불투명도. 미리 합성한 색을 fill 로 넘길 것" },
  { re: OPACITY_SVG, why: "규칙 4 -- SVG fill/stroke 알파. 미리 합성하거나 디더 패턴을 쓸 것" },
  { re: RGBA_LIT, why: "규칙 4 -- 리터럴 rgba 알파. 미리 합성한 hex 로 바꿀 것" },
  { re: WITH_ALPHA, why: "규칙 4 -- `withAlpha` 는 렌더 때 섞는다. `flattenAlpha` 로 바탕을 명시해 미리 합성할 것" },
];

// ── 규칙 5 — 계단 이징만 ────────────────────────────────────────────────────
//
// React Native 의 Easing 에는 CSS 의 steps() 가 없다. 그래서 저장소가 직접 만든
// `pixelSteps` / `pixelStepsFor` (src/lib/motion/pixel-physical.ts) 를 쓴다.
// 여기서 막는 것은 **연속 이징으로 되돌아가는 것**이다.
//
// ⚠ `useNativeDriver` 는 성능 플래그지 이징이 아니다 — 막지 않는다.
// ⚠ `Easing.step0` / `Easing.step1` 은 이미 계단이라 통과시킨다.
const CURVED_EASING =
  /\bEasing\.(?!step0\b|step1\b)(?:inOut|in|out)\(|\bEasing\.(?:linear|ease|quad|cubic|sin|circle|exp|bounce|elastic|back|bezier|poly)\b/g;
const SPRING_ANIM = /\b(?:withSpring|Animated\.spring)\s*\(/g;

// ── 규칙 1 — 정수 rect 만 (무관용) ────────────────────────────────────────
//
// 2026-08-26 에 닫혔다. 40개 라우트를 실제로 띄워 DOM 의 곡선 원소를 센 결과가
// **4,852 → 0** 이다. 그래서 이 규칙만은 래칫이 아니라 **무관용 게이트**다 —
// 목록이 아니라 `src/` 전체를 훑는다.
//
// ⚠ 자를 두 번 고쳤다. 처음에는 `<Path` 같은 JSX 원소만 셌는데, 같은 곡선이
//   `'<path d="…"/>'` 라는 **문자열**로도 있었다(SvgXml). 소문자라 안 걸렸고
//   그래서 320건을 121건으로 세고 있었다. 여기서는 대소문자 둘 다 본다.
//
// ⚠ **주석은 걷어내고 센다.** 이주 과정을 적은 문장 안에 `<Path>`·`<Circle>`
//   이라는 글자가 많이 들어 있어서, 안 걷으면 기록을 지워야 통과하게 된다.
const CURVE_EL = /<(Path|Circle|Ellipse|Polyline|Polygon|path|circle|ellipse|polyline|polygon)\b/g;

/**
 * 곡선 도형을 **감싼 별칭**. 실측으로 걸렸다 — `/rlss` 화면에 원이 그려지는데
 * 가드는 "곡선 0건" 이라고 말했다. 범인은 이것이었다:
 *
 *     const AnimatedCircle = Animated.createAnimatedComponent(Circle);
 *     <AnimatedCircle cx cy r />
 *
 * `<Circle` 을 찾는 정규식은 `<AnimatedCircle` 에 안 걸린다.
 *
 * ⚠ "이름이 곡선 이름으로 끝나면 잡는다" 로 넓히지 않았다 — `LearningPath` 같은
 *   멀쩡한 컴포넌트가 걸려 무관용 규칙이 오작동한다. **그 파일 안에서 실제로
 *   선언된 별칭만** 추적한다.
 */
const CURVE_ALIAS_DECL =
  /const\s+([A-Z][A-Za-z0-9_]*)\s*=\s*[A-Za-z0-9_.]*\(\s*(Path|Circle|Ellipse|Polyline|Polygon)\s*\)/g;

/** 이 파일이 선언한 곡선 별칭들의 JSX 사용을 찾는 정규식. 없으면 null. */
function curveAliasPattern(bare: string): RegExp | null {
  const names = new Set<string>();
  for (const m of bare.matchAll(CURVE_ALIAS_DECL)) names.add(m[1]);
  if (names.size === 0) return null;
  return new RegExp("<(" + [...names].join("|") + ")\\b", "g");
}

/** 줄주석과 블록주석을 공백으로 지운다(줄 수는 유지해 줄번호가 안 밀린다). */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + " ".repeat(m.length - p1.length));
}

/**
 * 규칙 1 예외. **줄이려면 그 자리를 rect 로 옮긴다는 뜻이다.**
 * 늘리려면 PR 에 이유를 적을 것 — 지금 셋 다 "규칙 이주의 대상이 아니다" 다.
 */
const RULE1_EXEMPT: readonly { prefix: string; why: string }[] = [
  {
    prefix: "src/app/deepspace-home.tsx",
    why: "DevOnlyRoute — 사용자에게 안 보인다",
  },
  {
    prefix: "src/screens/deepspace/DeepSpaceHomeScreen.tsx",
    why: "DevOnlyRoute(/deepspace-home)가 렌더하는 화면",
  },
  {
    prefix: "src/screens/deepspace/dds-auth-screens.tsx",
    why: "Apple·네이버 등 **브랜드 마크**. 로고를 픽셀로 다시 그리는 것은 상표 문제지 규칙 이주가 아니다",
  },
  {
    prefix: "src/lib/iden/render-html.ts",
    why:
      "앱 화면이 아니라 **사용자가 내려받는 HTML 문서**를 만든다. 앱 밖에서 열리는 산출물이라 " +
      "앱의 시각 체계를 따르지 않는다 — 여기를 픽셀로 바꾸는 것은 별도 결정이다",
  },
  {
    prefix: "src/components/persona/TraitRadar.tsx",
    why:
      "호출부 0건. 지우지 않는 이유는 저장소 규율이다(휴면은 결정일 수 있다) — " +
      "되살릴 때 규칙 1 부터 지키면 된다",
  },
  {
    prefix: "src/components/art/SoulcoreFinalArt.tsx",
    why: "v3 아트(플래그로 꺼져 있고 레거시 마을 그래프만 쓴다). 폐기 대상이라 이주하지 않는다",
  },
];

const RADIUS_PROP =
  /border(?:Top|Bottom)?(?:Left|Right|Start|End)?Radius\s*:\s*([^,\n}]+)/g;

/**
 * 반경 값으로 허용되는 것: 리터럴 0, `m3.shape.*`, `radii.*`, 그리고 기기 베젤 예외.
 *
 * ⚠ `radii.*` 를 허용 목록에 넣은 것은 **2026-08-27 에 값을 전부 0 으로 내렸기
 *   때문**이다. 그 전에는 4/8/12/16 이었고, 규칙 2 위반 252건 중 대부분이
 *   여기서 나왔다(`/support` 의 8px 도 이것).
 *
 *   근거는 `src/lib/theme/__tests__/m3.test.ts` 의 "`radii` 도 0 이다" 검사다.
 *   **그 검사가 빨개지면 이 허용도 같이 무효가 된다** — 누가 값을 되돌리면
 *   가드가 아니라 그 검사가 먼저 잡는다. `m3.shape.*` 와 똑같은 구조다.
 *
 *   호출부 96곳(37파일)을 `m3.shape.none` 으로 바꾸지 않은 이유도 같다:
 *   이름을 바꾸는 것은 값을 지키는 것과 다른 일이고, 값은 검사가 지킨다.
 */
function radiusAllowed(raw: string): boolean {
  const v = raw.trim();
  if (v.startsWith("m3.shape.")) return true;
  if (v.startsWith("radii.")) return true;
  if (v === "gameboy.radius") return true;
  if (EXEMPT_TOKENS.has(v)) return true;
  const n = Number(v);
  return Number.isFinite(n) && n === 0;
}

// 반경 토큰이 **반경 프로퍼티 밖**에서 쓰이는 경우도 있다(스프레드, 변수 대입).
// 위의 허용 목록은 프로퍼티만 보므로 이 그물을 같이 둔다.
// ⚠ `radii` 는 2026-08-27 에 값이 0 이 되어 이 그물에서 뺐다(위 `radiusAllowed`
//   주석 참조). `radius`(단수)와 `deepSpaceRadii` 는 **아직 0 이 아니라** 남는다.
const LEGACY_TOKEN =
  /(?<![A-Za-z0-9_.])(?:radius|deepSpaceRadii)\.[A-Za-z0-9"'[\]]+/g;

// 예외 하나: 기기 목업의 베젤.
// `radius.phone`(38)은 화면 **안**의 도형이 아니라 화면을 담고 있는 기기 테두리다.
// 인수 번들도 그렇게 갈라놨다 -- `app/px-bridge.css:76` 의 라운드 금지는
// `[data-phone-frame] *` 즉 **자손**에만 걸리고 프레임 자신(83행)에는 안 걸린다.
// 실제 폰 모서리는 둥글다. 각지게 만들면 픽셀아트가 아니라 틀린 그림이 된다.
// ⚠ 이름으로만 예외를 준다. 리터럴 38 은 여전히 실패한다.
const EXEMPT_TOKENS = new Set(["radius.phone", "deepSpaceRadii.phone"]);

// ── 규칙 3 ─────────────────────────────────────────────────────────────
// `shadowRadius` 는 **블러 반경**이라 0 이 아니면 곧 블러다. `elevation` 은
// 안드로이드가 같은 그림자를 그리고, `shadowOpacity` 가 남아 있으면 블러 없는
// 딱딱한 그림자가 남는다 -- `m3Elevation` 이 셋을 다 0 으로 두는 이유이고
// (`src/lib/theme/__tests__/m3.test.ts` 가 지킨다) 여기도 같은 기준을 쓴다.
const SHADOW_PROPS = ["shadowRadius", "shadowOpacity", "elevation"] as const;

// ── 타입 격자 (PRD §2-4) ───────────────────────────────────────────────
// Galmuri 는 비트맵이라 **자기 고유 크기의 정수배에서만** 선명하다:
// Galmuri9 -> 10px · Galmuri11 -> 12px · Galmuri14 -> 15px. 아래 여섯 값이 그
// 정수배의 합집합이고, PRD 가 "10/12/15/24/30/45px만" 이라고 적은 이유다.
//
// 이 검사가 필요한 이유는 실패가 **조용하기 때문**이다. 격자 밖 크기는 깨지지
// 않고 그냥 **흐려진다** -- 테스트도 스크린샷 리뷰도 못 잡는다. 2단계(#1273)가
// 본문 얼굴을 Galmuri 로 바꾼 뒤 실제로 25개 파일 70곳이 그 상태였다.
//
// 스타일 객체 하나(중괄호 한 쌍) 안에서 **Galmuri 얼굴과 크기가 만나는 곳**만
// 본다. 벡터 얼굴(Pretendard 등)에 얹힌 크기는 격자와 무관하므로 건드리지 않는다.
const TYPE_GRID = new Set([10, 12, 15, 24, 30, 45]);
const GALMURI_FACE = /m3\.font\.(brand|plain|mono|chrome)|fontFamilies\.(pixel|pixelKo|serifKo)/;

// 역할 -> px (`m3Type`). 얼굴 -> x1 px (`typeface.ts` 의 NATIVE_PX). 여기 값을
// 리터럴로 두는 이유는 이 스크립트가 앱 모듈을 import 하지 않기 때문이다 --
// `m3.ts` 는 react-native 를 끌고 오고 tsx 러너에서 안 뜬다.
// `src/lib/theme/__tests__/m3.test.ts` 가 크기 쪽을, `typeface.ts` 헤더가 얼굴
// 쪽을 지킨다. 둘 중 하나가 바뀌면 여기도 바꿀 것.
const ROLE_SIZE: Readonly<Record<string, number>> = {
  displayLarge: 45, displayMedium: 45, displaySmall: 30,
  headlineLarge: 30, headlineMedium: 30, headlineSmall: 24,
  titleLarge: 15, titleMedium: 15, titleSmall: 12,
  bodyLarge: 15, bodyMedium: 12, bodySmall: 10,
  labelLarge: 12, labelMedium: 10, labelSmall: 10,
};
const FACE_NATIVE_PX: Readonly<Record<string, number>> = {
  brand: 12, // Galmuri11
  plain: 12, // Galmuri11
  mono: 12, // GalmuriMono11
  chrome: 12, // Galmuri11
};

/**
 * `const X = StyleSheet.create({...})` 의 범위들. 화살표 팩토리
 * (`const X = () => StyleSheet.create({...})`)는 **제외**한다 -- 그건 다시
 * 평가할 수 있어서 얼어붙지 않는다.
 */
function frozenSheetRanges(src: string): [number, number][] {
  const out: [number, number][] = [];
  for (const m of src.matchAll(/StyleSheet\.create\(/g)) {
    const at = m.index ?? 0;
    const before = src.slice(Math.max(0, at - 12), at);
    if (before.includes("=>")) continue;
    let i = at + m[0].length - 1;
    let depth = 0;
    for (; i < src.length; i += 1) {
      if (src[i] === "(") depth += 1;
      else if (src[i] === ")") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    out.push([at, i]);
  }
  return out;
}

interface Hit {
  file: string;
  line: number;
  text: string;
  why: string;
}

const hits: Hit[] = [];
const lineOf = (src: string, index: number): number => src.slice(0, index).split("\n").length;

/**
 * 규칙 2·3·5 를 **`src/` 전체**에서 본다 (2026-08-27 승격).
 *
 * 전에는 `MIGRATED` 목록 안에서만 봤다. 그래서 목록 밖에 새 위반이 생기면
 * 아무 일도 안 일어났고, "PASS" 가 "규칙이 지켜진다"를 뜻하지 않았다.
 * 화면 실측에서 이 세 규칙이 사실상 0 이라(곡선 0 · 라운드 1 · 블러 0) 승격
 * 비용이 낮아진 시점에 목록을 걷는다.
 *
 * ⚠ 목록을 지우지는 않았다. `MIGRATED` 는 규칙 6(타입 격자)이 아직 쓰고,
 *   무엇이 언제 이식됐는지의 기록이기도 하다.
 */
const RULE_SCOPE: readonly string[] = walkTsx(join(ROOT, "src")).map((p) =>
  p.slice(ROOT.length + 1).split(sep).join("/"),
);

for (const rel of RULE_SCOPE) {
  let src: string;
  try {
    src = readFileSync(join(ROOT, rel), "utf8");
  } catch {
    hits.push({ file: rel, line: 0, text: "(파일 없음)", why: "이식 목록에 있는데 파일이 없다" });
    continue;
  }

  // 규칙 4 — 주석을 걷고 본다.
  {
    const bare4 = stripComments(src);
    for (const { re, why } of RULE4_PATTERNS) {
      re.lastIndex = 0;
      for (const m of bare4.matchAll(re)) {
        hits.push({ file: rel, line: lineOf(bare4, m.index ?? 0), text: m[0].trim(), why });
      }
    }
  }

  for (const m of src.matchAll(RADIUS_PROP)) {
    if (radiusAllowed(m[1])) continue;
    hits.push({
      file: rel,
      line: lineOf(src, m.index ?? 0),
      text: m[0].trim(),
      why: "규칙 2 -- 반경은 `0` 또는 `m3.shape.*` 만. 숫자·레거시 토큰·계산식 전부 불가",
    });
  }
  for (const m of src.matchAll(CURVED_EASING)) {
    hits.push({
      file: rel,
      line: lineOf(src, m.index ?? 0),
      text: m[0],
      why: "규칙 5 -- 곡선 이징. `pixelSteps(n)` 또는 `pixelStepsFor(ms)` 를 쓸 것 (lib/motion/pixel-physical)",
    });
  }
  for (const m of src.matchAll(SPRING_ANIM)) {
    hits.push({
      file: rel,
      line: lineOf(src, m.index ?? 0),
      text: m[0],
      why: "규칙 5 -- 스프링은 연속 운동이다. 계단 이징 + Animated.timing 으로",
    });
  }
  for (const m of src.matchAll(LEGACY_TOKEN)) {
    if (EXEMPT_TOKENS.has(m[0])) continue;
    hits.push({
      file: rel,
      line: lineOf(src, m.index ?? 0),
      text: m[0],
      why: "규칙 2 -- 레거시 radius 토큰. 그 값은 아직 9/13/18/999 다",
    });
  }
  for (const prop of SHADOW_PROPS) {
    // 값을 실제로 파싱한다. 정규식으로 "0 이 아닌 숫자" 를 표현하면 0.28 같은
    // 소수에서 틀린다 (0 뒤가 단어경계라 lookahead 가 걸린다).
    for (const m of src.matchAll(new RegExp(`${prop}:\\s*([0-9][0-9.]*)`, "g"))) {
      if (Number(m[1]) === 0) continue;
      hits.push({
        file: rel,
        line: lineOf(src, m.index ?? 0),
        text: m[0],
        why: "규칙 3 -- 블러/그림자. 깊이는 4방향 베벨과 쌓임 순서로만 (`PixelSurface`)",
      });
    }
  }

  // 타입 격자: Galmuri 얼굴과 크기가 같은 스타일 객체에 있을 때만 본다.
  for (const block of src.matchAll(/\{[^{}]*\}/g)) {
    const body = block[0];
    if (!GALMURI_FACE.test(body)) continue;
    for (const m of body.matchAll(/fontSize:\s*([0-9][0-9.]*)/g)) {
      const size = Number(m[1]);
      if (TYPE_GRID.has(size)) continue;
      hits.push({
        file: rel,
        line: lineOf(src, (block.index ?? 0) + (m.index ?? 0)),
        text: m[0],
        why: "PRD §2-4 -- Galmuri 는 격자 밖 크기에서 흐려진다. 10/12/15/24/30/45 중 하나로",
      });
    }
  }

  // 얼굴이 크기를 나누는가. `m3TextStyle("role")` 스프레드 뒤에 `fontFamily` 를
  // 덮으면 크기는 역할이, 얼굴은 오버라이드가 정하게 되어 둘이 어긋난다.
  // 위의 격자 검사는 **크기만** 보므로 이걸 못 잡는다 -- 크기는 격자 위에
  // 있는데 얼굴이 틀린 경우다. 실제로 core-brain/PolarisDeck 에 7곳 있었다
  // (bodyLarge 15px 에 Galmuri11 -> 1.25배, bodySmall 10px 에 Galmuri11 -> 0.83배).
  for (const block of src.matchAll(/\{[^{}]*\}/g)) {
    const body = block[0];
    const role = /m3TextStyle\("([a-zA-Z]+)"\)/.exec(body);
    const face = /fontFamily:\s*m3\.font\.([a-z]+)/.exec(body);
    if (!role || !face) continue;
    const size = ROLE_SIZE[role[1]];
    const native = FACE_NATIVE_PX[face[1]];
    if (!size || !native || size % native === 0) continue;
    hits.push({
      file: rel,
      line: lineOf(src, (block.index ?? 0) + (face.index ?? 0)),
      text: `${role[1]}(${size}px) <- m3.font.${face[1]}(x1 ${native}px)`,
      why: "PRD §2-4 -- 얼굴이 크기를 나누지 못한다. 오버라이드를 빼거나 역할 크기를 얼굴의 배수로",
    });
  }

  // 본문 역할이 `StyleSheet.create` 안에 얼어붙어 있는가. 그 안은 모듈 로드 때
  // 딱 한 번 평가되므로 저시력 옵션(읽는 글)이 그 화면에만 닿지 않는다 --
  // 네이티브는 값이 비동기로 오기 때문에 **영영** 안 바뀐다.
  // `() => StyleSheet.create({...})` 팩토리는 통과한다: 그건 다시 만들 수 있고,
  // `subscribeFontStyle` 로 갈아끼우라고 그렇게 쓴 것이다.
  for (const frozen of frozenSheetRanges(src)) {
    for (const m of src.slice(frozen[0], frozen[1]).matchAll(/m3TextStyle\("(body[a-zA-Z]+)"\)/g)) {
      hits.push({
        file: rel,
        line: lineOf(src, frozen[0] + (m.index ?? 0)),
        text: m[0],
        why: "저시력 옵션이 닿지 않는다 -- 본문 역할은 얼어붙은 시트 밖에 두거나 `() => StyleSheet.create` 팩토리로",
      });
    }
  }
}

// ── 규칙 1 실행 — 이식 목록이 아니라 `src/` 전체 ─────────────────────────
//
// 목록을 안 쓰는 이유: 이 규칙은 닫혔다. 40개 라우트를 실제로 띄워 DOM 의
// 곡선 원소를 센 결과가 4,852 → 0 이다(2026-08-26). 새 파일이 곡선을 들고
// 들어오는 것을 막는 것이 이 게이트의 일이다.
function walkTsx(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) {
      if (e === "node_modules" || e === "__tests__" || e === "__mocks__") continue;
      walkTsx(full, out);
    } else if (e.endsWith(".tsx") || e.endsWith(".ts")) out.push(full);
  }
  return out;
}

for (const abs of walkTsx(join(ROOT, "src"))) {
  const rel = relative(ROOT, abs).split(sep).join("/");
  const exempt = RULE1_EXEMPT.find((x) => rel.startsWith(x.prefix));
  if (exempt) continue;
  const bare = stripComments(readFileSync(abs, "utf8"));
  for (const m of bare.matchAll(CURVE_EL)) {
    hits.push({
      file: rel,
      line: lineOf(bare, m.index ?? 0),
      text: m[0],
      why:
        "규칙 1 -- 곡선 도형. 아이콘은 `PixelGlyph`, 선은 `pixel-line.ts`(stepLine/stepQuad/ringCells), " +
        "별은 `PixelStarSvg` 를 쓸 것. 화면 실측으로 0 건이 된 규칙이라 래칫이 아니라 무관용이다",
    });
  }
  // 별칭으로 감싼 곡선 도형도 같이 본다(위 `curveAliasPattern` 주석 참조).
  const aliasRe = curveAliasPattern(bare);
  if (aliasRe) {
    for (const m of bare.matchAll(aliasRe)) {
      hits.push({
        file: rel,
        line: lineOf(bare, m.index ?? 0),
        text: m[0],
        why:
          "규칙 1 -- 곡선 도형. 아이콘은 `PixelGlyph`, 선은 `pixel-line.ts`(stepLine/stepQuad/ringCells), " +
          "별은 `PixelStarSvg` 를 쓸 것. 화면 실측으로 0 건이 된 규칙이라 래칫이 아니라 무관용이다",
      });
    }
  }
}

// ── 승격 (2026-08-27): 규칙 2·3·5 가 `src/` 전체를 본다 ────────────────────
//
// 전에는 `MIGRATED` 114개 안에서만 봤다. 그래서 **목록 밖에 새 위반이 생기면
// 아무 일도 안 일어났고**, PASS 가 "규칙이 지켜진다"를 뜻하지 않았다.
//
// ⚠ 그런데 목록을 걷고 세어보니 **342건**이었다. 브리프가 말한 "구멍 3건"이
//   아니다. 전부 무관용으로 걸면 아무도 머지를 못 하므로 **래칫**으로 건다:
//   지금 수를 기준선으로 박고 **늘어나면 실패**한다. 목록의 구멍은 닫히고,
//   기존 빚은 줄여 나갈 때마다 기준선을 내린다.
//
// ⚠ 기준선을 **올리지 말 것.** 올려야 한다면 그건 규칙을 되돌린 것이다.
//   줄었을 때만 내린다(줄인 PR 이 같이 내린다).
const RATCHET_BASELINE = 246;

// 래칫이 통과해도 **남은 빚이 어디 있는지** 볼 수 있어야 한다. 수만 보면 고칠 곳을
// 모른다(채점기 D·E·B 축도 이름을 붙이고 나서야 고칠 것이 드러났다).
//
//     PIXEL_RULES_LIST=1 npx tsx scripts/check-pixel-rules.ts
//
// 기본은 조용하다 — CI 로그를 300줄 넘게 채우지 않기 위해서다.
if (process.env.PIXEL_RULES_LIST === "1") {
  const byFile = new Map<string, number>();
  for (const h of hits.filter((x) => !x.why.startsWith("규칙 1"))) {
    byFile.set(h.file, (byFile.get(h.file) ?? 0) + 1);
  }
  const ranked = [...byFile.entries()].sort((a, b) => b[1] - a[1]);
  console.log(`\n규칙 2·3·4·5 남은 빚: ${hits.filter((x) => !x.why.startsWith("규칙 1")).length}건 · 파일 ${ranked.length}개`);
  for (const [file, n] of ranked) console.log(`  ${String(n).padStart(4)}  ${file}`);
  const byRule = new Map<string, number>();
  for (const h of hits.filter((x) => !x.why.startsWith("규칙 1"))) {
    const key = h.why.slice(0, 5);
    byRule.set(key, (byRule.get(key) ?? 0) + 1);
  }
  console.log("\n규칙별:");
  for (const [rule, n] of [...byRule.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)}  ${rule}`);
  }
  // 한 파일만 줄 단위로 보고 싶을 때: PIXEL_RULES_FILE=<경로조각>
  const only = process.env.PIXEL_RULES_FILE;
  if (only) {
    console.log(`
${only} 상세:`);
    for (const h of hits.filter((x) => !x.why.startsWith("규칙 1") && x.file.includes(only))) {
      console.log(`  ${h.file}:${h.line}`);
      console.log(`      ${h.why}`);
      console.log(`      ${h.text.trim().slice(0, 110)}`);
    }
  }
  console.log("");
}
const rule1Hits = hits.filter((h) => h.why.startsWith("규칙 1"));
const ratchetHits = hits.filter((h) => !h.why.startsWith("규칙 1"));

if (rule1Hits.length > 0) {
  console.error("PIXEL-CLAY RULES FAIL  규칙 1(곡선)은 무관용이다:");
  for (const h of rule1Hits) {
    console.error(`  - ${h.file}:${h.line}  ${h.text}`);
    console.error(`      ${h.why}`);
  }
}

if (ratchetHits.length > RATCHET_BASELINE) {
  const grew = ratchetHits.length - RATCHET_BASELINE;
  console.error(
    `PIXEL-CLAY RULES FAIL  규칙 2·3·4·5 위반이 ${grew}건 늘었다 ` +
      `(기준선 ${RATCHET_BASELINE} -> ${ratchetHits.length}).`,
  );
  console.error("  기존 빚은 그대로 둬도 되지만 **새로 늘리는 것**은 막는다.");
  console.error("  줄인 경우에는 scripts/check-pixel-rules.ts 의 RATCHET_BASELINE 을 같이 내릴 것.");
  for (const h of ratchetHits.slice(0, 40)) {
    console.error(`  - ${h.file}:${h.line}  ${h.text}`);
    console.error(`      ${h.why}`);
  }
  if (ratchetHits.length > 40) console.error(`  ... 그리고 ${ratchetHits.length - 40}건 더`);
}

if (ratchetHits.length < RATCHET_BASELINE) {
  console.error(
    `PIXEL-CLAY RULES FAIL  규칙 2·3·4·5 위반이 ${RATCHET_BASELINE - ratchetHits.length}건 줄었다 ` +
      `(기준선 ${RATCHET_BASELINE} -> ${ratchetHits.length}). 좋은 일이다 — ` +
      `scripts/check-pixel-rules.ts 의 RATCHET_BASELINE 을 ${ratchetHits.length} 로 내리고 다시 올릴 것.`,
  );
  console.error("  내리지 않으면 다음 사람이 그만큼 되돌려도 안 걸린다.");
}

if (rule1Hits.length > 0 || ratchetHits.length !== RATCHET_BASELINE) {
  process.exit(1);
}

console.log(
  `PIXEL-CLAY RULES PASS  규칙 1 곡선 0건(src 전체, 무관용) · 규칙 2·3·4·5 는 src 전체에서 ${RATCHET_BASELINE}건 래칫(늘지도 줄지도 않음) · 이식 목록 ${MIGRATED.length}개`,
);
