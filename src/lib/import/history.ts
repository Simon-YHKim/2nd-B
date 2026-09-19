// Import history (import-hub 이력/철회). Device-local log of what derived
// signals were imported, so the user can see and fully delete them. Web keeps
// the existing AsyncStorage path; genuine React Native uses encrypted storage.
//
// PER-USER SCOPING (security audit 260904 F-08): the key used to be the single
// global "import.history", so on a SHARED DEVICE account B, after A logged out,
// read A's import log — source kind (health/location/communications/file),
// dates, and the count summary. The raw content was never stored here, but the
// metadata and A's revoke pointers were. The key is now scoped per user; the
// old unscoped blob is purged on the next read by anyone so it can never be
// surfaced again. Migration is a DELETE, not a carry-forward, on purpose: the
// unscoped blob has no owner we can prove, so attributing it to the current
// user would be the same leak in the other direction. The underlying imported
// rows live server-side (sourceIds), so dropping this local convenience log
// loses no data — the module already documents that empty history is tolerated.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { runAccountLocalMutation } from "../account/local-deletion-fence";
import {
  getEncryptedNativeStorage,
  type StringStorage,
} from "../storage/encrypted-native-storage";

const LEGACY_KEY = "import.history";
const CAP = 50;
const MAX_OWNER_CHARS = 128;
const MAX_ID_CHARS = 128;
const MAX_SOURCE_KEY_CHARS = 128;
const MAX_NAME_CHARS = 512;
const MAX_AT_ISO_CHARS = 64;
const MAX_SUMMARY_CHARS = 2_048;
const MAX_SOURCE_IDS = 256;
const MAX_SOURCE_ID_CHARS = 128;
// Four UTF-8 bytes per UTF-16 unit still stays below the encrypted adapter's
// 1.4 MB plaintext ceiling, before encryption/base64 expansion.
const MAX_SERIALIZED_CHARS = 300_000;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;
const operationTails = new Map<string, Promise<void>>();
// One withdrawal at a time per owner (withdrawImportHistoryEntry). Web Locks carry it
// across tabs; this queue is the same-runtime fallback.
const WITHDRAWAL_LOCK_PREFIX = "2ndb.import-history-withdraw.v1:";
const withdrawalTails = new Map<string, Promise<void>>();

/** Per-user storage key. Reading/writing always goes through here. */
function keyFor(userId: string): string | null {
  const owner = userId.trim();
  if (!owner || owner.length > MAX_OWNER_CHARS || CONTROL_CHARACTER.test(owner)) return null;
  return `import.history:${owner}`;
}

export interface ImportHistoryEntry {
  /** unique id (timestamp-based). */
  id: string;
  sourceKey: string;
  name: string;
  atIso: string;
  /** short derived summary, e.g. "약속 12 · 장소 5 · 원문 0". */
  summary: string;
  /** source rows this entry points at. 철회 deletes the ones that are its own. */
  sourceIds: string[];
  /**
   * true: every row in sourceIds is this entry's own, so 철회 deletes them all. Every
   * entry logged from 2026-09-20 carries it: its import created those rows (an exact
   * duplicate is never logged). An older hub entry gets it when the one other entry
   * holding its only row is withdrawn (history-ownership.ts). Absent: ownership is
   * judged at withdrawal time.
   */
  owned?: true;
}

/** An entry's rows split at withdrawal. history-ownership.ts decides. */
export interface ImportWithdrawalPlan {
  /** Rows that are the entry's own: the withdrawal deletes them. */
  delete: string[];
  /** Rows it points at that are not provably its own: left in place. */
  keep: string[];
  /** Entries that own a kept row once this entry is gone. */
  promote: { entryId: string; sourceId: string }[];
}

/** What a withdrawal asks outside the log. The screens pass history-ownership.ts's. */
export interface ImportWithdrawalJudge {
  plan(entry: ImportHistoryEntry, log: readonly ImportHistoryEntry[]): Promise<ImportWithdrawalPlan>;
  /** Which of these rows still exist. */
  surviving(sourceIds: string[]): Promise<string[]>;
}

