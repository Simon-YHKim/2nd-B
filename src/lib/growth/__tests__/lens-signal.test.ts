import { lensSummaryLine } from "../lens-signal";

describe("lensSummaryLine (axis1→axis2 trusted fact line)", () => {
  test("names strongest + building lens (EN anchor)", () => {
    const line = lensSummaryLine({ values: 4, rhythm: 1, now: 2 });
    expect(line).toContain("strongest");
    expect(line).toContain("L4");
    expect(line).toContain("building");
    expect(line).toContain("L1");
  });

  test("empty when nothing recorded (all default L1)", () => {
    expect(lensSummaryLine({})).toBe("");
    expect(lensSummaryLine({ now: 1 })).toBe("");
  });

  test("flat-but-lit reads as evenly at level", () => {
    const line = lensSummaryLine({ now: 3, recall: 3, seen: 3, rhythm: 3, relational: 3, possible: 3, values: 3 });
    expect(line).toContain("evenly at L3");
  });

  test("levels clamp to 1..5", () => {
    const line = lensSummaryLine({ values: 9, rhythm: 0 });
    expect(line).toContain("L5");
  });
});
