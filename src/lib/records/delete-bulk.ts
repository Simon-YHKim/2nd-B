// Bulk + scoped record deletion. All operations are RLS-scoped to
// auth.uid() so the userId argument is belt-and-suspenders alongside
// the policy. Each helper returns the affected row count so the UI
// can show 'Deleted N records'.

import { getSupabaseClient } from "../supabase/client";
import { invalidateDomainLevels } from "../persona/load-domain-levels";
import {
  AuthSessionOwnerChangedError,
  getAuthStorageRuntime,
  refreshExpectedSessionInsideMutation,
  type AuthSessionExpectation,
} from "../auth/session-mutation";
import {
  PENDING_DELETION_OP_STALE_MS,
  clearDeletionOpMemo,
  isDeletionOpId,
  listDeletionOpMemos,
  newDeletionOpId,
  writeDeletionOpMemo,
} from "../account/deletion-op-memo";
import { fetchAccountDeletionOpStatus, type ServerDeletionReceipt } from "../account/deletion-receipt";
import { recordPhotoPathsOf, removeRecordPhotoObjects } from "../capture/record-photos";
/** Delete every record belonging to the user. Returns affected count. */
export async function deleteAllRecords(userId: string): Promise<number> {
  const supabase = getSupabaseClient();
  const { count, error, data } = await supabase
    .from("records")
    .delete({ count: "exact" })
    .eq("user_id", userId).select("structured");
  if (error) throw error;
  // Records shift domain levels — drop this user's cached constellation
  // (same contract as createRecord/deleteRecord in create.ts).
  if ((count ?? 0) > 0) { invalidateDomainLevels(userId); await removeRecordPhotoObjects(recordPhotoPathsOf(data, userId)); }
  return count ?? 0;
}

/** Delete records by kind (e.g. only 'journal' or only 'note'). */
export async function deleteRecordsByKind(
  userId: string,
  kind: "journal" | "note" | "audit_response",
): Promise<number> {
  const supabase = getSupabaseClient();
  const { count, error, data } = await supabase
    .from("records")
    .delete({ count: "exact" })
    .eq("user_id", userId)
    .eq("kind", kind).select("structured");
  if (error) throw error;
  // Records shift domain levels — drop this user's cached constellation
  // (same contract as createRecord/deleteRecord in create.ts).
  if ((count ?? 0) > 0) { invalidateDomainLevels(userId); await removeRecordPhotoObjects(recordPhotoPathsOf(data, userId)); }
  return count ?? 0;
}

/** Delete records whose tags array overlaps with any of the tags. */
export async function deleteRecordsByTag(userId: string, tags: string[]): Promise<number> {
  if (tags.length === 0) return 0;
  const supabase = getSupabaseClient();
  const { count, error, data } = await supabase
    .from("records")
    .delete({ count: "exact" })
    .eq("user_id", userId)
    .overlaps("tags", tags).select("structured");
  if (error) throw error;
  // Records shift domain levels — drop this user's cached constellation
  // (same contract as createRecord/deleteRecord in create.ts).
  if ((count ?? 0) > 0) { invalidateDomainLevels(userId); await removeRecordPhotoObjects(recordPhotoPathsOf(data, userId)); }
  return count ?? 0;
}

/** Delete an explicit list of record IDs (bulk-select UI). */
export async function deleteRecordsByIds(userId: string, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const supabase = getSupabaseClient();
  const { count, error, data } = await supabase
    .from("records")
    .delete({ count: "exact" })
    .eq("user_id", userId)
    .in("id", ids).select("structured");
  if (error) throw error;
  // Records shift domain levels — drop this user's cached constellation
  // (same contract as createRecord/deleteRecord in create.ts).
  if ((count ?? 0) > 0) { invalidateDomainLevels(userId); await removeRecordPhotoObjects(recordPhotoPathsOf(data, userId)); }
  return count ?? 0;
}

/** Delete every wiki page (cascades wiki_links). Sources are untouched. */
/** Delete specific sources by id (import-hub 철회 — removes the derived rows
 *  a ratified import created). Owner-scoped. */
export async function deleteSourcesByIds(userId: string, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const supabase = getSupabaseClient();
  const { count, error } = await supabase
    .from("sources")
    .delete({ count: "exact" })
    .eq("user_id", userId)
    .in("id", ids);
  if (error) throw error;
  return count ?? 0;
}

