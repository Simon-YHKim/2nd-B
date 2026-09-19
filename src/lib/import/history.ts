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
import { TimeoutError } from "../async/with-timeout";
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
// across tabs; this queue carries it on native, where the app is one JS runtime.
const WITHDRAWAL_LOCK_PREFIX = "2ndb.import-history-withdraw.v1:";
const withdrawalTails = new Map<string, Promise<void>>();
// How long one withdrawal may wait on the server in all before it gives up and keeps the
// entry (vibe r260919 L2A-1841-4). Its turn is held meanwhile, so an answer that never
// comes held every later withdrawal of the account.
const WITHDRAWAL_DEADLINE_MS = 30_000;

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

/**
 * Why a withdrawal left a row it points at. shared: another entry of this log points at it
 * too. handedBack: the server recorded it handed back as an exact duplicate, so it was
 * brought in more than once. unconfirmed: nothing could confirm it was only this entry's.
 */
export type ImportKeepReason = "shared" | "handedBack" | "unconfirmed";

/** An entry's rows split at withdrawal. history-ownership.ts decides. */
export interface ImportWithdrawalPlan {
  /** Rows that are the entry's own: the withdrawal deletes them. */
  delete: string[];
  /** Rows it points at that are not provably its own: left in place. */
  keep: { sourceId: string; why: ImportKeepReason }[];
  /** Entries that own a kept row once this entry is gone. */
  promote: { entryId: string; sourceId: string }[];
}

/** The session one withdrawal runs in. history-ownership.ts pins it. */
export interface WithdrawalSession {
  /** Rejects once the live session is no longer the pinned one. */
  check(): Promise<void>;
  /** A time the server's clock had not reached while it took the pinned token, in ms. null: unknown. */
  serverTimeCeilingMs: number | null;
}

/** What a withdrawal asks outside the log. The screens pass history-ownership.ts's. */
export interface ImportWithdrawalJudge {
  /** Binds the withdrawal to the live session. Rejects unless that session is the owner's. */
  pin(): Promise<WithdrawalSession>;
  plan(
    entry: ImportHistoryEntry,
    log: readonly ImportHistoryEntry[],
    session: WithdrawalSession,
    signal: AbortSignal,
  ): Promise<ImportWithdrawalPlan>;
  /** Which of these rows still exist. */
  surviving(sourceIds: string[]): Promise<string[]>;
}

/** The rows a finished withdrawal left in place, by why. */
export interface ImportWithdrawalKept {
  /** Rows another import also brought in (shared or handedBack). */
  shared: number;
  /** Rows nothing could confirm were only this entry's. */
  unconfirmed: number;
  /** The rows could not be looked up again: the counts are the plan's, and some may be gone. */
  uncertain: boolean;
}

/**
 * failed: nothing was removed from the log (rows the entry owns may be gone - a retry
 * finishes it). unserialized: nothing was done at all - this browser cannot line up
 * withdrawals across its tabs.
 */
export type ImportWithdrawal =
  | { withdrawn: true; kept: ImportWithdrawalKept }
  | { withdrawn: false; reason: "failed" | "unserialized" };

const NOTHING_KEPT: ImportWithdrawalKept = { shared: 0, unconfirmed: 0, uncertain: false };

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

/**
 * Runs `operation` as the owner's one withdrawal: a Web Lock across tabs, the runtime
 * queue on native. null on a browser without Web Locks - see withdrawImportHistoryEntry.
 */
function runWithdrawalExclusive<T>(key: string, operation: () => Promise<T>): Promise<T> | null {
  if (isReactNativeRuntime()) return runQueued(withdrawalTails, key, operation);
  const locks = webLocks();
  return locks ? locks.request(`${WITHDRAWAL_LOCK_PREFIX}${key}`, operation) : null;
}

