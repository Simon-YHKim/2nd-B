// First-run marks that belong to the ACCOUNT, not the device (Q-261004-40 = A,
// migration 0219). Two marks live on the signed-in user's own users row:
//   onboarding_completed_at  the welcome carousel was finished
//   ttfv_seen_at             the first-day review (/ttfv) showed content
// The welcome and the first-day review are once per account: a new browser, a
// private window or a reinstall must not show them to an existing account again
// (QA-LEGACY W-12).
//
// The server value wins whenever it can be read. When it cannot (the column is
// missing because 0219 is not applied yet, the RPC is missing, the network
// failed, or the row is not there), the status is "device" and the callers use
// the device value they have always used (state.ts / ttfv-gate.ts). A failed
// read is never mistaken for "this account has not finished": that would put an
// existing account back into the welcome on every network blip.
//
// Writes go through two owner-only RPCs (mark_onboarding_completed /
// mark_ttfv_seen). The server keeps the FIRST value, and each RPC returns both
// stored marks, which this store adopts. A mark made in this session is also
// kept in memory, so a late read that started before the write cannot undo it.

import { useEffect, useSyncExternalStore } from "react";

import { withTimeout } from "../async/with-timeout";
import { getSupabaseClient } from "../supabase/client";

export type AccountFirstRunStatus = "idle" | "loading" | "server" | "device";

export interface AccountFirstRunMarks {
  onboardingCompletedAt: string | null;
  ttfvSeenAt: string | null;
}

export interface AccountFirstRunSnapshot extends AccountFirstRunMarks {
  /** The account this snapshot describes. A different owner's snapshot is never used. */
  userId: string | null;
  status: AccountFirstRunStatus;
}

export const ACCOUNT_FIRST_RUN_TIMEOUT_MS = 8_000;

const EMPTY: AccountFirstRunMarks = { onboardingCompletedAt: null, ttfvSeenAt: null };
const INITIAL: AccountFirstRunSnapshot = { userId: null, status: "idle", ...EMPTY };

let snapshot: AccountFirstRunSnapshot = INITIAL;
let generation = 0;
const listeners = new Set<() => void>();
/** Marks this session wrote (or tried to write), per owner. */
const sessionMarks = new Map<string, AccountFirstRunMarks>();

function warn(operation: string, error: unknown): void {
  if (typeof console !== "undefined") console.warn(`[first-run] ${operation} failed`, error);
}

function publish(next: AccountFirstRunSnapshot): void {
  snapshot = next;
  for (const listener of listeners) listener();
}

export function accountFirstRunSnapshot(): AccountFirstRunSnapshot {
  return snapshot;
}

