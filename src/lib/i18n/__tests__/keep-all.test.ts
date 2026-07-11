import { keepAllKo } from "../keep-all";

const WJ = "⁠";

describe("keepAllKo", () => {
  test("joins the characters of a Hangul word so it cannot break mid-word", () => {
    expect(keepAllKo("엮어요")).toBe(["엮", "어", "요"].join(WJ));
  });

  test("keeps spaces as the only break opportunities", () => {
    const out = keepAllKo("별로 엮어요");
    expect(out.split(" ")).toHaveLength(2);
    expect(out).toContain(WJ);
  });

  test("leaves pure Latin and numbers untouched", () => {
    expect(keepAllKo("hello world 123")).toBe("hello world 123");
  });

  test("skips non-Hangul words inside a mixed sentence", () => {
    const out = keepAllKo("이건 keep-all 처리예요");
    const words = out.split(" ");
    expect(words[1]).toBe("keep-all");
    expect(words[0]).toContain(WJ);
    expect(words[2]).toContain(WJ);
  });

  test("preserves whitespace runs and newlines verbatim", () => {
    expect(keepAllKo("가나  다라\n마바").replace(new RegExp(WJ, "g"), "")).toBe("가나  다라\n마바");
  });

  test("keeps surrogate pairs intact inside a joined word", () => {
    const out = keepAllKo("별\u{1F31F}빛");
    expect([...out.replace(new RegExp(WJ, "g"), "")]).toEqual(["별", "\u{1F31F}", "빛"]);
  });
});
