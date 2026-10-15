import {
  isAccountLocalDeletionFencedInMemory,
  runAccountLocalMutation,
} from "../account/local-deletion-fence";

// 홈이 마지막으로 보여 준 일곱 별의 밝기 (효과음 3차 Q-261006-02, 2026-10-06).
// 별이 밝아지는 소리는 "지난번에 본 것보다 올랐는가"로만 정할 수 있는데, 홈은 돌아올 때마다
// 밝기를 새로 덮어쓸 뿐 이전 값을 들고 있지 않았다. 이 기기에만 두는 작은 기록이고 서버로
// 가지 않는다. 비교 규칙(내리지 않음 · L5 제외 · 첫 기록은 무음)은 audio/app-cue-gates.ts 의
// brightenCue 가 정한다. 계정 삭제 때 local-purge.ts 가 지운다.

interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

const memorySeen = new Map<string, string>();

export function starLastSeenKey(userId: string): string {
  return `stars.lastSeenLevels.v1.${userId}`;
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

function parse(raw: string | null): Record<string, number> | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const out: Record<string, number> = {};
    for (const [id, level] of Object.entries(value as Record<string, unknown>)) {
      if (typeof level === "number" && Number.isInteger(level) && level >= 1 && level <= 5) out[id] = level;
    }
    return out;
  } catch {
    return null;
  }
}

/** 기록이 없거나 읽지 못하면 null. null 은 "처음 보는 사용자"로 다뤄져 소리 없이 기록만 남긴다. */
export async function readStarLastSeen(userId: string): Promise<Record<string, number> | null> {
  if (!userId || isAccountLocalDeletionFencedInMemory(userId)) return null;
  const key = starLastSeenKey(userId);
  try {
    const web = webStorage();
    if (web) return parse(web.getItem(key));
    const native = nativeStorage();
    if (native) return parse(await native.getItem(key));
  } catch {
    return null;
  }
  return parse(memorySeen.get(key) ?? null);
}

export async function writeStarLastSeen(userId: string, levels: Record<string, number>): Promise<void> {
  if (!userId) return;
  await runAccountLocalMutation(userId, async () => {
    const key = starLastSeenKey(userId);
    const value = JSON.stringify(levels);
    memorySeen.set(key, value);
    const web = webStorage();
    if (web) {
      web.setItem(key, value);
      return;
    }
    await nativeStorage()?.setItem(key, value);
  });
}

/** Remove one terminally deleted owner's last-seen star levels. */
export async function purgeStarLastSeenForDeletedAccount(userId: string): Promise<boolean> {
  const owner = userId.trim();
  if (!owner) return false;
  const key = starLastSeenKey(owner);
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

export function __resetStarLastSeenForTests(): void {
  memorySeen.clear();
}
