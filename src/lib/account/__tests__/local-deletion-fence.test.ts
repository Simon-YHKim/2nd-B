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
