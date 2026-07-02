// Thin reader for the full star_tier_history stream (0045/0060) — the raw
// input for the brightness timeline + ratification log (P3c/P3d). Same shape
// and failure posture as load-tier-shifts.ts: [] on error, never blocks.

import { getSupabaseClient } from "../supabase/client";
import type { TierObservation } from "./tier-history";

export async function loadTierObservations(userId: string): Promise<TierObservation[]> {
  try {
    const { data } = await getSupabaseClient()
      .from("star_tier_history")
      .select("star_id, level, recorded_at, evidence_origin, evidence_citations")
      .eq("user_id", userId)
      .order("recorded_at", { ascending: true });
    return (data ?? []) as TierObservation[];
  } catch {
    return [];
  }
}
