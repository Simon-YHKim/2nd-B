import { getSupabaseClient } from "../supabase/client";

/** Metadata-only check for an unavailable AI selection. Never return held text. */
export async function hasAiHeldRows(
  userId: string,
  table: "records" | "sources",
  ids: readonly string[],
): Promise<boolean> {
  if (ids.length === 0) return false;
  const { data, error } = await getSupabaseClient().from(table)
    .select("id").eq("user_id", userId).in("id", [...ids]).eq("ai_hold", true).limit(1);
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/** Read the current AI projection, never a screen's cached record body. A
 * missing view or failed read must not fall back to the unfiltered table. */
export async function getAiRecord(userId: string, recordId: string) {
  const { data, error } = await getSupabaseClient()
    .from("records_ai_eligible")
    .select("id, topic, summary, body, ai_followup")
    .eq("user_id", userId)
    .eq("id", recordId)
    .maybeSingle();
  if (error) throw error;
  return data as {
    id: string; topic: string | null; summary: string | null;
    body: string; ai_followup: unknown;
  } | null;
}

/** Old search RPCs can return held rows until the server draft is installed.
 * Intersect their IDs with the current view before exposing any match. */
export async function aiEligibleMatchIds(
  userId: string,
  table: "records_ai_eligible" | "wiki_pages_ai_eligible",
  ids: readonly string[],
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const { data, error } = await getSupabaseClient().from(table)
    .select("id").eq("user_id", userId).in("id", [...ids]);
  if (error) throw error;
  return new Set((data ?? []).map((row: { id: string }) => row.id));
}
