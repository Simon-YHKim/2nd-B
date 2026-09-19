// Bulk + scoped record deletion. All operations are RLS-scoped to
// auth.uid() so the userId argument is belt-and-suspenders alongside
// the policy. Each helper returns the affected row count so the UI can show
// 'Deleted N records'. Sources go with their raw-clippings originals (wiki/source-erasure).

import { getSupabaseClient } from "../supabase/client";
import { invalidateDomainLevels } from "../persona/load-domain-levels";
import {
  AuthSessionOwnerChangedError,
  getAuthStorageRuntime,
  refreshExpectedSessionInsideMutation,
  type AuthSessionExpectation,
} from "../auth/session-mutation";
import { installAccountLocalDeletionFence } from "../account/local-deletion-fence";
import { eraseRawClippingFolder, eraseSourcesWithRawClippings, runBoundToOwnerSession, type SessionGuard, type SourceErasure } from "../wiki/source-erasure";

/** Delete every record belonging to the user. Returns affected count. */
export async function deleteAllRecords(userId: string): Promise<number> {
  const supabase = getSupabaseClient();
  const { count, error } = await supabase
    .from("records")
    .delete({ count: "exact" })
    .eq("user_id", userId);
  if (error) throw error;
  // Records shift domain levels — drop this user's cached constellation
  // (same contract as createRecord/deleteRecord in create.ts).
  if ((count ?? 0) > 0) invalidateDomainLevels(userId);
  return count ?? 0;
}

/** Delete records by kind (e.g. only 'journal' or only 'note'). */
export async function deleteRecordsByKind(
  userId: string,
  kind: "journal" | "note" | "audit_response",
): Promise<number> {
  const supabase = getSupabaseClient();
  const { count, error } = await supabase
    .from("records")
    .delete({ count: "exact" })
    .eq("user_id", userId)
    .eq("kind", kind);
  if (error) throw error;
  // Records shift domain levels — drop this user's cached constellation
  // (same contract as createRecord/deleteRecord in create.ts).
  if ((count ?? 0) > 0) invalidateDomainLevels(userId);
  return count ?? 0;
}

/** Delete records whose tags array overlaps with any of the tags. */
export async function deleteRecordsByTag(userId: string, tags: string[]): Promise<number> {
  if (tags.length === 0) return 0;
  const supabase = getSupabaseClient();
  const { count, error } = await supabase
    .from("records")
    .delete({ count: "exact" })
    .eq("user_id", userId)
    .overlaps("tags", tags);
  if (error) throw error;
  // Records shift domain levels — drop this user's cached constellation
  // (same contract as createRecord/deleteRecord in create.ts).
  if ((count ?? 0) > 0) invalidateDomainLevels(userId);
  return count ?? 0;
}

/** Delete an explicit list of record IDs (bulk-select UI). */
export async function deleteRecordsByIds(userId: string, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const supabase = getSupabaseClient();
  const { count, error } = await supabase
    .from("records")
    .delete({ count: "exact" })
    .eq("user_id", userId)
    .in("id", ids);
  if (error) throw error;
  // Records shift domain levels — drop this user's cached constellation
  // (same contract as createRecord/deleteRecord in create.ts).
  if ((count ?? 0) > 0) invalidateDomainLevels(userId);
  return count ?? 0;
}

/** Delete every wiki page (cascades wiki_links). Sources are untouched. */
/** Delete specific sources by id (import-hub 철회 — removes the derived rows
 *  a ratified import created) together with their raw-clippings originals,
 *  raw first (wiki/source-erasure.ts). Owner-scoped. A row a wiki page still
 *  points at is left in place with its original, so the count comes up short
 *  and the callers' findSurvivingSourceIds check reports it - the same outcome
 *  the row delete used to reach by failing on the source_kind_pair CHECK. */
