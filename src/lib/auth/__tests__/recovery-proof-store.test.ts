import {
  __resetRecoveryProofStorageQueueForTests,
  armWebRecoveryPendingFromLocation,
  clearRecoveryPending,
  clearRecoveryProof,
  createRecoveryProof,
  isRecoveryPendingInMemory,
  loadRecoveryPending,
  loadRecoveryProof,
  parseRecoveryProof,
  persistRecoveryPending,
  persistRecoveryProof,
  recoveryProofMatchesSession,
  recoverySessionIdentity,
  RECOVERY_PENDING_KEY,
  RECOVERY_PROOF_KEY,
  sessionIdFromAccessToken,
} from "../recovery-proof-store";
import {
  getEncryptedNativeStorage,
  type StringStorage,
} from "../../storage/encrypted-native-storage";

jest.mock("../../storage/encrypted-native-storage", () => ({
  getEncryptedNativeStorage: jest.fn(),
}));

const getEncryptedNativeStorageMock = jest.mocked(getEncryptedNativeStorage);

function accessToken(sessionId: string): string {
  const payload = Buffer.from(JSON.stringify({ sub: "u1", session_id: sessionId }))
    .toString("base64url");
  return `header.${payload}.signature`;
}

describe("persistent recovery proof", () => {
  const values = new Map<string, string>();

  beforeEach(() => {
    values.clear();
    __resetRecoveryProofStorageQueueForTests();
    getEncryptedNativeStorageMock.mockReset();
    Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    });
  });

  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  test("binds proof to the stable JWT session_id, not just the user", () => {
    const token = accessToken("session-a");
    expect(sessionIdFromAccessToken(token)).toBe("session-a");
    expect(recoverySessionIdentity({ access_token: token, user: { id: "u1" } })).toEqual({
      userId: "u1",
      sessionId: "session-a",
    });
    const proof = createRecoveryProof({ userId: "u1", sessionId: "session-a" });
    expect(recoveryProofMatchesSession(proof, { access_token: token, user: { id: "u1" } })).toBe(true);
    expect(
      recoveryProofMatchesSession(proof, {
        access_token: accessToken("session-b"),
        user: { id: "u1" },
      }),
    ).toBe(false);
  });

  test("rejects malformed, tokenless, and incomplete identities", () => {
    expect(sessionIdFromAccessToken("not-a-jwt")).toBeNull();
    expect(recoverySessionIdentity({ user: { id: "u1" } })).toBeNull();
    expect(parseRecoveryProof("{}")).toBeNull();
    expect(parseRecoveryProof("not-json")).toBeNull();
  });

  test("persists, hydrates, and clears a secret-free marker", async () => {
    const proof = createRecoveryProof({ userId: "u1", sessionId: "session-a" });
    await persistRecoveryProof(proof);
    expect(JSON.parse(values.get(RECOVERY_PROOF_KEY) ?? "{}")).toEqual(proof);
    await expect(loadRecoveryProof()).resolves.toEqual(proof);
    await clearRecoveryProof();
    await expect(loadRecoveryProof()).resolves.toBeNull();
    expect(getEncryptedNativeStorageMock).not.toHaveBeenCalled();
  });

  test("removes an invalid persisted marker during hydration", async () => {
    values.set(RECOVERY_PROOF_KEY, JSON.stringify({ userId: "u1" }));
    await expect(loadRecoveryProof()).rejects.toThrow("invalid");
    expect(values.has(RECOVERY_PROOF_KEY)).toBe(false);
  });

  test("persists and broadcasts a provisional recovery lock", async () => {
    expect(isRecoveryPendingInMemory()).toBe(false);
    await persistRecoveryPending();
    expect(isRecoveryPendingInMemory()).toBe(true);
    expect(values.has(RECOVERY_PENDING_KEY)).toBe(true);
    await expect(loadRecoveryPending()).resolves.toEqual({ issuedAt: expect.any(String) });
    await clearRecoveryPending();
    expect(isRecoveryPendingInMemory()).toBe(false);
    expect(values.has(RECOVERY_PENDING_KEY)).toBe(false);
  });

  test("arms web callback routes before Supabase consumes their session", () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { location: { href: "https://example.com/2nd-B/reset-password?code=pkce-1" } },
    });
    expect(armWebRecoveryPendingFromLocation()).toBe(true);
    expect(isRecoveryPendingInMemory()).toBe(true);
    expect(values.has(RECOVERY_PENDING_KEY)).toBe(true);
  });
});

function createNativeStorage(initial?: Readonly<Record<string, string>>) {
  const values = new Map(Object.entries(initial ?? {}));
  const store: StringStorage = {
    getItem: jest.fn(async (key: string) => values.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => { values.set(key, value); }),
    removeItem: jest.fn(async (key: string) => { values.delete(key); }),
  };
  return { store, values };
}

