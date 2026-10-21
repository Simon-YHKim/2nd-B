// Reads + atomic-bump for chat_usage. RLS scopes everything to auth.uid().

import { getSupabaseClient } from "../supabase/client";
import { rpcJsonWithCapturedSession, type CapturedSessionRequestError } from "../supabase/captured-session-client";
import { abortError, throwIfAborted } from "../async/abort";
import type { AccountOwnerLease } from "../auth/account-epoch";
import type { AuthenticatedAccountSessionLease } from "../auth/account-session-lease";
import type { createContentWipeLedger } from "../account/content-wipe";
import { kstDateToday } from "./limits";
import { classifyChatTurnError, parseChatTurnReservation, parseChatUsageCount, type ChatTurnUsage } from "./turn-reservation";
type UsageReadExecution = Pick<AuthenticatedAccountSessionLease, "userId" | "signal" | "assertCurrent">;
export type CapturedChatUsageExecution = Readonly<{
  session: AuthenticatedAccountSessionLease;
  observer: Readonly<{
    owner: AccountOwnerLease;
    generation: number;
    operationId: string;
    stepId: string;
    ledger: Pick<ReturnType<typeof createContentWipeLedger>, "read" | "acquireMutation" | "issueMutation" | "settleMutation">;
  }>;
}>;

function assertUsageRead(userId: string, execution?: UsageReadExecution): void {
  if (!execution) return;
  if (!userId || execution.userId !== userId) throw new Error("chat_usage_session_owner_mismatch");
  throwIfAborted(execution.signal);
  execution.assertCurrent();
}

export async function readChatUsage(userId: string, day: string = kstDateToday(), execution?: UsageReadExecution): Promise<number> {
  assertUsageRead(userId, execution);
  const supabase = getSupabaseClient();
  let data, error;
  try {
    ({ data, error } = await supabase
      .from("chat_usage")
      .select("count")
      .eq("user_id", userId)
      .eq("day", day)
      .maybeSingle());
  } catch (failure) {
    assertUsageRead(userId, execution);
    throw failure;
  }
  assertUsageRead(userId, execution);
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
  execution?: UsageReadExecution,
): Promise<ChatUsageDetail> {
  assertUsageRead(userId, execution);
  const supabase = getSupabaseClient();
  let data, error;
  try {
    ({ data, error } = await supabase
      .from("chat_usage")
      .select("count, ad_bonus")
      .eq("user_id", userId)
      .eq("day", day)
      .maybeSingle());
  } catch (failure) {
    assertUsageRead(userId, execution);
    throw failure;
  }
  assertUsageRead(userId, execution);
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

async function isConfirmedCapRejection(error: CapturedSessionRequestError): Promise<boolean> {
  // 0090: this exact RPC raises P0001/chat_limit_exceeded; PostgREST maps it to 400.
  // A success-body parse failure, proxy failure or similar text is not rollback proof.
  try {
    if (error.context.status !== 400) return false;
    const value: unknown = await error.context.json();
    return !!value && typeof value === "object" && !Array.isArray(value)
      && "code" in value && value.code === "P0001"
      && "message" in value && value.message === "chat_limit_exceeded";
  } catch { return false; }
}

async function bumpCapturedUsage(userId: string, cap: number, day: string,
  execution: CapturedChatUsageExecution): Promise<number> {
  // Supplying only a session must never silently fall back to the mutable RPC.
  if (!execution.session || !execution.observer) throw new Error("chat_usage_observer_required");
  const { session, observer } = execution;
  const { owner, ledger, generation } = observer;
  const fence = () => {
    assertUsageRead(userId, session);
    if (owner.ownerId !== userId || owner.epoch !== session.epoch) throw new Error("chat_usage_observer_owner_mismatch");
    if (!owner.isCurrent()) throw abortError();
    const content = ledger.read(owner);
    if (!Number.isSafeInteger(generation) || generation < 0 || content.generation !== generation || content.phase !== "open") throw abortError();
  };
  fence();
  // The token getter may fence ownership. Do that before acquiring/issuing a ticket.
  const token = session.accessToken, signal = session.signal;
  fence();
  const ticket = ledger.acquireMutation(owner, generation, {
    operationId: observer.operationId, stepId: observer.stepId, kind: "usage",
  });
  if (!ticket) throw abortError();
  const operation = ledger.issueMutation(owner, ticket,
    () => rpcJsonWithCapturedSession("bump_chat_usage_if_under_cap", { p_user_id: userId, p_day: day, p_cap: cap }, token, signal),
    () => { fence(); return true; });
  if (!operation) throw abortError();
  let result;
  try { result = await operation; }
  catch (error) {
    ledger.settleMutation(ticket, { outcome: "unknown" });
    fence();
    throw error;
  }
  if (result.error) {
    const capRejected = await isConfirmedCapRejection(result.error);
    const settled = ledger.settleMutation(ticket, { outcome: capRejected ? "definitely-not-committed" : "unknown" });
    fence();
    if (!settled) throw new Error("chat_usage_settlement_rejected");
    if (capRejected) throw new ChatLimitExceededError();
    throw result.error;
  }
  // SQL RETURNS int and every successful insert/increment returns a positive count.
  // Do not compare against p_cap: the server owns the tier + ad_bonus allowance.
  const count = result.data;
  const valid = typeof count === "number" && Number.isSafeInteger(count) && count > 0 && count <= 2_147_483_647;
  const settled = ledger.settleMutation(ticket, valid ? { outcome: "committed", count } : { outcome: "unknown" });
  fence();
  if (!settled) throw new Error("chat_usage_settlement_rejected");
  if (!valid) throw new Error("invalid_chat_usage_response");
  return count;
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
  execution?: CapturedChatUsageExecution,
): Promise<number> {
  if (execution !== undefined) return bumpCapturedUsage(userId, cap, day, execution);
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

/**
 * T39 A1-U, dormant: no production caller until the server admission gate is ready.
 * A failed/ambiguous reservation may already have bumped usage. Only a confirmed
 * missing 0255 RPC permits one legacy bump, which carries no turn receipt.
 * Existing live and captured callers keep bumpChatUsageIfUnderCap unchanged.
 */
export async function bumpChatUsageForTurn(
  userId: string,
  cap: number,
  day: string = kstDateToday(),
): Promise<ChatTurnUsage> {
  const supabase = getSupabaseClient();
  const result = await supabase.rpc("bump_chat_usage_for_turn", { p_user_id: userId, p_day: day });
  if (result.error) {
    const reason = classifyChatTurnError(result.error, result.status);
    if (reason === "limit") throw new ChatLimitExceededError();
    if (reason !== "missing") throw result.error;

    // Keep raw status/error here: the older wrapper's substring cap check cannot
    // establish a confirmed rejection for this new protocol.
    const legacy = await supabase.rpc("bump_chat_usage_if_under_cap", {
      p_user_id: userId, p_day: day, p_cap: cap,
    });
    if (legacy.error) {
      if (classifyChatTurnError(legacy.error, legacy.status) === "limit") throw new ChatLimitExceededError();
      throw legacy.error;
    }
    const count: unknown = legacy.data;
    return { count: parseChatUsageCount(count), turnId: null };
  }
  const receipt: unknown = result.data;
  return parseChatTurnReservation(receipt);
}
