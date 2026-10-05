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
import { randomUUID } from "expo-crypto";
import {
  addPendingAccountDeletion,
  removePendingAccountDeletion,
  resolvePendingAccountDeletion,
} from "../account/deletion-pending";
import {
  fetchAccountDeletionReceipt,
  normalizeReceiptId,
  type ReceiptLookup,
  type ServerDeletionReceipt,
} from "../account/deletion-receipt";
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
 * latter without resetting the clock on each retry. A lost answer then gets one
 * receipt lookup of its own, bounded by ACCOUNT_DELETION_RECEIPT_LOOKUP_MS. */
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
  /** The server-recorded receipt number (0217), or null when none was recorded. */
  receiptId: string | null;
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

/** The server may have erased the account, but no answer proves it yet.
 *
 * Thrown only after a delete-account request was actually sent and its answer
 * was lost or unreadable, and the receipt lookup for that exact request found
 * nothing (or could not be asked). The request is remembered on this device
 * (deletion-pending.ts) and resolved later by its receipt number. No terminal
 * local fence is installed for it: that happens only after the server confirms. */
export class AccountDeletionUnconfirmedError extends Error {
  constructor(readonly requestId: string) {
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

/** One reading of the server's observations, shared by the live Edge answer
 *  and a receipt read back later, so both say exactly the same thing. */
export function accountDeletionReceiptFromObservations(
  body: Record<string, unknown>,
  extra: { receiptId: string | null; removedBeforeSuccess: number; observedAtIso: string },
): AccountDeletionReceipt {
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
    && Number.isSafeInteger(extra.removedBeforeSuccess + finalRemoved)
    ? extra.removedBeforeSuccess + finalRemoved
    : null;
  const sweeps: [DeletionSweep, boolean | null][] = [
    ["profile", profileErased],
    ["rawClippings", rawClippingsErased],
  ];
  const incomplete = sweeps.filter(([, v]) => v === false).map(([k]) => k);
  const unconfirmed = sweeps.filter(([, v]) => v === null).map(([k]) => k);
  return {
    deleted: true,
    receiptId: extra.receiptId,
    profileErased,
    deletionFenced,
    rawClippingsErased,
    rawClippingsEmptyAtCheck,
    rawClippingsRemoved,
    incomplete,
    unconfirmed,
    complete: incomplete.length === 0 && unconfirmed.length === 0,
    observedAtIso: extra.observedAtIso,
  };
}

/** A receipt the server recorded is itself the proof of erasure (0217 writes it
 *  inside the transaction that deletes the profile row). */
export function accountDeletionReceiptFromServer(receipt: ServerDeletionReceipt): AccountDeletionReceipt {
  return accountDeletionReceiptFromObservations(receipt.sweeps, {
    receiptId: receipt.id,
    removedBeforeSuccess: 0,
    observedAtIso: receipt.erasedAtIso,
  });
}

// Error codes delete-account returns only BEFORE anything destructive, or after
// it observed the Auth user still present (`account_delete_failed`). An answer
// carrying one of these proves this request did not erase the account. Every
// other failure after a request left - transport errors, aborts, relay errors,
// `server_unavailable`, unreadable bodies - is ambiguous.
const INTACT_ERROR_CODES = new Set([
  "origin_not_allowed",
  "method_not_allowed",
  "unsupported_media_type",
  "invalid_content_length",
  "body_too_large",
  "invalid_body",
  "body_timeout",
  "missing_authorization",
  "invalid_authorization",
  "fresh_session_required",
  "deletion_precondition_failed",
  "deletion_cleanup_in_progress",
  "account_delete_failed",
]);

type InvokeFailure =
  | { kind: "progress"; removed: number }
  | { kind: "intact"; code: string | null }
  | { kind: "ambiguous" };

async function classifyInvokeFailure(error: unknown): Promise<InvokeFailure> {
  const context = (error as {
    context?: {
      status?: unknown;
      clone?: () => { json?: () => Promise<unknown> };
      json?: () => Promise<unknown>;
    };
  } | null)?.context;
  // FunctionsFetchError carries the transport error, not a Response: the
  // request may or may not have reached the function.
  if (typeof context?.status !== "number") return { kind: "ambiguous" };
  type FailureBody = {
    error?: unknown;
    deletion_fenced?: unknown;
    raw_clippings_erased?: unknown; record_photos_erased?: unknown;
    raw_clippings_removed?: unknown;
  } | null;
  let body: FailureBody = null;
  try {
    const readable = typeof context.clone === "function" ? context.clone() : context;
    if (typeof readable.json === "function") body = await readable.json() as FailureBody;
  } catch {
    body = null;
  }
  const code = typeof body?.error === "string" ? body.error : null;
  if (context.status === 409 && code === "deletion_cleanup_in_progress") {
    const removed = readRemovedCount(body?.raw_clippings_removed);
    if (
      body?.deletion_fenced === true
      && (body.raw_clippings_erased === false || body.record_photos_erased === false)
      && removed !== null
    ) return { kind: "progress", removed };
    // A malformed progress answer is still pre-destructive: nothing retries it.
    return { kind: "intact", code };
  }
  if (code !== null && INTACT_ERROR_CODES.has(code)) return { kind: "intact", code };
  return { kind: "ambiguous" };
}

type DeletionAttempt =
  | { kind: "deleted"; receipt: AccountDeletionReceipt; requestIdSent: boolean }
  | { kind: "ambiguous"; requestId: string };

/** Terminal account erasure. Compares both live session reads with the user id
 *  captured at confirmation, then binds that exact refreshed token to the Edge
 *  request. An account switch cannot retarget an already-open confirmation;
 *  throws unless terminal deletion is confirmed so the caller can proceed.
 *
 *  Returns the receipt instead of discarding it. The function reports the two
 *  observed post-deletion checks separately, and a failed check is NOT a
 *  failed deletion — auth.users is already gone and the cascade already ran.
 *  Throwing on a partial would tell the user deletion failed when it did not,
 *  and would offer a destructive retry against a dead account. So the partial
 *  travels back as data and the screen decides what to say.
 *
 *  The local terminal fence is NOT installed here any more. It is installed by
 *  purgeDeletedAccountLocalData only after this function confirms the erasure,
 *  so a request that never reached the server leaves no permanent fence on a
 *  live account. A lost answer throws AccountDeletionUnconfirmedError and stays
 *  resolvable by receipt number (deletion-pending.ts). */
export async function requestAccountDeletion(
  expected: AuthSessionExpectation,
  options: {
    lookupReceipt?: (receiptId: string) => Promise<ReceiptLookup>;
    newRequestId?: () => string;
  } = {},
): Promise<AccountDeletionReceipt> {
  if (expected.userId === null || expected.sessionId === null) {
    throw new AuthSessionOwnerChangedError();
  }
  const owner = expected.userId;
  const lookup = options.lookupReceipt ?? ((receiptId: string) => fetchAccountDeletionReceipt(receiptId));

  // An earlier attempt on this device whose answer never arrived may already
  // have finished. Its server receipt is proof; never erase twice.
  const prior = await resolvePendingAccountDeletion(owner, { lookup });
  if (prior.kind === "deleted") return accountDeletionReceiptFromServer(prior.receipt);
  // ...or it may still be running on the server. A second request beside it
  // would race it for the tombstone's receipt number, and a lost answer could
  // then never be resolved (gate DEL2-R1-03). Wait out its lease instead; a
  // request past its lease cannot be running any more.
  if (prior.kind === "pending" && prior.inFlightRequestId !== null) {
    throw new AccountDeletionUnconfirmedError(prior.inFlightRequestId);
  }

  const supabase = getSupabaseClient();
  const runtime = getAuthStorageRuntime();
  const deadlineAt = Date.now() + ACCOUNT_DELETION_DEADLINE_MS;
  const requestId = (options.newRequestId ?? randomUUID)().toLowerCase();

  const attempt = await runtime.runMutation(async (): Promise<DeletionAttempt> => {
    // Remember the request before it leaves, so a lost answer stays resolvable.
    // False means the note was not written; the network then sees 0 calls.
    if (!(await addPendingAccountDeletion(owner, requestId))) {
      throw new Error("account deletion pending note was not acknowledged");
    }
    let removedBeforeSuccess = 0;
    // A delete-account deployed before 0217 accepts only `{}` and answers
    // 400 invalid_body - before anything destructive - to the request id. Fall
    // back to `{}` once so a client released first still deletes; that older
    // function records no receipt, and the answer then carries none.
    let requestBody: Record<string, string> = { request_id: requestId };
    try {
      for (let attemptIndex = 0; attemptIndex < ACCOUNT_DELETION_MAX_ATTEMPTS; attemptIndex += 1) {
        if (Date.now() >= deadlineAt) throw new Error("account deletion retry deadline exhausted");
        // Keep every retry inside the same cross-tab mutation owner. Refresh may
        // rotate the token, but the captured user/session identity must not move.
        const accessToken = await refreshExpectedSessionInsideMutation(supabase.auth, expected);

        // Refresh can consume most of the same absolute budget. Recompute here so
        // the Edge signal expires at the original deadline, never one refresh later.
        const remainingMs = deadlineAt - Date.now();
        if (remainingMs <= 0) throw new Error("account deletion retry deadline exhausted");
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), remainingMs);
        let invocation: Awaited<ReturnType<typeof supabase.functions.invoke>>;
        try {
          invocation = await supabase.functions.invoke("delete-account", {
            body: requestBody,
            headers: { Authorization: `Bearer ${accessToken}` },
            signal: controller.signal,
          });
        } catch {
          // The request may have left before the client gave up on it.
          return { kind: "ambiguous", requestId };
        } finally {
          clearTimeout(timeout);
        }
        const { data, error } = invocation;
        if (error) {
          const failure = await classifyInvokeFailure(error);
          if (failure.kind === "ambiguous") return { kind: "ambiguous", requestId };
          if (failure.kind === "intact") {
            if (
              failure.code === "invalid_body"
              && "request_id" in requestBody
              && attemptIndex + 1 < ACCOUNT_DELETION_MAX_ATTEMPTS
            ) {
              requestBody = {};
              continue;
            }
            throw error;
          }
          if (!Number.isSafeInteger(removedBeforeSuccess + failure.removed)) throw error;
          removedBeforeSuccess += failure.removed;
          if (
            attemptIndex + 1 < ACCOUNT_DELETION_MAX_ATTEMPTS
            && Date.now() < deadlineAt
          ) continue;
          throw error;
        }

        const body = data as Record<string, unknown> | null;
        // delete-account answers 200 only with deleted:true. Anything else is
        // not proof either way.
        if (!body || typeof body !== "object" || body.deleted !== true) {
          return { kind: "ambiguous", requestId };
        }
        const receiptId = typeof body.receipt_id === "string"
          ? normalizeReceiptId(body.receipt_id)
          : null;
        return {
          kind: "deleted",
          receipt: accountDeletionReceiptFromObservations(body, {
            receiptId,
            removedBeforeSuccess,
            observedAtIso: new Date().toISOString(),
          }),
          requestIdSent: "request_id" in requestBody,
        };
      }
      throw new Error("account deletion retry bound exhausted");
    } catch (error) {
      // Every throw above is a definite "this request did not erase the
      // account": nothing was sent, or the server answered before anything
      // destructive. Forget the request without waiting on storage.
      void removePendingAccountDeletion(owner, requestId);
      throw error;
    }
  }, { requireCrossTab: true });

  if (attempt.kind === "deleted") {
    if (attempt.receipt.receiptId !== null || !attempt.requestIdSent) return attempt.receipt;
    // The erasure is confirmed but the answer carried no receipt number. The
    // row may still exist: delete-account returns a number only after it could
    // prove the row, and that proof can fail on its own (gate DEL2-R1-08). Ask
    // once by the number this request proposed; anything but "found" keeps null.
    try {
      const recorded = await lookup(requestId);
      if (recorded.status === "found" && recorded.receipt.id === requestId) {
        return { ...attempt.receipt, receiptId: requestId };
      }
    } catch {
      // A failed lookup only means the number stays unknown.
    }
    return attempt.receipt;
  }

  // The answer was lost. The server records the receipt in the same transaction
  // that erases the profile row, so its presence is the proof we did not hear.
  const found = await lookup(attempt.requestId);
  if (found.status === "found") return accountDeletionReceiptFromServer(found.receipt);
  throw new AccountDeletionUnconfirmedError(attempt.requestId);
}
