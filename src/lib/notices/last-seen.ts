import {
  isAccountLocalDeletionFencedInMemory,
  runAccountLocalMutation,
} from "../account/local-deletion-fence";

interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

const memorySeen = new Map<string, string>();

export function noticeSeenKey(userId: string): string {
  return `notices.lastSeen.v1.${userId}`;
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

export async function readNoticeSeenId(userId: string): Promise<string | null> {
  if (isAccountLocalDeletionFencedInMemory(userId)) return null;
  const key = noticeSeenKey(userId);
  const web = webStorage();
  if (web) return web.getItem(key);
  const native = nativeStorage();
  if (native) return native.getItem(key);
  return memorySeen.get(key) ?? null;
}

export async function writeNoticeSeenId(userId: string, noticeId: string): Promise<void> {
  await runAccountLocalMutation(userId, async () => {
    const key = noticeSeenKey(userId);
    memorySeen.set(key, noticeId);
    const web = webStorage();
    if (web) {
      web.setItem(key, noticeId);
      return;
    }
    await nativeStorage()?.setItem(key, noticeId);
  });
}

/** Remove one terminally deleted owner's bundled-notice cursor. */
export async function purgeNoticeLastSeenForDeletedAccount(userId: string): Promise<boolean> {
  const owner = userId.trim();
  if (!owner) return false;
  const key = noticeSeenKey(owner);
  memorySeen.delete(key);
  try {
    const web = webStorage();
    if (web) {
      web.removeItem(key);
      return web.getItem(key) === null;
    }
    const native = nativeStorage();
    if (!native) return false;
    await native.removeItem(key);
    return (await native.getItem(key)) === null;
  } catch {
    return false;
  }
}

export function __resetNoticeLastSeenForTests(): void {
  memorySeen.clear();
}
