import {
  RLSS_ITEMS,
  rlssBand,
  rlssMeanToPercent,
  scoreRlss,
  type RlssResponses,
} from "../rlss";

const ALL = (v: number): RlssResponses =>
  Object.fromEntries(RLSS_ITEMS.map((it) => [it.id, v]));

describe("scoreRlss", () => {
  test("there are exactly 6 items and 3 reverse-keyed (2,4,6)", () => {
    expect(RLSS_ITEMS).toHaveLength(6);
    expect(RLSS_ITEMS.filter((i) => i.reverse).map((i) => i.id)).toEqual([2, 4, 6]);
  });

  test("max satisfaction: agree to positives, disagree to reverse items -> mean 7", () => {
    const r = scoreRlss({ 1: 7, 3: 7, 5: 7, 2: 1, 4: 1, 6: 1 });
    expect(r.mean).toBe(7);
    expect(r.total).toBe(42);
    expect(r.complete).toBe(true);
  });

  test("min satisfaction: disagree to positives, agree to reverse items -> mean 1", () => {
    const r = scoreRlss({ 1: 1, 3: 1, 5: 1, 2: 7, 4: 7, 6: 7 });
    expect(r.mean).toBe(1);
    expect(r.total).toBe(6);
  });

  test("answering 7 to EVERY item is contradictory -> neutral mean 4 (reverse keys cancel)", () => {
    // Proves reverse-coding is applied: 'I like my life' = 7 AND 'I want to change
    // my path' = 7 cannot both be high satisfaction; they net to the midpoint.
    expect(scoreRlss(ALL(7)).mean).toBe(4);
    expect(scoreRlss(ALL(4)).mean).toBe(4); // true neutral
  });

  test("incomplete responses score over what's answered and report complete=false", () => {
    const r = scoreRlss({ 1: 6, 3: 6 });
    expect(r.answered).toBe(2);
    expect(r.complete).toBe(false);
    expect(r.mean).toBe(6); // both positive, no reverse among 1 & 3
  });

  test("out-of-range / non-numeric responses are ignored", () => {
    const r = scoreRlss({ 1: 0, 2: 8, 3: Number.NaN, 5: 5 } as RlssResponses);
    expect(r.answered).toBe(1); // only item 5 (=5) is valid
    expect(r.mean).toBe(5);
  });
});

describe("rlssMeanToPercent", () => {
  test("anchors 1->0, 4->50, 7->100", () => {
    expect(rlssMeanToPercent(1)).toBe(0);
    expect(rlssMeanToPercent(4)).toBe(50);
    expect(rlssMeanToPercent(7)).toBe(100);
  });
  test("clamps out-of-range input", () => {
    expect(rlssMeanToPercent(0)).toBe(0);
    expect(rlssMeanToPercent(9)).toBe(100);
  });
});

describe("rlssBand", () => {
  test("<=3 lower, between mixed, >=5 higher", () => {
    expect(rlssBand(2.5)).toBe("lower");
    expect(rlssBand(3)).toBe("lower");
    expect(rlssBand(4)).toBe("mixed");
    expect(rlssBand(5)).toBe("higher");
    expect(rlssBand(6.5)).toBe("higher");
  });
});