export type ImportWithdrawal = { withdrawn: true; kept: number } | { withdrawn: false };

function isReactNativeRuntime(): boolean {
  const nav = globalThis.navigator as { product?: string } | undefined;
  return nav?.product === "ReactNative";
}

function selectedStorage(): { storage: StringStorage; native: boolean } {
  if (isReactNativeRuntime()) {
    // Initialization/recovery failures are security signals. Do not substitute
    // raw AsyncStorage or a localStorage polyfill in a genuine native runtime.
    return { storage: getEncryptedNativeStorage(), native: true };
  }
  return { storage: AsyncStorage, native: false };
}

function boundedString(value: unknown, maxChars: number): value is string {
  return typeof value === "string" && value.length <= maxChars;
}

function boundedIdentifier(value: unknown, maxChars: number): value is string {
  return boundedString(value, maxChars) && value.length > 0 && !CONTROL_CHARACTER.test(value);
}

function normalizeEntry(value: unknown): ImportHistoryEntry | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Record<string, unknown>;
  if (
    !boundedIdentifier(candidate.id, MAX_ID_CHARS)
    || !boundedIdentifier(candidate.sourceKey, MAX_SOURCE_KEY_CHARS)
    || !boundedString(candidate.name, MAX_NAME_CHARS)
    || !boundedString(candidate.atIso, MAX_AT_ISO_CHARS)
    || !boundedString(candidate.summary, MAX_SUMMARY_CHARS)
    || !Array.isArray(candidate.sourceIds)
    || candidate.sourceIds.length > MAX_SOURCE_IDS
    || !candidate.sourceIds.every((item) => boundedIdentifier(item, MAX_SOURCE_ID_CHARS))
  ) return null;
  return {
    id: candidate.id,
    sourceKey: candidate.sourceKey,
    name: candidate.name,
    atIso: candidate.atIso,
    summary: candidate.summary,
    sourceIds: [...candidate.sourceIds],
    // Anything but true reads as absent: an entry proves nothing it does not say.
    ...(candidate.owned === true ? { owned: true as const } : {}),
  };
}

function invalidHistory(strict: boolean): ImportHistoryEntry[] {
  if (strict) throw new Error("import_history_invalid");
  return [];
}

function parseHistory(raw: string | null, strict: boolean): ImportHistoryEntry[] {
  if (raw === null) return [];
  if (raw.length === 0 || raw.length > MAX_SERIALIZED_CHARS) return invalidHistory(strict);
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return invalidHistory(strict);
    const normalized: ImportHistoryEntry[] = [];
    for (const value of parsed) {
      const item = normalizeEntry(value);
      if (!item) {
        if (strict) return invalidHistory(true);
        continue;
      }
      if (normalized.length < CAP) normalized.push(item);
    }
    return normalized;
  } catch {
    return invalidHistory(strict);
  }
}

function serializeHistory(entries: ImportHistoryEntry[]): string | null {
  const raw = JSON.stringify(entries.slice(0, CAP));
  return raw.length <= MAX_SERIALIZED_CHARS ? raw : null;
}

function runQueued<T>(
  tails: Map<string, Promise<void>>,
  key: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = tails.get(key) ?? Promise.resolve();
  const result = previous.catch(() => undefined).then(operation);
  const tail = result.then(
    () => undefined,
    () => undefined,
  );
  tails.set(key, tail);
  void tail.finally(() => {
    if (tails.get(key) === tail) tails.delete(key);
  });
  return result;
}

function runExclusive<T>(key: string, operation: () => Promise<T>): Promise<T> {
  return runQueued(operationTails, key, operation);
}

