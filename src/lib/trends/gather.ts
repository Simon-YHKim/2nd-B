// Impure gather for /trends. Reads the last two weeks of the user's own records
// (tags + created_at) and feeds the pure ranker. Best-effort: any read failure
// degrades to [] so the screen always renders its empty/error states. No LLM.

import { getSupabaseClient } from "../supabase/client";
import { rankRisingInterests, type RisingInterest } from "./rising";

const LOOKBACK_DAYS = 14;

export async function gatherRisingInterests(
  userId: string,
  now: Date = new Date(),
): Promise<RisingInterest[]> {
  try {
    const since = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await getSupabaseClient()
      .from("records")
      .select("tags, created_at")
      .eq("user_id", userId)
      .gte("created_at", since)
      .order("created_at", { ascending: false });
    const rows = (data ?? []) as Array<{ tags: string[] | null; created_at: string }>;
    return rankRisingInterests(
      rows.map((r) => ({ tags: r.tags ?? [], created_at: r.created_at })),
      now,
    );
  } catch {
    return [];
  }
}
