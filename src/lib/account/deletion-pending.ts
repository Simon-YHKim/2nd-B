// Pending account-deletion notes: "this device sent deletion request X for
// owner A and has not heard a definite answer yet".
//
// This is NOT a write fence. Until 2026-10-05 the client installed the
// irreversible per-owner terminal fence (local-deletion-fence.ts) BEFORE the
// first delete-account call. When the session refresh failed or the request
// never reached the server, that terminal marker stayed forever on a live
// account and silently blocked its drafts, settings and audit outbox (gates
// R3-05 / BL-07 / DEL-BL-02). A reversible "intent" stage was tried in PR #2054
// and drew seven more findings (no lease, no operation id, old builds caching
// the shared key, cleanup that could hang the result).
//
// The decision (Q-261004-42 = A) moves the source of truth to the server. The
// terminal fence is now installed only after the server confirms the erasure
// (the Edge response, or a receipt the server recorded atomically with it).
// What remains for the client is remembering which requests are unanswered,
// so that a lost response can be resolved later by receipt number:
//
//   - a separate key prefix (`account.deletionPending.v2:`) that no older build
//     reads, so nothing here can be mistaken for a terminal marker;
//   - one storage KEY per request id (the receipt number the server will use),
//     so adding, resolving or dropping one request is a single-key write that
//     can never overwrite another. A shared per-owner list was a
//     read-modify-write: a background sweep dropping an expired R1 could write
//     back a stale list and erase R2, added meanwhile by another tab (gate D2A-08);
//   - a lease: an entry whose receipt is definitely absent after the lease is
//     dropped, because no Edge invocation outlives it. Until then the request
//     may still be running, so no second request is sent beside it (gate
//     DEL2-R1-03, delete-bulk.ts);
//   - every storage call bounded, so bookkeeping can never hold up a result.
//
// Nothing here blocks writes, so a note that outlives its purpose costs only
// its few bytes of storage.
import { normalizeReceiptId, type ReceiptLookup } from "./deletion-receipt";

interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  getAllKeys(): Promise<readonly string[]>;
}

const PENDING_KEY_PREFIX = "account.deletionPending.v2:";
/** Far beyond the 90 s client deadline and any Edge wall-clock limit. */
export const PENDING_DELETION_LEASE_MS = 15 * 60_000;
/** Newest requests kept per owner; older ones are dropped first. */
export const MAX_PENDING_DELETION_REQUESTS = 4;
/** Bound for one storage round trip. */
export const PENDING_STORAGE_TIMEOUT_MS = 3_000;

export interface PendingDeletionRequest {
  id: string;
  at: number;
}

export type PendingDeletionResolution =
  | { kind: "deleted"; receipt: Extract<ReceiptLookup, { status: "found" }>["receipt"] }
  /**
   * Some request may still be running or could not be checked; keep waiting.
   * `inFlightRequestId` names the newest request still inside its lease (it
   * may be running on the server right now), or null when every remaining
   * request is past its lease and only its answer is unknown.
   */
  | { kind: "pending"; inFlightRequestId: string | null }
  /** No unanswered request is left for this owner. */
  | { kind: "none" };

function isReactNativeRuntime(): boolean {
  try {
    return (globalThis.navigator as { product?: string } | undefined)?.product === "ReactNative";
  } catch {
    return false;
  }
}

