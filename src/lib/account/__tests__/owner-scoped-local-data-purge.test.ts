const nativeValues = new Map<string, string>();
let nativeRemoveFailureKey: string | null = null;

const asyncStorage = {
  getItem: jest.fn(async (key: string) => nativeValues.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => {
    nativeValues.set(key, value);
  }),
  removeItem: jest.fn(async (key: string) => {
    if (key === nativeRemoveFailureKey) throw new Error("remove failed");
    nativeValues.delete(key);
  }),
};

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: asyncStorage,
}));

jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { reasoning_prefs: {} }, error: null }),
        }),
      }),
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
  }),
}));

import {
  __resetAccountLocalDeletionFencesForTests,
  installAccountLocalDeletionFence,
} from "../local-deletion-fence";
import { bumpOpsUsage, purgeOpsUsageForDeletedAccount, readOpsUsage } from "../../ops/usage";
import {
  __resetAutoPrefCacheForTests,
  getAutoIntroSeen,
  getAutoReasoningEnabled,
  purgeAutoReasoningForDeletedAccount,
  setAutoIntroSeen,
  setAutoReasoningEnabled,
} from "../../reasoning/auto-pref";
import {
  __resetWikiAutoPromoteForTests,
  getWikiAutoPromote,
  purgeWikiAutoPromoteForDeletedAccount,
  setWikiAutoPromote,
} from "../../wiki/auto-promote";
import {
  addReadId,
  getReadIds,
  localReadKey,
  persistReadIds,
  purgeNoticeReadStateForDeletedAccount,
  resetReadStore,
} from "../../notices/read-store";
import {
  noticeSeenKey,
  purgeNoticeLastSeenForDeletedAccount,
  readNoticeSeenId,
  writeNoticeSeenId,
} from "../../notices/last-seen";

const OWNER = "owner-a";
const OTHER = "owner-b";
const KEYS = {
  ops: (owner: string) => `ops.recs.v1.${owner}`,
  reasoning: (owner: string) => `reasoning.auto.v1.${owner}`,
  reasoningIntro: (owner: string) => `reasoning.auto.intro.v1.${owner}`,
  wiki: (owner: string) => `wiki.autoPromote.v1.${owner}`,
  noticeRead: (owner: string) => `notices.read.v1.${owner}`,
  noticeSeen: (owner: string) => `notices.lastSeen.v1.${owner}`,
};

class MemoryStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
  clear(): void { this.values.clear(); }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  get length(): number { return this.values.size; }
}

const webValues = new MemoryStorage();
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");

function setRuntime(runtime: "web" | "native"): void {
  if (runtime === "web") {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { product: "Gecko" },
    });
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: webValues,
    });
    return;
  }
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { product: "ReactNative" },
  });
  Reflect.deleteProperty(globalThis, "localStorage");
}

function restoreGlobals(): void {
  if (originalNavigator) {
    Object.defineProperty(globalThis, "navigator", originalNavigator);
  } else {
    Reflect.deleteProperty(globalThis, "navigator");
  }
  if (originalLocalStorage) {
    Object.defineProperty(globalThis, "localStorage", originalLocalStorage);
  } else {
    Reflect.deleteProperty(globalThis, "localStorage");
  }
}

function seed(storage: { setItem(key: string, value: string): unknown }, owner: string): void {
  storage.setItem(KEYS.ops(owner), JSON.stringify({ day: "2026-09-13", count: 2 }));
  storage.setItem(KEYS.reasoning(owner), "1");
  storage.setItem(KEYS.reasoningIntro(owner), "1");
  storage.setItem(KEYS.wiki(owner), "1");
  storage.setItem(KEYS.noticeRead(owner), JSON.stringify([`read-${owner}`]));
  storage.setItem(KEYS.noticeSeen(owner), `seen-${owner}`);
}

beforeEach(() => {
  nativeValues.clear();
  webValues.clear();
  nativeRemoveFailureKey = null;
  jest.clearAllMocks();
  __resetAccountLocalDeletionFencesForTests();
  __resetAutoPrefCacheForTests(true);
  __resetWikiAutoPromoteForTests(true);
  resetReadStore();
});

afterAll(restoreGlobals);

async function purgeEveryNamespace(owner: string): Promise<boolean[]> {
  return Promise.all([
    purgeOpsUsageForDeletedAccount(owner),
    purgeAutoReasoningForDeletedAccount(owner),
    purgeWikiAutoPromoteForDeletedAccount(owner),
    purgeNoticeReadStateForDeletedAccount(owner),
    purgeNoticeLastSeenForDeletedAccount(owner),
  ]);
}

describe.each(["web", "native"] as const)("%s owner-scoped purge", (runtime) => {
  test("removes every deleted-owner namespace while preserving another owner", async () => {
    setRuntime(runtime);
    const storage = runtime === "web" ? webValues : {
      setItem: (key: string, value: string) => nativeValues.set(key, value),
    };
    seed(storage, OWNER);
    seed(storage, OTHER);

    addReadId(OWNER, "memory-owner");
    addReadId(OTHER, "memory-other");
    await writeNoticeSeenId(OWNER, "memory-owner");
    await writeNoticeSeenId(OTHER, "memory-other");

    await expect(purgeEveryNamespace(OWNER)).resolves.toEqual([
      true,
      true,
      true,
      true,
      true,
    ]);

    const values = runtime === "web" ? webValues.values : nativeValues;
    for (const key of Object.values(KEYS)) {
      expect(values.has(key(OWNER))).toBe(false);
      expect(values.has(key(OTHER))).toBe(true);
    }
    expect(getReadIds(OWNER).size).toBe(0);
    expect(getReadIds(OTHER).has("memory-other")).toBe(true);
    await expect(readNoticeSeenId(OWNER)).resolves.toBeNull();
    await expect(readNoticeSeenId(OTHER)).resolves.toBe("memory-other");
  });
});

test("a removal failure is observable instead of being reported complete", async () => {
  setRuntime("native");
  seed({ setItem: (key, value) => nativeValues.set(key, value) }, OWNER);
  nativeRemoveFailureKey = KEYS.reasoningIntro(OWNER);

  await expect(purgeAutoReasoningForDeletedAccount(OWNER)).resolves.toBe(false);
});

test("the terminal fence rejects late writes for every owner-scoped producer", async () => {
  setRuntime("native");
  await expect(installAccountLocalDeletionFence(OWNER)).resolves.toBe(true);

  await expect(bumpOpsUsage(OWNER, new Date("2026-09-13T00:00:00Z"))).resolves.toBe(0);
  await setAutoReasoningEnabled(OWNER, true);
  await setAutoIntroSeen(OWNER);
  await setWikiAutoPromote(OWNER, true);
  expect(addReadId(OWNER, "late-read")).toBe(false);
  await persistReadIds(OWNER);
  await writeNoticeSeenId(OWNER, "late-seen");

  expect([...nativeValues.keys()]).toEqual([`account.deletionFence.v1:${OWNER}`]);
  await expect(readOpsUsage(OWNER)).resolves.toBe(0);
  await expect(getAutoReasoningEnabled(OWNER)).resolves.toBe(false);
  await expect(getAutoIntroSeen(OWNER)).resolves.toBe(false);
  await expect(getWikiAutoPromote(OWNER)).resolves.toBe(false);
  expect(getReadIds(OWNER).size).toBe(0);
  expect(nativeValues.has(localReadKey(OWNER))).toBe(false);
  expect(nativeValues.has(noticeSeenKey(OWNER))).toBe(false);
  await expect(readNoticeSeenId(OWNER)).resolves.toBeNull();
});