/** Which of these source ids still exist for this owner.
 *
 *  The withdrawal flows promise never to drop the only pointer to rows that
 *  still exist, and they used to keep that promise only for a THROWN delete.
 *  `deleteSourcesByIds` does not throw when it removes fewer rows than asked -
 *  it returns the count - and a short count does not separate "already gone"
 *  from "still there". This separates them. Callers ask only when the count
 *  came up short, so the ordinary withdrawal costs no extra query. */
export async function findSurvivingSourceIds(userId: string, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("sources")
    .select("id")
    .eq("user_id", userId)
    .in("id", ids);
  if (error) throw error;
  return ((data ?? []) as { id: string }[]).map((row) => row.id);
}

export async function deleteAllWikiPages(userId: string): Promise<number> {
  const supabase = getSupabaseClient();
  const { count, error } = await supabase
    .from("wiki_pages")
    .delete({ count: "exact" })
    .eq("user_id", userId);
  if (error) throw error;
  return count ?? 0;
}

/** Delete every un-ingested source. Promoted sources need their wiki
 *  page deleted first (the wiki_pages_source_kind_pair CHECK blocks
 *  source deletion while a kind='source' page references it). */
export async function deleteUningestedSources(userId: string): Promise<number> {
  const supabase = getSupabaseClient();
  const { count, error } = await supabase
    .from("sources")
    .delete({ count: "exact" })
    .eq("user_id", userId)
    .eq("ingested", false);
  if (error) throw error;
  return count ?? 0;
}

/** Delete every source (after wiki pages are deleted). Safe-order:
 *  call deleteAllWikiPages first when you want a full wipe. */
export async function deleteAllSources(userId: string): Promise<number> {
  const supabase = getSupabaseClient();
  const { count, error } = await supabase
    .from("sources")
    .delete({ count: "exact" })
    .eq("user_id", userId);
  if (error) throw error;
  return count ?? 0;
}

/** Delete chat_usage rows so the daily quota resets to zero. */
export async function deleteAllChatUsage(userId: string): Promise<number> {
  const supabase = getSupabaseClient();
  const { count, error } = await supabase
    .from("chat_usage")
    .delete({ count: "exact" })
    .eq("user_id", userId);
  if (error) throw error;
  return count ?? 0;
}

/** Delete the user's derived self-context entries (0021, owner-deletable). */
export async function deleteAllSelfContexts(userId: string): Promise<number> {
  const supabase = getSupabaseClient();
  const { count, error } = await supabase
    .from("self_contexts")
    .delete({ count: "exact" })
    .eq("user_id", userId);
  if (error) throw error;
  return count ?? 0;
}

/** Delete the user's own clipper templates (0027, owner-deletable). Shared
 *  copies others adopted are independent rows and are not touched. */
export async function deleteAllOwnedClipperTemplates(userId: string): Promise<number> {
  const supabase = getSupabaseClient();
  const { count, error } = await supabase
    .from("clipper_templates")
    .delete({ count: "exact" })
    .eq("owner_id", userId);
  if (error) throw error;
  return count ?? 0;
}

// Tables a content wipe leaves in place. Superseded as the source of truth by
// db/erasure-registry.json (every table with an owner column, CI-checked against
// db/migrations). Two claims that stood here were measured wrong on 2026-09-20:
// personas IS owner-deletable (personas_owner_all FOR ALL, 0009:53-57), and
// ai_audit_log does not cascade (0011:20-27 set its FK to ON DELETE SET NULL).

/** Content wipe (keeps the account): wiki pages -> sources -> records ->
 *  chat_usage -> self_contexts -> owned clipper templates. Order matters for
 *  the source_id pair CHECK on wiki_pages. The derived tables are best-effort:
 *  a failure on one (e.g. RLS) is logged and skipped so the wipe still clears
 *  the rest. RLS-protected derived data (personas/memorized_patterns/xp) is
 *  only erased by full account deletion — see requestAccountDeletion. */
