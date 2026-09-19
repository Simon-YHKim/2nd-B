// R14-BOOT-EXIT coverage for the persistence counter behind the fail-closed
// boot lock.
//
// HOW A COLD START IS MODELLED. One JS run owns exactly one instance of the
// module's state, and AsyncStorage outlives the process. So a cold start here
// is a FRESH MODULE INSTANCE (jest.isolateModules) over a storage fake that
// survives it - not a test-only reset hook the product code would have to carry.
// If the "once per run" memo ever moved somewhere a restart does not clear,
// these tests would stop matching the device.
//
// SCOPE LIMIT, stated rather than papered over: the repo's jest setup has no
// renderer, so AuthProvider itself is not mounted. The executor it calls
// (`escalateFailClosedLockIfPersistent`) runs here with fakes, and the
// provider-to-executor wiring is pinned against the real source in
// storage-recovery.test.ts.

import { createEncryptedNativeStorage } from "../../storage/encrypted-native-storage";
import {
  FAIL_CLOSED_COLD_START_KEY,
  FAIL_CLOSED_ESCALATION_THRESHOLD,
} from "../fail-closed-persistence";

type PersistenceModule = typeof import("../fail-closed-persistence");

const mockAsyncStorageValues = new Map<string, string>();
const mockAsyncStorageFactory = jest.fn();

jest.mock("@react-native-async-storage/async-storage", () => {
  mockAsyncStorageFactory();
  return {
    __esModule: true,
    default: {
      getItem: async (key: string) => mockAsyncStorageValues.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        mockAsyncStorageValues.set(key, value);
      },
      removeItem: async (key: string) => {
        mockAsyncStorageValues.delete(key);
      },
    },
  };
});

/** A new JS run: fresh module state over whatever the disk already holds. */
function coldStart(): PersistenceModule {
  let instance: PersistenceModule | undefined;
  jest.isolateModules(() => {
    instance = require("../fail-closed-persistence") as PersistenceModule;
  });
  if (!instance) throw new Error("module did not load");
  return instance;
}

function createDisk(initial: Record<string, string> = {}) {
  const values = new Map<string, string>(Object.entries(initial));
  const storage = {
    getItem: jest.fn(async (key: string) => values.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      values.set(key, value);
    }),
    removeItem: jest.fn(async (key: string) => {
      values.delete(key);
    }),
  };
  return { values, storage };
}

const KEY = FAIL_CLOSED_COLD_START_KEY;

describe("the persistence threshold", () => {
  test("is three cold starts", () => {
    expect(FAIL_CLOSED_ESCALATION_THRESHOLD).toBe(3);
  });

  test("locks on the first two failing cold starts and escalates on the third", async () => {
    const disk = createDisk();
    const decisions: string[] = [];
    const stored: (string | undefined)[] = [];
    for (let run = 0; run < 4; run += 1) {
      decisions.push(await coldStart().noteFailClosedColdStart(disk.storage));
      stored.push(disk.values.get(KEY));
    }
    // The fourth run is the user who saw the gate, declined, and relaunched:
    // still the gate, and the stored value does not grow without bound.
    expect(decisions).toEqual(["locked", "locked", "escalate", "escalate"]);
    expect(stored).toEqual(["1", "2", "3", "3"]);
  });
});

describe("one JS run counts once", () => {
  test("however many times the failing branch is re-entered", async () => {
    const disk = createDisk();
    const run = coldStart();
    const concurrent = await Promise.all([
      run.noteFailClosedColdStart(disk.storage),
      run.noteFailClosedColdStart(disk.storage),
    ]);
    const later = await run.noteFailClosedColdStart(disk.storage);

    expect([...concurrent, later]).toEqual(["locked", "locked", "locked"]);
    expect(disk.values.get(KEY)).toBe("1");
    expect(disk.storage.setItem).toHaveBeenCalledTimes(1);
  });
});

