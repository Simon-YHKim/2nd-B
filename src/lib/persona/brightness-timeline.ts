// rev2 P3c/P3d pure layer: the 8-week brightness timeline + the ratification
// log, both derived from star_tier_history observations (0045/0060). Honesty
// framing throughout: brightness == how much is on record, never confidence.
// Pure and tested; the supabase read lives in load-tier-observations.ts.

import type { LadderLevel } from "./brightness";
import type { StarId } from "./stars";
import type { TierObservation } from "./tier-history";

export const TIMELINE_WEEKS = 8;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface StarTimeline {
  starId: StarId;
  /** Level at each week's end (carry-forward); null before the first observation. */
  levels: (LadderLevel | null)[];
}

export interface HonestyMeter {
  /** All persisted observations. */
  observations: number;
  /** Observations carrying at least one evidence citation (0060). */
  cited: number;
  /** Distinct stars with any observation. */
  observedStars: number;
}

export interface BrightnessTimeline {
  /** ISO dates (YYYY-MM-DD), oldest window first; each window spans 7 days. */
  weekStarts: string[];
  /** Only stars that have at least one observation, in first-seen order. */
  stars: StarTimeline[];
  /** 북극성 aggregate per window: mean of known star levels mapped to 0-1; null when nothing known yet. */
  polaris: (number | null)[];
  honesty: HonestyMeter;
}

/** Level (1..5) to the 0..1 brightness used for the polaris aggregate. */
const levelTo01 = (level: LadderLevel): number => (level - 1) / 4;

export function buildBrightnessTimeline(
  observations: readonly TierObservation[],
  now: Date,
  weeks: number = TIMELINE_WEEKS,
): BrightnessTimeline {
  const end = now.getTime();
  const windowEnds: number[] = Array.from({ length: weeks }, (_, i) => end - (weeks - 1 - i) * WEEK_MS);
  const weekStarts = windowEnds.map((t) => new Date(t - WEEK_MS).toISOString().slice(0, 10));

  const byStar = new Map<StarId, TierObservation[]>();
  for (const o of observations) {
    const arr = byStar.get(o.star_id) ?? [];
    arr.push(o);
    byStar.set(o.star_id, arr);
  }

  const stars: StarTimeline[] = [];
  for (const [starId, obs] of byStar) {
    const sorted = [...obs].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
    const levels = windowEnds.map((windowEnd) => {
      let level: LadderLevel | null = null;
      for (const o of sorted) {
        if (new Date(o.recorded_at).getTime() <= windowEnd) level = o.level;
        else break;
      }
      return level;
    });
    stars.push({ starId, levels });
  }

  const polaris = windowEnds.map((_, i) => {
    const known = stars.map((s) => s.levels[i]).filter((l): l is LadderLevel => l !== null);
    if (known.length === 0) return null;
    const mean = known.reduce((sum, l) => sum + levelTo01(l), 0) / known.length;
    return Math.round(mean * 100) / 100;
  });

  const cited = observations.filter((o) => (o.evidence_citations?.length ?? 0) > 0).length;

  return {
    weekStarts,
    stars,
    polaris,
    honesty: { observations: observations.length, cited, observedStars: byStar.size },
  };
}

export interface RatificationEntry {
  starId: StarId;
  level: LadderLevel;
  /** The star's level before this observation; null for its first record. */
  prevLevel: LadderLevel | null;
  recordedAt: string;
  origin: string | null;
  citedCount: number;
}

/** Newest-first ratification log: every persisted observation with its delta. */
export function buildRatificationLog(observations: readonly TierObservation[]): RatificationEntry[] {
  const sorted = [...observations].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
  const lastByStar = new Map<StarId, LadderLevel>();
  const entries: RatificationEntry[] = [];
  for (const o of sorted) {
    entries.push({
      starId: o.star_id,
      level: o.level,
      prevLevel: lastByStar.get(o.star_id) ?? null,
      recordedAt: o.recorded_at,
      origin: o.evidence_origin ?? null,
      citedCount: o.evidence_citations?.length ?? 0,
    });
    lastByStar.set(o.star_id, o.level);
  }
  return entries.reverse();
}
