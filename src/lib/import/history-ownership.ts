// Which import owns which source row (import-hub 이력/철회).
//
// The import log (history.ts) is shared: /import-hub and /import both render every
// entry and both withdraw any of them, and 철회 deletes the source rows the entry
// points at. So an entry may only point at rows its own import created, and a
// withdrawal may only delete rows that are the withdrawn entry's own.
//
// Both halves broke on one path (vibe r260919 r29 §3-6, 2026-09-20): ratifying the
// same file with the same selection twice in the hub made the second capture an
// exact duplicate, which hands back the FIRST import's row and writes nothing. The
// hub logged that row on the second entry anyway, so withdrawing the second entry
// deleted the first import's row and left the first entry pointing at nothing. The
// file import never logged duplicates (its createdIds), so only the hub wrote such
// entries - but the ones already written can be withdrawn from either screen.
//
// Whose row it is (vibe r260919 LA-1841-1, 2026-09-20). The first fix kept a row while
// any other entry in the log pointed at it, so it read "no other pointer" as "mine".
// The log cannot prove that: it lives on one device and keeps the latest 50 entries.
// An old duplicate entry E2=[R] still deleted R when its first import E1 had been
// pushed out by the cap, lived on another device, or never had an entry at all (a
// /capture clip of the same text). Ownership is now proved instead:
//
//   - `owned` entries (logged from 2026-09-20) list only rows their import created, and
//     so do the file import's entries, which never logged anything else (#898). Their
//     withdrawal deletes every row they list.
//   - An older hub entry asks the server. capture.ts writes an ingest_log row (stage
//     exact_duplicate, survivor_id = the row) before it hands an existing row back,
//     and has since the dedup gate landed (4d5fef8a, 2026-06-16). A row with no such
//     record was never handed back, so the only entry that can list it is the one whose
//     import created it: deleted. A row with records is kept - except that with exactly
//     one record and exactly one other holder in the log, the two holders are its
//     creator and its one duplicate, so once this one is withdrawn the other becomes
//     its owner and deletes it on its own withdrawal.
//   - "No record" proves nothing once records may have been purged (0056's purge, run
//     nightly since 0067). Every record of a row is at least as young as the row, so a
//     row young enough on the SERVER's clock still has all of them. The device clock
//     plays no part (vibe r260919 L2A-1841-3 · L2Z-1841-3): a row too old, or whose age
//     cannot be read, is kept and reported as unconfirmed.
//
// A withdrawal also runs in one session (L2A-1841-2 · L2Z-1841-1): under another
// account RLS answers every read with nothing, and "nothing there" would read as
// "already deleted". pinWithdrawalSession binds it; history.ts checks it after every
// server step.
//
// The judgement is pure; askAboutRows is its one server read.

import { getSupabaseClient } from "../supabase/client";
import {
  AuthSessionOwnerChangedError,
  assertExpectedSessionInsideMutation,
  captureAuthSessionExpectation,
  getAuthStorageRuntime,
} from "../auth/session-mutation";
import type { CaptureResult } from "../wiki/capture";
import type {
  ImportHistoryEntry,
  ImportWithdrawalJudge,
  ImportWithdrawalKept,
  ImportWithdrawalPlan,
  WithdrawalSession,
} from "./history";

/** The part of a capture's answer the import log cares about. */
export interface CapturedSource {
  source: { id: string };
  deduped: CaptureResult["deduped"];
}

/**
 * The source ids an import may log as its own: the rows its capture created.
 * An exact duplicate hands back a row an earlier capture made and writes nothing
 * (capture.ts), so logging it would give that row to this import's 철회. A near
 * duplicate is a new row (only linked to its survivor via dedup_of), so it counts.
 */
export function createdSourceIds(result: CapturedSource): string[] {
  return result.deduped === "exact_duplicate" ? [] : [result.source.id];
}

/** The file import's sourceKey. Its entries never listed an exact duplicate. */
const FILE_IMPORT_KEY = "file";

/**
 * How old a row may be, on the server's clock, for ingest_log to still hold every record
 * of it. Migration 0056 purges drop records older than 365 days and 0067 schedules that
 * nightly. A record is never older than its row, so a row younger than 365 days still has
 * all of its records. 30 days of margin.
 */
const DROP_LEDGER_TRUST_MS = 335 * 24 * 60 * 60 * 1000;

type Holder = Pick<ImportHistoryEntry, "id" | "sourceKey" | "atIso" | "sourceIds" | "owned">;

/** What the server said about one row a withdrawal asked about. */
export interface RowAnswer {
  /** Exact duplicate hand-backs of the row in ingest_log: 0, 1, or 2 meaning more. */
  handedBack: number;
  /** The row's captured_at on the server's clock, in ms. null: no such row, or unreadable. */
  capturedAtMs: number | null;
}

