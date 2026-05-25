import { scoreTipi, TIPI_ITEMS, type TipiResponses } from "../tipi";

describe("TIPI_ITEMS", () => {
  test("has 10 items", () => {
    expect(TIPI_ITEMS).toHaveLength(10);
  });

  test("each Big Five trait has exactly 2 items", () => {
    const counts = new Map<string, number>();
    for (const item of TIPI_ITEMS) {
      counts.set(item.trait, (counts.get(item.trait) ?? 0) + 1);
    }
    for (const trait of ["extraversion", "agreeableness", "conscientiousness", "emotional_stability", "openness"] as const) {
      expect(counts.get(trait)).toBe(2);
    }
  });

  test("each trait has one positive-keyed and one reverse-keyed item", () => {
    const positives = new Map<string, number>();
    const reverses = new Map<string, number>();
    for (const item of TIPI_ITEMS) {
      if (item.reverse) reverses.set(item.trait, (reverses.get(item.trait) ?? 0) + 1);
      else positives.set(item.trait, (positives.get(item.trait) ?? 0) + 1);
    }
    for (const trait of ["extraversion", "agreeableness", "conscientiousness", "emotional_stability", "openness"] as const) {
      expect(positives.get(trait)).toBe(1);
      expect(reverses.get(trait)).toBe(1);
    }
  });
});

describe("scoreTipi", () => {
  test("empty responses → all zeros, incomplete", () => {
    const r = scoreTipi({});
    expect(r.answered).toBe(0);
    expect(r.complete).toBe(false);
    for (const s of r.scores) expect(s.score).toBe(0);
  });

  test("partial responses count only answered items", () => {
    const r = scoreTipi({ 1: 5 });
    expect(r.answered).toBe(1);
    expect(r.complete).toBe(false);
  });

  test("complete responses with all 4s → all trait scores 4 (after reverse-coding)", () => {
    const responses: TipiResponses = {};
    for (const item of TIPI_ITEMS) responses[item.id] = 4;
    const r = scoreTipi(responses);
    expect(r.complete).toBe(true);
    expect(r.answered).toBe(10);
    for (const s of r.scores) expect(s.score).toBeCloseTo(4, 2);
  });

  test("reverse-keyed item: raw 1 → effective 7 after reverse", () => {
    // Item 2 is reverse-keyed (agreeableness).
    // If user answers item 2 = 1, the agreeableness positive item (#7) we
    // pair with raw 7 → both contribute 7 → trait score 7.
    const r = scoreTipi({ 2: 1, 7: 7 });
    expect(r.byTrait.agreeableness).toBe(7);
  });

  test("positive-keyed item: raw 7 → effective 7", () => {
    // Item 1 (extraversion+) raw 7 + item 6 (extraversion-) raw 1 → both 7.
    const r = scoreTipi({ 1: 7, 6: 1 });
    expect(r.byTrait.extraversion).toBe(7);
  });

  test("ignores invalid responses (NaN, out-of-range, non-numeric)", () => {
    const r = scoreTipi({ 1: 0 as unknown as number, 2: 8 as unknown as number, 3: NaN as unknown as number });
    expect(r.answered).toBe(0);
  });

  test("answering only one item of a trait pair: trait score = that one value (no halving)", () => {
    // Item 1 positive-keyed; raw 6 → effective 6. Item 6 unanswered.
    // Mean of one value should still be 6 (not 3).
    const r = scoreTipi({ 1: 6 });
    expect(r.byTrait.extraversion).toBeCloseTo(6, 2);
  });

  test("byTrait keys cover all 5 traits", () => {
    const r = scoreTipi({});
    expect(Object.keys(r.byTrait).sort()).toEqual([
      "agreeableness",
      "conscientiousness",
      "emotional_stability",
      "extraversion",
      "openness",
    ]);
  });
});
