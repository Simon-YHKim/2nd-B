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
//             not been confirmed yet and runs again on the next chance.
//
// The memo is an instruction to ASK the server, never evidence on its own: the
// receipt screen reads only the server (I6).
import { randomUUID } from "expo-crypto";

export const DELETION_OP_KEY_PREFIX = "account.deletionOp.v1:";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TOKEN_RE = /^v1\.[A-Za-z0-9_-]{43}$/;
const LEGACY_OP = "legacy";

/** A pending memo older than this had its begin answer lost; with no token, nothing ran. */
export const PENDING_DELETION_OP_STALE_MS = 2 * 60_000;

export type DeletionOpMemo =
  | { v: 1; phase: "pending"; owner: string; opId: string; at: number }
  | { v: 1; phase: "armed"; owner: string; opId: string; token: string; at: number }
  /**
   * opId null: a deletion through the old `{}` flow, which has no number.
   * `tries`: local cleanups already started for it. A browser without Web Locks
   * can never confirm a cleanup (another tab's write cannot be joined), so the
   * cleanup runs again on the next pass and stops after a bounded number of
   * tries instead of forever (설계서 5.1 W2 "다음 실행에서 한 번 더").
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

function storage(): DeletionOpMemoStorage {
  if (override) return override;
  const real = webStorage() ?? nativeStorage();
  if (real) return real;
  // Node/SSR: nothing durable exists, so a memory map keeps the flow working there.
  fallback ??= memoryStorage();
  return fallback;
}

export function __setDeletionOpMemoStorageForTests(next: DeletionOpMemoStorage | null): void {
  override = next;
  fallback = null;
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

/** Write one memo and read it back. False when it is not durably there. */
export async function writeDeletionOpMemo(memo: DeletionOpMemo): Promise<boolean> {
  const key = deletionOpMemoKey(memo.owner, memo.opId);
  const raw = JSON.stringify(memo);
  try {
    const store = storage();
    await store.setItem(key, raw);
    return (await store.getItem(key)) === raw;
  } catch {
    return false;
  }
}

export async function readDeletionOpMemo(owner: string, opId: string | null): Promise<DeletionOpMemo | null> {
  try {
    return parseMemo(await storage().getItem(deletionOpMemoKey(owner, opId)));
  } catch {
    return null;
  }
}

/** Best effort: a memo that cannot be removed is asked about again later, which is safe. */
export async function clearDeletionOpMemo(owner: string, opId: string | null): Promise<void> {
  try {
    await storage().removeItem(deletionOpMemoKey(owner, opId));
  } catch {
    // Left for the next resolve pass.
  }
}

/** Every readable memo on this device, oldest first. Unreadable entries are skipped. */
export async function listDeletionOpMemos(owner?: string): Promise<DeletionOpMemo[]> {
  let keys: string[];
  try {
    keys = (await storage().keys()).filter((key) => key.startsWith(DELETION_OP_KEY_PREFIX));
  } catch {
    return [];
  }
  const memos: DeletionOpMemo[] = [];
  for (const key of keys) {
    let memo: DeletionOpMemo | null = null;
    try {
      memo = parseMemo(await storage().getItem(key));
    } catch {
      memo = null;
    }
    // A memo must sit under its own key; anything else is ignored rather than trusted.
    if (memo && deletionOpMemoKey(memo.owner, memo.opId) === key && (owner === undefined || memo.owner === owner)) {
      memos.push(memo);
    }
  }
  return memos.sort((a, b) => a.at - b.at);
}
