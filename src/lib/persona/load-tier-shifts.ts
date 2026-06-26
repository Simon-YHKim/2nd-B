// D9 reader (memo §10): load a user's star_tier_history (0045) and return the
// stars whose tendency has shifted (via detectTierShift) - the surface a re-check
// nudge reads. Thin supabase read + the pure detector. Returns [] on error so a
// read failure never blocks the caller.

import { getSupabaseClient } from "../supabase/client";
import { detectTierShift, type TierObservation, type TierShift } from "./tier-history";

export async function loadTierShifts(userId: string): Promise<TierShift[]> {
  try {
    const { data } = await getSupabaseClient()
      .from("star_tier_history")
      .select("star_id, level, recorded_at, evidence_origin, evidence_citations")
      .eq("user_id", userId)
      .order("recorded_at", { ascending: true });
    const rows = (data ?? []) as TierObservation[];
    return detectTierShift(rows);
  } catch {
    return [];
  }
}
