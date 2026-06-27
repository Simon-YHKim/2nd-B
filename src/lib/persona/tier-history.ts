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
  // Evidence link (0060), null on legacy / rebuild rows. Carried through so a
  // shift can cite the record(s) that moved it.
  evidence_origin?: string | null;
  evidence_citations?: string[] | null;
}

export interface TierShift {
  starId: StarId;
  from: LadderLevel;
  to: LadderLevel;
  direction: "up" | "down";
  // Evidence behind the latest (to) observation, when present — the record ids /
  // source slugs and how the change was produced ("ratify" | …). Lets a re-check
  // nudge say WHY the tendency reading moved, not just that it did.
  citations?: string[];
  origin?: string;
}

/**
 * Format the D9 re-check nudge sentence for shifted stars, surfacing the
 * evidence count (0060) when the shifts are backed by cited records — so the
 * nudge says not just THAT a tendency moved but that there are N real records
 * behind it (the value 0045+0060 persist). Pure; `nameOf` resolves a star id to
 * its localized display name, keeping this free of UI constants. One aggregate
 * evidence fact, not per-item clutter (information-density rule). Returns null
 * when there is nothing to nudge.
 */
export function tierShiftNudge(
  shifts: readonly TierShift[],
  locale: "en" | "ko",
  nameOf: (starId: StarId, locale: "en" | "ko") => string,
): string | null {
  if (shifts.length === 0) return null;
  const segs = shifts
    .map((s) => `${nameOf(s.starId, locale)} ${s.direction === "up" ? "↑" : "↓"}`)
    .join(", ");
  const cited = shifts.reduce((n, s) => n + (s.citations?.length ?? 0), 0);
  if (locale === "ko") {
    const evid = cited > 0 ? ` · 근거 ${cited}개` : "";
    return `최근 변화 감지: ${segs}${evid} - 점검해볼까요?`;
  }
  const evid = cited > 0 ? ` · ${cited} cited` : "";
  return `Recent shift: ${segs}${evid} - want to re-check?`;
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
    const toObs = sorted[sorted.length - 1]!;
    const to = toObs.level;
    const from = sorted[sorted.length - 2]!.level;
    if (to === from) continue;
    const shift: TierShift = { starId, from, to, direction: to > from ? "up" : "down" };
    if (toObs.evidence_citations && toObs.evidence_citations.length > 0)
      shift.citations = [...toObs.evidence_citations];
    if (toObs.evidence_origin) shift.origin = toObs.evidence_origin;
    shifts.push(shift);
  }
  return shifts;
}
