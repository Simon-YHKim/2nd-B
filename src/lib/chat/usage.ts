// Reads + atomic-bump for chat_usage. RLS scopes everything to auth.uid().

import { getSupabaseClient } from "../supabase/client";
import { kstDateToday } from "./limits";

export async function readChatUsage(userId: string, day: string = kstDateToday()): Promise<number> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("chat_usage")
    .select("count")
    .eq("user_id", userId)
    .eq("day", day)
    .maybeSingle();
  if (error) throw error;
  return data?.count ?? 0;
}

/**
 * Atomically bump today's chat_usage row. Uses the bump_chat_usage RPC so the
 * row is inserted-or-incremented in a single SQL statement (no client-side
 * race window between read and write). Returns the new count.
 */
export async function bumpChatUsage(userId: string, day: string = kstDateToday()): Promise<number> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("bump_chat_usage", {
    p_user_id: userId,
    p_day: day,
  });
  if (error) throw error;
  return data as number;
}
