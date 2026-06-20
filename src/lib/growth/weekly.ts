// Weekly growth synthesis ("나의 변화"). PURE — no new engine: it reads what the
// app already records (star_tier_history brightness, ops_routine_logs completions,
// milestones, records count) and synthesizes a this-week vs last-week summary.
// The 7 stars keep their existing constellation meaning; only brightness change
// is expressed. No LLM, no I/O here (the gather lives in gather.ts).

import { SELF_UNDERSTANDING_STARS, type StarId } from "../persona/stars";
import { localDayKey, weekStreak } from "../ops/routines";

/** Structurally compatible with persona/tier-history TierObservation. */
export interface StarObservation {
  star_id: string;
  level: number;
  recorded_at: string; // ISO
}

export interface StarChange {
  id: StarId;
  index: number;
  nameKo: string;
  nameEn: string;
  before: number;
  after: number;
  delta: number;
}

export interface WeeklyMetrics {
  records: number;
  streak: number;
  /** distinct completed days in the window, as a 0..100 percent of the window. */
  completionRate: number;
  milestoneDelta: number;
}

export interface WeeklyGrowth {
  /** false on the very first week (no prior data to compare) → empty state. */
  hasPriorWeek: boolean;
  topStar: StarChange | null;
  stars: StarChange[];
  metrics: WeeklyMetrics;
}

export interface WeeklyGrowthInput {
  history: ReadonlyArray<StarObservation>;
  completions: ReadonlyArray<{ completed_on: string }>;
  recordsCount: number;
  milestonesDoneThisWeek: number;
  now?: Date;
  windowDays?: number;
}

function weekStartIso(now: Date, windowDays: number): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() - windowDays);
  return d.toISOString();
}

/** Latest level among observations matching `pred`, or 1 (L1) when none. */
function latestLevel(obs: ReadonlyArray<StarObservation>, starId: string, pred: (o: StarObservation) => boolean): number {
  let bestAt = "";
  let level = 1;
  for (const o of obs) {
    if (o.star_id !== starId || !pred(o)) continue;
    if (o.recorded_at > bestAt) {
      bestAt = o.recorded_at;
      level = clampLevel(o.level);
    }
  }
  return level;
}

function clampLevel(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(5, Math.round(n)));
}

/** Pure: synthesize the weekly growth summary. */
export function buildWeeklyGrowth(input: WeeklyGrowthInput): WeeklyGrowth {
  const now = input.now ?? new Date();
  const windowDays = input.windowDays ?? 7;
  const cutoff = weekStartIso(now, windowDays);

  const hasPriorWeek = input.history.some((o) => o.recorded_at < cutoff);

  const stars: StarChange[] = SELF_UNDERSTANDING_STARS.map((s) => {
    const after = latestLevel(input.history, s.id, () => true);
    const before = latestLevel(input.history, s.id, (o) => o.recorded_at < cutoff);
    return { id: s.id, index: s.index, nameKo: s.nameKo, nameEn: s.nameEn, before, after, delta: after - before };
  });

  let topStar: StarChange | null = null;
  if (hasPriorWeek) {
    topStar = stars.reduce((best, s) => {
      if (!best) return s;
      if (s.delta !== best.delta) return s.delta > best.delta ? s : best;
      return s.after > best.after ? s : best;
    }, null as StarChange | null);
  }

  // distinct completed days within the window
  const windowKeys = new Set<string>();
  const cur = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (let i = 0; i < windowDays; i++) {
    windowKeys.add(localDayKey(cur));
    cur.setDate(cur.getDate() - 1);
  }
  const doneDays = new Set(input.completions.map((c) => c.completed_on).filter((d) => windowKeys.has(d)));
  const completionRate = Math.round((doneDays.size / windowDays) * 100);

  return {
    hasPriorWeek,
    topStar,
    stars,
    metrics: {
      records: Math.max(0, Math.round(input.recordsCount)),
      streak: weekStreak(input.completions, now),
      completionRate,
      milestoneDelta: Math.max(0, Math.round(input.milestonesDoneThisWeek)),
    },
  };
}