function ownsItsRows(entry: Holder): boolean {
  return entry.owned === true || entry.sourceKey === FILE_IMPORT_KEY;
}

/**
 * Whether `answer` counts every record of its row. Both times are the server's: the row's
 * captured_at, and a ceiling the server's clock had not reached when it answered (the
 * pinned token's expiry). A row captured after that ceiling reads as tampered, not young.
 */
function recordsComplete(answer: RowAnswer | undefined, serverTimeCeilingMs: number | null): boolean {
  if (!answer || answer.capturedAtMs === null || serverTimeCeilingMs === null) return false;
  const age = serverTimeCeilingMs - answer.capturedAtMs;
  return age >= 0 && age <= DROP_LEDGER_TRUST_MS;
}

const distinct = (ids: readonly string[]): string[] => [...new Set(ids)];

/**
 * The rows of `entry` only the server can settle: an older entry's rows that no owned
 * entry claims. Empty for an owned entry.
 */
export function handBackQuestions(entry: Holder, log: readonly Holder[]): string[] {
  if (ownsItsRows(entry)) return [];
  const ownedElsewhere = new Set(
    log.filter((other) => other.id !== entry.id && ownsItsRows(other)).flatMap((other) => other.sourceIds),
  );
  return distinct(entry.sourceIds).filter((id) => !ownedElsewhere.has(id));
}

/**
 * `entry`'s rows split into the ones its withdrawal deletes (its own) and the ones it
 * leaves, each with why. `log` is the log as just read - entries with `entry`'s own id
 * are not "other": the withdrawal removes them together. `answers` holds what the server
 * said about the rows handBackQuestions asked about; a row it does not answer, or answers
 * with records that may be incomplete, is kept.
 */
export function planWithdrawal(
  entry: Holder,
  log: readonly Holder[],
  answers: ReadonlyMap<string, RowAnswer>,
  serverTimeCeilingMs: number | null,
): ImportWithdrawalPlan {
  const plan: ImportWithdrawalPlan = { delete: [], keep: [], promote: [] };
  const others = log.filter((other) => other.id !== entry.id);
  for (const id of distinct(entry.sourceIds)) {
    const holders = others.filter((other) => other.sourceIds.includes(id));
    if (holders.some(ownsItsRows)) {
      // An owned entry's import created it. Two owned claims cannot both be true; the
      // last of them to be withdrawn deletes it.
      plan.keep.push({ sourceId: id, why: "shared" });
      continue;
    }
    if (ownsItsRows(entry)) {
      plan.delete.push(id);
      continue;
    }
    const answer = answers.get(id);
    const handedBack = answer && recordsComplete(answer, serverTimeCeilingMs) ? answer.handedBack : undefined;
    if (handedBack === 0 && holders.length === 0) {
      plan.delete.push(id);
      continue;
    }
    // A record proves the row was brought in more than once even when older ones may be
    // gone; only "no record" needs the whole ledger.
    plan.keep.push({
      sourceId: id,
      why: holders.length > 0 ? "shared" : (answer?.handedBack ?? 0) > 0 ? "handedBack" : "unconfirmed",
    });
    const [other] = holders;
    if (handedBack === 1 && holders.length === 1 && distinct(other.sourceIds).length === 1) {
      plan.promote.push({ entryId: other.id, sourceId: id });
    }
  }
  return plan;
}

/**
 * How many times capture handed each row back as an exact duplicate, per ingest_log
 * (0044: owner-only SELECT, survivor_id indexed by 0083). 0, 1, or 2 meaning "more".
 */
export async function countExactDuplicateHandBacks(
  userId: string,
  sourceIds: readonly string[],
  signal?: AbortSignal,
): Promise<Map<string, number>> {
  const supabase = getSupabaseClient();
  const counts = await Promise.all(
    distinct(sourceIds).map(async (id): Promise<[string, number]> => {
      // One query per row with a limit of two: enough to tell 0, 1 and more, and a
      // much-duplicated row cannot fill a capped response and hide another row's record.
      const query = supabase
        .from("ingest_log")
        .select("id")
        .eq("user_id", userId)
        .eq("stage", "exact_duplicate")
        .eq("survivor_id", id)
        .limit(2);
      const { data, error } = await (signal ? query.abortSignal(signal) : query);
      if (error) throw error;
      return [id, (data ?? []).length];
    }),
  );
  return new Map(counts);
}

/** When each row was captured, on the server's clock (sources.captured_at, default now() in
 *  0022). A row that is not there has no entry. */
