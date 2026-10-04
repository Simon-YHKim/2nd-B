interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

interface WebLockManagerLike {
  request<T>(name: string, callback: () => Promise<T> | T): Promise<T>;
}

export type AccountLocalMutationResult<T> =
  | { executed: true; value: T }
  | { executed: false };

const FENCE_KEY_PREFIX = "account.deletionFence.v1:";
const FENCE_MARKER = "terminal";
// Same key, same blocking effect on writes (any value fences). Unlike the
// terminal marker it may be lifted: it only ever stands for a deletion that has
// not reached the server yet. Older builds read any value as a fence, so they
// stay fail-closed against it.
const INTENT_MARKER = "intent";
const LOCK_PREFIX = "2ndb.account-local-write.v1:";

/** `intent` before any destructive call can have started; `terminal` once one may have. */
export type AccountLocalDeletionFenceStage = "intent" | "terminal";

// Immediate same-runtime rejection closes the gap between a deletion request
// publishing intent and its durable marker reaching local storage.
const memoryFences = new Set<string>();
// Owners whose terminal marker this runtime has acknowledged or observed. Their
// memory fence is never lifted again, whatever storage later says.
const terminalOwners = new Set<string>();
const ownerTails = new Map<string, Promise<void>>();

function normalizeOwner(userId: string): string | null {
  const owner = userId.trim();
  return owner.length > 0 ? owner : null;
}

/** Synchronous same-runtime guard for stores that mutate an in-memory mirror. */
export function isAccountLocalDeletionFencedInMemory(userId: string): boolean {
  const owner = normalizeOwner(userId);
  return owner === null || memoryFences.has(owner);
}

function fenceKey(owner: string): string {
  return `${FENCE_KEY_PREFIX}${owner}`;
}