export function subscribeAccountFirstRun(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function timestampOrNull(value: unknown, field: string): string | null {
  if (value === null) return null;
  if (typeof value === "string" && Number.isFinite(Date.parse(value))) return value;
  throw new Error(`First-run ${field} is not a timestamp`);
}

/** Both fields must be present: a response without them is not an answer. */
export function parseAccountFirstRunMarks(row: unknown): AccountFirstRunMarks {
  if (!row || typeof row !== "object") throw new Error("First-run marks were not returned");
  const record = row as Record<string, unknown>;
  for (const field of ["onboarding_completed_at", "ttfv_seen_at"]) {
    if (!Object.prototype.hasOwnProperty.call(record, field)) {
      throw new Error(`First-run ${field} was not returned`);
    }
  }
  return {
    onboardingCompletedAt: timestampOrNull(record.onboarding_completed_at, "onboarding_completed_at"),
    ttfvSeenAt: timestampOrNull(record.ttfv_seen_at, "ttfv_seen_at"),
  };
}

/** Reads the owner's own users row (users_self_select RLS). Throws on anything but an answer. */
export async function fetchAccountFirstRunMarks(ownerId: string): Promise<AccountFirstRunMarks> {
  const { data, error } = await getSupabaseClient()
    .from("users")
    .select("onboarding_completed_at, ttfv_seen_at")
    .eq("id", ownerId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("First-run owner row was not found");
  return parseAccountFirstRunMarks(data);
}

/**
 * A stored mark never goes back to NULL, so the first non-null source wins. The
 * newest server answer comes first: its value is the one the server keeps (first
 * write wins there), and this session's own clock only fills a server NULL.
 */
function merge(...sources: (AccountFirstRunMarks | undefined)[]): AccountFirstRunMarks {
  const pick = (field: keyof AccountFirstRunMarks) =>
    sources.find((source) => source?.[field])?.[field] ?? null;
  return { onboardingCompletedAt: pick("onboardingCompletedAt"), ttfvSeenAt: pick("ttfvSeenAt") };
}

function publishServer(ownerId: string, marks: AccountFirstRunMarks): void {
  const current = snapshot.userId === ownerId && snapshot.status === "server" ? snapshot : undefined;
  publish({
    userId: ownerId,
    status: "server",
    ...merge(marks, current, sessionMarks.get(ownerId)),
  });
}

/**
 * Read the owner's marks once per owner and app launch. Skips while a read is in
 * flight or after the server answered; a "device" result is retried on the next
 * call, which the hooks make when they mount or their owner/readiness changes.
 */
export async function probeAccountFirstRun(
  ownerId: string,
  read: (ownerId: string) => Promise<AccountFirstRunMarks> = fetchAccountFirstRunMarks,
  timeoutMs = ACCOUNT_FIRST_RUN_TIMEOUT_MS,
): Promise<void> {
  if (!ownerId) return;
  if (snapshot.userId === ownerId && (snapshot.status === "loading" || snapshot.status === "server")) return;
  const request = ++generation;
  publish({ userId: ownerId, status: "loading", ...EMPTY });
  try {
    const marks = await withTimeout(read(ownerId), timeoutMs, "First-run marks");
    if (generation !== request || snapshot.userId !== ownerId) return;
    publishServer(ownerId, marks);
    // A mark this session made that the server does not have yet (its write
    // failed, or the row did not exist then): send it again.
    const pending = sessionMarks.get(ownerId);
    if (pending?.onboardingCompletedAt && !marks.onboardingCompletedAt) {
      void sendAndAdopt(ownerId, "mark_onboarding_completed");
    }
    if (pending?.ttfvSeenAt && !marks.ttfvSeenAt) void sendAndAdopt(ownerId, "mark_ttfv_seen");
  } catch (error) {
    if (generation !== request || snapshot.userId !== ownerId) return;
    warn("read", error);
    publish({ userId: ownerId, status: "device", ...EMPTY });
  }
}

type MarkRpc = "mark_onboarding_completed" | "mark_ttfv_seen";

async function sendMark(ownerId: string, rpc: MarkRpc): Promise<AccountFirstRunMarks> {
  const { data, error } = await withTimeout(
    getSupabaseClient().rpc(rpc, { p_user_id: ownerId }),
    ACCOUNT_FIRST_RUN_TIMEOUT_MS,
    "First-run mark",
  );
  if (error) throw error;
  // NULL: the owner row does not exist (profile not created yet).
  if (data === null || data === undefined) throw new Error("First-run owner row was not found");
  return parseAccountFirstRunMarks(data);
}

/** Send one mark and adopt the stored values if this owner is still current. Never rejects. */
function sendAndAdopt(ownerId: string, rpc: MarkRpc): Promise<void> {
  return sendMark(ownerId, rpc).then(
    (stored) => {
      if (snapshot.userId === ownerId) publishServer(ownerId, stored);
    },
    (error) => warn(rpc, error),
  );
}

function recordMark(ownerId: string, field: keyof AccountFirstRunMarks, rpc: MarkRpc): Promise<void> {
  if (!ownerId) return Promise.resolve();
  const marks = sessionMarks.get(ownerId) ?? { ...EMPTY };
  if (!marks[field]) {
    marks[field] = new Date().toISOString();
    sessionMarks.set(ownerId, marks);
  }
  // Only a server snapshot changes here. "device" keeps answering from the
  // device value the caller just wrote, and a read in flight merges the session
  // mark when it lands.
  if (snapshot.userId === ownerId && snapshot.status === "server") publishServer(ownerId, snapshot);
  return sendAndAdopt(ownerId, rpc);
}

/** The welcome was finished by this owner. Never rejects. */
export function markAccountOnboardingComplete(ownerId: string): Promise<void> {
  return recordMark(ownerId, "onboardingCompletedAt", "mark_onboarding_completed");
}

/** The first-day review showed content to this owner. Never rejects. */
export function markAccountTTFVSeen(ownerId: string): Promise<void> {
  return recordMark(ownerId, "ttfvSeenAt", "mark_ttfv_seen");
}

/**
 * The account's answer for this owner:
 *   null      wait (not ready, other owner, or the read is in flight)
 *   "device"  the server could not answer; use the device value
 *   marks     the server answer (merged with this session's own marks)
 */
export function accountFirstRunAnswer(
  ownerId: string,
  ready: boolean,
  current: AccountFirstRunSnapshot,
): AccountFirstRunMarks | "device" | null {
  if (!ready || current.userId !== ownerId) return null;
  if (current.status === "device") return "device";
  if (current.status !== "server") return null;
  return { onboardingCompletedAt: current.onboardingCompletedAt, ttfvSeenAt: current.ttfvSeenAt };
}

/**
 * Subscribe to the store and read this owner's marks once `ready` (the session
 * is restored, so the read carries the owner's token rather than going out as
 * anon). Signed out (no owner) answers null: the caller uses the device value.
 */
export function useAccountFirstRun(
  ownerId: string | null,
  ready: boolean,
): AccountFirstRunMarks | "device" | null {
  const current = useSyncExternalStore(
    subscribeAccountFirstRun,
    accountFirstRunSnapshot,
    accountFirstRunSnapshot,
  );
  useEffect(() => {
    if (!ownerId || !ready) return;
    void probeAccountFirstRun(ownerId);
  }, [ownerId, ready]);
  return ownerId ? accountFirstRunAnswer(ownerId, ready, current) : null;
}

export function __resetAccountFirstRunForTests(): void {
  snapshot = INITIAL;
  generation = 0;
  listeners.clear();
  sessionMarks.clear();
}
