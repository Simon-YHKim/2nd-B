// check:pixel-radius -- PIXEL-CLAY 절대 규칙 2: `border-radius: 0`, 전 화면 강제.
//
// 왜 파일 목록을 들고 있나 (그리고 왜 그게 래칫인가)
// ------------------------------------------------
// 이 규칙은 결정 시점부터 "전 화면" 이지만 화면 이식은 단계적이다(P5). 그래서
// **이미 옮긴 파일이 되돌아가지 않는 것**을 지키고, 아직 안 옮긴 파일은 건드리지
// 않는다. 목록은 이식이 진행되면서 **늘어나기만 한다.**
//
// 래칫은 이 저장소가 보통 싫어하는 형태다(`check:cycles` 는 무관용이다). 여기서
// 예외인 이유는 규칙이 약해서가 아니라 **작업이 아직 안 끝나서**다. 목록이 전
// 화면을 덮는 날 이 파일은 목록을 버리고 `src/` 전체를 훑으면 된다.
//
// 무엇을 잡나
// ----------
//   1. `borderRadius: <0 아닌 수>`  -- 리터럴 둥근 모서리
//   2. `radius.*`                    -- 레거시 토큰(`src/theme/tokens.ts`). 그 값은
//      여전히 9/13/18/999 다. **일부러 그대로 둔다** -- cosmic-pixel 롤백 스킨이
//      같은 토큰을 쓰기 때문에 0 으로 만들면 그 스킨이 같이 망가진다. 그래서
//      이식된 화면은 그 토큰을 **안 읽는 쪽**으로 옮긴다.
//
// 통과하는 형태는 `m3.shape.*` 다. 그 아홉 값은 전부 0 이고
// `src/lib/theme/__tests__/m3.test.ts` 가 그걸 지킨다. 즉 이 검사는 "0 을 썼나"가
// 아니라 **"0 이라고 보장된 것을 거쳤나"**를 본다. 리터럴 `borderRadius: 0` 도
// 통과시키지만, 토큰을 쓰는 편이 다음 토큰 변경 때 같이 움직인다.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

// 이식 완료 파일. 늘어나기만 한다. 줄이려면 그 화면을 되돌린다는 뜻이므로
// PR 에 이유를 적을 것.
const MIGRATED: readonly string[] = [
  "src/screens/deepspace/dds-styles.ts",
  "src/screens/deepspace/dds-legal-doc-screen.tsx",
  "src/screens/deepspace/dds-wiki-records-screens.tsx",
  "src/screens/deepspace/dds-import-inbox-screens.tsx",
  "src/screens/deepspace/dds-plans-screen.tsx",
  "src/components/deep-space/DeepSpaceViews.tsx",
  "src/screens/deepspace/DeepSpaceHubDockScreen.tsx",
  "src/components/deep-space/DomainStarLens.tsx",
  "src/app/core-brain.tsx",
  "src/screens/deepspace/ops/screens.tsx",
  "src/screens/deepspace/museum/MuseumTimelineScreen.tsx",
  "src/components/deepspace/ops/kit.tsx",
  "src/screens/deepspace/DeepSpaceDesignScreens.tsx",
  "src/components/deep-space/AxisCheck.tsx",
  "src/components/pixel/PixelSurface.tsx",
  "src/components/pixel/PixelDither.tsx",
  "src/components/pixel/PixelPressable.tsx",
];

// `borderRadius: 0` 은 통과. 그 밖의 숫자는 전부 위반.
const LITERAL_RADIUS = /borderRadius:\s*(?!0\b)([0-9][0-9.]*)/g;
// 레거시 토큰 참조. `m3.shape.*` 는 안 걸린다.
const LEGACY_TOKEN = /(?<![A-Za-z0-9_.])radius\.[A-Za-z0-9"'[\]]+/g;

// ── 예외 하나: 기기 목업의 베젤 ────────────────────────────────────────
//
// `radius.phone`(38)은 화면 **안**의 도형이 아니라 화면을 담고 있는 **기기 테두리**다.
// 인수 번들도 정확히 그렇게 갈라놨다 — `app/px-bridge.css:76` 의 라운드 금지는
// `[data-phone-frame] *` 즉 **자손**에만 걸리고, 프레임 요소 자신
// (`[data-phone-frame]`, 83행)에는 안 걸린다.
//
// 규칙 2는 캔버스 안을 다스리지 캔버스 자체를 다스리지 않는다. 실제 폰 모서리는
// 둥글다. 이걸 각지게 만들면 픽셀아트가 아니라 그냥 틀린 그림이 된다.
//
// ⚠ 이름으로만 예외를 준다. 리터럴 38 은 여전히 실패한다 — 예외가 "이 값 근처면
// 봐준다"로 번지지 않게.
const EXEMPT_TOKEN = "radius.phone";

interface Hit {
  file: string;
  line: number;
  text: string;
  why: string;
}

const hits: Hit[] = [];

function lineOf(src: string, index: number): number {
  return src.slice(0, index).split("\n").length;
}

for (const rel of MIGRATED) {
  let src: string;
  try {
    src = readFileSync(join(ROOT, rel), "utf8");
  } catch {
    // 파일이 사라졌으면 목록이 낡은 것이다. 조용히 넘기지 않는다.
    hits.push({ file: rel, line: 0, text: "(파일 없음)", why: "이식 목록에 있는데 파일이 없다" });
    continue;
  }
  for (const m of src.matchAll(LITERAL_RADIUS)) {
    hits.push({
      file: rel,
      line: lineOf(src, m.index ?? 0),
      text: m[0],
      why: "리터럴 둥근 모서리. `m3.shape.*` 를 쓸 것 (전부 0 이고 테스트가 지킨다)",
    });
  }
  for (const m of src.matchAll(LEGACY_TOKEN)) {
    if (m[0] === EXEMPT_TOKEN) continue; // 기기 베젤. 위 주석 참조
    hits.push({
      file: rel,
      line: lineOf(src, m.index ?? 0),
      text: m[0],
      why: "레거시 radius 토큰. 그 값은 아직 9/13/18/999 다 (cosmic-pixel 롤백 스킨이 쓴다)",
    });
  }
}

if (hits.length > 0) {
  console.error(
    "PIXEL-CLAY RADIUS FAIL  이식된 화면에 둥근 모서리가 돌아왔다 (절대 규칙 2: border-radius 0, 전 화면 강제):",
  );
  for (const h of hits) {
    console.error(`  - ${h.file}:${h.line}  ${h.text}`);
    console.error(`      ${h.why}`);
  }
  process.exit(1);
}

console.log(
  `PIXEL-CLAY RADIUS PASS  이식된 ${MIGRATED.length}개 파일에 둥근 모서리 0건 (규칙 2)`,
);
