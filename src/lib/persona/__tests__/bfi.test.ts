import { BFI_ITEMS, scoreBfi, type BfiResponses } from "../bfi";

describe("BFI_ITEMS shape", () => {
  test("44 items total", () => {
    expect(BFI_ITEMS).toHaveLength(44);
  });

  test("trait distribution matches BFI-44 spec", () => {
    const counts: Record<string, number> = {};
    for (const item of BFI_ITEMS) counts[item.trait] = (counts[item.trait] ?? 0) + 1;
    // John, Donahue, & Kentle (1991): E=8, A=9, C=9, N=8, O=10
    expect(counts).toEqual({
      extraversion: 8,
      agreeableness: 9,
      conscientiousness: 9,
      neuroticism: 8,
      openness: 10,
    });
  });

  test("each item has a friendly subtitle in both locales", () => {
    for (const item of BFI_ITEMS) {
      expect(item.subtitleEn.length).toBeGreaterThan(10);
      expect(item.subtitleKo.length).toBeGreaterThan(5);
    }
  });

  test("ids are 1..44 with no gaps", () => {
    const ids = BFI_ITEMS.map((i) => i.id).sort((a, b) => a - b);
    expect(ids).toEqual(Array.from({ length: 44 }, (_, i) => i + 1));
  });
});

describe("scoreBfi", () => {
  test("empty responses → all zero, not complete", () => {
    const r = scoreBfi({});
    expect(r.complete).toBe(false);
    expect(r.answered).toBe(0);
    expect(r.byTrait.extraversion).toBe(0);
  });

  test("all 3 (neutral) → all traits land at 3.0", () => {
    const responses: BfiResponses = {};
    for (const item of BFI_ITEMS) responses[item.id] = 3;
    const r = scoreBfi(responses);
    expect(r.complete).toBe(true);
    expect(r.answered).toBe(44);
    expect(r.byTrait.extraversion).toBeCloseTo(3, 5);
    expect(r.byTrait.neuroticism).toBeCloseTo(3, 5);
    expect(r.byTrait.openness).toBeCloseTo(3, 5);
  });

  test("reverse-coded items are inverted correctly (6 - v)", () => {
    // Pick item 6: "Is reserved." — extraversion, reverse=true.
    // Answering 5 (strongly agree) should score as 1 toward extraversion.
    const reverseItem = BFI_ITEMS.find((i) => i.reverse && i.trait === "extraversion");
    expect(reverseItem).toBeDefined();
    const responses: BfiResponses = {};
    for (const item of BFI_ITEMS) responses[item.id] = 3;
    responses[reverseItem!.id] = 5;
    const r = scoreBfi(responses);
    // Mean of 7 neutral items (3) + 1 reversed-5 = 8 extraversion items.
    // Effective contribution: 7*3 + (6-5) = 21+1 = 22 / 8 = 2.75
    expect(r.byTrait.extraversion).toBeCloseTo(22 / 8, 5);
  });

  test("invalid raw value (e.g. 0 or 6) is ignored, not throws", () => {
    const responses: BfiResponses = { 1: 0, 2: 6, 3: NaN, 4: 4 };
    const r = scoreBfi(responses);
    expect(r.answered).toBe(1);
  });
});
