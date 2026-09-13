interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

interface WebLockManagerLike {
  request<T>(name: string, callback: () => Promise<T> | T): Promise<T>;
}

export type AccountLocalMutationResult<T> =
  | { executed: true; value: T }
  | { executed: false };

const FENCE_KEY_PREFIX = "account.deletionFence.v1:";
const FENCE_MARKER = "terminal";
const LOCK_PREFIX = "2ndb.account-local-write.v1:";

// Immediate same-runtime rejection closes the gap between a deletion request
// publishing intent and its durable marker reaching local storage.
const memoryFences = new Set<string>();
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

function readWebFence(storage: Storage, owner: string): boolean | null {
  try {
    return storage.getItem(fenceKey(owner)) !== null;
  } catch {
    return null;
  }
}

async function readAsyncFence(storage: AsyncStorageLike, owner: string): Promise<boolean | null> {
  try {
    return (await storage.getItem(fenceKey(owner))) !== null;
  } catch {
    return null;
  }
}

/**
 * Serialize a local write with account deletion and reject it once the durable
 * terminal marker exists. Web Locks provide the cross-tab boundary; native and
 * storage fallbacks share an in-process owner queue.
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
        if (fenced) memoryFences.add(owner);
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
      if (fenced) memoryFences.add(owner);
      return { executed: false } as const;
    }
    return { executed: true, value: await mutation() } as const;
  });
}

/**
 * Publish the irreversible per-owner marker and wait for all earlier guarded
 * writes. The marker is intentionally never cleared for a terminal UUID.
 *
 * A browser without Web Locks still receives the durable marker, but false is
 * returned because a write already running in another tab could not be joined;
 * callers must keep account deletion on hold in that case.
 */
export function installAccountLocalDeletionFence(userId: string): Promise<boolean> {
  const owner = normalizeOwner(userId);
  if (!owner) return Promise.resolve(false);
  memoryFences.add(owner);

  const local = webStorage();
  if (local) {
    const persist = async (): Promise<boolean> => {
      try {
        local.setItem(fenceKey(owner), FENCE_MARKER);
        return local.getItem(fenceKey(owner)) === FENCE_MARKER;
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
      await storage.setItem(fenceKey(owner), FENCE_MARKER);
      return await storage.getItem(fenceKey(owner)) === FENCE_MARKER;
    } catch {
      return false;
    }
  });
}

export function __resetAccountLocalDeletionFencesForTests(): void {
  memoryFences.clear();
  ownerTails.clear();
}
