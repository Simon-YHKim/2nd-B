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

export interface ChatUsageDetail {
  used: number;
  /** Today's rewarded-ad allowance widening (+2 per watch, 0090). */
  adBonus: number;
}

/**
 * Today's usage INCLUDING the rewarded ad bonus (0090). Prefer this over
 * readChatUsage wherever the cap is being checked, so a watched ad is
 * reflected in the allowance the user sees.
 */
export async function readChatUsageDetail(
  userId: string,
  day: string = kstDateToday(),
): Promise<ChatUsageDetail> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("chat_usage")
    .select("count, ad_bonus")
    .eq("user_id", userId)
    .eq("day", day)
    .maybeSingle();
  if (error) throw error;
  return { used: data?.count ?? 0, adBonus: Number(data?.ad_bonus) || 0 };
}

export class ChatRewardCapReachedError extends Error {
  readonly code = "chat_reward_cap_reached";
  constructor() {
    super("chat_reward_cap_reached");
    this.name = "ChatRewardCapReachedError";
  }
}

/**
 * Rewarded watch completed -> +2 chat sends for TODAY (KST), at most 20
 * credits per KST month. Both bucket and ceiling are enforced inside the
 * SECURITY DEFINER RPC (0090); a monthly-cap rejection surfaces as a typed
 * ChatRewardCapReachedError. Returns today's total ad bonus.
 */
export async function grantChatAdBonus(userId: string): Promise<number> {
  // D2 single-payer (mirrors entitlements/usage.ts addRewardCredits): when
  // AdMob SSV is the grant authority (EXPO_PUBLIC_REWARD_SSV=true), the
  // verified server callback (rewarded-ssv -> grant_chat_ad_bonus_ssv, 0091)
  // is the ONLY payer -- granting here too would credit one impression twice
  // (+4 instead of +2). Report today's current bonus instead so the declared
  // return contract holds. NOTE (review P1): the ad promise resolves on the
  // local CLOSED event, so in SSV mode this read RACES the server callback --
  // treat the returned number as a floor, never as the post-watch total.
  // Waiting/polling here would hold the sheet open on an unbounded network
  // dependency, which D2 explicitly rejects: both callers ignore the return
  // and the allowance is re-read on the next send, after the grant lands.
  // Off by default (direct process.env read so babel inlines it).
  if (process.env.EXPO_PUBLIC_REWARD_SSV === "true") {
    return (await readChatUsageDetail(userId)).adBonus;
  }
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("grant_chat_ad_bonus", {
    p_user_id: userId,
  });
  if (error) {
    if (typeof error.message === "string" && error.message.includes("chat_reward_cap_reached")) {
      throw new ChatRewardCapReachedError();
    }
    throw error;
  }
  if (typeof data !== "number") throw new Error("invalid_chat_ad_bonus_response");
  return data;
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