interface WithdrawalDeadline {
  /** Aborts the reads that take it once time is up. */
  readonly signal: AbortSignal;
  /** `work`, or a TimeoutError once time is up. Server steps only - see withdrawImportHistoryEntry. */
  bound<T>(work: PromiseLike<T>): Promise<T>;
  end(): void;
}

function startWithdrawalDeadline(ms: number): WithdrawalDeadline {
  const controller = new AbortController();
  let expire: (error: Error) => void = () => undefined;
  const expired = new Promise<never>((_, reject) => {
    expire = reject;
  });
  // Nothing may be waiting when time runs out (the log write, or nothing at all).
  expired.catch(() => undefined);
  const timer = setTimeout(() => {
    expire(new TimeoutError(ms, "import withdrawal"));
    controller.abort();
  }, ms);
  return {
    signal: controller.signal,
    bound: (work) => Promise.race([Promise.resolve(work), expired]),
    end: () => clearTimeout(timer),
  };
}

/**
 * 철회 as one operation per owner, in one session: read the log strictly, judge which of
 * the entry's rows are its own, let the screen delete those, then remove the entry and
 * hand each kept row to the entry that now owns it, in one log write.
 *
 * One operation because the judgement reads the other entries (vibe r260919 LA-1841-2 ·
 * LZ-1841-1): two withdrawals that each read the log before the other removed its entry
 * each left the shared row to the other, then both removed their entries, and the row
 * stayed with nothing pointing at it. Withdrawals queue per owner: a Web Lock across
 * tabs, the runtime queue on native. A browser without Web Locks has nothing that can
 * line its tabs up, and there the same two withdrawals still did exactly that (L2A-1841-1),
 * so there it withdraws nothing: no row deleted, no entry removed, and it says why. Imports
 * and plain reads do not take the turn, so a slow withdrawal delays only the next one.
 *
 * One session (L2A-1841-2 · L2Z-1841-1): the judge pins the live session first thing in
 * the turn and it is checked after every server step. Under another account RLS answers
 * a delete with 0 rows and a lookup with none, which read as "already deleted": the entry
 * was removed while its rows stayed. A switched account now stops the withdrawal before
 * the entry leaves the log.
 *
 * One deadline (L2A-1841-4) over every server step: a call that never answers held the
 * turn, and with it every later withdrawal of the account, until the tab closed. The
 * reads here take its signal; the screen's delete cannot, so a late delete may still land
 * after the withdrawal has failed. That is safe: the entry stays, the rows are its own,
 * and a retry finds them gone and finishes. Local steps are never cut short - a log write
 * landing after the turn has passed on could undo the next withdrawal's.
 *
 * One log write (L2Z-1841-2): the entry leaving and the promotion that depends on it land
 * together or not at all. They used to be two writes, and when the second failed the
 * first stood - the promotion was lost for good, and the next withdrawal kept a row that
 * was its own and dropped the last pointer to it.
 *
 * `withdraw` receives the entry narrowed to its own rows and deletes them. It resolves
 * false, or throws, to keep the entry. A log that cannot be read, a session that is not
 * the owner's, or time running out throws; the entry stays. An entry no longer in the
 * log (withdrawn elsewhere) counts as withdrawn and touches nothing: the screen's copy of
 * it is not a basis for deleting rows.
 */
