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
 * DEPRECATED — use bumpChatUsageIfUnderCap. Kept for backward compat with
 * tests that exercise the old path; new code paths must go through the
 * cap-aware RPC to close the TOCTOU race (codex challenge R2).
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

export class ChatLimitExceededError extends Error {
  readonly code = "chat_limit_exceeded";
  constructor() {
    super("chat_limit_exceeded");
    this.name = "ChatLimitExceededError";
  }
}

/**
 * Atomic check-and-bump. The RPC inserts a new row (count=1) or increments
 * the existing one — but only if the existing count is < cap. If the cap is
 * already reached the RPC raises 'chat_limit_exceeded', which we surface as
 * a typed ChatLimitExceededError so the caller can branch without a string
 * compare.
 *
 * This closes the TOCTOU race where parallel callers all read `used` at
 * 249, all pass the client-side cap check, all bump, and the counter ends
 * up at 349 with 100 LLM calls billed.
 */
export async function bumpChatUsageIfUnderCap(
  userId: string,
  cap: number,
  day: string = kstDateToday(),
): Promise<number> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("bump_chat_usage_if_under_cap", {
    p_user_id: userId,
    p_day: day,
    p_cap: cap,
  });
  if (error) {
    // Postgres raises chat_limit_exceeded with SQLSTATE P0001. Supabase's
    // PostgREST surfaces it via error.message containing the raised text.
    if (typeof error.message === "string" && error.message.includes("chat_limit_exceeded")) {
      throw new ChatLimitExceededError();
    }
    throw error;
  }
  // The RPC returns the new integer count on success. Guard the cast: if the
  // response is ever malformed (null/non-number), fail closed by throwing so the
  // caller shows a retry instead of silently treating it as 0 used (which would
  // hand out a fresh quota and let the daily cap be bypassed).
  if (typeof data !== "number") throw new Error("invalid_chat_usage_response");
  return data;
}
