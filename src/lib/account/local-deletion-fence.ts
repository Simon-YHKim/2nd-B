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

// The terminal key. Builds before the intent stage read ANY value here as a
// fence and cache it in memory for the rest of their runtime, so only the
// irreversible terminal marker is ever written to it.
const FENCE_KEY_PREFIX = "account.deletionFence.v1:";
const FENCE_MARKER = "terminal";
// The liftable stage lives under its own key (QA 261004 gate DEL-SAFE-02,
// 2026-10-05). It first shared the terminal key, and an older tab still open in
// the same browser cached that intent as terminal: once this build lifted it,
// the older tab kept rejecting the live account's drafts, settings and audit
// writes until a reload, with no event to tell it otherwise. Older builds do
// not read this key; they are fenced by the terminal marker, which is written
// under the same cross-tab lock right before the first Edge invocation.
const INTENT_KEY_PREFIX = "account.deletionIntent.v1:";
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

function intentKey(owner: string): string {
  return `${INTENT_KEY_PREFIX}${owner}`;
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

/** false = no marker; true = any value on the terminal key (unknown ones too,
 *  fail-closed), which this runtime caches in memory for good; "intent" = a
 *  value on the intent key, which fences this write but is never cached,
 *  because the tab that raised it may lift it and no event would reach this
 *  runtime; null = storage could not be read. */
type FenceRead = boolean | typeof INTENT_MARKER | null;

function classifyFence(terminal: string | null, intent: string | null): FenceRead {
  if (terminal !== null) return true;
  return intent === null ? false : INTENT_MARKER;
}

function readWebFence(storage: Storage, owner: string): FenceRead {
  try {
    const terminal = storage.getItem(fenceKey(owner));
    return classifyFence(terminal, terminal === null ? storage.getItem(intentKey(owner)) : null);
  } catch {
    return null;
  }
}

async function readAsyncFence(storage: AsyncStorageLike, owner: string): Promise<FenceRead> {
  try {
    const terminal = await storage.getItem(fenceKey(owner));
    return classifyFence(terminal, terminal === null ? await storage.getItem(intentKey(owner)) : null);
  } catch {
    return null;
  }
}

/** A terminal marker seen on any path pins the memory fence: a later intent
 *  release must not lift it even if storage loses the key (gate DEL-SAFE-03). */
function observeTerminal(owner: string): void {
  memoryFences.add(owner);
  terminalOwners.add(owner);
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
        if (fenced === true) observeTerminal(owner);
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
      if (fenced === true) observeTerminal(owner);
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
 * `intent` fences this build's writes the same way but stays reversible through
 * releaseAccountLocalDeletionIntent(). A deletion raises it before its
 * preconditions (session refresh, cross-tab join) and promotes it to terminal
 * right before the first Edge invocation. It never downgrades a terminal
 * marker that is already there (any value on the terminal key counts). It is
 * stored under its own key, so an older build's tab never caches it.
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

  const local = webStorage();
  if (local) {
    const persist = () => persistFence(webAsAsync(local), owner, stage);
    const locks = webLocks();
    if (!locks) {
      return persist().then(() => false, () => false);
    }
    return locks.request(`${LOCK_PREFIX}${owner}`, persist).catch(() => false);
  }

  const storage = asyncStorage();
  if (!storage) return Promise.resolve(false);
  return runOwnerTail(owner, () => persistFence(storage, owner, stage));
}

/** Web Storage is synchronous; one awaited code path serves both runtimes. */
function webAsAsync(local: Storage): AsyncStorageLike {
  return {
    getItem: async (key) => local.getItem(key),
    setItem: async (key, value) => { local.setItem(key, value); },
    removeItem: async (key) => { local.removeItem(key); },
  };
}

async function persistFence(
  store: AsyncStorageLike,
  owner: string,
  stage: AccountLocalDeletionFenceStage,
): Promise<boolean> {
  try {
    if (stage === "intent") {
      // An intent over an existing terminal marker keeps the terminal one: the
      // account may already be gone on the server.
      if (await store.getItem(fenceKey(owner)) !== null) {
        terminalOwners.add(owner);
        return true;
      }
      await store.setItem(intentKey(owner), INTENT_MARKER);
      return await store.getItem(intentKey(owner)) === INTENT_MARKER;
    }
    await store.setItem(fenceKey(owner), FENCE_MARKER);
    if (await store.getItem(fenceKey(owner)) !== FENCE_MARKER) return false;
    terminalOwners.add(owner);
    // Nothing else runs here: the deletion's first Edge invocation follows this
    // acknowledgement under the same deadline. The leftover intent is cleared
    // afterwards by discardAccountLocalDeletionIntent() (gate DEL-BL-02).
    return true;
  } catch {
    return false;
  }
}

/**
 * Clear the intent key a promotion left behind (best effort, never rejects).
 *
 * The terminal marker wins every read, so a leftover intent is only clutter.
 * This first ran inside the promotion, between the terminal read-back and the
 * first Edge invocation, where up to two more native storage calls could use up
 * the deletion deadline after the marker had already turned terminal: the
 * deletion then failed with no Edge call and a fence nothing can lift (QA 261004
 * gate DEL-BL-02, 2026-10-05). The deletion now calls this after its Edge
 * attempts. The intent is removed only while a terminal marker reads back, so
 * this never lifts a fence.
 */
export function discardAccountLocalDeletionIntent(userId: string): Promise<void> {
  const owner = normalizeOwner(userId);
  if (!owner) return Promise.resolve();

  const local = webStorage();
  if (local) {
    const discard = () => discardIntent(webAsAsync(local), owner);
    const locks = webLocks();
    return (locks ? locks.request(`${LOCK_PREFIX}${owner}`, discard) : discard())
      .catch(() => undefined);
  }

  const storage = asyncStorage();
  if (!storage) return Promise.resolve();
  return runOwnerTail(owner, () => discardIntent(storage, owner));
}

async function discardIntent(store: AsyncStorageLike, owner: string): Promise<void> {
  try {
    if (await store.getItem(fenceKey(owner)) === null) return;
    if (await store.getItem(intentKey(owner)) !== null) await store.removeItem(intentKey(owner));
  } catch {
    // Best effort: the terminal marker is already acknowledged.
  }
}

/**
 * Lift an `intent` fence for a deletion that never reached the server.
 *
 * Only the caller that raised the intent may call this, and only when it knows
 * no destructive call was attempted. A terminal marker is never touched: when
 * any value is found on the terminal key (another attempt got further, a
 * promotion half-landed, or a value this build does not know) the owner stays
 * fenced for good and false comes back. An unknown value on the intent key is
 * left in place too. The memory fence is lifted only once both keys read back
 * empty and this runtime never saw a terminal marker; if storage cannot be
 * read or cleared, the owner stays fenced, fail-closed.
 */
export function releaseAccountLocalDeletionIntent(userId: string): Promise<boolean> {
  const owner = normalizeOwner(userId);
  if (!owner) return Promise.resolve(false);

  const local = webStorage();
  if (local) {
    const clear = () => clearIntent(webAsAsync(local), owner);
    const locks = webLocks();
    // Without Web Locks the intent was written without a lock as well.
    return locks ? locks.request(`${LOCK_PREFIX}${owner}`, clear).catch(() => false) : clear();
  }

  const storage = asyncStorage();
  // No durable store: the intent only ever lived in memory.
  if (!storage) return Promise.resolve(liftMemoryFence(owner));
  return runOwnerTail(owner, () => clearIntent(storage, owner));
}

function liftMemoryFence(owner: string): boolean {
  if (terminalOwners.has(owner)) return false;
  memoryFences.delete(owner);
  return true;
}

async function clearIntent(store: AsyncStorageLike, owner: string): Promise<boolean> {
  const terminalSeen = async (): Promise<boolean> => {
    if (await store.getItem(fenceKey(owner)) === null) return false;
    terminalOwners.add(owner);
    return true;
  };
  try {
    if (await terminalSeen()) return false;
    const current = await store.getItem(intentKey(owner));
    if (current !== null && current !== INTENT_MARKER) return false;
    if (current === INTENT_MARKER) await store.removeItem(intentKey(owner));
    // Read both back: a terminal that landed meanwhile is never lifted.
    if (await terminalSeen()) return false;
    if (await store.getItem(intentKey(owner)) !== null) return false;
    return liftMemoryFence(owner);
  } catch {
    return false;
  }
}

export function __resetAccountLocalDeletionFencesForTests(): void {
  memoryFences.clear();
  terminalOwners.clear();
  ownerTails.clear();
}