export async function withdrawImportHistoryEntry(
  userId: string,
  entryId: string,
  judge: ImportWithdrawalJudge,
  withdraw: (own: ImportHistoryEntry) => Promise<boolean>,
): Promise<ImportWithdrawal> {
  const key = keyFor(userId);
  if (!key) return { withdrawn: false, reason: "failed" };
  const turn = runWithdrawalExclusive(key, async (): Promise<ImportWithdrawal> => {
    const deadline = startWithdrawalDeadline(WITHDRAWAL_DEADLINE_MS);
    try {
      const session = await deadline.bound(judge.pin());
      const log = await runExclusive(key, async () => {
        const selection = selectedStorage();
        await purgeLegacyUnscoped(selection.storage);
        return readHistoryStrict(selection.storage, key);
      });
      const entry = log.find((item) => item.id === entryId);
      if (!entry) return { withdrawn: true, kept: NOTHING_KEPT };
      const plan = await deadline.bound(judge.plan(entry, log, session, deadline.signal));
      await deadline.bound(session.check());
      if (!(await deadline.bound(withdraw({ ...entry, sourceIds: plan.delete })))) {
        return { withdrawn: false, reason: "failed" };
      }
      await deadline.bound(session.check());
      if (!(await commitWithdrawal(userId, key, entryId, plan.promote))) {
        return { withdrawn: false, reason: "failed" };
      }
      return { withdrawn: true, kept: await keptAfterWithdrawal(plan, judge, session, deadline) };
    } finally {
      deadline.end();
    }
  });
  return turn ?? { withdrawn: false, reason: "unserialized" };
}

/** Which kept rows are still there, or null when that could not be learned in this session. */
async function stillThere(
  ids: string[],
  judge: ImportWithdrawalJudge,
  session: WithdrawalSession,
  deadline: WithdrawalDeadline,
): Promise<Set<string> | null> {
  try {
    const surviving = await deadline.bound(judge.surviving(ids));
    // Under another account the lookup answers none - read as "all gone".
    await deadline.bound(session.check());
    return new Set(surviving);
  } catch {
    return null;
  }
}

// Only what is still there is "kept": a row already deleted elsewhere is not. When that
// cannot be looked up, the plan's rows are reported and marked unchecked.
async function keptAfterWithdrawal(
  plan: ImportWithdrawalPlan,
  judge: ImportWithdrawalJudge,
  session: WithdrawalSession,
  deadline: WithdrawalDeadline,
): Promise<ImportWithdrawalKept> {
  if (plan.keep.length === 0) return NOTHING_KEPT;
  const there = await stillThere(plan.keep.map((row) => row.sourceId), judge, session, deadline);
  const kept = there ? plan.keep.filter((row) => there.has(row.sourceId)) : plan.keep;
  const unconfirmed = kept.filter((row) => row.why === "unconfirmed").length;
  return { shared: kept.length - unconfirmed, unconfirmed, uncertain: there === null };
}

// A kept row's one other holder owns it once the withdrawn entry is gone: the one record
// and the two holders account for both times the row came in. The promotion lands in the
// write that removes the entry, so neither stands without the other.
function promoteHolder(item: ImportHistoryEntry, promote: ImportWithdrawalPlan["promote"]): ImportHistoryEntry {
  const match = promote.find((candidate) => candidate.entryId === item.id);
  if (
    !match
    || item.owned === true
    || item.sourceIds.length === 0
    || !item.sourceIds.every((id) => id === match.sourceId)
  ) return item;
  return { ...item, owned: true as const };
}

/**
 * The withdrawal's one log write: the entry leaves and its kept rows' holders are
 * promoted, from one strict read. Resolves true once the entry is gone (already gone
 * counts), false when the log could not be read or written - then nothing changed.
 */
async function commitWithdrawal(
  userId: string,
  key: string,
  withdrawnId: string,
  promote: ImportWithdrawalPlan["promote"],
): Promise<boolean> {
  const outcome = await runAccountLocalMutation(userId, () => runExclusive(key, async () => {
      const selection = selectedStorage();
      await purgeLegacyUnscoped(selection.storage);
      const cur = await readHistoryStrict(selection.storage, key);
      let changed = false;
      const next: ImportHistoryEntry[] = [];
      for (const item of cur) {
        if (item.id === withdrawnId) {
          changed = true;
          continue;
        }
        const promoted = promoteHolder(item, promote);
        if (promoted !== item) changed = true;
        next.push(promoted);
      }
      if (!changed) return true;
      const raw = serializeHistory(next);
      if (raw === null) return false;
      await selection.storage.setItem(key, raw);
      return true;
    }))
    .catch(() => ({ executed: false }) as const);
  return outcome.executed && outcome.value;
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