export async function deleteAllUserData(userId: string): Promise<{
  records: number;
  sources: number;
  wikiPages: number;
  chatUsage: number;
  selfContexts: number;
  clipperTemplates: number;
}> {
  const wikiPages = await deleteAllWikiPages(userId);
  const sources = await deleteAllSources(userId);
  const records = await deleteAllRecords(userId);
  const chatUsage = await deleteAllChatUsage(userId);
  const selfContexts = await bestEffort(() => deleteAllSelfContexts(userId), "self_contexts");
  const clipperTemplates = await bestEffort(
    () => deleteAllOwnedClipperTemplates(userId),
    "clipper_templates",
  );
  return { records, sources, wikiPages, chatUsage, selfContexts, clipperTemplates };
}

async function bestEffort(fn: () => Promise<number>, label: string): Promise<number> {
  try {
    return await fn();
  } catch (e) {
    if (typeof console !== "undefined") console.warn(`[delete-bulk] ${label} delete failed`, e);
    return 0;
  }
}

/** The two post-cascade sweeps the Edge Function reports on separately. */
export type DeletionSweep = "profile" | "rawClippings";

// 10,001 flat objects need at most eleven bounded invocations. One additional
// attempt leaves margin for a concurrent late object while still making a
// hostile progress stream finite.
export const ACCOUNT_DELETION_MAX_ATTEMPTS = 12;
/** Both bounds matter: an upstream can answer quickly forever, or one call can
 * stall. Attempts cap the former; one absolute deadline and AbortSignal cap the
 * latter without resetting the clock on each retry. */
export const ACCOUNT_DELETION_DEADLINE_MS = 90_000;

/** What the client actually observed when terminal erasure returned.
 *
 *  `deleted` is the only field that gates the destructive boundary: it is true
 *  or this call throws. The two sweep flags are three-valued on purpose —
 *  `true` confirmed done, `false` the server reported it did NOT finish, `null`
 *  the server said nothing (an older deployment omits the field). Collapsing
 *  `null` into `false` would report a residual nobody observed; collapsing it
 *  into `true` would hide one. Neither is honest, so both stay visible. */
export type AccountDeletionReceipt = {
  deleted: true;
  /** The request number = the server's receipt number (0217). Null only for the old `{}` flow. */
  opId: string | null;
  profileErased: boolean | null;
  /** Whether the server committed its durable deletion tombstone. */
  deletionFenced: boolean | null;
  rawClippingsErased: boolean | null;
  /** Whether the server's final flat listing was empty before Auth deletion. */
  rawClippingsEmptyAtCheck: boolean | null;
  /** Objects the server reported removing across every bounded attempt. */
  rawClippingsRemoved: number | null;
  /** Sweeps the server reported as not finished. */
  incomplete: DeletionSweep[];
  /** Sweeps the server said nothing about. Unknown is not failure. */
  unconfirmed: DeletionSweep[];
  /** True only when every sweep came back explicitly confirmed. */
  complete: boolean;
  observedAtIso: string;
};

/**
 * The request left this device but no answer proves its outcome (I5). Not a
 * failure: the server may have deleted the account. The request is remembered
 * (deletion-op-memo.ts), and the next attempt or the sign-in screen asks the
 * server for that request's result before anything else.
 */
export class AccountDeletionUnconfirmedError extends Error {
  constructor() {
    super("account deletion outcome is not confirmed yet");
    this.name = "AccountDeletionUnconfirmedError";
  }
}

