// R12 guard: usage_counters.month_bucket carries TWO key formats in one column
// -- weekly reasoning rows ('IYYY-Wnn') and monthly reward rows ('YYYY-MM'). The
// 0089 structural test pins the SQL `to_char` side; this pins the TS side, so a
// regression in weekBucket()/monthBucket() can't silently drift from the SQL and
// split a user's counter into two never-matching rows (the exact hazard the
// synthesis flagged). Pure functions, no DB -- deterministic on fixed instants.

import { monthBucket, weekBucket } from "../usage";

describe("usage bucket formats (must match 0089 SQL to_char)", () => {
  test("monthBucket is zero-padded KST 'YYYY-MM'", () => {
    expect(monthBucket(new Date("2026-07-26T00:00:00Z"))).toBe("2026-07");
    // single-digit month is zero-padded (matches to_char 'YYYY-MM')
    expect(monthBucket(new Date("2026-03-15T00:00:00Z"))).toBe("2026-03");
    expect(monthBucket(new Date("2026-07-26T09:00:00Z"))).toMatch(/^\d{4}-\d{2}$/);
  });

  test("monthBucket rolls at the KST month boundary, not UTC", () => {
    // 2026-07-31T20:00Z is still July in UTC but 2026-08-01T05:00 in KST (+9h).
    expect(monthBucket(new Date("2026-07-31T20:00:00Z"))).toBe("2026-08");
  });

  test("weekBucket is KST ISO week 'IYYY-Wnn' with a zero-padded week", () => {
    expect(weekBucket(new Date("2026-07-26T00:00:00Z"))).toMatch(/^\d{4}-W\d{2}$/);
  });

  test("weekBucket uses the ISO week-YEAR (may differ from the calendar year)", () => {
    // 2026-01-01 (KST) is a Thursday, so it is ISO week 1 of 2026.
    expect(weekBucket(new Date("2026-01-01T00:00:00Z"))).toBe("2026-W01");
    // 2025-12-31 (KST) is the Wednesday of that same ISO week -> its week-year is
    // 2026, NOT 2025. This is the classic boundary that a naive getFullYear()
    // implementation gets wrong and that would split the counter.
    expect(weekBucket(new Date("2025-12-31T00:00:00Z"))).toBe("2026-W01");
  });

  test("the two formats can never collide in the shared month_bucket column", () => {
    const anyInstant = new Date("2026-07-26T00:00:00Z");
    const w = weekBucket(anyInstant);
    const m = monthBucket(anyInstant);
    expect(w).toContain("-W"); // week rows always carry the W marker
    expect(m).not.toContain("W"); // month rows never do
    expect(w).not.toBe(m);
  });
});
