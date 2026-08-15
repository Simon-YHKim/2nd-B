import {
  careerYearOf,
  groupCareerTimeline,
  type CareerRecordRow,
} from "../career-timeline";

const row = (over: Partial<CareerRecordRow>): CareerRecordRow => ({
  id: "r",
  kind: "note",
  topic: null,
  body: null,
  tags: [],
  created_at: "2026-07-01T00:00:00Z",
  ...over,
});

describe("career CV timeline (P4d)", () => {
  test("explicit year tag wins over created_at", () => {
    expect(careerYearOf(row({ tags: ["domain:career", "year:2019"] }))).toBe("2019");
    expect(careerYearOf(row({ tags: ["domain:career"] }))).toBe("2026");
    expect(careerYearOf(row({ tags: ["year:20x9"] }))).toBe("2026");
  });

  test("fallback year uses the KST year, not the raw UTC year, at a Jan 1 boundary", () => {
    // 2025-12-31T23:00:00Z == 2026-01-01 08:00 KST → the record belongs to 2026,
    // matching the app-wide KST day convention. Raw UTC slice would file it under 2025.
    expect(careerYearOf(row({ tags: ["domain:career"], created_at: "2025-12-31T23:00:00Z" }))).toBe("2026");
  });

  test("groups newest year first, items newest first", () => {
    const groups = groupCareerTimeline([
      row({ id: "a", tags: ["year:2020"] }),
      row({ id: "b", created_at: "2024-03-01T00:00:00Z" }),
      row({ id: "c", tags: ["year:2020"], created_at: "2020-06-01T00:00:00Z" }),
      row({ id: "d", created_at: "2024-09-01T00:00:00Z" }),
    ]);
    expect(groups.map((g) => g.year)).toEqual(["2024", "2020"]);
    expect(groups[0].items.map((i) => i.id)).toEqual(["d", "b"]);
    expect(groups[1].items.map((i) => i.id)).toEqual(["a", "c"]);
  });

  test("empty input yields no groups", () => {
    expect(groupCareerTimeline([])).toEqual([]);
  });
});
