// MdButton 의 비활성 상태가 **반투명이 아니라 미리 합성한 색**인가.
//
// PIXEL-CLAY 절대 규칙 4(정적 불투명도 금지)의 지점 중 화면에 가장 널리 나타나던 것이
// 이 파일의 `disabled: { opacity: 0.38 }` 한 줄이었다 — 2026-08-27 화면 실측에서
// **네 라우트에 여섯 번**(/plans 3 · /northstar 1 · /capture 1 · /reasoning 1).
// 한 줄이 여섯 건이라 되돌아오면 그만큼 다시 늘어난다.
//
// 렌더 테스트가 이 저장소에서 막혀 있어(RN 0.85 + jest, 업스트림) 소스를 읽는다.
// 붙드는 것은 파일의 모양이 아니라 **계약**이다: 비활성은 알파로 만들지 않는다.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { flattenAlpha } from "@/lib/theme/tokens";
import { m3 } from "@/lib/theme/m3";

const SRC = readFileSync(join(__dirname, "..", "MdButton.tsx"), "utf8");

/** 주석을 걷는다 — 이주 메모에 `opacity` 라는 낱말이 널려 있어 그냥 세면 거짓 양성이 난다. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

describe("MdButton 비활성은 반투명이 아니다", () => {
  const code = stripComments(SRC);

  it("정적 opacity 리터럴이 없다", () => {
    // `opacity: 0.38` 같은 숫자 리터럴. m3.state.pressed 처럼 토큰을 쓰는 것은 별개다.
    const hits = code.match(/\bopacity\s*:\s*(?:0?\.\d+|0|1(?:\.0+)?)\b/g) ?? [];
    expect(hits).toEqual([]);
  });

  it("비활성 색을 미리 합성한 m3 토큰에서 읽는다", () => {
    // ⚠ 합성은 이 파일이 하지 않는다. m3-primitives.test.ts 가 M3 프리미티브의
    //   theme/tokens import 를 막기 때문에 m3.ts 안에서 하고 토큰으로 받는다.
    expect(code).toMatch(/m3\.disabled\./);
    expect(code).toMatch(/DISABLED_CONTAINER/);
    expect(code).toMatch(/DISABLED_FG/);
  });

  it("경계를 지킨다 - theme/tokens 를 직접 import 하지 않는다", () => {
    expect(code).not.toMatch(/from ["']@\/lib\/theme\/tokens/);
  });

  it("비활성 전경도 함께 어두워진다 — 컨테이너만 바꾸면 뜻이 뒤집힌다", () => {
    // 옛 동작에서는 컨테이너의 opacity 가 글자까지 덮었다. 컨테이너만 평탄화하고
    // 글자를 그대로 두면 **비활성이 활성보다 또렷해진다.**
    expect(code).toMatch(/isDisabled\s*\?\s*DISABLED_FG\[variant\]/);
  });

  it("계산된 색이 옛 알파 합성과 같은 픽셀이다", () => {
    // 규칙을 지키면서 화면이 달라지면 그건 이주가 아니라 변경이다.
    // 옛 동작: opacity 0.38 이 합성 결과를 표면 위에 얹었다.
    const ground = m3.color.surface;
    expect(m3.disabled.primary).toBe(flattenAlpha(m3.color.primary, 0.38, ground));
    expect(m3.disabled.onPrimary).toBe(flattenAlpha(m3.color.onPrimary, 0.38, ground));
    expect(m3.disabled.primary).toBe("#293e6a");
    expect(m3.disabled.onPrimary).toBe("#0e1320");
  });

  it("m3.disabled 가 바탕을 표면으로 고정한다", () => {
    // 바탕이 틀리면 알파를 그냥 두는 것보다 나쁘다. m3.ts 가 바탕을 못박고 있어야 한다.
    const m3src = readFileSync(join(__dirname, "..", "..", "..", "lib", "theme", "m3.ts"), "utf8");
    expect(m3src).toMatch(/m3ColorDark\.surface/);
    expect(m3src).toMatch(/DISABLED_ALPHA\s*=\s*0\.38/);
  });
});
