/**
 * Reasoning-run job client — the 0092 lifecycle
 * (reserve → start → complete/fail/cancel → ratify → apply, plus stale
 * recovery). Wraps the SECURITY DEFINER RPCs so every spend of the scarce
 * weekly allowance is atomic, idempotent, and refundable server-side.
 *
 * Unlike the fail-open READ helpers in entitlements/usage.ts, the SPEND path
 * here fails CLOSED: if a reserve cannot be confirmed, no run starts. Refund
 * paths (fail/cancel) warn instead of throwing — a missed refund is repaired
 * by the stale-run sweep (recoverStaleRuns) on the next visit.
 *
 * Idempotency keys: manual runs get a fresh key per tap (makeManualRunKey);
 * auto runs use the deterministic autoRunKey(refKind, refId), so the same
 * captured item can never spend twice no matter how often the enqueue fires.
 */

import { getSupabaseClient } from "../supabase/client";

export type ReasoningRunTrigger = "manual" | "auto";
export type ReasoningRunStatus =
  | "reserved"
  | "running"
  | "proposed"
  | "ratified"
  | "cancelled"
  | "failed"
  | "recovered";
export type ReasoningRunSpend = "base" | "credit" | "none";

export interface ReservedRun {
  runId: string;
  status: ReasoningRunStatus;
  spend: ReasoningRunSpend;
  /** true when the idempotency key matched a previously reserved run. */
  existing: boolean;
}

export interface ServerProposalRow {
  runId: string;
  ordinal: number;
  kind: string;
  status: "proposed" | "ratified" | "dismissed" | "applied";
  payload: Record<string, unknown>;
}

/** Weekly base exhausted (and, for manual, no monthly credit left either). */
export class ReasoningRunLimitError extends Error {
  constructor() {
    super("reasoning_limit_exceeded");
  }
}
/** Another run is already reserved/running for this user (any device). */
export class ReasoningRunActiveError extends Error {
  constructor() {
    super("reasoning_run_active");
  }
}
/** Auto allowance unavailable — the last base run is reserved for manual. */
export class ReasoningAutoUnavailableError extends Error {
  constructor() {
    super("reasoning_auto_unavailable");
  }
}

/** Manual selection ceiling (spec B: 한 번에 최대 5개). */
export const MANUAL_MAX_ITEMS = 5;
/** A reserved/running row older than this is refunded by the recovery sweep. */
export const STALE_RUN_MINUTES = 30;

/** Fresh per-tap key for a manual run (uniqueness, not secrecy). */
export function makeManualRunKey(now: number = Date.now()): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `manual-${now.toString(36)}-${rand}`;
}

/**
 * Deterministic key for an auto run over one new item: the same record/source
 * can only ever reserve once, which is exactly the "새 미처리 자료 1건 = 자동
 * 실행 최대 1회" rule.
 */
export function autoRunKey(refKind: "record" | "source", refId: string): string {
  return `auto-${refKind}-${refId}`;
}

function mapReserveError(message: string): Error {
  const lower = message.toLowerCase();
  if (lower.includes("reasoning_run_active")) return new ReasoningRunActiveError();
  if (lower.includes("reasoning_auto_unavailable")) return new ReasoningAutoUnavailableError();
  if (lower.includes("reasoning_limit_exceeded")) return new ReasoningRunLimitError();
  return new Error(`reasoning_reserve_failed: ${message}`);
}

/** Reserve one run. FAILS CLOSED — throws unless the server confirmed it. */
export async function reserveRun(args: {
  userId: string;
  key: string;
  trigger: ReasoningRunTrigger;
  itemCount: number;
}): Promise<ReservedRun> {
  const { data, error } = await getSupabaseClient().rpc("reserve_reasoning_run", {
    p_user_id: args.userId,
    p_key: args.key,
    p_trigger: args.trigger,
    p_item_count: args.itemCount,
  });
  if (error) throw mapReserveError(error.message);
  const row = data as { run_id?: string; status?: string; spend?: string; existing?: boolean } | null;
  if (!row?.run_id) throw new Error("reasoning_reserve_failed: empty response");
  return {
    runId: row.run_id,
    status: (row.status ?? "reserved") as ReasoningRunStatus,
    spend: (row.spend ?? "base") as ReasoningRunSpend,
    existing: row.existing === true,
  };
}

/** reserved → running. Cosmetic state for recovery granularity; non-fatal. */
export async function startRun(userId: string, runId: string): Promise<void> {
  try {
    const { error } = await getSupabaseClient().rpc("start_reasoning_run", {
      p_user_id: userId,
      p_run_id: runId,
    });
    if (error && typeof console !== "undefined") {
      console.warn("[reasoning-runs] startRun failed:", error.message);
    }
  } catch (e) {
    if (typeof console !== "undefined") console.warn("[reasoning-runs] startRun threw:", e);
  }
}

/**
 * Persist the run's proposals and close it as 'proposed' — one transaction
 * server-side, so a spent run can never end up without a reviewable result.
 * Throws on failure (the caller then refunds via failRun).
 */
