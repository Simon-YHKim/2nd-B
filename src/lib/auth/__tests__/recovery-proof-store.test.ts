import {
  __resetRecoveryProofStorageQueueForTests,
  applyRecoveryPendingStorageValue,
  armWebRecoveryPendingFromLocation,
  captureRecoveryPendingLease,
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
        get length() { return values.size; },
        key: (index: number) => Array.from(values.keys())[index] ?? null,
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
    const lease = await persistRecoveryPending();
    expect(isRecoveryPendingInMemory()).toBe(true);
    expect(values.has(RECOVERY_PENDING_KEY)).toBe(true);
    await expect(loadRecoveryPending()).resolves.toEqual({
      issuedAt: expect.any(String),
      token: lease.token,
    });
    expect(captureRecoveryPendingLease()).toEqual(lease);
    await expect(clearRecoveryPending(lease)).resolves.toBe("cleared");
    expect(isRecoveryPendingInMemory()).toBe(false);
    expect(values.has(RECOVERY_PENDING_KEY)).toBe(false);
  });

  test("upgrades an issuedAt-only marker without dropping its lock", async () => {
    values.set(RECOVERY_PENDING_KEY, JSON.stringify({
      issuedAt: "2026-09-07T00:00:00.000Z",
    }));

    const pending = await loadRecoveryPending();

    expect(pending).toEqual({
      issuedAt: "2026-09-07T00:00:00.000Z",
      token: expect.any(String),
    });
    expect(JSON.parse(values.get(RECOVERY_PENDING_KEY) ?? "{}")).toEqual({
      ...pending,
      ownerKeyVersion: 1,
    });
    expect(isRecoveryPendingInMemory()).toBe(true);
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

  test.each([
    ["null", null],
    ["older A", JSON.stringify({
      issuedAt: "2026-09-07T00:00:00.000Z",
      token: "owner-a",
      ownerKeyVersion: 1,
    })],
  ])("re-reads current owner keys when a late %s storage event arrives", (_label, staleRaw) => {
    const markerB = {
      issuedAt: "2026-09-07T00:00:01.000Z",
      token: "owner-b",
      ownerKeyVersion: 1,
    };
    values.set(`${RECOVERY_PENDING_KEY}.${markerB.token}`, JSON.stringify(markerB));
    if (staleRaw !== null) values.set(RECOVERY_PENDING_KEY, JSON.stringify(markerB));

    expect(applyRecoveryPendingStorageValue(staleRaw)).toEqual({
      issuedAt: markerB.issuedAt,
      token: markerB.token,
    });
    expect(captureRecoveryPendingLease().token).toBe(markerB.token);
    expect(isRecoveryPendingInMemory()).toBe(true);
  });

  test("keeps the legacy lock when its owner-key upgrade write fails", async () => {
    const legacyRaw = JSON.stringify({ issuedAt: "2026-09-07T00:00:00.000Z" });
    values.set(RECOVERY_PENDING_KEY, legacyRaw);
    const setItem = jest.fn((key: string, value: string) => {
      if (key.startsWith(`${RECOVERY_PENDING_KEY}.`)) {
        throw new Error("legacy_owner_write_failed");
      }
      values.set(key, value);
    });
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        get length() { return values.size; },
        key: (index: number) => Array.from(values.keys())[index] ?? null,
        getItem: (key: string) => values.get(key) ?? null,
        setItem,
        removeItem: (key: string) => values.delete(key),
      },
    });

    await expect(loadRecoveryPending()).rejects.toThrow("legacy_owner_write_failed");

    expect(values.get(RECOVERY_PENDING_KEY)).toBe(legacyRaw);
    expect(Array.from(values.keys())).toEqual([RECOVERY_PENDING_KEY]);
    expect(isRecoveryPendingInMemory()).toBe(true);
  });

  test("uses Web Locks when available without relying on them for ownership", async () => {
    const request = jest.fn(async (
      _name: string,
      _options: { mode: string },
      callback: () => Promise<unknown>,
    ) => callback());
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { locks: { request } },
    });

    const lease = await persistRecoveryPending();
    await clearRecoveryPending(lease);

    expect(request).toHaveBeenCalledWith(
      "secondbrain.auth.recovery-pending",
      { mode: "exclusive" },
      expect.any(Function),
    );
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
    const pendingLease = await persistRecoveryPending();
    await expect(loadRecoveryPending()).resolves.toEqual({
      issuedAt: expect.any(String),
      token: pendingLease.token,
    });
    await clearRecoveryProof();
    await clearRecoveryPending(pendingLease);

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

  test("a queued A clear cannot delete a B pending intent claimed before the queue advances", async () => {
    const native = createNativeStorage();
    getEncryptedNativeStorageMock.mockReturnValue(native.store);
    const leaseA = await persistRecoveryPending();

    let releaseProofWrite = () => {};
    let markProofWriteStarted = () => {};
    const proofWriteStarted = new Promise<void>((resolve) => {
      markProofWriteStarted = resolve;
    });
    const proofWriteGate = new Promise<void>((resolve) => {
      releaseProofWrite = resolve;
    });
    (native.store.setItem as jest.Mock).mockImplementation(async (key: string, value: string) => {
      if (key === RECOVERY_PROOF_KEY) {
        markProofWriteStarted();
        await proofWriteGate;
      }
      native.values.set(key, value);
    });

    const queueBlocker = persistRecoveryProof(createRecoveryProof({
      userId: "u1",
      sessionId: "session-a",
    }));
    await proofWriteStarted;
    const staleClear = clearRecoveryPending(leaseA);
    const newerPending = persistRecoveryPending();
    const leaseB = captureRecoveryPendingLease();

    expect(leaseB.revision).toBeGreaterThan(leaseA.revision);
    expect(leaseB.token).not.toBe(leaseA.token);

    releaseProofWrite();
    const [, clearResult, persistedLeaseB] = await Promise.all([
      queueBlocker,
      staleClear,
      newerPending,
    ]);

    expect(clearResult).toBe("stale");
    expect(persistedLeaseB).toEqual(leaseB);
    expect(native.store.removeItem).not.toHaveBeenCalledWith(RECOVERY_PENDING_KEY);
    expect(native.values.has(RECOVERY_PENDING_KEY)).toBe(true);
    expect(isRecoveryPendingInMemory()).toBe(true);
  });

  test("a no-argument cleanup after clearProof cannot capture and delete newer B", async () => {
    const native = createNativeStorage();
    getEncryptedNativeStorageMock.mockReturnValue(native.store);
    await persistRecoveryPending();

    await clearRecoveryProof();
    const leaseB = await persistRecoveryPending();
    const markerB = native.values.get(RECOVERY_PENDING_KEY);
    await clearRecoveryPending();

    expect(captureRecoveryPendingLease()).toEqual(leaseB);
    expect(native.values.get(RECOVERY_PENDING_KEY)).toBe(markerB);
    expect(isRecoveryPendingInMemory()).toBe(true);
  });

  test("a disk owner mismatch makes an explicit stale clear a no-op", async () => {
    const native = createNativeStorage();
    getEncryptedNativeStorageMock.mockReturnValue(native.store);
    const leaseA = await persistRecoveryPending();
    const markerA = native.values.get(RECOVERY_PENDING_KEY);
    const markerB = JSON.stringify({
      issuedAt: "2026-09-07T00:00:00.000Z",
      token: "other-runtime-owner",
    });
    native.values.set(RECOVERY_PENDING_KEY, markerB);

    await expect(clearRecoveryPending(leaseA)).resolves.toBe("stale");

    expect(native.values.get(RECOVERY_PENDING_KEY)).toBe(markerB);
    expect(native.values.get(RECOVERY_PENDING_KEY)).not.toBe(markerA);
    expect(native.store.removeItem).not.toHaveBeenCalledWith(RECOVERY_PENDING_KEY);
    expect(isRecoveryPendingInMemory()).toBe(true);
  });

  test("a failed persist cannot roll back a newer pending intent", async () => {
    const native = createNativeStorage();
    getEncryptedNativeStorageMock.mockReturnValue(native.store);

    let releaseFirstWrite = () => {};
    let markFirstWriteStarted = () => {};
    const firstWriteStarted = new Promise<void>((resolve) => {
      markFirstWriteStarted = resolve;
    });
    const firstWriteGate = new Promise<void>((resolve) => {
      releaseFirstWrite = resolve;
    });
    let firstWrite = true;
    (native.store.setItem as jest.Mock).mockImplementation(async (key: string, value: string) => {
      if (key === RECOVERY_PENDING_KEY && firstWrite) {
        firstWrite = false;
        markFirstWriteStarted();
        await firstWriteGate;
        throw new Error("secure_storage_write_failed");
      }
      native.values.set(key, value);
    });

    const failedOwner = persistRecoveryPending();
    await firstWriteStarted;
    const newerOwner = persistRecoveryPending();
    const newerLease = captureRecoveryPendingLease();

    // B owns the lock as soon as its intent exists, not when its queued write runs.
    expect(isRecoveryPendingInMemory()).toBe(true);
    releaseFirstWrite();
    await expect(failedOwner).rejects.toThrow("secure_storage_write_failed");
    await expect(newerOwner).resolves.toEqual(newerLease);

    expect(native.values.has(RECOVERY_PENDING_KEY)).toBe(true);
    expect(captureRecoveryPendingLease()).toEqual(newerLease);
    expect(isRecoveryPendingInMemory()).toBe(true);
  });

  test("two failed persists roll back to the last completed durable state, not failed A", async () => {
    const native = createNativeStorage();
    getEncryptedNativeStorageMock.mockReturnValue(native.store);
    const durableLease = await persistRecoveryPending();
    const durableRaw = native.values.get(RECOVERY_PENDING_KEY);
    (native.store.setItem as jest.Mock).mockRejectedValue(
      new Error("secure_storage_write_failed"),
    );

    const failedA = persistRecoveryPending();
    const failedB = persistRecoveryPending();
    await expect(failedA).rejects.toThrow("secure_storage_write_failed");
    await expect(failedB).rejects.toThrow("secure_storage_write_failed");

    expect(native.values.get(RECOVERY_PENDING_KEY)).toBe(durableRaw);
    expect(captureRecoveryPendingLease().token).toBe(durableLease.token);
    expect(isRecoveryPendingInMemory()).toBe(true);
  });

  test("without Web Locks, stale A clear cannot erase B and B survives a restart", async () => {
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {},
    });
    Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        get length() { return values.size; },
        key: (index: number) => Array.from(values.keys())[index] ?? null,
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => { values.set(key, value); },
        removeItem: (key: string) => { values.delete(key); },
      },
    });

    const leaseA = await persistRecoveryPending();
    const markerB = {
      issuedAt: "2026-09-07T00:00:01.000Z",
      token: "cross-tab-owner-b",
      ownerKeyVersion: 1,
    };
    values.set(`${RECOVERY_PENDING_KEY}.${markerB.token}`, JSON.stringify(markerB));
    values.set(RECOVERY_PENDING_KEY, JSON.stringify(markerB));

    await expect(clearRecoveryPending(leaseA)).resolves.toBe("cleared");
    expect(values.has(`${RECOVERY_PENDING_KEY}.${leaseA.token}`)).toBe(false);
    expect(values.has(`${RECOVERY_PENDING_KEY}.${markerB.token}`)).toBe(true);

    __resetRecoveryProofStorageQueueForTests();
    await expect(loadRecoveryPending()).resolves.toEqual({
      issuedAt: markerB.issuedAt,
      token: markerB.token,
    });
    expect(isRecoveryPendingInMemory()).toBe(true);
  });

  test("fails closed when encrypted storage initialization or recovery fails", async () => {
    const rawStorage = createNativeStorage().store;
    const rawAsyncStorageFactory = jest.fn(() => ({ default: rawStorage }));
    jest.doMock("@react-native-async-storage/async-storage", rawAsyncStorageFactory);
    getEncryptedNativeStorageMock.mockImplementation(() => {
      throw new Error("secure_storage_key_unavailable");
    });

    const beforeFailedClaim = captureRecoveryPendingLease();
    await expect(persistRecoveryPending()).rejects.toThrow("secure_storage_key_unavailable");
    const afterFailedClaim = captureRecoveryPendingLease();
    expect(isRecoveryPendingInMemory()).toBe(false);
    expect(afterFailedClaim.token).toBe(beforeFailedClaim.token);
    expect(afterFailedClaim.revision).toBeGreaterThan(beforeFailedClaim.revision);
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
