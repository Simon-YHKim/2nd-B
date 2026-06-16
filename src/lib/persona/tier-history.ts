// D9 trend detection (memo §10: "경향성이 바뀌면 점검"). Reads star_tier_history
// rows (0045) and finds stars whose most recent ladder tier differs from the
// prior one - each shift is a candidate for a propose / re-check nudge. Pure;
// the supabase read + the nudge wiring live elsewhere.

import type { LadderLevel } from "./brightness";
import type { StarId } from "./stars";

// One persisted observation (matches the star_tier_history columns).
export interface TierObservation {
  star_id: StarId;
  level: LadderLevel;
  recorded_at: string; // ISO timestamp; ISO strings sort chronologically
}

export interface TierShift {
  starId: StarId;
  from: LadderLevel;
  to: LadderLevel;
  direction: "up" | "down";
}

export function detectTierShift(observations: readonly TierObservation[]): TierShift[] {
  const byStar = new Map<StarId, TierObservation[]>();
  for (const o of observations) {
    const arr = byStar.get(o.star_id) ?? [];
    arr.push(o);
    byStar.set(o.star_id, arr);
  }
  const shifts: TierShift[] = [];
  for (const [starId, obs] of byStar) {
    if (obs.length < 2) continue;
    const sorted = [...obs].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
    const to = sorted[sorted.length - 1]!.level;
    const from = sorted[sorted.length - 2]!.level;
    if (to !== from) shifts.push({ starId, from, to, direction: to > from ? "up" : "down" });
  }
  return shifts;
}