function webStorage(): Storage | null {
  if (isReactNativeRuntime()) return null;
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function asyncStorage(): AsyncStorageLike | null {
  try {
    return require("@react-native-async-storage/async-storage").default as AsyncStorageLike;
  } catch {
    return null;
  }
}

function normalizeOwner(userId: string): string | null {
  const owner = typeof userId === "string" ? userId.trim() : "";
  // ":" separates the owner from the request id in the key.
  return owner.length > 0 && !owner.includes(":") ? owner : null;
}

function ownerPrefix(owner: string): string {
  return `${PENDING_KEY_PREFIX}${owner}:`;
}

function pendingKey(owner: string, requestId: string): string {
  return `${ownerPrefix(owner)}${requestId}`;
}

/** Resolve to `fallback` if `operation` does not settle in time; never rejects. */
async function bounded<T>(operation: () => Promise<T>, fallback: T, timeoutMs = PENDING_STORAGE_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), timeoutMs);
  });
  try {
    return await Promise.race([
      Promise.resolve().then(operation).catch(() => fallback),
      deadline,
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function readRaw(key: string): Promise<string | null | undefined> {
  const local = webStorage();
  if (local) return bounded(async () => local.getItem(key), undefined);
  const storage = asyncStorage();
  if (!storage) return undefined;
  return bounded(() => storage.getItem(key), undefined);
}

async function writeRaw(key: string, value: string | null): Promise<boolean> {
  const local = webStorage();
  if (local) {
    return bounded(async () => {
      if (value === null) local.removeItem(key);
      else local.setItem(key, value);
      return local.getItem(key) === value;
    }, false);
  }
  const storage = asyncStorage();
  if (!storage) return false;
  return bounded(async () => {
    if (value === null) await storage.removeItem(key);
    else await storage.setItem(key, value);
    return (await storage.getItem(key)) === value;
  }, false);
}

/** Every pending-note key on this device; null when the key list is unreadable. */
async function listPendingKeys(): Promise<string[] | null> {
  const local = webStorage();
  let keys: readonly string[] | null = null;
  if (local) {
    keys = await bounded(async (): Promise<string[] | null> => {
      const found: string[] = [];
      for (let index = 0; index < local.length; index += 1) {
        const key = local.key(index);
        if (key !== null) found.push(key);
      }
      return found;
    }, null);
  } else {
    const storage = asyncStorage();
    if (storage) keys = await bounded(async (): Promise<string[] | null> => [...await storage.getAllKeys()], null);
  }
  return keys === null ? null : keys.filter((key) => key.startsWith(PENDING_KEY_PREFIX));
}

/** The request id a key names for this owner, or null for a foreign key. */
function requestIdFromKey(key: string, owner: string): string | null {
  const prefix = ownerPrefix(owner);
  return key.startsWith(prefix) ? normalizeReceiptId(key.slice(prefix.length)) : null;
}

/** Unreadable or foreign values read as "no request" - this note never fences. */
export function parsePendingDeletionEntry(raw: string | null | undefined): number | null {
  if (typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw) as { v?: unknown; at?: unknown } | null;
    const at = parsed?.at;
    return parsed?.v === 2 && typeof at === "number" && Number.isSafeInteger(at) && at > 0 ? at : null;
  } catch {
    return null;
  }
}

/** Oldest first. Unreadable entries are skipped (and never fence anything). */
export async function readPendingAccountDeletion(userId: string): Promise<PendingDeletionRequest[]> {
  const owner = normalizeOwner(userId);
  if (!owner) return [];
  const keys = await listPendingKeys();
  if (keys === null) return [];
  const out: PendingDeletionRequest[] = [];
  for (const key of keys) {
    const id = requestIdFromKey(key, owner);
    if (id === null || out.some((entry) => entry.id === id)) continue;
    const at = parsePendingDeletionEntry(await readRaw(key));
    if (at !== null) out.push({ id, at });
  }
  return out.sort((left, right) => left.at - right.at);
}

/**
 * Remember an unanswered request before it is sent. False means the note could
 * not be written and read back; the caller must not send the request then,
 * because a lost answer could never be resolved.
 */
export async function addPendingAccountDeletion(
  userId: string,
  requestId: string,
  now = Date.now(),
): Promise<boolean> {
  const owner = normalizeOwner(userId);
  const id = normalizeReceiptId(requestId);
  if (!owner || id === null || !Number.isSafeInteger(now) || now <= 0) return false;
  const written = await writeRaw(pendingKey(owner, id), JSON.stringify({ v: 2, at: now }));
  if (!written) return false;
  // Keep the newest few. Each drop is its own single-key delete, so it can
  // only ever remove an older request, never the one just written.
  const others = (await readPendingAccountDeletion(owner)).filter((entry) => entry.id !== id);
  const excess = others.length + 1 - MAX_PENDING_DELETION_REQUESTS;
  for (const entry of others.slice(0, Math.max(0, excess))) {
    await writeRaw(pendingKey(owner, entry.id), null);
  }
  return true;
}

/** Drop one request (it definitely did not delete the account). Never throws. */
export async function removePendingAccountDeletion(userId: string, requestId: string): Promise<boolean> {
  const owner = normalizeOwner(userId);
  const id = normalizeReceiptId(requestId);
  if (!owner || id === null) return false;
  return writeRaw(pendingKey(owner, id), null);
}

/** Drop every note for the owner once its local data has been purged. Never throws. */
export async function clearPendingAccountDeletion(userId: string): Promise<boolean> {
  const owner = normalizeOwner(userId);
  if (!owner) return false;
  const keys = await listPendingKeys();
  if (keys === null) return false;
  let cleared = true;
  for (const key of keys) {
    if (requestIdFromKey(key, owner) === null) continue;
    if (!(await writeRaw(key, null))) cleared = false;
  }
  return cleared;
}

/** Owners that still have a note on this device. */
export async function listPendingAccountDeletionOwners(): Promise<string[]> {
  const keys = (await listPendingKeys()) ?? [];
  const owners: string[] = [];
  for (const key of keys) {
    const rest = key.slice(PENDING_KEY_PREFIX.length);
    const split = rest.lastIndexOf(":");
    if (split <= 0) continue;
    const owner = rest.slice(0, split);
    if (normalizeReceiptId(rest.slice(split + 1)) === null || normalizeOwner(owner) === null) continue;
    if (!owners.includes(owner)) owners.push(owner);
  }
  return owners;
}

/** Inside the lease on either side of `now` (a clock moved far back counts as outside). */
function withinLease(at: number, now: number): boolean {
  return Math.abs(now - at) < PENDING_DELETION_LEASE_MS;
}

/**
 * Ask the server about every unanswered request of one owner.
 *
 *   found        -> "deleted": the server recorded the erasure. The caller
 *                   purges local data (which installs the terminal fence) and
 *                   only then clears the note.
 *   not-found    -> dropped once its lease has passed; kept until then, because
 *                   the request may still be running.
 *   unavailable  -> kept. An unreachable lookup is never read as "not deleted".
 *
 * A request still inside its lease is reported as `inFlightRequestId`: it may
 * be running on the server right now, so the caller must not send another
 * request beside it (gate DEL2-R1-03).
 */
export async function resolvePendingAccountDeletion(
  userId: string,
  deps: {
    lookup: (receiptId: string) => Promise<ReceiptLookup>;
    now?: () => number;
  },
): Promise<PendingDeletionResolution> {
  const owner = normalizeOwner(userId);
  if (!owner) return { kind: "none" };
  const requests = await readPendingAccountDeletion(owner);
  if (requests.length === 0) return { kind: "none" };

  const answers = await Promise.all(requests.map(async (request) => {
    try {
      return { request, answer: await deps.lookup(request.id) };
    } catch {
      return { request, answer: { status: "unavailable" } as ReceiptLookup };
    }
  }));
  const found = answers.find(({ answer }) => answer.status === "found");
  if (found && found.answer.status === "found") return { kind: "deleted", receipt: found.answer.receipt };

  const now = (deps.now ?? Date.now)();
  let remaining = 0;
  let inFlight: PendingDeletionRequest | null = null;
  for (const { request, answer } of answers) {
    if (withinLease(request.at, now)) {
      remaining += 1;
      if (inFlight === null || request.at >= inFlight.at) inFlight = request;
    } else if (answer.status === "not-found") {
      await removePendingAccountDeletion(owner, request.id);
    } else {
      remaining += 1;
    }
  }
  return remaining > 0 ? { kind: "pending", inFlightRequestId: inFlight?.id ?? null } : { kind: "none" };
}

/**
 * Sweep every owner's notes. For a confirmed erasure the local data is purged
 * (installing the terminal fence first) and the note is cleared only when the
 * purge completed - otherwise it stays so the next run retries the purge.
 * Never throws; call it only where the device is KNOWN to be signed out
 * (deletion-receipt.ts knownSignedOut).
 */
export async function resolveAllPendingAccountDeletions(deps: {
  lookup: (receiptId: string) => Promise<ReceiptLookup>;
  purge: (owner: string) => Promise<"complete" | "retry-scheduled" | "unconfirmed">;
  now?: () => number;
}): Promise<{ deleted: string[]; pending: string[] }> {
  const result = { deleted: [] as string[], pending: [] as string[] };
  let owners: string[] = [];
  try {
    owners = await listPendingAccountDeletionOwners();
  } catch {
    return result;
  }
  for (const owner of owners) {
    try {
      const resolution = await resolvePendingAccountDeletion(owner, deps);
      if (resolution.kind === "deleted") {
        result.deleted.push(owner);
        const purged = await deps.purge(owner);
        if (purged === "complete") await clearPendingAccountDeletion(owner);
      } else if (resolution.kind === "pending") {
        result.pending.push(owner);
      }
    } catch {
      result.pending.push(owner);
    }
  }
  return result;
}

export function __pendingKeyForTests(owner: string, requestId: string): string {
  return pendingKey(owner, requestId);
}
