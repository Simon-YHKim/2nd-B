import { detectTierShift, tierShiftNudge, type TierObservation, type TierShift } from "../tier-history";

function obs(star_id: TierObservation["star_id"], level: TierObservation["level"], recorded_at: string): TierObservation {
  return { star_id, level, recorded_at };
}

describe("detectTierShift", () => {
  test("no shift for a single observation or unchanged tier", () => {
    expect(detectTierShift([obs("now", 3, "2026-06-01T00:00:00Z")])).toEqual([]);
    expect(
      detectTierShift([obs("now", 3, "2026-06-01T00:00:00Z"), obs("now", 3, "2026-06-02T00:00:00Z")]),
    ).toEqual([]);
  });

  test("detects an upward shift (latest vs prior)", () => {
    const shifts = detectTierShift([
      obs("now", 3, "2026-06-01T00:00:00Z"),
      obs("now", 4, "2026-06-05T00:00:00Z"),
    ]);
    expect(shifts).toEqual([{ starId: "now", from: 3, to: 4, direction: "up" }]);
  });

  test("detects a downward shift and ignores order of input", () => {
    const shifts = detectTierShift([
      obs("relational", 2, "2026-06-09T00:00:00Z"),
      obs("relational", 4, "2026-06-01T00:00:00Z"),
    ]);
    expect(shifts).toEqual([{ starId: "relational", from: 4, to: 2, direction: "down" }]);
  });

  test("compares only the two most recent observations per star", () => {
    const shifts = detectTierShift([
      obs("now", 1, "2026-06-01T00:00:00Z"),
      obs("now", 5, "2026-06-02T00:00:00Z"),
      obs("now", 5, "2026-06-03T00:00:00Z"), // latest == prior -> no shift
    ]);
    expect(shifts).toEqual([]);
  });

  test("carries the latest observation's evidence (0060) onto the shift", () => {
    const shifts = detectTierShift([
      obs("now", 3, "2026-06-01T00:00:00Z"),
      {
        star_id: "now",
        level: 5,
        recorded_at: "2026-06-05T00:00:00Z",
        evidence_origin: "ratify",
        evidence_citations: ["record:abc", "src:bfi"],
      },
    ]);
    expect(shifts).toEqual([
      {
        starId: "now",
        from: 3,
        to: 5,
        direction: "up",
        origin: "ratify",
        citations: ["record:abc", "src:bfi"],
      },
    ]);
  });

  test("omits evidence keys when the latest observation has none", () => {
    const shifts = detectTierShift([
      obs("now", 3, "2026-06-01T00:00:00Z"),
      obs("now", 4, "2026-06-05T00:00:00Z"),
    ]);
    expect(shifts[0]).not.toHaveProperty("citations");
    expect(shifts[0]).not.toHaveProperty("origin");
  });

  test("reports shifts across multiple stars independently", () => {
    const shifts = detectTierShift([
      obs("now", 2, "2026-06-01T00:00:00Z"),
      obs("now", 3, "2026-06-02T00:00:00Z"),
      obs("values", 4, "2026-06-01T00:00:00Z"),
      obs("values", 2, "2026-06-02T00:00:00Z"),
    ]);
    expect(shifts).toHaveLength(2);
    expect(shifts).toContainEqual({ starId: "now", from: 2, to: 3, direction: "up" });
    expect(shifts).toContainEqual({ starId: "values", from: 4, to: 2, direction: "down" });
  });
});

describe("tierShiftNudge", () => {
  const nameOf = (id: TierShift["starId"], locale: "en" | "ko") =>
    locale === "ko" ? `별-${id}` : `star-${id}`;

  test("returns null when there are no shifts", () => {
    expect(tierShiftNudge([], "ko", nameOf)).toBeNull();
    expect(tierShiftNudge([], "en", nameOf)).toBeNull();
  });

  test("lists shifted stars with direction arrows, no evidence clause when uncited", () => {
    const shifts: TierShift[] = [{ starId: "now", from: 3, to: 4, direction: "up" }];
    expect(tierShiftNudge(shifts, "ko", nameOf)).toBe("최근 변화 감지: 별-now ↑ - 점검해볼까요?");
    expect(tierShiftNudge(shifts, "en", nameOf)).toBe("Recent shift: star-now ↑ - want to re-check?");
  });

  test("surfaces the aggregate evidence count (0060) when shifts are cited", () => {
    const shifts: TierShift[] = [
      { starId: "now", from: 3, to: 5, direction: "up", citations: ["record:a", "record:b"] },
      { starId: "values", from: 4, to: 2, direction: "down", citations: ["record:c"] },
    ];
    expect(tierShiftNudge(shifts, "ko", nameOf)).toBe(
      "최근 변화 감지: 별-now ↑, 별-values ↓ · 근거 3개 - 점검해볼까요?",
    );
    expect(tierShiftNudge(shifts, "en", nameOf)).toBe(
      "Recent shift: star-now ↑, star-values ↓ · 3 cited - want to re-check?",
    );
  });

  test("no em dash in the rendered string (DESIGN.md UI-string rule)", () => {
    const shifts: TierShift[] = [{ starId: "now", from: 1, to: 2, direction: "up", citations: ["record:a"] }];
    for (const locale of ["en", "ko"] as const) {
      expect(tierShiftNudge(shifts, locale, nameOf)).not.toMatch(/[—–]/);
    }
  });
});
