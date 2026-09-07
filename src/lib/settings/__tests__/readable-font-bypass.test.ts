// 읽기 쉬운 글꼴(Pretendard)을 **스타일에 직접 박아** <Text> 를 우회하는 자리를 센다.
//
// 정책(Simon 2026-08-21 질문 2 = "본문만"): `readable` 은 **옵션**이다. 켜면 읽는 글만
// Pretendard 가 되고 크롬은 Galmuri 로 남는다. 그 판단은 한 곳에서만 한다 -
// `src/components/m3/typeface.ts` 가 `getFontStyle() === "readable"` 과 읽기 역할을
// 함께 보고 정한다(`src/components/ui/Text.tsx` 도 같은 규칙).
//
// 그런데 화면이 StyleSheet 에 `fontFamily: fontFamilies.readable` 을 직접 쓰면 그 판단을
// 건너뛴다: **옵션과 무관하게 항상 Pretendard** 다. 픽셀 정체성이 거기서 빠진다.
// 2026-09-06 실측 116 곳을 역할로 나눠 보면 한 덩어리가 아니다:
//   · 읽는 글 34 - 옵션을 따라야 맞다. m3TextStyle("body*") 로 옮기면 저시력 옵션이
//     그때부터 실제로 동작한다(지금은 옵션과 무관하게 항상 Pretendard).
//   · 제목·크롬 50 - Galmuri 로 가야 한다. 크기를 격자로 스냅해야 하므로 시각 변경이다.
//   · 입력 5 - **의도된 것**. 사용자가 직접 쳐 넣는 긴 글이라 벡터 얼굴이 맞다
//     (Input.tsx base · premium/surfaces.tsx input · capture.tsx textarea ·
//     DeepSpaceHubDockScreen inputText). **고치지 말 것.**
//   · 나머지 27 - 눈으로 봐야 판정된다. 특히 ConstellationHome 의 별 이름은
//     fontSize: 10.5 * k 로 뷰포트에 따라 연속 스케일한다 - 비트맵 얼굴로 옮기려면
//     "스케일을 버리고 계단으로 간다"가 먼저다. 코드 실수가 아니라 설계 결정이다.
// 그래서 한 번에 못 옮긴다. 목록을 박아두고 화면 단위로 줄인다.
//
// **이 표는 줄어들기만 한다.** 파일이 새로 늘거나 어떤 파일의 수가 커지면 검사가 깨진다.
// 화면을 옮겨 수가 줄었다면 이 표를 같이 줄여라(그게 진행 상황의 유일한 기록이다).

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

const SRC = resolve(__dirname, "../../..");
const NEEDLE = "fontFamily: fontFamilies.readable";

/** 정책을 **구현하는** 파일. 여기서만 조건부로 쓰는 것이 맞다. */
const IMPLEMENTATION = "src/components/m3/typeface.ts";

/** 남은 우회 자리. 늘리지 말 것. 화면을 옮기면 여기서 지운다. */
const BASELINE: Readonly<Record<string, number>> = {
  "src/app/capture.tsx": 1, // 긴 글 입력 textarea - 읽고 쓰는 글이라 마지막에 옮긴다
  "src/app/notices.tsx": 6,
  "src/app/reasoning.tsx": 13,
  "src/app/secondb.tsx": 23,
  "src/app/trinity.tsx": 1,
  "src/components/deep-space/ConstellationHome.tsx": 4,
  "src/components/deep-space/DeepSpaceViews.tsx": 50,
  "src/components/deepspace/ShareCard.tsx": 4,
  "src/components/graph/NavGraph.tsx": 5,
  "src/components/premium/surfaces.tsx": 1,
  "src/components/ui/Input.tsx": 1,
  "src/screens/deepspace/DeepSpaceHubDockScreen.tsx": 1,
};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== "__tests__") walk(p, out);
    } else if (/\.tsx?$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

const files = walk(SRC);
const counts: Record<string, number> = {};
for (const p of files) {
  const rel = `src/${relative(SRC, p).split(sep).join("/")}`;
  if (rel === IMPLEMENTATION) continue;
  const n = readFileSync(p, "utf8").split(NEEDLE).length - 1;
  if (n > 0) counts[rel] = n;
}

describe("읽기 글꼴 우회는 줄어들기만 한다", () => {
  test("가드가 진짜 트리를 걷는다", () => {
    expect(files.length).toBeGreaterThan(300);
    expect(readFileSync(resolve(SRC, "components/m3/typeface.ts"), "utf8")).toContain(NEEDLE);
  });

  test("새 파일이 목록에 추가되지 않았다", () => {
    expect(Object.keys(counts).sort()).toEqual(Object.keys(BASELINE).sort());
  });

  test("어느 파일도 기준치보다 늘지 않았다", () => {
    for (const [file, max] of Object.entries(BASELINE)) {
      const now = counts[file] ?? 0;
      expect({ file, now, max, grew: now > max }).toEqual({ file, now, max, grew: false });
    }
  });

  test("옮긴 화면은 목록에서 빠졌다: esm.tsx 는 시스템 폰트를 덮지 않는다", () => {
    const esm = readFileSync(resolve(SRC, "app/esm.tsx"), "utf8");
    expect(esm).not.toContain("typography.fontFamily");
    expect(esm).not.toContain(NEEDLE);
  });

  test("옮긴 화면은 목록에서 빠졌다: AutoReasoningIntroSheet 는 캐논 역할을 쓴다", () => {
    const sheet = readFileSync(resolve(SRC, "components/deep-space/AutoReasoningIntroSheet.tsx"), "utf8");
    expect(sheet).not.toContain(NEEDLE);
    expect(sheet).toContain('...m3TextStyle("titleLarge")');
    // 읽는 글 역할은 **렌더 때** 붙는다 - 얼어붙은 시트 안에서 부르면 저시력 옵션이 박제된다.
    expect(sheet).toContain('style={[styles.line, m3TextStyle("bodyMedium")]}');
    expect(sheet).not.toMatch(/line: \{[^}]*m3TextStyle/s);
  });

  test("capture 의 크롬 라벨은 격자 얼굴로 간다", () => {
    const cap = readFileSync(resolve(SRC, "app/capture.tsx"), "utf8");
    expect(cap).not.toContain("CAPTURE_LABEL_FONT");
    expect(cap).toMatch(/const capFont = \(grid: number, weight: "500" \| "700"\)/);
    // 크롬 라벨 여섯 자리 전부 굵기를 합성하지 않는다.
    for (const style of ["trackChipText", "trackChipTextActive", "modeLabel", "modeLabelActive", "modeMoreLabel", "tossBtnText"]) {
      const line = cap.split("\n").find((l) => l.trim().startsWith(`${style}:`)) ?? "";
      expect({ style, hasCapWeight: line.includes("capWeight(") }).toEqual({ style, hasCapWeight: true });
      expect({ style, rawWeight: /fontWeight: "\d00"/.test(line) }).toEqual({ style, rawWeight: false });
    }
  });
});