function readFlag(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function readRemovedCount(value: unknown): number | null {
  if (typeof value !== "number") return null;
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

type EdgeBody = Record<string, unknown>;

/** Status and JSON body of a functions.invoke error; both null when no HTTP answer came back. */
async function readEdgeError(error: unknown): Promise<{ status: number | null; body: EdgeBody | null }> {
  const context = (error as {
    context?: {
      status?: unknown;
      clone?: () => { json?: () => Promise<unknown> };
      json?: () => Promise<unknown>;
    };
  } | null)?.context;
  const status = typeof context?.status === "number" ? context.status : null;
  if (status === null || !context) return { status: null, body: null };
  try {
    const readable = typeof context.clone === "function" ? context.clone() : context;
    if (typeof readable.json !== "function") return { status, body: null };
    const body = await readable.json();
    return { status, body: body && typeof body === "object" && !Array.isArray(body) ? body as EdgeBody : null };
  } catch {
    return { status, body: null };
  }
}

/** Removed-object count of a bounded Storage progress answer (409), or null when it is not one. */
function cleanupProgress(status: number | null, body: EdgeBody | null): number | null {
  if (
    status !== 409
    || body?.error !== "deletion_cleanup_in_progress"
    || body.deletion_fenced !== true
    || (body.raw_clippings_erased !== false && body.record_photos_erased !== false)
  ) return null;
  return readRemovedCount(body.raw_clippings_removed);
}

/** The server ended this request without deleting the account (I5 "실행 안 됨"). */
function definitelyNotExecuted(status: number | null, body: EdgeBody | null): boolean {
  if (status === 409 && body?.error === "op_closed") return true;
  if (status === 403 && body?.error === "op_rejected") return true;
  return (status === 500 || status === 503) && body?.op_status === "failed";
}

function receiptFrom(body: EdgeBody, opId: string | null, removedBeforeSuccess: number): AccountDeletionReceipt {
  const profileErased = readFlag(body.profile_erased);
  const deletionFenced = readFlag(body.deletion_fenced);
  const rawClippingsEmptyAtCheck = readFlag(body.raw_clippings_empty_at_check);
  const reportedRawClippingsErased = readFlag(body.raw_clippings_erased);
  // Permanent-erasure=true is a conclusion backed by all three server
  // observations, not a single legacy flag. A reported false remains false;
  // any contradictory or missing proof remains honestly unknown.
  const rawClippingsErased = reportedRawClippingsErased === false
    ? false
    : reportedRawClippingsErased === true
      && deletionFenced === true
      && rawClippingsEmptyAtCheck === true
      ? true
      : null;
  const finalRemoved = readRemovedCount(body.raw_clippings_removed);
  const rawClippingsRemoved = finalRemoved !== null
    && Number.isSafeInteger(removedBeforeSuccess + finalRemoved)
    ? removedBeforeSuccess + finalRemoved
    : null;
  const sweeps: [DeletionSweep, boolean | null][] = [
    ["profile", profileErased],
    ["rawClippings", rawClippingsErased],
  ];
  const incomplete = sweeps.filter(([, v]) => v === false).map(([k]) => k);
  const unconfirmed = sweeps.filter(([, v]) => v === null).map(([k]) => k);
  return {
    deleted: true,
    opId,
    profileErased,
    deletionFenced,
    rawClippingsErased,
    rawClippingsEmptyAtCheck,
    rawClippingsRemoved,
    incomplete,
    unconfirmed,
    complete: incomplete.length === 0 && unconfirmed.length === 0,
    observedAtIso: new Date().toISOString(),
  };
}

/** The receipt the SERVER recorded, for an answer this device did not receive live. */
export function accountDeletionReceiptFromServer(server: ServerDeletionReceipt): AccountDeletionReceipt {
  const sweeps: [DeletionSweep, boolean | null][] = [
    ["profile", server.sweeps.profileErased],
    ["rawClippings", server.sweeps.rawClippingsErased],
  ];
  const incomplete = sweeps.filter(([, v]) => v === false).map(([k]) => k);
  const unconfirmed = sweeps.filter(([, v]) => v === null).map(([k]) => k);
  return {
    deleted: true,
    opId: server.opId,
    profileErased: server.sweeps.profileErased,
    deletionFenced: server.sweeps.deletionFenced,
    rawClippingsErased: server.sweeps.rawClippingsErased,
    rawClippingsEmptyAtCheck: server.sweeps.rawClippingsEmptyAtCheck,
    rawClippingsRemoved: null,
    incomplete,
    unconfirmed,
    complete: incomplete.length === 0 && unconfirmed.length === 0,
    observedAtIso: new Date().toISOString(),
  };
}

type Invoke = (
  body: Record<string, string>,
  accessToken: string,
  signal: AbortSignal,
) => Promise<{ data: unknown; error: unknown }>;

/**
 * An earlier request of this owner whose answer was lost. Only a definite
 * server answer changes anything: completed returns its receipt (no second
 * deletion), failed / abandoned forget the request, anything else is left for
 * the server to settle. A completed request found here is finished by the
 * caller exactly like a live answer.
 */
async function resolveEarlierRequests(owner: string): Promise<AccountDeletionReceipt | null> {
  for (const memo of await listDeletionOpMemos(owner)) {
    if (memo.phase === "pending") {
      if (Date.now() - memo.at >= PENDING_DELETION_OP_STALE_MS) await clearDeletionOpMemo(owner, memo.opId);
      continue;
    }
    if (memo.phase === "terminal") continue;
    const answer = await fetchAccountDeletionOpStatus({ opId: memo.opId, token: memo.token, owner });
    if (answer.status !== "known") continue;
    if (answer.op === "completed" && answer.receipt) return accountDeletionReceiptFromServer(answer.receipt);
    if (answer.op === "failed" || answer.op === "abandoned") await clearDeletionOpMemo(owner, memo.opId);
  }
  return null;
}

/** The old flow: body `{}`, one bounded progress loop. Used only when the server has no 0217. */
async function requestLegacyAccountDeletion(
  invoke: Invoke,
  refresh: () => Promise<string>,
  deadlineAt: number,
): Promise<AccountDeletionReceipt> {
  let removedBeforeSuccess = 0;
  for (let attempt = 0; attempt < ACCOUNT_DELETION_MAX_ATTEMPTS; attempt += 1) {
    if (Date.now() >= deadlineAt) throw new Error("account deletion retry deadline exhausted");
    const accessToken = await refresh();
    const remainingMs = deadlineAt - Date.now();
    if (remainingMs <= 0) throw new Error("account deletion retry deadline exhausted");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), remainingMs);
    let invocation: { data: unknown; error: unknown };
    try {
      invocation = await invoke({}, accessToken, controller.signal);
    } finally {
      clearTimeout(timeout);
    }
    if (invocation.error) {
      const { status, body } = await readEdgeError(invocation.error);
      const removed = cleanupProgress(status, body);
      if (removed === null || !Number.isSafeInteger(removedBeforeSuccess + removed)) throw invocation.error;
      removedBeforeSuccess += removed;
      continue;
    }
    const body = invocation.data as EdgeBody | null;
    if (body?.deleted !== true) throw new Error("account deletion did not complete");
    const opId = typeof body.op_id === "string" && isDeletionOpId(body.op_id) ? body.op_id : null;
    return receiptFrom(body, opId, removedBeforeSuccess);
  }
  throw new Error("account deletion retry bound exhausted");
}