describe("returning the streak to zero", () => {
  test("a settled bootstrap clears it, so the next failure starts over", async () => {
    const disk = createDisk();
    await coldStart().noteFailClosedColdStart(disk.storage);
    await coldStart().noteFailClosedColdStart(disk.storage);
    expect(disk.values.get(KEY)).toBe("2");

    await coldStart().clearFailClosedColdStarts(disk.storage);
    expect(disk.values.has(KEY)).toBe(false);

    await expect(coldStart().noteFailClosedColdStart(disk.storage)).resolves.toBe("locked");
    expect(disk.values.get(KEY)).toBe("1");
  });

  test("clearing reopens the current run: a later failure in it counts again", async () => {
    const disk = createDisk();
    const run = coldStart();
    await run.noteFailClosedColdStart(disk.storage);
    await run.clearFailClosedColdStarts(disk.storage);
    await run.noteFailClosedColdStart(disk.storage);
    expect(disk.storage.setItem).toHaveBeenCalledTimes(2);
  });

  test("is best-effort: a store that cannot clear never throws on the healthy path", async () => {
    const disk = createDisk({ [KEY]: "2" });
    disk.storage.removeItem.mockRejectedValueOnce(new Error("backing store offline"));
    await expect(coldStart().clearFailClosedColdStarts(disk.storage)).resolves.toBeUndefined();
  });
});

describe("a counter that cannot be read escalates at once", () => {
  test("when the read rejects", async () => {
    const disk = createDisk();
    disk.storage.getItem.mockRejectedValueOnce(new Error("backing store offline"));
    await expect(coldStart().noteFailClosedColdStart(disk.storage)).resolves.toBe("escalate");
    expect(disk.storage.setItem).not.toHaveBeenCalled();
  });

  test.each(["abc", "-1", "1.5", "", "03", " 2", "2 ", "1e3", "99999999"])(
    "when the stored value %p is not a count this module wrote",
    async (garbage) => {
      const disk = createDisk({ [KEY]: garbage });
      await expect(coldStart().noteFailClosedColdStart(disk.storage)).resolves.toBe("escalate");
      expect(disk.storage.setItem).not.toHaveBeenCalled();
    },
  );
});

describe("a counter that cannot be written escalates at once", () => {
  test("when the write rejects", async () => {
    const disk = createDisk();
    disk.storage.setItem.mockRejectedValueOnce(new Error("disk full"));
    await expect(coldStart().noteFailClosedColdStart(disk.storage)).resolves.toBe("escalate");
  });

  test("when the write resolves but does not stick", async () => {
    const disk = createDisk();
    disk.storage.setItem.mockResolvedValueOnce(undefined);
    await expect(coldStart().noteFailClosedColdStart(disk.storage)).resolves.toBe("escalate");
    expect(disk.values.has(KEY)).toBe(false);
  });
});

describe("storage operations never interleave", () => {
  test("a clear and a count issued back to back run one after the other", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const values = new Map<string, string>([[KEY, "2"]]);
    const tracked = async <T>(operation: () => T): Promise<T> => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise<void>((resolve) => setTimeout(resolve, 5));
      try {
        return operation();
      } finally {
        inFlight -= 1;
      }
    };
    const storage = {
      getItem: (key: string) => tracked(() => values.get(key) ?? null),
      setItem: (key: string, value: string) => tracked(() => void values.set(key, value)),
      removeItem: (key: string) => tracked(() => void values.delete(key)),
    };

    const run = coldStart();
    const cleared = run.clearFailClosedColdStarts(storage);
    const counted = run.noteFailClosedColdStart(storage);
    await Promise.all([cleared, counted]);

    expect(maxInFlight).toBe(1);
  });
});

