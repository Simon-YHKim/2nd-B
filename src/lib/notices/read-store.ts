// One shared, locally-persisted read set for the notice centre.
//
// Two defects made this necessary, both found reviewing 0113's client:
//
//   * THREE components mount useNoticeCenter at the same time - home
//     (ConstellationHome), /settings for its badge, and /notices - and each
//     owned a private copy of the read ids. /notices is PUSHED on top of a
//     still-mounted home, so popping back re-renders home without re-running
//     its fetch effect: you read the last unread notice in the inbox and the
//     home bell dot stayed lit until the process restarted, with nothing unread
//     anywhere to explain it.
//   * The server INSERT can simply fail (offline). The old code flipped local
//     state optimistically and swallowed the rejection, so nothing on the
//     device remembered the read and the same `major` notice re-interrupted on
//     every cold start - the exact opposite of the one-shot popup
//     docs/OPERATIONS-NOTICES.md promises.
//
// So: module-level state, subscribe/notify so every mounted instance settles
// together, and a local mirror that survives a failed write.
//
// The set only ever grows (mergeReadIds unions, never replaces). A read is
// append-only server-side too, so there is no "unread again" transition to
// model, and a union means an in-flight fetchReadNoticeIds() can no longer
// clobber a read the user just made.

type Listener = () => void;

interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

/** Cap on the persisted mirror. AsyncStorage entries are size-limited on
 *  Android (see ANDROID_QA_GUIDELINES.md) and the popup only ever consults
 *  recent notices, so the oldest ids fall off rather than growing forever. */
export const LOCAL_READ_LIMIT = 200;

const listeners = new Set<Listener>();
const readIdsByUser = new Map<string, Set<string>>();
/** Bumped on every change so useSyncExternalStore-style consumers can compare
 *  cheaply without deep-diffing the set. */
let revision = 0;

export function localReadKey(userId: string): string {
  return `notices.read.v1.${userId}`;
}

function webStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function nativeStorage(): AsyncStorageLike | null {
  const nav = globalThis.navigator as { product?: string } | undefined;
  if (nav?.product !== "ReactNative") return null;
  try {
    return require("@react-native-async-storage/async-storage").default as AsyncStorageLike;
  } catch {
    return null;
  }
}

function bucket(userId: string): Set<string> {
  let set = readIdsByUser.get(userId);
  if (!set) {
    set = new Set<string>();
    readIdsByUser.set(userId, set);
  }
  return set;
}

function notify(): void {
  revision += 1;
  for (const listener of [...listeners]) listener();
}

export function getRevision(): number {
  return revision;
}

export function getReadIds(userId: string | null): ReadonlySet<string> {
  if (!userId) return new Set<string>();
  return bucket(userId);
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Union new ids in. Returns true when anything actually changed, so callers
 *  can skip a pointless re-render (and a pointless storage write). */
export function mergeReadIds(userId: string, ids: Iterable<string>): boolean {
  const set = bucket(userId);
  let changed = false;
  for (const id of ids) {
    if (!set.has(id)) {
      set.add(id);
      changed = true;
    }
  }
  if (changed) notify();
  return changed;
}

/** Optimistic single-id add, mirrored to storage. */
export function addReadId(userId: string, noticeId: string): boolean {
  const changed = mergeReadIds(userId, [noticeId]);
  if (changed) void persistReadIds(userId).catch(() => undefined);
  return changed;
}

/** Test seam. The store is module-level, which is the point; suites that build
 *  their own scenarios need a way back to zero. */
export function resetReadStore(): void {
  readIdsByUser.clear();
  listeners.clear();
  revision = 0;
}

export async function loadPersistedReadIds(userId: string): Promise<string[]> {
  const key = localReadKey(userId);
  try {
    const web = webStorage();
    const raw = web ? web.getItem(key) : ((await nativeStorage()?.getItem(key)) ?? null);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === "string");
  } catch {
    // A corrupt or unreadable mirror is not worth surfacing: the server copy is
    // the real one and this is only a cushion for failed writes.
    return [];
  }
}

export async function persistReadIds(userId: string): Promise<void> {
  const key = localReadKey(userId);
  // Newest ids are the ones the popup consults, and Set preserves insertion
  // order, so keep the TAIL when trimming.
  const ids = [...bucket(userId)].slice(-LOCAL_READ_LIMIT);
  const raw = JSON.stringify(ids);
  try {
    const web = webStorage();
    if (web) {
      web.setItem(key, raw);
      return;
    }
    await nativeStorage()?.setItem(key, raw);
  } catch {
    // Storage full or unavailable. The in-memory set still holds for this
    // session and the server row is the durable copy.
  }
}
