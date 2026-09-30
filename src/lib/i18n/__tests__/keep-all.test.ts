import { keepAllChildren, keepAllKo, keepMiddleDotOffLineStart } from "../keep-all";

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

  test("is idempotent, so hand-wrapped call sites and PlainText can both apply it", () => {
    const once = keepAllKo("환불 및 청약철회 정책");
    expect(keepAllKo(once)).toBe(once);
  });
});

describe("keepAllKo never splits a grapheme", () => {
  // Built from code points so no invisible character has to sit in this file.
  const cp = (...points: number[]) => String.fromCodePoint(...points);
  const family = cp(0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f467);
  const redHeart = cp(0x2764, 0xfe0f);
  const wave = cp(0x1f44b, 0x1f3fd);
  const flag = cp(0x1f1f0, 0x1f1f7);
  const keycap = cp(0x31, 0xfe0f, 0x20e3);

  test.each([
    ["a family emoji (zero-width joiners)", family],
    ["the emoji form of a heart (variation selector)", redHeart],
    ["a skin tone", wave],
    ["a flag (two regional indicators)", flag],
    ["a keycap", keycap],
  ])("keeps %s whole inside a Hangul word", (_, emoji) => {
    const out = keepAllKo(`고마워${emoji}요`);
    expect(out).toContain(emoji);
    expect(out.split(WJ).join("")).toBe(`고마워${emoji}요`);
  });

  test("still joins the syllables around the emoji", () => {
    expect(keepAllKo(`고마워${redHeart}요`)).toBe(["고", "마", "워", redHeart, "요"].join(WJ));
  });
});

describe("a middle dot never starts a line (W3C klreq 7.1.2, cl-07)", () => {
  const NBSP = String.fromCharCode(0xa0);

  test("the space before a separator dot stops being a break", () => {
    expect(keepMiddleDotOffLineStart("대표: 배소하 · 소재지")).toBe(`대표: 배소하${NBSP}· 소재지`);
    expect(keepMiddleDotOffLineStart("Authentication · Login")).toBe(`Authentication${NBSP}· Login`);
  });

  test("a letter before a dot is joined to it, so the break falls after the dot", () => {
    expect(keepMiddleDotOffLineStart("결제·환불")).toBe(`결제${WJ}·환불`);
  });

  test("inside a joined Korean word the only break left is right after each dot", () => {
    const out = keepAllKo("결제·세금계산서·환불은");
    expect(out.split(WJ).join("")).toBe("결제·세금계산서·환불은");
    expect(out).toContain(`${WJ}·환`);
    expect(out).not.toContain(`·${WJ}`);
    expect(out.split("·")).toEqual([["결", "제"].join(WJ) + WJ, ["세", "금", "계", "산", "서"].join(WJ) + WJ, ["환", "불", "은"].join(WJ)]);
  });

  test("is idempotent and leaves text without a dot or an explicit line break alone", () => {
    const once = keepAllKo("대표: 배소하 · 소재지: 경기도");
    expect(keepAllKo(once)).toBe(once);
    const LF = String.fromCharCode(10);
    expect(keepMiddleDotOffLineStart(`첫 줄${LF}· 둘째 줄`)).toBe(`첫 줄${LF}· 둘째 줄`);
    expect(keepMiddleDotOffLineStart("no dot here")).toBe("no dot here");
  });
});

describe("keepAllChildren", () => {
  test("joins a lone string child", () => {
    expect(keepAllChildren("청약철회")).toBe(keepAllKo("청약철회"));
  });

  test("joins the strings of a children array and keeps elements as they are", () => {
    const element = { type: "Text", props: { children: "링크" } };
    const out = keepAllChildren(["약관에 ", element as never, "동의합니다"]) as unknown[];
    expect(out[0]).toBe(keepAllKo("약관에 "));
    expect(out[1]).toBe(element);
    expect(out[2]).toBe(keepAllKo("동의합니다"));
  });

  test("walks nested arrays and leaves numbers, null and Latin text untouched", () => {
    expect(keepAllChildren([["가나"], 3, null, "abc"])).toEqual([[keepAllKo("가나")], 3, null, "abc"]);
    expect(keepAllChildren("Refund policy")).toBe("Refund policy");
  });
});
