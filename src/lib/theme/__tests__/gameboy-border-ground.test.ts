// 테두리를 **그 자리의 바탕 위에** 합성하는 규율이 유지되는가.
//
// `gameboy.border` 는 `rgba(70,182,255,0.68)` 이고 **밝기가 다른 여러 표면**에
// 그려진다. 그래서 한 바탕으로 **전역 합성하면 안 된다** — 실측:
//
//     이 팔레트의 screen(#0A0E1A) 위 합성 → #3380b6 · space700 대비 3.00 (바닥 3.0, 여유 0)
//     알파로 둔 채 space700 위                                        대비 3.51
//
// 대신 `gameboyBorderOn(바탕)` 이 자리마다 그 배경 위에 합성한다. RN 은 테두리를
// 요소 상자 **안쪽**에 그리므로, 그 결과는 지금 렌더와 **픽셀 단위로 같다.**
import { gameboy, gameboyBorderOn } from "@/lib/theme/gameboy-tokens";
import { cosmic, flattenAlpha } from "@/lib/theme/tokens";

describe("gameboyBorderOn", () => {
  test("테두리는 accent 를 0.68 로 깐 것이다 — 그 관계가 깨지면 헬퍼가 다른 색을 낸다", () => {
    // ⚠ `gameboy.border` 는 알파 문자열이고 헬퍼는 `accent` 와 알파에서 색을 만든다.
    //   둘이 어긋나면 **헬퍼가 조용히 다른 색을 낸다.** 여기서 묶는다.
    const [r, g, b, a] = /rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/
      .exec(gameboy.border)!
      .slice(1)
      .map(Number);
    const hex =
      "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
    expect(hex.toLowerCase()).toBe(gameboy.accent.toLowerCase());
    expect(a).toBeCloseTo(0.68, 5);
  });

  test("바탕이 다르면 결과도 달라야 한다 — 전역으로 한 값이 되면 안 된다", () => {
    const onScreen = gameboyBorderOn("#0A0E1A");
    const onSlate = gameboyBorderOn(cosmic.space700);
    expect(onScreen).not.toBe(onSlate);
    expect(onScreen).toMatch(/^#[0-9a-f]{6}$/i);
    expect(onSlate).toMatch(/^#[0-9a-f]{6}$/i);
  });

  test("합성 결과는 그 바탕 위에서 알파와 같다 — 픽셀이 안 바뀐다", () => {
    for (const ground of ["#0A0E1A", cosmic.space700, cosmic.space900]) {
      expect(gameboyBorderOn(ground)).toBe(flattenAlpha(gameboy.accent, 0.68, ground));
    }
  });

  test("공용 표면은 `gameboy.border` 를 직접 쓰지 않는다", () => {
    // ⚠ 이 파일들이 다시 알파 토큰을 직접 쓰면 화면에 정적 반투명이 돌아온다.
    //   `premium/surfaces.tsx` 는 `/esm` 을 비롯한 여러 화면의 카드·버튼을 그린다.
    const src = require("node:fs").readFileSync(
      require("node:path").join(process.cwd(), "src/components/premium/surfaces.tsx"),
      "utf8",
    ) as string;
    const stripped = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    expect(stripped).not.toMatch(/gameboy\.border\b(?!Width|Radius)/);
  });
});
