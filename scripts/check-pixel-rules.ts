// check:pixel-rules -- PIXEL-CLAY 절대 규칙 2와 3을 이식된 화면에서 지킨다.
//
//   규칙 2  `border-radius: 0`, 전 화면 강제
//   규칙 3  블러 금지 (그림자 대신 4방향 베벨 + 쌓임 순서)
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

import { readFileSync } from "node:fs";
import { join } from "node:path";

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
const RADIUS_PROP =
  /border(?:Top|Bottom)?(?:Left|Right|Start|End)?Radius\s*:\s*([^,\n}]+)/g;

/** 반경 값으로 허용되는 것: 리터럴 0, `m3.shape.*`, 그리고 기기 베젤 예외. */
function radiusAllowed(raw: string): boolean {
  const v = raw.trim();
  if (v.startsWith("m3.shape.")) return true;
  if (EXEMPT_TOKENS.has(v)) return true;
  const n = Number(v);
  return Number.isFinite(n) && n === 0;
}

// 반경 토큰이 **반경 프로퍼티 밖**에서 쓰이는 경우도 있다(스프레드, 변수 대입).
// 위의 허용 목록은 프로퍼티만 보므로 이 그물을 같이 둔다.
const LEGACY_TOKEN =
  /(?<![A-Za-z0-9_.])(?:radius|radii|deepSpaceRadii)\.[A-Za-z0-9"'[\]]+/g;

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

for (const rel of MIGRATED) {
  let src: string;
  try {
    src = readFileSync(join(ROOT, rel), "utf8");
  } catch {
    hits.push({ file: rel, line: 0, text: "(파일 없음)", why: "이식 목록에 있는데 파일이 없다" });
    continue;
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

if (hits.length > 0) {
  console.error("PIXEL-CLAY RULES FAIL  이식된 화면이 규칙 2·3 또는 타입 격자에서 되돌아갔다:");
  for (const h of hits) {
    console.error(`  - ${h.file}:${h.line}  ${h.text}`);
    console.error(`      ${h.why}`);
  }
  process.exit(1);
}

console.log(
  `PIXEL-CLAY RULES PASS  이식된 ${MIGRATED.length}개 파일에 둥근 모서리 0건 · 블러 0건 · 타입 격자 준수 (규칙 2·3 + PRD §2-4)`,
);
