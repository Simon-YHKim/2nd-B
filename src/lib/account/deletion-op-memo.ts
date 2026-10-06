// What this device remembers about its own account deletion requests (0217,
// docs/design/deletion-receipt-server-261006.md 5절).
//
// One memo per request, under its own key `account.deletionOp.v1:<owner>:<op>`.
// A per-owner list (#2078 r1 D2A-08) or one value per owner (#2054 DEL-SAFE-04 /
// DEL-BL-04) let a later request overwrite an earlier one; a key per request
// cannot. The irreversible terminal fence keeps its own older key
// (`account.deletionFence.v1:<owner>`, local-deletion-fence.ts), so an old build
// still reads it.
//
// Phases (none of them blocks a local write - only the terminal FENCE does, and
// that is installed after the server confirmed the deletion):
//   pending   a begin request is in flight; no token yet. Clearing it is always
//             safe: without a token nothing can be executed.
//   armed     the server accepted the request and signed a token. The execute
//             request is sent only after this memo is durably read back. It is
//             cleared only on a definite server answer (failed / abandoned), or
//             turned into `terminal` when the server says completed.
//   terminal  the server completed the deletion; this device's local cleanup has
//             not been confirmed yet and runs again on the next chance. It is
//             removed only when a cleanup is confirmed, never after a count of
//             tries (gate SAFE-03 / DLR-A1-08).
//
// The memo is an instruction to ASK the server, never evidence on its own: the
// receipt screen reads only the server (I6).
//
// Every storage call here is bounded (MEMO_IO_TIMEOUT_MS): after the server
// confirmed a deletion, a storage promise that never settles must not hold the
// receipt route or the sign-out (설계서 5절 "Edge 뒤 부가 정리는 결과를 붙잡지
// 않습니다", gate DLR-A1-09). A late write that lands after a clear can only
// bring a memo back, which asks the server (or re-runs the wipe) once more.
import { randomUUID } from "expo-crypto";

export const DELETION_OP_KEY_PREFIX = "account.deletionOp.v1:";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TOKEN_RE = /^v1\.[A-Za-z0-9_-]{43}$/;
const LEGACY_OP = "legacy";

/** A pending memo older than this had its begin answer lost; with no token, nothing ran. */
export const PENDING_DELETION_OP_STALE_MS = 2 * 60_000;

/**
 * How long the server keeps a failed or abandoned request (0217
 * purge_account_deletion_ops: 30 days). A completed one is kept 365 days. So a
 * request of a LIVE account that the server no longer knows is older than this
 * and was failed or abandoned; a younger one it does not know is an anomaly and
 * stays unresolved.
 */
export const DELETION_OP_CLOSED_RETENTION_MS = 30 * 24 * 60 * 60_000;

/** Upper bound for one storage call of this module. */
export const MEMO_IO_TIMEOUT_MS = 3_000;

export type DeletionOpMemo =
  | { v: 1; phase: "pending"; owner: string; opId: string; at: number }
  | { v: 1; phase: "armed"; owner: string; opId: string; token: string; at: number }
  /**
   * opId null: a deletion through the old `{}` flow, which has no number.
   * `tries`: local cleanups already started for it (a record, not a limit).
   */
  | { v: 1; phase: "terminal"; owner: string; opId: string | null; at: number; tries?: number };

export interface DeletionOpMemoStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

/** A new request number. Lowercase, because the server only accepts lowercase. */
export function newDeletionOpId(): string {
  return randomUUID().toLowerCase();
}

