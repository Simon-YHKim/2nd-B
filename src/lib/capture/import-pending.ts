// Post-account import of the device-local pending queue (D-17 / D-25 Phase 2).
//
// After sign-up, each plaintext line captured before the account existed is
// imported as a normal record. This module is PURE orchestration: the record
// creator is injected by the caller (the import sheet passes a closure over
// `createRecord`), so this file never imports the LLM/Supabase graph and stays
// trivially testable. The natural mapping is a `note` record (a captured
// thought, no AI follow-up) — the caller wires:
//
//   importPendingCaptures(ctx, (item, c, clientRequestId) => createRecord({
//     userId: c.userId, locale: c.locale, kind: "note",
//     body: item.text, minor: c.minor, withFollowup: false, clientRequestId,
//   }), (s) => digestStringAsync(CryptoDigestAlgorithm.SHA256, s))
//
// Failures are retained in the queue so a partial import never loses a capture
// and a retry never duplicates an already-imported one.
//
// That second promise only held for an insert that FAILED cleanly. Two retries
// used to duplicate: an insert that committed but hit the 20s client deadline
// (retained as "failed", imported again next session), and a run killed after
// some inserts but before the queue rewrite at the end (every item imported
// again). Each item now carries a stable key derived from its device-local id,
// and the server's 0178 (user_id, client_request_id) unique key turns both into
// a replay of the row that already exists.
//
// The key is a SHA-256 digest of the id, never the id itself: the raw id embeds
// the capture time and is device-local (preauth-pending.ts PendingCapture). The
// digest function is injected (the hook passes expo-crypto) so this module stays
// free of native imports, and so tests can hash with a real SHA-256 - the jest
// expo-crypto mock ignores the algorithm and always returns SHA-1.

import { loadPendingCaptures, replacePendingCaptures, type PendingCapture } from "./preauth-pending";

// Mirrors the 0178 records_client_request_id_format CHECK (and createRecord's
// guard). Kept local: importing records/create would pull the LLM + Supabase
// graph into this deliberately pure module.
const CLIENT_REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;

// What preauth-pending.ts newLocalId() produces: p_<capture ms>_<base36 random>.
// Only such ids are keyed. Anything else (an empty or foreign id) imports
// unkeyed, as before: once a key conflict counts as "already on the server"
// (below), two captures sharing a key would lose the second one.
const LOCAL_ID = /^p_\d{1,16}_[0-9a-z]{1,12}$/;

const SHA256_HEX = /^[0-9a-f]{64}$/;

/**
 * The message createRecord throws when a row already sits under this key but its
 * kind or body differs (records/create.ts replayKeyedRecord). Mirrored, not
 * imported, for the same purity reason as CLIENT_REQUEST_ID;
 * create-idempotency.test.ts checks the two strings agree.
 */
export const RECORD_IDEMPOTENCY_CONFLICT = "record_idempotency_conflict";

/** SHA-256 of a UTF-8 string as hex. expo-crypto digestStringAsync(SHA256, s) in the app. */
export type Sha256Hex = (input: string) => Promise<string>;

/**
 * The retry key for one pending capture: "preauth:" + SHA-256(localId) as 64
 * lowercase hex chars (72 chars, inside the 0178 CHECK). Deterministic, so the
 * same capture carries the same key on every attempt, and the server never sees
 * the id or its capture timestamp. Undefined - the item imports unkeyed, exactly
 * as before - when the id is not one newLocalId() made, or when hashing is
 * unavailable (web WebCrypto outside a secure origin) or returns something
 * unexpected: a missing key costs retry-safety, never the capture.
 */
export async function pendingClientRequestId(
  item: PendingCapture,
  sha256Hex: Sha256Hex,
): Promise<string | undefined> {
  if (!LOCAL_ID.test(item.localId)) return undefined;
  let digest: string;
  try {
    digest = (await sha256Hex(item.localId)).toLowerCase();
  } catch {
    return undefined;
  }
  if (!SHA256_HEX.test(digest)) return undefined;
  const key = `preauth:${digest}`;
  return CLIENT_REQUEST_ID.test(key) ? key : undefined;
}

export interface ImportPendingContext {
  userId: string;
  locale: "en" | "ko";
  /** Forwarded for C10 crisis routing (a minor's red-zone text -> youth hotline). */
  minor?: boolean;
}

export interface ImportPendingSummary {
  total: number;
  imported: number;
  failed: number;
}

/**
 * Creates one record from a pending capture. Injected so tests need no Supabase/LLM.
 * `clientRequestId` goes straight to createRecord's clientRequestId.
 */
export type PendingRecordCreator = (
  item: PendingCapture,
  ctx: ImportPendingContext,
  clientRequestId?: string,
) => Promise<void>;

// Module-level single-flight lock. The queue is loaded up front and only cleared
// at the very end, so two overlapping runs would each read the same uncleared
// queue and import every capture twice. The hook's guard is a per-instance useRef
// that a remount resets, so it does NOT prevent this; a durable module-scoped lock
// does — concurrent callers share the one in-flight run.
let inFlight: Promise<ImportPendingSummary> | null = null;

export function importPendingCaptures(
  ctx: ImportPendingContext,
  createOne: PendingRecordCreator,
  sha256Hex: Sha256Hex,
): Promise<ImportPendingSummary> {
  if (inFlight) return inFlight;
  inFlight = runImport(ctx, createOne, sha256Hex).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

function isIdempotencyConflict(e: unknown): boolean {
  return e instanceof Error && e.message === RECORD_IDEMPOTENCY_CONFLICT;
}

async function runImport(
  ctx: ImportPendingContext,
  createOne: PendingRecordCreator,
  sha256Hex: Sha256Hex,
): Promise<ImportPendingSummary> {
  const list = await loadPendingCaptures();
  if (list.length === 0) return { total: 0, imported: 0, failed: 0 };

  // A local id seen twice in one queue cannot name one capture: key neither copy.
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const item of list) {
    if (seen.has(item.localId)) repeated.add(item.localId);
    seen.add(item.localId);
  }

  const failures: PendingCapture[] = [];
  let imported = 0;
  for (const item of list) {
    let key: string | undefined;
    try {
      key = repeated.has(item.localId) ? undefined : await pendingClientRequestId(item, sha256Hex);
      await createOne(item, ctx, key);
      imported += 1;
    } catch (e) {
      if (key !== undefined && isIdempotencyConflict(e)) {
        // This capture's own key already holds a row whose body differs: an
        // earlier attempt committed it (its answer lost to the deadline, or the
        // run died before the rewrite below) and the note has been edited since.
        // It reached the server, so it leaves the queue. Retaining it would fail
        // the same way every session and re-run C9 on the stale text each time.
        imported += 1;
        continue;
      }
      // Keep the failed item; never lose a capture on a transient error.
      failures.push(item);
    }
  }
  // Retain only what failed (clears the queue when everything imported).
  await replacePendingCaptures(failures);
  return { total: list.length, imported, failed: failures.length };
}
