const asyncStore = new Map<string, string>();
const mockAsyncStorage = {
  getItem: jest.fn(async (key: string) => asyncStore.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => {
    asyncStore.set(key, value);
  }),
  removeItem: jest.fn(async (key: string) => {
    asyncStore.delete(key);
  }),
};

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: mockAsyncStorage,
}));

import {
  __resetAccountLocalDeletionFencesForTests,
  installAccountLocalDeletionFence,
  isAccountLocalDeletionFencedInMemory,
  releaseAccountLocalDeletionIntent,
  runAccountLocalMutation,
} from "../local-deletion-fence";

class SerialLockManager {
  private readonly tails = new Map<string, Promise<void>>();

  request<T>(name: string, callback: () => Promise<T> | T): Promise<T> {
    const previous = this.tails.get(name) ?? Promise.resolve();
    const result = previous.catch(() => undefined).then(callback);
    const tail = result.then(() => undefined, () => undefined);
    this.tails.set(name, tail);
    void tail.finally(() => {
      if (this.tails.get(name) === tail) this.tails.delete(name);
    });
    return result;
  }
}

const webStore = new Map<string, string>();
const webStorage = {
  getItem: jest.fn((key: string) => webStore.get(key) ?? null),
  setItem: jest.fn((key: string, value: string) => {
    webStore.set(key, value);
  }),
  removeItem: jest.fn((key: string) => {
    webStore.delete(key);
  }),
};

let localStorageDescriptor: PropertyDescriptor | undefined;
let navigatorDescriptor: PropertyDescriptor | undefined;

function useWebRuntime(withLocks = true): void {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: webStorage,
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: withLocks ? { locks: new SerialLockManager() } : {},
  });
}

function useNativeRuntime(): void {
  delete (globalThis as { localStorage?: unknown }).localStorage;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { product: "ReactNative" },
  });
}

beforeAll(() => {
  localStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
});

beforeEach(() => {
  webStore.clear();
  asyncStore.clear();
  jest.clearAllMocks();
  __resetAccountLocalDeletionFencesForTests();
  useWebRuntime();
});

afterAll(() => {
  if (localStorageDescriptor) {
    Object.defineProperty(globalThis, "localStorage", localStorageDescriptor);
  } else {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  }
  if (navigatorDescriptor) {
    Object.defineProperty(globalThis, "navigator", navigatorDescriptor);
  } else {
    delete (globalThis as { navigator?: unknown }).navigator;
  }
});

describe("account-local deletion fence", () => {
  test("waits for a write that already owns the cross-tab lock, then blocks later writes", async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    let started!: () => void;
    const didStart = new Promise<void>((resolve) => { started = resolve; });
    const writes: string[] = [];

    const firstWrite = runAccountLocalMutation("owner-a", async () => {
      started();
      await held;
      writes.push("before-fence");
      return true;
    });
    await didStart;
    const fence = installAccountLocalDeletionFence("owner-a");
    release();

    await expect(firstWrite).resolves.toEqual({ executed: true, value: true });
    await expect(fence).resolves.toBe(true);
    await expect(runAccountLocalMutation("owner-a", async () => {
      writes.push("after-fence");
      return true;
    })).resolves.toEqual({ executed: false });
    expect(writes).toEqual(["before-fence"]);
  });

  test("a fence that wins the lock blocks a concurrently submitted write", async () => {
    const fence = installAccountLocalDeletionFence("owner-a");
    const write = jest.fn(async () => true);
    const lateWrite = runAccountLocalMutation("owner-a", write);

    await expect(fence).resolves.toBe(true);
    await expect(lateWrite).resolves.toEqual({ executed: false });
    expect(write).not.toHaveBeenCalled();
  });

  test("the durable marker survives an in-memory reset and never fences another owner", async () => {
    await expect(installAccountLocalDeletionFence("owner-a")).resolves.toBe(true);
    __resetAccountLocalDeletionFencesForTests();

    const blocked = jest.fn(async () => "a");
    const allowed = jest.fn(async () => "b");
    await expect(runAccountLocalMutation("owner-a", blocked)).resolves.toEqual({ executed: false });
    await expect(runAccountLocalMutation("owner-b", allowed)).resolves.toEqual({
      executed: true,
      value: "b",
    });
    expect(blocked).not.toHaveBeenCalled();
    expect(allowed).toHaveBeenCalledTimes(1);
  });

  test("native mutations share one owner queue with the durable AsyncStorage marker", async () => {
    useNativeRuntime();
    await expect(installAccountLocalDeletionFence("owner-a")).resolves.toBe(true);
    __resetAccountLocalDeletionFencesForTests();

    const write = jest.fn(async () => true);
    await expect(runAccountLocalMutation("owner-a", write)).resolves.toEqual({ executed: false });
    expect(write).not.toHaveBeenCalled();
    expect(mockAsyncStorage.getItem).toHaveBeenCalledWith(
      "account.deletionFence.v1:owner-a",
    );
  });

  test("fails closed when Web Locks are unavailable or the marker cannot be read back", async () => {
    useWebRuntime(false);
    await expect(installAccountLocalDeletionFence("owner-a")).resolves.toBe(false);

    useWebRuntime();
    webStorage.getItem.mockImplementationOnce(() => null);
    await expect(installAccountLocalDeletionFence("owner-b")).resolves.toBe(false);
    const write = jest.fn(async () => true);
    await expect(runAccountLocalMutation("owner-b", write)).resolves.toEqual({ executed: false });
    expect(write).not.toHaveBeenCalled();
  });
});