describe("runtime selection", () => {
  const descriptors = new Map<string, PropertyDescriptor | undefined>();
  const GLOBALS = ["document", "navigator"] as const;

  beforeEach(() => {
    for (const name of GLOBALS) {
      descriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    }
    mockAsyncStorageValues.clear();
    mockAsyncStorageFactory.mockClear();
  });

  afterEach(() => {
    for (const name of GLOBALS) {
      const descriptor = descriptors.get(name);
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
    descriptors.clear();
  });

  const asReactNative = () => {
    Reflect.deleteProperty(globalThis, "document");
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { product: "ReactNative" },
    });
  };

  test("a genuine native runtime counts in plaintext AsyncStorage", async () => {
    asReactNative();
    await expect(coldStart().noteFailClosedColdStart()).resolves.toBe("locked");
    expect(mockAsyncStorageValues.get(KEY)).toBe("1");

    await coldStart().clearFailClosedColdStarts();
    expect(mockAsyncStorageValues.has(KEY)).toBe(false);
  });

  test("web does nothing: consented recovery is native-only, so a web gate could never succeed", async () => {
    asReactNative();
    Object.defineProperty(globalThis, "document", { configurable: true, value: {} });

    const run = coldStart();
    await expect(run.noteFailClosedColdStart()).resolves.toBe("unsupported");
    await expect(run.clearFailClosedColdStarts()).resolves.toBeUndefined();
    expect(mockAsyncStorageFactory).not.toHaveBeenCalled();
  });

  test("a runtime that is not React Native does nothing", async () => {
    Reflect.deleteProperty(globalThis, "document");
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: {} });

    await expect(coldStart().noteFailClosedColdStart()).resolves.toBe("unsupported");
    expect(mockAsyncStorageFactory).not.toHaveBeenCalled();
  });
});

describe("the counter key stays outside the encrypted store", () => {
  // The encrypted store is the thing that is broken when this counter matters.
  // Its allowlist is what the startup plaintext migration and the consented
  // wipe walk, so a key it refuses is a key neither of them touches.
  const adapter = createEncryptedNativeStorage({
    backing: {
      getItem: jest.fn(),
      setItem: jest.fn(),
      removeItem: jest.fn(),
      getAllKeys: jest.fn(),
    },
    secrets: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
    crypto: {
      generateKey: jest.fn(),
      fingerprintKey: jest.fn(),
      encrypt: jest.fn(),
      decrypt: jest.fn(),
    },
  });

  test("the adapter refuses it as unmanaged", async () => {
    await expect(adapter.setItem(KEY, "1")).rejects.toThrow("secure_storage_key_invalid");
    await expect(adapter.getItem(KEY)).rejects.toThrow("secure_storage_key_invalid");
    await expect(adapter.removeItem(KEY)).rejects.toThrow("secure_storage_key_invalid");
  });

  test("it does not squat on the adapter's reserved prefix", () => {
    expect(KEY.startsWith("secondB.secureStorage.")).toBe(false);
  });
});

describe("the executor AuthProvider calls", () => {
  const settle = (
    persistence: "locked" | "escalate" | "unsupported" | Error,
    isCurrent = true,
  ) => {
    const escalate = jest.fn();
    const outcome = coldStart().escalateFailClosedLockIfPersistent({
      isCurrent: () => isCurrent,
      escalate,
      note: () =>
        persistence instanceof Error ? Promise.reject(persistence) : Promise.resolve(persistence),
    });
    return { escalate, outcome };
  };

  test("publishes the gate exactly once when the failure has persisted", async () => {
    const { escalate, outcome } = settle("escalate");
    await expect(outcome).resolves.toBe("escalated");
    expect(escalate).toHaveBeenCalledTimes(1);
  });

  test.each(["locked", "unsupported"] as const)(
    "leaves today's lock alone while the outcome is %s",
    async (persistence) => {
      const { escalate, outcome } = settle(persistence);
      await expect(outcome).resolves.toBe(persistence);
      expect(escalate).not.toHaveBeenCalled();
    },
  );

  test("never publishes from a cancelled, superseded, or already-gated effect", async () => {
    const { escalate, outcome } = settle("escalate", false);
    await expect(outcome).resolves.toBe("stale");
    expect(escalate).not.toHaveBeenCalled();
  });

  test("treats a counter that throws as unreadable, and never rejects", async () => {
    const { escalate, outcome } = settle(new Error("counter exploded"));
    await expect(outcome).resolves.toBe("escalated");
    expect(escalate).toHaveBeenCalledTimes(1);
  });

  test("runs against the real counter when no seam is injected", async () => {
    // Node is not a React Native runtime, so production selection answers
    // "unsupported" and the gate is not raised.
    const escalate = jest.fn();
    await expect(
      coldStart().escalateFailClosedLockIfPersistent({ isCurrent: () => true, escalate }),
    ).resolves.toBe("unsupported");
    expect(escalate).not.toHaveBeenCalled();
  });
});
