// 마스코트(세컨비 머리)의 PIXEL-CLAY 이식 범위를 **소스에서 세어** 고정한다.
//
// 2026-09-06: SecondbHead 는 격자 스프라이트로 옮겼는데(secondb-head-pixel 가드),
// 3D PNG 를 직접 require 하는 화면이 네 곳 더 남아 있었다. 완료 보고에서
// "앱 전역"이라고 말하려면 남은 곳이 몇 곳인지 파일 목록으로 고정돼 있어야 한다.
//
// 옮긴 곳: CompletionToast(32) · RewardedSheet(64) → <SecondbHead>.
// 남긴 곳 2 (의도된 예외, Simon 결정 대기):
//   · src/app/index.tsx — 레거시 랜딩 로고. isDeepSpaceUI() 가 그 위에서
//     <DeepSpaceShell/> 로 빠지므로 EXPO_PUBLIC_UI=legacy 에서만 그려진다.
//   · ShareCard.tsx — react-native-view-shot 캡처 대상. SVG 를 캡처에 넣는 것은
//     ANDROID_QA_GUIDELINES(SVG 브릿지) 위험이라 실기 확인 전까지 PNG 로 둔다.
// 이 목록을 늘리려면(= 새 화면이 3D PNG 를 다시 require 하면) 이 가드가 막는다.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

const SRC = resolve(__dirname, "../../..");
const HEAD_REQUIRE = /require\(\s*"[^"]*secondb-head-[a-z]+\.png"\s*\)/;

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
const consumers = files
  .filter((p) => HEAD_REQUIRE.test(readFileSync(p, "utf8")))
  .map((p) => `src/${relative(SRC, p).split(sep).join("/")}`)
  .sort();

describe("세컨비 머리 3D PNG 를 아직 require 하는 화면", () => {
  test("가드가 진짜 트리를 걷는다", () => {
    expect(files.length).toBeGreaterThan(300);
  });

  // 2026-09-08: 둘에서 하나가 됐다. src/app/index.tsx 가 3D PNG 를 `logo` 로
  // require 하던 것은 **레거시 홈(GraphScreen)만** 쓰던 자리였고, 그 반쪽이
  // legacy/screens/index.tsx 로 나가면서 함께 갔다. 배송 홈은 픽셀 머리를 그린다.
  // 줄었다고 이 검사를 지우지 않는다 — 하나 남았고, 그 하나가 다시 늘 수 있다.
  test("남은 곳은 문서화된 한 곳뿐이다", () => {
    expect(consumers).toEqual(["src/components/deepspace/ShareCard.tsx"]);
  });

  test("살아 있는 딥스페이스 표면은 <SecondbHead> 를 쓴다", () => {
    for (const f of ["CompletionToast.tsx", "RewardedSheet.tsx"]) {
      const src = readFileSync(resolve(__dirname, "..", f), "utf8");
      expect({ f, uses: /<SecondbHead\b/.test(src) }).toEqual({ f, uses: true });
      expect({ f, png: HEAD_REQUIRE.test(src) }).toEqual({ f, png: false });
    }
  });
});