export async function completeRun(
  userId: string,
  runId: string,
  proposals: readonly { kind: string; payload: Record<string, unknown> }[],
): Promise<void> {
  const { error } = await getSupabaseClient().rpc("complete_reasoning_run", {
    p_user_id: userId,
    p_run_id: runId,
    p_proposals: proposals,
  });
  if (error) throw new Error(`reasoning_complete_failed: ${error.message}`);
}

/** reserved/running → failed, refunding the spend. Warn-only (sweep repairs). */
export async function failRun(userId: string, runId: string, code: string): Promise<void> {
  try {
    const { error } = await getSupabaseClient().rpc("fail_reasoning_run", {
      p_user_id: userId,
      p_run_id: runId,
      p_code: code,
    });
    if (error && typeof console !== "undefined") {
      console.warn("[reasoning-runs] failRun failed:", error.message);
    }
  } catch (e) {
    if (typeof console !== "undefined") console.warn("[reasoning-runs] failRun threw:", e);
  }
}

/** reserved/running → cancelled, refunding the spend. Warn-only. */
export async function cancelRun(userId: string, runId: string): Promise<void> {
  try {
    const { error } = await getSupabaseClient().rpc("cancel_reasoning_run", {
      p_user_id: userId,
      p_run_id: runId,
    });
    if (error && typeof console !== "undefined") {
      console.warn("[reasoning-runs] cancelRun failed:", error.message);
    }
  } catch (e) {
    if (typeof console !== "undefined") console.warn("[reasoning-runs] cancelRun threw:", e);
  }
}

/** Refund runs stranded reserved/running (crash, kill). Returns count, 0 on error. */
export async function recoverStaleRuns(userId: string): Promise<number> {
  try {
    const { data, error } = await getSupabaseClient().rpc("recover_stale_reasoning_runs", {
      p_user_id: userId,
      p_stale_minutes: STALE_RUN_MINUTES,
    });
    if (error) {
      if (typeof console !== "undefined") {
        console.warn("[reasoning-runs] recoverStaleRuns failed:", error.message);
      }
      return 0;
    }
    return typeof data === "number" ? data : 0;
  } catch (e) {
    if (typeof console !== "undefined") console.warn("[reasoning-runs] recoverStaleRuns threw:", e);
    return 0;
  }
}

/**
 * Per-proposal decisions, exactly-once server-side. Ordinals not yet decided
 * stay 'proposed'; the run closes as 'ratified' once none remain.
 */
export async function ratifyProposals(
  userId: string,
  runId: string,
  ratify: readonly number[],
  dismiss: readonly number[],
): Promise<void> {
  const { error } = await getSupabaseClient().rpc("ratify_reasoning_proposals", {
    p_user_id: userId,
    p_run_id: runId,
    p_ratify: ratify,
    p_dismiss: dismiss,
  });
  if (error) throw new Error(`reasoning_ratify_failed: ${error.message}`);
}

/** ratified → applied, exactly-once. Returns whether THIS call applied it. */
export async function markProposalApplied(
  userId: string,
  runId: string,
  ordinal: number,
): Promise<boolean> {
  const { error, data } = await getSupabaseClient().rpc("mark_reasoning_proposal_applied", {
    p_user_id: userId,
    p_run_id: runId,
    p_ordinal: ordinal,
  });
  if (error) throw new Error(`reasoning_mark_applied_failed: ${error.message}`);
  return data === true;
}

/**
 * Pending review material: proposals of the user's 'proposed' runs, plus any
 * 'ratified' proposals a crashed apply loop has not marked applied yet. Reads
 * fail OPEN to an empty list (review simply shows nothing — the rows are
 * still on the server for the next load).
 */
export async function listPendingProposals(userId: string): Promise<ServerProposalRow[]> {
  try {
    const client = getSupabaseClient();
    const { data: runs, error: runsError } = await client
      .from("reasoning_runs")
      .select("id")
      .eq("user_id", userId)
      .in("status", ["proposed", "ratified"])
      .order("created_at", { ascending: false })
      .limit(8);
    if (runsError || !runs || runs.length === 0) {
      if (runsError && typeof console !== "undefined") {
        console.warn("[reasoning-runs] listPendingProposals runs read failed:", runsError.message);
      }
      return [];
    }
    const runIds = runs.map((r) => (r as { id: string }).id);
    const { data: rows, error: rowsError } = await client
      .from("reasoning_run_proposals")
      .select("run_id, ordinal, kind, status, payload")
      .in("run_id", runIds)
      .in("status", ["proposed", "ratified"])
      .order("ordinal", { ascending: true });
    if (rowsError || !rows) {
      if (rowsError && typeof console !== "undefined") {
        console.warn("[reasoning-runs] listPendingProposals rows read failed:", rowsError.message);
      }
      return [];
    }
    return rows.map((row) => {
      const r = row as {
        run_id: string;
        ordinal: number;
        kind: string;
        status: ServerProposalRow["status"];
        payload: Record<string, unknown>;
      };
      return { runId: r.run_id, ordinal: r.ordinal, kind: r.kind, status: r.status, payload: r.payload };
    });
  } catch (e) {
    if (typeof console !== "undefined") console.warn("[reasoning-runs] listPendingProposals threw:", e);
    return [];
  }
}
