// The shared read-state store (src/lib/notices/read-store.ts).
//
// This exists because of two defects in 0113's client that only a shared,
// persisted store can fix, and neither is reachable from a component test here
// (RN 0.85 + jest 29). So the store's contract is pinned directly:
//
//   * THREE useNoticeCenter instances are mounted at once (home, /settings,
//     /notices). /notices is pushed OVER a still-mounted home, so a private
//     read set left the home bell lit after the inbox cleared it.
//   * A failed INSERT (offline 확인) used to leave nothing on the device, so
//     the same `major` notice re-interrupted on every cold start.

import {
  LOCAL_READ_LIMIT,
  addReadId,
  getReadIds,
  getRevision,
  loadPersistedReadIds,
  localReadKey,
  mergeReadIds,
  persistReadIds,
  resetReadStore,
  subscribe,
} from "../read-store";

const USER = "user-1";

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
  key(): string | null {
    return null;
  }
  get length(): number {
    return this.map.size;
  }
}

const storage = new MemoryStorage();

beforeAll(() => {
  // read-store reaches for `localStorage` first; jest's node env has none.
  (globalThis as unknown as { localStorage: MemoryStorage }).localStorage = storage;
});

beforeEach(() => {
  resetReadStore();
  storage.clear();
});

describe("one store, every mounted instance", () => {
  test("an id added anywhere is visible everywhere", () => {
    addReadId(USER, "n1");
    // Two separate reads stand in for the home and inbox hook instances.
    expect(getReadIds(USER).has("n1")).toBe(true);
    expect([...getReadIds(USER)]).toEqual(["n1"]);
  });

  test("subscribers are notified, which is what re-renders the other screens", () => {
    const seen: number[] = [];
    const unsubscribe = subscribe(() => seen.push(getRevision()));

    addReadId(USER, "n1");
    addReadId(USER, "n2");

    expect(seen).toHaveLength(2);
    expect(seen[1]).toBeGreaterThan(seen[0]);
    unsubscribe();

    addReadId(USER, "n3");
    expect(seen).toHaveLength(2);
  });

  test("re-adding the same id notifies nobody, so it cannot loop a render", () => {
    addReadId(USER, "n1");
    let calls = 0;
    subscribe(() => {
      calls += 1;
    });
    expect(addReadId(USER, "n1")).toBe(false);
    expect(calls).toBe(0);
  });

  test("users do not share a set", () => {
    addReadId(USER, "n1");
    addReadId("user-2", "n2");
    expect([...getReadIds(USER)]).toEqual(["n1"]);
    expect([...getReadIds("user-2")]).toEqual(["n2"]);
  });

  test("a signed-out caller gets an empty set rather than a throw", () => {
    expect(getReadIds(null).size).toBe(0);
  });
});

describe("merge never replaces", () => {
  test("a server snapshot cannot undo a read the user just made", () => {
    // The exact race: fetchReadNoticeIds() was in flight when the user
    // confirmed. The snapshot predates the INSERT and does not contain n9.
    addReadId(USER, "n9");
    mergeReadIds(USER, ["a", "b"]);
    expect([...getReadIds(USER)].sort()).toEqual(["a", "b", "n9"]);
  });

  test("merging is idempotent and reports whether anything changed", () => {
    expect(mergeReadIds(USER, ["a"])).toBe(true);
    expect(mergeReadIds(USER, ["a"])).toBe(false);
  });
});

describe("local mirror survives a failed write", () => {
  test("an id added while offline is still read after a restart", async () => {
    addReadId(USER, "major-1");
    await persistReadIds(USER);

    // Restart: memory is gone, storage is not.
    resetReadStore();
    expect(getReadIds(USER).has("major-1")).toBe(false);

    const restored = await loadPersistedReadIds(USER);
    mergeReadIds(USER, restored);
    expect(getReadIds(USER).has("major-1")).toBe(true);
  });

  test("it is written under a per-user key", async () => {
    addReadId(USER, "n1");
    await persistReadIds(USER);
    expect(storage.getItem(localReadKey(USER))).toBe(JSON.stringify(["n1"]));
    expect(storage.getItem(localReadKey("user-2"))).toBeNull();
  });

  test("corrupt storage degrades to empty instead of throwing", async () => {
    storage.setItem(localReadKey(USER), "{not json");
    await expect(loadPersistedReadIds(USER)).resolves.toEqual([]);

    storage.setItem(localReadKey(USER), JSON.stringify({ nope: true }));
    await expect(loadPersistedReadIds(USER)).resolves.toEqual([]);

    storage.setItem(localReadKey(USER), JSON.stringify(["ok", 42, null]));
    await expect(loadPersistedReadIds(USER)).resolves.toEqual(["ok"]);
  });

  test("the mirror is capped, keeping the newest ids", async () => {
    // AsyncStorage entries are size-limited on Android
    // (ANDROID_QA_GUIDELINES.md), and only recent notices can still pop.
    for (let i = 0; i < LOCAL_READ_LIMIT + 5; i += 1) addReadId(USER, `n${i}`);
    await persistReadIds(USER);

    const stored = JSON.parse(storage.getItem(localReadKey(USER)) ?? "[]") as string[];
    expect(stored).toHaveLength(LOCAL_READ_LIMIT);
    expect(stored.at(-1)).toBe(`n${LOCAL_READ_LIMIT + 4}`);
    expect(stored).not.toContain("n0");
  });
});
