// Strict reasoning usage read for the reasoning screen (T43 · DECISIONS-2026-10-13 20:43 ④:
// "응답이 없을 때 이미 쓰는 문장과 [다시 시도], 못 불러온 숫자는 「...」").
//
// `getReasoningUsage` (usage.ts) stays FAIL OPEN on purpose: automatic runs, home and the
// limit sheet rely on it never throwing. That contract is why a failed read reached the
// reasoning screen as "0 used" or as the counter mirror with no purchased credits. This
// module is a separate, opt-in read: it resolves only a usage the server actually returned
// and rejects everything else, so the screen can show "..." and a retry instead.
//
// Contract (docs/design/reasoning-usage-read.md):
// - One Date fixes the week and month bucket. The counter read is the caller's own row for
//   that week only; the ledger is the argument-free `credit_summary_self()` (auth.uid()).
// - Both reads start together, and each one is checked as soon as it settles, so a known
//   failure on one side is reported without waiting for the other side's hang.
// - An empty counter array is the only "0 used". Every value must be a safe, non-negative
//   integer `number`; nothing is coerced, clamped or defaulted.
// - `assertCurrent` runs at the start, before each dispatch, after each reply and before the
//   result; if the caller's owner changed during the first dispatch, the second never goes out.
// - A bucket that rolled over during the read is not published as the current number.
import { getSupabaseClient } from "../supabase/client";
import { monthBucket, weekBucket, type ReasoningUsage } from "./usage";

const COUNTER_TABLE = "usage_counters";
const LEDGER_RPC = "credit_summary_self";

export type ReasoningUsageReadSource = "counter" | "ledger" | "bucket";

/** The read did not produce a usage the server confirmed. Never means "0 used". */
export class ReasoningUsageReadError extends Error {
  readonly source: ReasoningUsageReadSource;
  constructor(source: ReasoningUsageReadSource, detail: string) {
    super(`reasoning usage ${source} read failed: ${detail}`);
    this.name = "ReasoningUsageReadError";
    this.source = source;
  }
}

export interface StrictReasoningUsageOptions {
  /** Throws when the caller's owner, focus or attempt is no longer current. */
  assertCurrent: () => void;
  /** Clock for the bucket; tests pass a fixed one. */
  now?: () => Date;
}

type SupabaseReply = { data?: unknown; error?: { message?: string } | null };

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readCounter(reply: SupabaseReply, userId: string, week: string): number {
  if (reply.error) throw new ReasoningUsageReadError("counter", reply.error.message ?? "error");
  const rows = reply.data;
  if (!Array.isArray(rows)) throw new ReasoningUsageReadError("counter", "not a list");
  if (rows.length === 0) return 0;
  if (rows.length > 1) throw new ReasoningUsageReadError("counter", "more than one row");
  const row = rows[0];
  if (!isPlainObject(row)) throw new ReasoningUsageReadError("counter", "row shape");
  if (row.user_id !== userId) throw new ReasoningUsageReadError("counter", "another owner");
  if (row.month_bucket !== week) throw new ReasoningUsageReadError("counter", "another bucket");
  if (!isCount(row.reasoning_used)) throw new ReasoningUsageReadError("counter", "used is not a count");
  return row.reasoning_used;
}

function readLedger(reply: SupabaseReply): { available: number; earned: number } {
  if (reply.error) throw new ReasoningUsageReadError("ledger", reply.error.message ?? "error");
  const summary = reply.data;
  if (!isPlainObject(summary)) throw new ReasoningUsageReadError("ledger", "not an object");
  if (!isCount(summary.available)) throw new ReasoningUsageReadError("ledger", "available is not a count");
  if (!isCount(summary.ad_earned_this_month)) throw new ReasoningUsageReadError("ledger", "earned is not a count");
  return { available: summary.available, earned: summary.ad_earned_this_month };
}

/** Resolves only a usage both sources confirmed for the current week; rejects otherwise. */
export async function readReasoningUsageStrict(
  userId: string,
  options: StrictReasoningUsageOptions,
): Promise<ReasoningUsage> {
  const { assertCurrent } = options;
  const clock = options.now ?? (() => new Date());
  assertCurrent();
  const at = clock();
  const week = weekBucket(at);
  const month = monthBucket(at);
  const client = getSupabaseClient();

  // Dispatch happens when `then` is called on the query builder, so each dispatch is
  // explicit and preceded by the ownership check.
  assertCurrent();
  const counterReply = Promise.resolve(
    client
      .from(COUNTER_TABLE)
      .select("user_id, month_bucket, reasoning_used")
      .eq("user_id", userId)
      .eq("month_bucket", week)
      .then((reply: SupabaseReply) => reply),
  );
  // A stale owner stops here; the first reply is observed so it cannot surface unhandled.
  try {
    assertCurrent();
  } catch (stale) {
    counterReply.catch(() => undefined);
    throw stale;
  }
  const ledgerReply = Promise.resolve(client.rpc(LEDGER_RPC).then((reply: SupabaseReply) => reply));

  const counter = counterReply.then((reply) => {
    assertCurrent();
    return readCounter(reply, userId, week);
  });
  const ledger = ledgerReply.then((reply) => {
    assertCurrent();
    return readLedger(reply);
  });
  // Promise.all rejects on the first rejection: a known failure is not hidden by a hang.
  const [used, credits] = await Promise.all([counter, ledger]);
  assertCurrent();
  const after = clock();
  if (weekBucket(after) !== week || monthBucket(after) !== month) {
    throw new ReasoningUsageReadError("bucket", "the week or month changed during the read");
  }
  return { used, rewardCredits: credits.available, rewardEarned: credits.earned, weekBucket: week, monthBucket: month };
}