// Delete-only removal of the pre-F-08 unscoped blob. It has no provable owner,
// so it is never read or carried forward. Repeated removal is idempotent.
async function purgeLegacyUnscoped(storage: StringStorage): Promise<void> {
  try {
    await storage.removeItem(LEGACY_KEY);
  } catch {
    /* best-effort */
  }
}

async function readHistory(
  selection: { storage: StringStorage; native: boolean },
  key: string,
): Promise<ImportHistoryEntry[]> {
  try {
    return parseHistory(await selection.storage.getItem(key), selection.native);
  } catch (error) {
    // Web historically treats storage failures as empty history. Native key or
    // recovery failures must stay distinguishable from an empty list so a
    // later mutation cannot overwrite ciphertext it failed to read.
    if (selection.native) throw error;
    return [];
  }
}

// The read a withdrawal acts on. Unlike readHistory it never turns a failed or damaged
// read into an empty log on the web: a withdrawal judges from this log whose rows it
// deletes and rewrites the log from it, so "could not read" has to stop it rather than
// read as "no other entry points at these rows" (vibe r260919 LZ-1841-2).
async function readHistoryStrict(storage: StringStorage, key: string): Promise<ImportHistoryEntry[]> {
  return parseHistory(await storage.getItem(key), true);
}

export async function getImportHistory(userId: string | null | undefined): Promise<ImportHistoryEntry[]> {
  if (!userId) return [];
  const key = keyFor(userId);
  if (!key) return [];
  return runExclusive(key, async () => {
    const selection = selectedStorage();
    await purgeLegacyUnscoped(selection.storage);
    return readHistory(selection, key);
  });
}

export async function addImportHistory(userId: string | null | undefined, entry: ImportHistoryEntry): Promise<void> {
  if (!userId) return;
  const accepted = normalizeEntry(entry);
  if (!accepted) return;
  const key = keyFor(userId);
  if (!key) return;
  await runAccountLocalMutation(userId, () => runExclusive(key, async () => {
      try {
        const selection = selectedStorage();
        await purgeLegacyUnscoped(selection.storage);
        const cur = await readHistory(selection, key);
        const raw = serializeHistory([accepted, ...cur]);
        if (raw !== null) await selection.storage.setItem(key, raw);
      } catch {
        /* best-effort; native read failures must not become writes */
      }
    }))
    .catch(() => undefined);
}

/**
 * Remove one entry (철회 — the caller deletes the rows it owns first). Resolves true
 * once no entry with that id is left in the log, false when the log could not be read
 * or written. The read is strict on every platform: rewriting a log that failed to read
 * would drop every other entry's pointer along with this one.
 */
export async function removeImportHistory(userId: string | null | undefined, id: string): Promise<boolean> {
  if (!userId) return false;
  const key = keyFor(userId);
  if (!key) return false;
  const outcome = await runAccountLocalMutation(userId, () => runExclusive(key, async () => {
      const selection = selectedStorage();
      await purgeLegacyUnscoped(selection.storage);
      const cur = await readHistoryStrict(selection.storage, key);
      const next = cur.filter((entry) => entry.id !== id);
      if (next.length === cur.length) return true;
      const raw = serializeHistory(next);
      if (raw === null) return false;
      await selection.storage.setItem(key, raw);
      return true;
    }))
    .catch(() => ({ executed: false }) as const);
  return outcome.executed && outcome.value;
}

interface LockManagerLike {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
}

function webLocks(): LockManagerLike | null {
  if (isReactNativeRuntime()) return null;
  try {
    const locks = (globalThis.navigator as { locks?: LockManagerLike } | undefined)?.locks;
    return locks && typeof locks.request === "function" ? locks : null;
  } catch {
    return null;
  }
}

function runWithdrawalExclusive<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const locks = webLocks();
  return locks
    ? locks.request(`${WITHDRAWAL_LOCK_PREFIX}${key}`, operation)
    : runQueued(withdrawalTails, key, operation);
}

