// 합성 FX 토큰의 **바탕이 어긋나지 않는가**.
//
// `tokens.ts` 의 `edgeDefault`·`panelBg`·`panelBorder`·`coreGlow`·`mintGlow` 는
// 원래 `rgba(...)` 리터럴이었다. **토큰 정의 자체가 알파를 들고 있어서** 이걸 쓰는
// 화면이 전부 반투명을 그렸다(`/esm` 의 카드 바탕이 `panelBg` 였고, 그 화면의
// A축이 18/30 이었다). PIXEL-CLAY 규칙 4 에 맞춰 미리 합성했다.
//
// ⚠ 합성에 쓴 바탕 `FX_GROUND` 는 `cosmic.space950` 과 **같은 값이어야 한다.**
//   객체를 정의하는 중이라 자기 자신을 못 가리켜서 리터럴로 두었고, 그래서
//   **어긋나도 아무 오류가 안 난다** — 조용히 틀린 색이 나올 뿐이다. 여기서 묶는다.
//
// ⚠ 값을 손으로 계산해 박지 않는다. 그러면 이 검사는 "내가 적은 숫자가 내가 적은
//   숫자와 같다" 를 확인하게 된다. `flattenAlpha` 를 실제로 돌려서 댄다.
import { cosmic, flattenAlpha } from "@/lib/theme/tokens";

/** 원래 리터럴이 담고 있던 (색, 알파). 합성 결과가 아니라 **재료**다. */
const FX_SOURCES: readonly { key: keyof typeof cosmic; hex: string; alpha: number }[] = [
  { key: "edgeDefault", hex: "#8D98B8", alpha: 0.28 },
  { key: "panelBg", hex: "#0D1530", alpha: 0.9 },
  { key: "panelBorder", hex: "#8D98B8", alpha: 0.34 },
  { key: "coreGlow", hex: "#A78BFA", alpha: 0.42 },
  { key: "mintGlow", hex: "#72F2C7", alpha: 0.34 },
];

describe("합성 FX 토큰", () => {
  test("바탕은 가장 깊은 배경(space950)이다", () => {
    for (const { key, hex, alpha } of FX_SOURCES) {
      expect(cosmic[key]).toBe(flattenAlpha(hex, alpha, cosmic.space950));
    }
  });

  test("불투명하다 — 알파가 남아 있으면 안 된다", () => {
    for (const { key } of FX_SOURCES) {
      const v = cosmic[key];
      expect(typeof v).toBe("string");
      expect(v).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  test("재료 색은 팔레트에 실재한다 — 오타로 엉뚱한 색을 합성하지 않게", () => {
    const palette = new Set(
      Object.values(cosmic).filter((v): v is string => typeof v === "string").map((v) => v.toUpperCase()),
    );
    for (const { hex } of FX_SOURCES) {
      expect(palette.has(hex.toUpperCase())).toBe(true);
    }
  });
});
