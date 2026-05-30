import { ECR_ITEMS, scoreEcr, type EcrResponses } from "../attachment";

describe("ECR_ITEMS shape", () => {
  test("12 items total", () => {
    expect(ECR_ITEMS).toHaveLength(12);
  });

  test("6 anxiety + 6 avoidance items", () => {
    const anx = ECR_ITEMS.filter((i) => i.dimension === "anxiety");
    const avo = ECR_ITEMS.filter((i) => i.dimension === "avoidance");
    expect(anx).toHaveLength(6);
    expect(avo).toHaveLength(6);
  });

  test("all anxiety items are positive-keyed", () => {
    for (const i of ECR_ITEMS.filter((x) => x.dimension === "anxiety")) {
      expect(i.reverse).toBe(false);
    }
  });

  test("avoidance has 4 reverse-keyed items per Wei et al. 2007", () => {
    const reverses = ECR_ITEMS.filter((x) => x.dimension === "avoidance" && x.reverse);
    expect(reverses).toHaveLength(4);
  });

  test("each item has a friendly subtitle in both locales", () => {
    for (const item of ECR_ITEMS) {
      expect(item.subtitleEn.length).toBeGreaterThan(10);
      expect(item.subtitleKo.length).toBeGreaterThan(5);
    }
  });
});

describe("scoreEcr", () => {
  test("empty → both dims 0, incomplete, no style", () => {
    const r = scoreEcr({});
    expect(r).toEqual({ anxiety: 0, avoidance: 0, style: null, answered: 0, complete: false });
  });

  test("all 1s → low anxiety (1), low avoidance after reverse-coding", () => {
    const responses: EcrResponses = {};
    for (const i of ECR_ITEMS) responses[i.id] = 1;
    const r = scoreEcr(responses);
    expect(r.complete).toBe(true);
    // Anxiety raw 1 (positive-keyed) → mean 1.
    expect(r.anxiety).toBeCloseTo(1);
    // Avoidance: 4 reverse-keyed (raw 1 → 7) + 2 positive-keyed (raw 1).
    // Mean = (7*4 + 1*2) / 6 = 30/6 = 5
    expect(r.avoidance).toBeCloseTo(5);
    // 1 anx + 5 avo → low anx + high avo → dismissing
    expect(r.style).toBe("dismissing");
  });

  test("all 7s → high anxiety, low avoidance after reverse-coding → preoccupied", () => {
    const responses: EcrResponses = {};
    for (const i of ECR_ITEMS) responses[i.id] = 7;
    const r = scoreEcr(responses);
    expect(r.anxiety).toBeCloseTo(7);
    // 4 reverse-keyed (raw 7 → 1) + 2 positive (raw 7). Mean = (1*4 + 7*2)/6 = 18/6 = 3
    expect(r.avoidance).toBeCloseTo(3);
    expect(r.style).toBe("preoccupied");
  });

  test("all 4s → midpoint anxiety and avoidance → secure (no high)", () => {
    const responses: EcrResponses = {};
    for (const i of ECR_ITEMS) responses[i.id] = 4;
    const r = scoreEcr(responses);
    expect(r.anxiety).toBe(4);
    expect(r.avoidance).toBe(4);
    expect(r.style).toBe("secure");
  });

  test("high anxiety AND high avoidance → fearful", () => {
    // Anxiety items high (7), avoidance reverse-keyed low (raw 7 → 1)... wait
    // we want both high anxiety AND high avoidance. To get high avoidance with
    // 4 reverse + 2 positive items: set reverse-keyed to raw 1 (→ 7) and
    // positive to raw 7. That maximizes both. Anxiety items raw 7.
    const responses: EcrResponses = {};
    for (const item of ECR_ITEMS) {
      if (item.dimension === "anxiety") responses[item.id] = 7;
      else if (item.reverse) responses[item.id] = 1; // reverse → effective 7
      else responses[item.id] = 7;
    }
    const r = scoreEcr(responses);
    expect(r.anxiety).toBeCloseTo(7);
    expect(r.avoidance).toBeCloseTo(7);
    expect(r.style).toBe("fearful");
  });

  test("partial answers → no style assigned", () => {
    const r = scoreEcr({ 1: 7, 2: 7 });
    expect(r.complete).toBe(false);
    expect(r.style).toBeNull();
  });

  test("ignores out-of-range responses", () => {
    const r = scoreEcr({ 1: 0 as unknown as number, 2: 8 as unknown as number, 3: NaN as unknown as number });
    expect(r.answered).toBe(0);
  });
});
