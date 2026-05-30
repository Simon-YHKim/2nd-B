import { starField } from "../star-field";

describe("starField", () => {
  it("returns the requested count", () => {
    expect(starField(390, 844, 60)).toHaveLength(60);
  });

  it("is deterministic for the same box", () => {
    expect(starField(390, 844, 30)).toEqual(starField(390, 844, 30));
  });

  it("keeps every star inside the box", () => {
    for (const s of starField(390, 844, 80)) {
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x).toBeLessThanOrEqual(390);
      expect(s.y).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeLessThanOrEqual(844);
      expect(s.r).toBeGreaterThan(0);
      expect(s.opacity).toBeGreaterThan(0);
      expect(s.opacity).toBeLessThanOrEqual(1);
    }
  });

  it("guards against a zero-size box", () => {
    expect(() => starField(0, 0, 10)).not.toThrow();
    expect(starField(0, 0, 10)).toHaveLength(10);
  });
});
