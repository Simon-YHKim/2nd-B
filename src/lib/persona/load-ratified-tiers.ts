// F8: the standing user-RATIFIED tier per star (evidence_origin='ratify' rows in
// star_tier_history, 0045/0060). propose->ratify is the ONLY durable path to L5, so a
// deterministic rebuild (deriveStarLevels) must never regress a ratified star back to
// its computed level -- that both dropped the ratified L5 from every brightness
// surface AND fired a phantom downward tier-shift nudge. buildPersona + loadStarLevels
// read this and lift each star to max(deterministic, standing-ratified).
//
// Fails OPEN to {} on any error: a read failure simply reverts to the pre-fix
// deterministic behavior and never blocks the persona / brightness path.

import { getSupabaseClient } from "../supabase/client";
import type { LadderLevel } from "./brightness";
import type { StarId } from "./stars";

export async function loadStandingRatifiedTiers(
  userId: string,
): Promise<Partial<Record<StarId, LadderLevel>>> {
  const out: Partial<Record<StarId, LadderLevel>> = {};
  try {
    const { data } = await getSupabaseClient()
      .from("star_tier_history")
      .select("star_id, level, evidence_origin, recorded_at")
      .eq("user_id", userId)
      .eq("evidence_origin", "ratify")
      .order("recorded_at", { ascending: false });
    // Newest-first: the first ratify row seen per star is its STANDING ratified tier
    // (a later re-ratification supersedes an earlier one; rebuild rows are excluded
    // by the evidence_origin filter, so they can't lower it).
    for (const r of (data ?? []) as { star_id: string; level: number }[]) {
      const id = r.star_id as StarId;
      if (out[id] === undefined && Number.isInteger(r.level) && r.level >= 1 && r.level <= 5) {
        out[id] = r.level as LadderLevel;
      }
    }
  } catch {
    // fail open — no standing ratification
  }
  return out;
}
