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
// 목록에서 일부러 빠져 있는 것 (PR #1286 참조)
// -------------------------------------------
//   · 개념 아트/그래프 -- 별과 노드의 도형은 별자리 은유에 대한 결정이라 따로 간다.
//     Simon 결정 2026-08-21: 사각형이 아니라 **정수 rect 로 만든 4방향 별 모양**.
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
];

// ── 규칙 2 ─────────────────────────────────────────────────────────────
// `borderRadius: 0` 은 통과. 그 밖의 숫자는 전부 위반.
// 값을 뽑아 놓고 **숫자로** 0 인지 본다. "0 이 아닌 숫자" 를 정규식 lookahead 로
// 표현하려는 시도는 두 번 다 틀렸다 -- `(?!0\b)` 도 `(?!0)` 도 `borderRadius: 0.5`
// 를 통과시킨다(0 뒤가 단어경계라 lookahead 가 걸린다). 게다가 그 `\b` 는 셸을
// 거치면서 실제 백스페이스 바이트로 망가지기까지 했다. 산술은 둘 다 안 겪는다.
const LITERAL_RADIUS = /borderRadius:\s*([0-9][0-9.]*)/g;
// 반경 토큰 세트가 **세 벌**이다. 셋 다 봐야 한다.
//
//   radius.*          `src/theme/tokens.ts`      sm 9 / md 13 / lg 18 / pill 999
//   deepSpaceRadii.*  `src/lib/theme/tokens.ts`  sm 9 / md 13 / lg 18 / pill 999
//   m3.shape.*        `src/lib/theme/m3.ts`      전부 0  ← 통과하는 것
//
// ⚠ **2026-08-21: 이 검사에 `deepSpaceRadii` 가 빠져 있어서 가드가 거짓말을 했다.**
// 이름이 `Radii` 라 `radius\.` 정규식에 안 걸렸고, 그래서 **PASS 라고 보고한 파일
// 안에 둥근 모서리가 64곳** 있었다. 딥스페이스 전용 토큰인데도 값이 레거시와
// 똑같이 9/13/18/999 라서, 이름만 보고 "딥스페이스 것이니 괜찮겠지" 하면 틀린다.
//
// 교훈: 가드가 PASS 를 뱉는다고 규칙이 지켜지는 게 아니다. **무엇을 안 보는지**를
// 세어봐야 안다. 새 토큰 세트가 생기면 여기에 추가할 것.
const LEGACY_TOKEN = /(?<![A-Za-z0-9_.])(?:radius|deepSpaceRadii)\.[A-Za-z0-9"'[\]]+/g;

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

  for (const m of src.matchAll(LITERAL_RADIUS)) {
    if (Number(m[1]) === 0) continue;
    hits.push({
      file: rel,
      line: lineOf(src, m.index ?? 0),
      text: m[0],
      why: "규칙 2 -- 리터럴 둥근 모서리. `m3.shape.*` 를 쓸 것 (전부 0 이고 테스트가 지킨다)",
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
