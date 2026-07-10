import fs from "node:fs";
import path from "node:path";

import { summarizeWeeklyInsights, weeklyDomainFocus, type InsightRecordRow } from "../weekly";

const NOW = new Date("2026-06-21T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

describe("summarizeWeeklyInsights", () => {
  test("counts this-week vs last-week and computes a positive delta", () => {
    const rows: InsightRecordRow[] = [
      { created_at: daysAgo(1) }, // this week
      { created_at: daysAgo(2) }, // this week
      { created_at: daysAgo(6) }, // this week (boundary inside)
      { created_at: daysAgo(8) }, // last week
      { created_at: daysAgo(13) }, // last week
    ];
    const out = summarizeWeeklyInsights(rows, NOW);
    expect(out.thisWeek).toBe(3);
    expect(out.lastWeek).toBe(2);
    expect(out.deltaPct).toBe(50);
    expect(out.direction).toBe("up");
    expect(out.isFirstWeek).toBe(false);
  });

  test("flags first week when there is no prior-week data", () => {
    const rows: InsightRecordRow[] = [
      { created_at: daysAgo(1) },
      { created_at: daysAgo(3) },
    ];
    const out = summarizeWeeklyInsights(rows, NOW);
    expect(out.thisWeek).toBe(2);
    expect(out.lastWeek).toBe(0);
    expect(out.deltaPct).toBe(0); // no division-by-zero
    expect(out.isFirstWeek).toBe(true);
  });

  test("reports a downward direction and negative delta", () => {
    const rows: InsightRecordRow[] = [
      { created_at: daysAgo(2) }, // this week: 1
      { created_at: daysAgo(8) }, // last week: 2
      { created_at: daysAgo(10) },
    ];
    const out = summarizeWeeklyInsights(rows, NOW);
    expect(out.thisWeek).toBe(1);
    expect(out.lastWeek).toBe(2);
    expect(out.deltaPct).toBe(-50);
    expect(out.direction).toBe("down");
    expect(out.isFirstWeek).toBe(false);
  });

  test("ignores rows with unparseable timestamps and out-of-window rows", () => {
    const rows: InsightRecordRow[] = [
      { created_at: "not-a-date" },
      { created_at: daysAgo(1) }, // this week
      { created_at: daysAgo(30) }, // far outside both windows
    ];
    const out = summarizeWeeklyInsights(rows, NOW);
    expect(out.thisWeek).toBe(1);
    expect(out.lastWeek).toBe(0);
  });
});

describe("weeklyDomainFocus", () => {
  test("claims a majority only when one domain holds more than half the week", () => {
    const rows: InsightRecordRow[] = [
      { created_at: daysAgo(1), tags: ["domain:career"] },
      { created_at: daysAgo(2), tags: ["domain:career"] },
      { created_at: daysAgo(3), tags: ["domain:career"] },
      { created_at: daysAgo(4), tags: ["domain:health"] },
      { created_at: daysAgo(5), tags: ["domain:relation"] },
    ];
    expect(weeklyDomainFocus(rows, NOW)).toEqual({ kind: "majority", domain: "career", percent: 60, total: 5 });
  });

  test("exactly half is not a majority", () => {
    const rows: InsightRecordRow[] = [
      { created_at: daysAgo(1), tags: ["domain:career"] },
      { created_at: daysAgo(2), tags: ["domain:career"] },
      { created_at: daysAgo(3), tags: ["domain:health"] },
      { created_at: daysAgo(4), tags: ["domain:relation"] },
    ];
    expect(weeklyDomainFocus(rows, NOW)).toEqual({ kind: "spread", total: 4 });
  });

  test("a tie for the top domain is spread, never a majority", () => {
    const rows: InsightRecordRow[] = [
      { created_at: daysAgo(1), tags: ["domain:career"] },
      { created_at: daysAgo(2), tags: ["domain:health"] },
    ];
    expect(weeklyDomainFocus(rows, NOW)).toEqual({ kind: "spread", total: 2 });
  });

  test("last week's records never count toward this week's focus", () => {
    const rows: InsightRecordRow[] = [
      { created_at: daysAgo(1), tags: ["domain:career"] },
      { created_at: daysAgo(9), tags: ["domain:health"] },
      { created_at: daysAgo(10), tags: ["domain:health"] },
    ];
    expect(weeklyDomainFocus(rows, NOW)).toEqual({ kind: "majority", domain: "career", percent: 100, total: 1 });
  });

  test("an empty week says so rather than guessing", () => {
    expect(weeklyDomainFocus([], NOW)).toEqual({ kind: "empty" });
    expect(weeklyDomainFocus([{ created_at: daysAgo(30), tags: ["domain:career"] }], NOW)).toEqual({ kind: "empty" });
  });

  test("untagged records fall back to the collect star, not to a guess", () => {
    const rows: InsightRecordRow[] = [
      { created_at: daysAgo(1) },
      { created_at: daysAgo(2), tags: [] },
      { created_at: daysAgo(3), tags: ["mood:good"] },
      { created_at: daysAgo(4), tags: ["domain:career"] },
    ];
    expect(weeklyDomainFocus(rows, NOW)).toEqual({ kind: "majority", domain: "collect", percent: 75, total: 4 });
  });

  test("an unknown domain slug does not invent a star", () => {
    const rows: InsightRecordRow[] = [{ created_at: daysAgo(1), tags: ["domain:bogus"] }];
    expect(weeklyDomainFocus(rows, NOW)).toEqual({ kind: "majority", domain: "collect", percent: 100, total: 1 });
  });

  test("ignores unparseable timestamps", () => {
    const rows: InsightRecordRow[] = [
      { created_at: "not-a-date", tags: ["domain:health"] },
      { created_at: daysAgo(1), tags: ["domain:career"] },
    ];
    expect(weeklyDomainFocus(rows, NOW)).toEqual({ kind: "majority", domain: "career", percent: 100, total: 1 });
  });
});

// The /insights finding card interpolates a domain name from the `home` bundle
// (t("home:ds.home.domainName.<id>")). A missing label there would render the raw key
// on screen, and check-i18n only compares locales against each other, not against the
// DomainId union.
describe("every domain star has a label in every shipped locale", () => {
  const DOMAIN_IDS = ["career", "finance", "growth", "relation", "health", "recreation", "collect"];

  test.each(["ko", "en", "es", "pt", "id"])("%s", (locale) => {
    const home = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, `../../../../locales/${locale}/home.json`), "utf8"),
    );
    const labels = home.ds.home.domainName;
    for (const id of DOMAIN_IDS) expect(typeof labels[id]).toBe("string");
    expect(Object.keys(labels).sort()).toEqual([...DOMAIN_IDS].sort());
  });
});
