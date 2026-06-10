import { computeInsights, sourceToInsightRecord, type InsightRecord, type InsightSource } from "../insights";

function rec(over: Partial<InsightRecord>): InsightRecord {
  return {
    id: over.id ?? "r",
    created_at: over.created_at ?? "2026-05-25T00:00:00Z",
    topic: over.topic ?? null,
    conclusion: over.conclusion ?? null,
    tags: over.tags ?? [],
    body: over.body ?? "",
  };
}

describe("computeInsights", () => {
  test("empty input → all zeros", () => {
    const r = computeInsights([]);
    expect(r.recordCount).toBe(0);
    expect(r.daySpan).toBe(0);
    expect(r.byWeek).toEqual([]);
    expect(r.topTags).toEqual([]);
    expect(r.topTopics).toEqual([]);
    expect(r.recentConclusions).toEqual([]);
    expect(r.avgBodyChars).toBe(0);
  });

  test("counts records and computes day span", () => {
    const r = computeInsights([
      rec({ id: "1", created_at: "2026-05-20T10:00:00Z" }),
      rec({ id: "2", created_at: "2026-05-25T10:00:00Z" }),
    ]);
    expect(r.recordCount).toBe(2);
    expect(r.daySpan).toBe(6); // inclusive
  });

  test("day span counts inclusive calendar days, not rounded elapsed time", () => {
    // Two records on the SAME calendar day, 13h apart. Rounding the raw ms delta
    // would yield 2; the inclusive calendar span is 1. Fixture times (00:30Z /
    // 13:30Z) stay on 2026-05-20 in both UTC and KST so the test is TZ-stable.
    const r = computeInsights([
      rec({ id: "1", created_at: "2026-05-20T00:30:00Z" }),
      rec({ id: "2", created_at: "2026-05-20T13:30:00Z" }),
    ]);
    expect(r.daySpan).toBe(1);
  });

  test("day span uses KST day boundaries (streak/chat_usage parity), not UTC or device-local", () => {
    // 14:00Z = 23:00 KST May 20; 16:00Z = 01:00 KST May 21 — one UTC calendar
    // day but two KST days. Span must be 2 on every device timezone.
    const r = computeInsights([
      rec({ id: "1", created_at: "2026-05-20T14:00:00Z" }),
      rec({ id: "2", created_at: "2026-05-20T16:00:00Z" }),
    ]);
    expect(r.daySpan).toBe(2);
  });

  test("records crossing UTC midnight inside one KST day stay span 1", () => {
    // 22:00Z May 20 = 07:00 KST May 21; 02:00Z May 21 = 11:00 KST May 21.
    const r = computeInsights([
      rec({ id: "1", created_at: "2026-05-20T22:00:00Z" }),
      rec({ id: "2", created_at: "2026-05-21T02:00:00Z" }),
    ]);
    expect(r.daySpan).toBe(1);
  });

  test("top tags sorted by frequency desc + capped", () => {
    const r = computeInsights(
      [
        rec({ id: "1", tags: ["a", "b"] }),
        rec({ id: "2", tags: ["a"] }),
        rec({ id: "3", tags: ["a", "c"] }),
        rec({ id: "4", tags: ["b"] }),
      ],
      { tagLimit: 2 },
    );
    expect(r.topTags).toEqual([
      { tag: "a", count: 3 },
      { tag: "b", count: 2 },
    ]);
  });

  test("top topics ignores null/empty", () => {
    const r = computeInsights([
      rec({ id: "1", topic: "Career" }),
      rec({ id: "2", topic: "Career" }),
      rec({ id: "3", topic: null }),
      rec({ id: "4", topic: "" }),
      rec({ id: "5", topic: "Family" }),
    ]);
    expect(r.topTopics).toEqual([
      { topic: "Career", count: 2 },
      { topic: "Family", count: 1 },
    ]);
  });

  test("recent conclusions are last-5 non-empty in reverse-chronological order", () => {
    const r = computeInsights([
      rec({ id: "1", created_at: "2026-05-20T10:00:00Z", conclusion: "older insight" }),
      rec({ id: "2", created_at: "2026-05-21T10:00:00Z", conclusion: null }),
      rec({ id: "3", created_at: "2026-05-22T10:00:00Z", conclusion: "" }),
      rec({ id: "4", created_at: "2026-05-23T10:00:00Z", conclusion: "more recent" }),
    ]);
    expect(r.recentConclusions).toHaveLength(2);
    expect(r.recentConclusions[0].conclusion).toBe("more recent");
    expect(r.recentConclusions[1].conclusion).toBe("older insight");
  });

  test("byWeek groups by ISO week, capped to last 8", () => {
    const recs: InsightRecord[] = [];
    // Generate 10 entries one week apart.
    for (let i = 0; i < 10; i++) {
      const d = new Date("2026-01-01T00:00:00Z");
      d.setUTCDate(d.getUTCDate() + i * 7);
      recs.push(rec({ id: `r${i}`, created_at: d.toISOString() }));
    }
    const r = computeInsights(recs);
    expect(r.byWeek).toHaveLength(8);
  });

  test("byWeek fills empty weeks with 0 (continuous trend, no collapsed gaps)", () => {
    const r = computeInsights([
      rec({ id: "1", created_at: "2026-01-05T00:00:00Z" }), // ISO 2026-W02
      rec({ id: "2", created_at: "2026-01-19T00:00:00Z" }), // ISO 2026-W04
    ]);
    // The empty middle week (W03) is filled with 0 instead of disappearing.
    expect(r.byWeek).toHaveLength(3);
    expect(r.byWeek.map((w) => w.count)).toEqual([1, 0, 1]);
  });

  test("avgBodyChars rounds to nearest int", () => {
    const r = computeInsights([
      rec({ id: "1", body: "ab" }), // 2
      rec({ id: "2", body: "abcde" }), // 5
    ]);
    // (2 + 5) / 2 = 3.5 → 4
    expect(r.avgBodyChars).toBe(4);
  });
});

