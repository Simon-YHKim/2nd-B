import { composeFourWBody, EMPTY_FOURW, FOURW_KEYS, fourWHasContent } from "../fourw";

describe("4W1H capture composition (P4a)", () => {
  test("five boxes in canonical order", () => {
    expect([...FOURW_KEYS]).toEqual(["who", "when", "where", "what", "how"]);
  });

  test("what is the one required box", () => {
    expect(fourWHasContent(EMPTY_FOURW)).toBe(false);
    expect(fourWHasContent({ ...EMPTY_FOURW, who: "팀장" })).toBe(false);
    expect(fourWHasContent({ ...EMPTY_FOURW, what: "회의" })).toBe(true);
    expect(fourWHasContent({ ...EMPTY_FOURW, what: "   " })).toBe(false);
  });

  test("composes only filled boxes, labeled per locale, 4W1H order", () => {
    const fields = { ...EMPTY_FOURW, what: "장비 점검", who: "나", how: "체크리스트로" };
    expect(composeFourWBody(fields, "ko")).toBe("누가: 나\n무엇을: 장비 점검\n어떻게: 체크리스트로");
    expect(composeFourWBody(fields, "en")).toBe("Who: 나\nWhat: 장비 점검\nHow: 체크리스트로");
  });

  test("trims values and returns empty string for an empty form", () => {
    expect(composeFourWBody(EMPTY_FOURW, "ko")).toBe("");
    expect(composeFourWBody({ ...EMPTY_FOURW, when: "  어제  " }, "ko")).toBe("언제: 어제");
  });
});
