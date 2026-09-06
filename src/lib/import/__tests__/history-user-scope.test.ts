// Import history is scoped per user. It used to be one global key, so on a
// shared device account B read account A's import log — source kind, dates, the
// count summary, and A's revoke pointers (security audit 260904 F-08).
//
// A real behavioural test with an in-memory AsyncStorage, not a source scan:
// the whole point is that two user ids never see each other's rows and that the
// pre-F-08 unscoped blob is purged rather than surfaced.

const webStore = new Map<string, string>();
const nativeStore = new Map<string, string>();

const mockAsyncStorage = {
  getItem: jest.fn(async (k: string) => (webStore.has(k) ? webStore.get(k)! : null)),
  setItem: jest.fn(async (k: string, v: string) => {
    webStore.set(k, String(v));
  }),
  removeItem: jest.fn(async (k: string) => {
    webStore.delete(k);
  }),
};

const mockEncryptedStorage = {
  getItem: jest.fn(async (key: string) => nativeStore.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => {
    nativeStore.set(key, value);
  }),
  removeItem: jest.fn(async (key: string) => {
    nativeStore.delete(key);
  }),
};
const mockGetEncryptedNativeStorage = jest.fn(() => mockEncryptedStorage);
const mockMigrateLegacyNativePlaintextAtStartup = jest.fn();

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: mockAsyncStorage,
}));

jest.mock("../../storage/encrypted-native-storage", () => ({
  getEncryptedNativeStorage: () => mockGetEncryptedNativeStorage(),
  migrateLegacyNativePlaintextAtStartup: () => mockMigrateLegacyNativePlaintextAtStartup(),
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
  webStore.clear();
  nativeStore.clear();
  mockAsyncStorage.getItem.mockReset().mockImplementation(
    async (key: string) => webStore.get(key) ?? null,
  );
  mockAsyncStorage.setItem.mockReset().mockImplementation(async (key: string, value: string) => {
    webStore.set(key, String(value));
  });
  mockAsyncStorage.removeItem.mockReset().mockImplementation(async (key: string) => {
    webStore.delete(key);
  });
  mockEncryptedStorage.getItem.mockReset().mockImplementation(
    async (key: string) => nativeStore.get(key) ?? null,
  );
  mockEncryptedStorage.setItem.mockReset().mockImplementation(async (key: string, value: string) => {
    nativeStore.set(key, value);
  });
  mockEncryptedStorage.removeItem.mockReset().mockImplementation(async (key: string) => {
    nativeStore.delete(key);
  });
  mockGetEncryptedNativeStorage.mockReset().mockReturnValue(mockEncryptedStorage);
  mockMigrateLegacyNativePlaintextAtStartup.mockReset();
});

async function withNativeRuntime(
  run: (visibleLocalStorage: {
    getItem: jest.Mock;
    setItem: jest.Mock;
    removeItem: jest.Mock;
  }) => Promise<void>,
): Promise<void> {
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const localStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const visibleLocalStorage = {
    getItem: jest.fn(() => null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  };
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { product: "ReactNative" },
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: visibleLocalStorage,
  });
  try {
    await run(visibleLocalStorage);
  } finally {
    if (navigatorDescriptor) Object.defineProperty(globalThis, "navigator", navigatorDescriptor);
    else delete (globalThis as { navigator?: unknown }).navigator;
    if (localStorageDescriptor) Object.defineProperty(globalThis, "localStorage", localStorageDescriptor);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  }
}

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
    const keys = [...webStore.keys()];
    expect(keys).toContain("import.history:user-A");
    // The regression: the old global key must not be what we write to.
    expect(keys).not.toContain(LEGACY_KEY);
  });

  test("canonicalizes bounded owners and rejects unsafe owner keys", async () => {
    await addImportHistory("  user-A  ", entry("a1"));
    await addImportHistory(`user-${"x".repeat(129)}`, entry("too-long"));
    await addImportHistory("user-A\nother", entry("control"));

    expect([...webStore.keys()]).toEqual(["import.history:user-A"]);
    expect(await getImportHistory(" user-A ")).toEqual([entry("a1")]);
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
    webStore.set(LEGACY_KEY, JSON.stringify([entry("legacy1"), entry("legacy2")]));

    // Any user's first read returns THEIR scoped history (empty here)...
    expect(await getImportHistory("user-B")).toEqual([]);
    // ...and the orphan blob is gone, so it can never be attributed to anyone.
    expect(webStore.has(LEGACY_KEY)).toBe(false);
  });

  test("a missing user id yields empty history and writes nothing", async () => {
    expect(await getImportHistory("")).toEqual([]);
    await addImportHistory("", entry("x1"));
    await removeImportHistory("", "x1");
    expect(webStore.size).toBe(0);
  });

  test("web keeps the existing AsyncStorage-backed behavior", async () => {
    await addImportHistory("web-user", entry("web-1"));

    expect(await getImportHistory("web-user")).toEqual([entry("web-1")]);
    expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
      "import.history:web-user",
      expect.any(String),
    );
    expect(mockGetEncryptedNativeStorage).not.toHaveBeenCalled();
  });

  test("normalizes parsed entries and enforces the 50-entry cap", async () => {
    const normalized = {
      ...entry("normalized"),
      extra: "ignored",
    };
    webStore.set(
      "import.history:user-A",
      JSON.stringify([
        normalized,
        null,
        { ...entry("wrong-id"), id: 3 },
        { ...entry("wrong-source-id"), sourceIds: ["valid", 4, null] },
        ...Array.from({ length: 55 }, (_, index) => entry(`cap-${index}`)),
      ]),
    );

    const history = await getImportHistory("user-A");
    expect(history).toHaveLength(50);
    expect(history[0]).toEqual(entry("normalized"));
    expect(history.some((item) => item.id === "wrong-id")).toBe(false);
    expect(history.some((item) => item.id === "wrong-source-id")).toBe(false);
  });

  test("rejects oversized entry fields and source-id collections before serialization", async () => {
    await addImportHistory("user-A", { ...entry("large-name"), name: "n".repeat(513) });
    await addImportHistory("user-A", {
      ...entry("many-sources"),
      sourceIds: Array.from({ length: 257 }, (_, index) => `source-${index}`),
    });

    expect(mockAsyncStorage.setItem).not.toHaveBeenCalled();
    expect(webStore.has("import.history:user-A")).toBe(false);
  });
});