/** Terminal account erasure (0217 begin -> execute). Compares both live session
 *  reads with the user id captured at confirmation, then binds that exact
 *  refreshed token to every Edge request. An account switch cannot retarget an
 *  already-open confirmation.
 *
 *  Order (docs/design/deletion-receipt-server-261006.md 5절):
 *    1. remember the request number (pending), then `begin`: the server records
 *       the request and signs a token. Nothing is destroyed yet.
 *    2. remember the token and read it back (armed). Only then `execute`.
 *    3. a lost or unreadable answer asks the server about THIS request (I5).
 *  No local write is blocked on the way: the irreversible local fence goes up
 *  only after the server confirmed the deletion (deletion-completion.ts, I7).
 *  The cross-tab auth lock is used when the browser has Web Locks and is not
 *  required when it does not (W2): the server serializes the account's
 *  deletions itself, so the lock only orders this tab's own auth writes.
 *
 *  Returns the receipt instead of discarding it. The function reports the two
 *  observed post-deletion checks separately, and a failed check is NOT a failed
 *  deletion — auth.users is already gone and the cascade already ran.
 *  Throwing on a partial would tell the user deletion failed when it did not,
 *  and would offer a destructive retry against a dead account. So the partial
 *  travels back as data and the screen decides what to say. */
