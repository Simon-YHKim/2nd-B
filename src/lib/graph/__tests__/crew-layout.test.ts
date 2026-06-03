import { crewLayout } from "../crew-layout";

describe("crewLayout", () => {
  test("count 0 → empty", () => {
    expect(crewLayout(0, 390, 844)).toEqual([]);
    expect(crewLayout(-3, 390, 844)).toEqual([]);
  });

  test("returns `count` slots (floored)", () => {
    expect(crewLayout(5, 390, 844)).toHaveLength(5);
    expect(crewLayout(3.9, 390, 844)).toHaveLength(3);
  });

  test("slots sit within the viewport + lower band, size 14..20", () => {
    for (const s of crewLayout(12, 390, 844)) {
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x).toBeLessThanOrEqual(390);
      expect(s.y).toBeGreaterThanOrEqual(Math.round(0.5 * 844));
      expect(s.y).toBeLessThanOrEqual(844);
      expect(s.size).toBeGreaterThanOrEqual(14);
      expect(s.size).toBeLessThanOrEqual(20);
    }
  });

  test("deterministic — same args give same layout", () => {
    expect(crewLayout(6, 390, 844)).toEqual(crewLayout(6, 390, 844));
  });
});