export function isDeletionOpId(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function deletionOpMemoKey(owner: string, opId: string | null): string {
  return `${DELETION_OP_KEY_PREFIX}${owner}:${opId ?? LEGACY_OP}`;
}

function isReactNativeRuntime(): boolean {
  try {
    return (globalThis.navigator as { product?: string } | undefined)?.product === "ReactNative";
  } catch {
    return false;
  }
}

function webStorage(): DeletionOpMemoStorage | null {
  if (isReactNativeRuntime()) return null;
  let local: Storage | null = null;
  try {
    local = typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    local = null;
  }
  if (!local) return null;
  const store = local;
  return {
    getItem: async (key) => store.getItem(key),
    setItem: async (key, value) => store.setItem(key, value),
    removeItem: async (key) => store.removeItem(key),
    keys: async () => {
      const out: string[] = [];
      for (let i = 0; i < store.length; i += 1) {
        const key = store.key(i);
        if (key !== null) out.push(key);
      }
      return out;
    },
  };
}

function nativeStorage(): DeletionOpMemoStorage | null {
  if (!isReactNativeRuntime()) return null;
  try {
    const async = require("@react-native-async-storage/async-storage").default as {
      getItem(key: string): Promise<string | null>;
      setItem(key: string, value: string): Promise<void>;
      removeItem(key: string): Promise<void>;
      getAllKeys(): Promise<readonly string[]>;
    };
    return {
      getItem: (key) => async.getItem(key),
      setItem: (key, value) => async.setItem(key, value),
      removeItem: (key) => async.removeItem(key),
      keys: async () => [...(await async.getAllKeys())],
    };
  } catch {
    return null;
  }
}

function memoryStorage(): DeletionOpMemoStorage {
  const map = new Map<string, string>();
  return {
    getItem: async (key) => map.get(key) ?? null,
    setItem: async (key, value) => { map.set(key, value); },
    removeItem: async (key) => { map.delete(key); },
    keys: async () => [...map.keys()],
  };
}

let override: DeletionOpMemoStorage | null = null;
let fallback: DeletionOpMemoStorage | null = null;

/**
 * `durable: false` is the in-memory map used when no device storage can be
 * reached: Node/SSR, and also a browser whose localStorage access throws
 * (blocked site data). It keeps reads working, but a write to it is never
 * reported as remembered - a memo that dies with the page cannot carry an op
 * token across a lost answer (설계서 5절 armed 불변식, gate DLR-A1-04).
 */
function storage(): { store: DeletionOpMemoStorage; durable: boolean } {
  if (override) return { store: override, durable: true };
  const real = webStorage() ?? nativeStorage();
  if (real) return { store: real, durable: true };
  fallback ??= memoryStorage();
  return { store: fallback, durable: false };
}

export function __setDeletionOpMemoStorageForTests(next: DeletionOpMemoStorage | null): void {
  override = next;
  fallback = null;
}

/** `work`, or `fallback` when it fails or does not settle within MEMO_IO_TIMEOUT_MS. */
function bounded<T>(work: () => Promise<T>, fallbackValue: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallbackValue), MEMO_IO_TIMEOUT_MS);
  });
  let running: Promise<T>;
  try {
    running = work().catch(() => fallbackValue);
  } catch {
    running = Promise.resolve(fallbackValue);
  }
  return Promise.race([running, deadline]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

function parseMemo(raw: string | null): DeletionOpMemo | null {
  if (raw === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const memo = value as Record<string, unknown>;
  if (memo.v !== 1 || typeof memo.owner !== "string" || !memo.owner.trim()) return null;
  if (typeof memo.at !== "number" || !Number.isFinite(memo.at)) return null;
  if (memo.phase === "pending" && isDeletionOpId(memo.opId)) {
    return { v: 1, phase: "pending", owner: memo.owner, opId: memo.opId, at: memo.at };
  }
  if (memo.phase === "armed" && isDeletionOpId(memo.opId) && typeof memo.token === "string" && TOKEN_RE.test(memo.token)) {
    return { v: 1, phase: "armed", owner: memo.owner, opId: memo.opId, token: memo.token, at: memo.at };
  }
  if (memo.phase === "terminal" && (memo.opId === null || isDeletionOpId(memo.opId))) {
    const tries = typeof memo.tries === "number" && Number.isSafeInteger(memo.tries) && memo.tries >= 0 ? memo.tries : 0;
    return { v: 1, phase: "terminal", owner: memo.owner, opId: memo.opId, at: memo.at, tries };
  }
  return null;
}

/**
 * Write one memo and read it back. False when it is not durably there: the
 * write or the read-back failed or timed out, or only the in-memory fallback
 * exists (the memo is still written there for this runtime).
 */
export async function writeDeletionOpMemo(memo: DeletionOpMemo): Promise<boolean> {
  const key = deletionOpMemoKey(memo.owner, memo.opId);
  const raw = JSON.stringify(memo);
  const { store, durable } = storage();
  const readBack = await bounded(async () => {
    await store.setItem(key, raw);
    return (await store.getItem(key)) === raw;
  }, false);
  return readBack && durable;
}

export async function readDeletionOpMemo(owner: string, opId: string | null): Promise<DeletionOpMemo | null> {
  const { store } = storage();
  return bounded(async () => parseMemo(await store.getItem(deletionOpMemoKey(owner, opId))), null);
}

/** Best effort: a memo that cannot be removed is asked about again later, which is safe. */
export async function clearDeletionOpMemo(owner: string, opId: string | null): Promise<void> {
  const { store } = storage();
  await bounded(async () => {
    await store.removeItem(deletionOpMemoKey(owner, opId));
  }, undefined);
}

/**
 * Every readable memo on this device, oldest first, or null when the memo
 * storage itself could not be listed (failed or timed out). Unreadable entries
 * are skipped. A caller that must not act on "no earlier request" when it simply
 * could not look uses this form (gate SAFE-01).
 */
export async function readDeletionOpMemos(owner?: string): Promise<DeletionOpMemo[] | null> {
  const { store } = storage();
  const keys = await bounded<string[] | null>(
    async () => (await store.keys()).filter((key) => key.startsWith(DELETION_OP_KEY_PREFIX)),
    null,
  );
  if (keys === null) return null;
  const memos: DeletionOpMemo[] = [];
  for (const key of keys) {
    const memo = await bounded(async () => parseMemo(await store.getItem(key)), null);
    // A memo must sit under its own key; anything else is ignored rather than trusted.
    if (memo && deletionOpMemoKey(memo.owner, memo.opId) === key && (owner === undefined || memo.owner === owner)) {
      memos.push(memo);
    }
  }
  return memos.sort((a, b) => a.at - b.at);
}

/** Every readable memo on this device, oldest first. Nothing readable is an empty list. */
export async function listDeletionOpMemos(owner?: string): Promise<DeletionOpMemo[]> {
  return (await readDeletionOpMemos(owner)) ?? [];
}
