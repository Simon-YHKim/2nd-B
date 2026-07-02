import {
  RADAR_TRAIT_KEYS,
  RADAR_TRAIT_LABEL,
  radarAxisPoints,
  radarPoint,
  radarPolygonPoints,
} from "../trait-radar-geometry";

describe("trait radar geometry (P3a 북극성 deck)", () => {
  test("five Big Five axes with labels in both locales", () => {
    expect(RADAR_TRAIT_KEYS).toHaveLength(5);
    for (const locale of ["en", "ko"] as const) {
      for (const key of RADAR_TRAIT_KEYS) {
        expect(RADAR_TRAIT_LABEL[locale][key].length).toBeGreaterThan(0);
      }
    }
    expect(RADAR_TRAIT_LABEL.ko.openness).toBe("개방성");
  });

  test("first axis points straight up from center (12 o'clock)", () => {
    const p = radarPoint(0, 5, 1, 100, 100, 80);
    expect(p.x).toBeCloseTo(100);
    expect(p.y).toBeCloseTo(20);
  });

  test("value 0 collapses to the center; out-of-range values clamp", () => {
    const zero = radarPoint(2, 5, 0, 100, 100, 80);
    expect(zero.x).toBeCloseTo(100);
    expect(zero.y).toBeCloseTo(100);
    const over = radarPoint(0, 5, 1.7, 100, 100, 80);
    expect(over.y).toBeCloseTo(20); // clamped to 1
    const nan = radarPoint(0, 5, Number.NaN, 100, 100, 80);
    expect(nan.y).toBeCloseTo(100); // NaN -> 0 (center), never NaN output
  });

  test("polygon string has one x,y pair per value and no NaN", () => {
    const pts = radarPolygonPoints([0.5, 0.7, 0.2, 0.9, 0.4], 110, 110, 90);
    const pairs = pts.split(" ");
    expect(pairs).toHaveLength(5);
    for (const pair of pairs) {
      expect(pair).toMatch(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/);
    }
  });

  test("axis endpoints sit on the full radius", () => {
    const axes = radarAxisPoints(5, 0, 0, 100);
    expect(axes).toHaveLength(5);
    for (const a of axes) {
      expect(Math.hypot(a.x, a.y)).toBeCloseTo(100, 0);
    }
  });
});