function src(over: Partial<InsightSource>): InsightSource {
  return {
    id: over.id ?? "s",
    captured_at: over.captured_at ?? "2026-05-25T00:00:00Z",
    title: over.title ?? null,
    tags: over.tags ?? [],
  };
}

describe("sourceToInsightRecord", () => {
  test("maps captured_at→created_at, title→topic/body, no conclusion", () => {
    const r = sourceToInsightRecord(src({ id: "s1", captured_at: "2026-05-20T10:00:00Z", title: "A clipped article", tags: ["x"] }));
    expect(r).toEqual({
      id: "s1",
      created_at: "2026-05-20T10:00:00Z",
      topic: "A clipped article",
      conclusion: null,
      tags: ["x"],
      body: "A clipped article",
    });
  });

  test("null/empty title → topic null, body empty; null tags → []", () => {
    expect(sourceToInsightRecord(src({ title: null, tags: null }))).toMatchObject({ topic: null, body: "", tags: [] });
    expect(sourceToInsightRecord(src({ title: "" }))).toMatchObject({ topic: null, body: "" });
  });
});

describe("insights data-truth: sources counted (false-empty gate)", () => {
  test("sources-only user is NOT empty (recordCount reflects sources)", () => {
    const sources = [
      sourceToInsightRecord(src({ id: "s1", captured_at: "2026-05-20T10:00:00Z", title: "Memo", tags: ["a"] })),
      sourceToInsightRecord(src({ id: "s2", captured_at: "2026-05-22T10:00:00Z", title: "Link clip", tags: ["a", "b"] })),
    ];
    const r = computeInsights([...[], ...sources]);
    expect(r.recordCount).toBe(2); // would be 0 (false-empty) before the fix
    expect(r.topTags[0]).toEqual({ tag: "a", count: 2 });
  });

  test("mixed records + sources counts both", () => {
    const records: InsightRecord[] = [rec({ id: "r1", created_at: "2026-05-21T10:00:00Z", topic: "Career" })];
    const sources = [sourceToInsightRecord(src({ id: "s1", captured_at: "2026-05-22T10:00:00Z", title: "Career" }))];
    const r = computeInsights([...records, ...sources]);
    expect(r.recordCount).toBe(2);
    expect(r.topTopics).toContainEqual({ topic: "Career", count: 2 });
  });
});