// A deletion that never reached the server must not leave a live account fenced
// (QA 261004 gates R3-05 / BL-07, 2026-10-05). The deletion now raises a
// reversible intent, promotes it to terminal right before the first Edge call,
// and lifts the intent if it fails before that. Terminal stays irreversible.
describe("reversible intent, irreversible terminal", () => {
  const KEY = "account.deletionFence.v1:owner-a";
  const write = () => jest.fn(async () => "saved");

  test("an intent fences writes exactly like the terminal marker", async () => {
    await expect(installAccountLocalDeletionFence("owner-a", "intent")).resolves.toBe(true);
    expect(webStore.get(KEY)).toBe("intent");
    const blocked = write();
    await expect(runAccountLocalMutation("owner-a", blocked)).resolves.toEqual({ executed: false });
    expect(blocked).not.toHaveBeenCalled();
    expect(isAccountLocalDeletionFencedInMemory("owner-a")).toBe(true);
  });

  test("releasing an intent clears the durable marker and the memory fence", async () => {
    await installAccountLocalDeletionFence("owner-a", "intent");
    await expect(releaseAccountLocalDeletionIntent("owner-a")).resolves.toBe(true);
    expect(webStore.has(KEY)).toBe(false);
    expect(isAccountLocalDeletionFencedInMemory("owner-a")).toBe(false);
    const allowed = write();
    await expect(runAccountLocalMutation("owner-a", allowed)).resolves.toEqual({ executed: true, value: "saved" });
  });

  test("the gate's case: no Web Locks, intent unacknowledged, release leaves nothing behind", async () => {
    useWebRuntime(false);
    await expect(installAccountLocalDeletionFence("owner-a", "intent")).resolves.toBe(false);
    // The marker was written even though it could not be acknowledged.
    expect(webStore.get(KEY)).toBe("intent");
    await expect(releaseAccountLocalDeletionIntent("owner-a")).resolves.toBe(true);
    expect(webStore.has(KEY)).toBe(false);
    const allowed = write();
    await expect(runAccountLocalMutation("owner-a", allowed)).resolves.toEqual({ executed: true, value: "saved" });
  });

  test("a terminal marker is never released, from memory or from storage", async () => {
    await installAccountLocalDeletionFence("owner-a", "intent");
    await expect(installAccountLocalDeletionFence("owner-a")).resolves.toBe(true);
    await expect(releaseAccountLocalDeletionIntent("owner-a")).resolves.toBe(false);
    expect(webStore.get(KEY)).toBe("terminal");
    expect(isAccountLocalDeletionFencedInMemory("owner-a")).toBe(true);

    // Another runtime (reload) that only finds the terminal marker on disk.
    __resetAccountLocalDeletionFencesForTests();
    await expect(releaseAccountLocalDeletionIntent("owner-a")).resolves.toBe(false);
    expect(webStore.get(KEY)).toBe("terminal");
    const blocked = write();
    await expect(runAccountLocalMutation("owner-a", blocked)).resolves.toEqual({ executed: false });
    expect(blocked).not.toHaveBeenCalled();
  });

  test("an intent never downgrades a terminal marker that is already there", async () => {
    await installAccountLocalDeletionFence("owner-a");
    await expect(installAccountLocalDeletionFence("owner-a", "intent")).resolves.toBe(true);
    expect(webStore.get(KEY)).toBe("terminal");
    await expect(releaseAccountLocalDeletionIntent("owner-a")).resolves.toBe(false);
    expect(isAccountLocalDeletionFencedInMemory("owner-a")).toBe(true);
  });

  test("another tab that hit the intent is not fenced after the release", async () => {
    await installAccountLocalDeletionFence("owner-a", "intent");
    // The other tab: its own memory, the same storage.
    __resetAccountLocalDeletionFencesForTests();
    const duringIntent = write();
    await expect(runAccountLocalMutation("owner-a", duringIntent)).resolves.toEqual({ executed: false });
    expect(isAccountLocalDeletionFencedInMemory("owner-a")).toBe(false);
    // The deleting tab lifts it (simulated on storage; this runtime never raised it).
    webStore.delete(KEY);
    const afterRelease = write();
    await expect(runAccountLocalMutation("owner-a", afterRelease)).resolves.toEqual({ executed: true, value: "saved" });
  });

  test("a release that cannot clear storage keeps the owner fenced", async () => {
    await installAccountLocalDeletionFence("owner-a", "intent");
    webStorage.removeItem.mockImplementationOnce(() => { throw new Error("quota"); });
    await expect(releaseAccountLocalDeletionIntent("owner-a")).resolves.toBe(false);
    expect(webStore.get(KEY)).toBe("intent");
    expect(isAccountLocalDeletionFencedInMemory("owner-a")).toBe(true);
  });

  test("a removal that silently did nothing is caught by the read-back", async () => {
    await installAccountLocalDeletionFence("owner-a", "intent");
    webStorage.removeItem.mockImplementationOnce(() => undefined);
    await expect(releaseAccountLocalDeletionIntent("owner-a")).resolves.toBe(false);
    expect(isAccountLocalDeletionFencedInMemory("owner-a")).toBe(true);
  });

  test("a terminal acknowledged in this runtime stays fenced even if storage later loses it", async () => {
    await expect(installAccountLocalDeletionFence("owner-a")).resolves.toBe(true);
    webStore.delete(KEY); // site data cleared, or another writer
    await expect(releaseAccountLocalDeletionIntent("owner-a")).resolves.toBe(false);
    expect(isAccountLocalDeletionFencedInMemory("owner-a")).toBe(true);
  });

  test("an unknown marker value is left in place and keeps fencing", async () => {
    webStore.set(KEY, "something-else");
    await expect(releaseAccountLocalDeletionIntent("owner-a")).resolves.toBe(false);
    expect(webStore.get(KEY)).toBe("something-else");
  });

  test("native: the intent lives in AsyncStorage and is released through the owner queue", async () => {
    useNativeRuntime();
    await expect(installAccountLocalDeletionFence("owner-a", "intent")).resolves.toBe(true);
    expect(asyncStore.get(KEY)).toBe("intent");
    await expect(releaseAccountLocalDeletionIntent("owner-a")).resolves.toBe(true);
    expect(asyncStore.has(KEY)).toBe(false);
    const allowed = write();
    await expect(runAccountLocalMutation("owner-a", allowed)).resolves.toEqual({ executed: true, value: "saved" });

    await installAccountLocalDeletionFence("owner-a");
    await expect(releaseAccountLocalDeletionIntent("owner-a")).resolves.toBe(false);
    expect(asyncStore.get(KEY)).toBe("terminal");
  });
});