function webStorage(): Storage | null {
  if (isReactNativeRuntime()) return null;
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function webLocks(): WebLockManagerLike | null {
  try {
    const nav = globalThis.navigator as {
      product?: string;
      locks?: WebLockManagerLike;
    } | undefined;
    if (nav?.product === "ReactNative") return null;
    return nav?.locks && typeof nav.locks.request === "function" ? nav.locks : null;
  } catch {
    return null;
  }
}

function isReactNativeRuntime(): boolean {
  try {
    return (globalThis.navigator as { product?: string } | undefined)?.product === "ReactNative";
  } catch {
    return false;
  }
}

function asyncStorage(): AsyncStorageLike | null {
  try {
    return require("@react-native-async-storage/async-storage").default as AsyncStorageLike;
  } catch {
    return null;
  }
}

function runOwnerTail<T>(owner: string, operation: () => Promise<T>): Promise<T> {
  const previous = ownerTails.get(owner) ?? Promise.resolve();
  const result = previous.catch(() => undefined).then(operation);
  const tail = result.then(() => undefined, () => undefined);
  ownerTails.set(owner, tail);
  void tail.finally(() => {
    if (ownerTails.get(owner) === tail) ownerTails.delete(owner);
  });
  return result;
}

/** false = no marker; true = a marker this runtime may cache in memory;
 *  "intent" = fences this write but is never cached, because the tab that
 *  raised it may lift it and no event would reach this runtime; null =
 *  storage could not be read. */
type FenceRead = boolean | typeof INTENT_MARKER | null;

function classifyFence(value: string | null): FenceRead {
  if (value === null) return false;
  return value === INTENT_MARKER ? INTENT_MARKER : true;
}

function readWebFence(storage: Storage, owner: string): FenceRead {
  try {
    return classifyFence(storage.getItem(fenceKey(owner)));
  } catch {
    return null;
  }
}

async function readAsyncFence(storage: AsyncStorageLike, owner: string): Promise<FenceRead> {
  try {
    return classifyFence(await storage.getItem(fenceKey(owner)));
  } catch {
    return null;
  }
}

/**
 * Serialize a local write with account deletion and reject it while a durable
 * deletion marker exists (an intent or the terminal one). Web Locks provide the
 * cross-tab boundary; native and storage fallbacks share an in-process owner queue.
 */
export function runAccountLocalMutation<T>(
  userId: string,
  mutation: () => Promise<T> | T,
): Promise<AccountLocalMutationResult<T>> {
  const owner = normalizeOwner(userId);
  if (!owner || memoryFences.has(owner)) return Promise.resolve({ executed: false });

  const local = webStorage();
  if (local) {
    const execute = async (): Promise<AccountLocalMutationResult<T>> => {
      const fenced = readWebFence(local, owner);
      if (fenced !== false) {
        if (fenced === true) memoryFences.add(owner);
        return { executed: false };
      }
      return { executed: true, value: await mutation() };
    };
    const locks = webLocks();
    return locks
      ? locks.request(`${LOCK_PREFIX}${owner}`, execute)
      : execute();
  }

  const storage = asyncStorage();
  if (!storage) {
    try {
      return Promise.resolve(mutation()).then((value) => ({ executed: true, value }));
    } catch (error) {
      return Promise.reject(error);
    }
  }
  return runOwnerTail(owner, async () => {
    const fenced = await readAsyncFence(storage, owner);
    // Node/SSR may resolve the native package even though no native storage
    // runtime exists. Keep its in-memory work usable; an actual React Native
    // storage read failure remains fail-closed.
    if (fenced === null && !isReactNativeRuntime()) {
      return { executed: true, value: await mutation() } as const;
    }
    if (fenced !== false) {
      if (fenced === true) memoryFences.add(owner);
      return { executed: false } as const;
    }
    return { executed: true, value: await mutation() } as const;
  });
}

/**
 * Publish the per-owner marker and wait for all earlier guarded writes.
 *
 * `terminal` (the default) is irreversible: the marker is intentionally never
 * cleared for a terminal UUID. Write it only once a destructive call may have
 * started, or after one succeeded.
 *
 * `intent` fences writes exactly the same way but stays reversible through
 * releaseAccountLocalDeletionIntent(). A deletion raises it before its
 * preconditions (session refresh, cross-tab join) and promotes it to terminal
 * right before the first Edge invocation. It never downgrades a terminal
 * marker that is already there.
 *
 * ⚠ Why the split (QA 261004 gates R3-05 / BL-07, 2026-10-05): the deletion
 * used to write `terminal` first and then refresh the session. Any failure in
 * between - offline refresh, an account switch, a browser without Web Locks
 * (the marker is written, then false comes back) - left a live account fenced
 * on this device forever: its drafts, notice read state, usage counters and
 * preferences silently stopped saving, with nothing that could lift it.
 *
 * A browser without Web Locks still receives the durable marker, but false is
 * returned because a write already running in another tab could not be joined;
 * callers must keep account deletion on hold in that case.
 */
export function installAccountLocalDeletionFence(
  userId: string,
  stage: AccountLocalDeletionFenceStage = "terminal",
): Promise<boolean> {
  const owner = normalizeOwner(userId);
  if (!owner) return Promise.resolve(false);
  memoryFences.add(owner);
  const marker = stage === "intent" ? INTENT_MARKER : FENCE_MARKER;
  // An intent over an existing terminal marker keeps the terminal one: the
  // account may already be gone on the server.
  const acknowledge = (written: string | null): boolean => {
    if (written === FENCE_MARKER) terminalOwners.add(owner);
    return written === marker || (stage === "intent" && written === FENCE_MARKER);
  };

  const local = webStorage();
  if (local) {
    const persist = async (): Promise<boolean> => {
      try {
        if (stage !== "intent" || local.getItem(fenceKey(owner)) !== FENCE_MARKER) {
          local.setItem(fenceKey(owner), marker);
        }
        return acknowledge(local.getItem(fenceKey(owner)));
      } catch {
        return false;
      }
    };
    const locks = webLocks();
    if (!locks) {
      return persist().then(() => false, () => false);
    }
    return locks.request(`${LOCK_PREFIX}${owner}`, persist).catch(() => false);
  }

  const storage = asyncStorage();
  if (!storage) return Promise.resolve(false);
  return runOwnerTail(owner, async () => {
    try {
      if (stage !== "intent" || await storage.getItem(fenceKey(owner)) !== FENCE_MARKER) {
        await storage.setItem(fenceKey(owner), marker);
      }
      return acknowledge(await storage.getItem(fenceKey(owner)));
    } catch {
      return false;
    }
  });
}

/**
 * Lift an `intent` fence for a deletion that never reached the server.
 *
 * Only the caller that raised the intent may call this, and only when it knows
 * no destructive call was attempted. A terminal marker is never touched: when
 * one is found (another attempt got further, or a promotion half-landed) the
 * owner stays fenced and false comes back. An unknown marker value is left in
 * place too. The memory fence is lifted only once storage reads back empty;
 * if storage cannot be read or cleared, the owner stays fenced, fail-closed.
 */
export function releaseAccountLocalDeletionIntent(userId: string): Promise<boolean> {
  const owner = normalizeOwner(userId);
  if (!owner) return Promise.resolve(false);
  const lift = (durableCleared: boolean): boolean => {
    if (!durableCleared || terminalOwners.has(owner)) return false;
    memoryFences.delete(owner);
    return true;
  };

  const local = webStorage();
  if (local) {
    const clear = async (): Promise<boolean> => {
      try {
        const current = local.getItem(fenceKey(owner));
        if (current === FENCE_MARKER) terminalOwners.add(owner);
        if (current !== null && current !== INTENT_MARKER) return false;
        if (current === INTENT_MARKER) local.removeItem(fenceKey(owner));
        return lift(local.getItem(fenceKey(owner)) === null);
      } catch {
        return false;
      }
    };
    const locks = webLocks();
    // Without Web Locks the intent was written without a lock as well.
    return locks ? locks.request(`${LOCK_PREFIX}${owner}`, clear).catch(() => false) : clear();
  }

  const storage = asyncStorage();
  // No durable store: the intent only ever lived in memory.
  if (!storage) return Promise.resolve(lift(true));
  return runOwnerTail(owner, async () => {
    try {
      const current = await storage.getItem(fenceKey(owner));
      if (current === FENCE_MARKER) terminalOwners.add(owner);
      if (current !== null && current !== INTENT_MARKER) return false;
      if (current === INTENT_MARKER) await storage.removeItem(fenceKey(owner));
      return lift(await storage.getItem(fenceKey(owner)) === null);
    } catch {
      return false;
    }
  });
}

export function __resetAccountLocalDeletionFencesForTests(): void {
  memoryFences.clear();
  terminalOwners.clear();
  ownerTails.clear();
}