export async function sourceCapturedAt(
  userId: string,
  sourceIds: readonly string[],
  signal?: AbortSignal,
): Promise<Map<string, number>> {
  const ids = distinct(sourceIds);
  if (ids.length === 0) return new Map();
  const query = getSupabaseClient()
    .from("sources")
    .select("id, captured_at")
    .eq("user_id", userId)
    .in("id", ids);
  const { data, error } = await (signal ? query.abortSignal(signal) : query);
  if (error) throw error;
  const captured = new Map<string, number>();
  for (const row of (data ?? []) as { id?: unknown; captured_at?: unknown }[]) {
    const at = typeof row.captured_at === "string" ? Date.parse(row.captured_at) : Number.NaN;
    if (typeof row.id === "string" && Number.isFinite(at)) captured.set(row.id, at);
  }
  return captured;
}

async function askAboutRows(
  userId: string,
  ids: readonly string[],
  signal: AbortSignal,
): Promise<Map<string, RowAnswer>> {
  if (ids.length === 0) return new Map();
  const [handBacks, captured] = await Promise.all([
    countExactDuplicateHandBacks(userId, ids, signal),
    sourceCapturedAt(userId, ids, signal),
  ]);
  const answers = new Map<string, RowAnswer>();
  for (const [id, handedBack] of handBacks) answers.set(id, { handedBack, capturedAtMs: captured.get(id) ?? null });
  return answers;
}

const BASE64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/**
 * The access token's exp claim, in ms. The server takes a token only before its expiry,
 * so a read the token answered ran before it: a ceiling on the server's clock that the
 * device clock cannot move. null when it cannot be read. Nothing is stored or logged.
 */
function tokenExpiryMs(accessToken: string | null): number | null {
  const payload = accessToken?.split(".")[1];
  if (!payload) return null;
  let text = "";
  let buffer = 0;
  let bits = 0;
  for (const char of payload) {
    const index = BASE64URL.indexOf(char);
    if (index < 0) return null;
    buffer = ((buffer << 6) | index) & 0xffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      text += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }
  try {
    const exp = (JSON.parse(text) as { exp?: unknown }).exp;
    return typeof exp === "number" && Number.isFinite(exp) && exp > 0 ? exp * 1000 : null;
  } catch {
    return null;
  }
}

/**
 * Binds one withdrawal to the session live now (vibe r260919 L2A-1841-2 · L2Z-1841-1).
 * It is called inside the withdrawal's turn, so an account switched while the withdrawal
 * waited for the one before it is caught here: the live session must be `userId`'s, or
 * nothing is read, deleted, or removed.
 *
 * The session-mutation.ts contract as #1839's erasers use it: the expectation is captured
 * and every check runs inside the auth mutation lock (M). M is held for a check only,
 * never across a server call: the delete helpers take M themselves once #1839 lands, and
 * M does not nest. A check after a call covers that call - a switched session never comes
 * back with the same session id.
 */
async function pinWithdrawalSession(userId: string): Promise<WithdrawalSession> {
  const auth = getSupabaseClient().auth;
  const runtime = getAuthStorageRuntime();
  const expected = await runtime.runMutation(() => captureAuthSessionExpectation(auth, runtime));
  if (expected.userId !== userId) throw new AuthSessionOwnerChangedError();
  return {
    check: () => runtime.runMutation(() => assertExpectedSessionInsideMutation(auth, expected)),
    serverTimeCeilingMs: tokenExpiryMs(expected.accessToken),
  };
}

/** The judge the screens hand to withdrawImportHistoryEntry (history.ts). */
export function importWithdrawalJudge(
  userId: string,
  findSurvivingSourceIds: (userId: string, ids: string[]) => Promise<string[]>,
): ImportWithdrawalJudge {
  return {
    pin: () => pinWithdrawalSession(userId),
    plan: async (entry, log, session, signal) => {
      const answers = await askAboutRows(userId, handBackQuestions(entry, log), signal);
      return planWithdrawal(entry, log, answers, session.serverTimeCeilingMs);
    },
    surviving: (ids) => findSurvivingSourceIds(userId, ids),
  };
}

/**
 * The ds.import.* lines a finished withdrawal shows about the rows it did not delete: how
 * many, and why (vibe r260919 L2Z-1841-4). Empty when it left nothing. Another import
 * brought a row in too, or nothing could confirm the row was only this import's; when
 * the rows could not be looked up again, a line says the counts are not checked.
 */
export function keptNotice(kept: ImportWithdrawalKept | null | undefined): { key: string; count?: number }[] {
  if (!kept || kept.shared + kept.unconfirmed === 0) return [];
  return [
    ...(kept.shared > 0 ? [{ key: "ds.import.revokeKeptShared", count: kept.shared }] : []),
    ...(kept.unconfirmed > 0 ? [{ key: "ds.import.revokeKeptUnconfirmed", count: kept.unconfirmed }] : []),
    ...(kept.uncertain ? [{ key: "ds.import.revokeKeptUncertain" }] : []),
  ];
}