/**
 * 철회 as one operation per owner: read the log strictly, judge which of the entry's
 * rows are its own, let the screen delete those and remove the entry, then hand each
 * kept row to the entry that now owns it.
 *
 * One operation because the judgement reads the other entries (vibe r260919 LA-1841-2 ·
 * LZ-1841-1): two withdrawals that each read the log before the other removed its entry
 * each left the shared row to the other, then both removed their entries, and the row
 * stayed with nothing pointing at it. Withdrawals now queue per owner: a Web Lock
 * across tabs, the same-runtime queue on native and on a browser without Web Locks
 * (whose tabs this cannot serialize). The lock is held over the screen's server calls;
 * imports and plain reads do not take it, so a slow withdrawal delays only the next one.
 *
 * `withdraw` receives the entry narrowed to its own rows, deletes them and removes the
 * entry (removeImportHistory). It resolves false, or throws, to keep the entry. A log
 * that cannot be read throws before anything is deleted. An entry no longer in the log
 * (withdrawn elsewhere) counts as withdrawn and touches nothing: the screen's copy of it
 * is not a basis for deleting rows.
 */
export async function withdrawImportHistoryEntry(
  userId: string,
  entryId: string,
  judge: ImportWithdrawalJudge,
  withdraw: (own: ImportHistoryEntry) => Promise<boolean>,
): Promise<ImportWithdrawal> {
  const key = keyFor(userId);
  if (!key) return { withdrawn: false };
  return runWithdrawalExclusive(key, async (): Promise<ImportWithdrawal> => {
    const log = await runExclusive(key, async () => {
      const selection = selectedStorage();
      await purgeLegacyUnscoped(selection.storage);
      return readHistoryStrict(selection.storage, key);
    });
    const entry = log.find((item) => item.id === entryId);
    if (!entry) return { withdrawn: true, kept: 0 };
    const plan = await judge.plan(entry, log);
    if (!(await withdraw({ ...entry, sourceIds: plan.delete }))) return { withdrawn: false };
    if (plan.promote.length > 0) {
      await markOwnedAfterWithdrawal(userId, key, entryId, plan.promote).catch(() => undefined);
    }
    if (plan.keep.length === 0) return { withdrawn: true, kept: 0 };
    // Only what is still there is "kept": a row already deleted elsewhere is not.
    const kept = await judge.surviving(plan.keep).catch(() => plan.keep);
    return { withdrawn: true, kept: kept.length };
  });
}

// A kept row's one other holder owns it once the withdrawn entry has really left the
// log. Best-effort: when this write fails the row stays kept on that holder's
// withdrawal too - it is never deleted on a guess.
async function markOwnedAfterWithdrawal(
  userId: string,
  key: string,
  withdrawnId: string,
  promote: ImportWithdrawalPlan["promote"],
): Promise<void> {
  await runAccountLocalMutation(userId, () => runExclusive(key, async () => {
    const selection = selectedStorage();
    const cur = await readHistoryStrict(selection.storage, key);
    if (cur.some((item) => item.id === withdrawnId)) return;
    let changed = false;
    const next = cur.map((item) => {
      const match = promote.find((candidate) => candidate.entryId === item.id);
      if (
        !match
        || item.owned === true
        || item.sourceIds.length === 0
        || !item.sourceIds.every((id) => id === match.sourceId)
      ) return item;
      changed = true;
      return { ...item, owned: true as const };
    });
    if (!changed) return;
    const raw = serializeHistory(next);
    if (raw !== null) await selection.storage.setItem(key, raw);
  }));
}

/** Remove only the terminally deleted owner's local import pointers. */
export async function purgeImportHistoryForDeletedAccount(userId: string): Promise<boolean> {
  const key = keyFor(userId);
  if (!key) return false;
  return runExclusive(key, async () => {
      const selection = selectedStorage();
      await purgeLegacyUnscoped(selection.storage);
      await selection.storage.removeItem(key);
      return true;
    })
    .catch(() => false);
}