describe("native import history uses encrypted storage", () => {
  test("uses only the encrypted adapter even when a localStorage polyfill is visible", async () => {
    await withNativeRuntime(async (visibleLocalStorage) => {
      await addImportHistory("native-user", entry("native-1"));
      expect(await getImportHistory("native-user")).toEqual([entry("native-1")]);
      await removeImportHistory("native-user", "native-1");

      expect(mockGetEncryptedNativeStorage).toHaveBeenCalled();
      expect(mockEncryptedStorage.setItem).toHaveBeenCalledWith(
        "import.history:native-user",
        expect.any(String),
      );
      expect(mockAsyncStorage.getItem).not.toHaveBeenCalled();
      expect(mockAsyncStorage.setItem).not.toHaveBeenCalled();
      expect(mockAsyncStorage.removeItem).not.toHaveBeenCalled();
      expect(visibleLocalStorage.getItem).not.toHaveBeenCalled();
      expect(visibleLocalStorage.setItem).not.toHaveBeenCalled();
      expect(visibleLocalStorage.removeItem).not.toHaveBeenCalled();
      expect(mockMigrateLegacyNativePlaintextAtStartup).not.toHaveBeenCalled();
    });
  });

  test("deletes the unowned legacy key without reading or carrying it forward", async () => {
    await withNativeRuntime(async () => {
      nativeStore.set(LEGACY_KEY, JSON.stringify([entry("unowned")]));

      expect(await getImportHistory("native-user")).toEqual([]);
      expect(mockEncryptedStorage.removeItem).toHaveBeenCalledWith(LEGACY_KEY);
      expect(mockEncryptedStorage.getItem).not.toHaveBeenCalledWith(LEGACY_KEY);
      expect(nativeStore.has(LEGACY_KEY)).toBe(false);
      expect(nativeStore.has("import.history:native-user")).toBe(false);
    });
  });

  test("fails closed on recovery errors and never overwrites unreadable history", async () => {
    await withNativeRuntime(async () => {
      const key = "import.history:native-user";
      const original = JSON.stringify([entry("preserve-me")]);
      nativeStore.set(key, original);
      mockEncryptedStorage.getItem.mockImplementation(async (candidate: string) => {
        if (candidate === key) throw new Error("secure_storage_recovery_required");
        return nativeStore.get(candidate) ?? null;
      });

      await expect(getImportHistory("native-user")).rejects.toThrow(
        "secure_storage_recovery_required",
      );
      await addImportHistory("native-user", entry("must-not-land"));
      await removeImportHistory("native-user", "preserve-me");

      expect(mockEncryptedStorage.setItem).not.toHaveBeenCalled();
      expect(nativeStore.get(key)).toBe(original);
    });
  });

  test("fails closed on malformed or out-of-contract durable payloads", async () => {
    await withNativeRuntime(async () => {
      const key = "import.history:native-user";
      for (const raw of [
        "{not-json",
        JSON.stringify([{ ...entry("invalid-shape"), sourceIds: ["valid", 4] }]),
        JSON.stringify([{ ...entry("oversized"), summary: "s".repeat(2049) }]),
      ]) {
        nativeStore.set(key, raw);
        mockEncryptedStorage.setItem.mockClear();

        await expect(getImportHistory("native-user")).rejects.toThrow(
          "import_history_invalid",
        );
        await addImportHistory("native-user", entry("must-not-land"));
        await removeImportHistory("native-user", "invalid-shape");

        expect(mockEncryptedStorage.setItem).not.toHaveBeenCalled();
        expect(nativeStore.get(key)).toBe(raw);
      }
    });
  });

  test("does not fall back when encrypted storage initialization fails", async () => {
    await withNativeRuntime(async (visibleLocalStorage) => {
      mockGetEncryptedNativeStorage.mockImplementation(() => {
        throw new Error("secure_storage_key_unavailable");
      });

      await expect(getImportHistory("native-user")).rejects.toThrow(
        "secure_storage_key_unavailable",
      );
      await addImportHistory("native-user", entry("must-not-land"));

      expect(mockAsyncStorage.setItem).not.toHaveBeenCalled();
      expect(visibleLocalStorage.setItem).not.toHaveBeenCalled();
      expect(nativeStore.size).toBe(0);
    });
  });

  test("serializes concurrent mutations so neither entry is lost", async () => {
    await withNativeRuntime(async () => {
      const key = "import.history:native-user";
      let releaseFirstRead!: () => void;
      let signalFirstRead!: () => void;
      const firstReadStarted = new Promise<void>((resolve) => {
        signalFirstRead = resolve;
      });
      const firstReadGate = new Promise<void>((resolve) => {
        releaseFirstRead = resolve;
      });
      let firstManagedRead = true;
      mockEncryptedStorage.getItem.mockImplementation(async (candidate: string) => {
        const snapshot = nativeStore.get(candidate) ?? null;
        if (candidate === key && firstManagedRead) {
          firstManagedRead = false;
          signalFirstRead();
          await firstReadGate;
        }
        return snapshot;
      });

      const first = addImportHistory("native-user", entry("first"));
      await firstReadStarted;
      const second = addImportHistory("native-user", entry("second"));
      await Promise.resolve();
      releaseFirstRead();
      await Promise.all([first, second]);

      expect((await getImportHistory("native-user")).map((item) => item.id)).toEqual([
        "second",
        "first",
      ]);
    });
  });
});