export async function requestAccountDeletion(
  expected: AuthSessionExpectation,
): Promise<AccountDeletionReceipt> {
  const supabase = getSupabaseClient();
  const runtime = getAuthStorageRuntime();
  const deadlineAt = Date.now() + ACCOUNT_DELETION_DEADLINE_MS;
  return runtime.runMutation(async () => {
    if (expected.userId === null || expected.sessionId === null) {
      throw new AuthSessionOwnerChangedError();
    }
    const owner = expected.userId;
    // Keep every request inside the same mutation owner. Refresh may rotate the
    // token, but the captured user/session identity must not move.
    const refresh = () => refreshExpectedSessionInsideMutation(supabase.auth, expected);
    const invoke: Invoke = (body, accessToken, signal) => supabase.functions.invoke("delete-account", {
      body,
      headers: { Authorization: `Bearer ${accessToken}` },
      signal,
    });

    const earlier = await resolveEarlierRequests(owner);
    if (earlier) return earlier;

    // 1. begin. Nothing is destroyed on this request; every failure here is definite.
    const opId = newDeletionOpId();
    await writeDeletionOpMemo({ v: 1, phase: "pending", owner, opId, at: Date.now() });
    let opToken: string;
    try {
      const accessToken = await refresh();
      const remainingMs = deadlineAt - Date.now();
      if (remainingMs <= 0) throw new Error("account deletion retry deadline exhausted");
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), remainingMs);
      let begun: { data: unknown; error: unknown };
      try {
        begun = await invoke({ op: "begin", op_id: opId }, accessToken, controller.signal);
      } finally {
        clearTimeout(timeout);
      }
      if (begun.error) {
        const { status } = await readEdgeError(begun.error);
        if (status === 400) {
          // An Edge without 0217 (`{}` only) or with 0217 not applied: the old
          // flow, which keeps no server record and so gives no receipt number.
          await clearDeletionOpMemo(owner, opId);
          return await requestLegacyAccountDeletion(invoke, refresh, deadlineAt);
        }
        throw begun.error;
      }
      const body = begun.data as EdgeBody | null;
      if (body?.op_id !== opId || typeof body.op_token !== "string" || !/^v1\.[A-Za-z0-9_-]{43}$/.test(body.op_token)) {
        throw new Error("account deletion request was not recorded");
      }
      opToken = body.op_token;
    } catch (error) {
      await clearDeletionOpMemo(owner, opId);
      throw error;
    }

    // 2. arm. The execute request leaves only after the token is durably remembered.
    const armed = await writeDeletionOpMemo({ v: 1, phase: "armed", owner, opId, token: opToken, at: Date.now() });
    if (!armed) {
      await clearDeletionOpMemo(owner, opId);
      throw new Error("account deletion request could not be remembered on this device");
    }

    // 3. execute, with bounded Storage progress retries.
    let removedBeforeSuccess = 0;
    let executeSent = false;
    for (let attempt = 0; attempt < ACCOUNT_DELETION_MAX_ATTEMPTS; attempt += 1) {
      if (Date.now() >= deadlineAt) break;
      let invocation: { data: unknown; error: unknown };
      try {
        const accessToken = await refresh();
        const remainingMs = deadlineAt - Date.now();
        if (remainingMs <= 0) break;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), remainingMs);
        try {
          executeSent = true;
          invocation = await invoke({ op: "execute", op_id: opId, op_token: opToken }, accessToken, controller.signal);
        } finally {
          clearTimeout(timeout);
        }
      } catch {
        // A refresh that fails here may mean the account is already gone.
        break;
      }
      if (!invocation.error) {
        const body = invocation.data as EdgeBody | null;
        if (body?.deleted === true) return receiptFrom(body, opId, removedBeforeSuccess);
        break;
      }
      const { status, body } = await readEdgeError(invocation.error);
      const removed = cleanupProgress(status, body);
      if (removed !== null && Number.isSafeInteger(removedBeforeSuccess + removed)) {
        removedBeforeSuccess += removed;
        continue;
      }
      if (status === 401 && body?.error === "fresh_session_required") continue;
      if (definitelyNotExecuted(status, body)) {
        await clearDeletionOpMemo(owner, opId);
        throw invocation.error;
      }
      break;
    }

    // Nothing left this device: the server holds only an accepted request, which
    // it abandons on its own after ten minutes. That is a definite "not executed".
    if (!executeSent) {
      await clearDeletionOpMemo(owner, opId);
      throw new Error("account deletion request was not sent");
    }

    // 4. The answer is lost or unreadable: ask the server about this request.
    const answer = await fetchAccountDeletionOpStatus({ opId, token: opToken, owner });
    if (answer.status === "known") {
      if (answer.op === "completed" && answer.receipt) return accountDeletionReceiptFromServer(answer.receipt);
      if (answer.op === "failed" || answer.op === "abandoned") {
        await clearDeletionOpMemo(owner, opId);
        throw new Error("account deletion did not complete");
      }
    }
    throw new AccountDeletionUnconfirmedError();
  });
}