describe("native recovery proof storage", () => {
  let navigatorDescriptor: PropertyDescriptor | undefined;
  let windowDescriptor: PropertyDescriptor | undefined;
  let localStorageDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    __resetRecoveryProofStorageQueueForTests();
    getEncryptedNativeStorageMock.mockReset();
    navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
    localStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { product: "ReactNative" },
    });
  });

  afterEach(() => {
    jest.dontMock("@react-native-async-storage/async-storage");
    if (navigatorDescriptor) Object.defineProperty(globalThis, "navigator", navigatorDescriptor);
    else Reflect.deleteProperty(globalThis, "navigator");
    if (windowDescriptor) Object.defineProperty(globalThis, "window", windowDescriptor);
    else Reflect.deleteProperty(globalThis, "window");
    if (localStorageDescriptor) Object.defineProperty(globalThis, "localStorage", localStorageDescriptor);
    else Reflect.deleteProperty(globalThis, "localStorage");
  });

  test("uses only encrypted storage even when React Native exposes localStorage", async () => {
    const native = createNativeStorage();
    getEncryptedNativeStorageMock.mockReturnValue(native.store);
    const rawAsyncStorageFactory = jest.fn(() => ({ default: createNativeStorage().store }));
    jest.doMock("@react-native-async-storage/async-storage", rawAsyncStorageFactory);
    const localGetItem = jest.fn(() => null);
    const localSetItem = jest.fn();
    const localRemoveItem = jest.fn();
    Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: { getItem: localGetItem, setItem: localSetItem, removeItem: localRemoveItem },
    });
    const proof = createRecoveryProof({ userId: "u1", sessionId: "session-a" });

    await persistRecoveryProof(proof);
    await expect(loadRecoveryProof()).resolves.toEqual(proof);
    await persistRecoveryPending();
    await expect(loadRecoveryPending()).resolves.toEqual({ issuedAt: expect.any(String) });
    await clearRecoveryProof();
    await clearRecoveryPending();

    expect(getEncryptedNativeStorageMock).toHaveBeenCalled();
    expect(native.store.setItem).toHaveBeenCalledWith(RECOVERY_PROOF_KEY, JSON.stringify(proof));
    expect(native.store.setItem).toHaveBeenCalledWith(RECOVERY_PENDING_KEY, expect.any(String));
    expect(native.store.removeItem).toHaveBeenCalledWith(RECOVERY_PROOF_KEY);
    expect(native.store.removeItem).toHaveBeenCalledWith(RECOVERY_PENDING_KEY);
    expect(rawAsyncStorageFactory).not.toHaveBeenCalled();
    expect(localGetItem).not.toHaveBeenCalled();
    expect(localSetItem).not.toHaveBeenCalled();
    expect(localRemoveItem).not.toHaveBeenCalled();
  });

  test("fails closed when encrypted storage initialization or recovery fails", async () => {
    const rawStorage = createNativeStorage().store;
    const rawAsyncStorageFactory = jest.fn(() => ({ default: rawStorage }));
    jest.doMock("@react-native-async-storage/async-storage", rawAsyncStorageFactory);
    getEncryptedNativeStorageMock.mockImplementation(() => {
      throw new Error("secure_storage_key_unavailable");
    });

    await expect(persistRecoveryPending()).rejects.toThrow("secure_storage_key_unavailable");
    expect(isRecoveryPendingInMemory()).toBe(false);
    expect(rawStorage.setItem).not.toHaveBeenCalled();

    const native = createNativeStorage();
    (native.store.getItem as jest.Mock).mockRejectedValueOnce(
      new Error("secure_storage_recovery_required"),
    );
    getEncryptedNativeStorageMock.mockReturnValue(native.store);
    await expect(loadRecoveryProof()).rejects.toThrow("secure_storage_recovery_required");
    expect(rawAsyncStorageFactory).not.toHaveBeenCalled();
  });

  test("removes malformed native proof through the encrypted adapter", async () => {
    const native = createNativeStorage({
      [RECOVERY_PROOF_KEY]: JSON.stringify({ userId: "u1" }),
    });
    getEncryptedNativeStorageMock.mockReturnValue(native.store);
    const rawAsyncStorageFactory = jest.fn(() => ({ default: createNativeStorage().store }));
    jest.doMock("@react-native-async-storage/async-storage", rawAsyncStorageFactory);

    await expect(loadRecoveryProof()).rejects.toThrow("invalid");

    expect(native.store.removeItem).toHaveBeenCalledWith(RECOVERY_PROOF_KEY);
    expect(native.values.has(RECOVERY_PROOF_KEY)).toBe(false);
    expect(rawAsyncStorageFactory).not.toHaveBeenCalled();
  });
});

describe("non-native recovery proof storage", () => {
  test("remains inert without a browser or React Native runtime", async () => {
    const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
    Reflect.deleteProperty(globalThis, "navigator");
    Reflect.deleteProperty(globalThis, "window");
    __resetRecoveryProofStorageQueueForTests();
    getEncryptedNativeStorageMock.mockReset();
    try {
      await expect(loadRecoveryProof()).resolves.toBeNull();
      await expect(persistRecoveryProof(createRecoveryProof({
        userId: "u1",
        sessionId: "session-a",
      }))).resolves.toBeUndefined();
      expect(getEncryptedNativeStorageMock).not.toHaveBeenCalled();
    } finally {
      if (navigatorDescriptor) Object.defineProperty(globalThis, "navigator", navigatorDescriptor);
      if (windowDescriptor) Object.defineProperty(globalThis, "window", windowDescriptor);
    }
  });
});
