// Import history is scoped per user. It used to be one global key, so on a
// shared device account B read account A's import log — source kind, dates, the
// count summary, and A's revoke pointers (security audit 260904 F-08).
//
// A real behavioural test with an in-memory AsyncStorage, not a source scan:
// the whole point is that two user ids never see each other's rows and that the
// pre-F-08 unscoped blob is purged rather than surfaced.

const store = new Map<string, string>();

const mockAsyncStorage = {
  getItem: jest.fn(async (k: string) => (store.has(k) ? store.get(k)! : null)),
  setItem: jest.fn(async (k: string, v: string) => {
    store.set(k, String(v));
  }),
  removeItem: jest.fn(async (k: string) => {
    store.delete(k);
  }),
};

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: mockAsyncStorage,
}));

import {
  addImportHistory,
  getImportHistory,
  removeImportHistory,
  type ImportHistoryEntry,
} from "../history";

const LEGACY_KEY = "import.history";

function entry(id: string, sourceKey = "health"): ImportHistoryEntry {
  return { id, sourceKey, name: `n-${id}`, atIso: "2026-09-04T00:00:00.000Z", summary: "약속 1", sourceIds: [`row-${id}`] };
}

beforeEach(() => {
  store.clear();
  jest.clearAllMocks();
});

describe("import history is per-user (F-08)", () => {
  test("account B never sees account A's entries", async () => {
    await addImportHistory("user-A", entry("a1"));
    await addImportHistory("user-A", entry("a2"));

    // B, on the same device, opens the history screen.
    const bHistory = await getImportHistory("user-B");
    expect(bHistory).toEqual([]);

    // And A still has A's.
    const aHistory = await getImportHistory("user-A");
    expect(aHistory.map((e) => e.id).sort()).toEqual(["a1", "a2"]);
  });

  test("the stored key carries the user id — no global key is written", async () => {
    await addImportHistory("user-A", entry("a1"));
    const keys = [...store.keys()];
    expect(keys).toContain("import.history:user-A");
    // The regression: the old global key must not be what we write to.
    expect(keys).not.toContain(LEGACY_KEY);
  });

  test("B's revoke cannot remove A's local pointer", async () => {
    await addImportHistory("user-A", entry("a1"));
    // B tries to remove the same id from ITS scope — A is untouched.
    await removeImportHistory("user-B", "a1");
    expect((await getImportHistory("user-A")).map((e) => e.id)).toEqual(["a1"]);
    // A removing its own id works.
    await removeImportHistory("user-A", "a1");
    expect(await getImportHistory("user-A")).toEqual([]);
  });

  test("the pre-F-08 unscoped blob is purged on read, never surfaced", async () => {
    // Simulate a device upgraded from the global-key version.
    store.set(LEGACY_KEY, JSON.stringify([entry("legacy1"), entry("legacy2")]));

    // Any user's first read returns THEIR scoped history (empty here)...
    expect(await getImportHistory("user-B")).toEqual([]);
    // ...and the orphan blob is gone, so it can never be attributed to anyone.
    expect(store.has(LEGACY_KEY)).toBe(false);
  });

  test("a missing user id yields empty history and writes nothing", async () => {
    expect(await getImportHistory("")).toEqual([]);
    await addImportHistory("", entry("x1"));
    await removeImportHistory("", "x1");
    expect(store.size).toBe(0);
  });
});
