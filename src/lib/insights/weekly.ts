// Pure week-over-week insight summary for the deep-space /insights screen.
// PURE: no DB calls, no I/O, no LLM. It takes already-fetched record rows
// (each with a created_at ISO string) and computes this-week vs last-week
// counts plus a delta percent. The screen fetches the rows (via the same
// listRecentRecords client other deep-space screens use) and feeds them here.
//
// "This week"  = the trailing `windowDays` window ending at `now`.
// "Last week"  = the window immediately before that.
// Both windows have equal length, so the comparison is apples-to-apples.

export interface InsightRecordRow {
  created_at: string; // ISO timestamp
}

export interface WeeklyInsightSummary {
  thisWeek: number;
  lastWeek: number;
  /** Rounded percent change last → this. 0 when last week had no records. */
  deltaPct: number;
  /** "up" when this > last, "down" when this < last, "flat" when equal. */
  direction: "up" | "down" | "flat";
  /** True only when there is no prior-week data to compare against. */
  isFirstWeek: boolean;
}

/**
 * Summarize week-over-week record counts. Pure: pass already-fetched rows.
 * @param records rows with an ISO `created_at`
 * @param now reference "end" of the current window (default: real now)
 * @param windowDays length of each comparison window (default: 7)
 */
export function summarizeWeeklyInsights(
  records: ReadonlyArray<InsightRecordRow>,
  now: Date = new Date(),
  windowDays = 7,
): WeeklyInsightSummary {
  const dayMs = 24 * 60 * 60 * 1000;
  const nowMs = now.getTime();
  const thisStart = nowMs - windowDays * dayMs;
  const lastStart = nowMs - 2 * windowDays * dayMs;

  let thisWeek = 0;
  let lastWeek = 0;

  for (const r of records) {
    const t = Date.parse(r?.created_at ?? "");
    if (!Number.isFinite(t)) continue;
    if (t > thisStart && t <= nowMs) {
      thisWeek += 1;
    } else if (t > lastStart && t <= thisStart) {
      lastWeek += 1;
    }
  }

  // No prior-week activity at all → treat as the user's first week.
  const isFirstWeek = lastWeek === 0;

  let deltaPct = 0;
  if (lastWeek > 0) {
    deltaPct = Math.round(((thisWeek - lastWeek) / lastWeek) * 100);
  }

  const direction: WeeklyInsightSummary["direction"] =
    thisWeek > lastWeek ? "up" : thisWeek < lastWeek ? "down" : "flat";

  return { thisWeek, lastWeek, deltaPct, direction, isFirstWeek };
}