export async function deleteSourcesByIds(userId: string, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  return (await eraseSourcesWithRawClippings(userId, { ids })).deleted;
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
  // Bound to the session that asks (R30, JA-1839-3): under another session RLS hides these rows and an
  // empty answer would read as "withdrawn", dropping the only pointer to rows that still exist.
  return runBoundToOwnerSession(userId, async (guard) => {
    const { data, error } = await getSupabaseClient().from("sources").select("id").eq("user_id", userId).in("id", ids);
    await guard();
    if (error) throw error;
    return ((data ?? []) as { id: string }[]).map((row) => row.id);
  });
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

/** Delete every un-ingested source with its raw-clippings original, raw first
 *  so a failure leaves the row to retry from (wiki/source-erasure.ts). A row a
 *  kind='source' wiki page still points at is already organized into the wiki,
 *  whatever its flag says, and the wiki_pages_source_kind_pair CHECK blocks its
 *  delete: it keeps its original too and is counted in `kept`. It used to fail
 *  the whole bulk delete. The settings screen reports `kept` next to the count,
 *  never as a plain "deleted" toast. Throws when a row it should have deleted
 *  is still there, when rows are left in place (SourceErasureIncompleteError) or the session changed. */
export async function deleteUningestedSources(userId: string): Promise<SourceErasure> {
  return eraseSourcesWithRawClippings(userId, { uningested: true });
}

/** Delete every source (after wiki pages are deleted), then empty the owner's
 *  raw-clippings folder, rows first: with every row gone the folder listing is
 *  itself what a retry resumes from (wiki/source-erasure.ts). Throws while any
 *  object remains, so the wipe never reports done over a leftover original.
 *  Safe-order: call deleteAllWikiPages first when you want a full wipe. Bound
 *  to the session that starts it, like every eraser here (R30, JA-1839-3): an
 *  account switch mid-call ends it as AuthSessionOwnerChangedError, never as a
 *  count RLS shrank to zero. */
export async function deleteAllSources(userId: string): Promise<number> {
  return runBoundToOwnerSession(userId, async (guard) => {
    const count = await deleteSourceRowsInSession(userId, guard);
    await eraseRawClippingFolder(userId, guard);
    return count;
  });
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

// Tables a client CANNOT erase (no DELETE RLS policy) and that therefore only
// disappear via the service-role public.users cascade in requestAccountDeletion:
//   personas (0008), memorized_patterns (0017), xp_events (0019),
//   consent_records (0031, append-only ledger), ai_audit_log (0004).
// A content wipe keeps the account, so it intentionally leaves those in place.

/** Content wipe (keeps the account): wiki pages -> sources and their
 *  raw-clippings folder -> records -> chat_usage -> self_contexts -> owned
 *  clipper templates. Order matters for the source_id pair CHECK on wiki_pages.
 *  The derived tables are best-effort: a failure on one (e.g. RLS) is logged
 *  and skipped so the wipe still clears the rest. RLS-protected derived data
 *  (personas/memorized_patterns/xp) is only erased by requestAccountDeletion. */
export async function deleteAllUserData(userId: string): Promise<{
  records: number;
  sources: number;
  wikiPages: number;
  chatUsage: number;
  selfContexts: number;
  clipperTemplates: number;
}> {
  // Bound to the session that started it (R30, JA-1839-3 · JZ-1839-2): every step
  // runs inside the auth mutation lock and re-reads the live session after each
  // request, so an account switch mid-wipe ends it as a failure instead of letting
  // RLS answer "nothing here" for rows it can no longer see. The raw-clippings
  // sweep is the one step whose failure does not stop the later ones: an object it
  // cannot remove must not keep records from ever being wiped (JZ-1839-1). The
  // call still ends in that error, so the screen never reports done over it.
  // The steps live in wipeContentInSession at the end of this file, below the
  // account-deletion lines the DPIA cites by number.
  return runBoundToOwnerSession(userId, (guard) => wipeContentInSession(userId, guard));
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

function readFlag(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function readRemovedCount(value: unknown): number | null {
  if (typeof value !== "number") return null;
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

async function readCleanupProgress(error: unknown): Promise<number | null> {
  const context = (error as {
    context?: {
      status?: unknown;
      clone?: () => { json?: () => Promise<unknown> };
      json?: () => Promise<unknown>;
    };
  } | null)?.context;
  if (context?.status !== 409) return null;
  try {
    const readable = typeof context.clone === "function" ? context.clone() : context;
    if (typeof readable.json !== "function") return null;
    const body = await readable.json() as {
      error?: unknown;
      deletion_fenced?: unknown;
      raw_clippings_erased?: unknown;
      raw_clippings_removed?: unknown;
    } | null;
    if (
      body?.error !== "deletion_cleanup_in_progress"
      || body.deletion_fenced !== true
      || body.raw_clippings_erased !== false
    ) return null;
    return readRemovedCount(body.raw_clippings_removed);
  } catch {
    return null;
  }
}

/** Terminal account erasure. Compares both live session reads with the user id
 *  captured at confirmation, then binds that exact refreshed token to the Edge
 *  request. An account switch cannot retarget an already-open confirmation;
 *  throws unless terminal deletion is confirmed so the caller can proceed.
 *
 *  Returns the receipt instead of discarding it. The function reports the two
 *  observed post-deletion checks separately (index.ts:244-283), and a failed
 *  check is NOT a failed deletion — auth.users is already gone and the cascade
 *  already ran.
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
    // Publish and durably read back the local owner tombstone before the first
    // destructive Edge invocation. False means another tab could not be joined
    // or persistence failed, so deletion stays on hold and the network sees 0
    // delete-account calls.
    const localFenceAcknowledged = await installAccountLocalDeletionFence(expected.userId);
    if (!localFenceAcknowledged) {
      throw new Error("account local deletion fence was not acknowledged");
    }
    let removedBeforeSuccess = 0;

    for (let attempt = 0; attempt < ACCOUNT_DELETION_MAX_ATTEMPTS; attempt += 1) {
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
          body: {},
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
      const { data, error } = invocation;
      if (error) {
        const removed = await readCleanupProgress(error);
        if (removed === null || !Number.isSafeInteger(removedBeforeSuccess + removed)) throw error;
        removedBeforeSuccess += removed;
        if (
          attempt + 1 < ACCOUNT_DELETION_MAX_ATTEMPTS
          && Date.now() < deadlineAt
        ) continue;
        throw error;
      }

      const body = data as
        | {
            deleted?: unknown;
            profile_erased?: unknown;
            deletion_fenced?: unknown;
            raw_clippings_erased?: unknown;
            raw_clippings_empty_at_check?: unknown;
            raw_clippings_removed?: unknown;
          }
        | null;
      if (body?.deleted !== true) {
        throw new Error("account deletion did not complete");
      }
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

    throw new Error("account deletion retry bound exhausted");
  }, { requireCrossTab: true });
}

// --- content wipe steps (R30) -------------------------------------------------
// Below requestAccountDeletion on purpose: the DPIA cites the lines above by
// number, so new code goes after them.

/** The sources rows only; the folder sweep follows (deleteAllSources,
 *  wipeContentInSession). Call inside runBoundToOwnerSession. */
async function deleteSourceRowsInSession(userId: string, guard: SessionGuard): Promise<number> {
  const { count, error } = await getSupabaseClient()
    .from("sources")
    .delete({ count: "exact" })
    .eq("user_id", userId);
  await guard();
  if (error) throw error;
  return count ?? 0;
}

/** deleteAllUserData's steps, in order, each checked against the session that
 *  started the wipe. A raw-clippings sweep failure is held until the end so an
 *  object the sweep cannot remove never stops the records from being wiped; a
 *  session change is not held - it stops the wipe where it is. */
async function wipeContentInSession(
  userId: string,
  guard: SessionGuard,
): Promise<Awaited<ReturnType<typeof deleteAllUserData>>> {
  const wikiPages = await deleteAllWikiPages(userId);
  await guard();
  const sources = await deleteSourceRowsInSession(userId, guard);
  let rawClippingsFailure: unknown = null;
  try {
    await eraseRawClippingFolder(userId, guard);
  } catch (e) {
    if (e instanceof AuthSessionOwnerChangedError) throw e;
    rawClippingsFailure = e;
  }
  const records = await deleteAllRecords(userId);
  await guard();
  const chatUsage = await deleteAllChatUsage(userId);
  await guard();
  const selfContexts = await bestEffort(() => deleteAllSelfContexts(userId), "self_contexts");
  await guard();
  const clipperTemplates = await bestEffort(
    () => deleteAllOwnedClipperTemplates(userId),
    "clipper_templates",
  );
  await guard();
  if (rawClippingsFailure !== null) throw rawClippingsFailure;
  return { records, sources, wikiPages, chatUsage, selfContexts, clipperTemplates };
}
