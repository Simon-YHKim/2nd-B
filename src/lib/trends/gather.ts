// Impure gather for the trends surface. Reads the last two weeks of the user's own
// records (tags + created_at) and feeds the pure ranker. No LLM.
//
// This used to swallow every failure into `[]`, with a comment claiming that let "the
// screen render its empty/error states". It could not: `[]` IS the empty state, so a
// dropped connection was indistinguishable from "you have no rising interests yet" --
// the screen said the user had captured nothing when in fact we simply could not look.
// That is the same quiet lie as the fabricated deltas this feeds, one layer down.
//
// So it throws now. Callers must tell "we could not read" apart from "there is nothing
// to show". supabase-js does not throw on a query error, it returns { error } -- which
// is exactly how the old catch block managed to never fire.

import { getSupabaseClient } from "../supabase/client";
import { rankRisingInterests, type RisingInterest } from "./rising";

const LOOKBACK_DAYS = 14;

/** @throws on a read failure. An empty array means "read fine, nothing rising". */
export async function gatherRisingInterests(
  userId: string,
  now: Date = new Date(),
): Promise<RisingInterest[]> {
  const since = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await getSupabaseClient()
    .from("records")
    .select("tags, created_at")
    .eq("user_id", userId)
    .gte("created_at", since)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as Array<{ tags: string[] | null; created_at: string }>;
  return rankRisingInterests(
    rows.map((r) => ({ tags: r.tags ?? [], created_at: r.created_at })),
    now,
  );
}
