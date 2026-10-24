import { GoTrueClient, processLock, type LockFunc, type SupportedStorage } from "@supabase/auth-js";
import {
  activateExpectedWebInterviewSession,
  signOutExpectedWebInterviewSession,
  signOutExpectedWebInterviewSessionInsideMutation,
  signOutEmptyWebInterviewSession,
  signOutEmptyWebInterviewSessionInsideMutation,
  resolveWebInterviewSignOut,
  type WebInterviewLogoutRequest,
} from "../web-interview-signout";
import {
  WebInterviewLifecycleError,
  type WebInterviewLifecycle,
  type WebInterviewLogoutIntent,
  type WebInterviewPurgeReceipt,
  type WebInterviewTicket,
} from "../../interview/web-draft-lifecycle";
import {
  AuthLocalClearUnavailableError,
  AuthMutationContextUnavailableError,
  AuthLockWaitTimeoutError,
  AuthSessionOwnerChangedError,
  AUTH_WEB_LOCK_WAIT_TIMEOUT_MS,
  authStorageKeysForUrl,
  captureAuthSessionExpectation,
  createAuthStorageRuntime,
  refreshExpectedSessionInsideMutation,
  resolveAuthStorage,
  runWithWebAuthMutationContext,
  signOutExpectedSession,
  type AuthMutationContext,
} from "../session-mutation";
import {
  LEGACY_RECOVERY_PENDING_KEY,
  LEGACY_RECOVERY_PROOF_KEY,
  RECOVERY_PENDING_KEY,
  RECOVERY_PROOF_KEY,
} from "../recovery-proof-store";

const mockEncryptedStorage = {
  getItem: jest.fn<Promise<string | null>, [string]>(),
  setItem: jest.fn<Promise<void>, [string, string]>(),
  removeItem: jest.fn<Promise<void>, [string]>(),
};
const mockGetEncryptedNativeStorage = jest.fn(() => mockEncryptedStorage);
const mockMigrateLegacyNativePlaintextAtStartup = jest.fn<Promise<unknown>, []>();

jest.mock("../../storage/encrypted-native-storage", () => ({
  getEncryptedNativeStorage: () => mockGetEncryptedNativeStorage(),
  migrateLegacyNativePlaintextAtStartup: () => mockMigrateLegacyNativePlaintextAtStartup(),
}));

const URL = "https://auth-v2-test.supabase.co";

type TestBrowserLock = { name: string; mode: "exclusive" };
type TestBrowserLockRequest = <T>(
  name: string,
  options: Record<string, unknown>,
  callback: (lock: TestBrowserLock | null) => Promise<T>,
) => Promise<T>;

class MemoryStorage implements SupportedStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

function base64Url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function session(userId: string, sessionId: string, tokenVersion = 1) {
  const now = Math.floor(Date.now() / 1000);
  const user = {
    id: userId,
    aud: "authenticated",
    role: "authenticated",
    email: `${userId}@example.invalid`,
    app_metadata: {},
    user_metadata: {},
    created_at: new Date(0).toISOString(),
  };
  return {
    access_token: `${base64Url({ alg: "none" })}.${base64Url({
      sub: userId,
      session_id: sessionId,
      exp: now + 3600,
      iat: now,
    })}.signature-${tokenVersion}`,
    refresh_token: `refresh-${userId}-${tokenVersion}`,
    expires_in: 3600,
    expires_at: now + 3600,
    token_type: "bearer",
    user,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function makeClient(
  storage: SupportedStorage,
  storageKey: string,
  lock: LockFunc,
  fetcher: typeof fetch,
) {
  return new GoTrueClient({
    url: `${URL}/auth/v1`,
    headers: { apikey: "public-anon-key" },
    storage,
    storageKey,
    lock,
    lockAcquireTimeout: -1,
    persistSession: true,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    fetch: fetcher,
  });
}

describe("auth v2 storage and mutation boundary", () => {
  test("native resolution selects only the encrypted adapter", () => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { product: "ReactNative" },
    });
    try {
      mockGetEncryptedNativeStorage.mockClear();
      expect(resolveAuthStorage(false)).toBe(mockEncryptedStorage);
      expect(mockGetEncryptedNativeStorage).toHaveBeenCalledTimes(1);
    } finally {
      if (previous) Object.defineProperty(globalThis, "navigator", previous);
      else delete (globalThis as { navigator?: unknown }).navigator;
    }
  });

  test("runs the native plaintext scan before the auth v2 migration barrier", async () => {
    const calls: string[] = [];
    const storage = new MemoryStorage();
    const keys = authStorageKeysForUrl(URL);
    storage.values.set(keys.v1Primary, "legacy-session");
    const originalGet = storage.getItem.bind(storage);
    storage.getItem = (key: string) => {
      calls.push(`read:${key}`);
      return originalGet(key);
    };
    const startupMigration = jest.fn(async () => {
      calls.push("plaintext-scan");
    });

    const runtime = createAuthStorageRuntime({
      url: URL,
      storage,
      web: false,
      startupMigration,
    });
    await runtime.ready();

    expect(startupMigration).toHaveBeenCalledTimes(1);
    expect(calls[0]).toBe("plaintext-scan");
    expect(storage.getItem(keys.v2Primary)).toBe("legacy-session");
  });

  test("method-denied localStorage falls back to memory before migration starts", () => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: () => null,
        setItem: () => {
          throw new DOMException("denied", "SecurityError");
        },
        removeItem: () => undefined,
      },
    });
    try {
      expect(resolveAuthStorage(true)).toBeUndefined();
    } finally {
      if (previous) Object.defineProperty(globalThis, "localStorage", previous);
      else delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  });

  test("migrates the v1 bundle once and a later v1 write cannot resurrect a signed-out v2 session", async () => {
    const storage = new MemoryStorage();
    const keys = authStorageKeysForUrl(URL);
    storage.setItem(keys.v1Primary, "session-a");
    storage.setItem(`${keys.v1Primary}-code-verifier`, "verifier-a/recovery");
    storage.setItem(`${keys.v1Primary}-user`, "user-a");
    storage.setItem(LEGACY_RECOVERY_PROOF_KEY, "proof-a");
    storage.setItem(LEGACY_RECOVERY_PENDING_KEY, "pending-a");

    const first = createAuthStorageRuntime({ url: URL, storage, web: false });
    await first.storage?.getItem(keys.v2Primary);

    expect(storage.getItem(keys.v2Primary)).toBe("session-a");
    expect(storage.getItem(`${keys.v2Primary}-code-verifier`)).toBe("verifier-a/recovery");
    expect(storage.getItem(`${keys.v2Primary}-user`)).toBe("user-a");
    expect(storage.getItem(RECOVERY_PROOF_KEY)).toBe("proof-a");
    expect(storage.getItem(RECOVERY_PENDING_KEY)).toBe("pending-a");
    expect(storage.getItem(keys.v1Primary)).toBeNull();
    expect(storage.getItem(LEGACY_RECOVERY_PROOF_KEY)).toBeNull();
    expect(storage.getItem(LEGACY_RECOVERY_PENDING_KEY)).toBeNull();
    expect(storage.getItem(keys.migrationTombstone)).toBe("1");

    storage.removeItem(keys.v2Primary);
    storage.setItem(keys.v1Primary, "late-session-b-from-v1-tab");
    storage.removeItem(RECOVERY_PROOF_KEY);
    storage.setItem(LEGACY_RECOVERY_PROOF_KEY, "late-proof-b-from-v1-tab");
    const restarted = createAuthStorageRuntime({ url: URL, storage, web: false });
    await restarted.ready();

    expect(storage.getItem(keys.v2Primary)).toBeNull();
    expect(storage.getItem(keys.v1Primary)).toBe("late-session-b-from-v1-tab");
    expect(storage.getItem(RECOVERY_PROOF_KEY)).toBeNull();
    expect(storage.getItem(LEGACY_RECOVERY_PROOF_KEY)).toBe("late-proof-b-from-v1-tab");
  });

  test("a live v1 GoTrue client can write B after migration but cannot revive B in signed-out v2", async () => {
    const storage = new MemoryStorage();
    const keys = authStorageKeysForUrl("https://v1-v2-live-test.supabase.co");
    const a = session("user-a", "session-a");
    const b = session("user-b", "session-b");
    storage.setItem(keys.v1Primary, JSON.stringify(a));

    const runtime = createAuthStorageRuntime({
      url: "https://v1-v2-live-test.supabase.co",
      storage,
      web: false,
    });
    await runtime.ready();
    const fetcher = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("grant_type=password")) return jsonResponse(b);
      if (url.includes("/logout")) return new Response(null, { status: 204 });
      throw new Error(`unexpected auth request: ${url}`);
    }) as unknown as typeof fetch;
    const current = makeClient(storage, runtime.storageKey, runtime.sdkLock, fetcher);
    const legacyLock: LockFunc = (name, _timeout, fn) => processLock(name, -1, fn);
    const legacy = makeClient(storage, keys.v1Primary, legacyLock, fetcher);
    const expectedA = await captureAuthSessionExpectation(current, runtime);

    await expect(
      legacy.signInWithPassword({
        email: "user-b@example.invalid",
        password: "not-a-real-password",
      }),
    ).resolves.toMatchObject({ error: null });
    expect(JSON.parse(storage.getItem(keys.v1Primary) ?? "null").user.id).toBe("user-b");
    await expect(current.getSession()).resolves.toMatchObject({
      data: { session: { user: { id: "user-a" } } },
      error: null,
    });

    await signOutExpectedSession(current, runtime, expectedA, "global");
    const restarted = createAuthStorageRuntime({
      url: "https://v1-v2-live-test.supabase.co",
      storage,
      web: false,
    });
    const afterRestart = makeClient(storage, restarted.storageKey, restarted.sdkLock, fetcher);
    await expect(afterRestart.getSession()).resolves.toMatchObject({
      data: { session: null },
      error: null,
    });
    expect(JSON.parse(storage.getItem(keys.v1Primary) ?? "null").user.id).toBe("user-b");
  });

  test("ordinary auth falls back without Web Locks, but destructive expected clear fails before its callback", async () => {
    const storage = new MemoryStorage();
    const runtime = createAuthStorageRuntime({
      url: URL,
      storage,
      web: true,
      navigatorLocksAvailable: false,
    });
    const calls: string[] = [];

    await runtime.runMutation(async () => calls.push("ordinary"));
    await expect(
      runtime.runMutation(async () => calls.push("destructive"), { requireCrossTab: true }),
    ).rejects.toBeInstanceOf(AuthLocalClearUnavailableError);
    expect(calls).toEqual(["ordinary"]);
  });

  test.each(["null-lock", "throw", "missing-callback"] as const)(
    "an abnormal Web Lock manager (%s) falls back only for ordinary mutations",
    async (failure) => {
      const storage = new MemoryStorage();
      const requests: Array<{ name: string; options: Record<string, unknown> }> = [];
      const request: TestBrowserLockRequest = async (name, options, callback) => {
        requests.push({ name, options });
        if (failure === "throw") throw new Error("lock manager unavailable");
        if (failure === "missing-callback") return undefined as never;
        return callback(null);
      };
      const runtime = createAuthStorageRuntime({
        url: `https://${failure}.supabase.co`,
        storage,
        web: true,
        navigatorLockRequest: request,
      });
      const calls: string[] = [];

      await runtime.runMutation(async () => calls.push("ordinary"));
      await expect(
        runtime.runMutation(async () => calls.push("destructive"), {
          requireCrossTab: true,
        }),
      ).rejects.toBeInstanceOf(AuthLocalClearUnavailableError);

      expect(calls).toEqual(["ordinary"]);
      expect(requests.length).toBeGreaterThanOrEqual(3);
      for (const { options } of requests) {
        expect(options.mode).toBe("exclusive");
        expect(options.signal).toBeInstanceOf(AbortSignal);
        expect(options).not.toHaveProperty("steal");
        expect(options).not.toHaveProperty("ifAvailable");
      }
    },
  );

  test.each(["resolved", "rejected"] as const)(
    "a %s malformed manager cannot run a late callback after process fallback",
    async (outcome) => {
      const storage = new MemoryStorage();
      let requests = 0;
      let lateGrant: (() => Promise<unknown>) | undefined;
      const request: TestBrowserLockRequest = (name, _options, callback) => {
        requests += 1;
        if (requests === 1) return callback({ name, mode: "exclusive" }); // ready()
        lateGrant = () => callback({ name, mode: "exclusive" });
        return outcome === "resolved"
          ? Promise.resolve(undefined as never)
          : Promise.reject(new Error("manager failed"));
      };
      const runtime = createAuthStorageRuntime({
        url: `https://late-${outcome}.supabase.co`, storage, web: true, navigatorLockRequest: request,
      });
      await runtime.ready();
      const writer = jest.fn();
      await runtime.runMutation(writer);
      expect(writer).toHaveBeenCalledTimes(1);
      expect(lateGrant).toBeDefined();
      await lateGrant?.();
      expect(writer).toHaveBeenCalledTimes(1);
    },
  );

  test("a callback failure under a valid Web Lock is propagated once without process fallback", async () => {
    const storage = new MemoryStorage();
    const request: TestBrowserLockRequest = async (name, _options, callback) =>
      callback({ name, mode: "exclusive" });
    const runtime = createAuthStorageRuntime({
      url: "https://callback-error.supabase.co",
      storage,
      web: true,
      navigatorLockRequest: request,
    });
    let calls = 0;

    await expect(
      runtime.runMutation(async () => {
        calls += 1;
        throw new Error("operation failed");
      }),
    ).rejects.toThrow("operation failed");
    expect(calls).toBe(1);
  });

  test("an M request that never settles times out without running the mutation or falling back", async () => {
    jest.useFakeTimers();
    try {
      const storage = new MemoryStorage();
      let requests = 0;
      let lateGrant: (() => Promise<unknown>) | undefined;
      let waitingSignal: AbortSignal | undefined;
      const request: TestBrowserLockRequest = (name, options, callback) => {
        requests += 1;
        if (requests === 1) return callback({ name, mode: "exclusive" }); // ready()
        lateGrant = () => callback({ name, mode: "exclusive" });
        waitingSignal = options.signal as AbortSignal;
        return new Promise(() => {}); // manager ignores abort and never settles
      };
      const runtime = createAuthStorageRuntime({
        url: "https://m-never-settles.supabase.co", storage, web: true, navigatorLockRequest: request,
      });
      await runtime.ready();
      const writer = jest.fn();
      const pending = runtime.runMutation(writer);
      for (let i = 0; i < 10 && !lateGrant; i += 1) await Promise.resolve();
      expect(lateGrant).toBeDefined();
      jest.advanceTimersByTime(AUTH_WEB_LOCK_WAIT_TIMEOUT_MS);
      await expect(pending).rejects.toBeInstanceOf(AuthLockWaitTimeoutError);
      expect(waitingSignal?.aborted).toBe(true);
      expect(writer).not.toHaveBeenCalled();
      await lateGrant?.();
      expect(writer).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  test("an S request that never settles times out and releases M before the SDK writer starts", async () => {
    jest.useFakeTimers();
    try {
      const storage = new MemoryStorage();
      const url = "https://s-never-settles.supabase.co";
      const keys = authStorageKeysForUrl(url);
      const trace: string[] = [];
      let waitingOnS = false;
      const request: TestBrowserLockRequest = async (name, _options, callback) => {
        if (name === `lock:${keys.v2Primary}`) {
          waitingOnS = true;
          return new Promise(() => {});
        }
        trace.push(`enter:${name}`);
        try { return await callback({ name, mode: "exclusive" }); }
        finally { trace.push(`exit:${name}`); }
      };
      const runtime = createAuthStorageRuntime({ url, storage, web: true, navigatorLockRequest: request });
      await runtime.ready();
      trace.length = 0;
      const writer = jest.fn();
      const pending = runtime.runMutation(() => runtime.runSdkUnlockedWriter(writer));
      for (let i = 0; i < 10 && !waitingOnS; i += 1) await Promise.resolve();
      expect(waitingOnS).toBe(true);
      jest.advanceTimersByTime(AUTH_WEB_LOCK_WAIT_TIMEOUT_MS);
      await expect(pending).rejects.toBeInstanceOf(AuthLockWaitTimeoutError);
      expect(writer).not.toHaveBeenCalled();
      expect(trace).toEqual([`enter:${keys.mutationLock}`, `exit:${keys.mutationLock}`]);
    } finally {
      jest.useRealTimers();
    }
  });

  test("a granted S lock is not abandoned when its SDK writer remains pending past the wait deadline", async () => {
    jest.useFakeTimers();
    try {
      const storage = new MemoryStorage();
      const request: TestBrowserLockRequest = (name, _options, callback) =>
        callback({ name, mode: "exclusive" });
      const runtime = createAuthStorageRuntime({
        url: "https://writer-never-settles.supabase.co", storage, web: true, navigatorLockRequest: request,
      });
      await runtime.ready();
      let release!: () => void;
      const writer = jest.fn(() => new Promise<void>((resolve) => { release = resolve; }));
      let settled = false;
      const pending = runtime.runMutation(() => runtime.runSdkUnlockedWriter(writer));
      void pending.finally(() => { settled = true; });
      for (let i = 0; i < 10 && !writer.mock.calls.length; i += 1) await Promise.resolve();
      expect(writer).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(AUTH_WEB_LOCK_WAIT_TIMEOUT_MS * 2);
      await Promise.resolve();
      expect(settled).toBe(false);
      release();
      await expect(pending).resolves.toBeUndefined();
      expect(settled).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  test("a 200 password response with a stalled JSON body keeps M and S until the SDK can save the session", async () => {
    jest.useFakeTimers();
    try {
      const storage = new MemoryStorage();
      const url = "https://password-body-stall.supabase.co";
      const locks: string[] = [];
      const request: TestBrowserLockRequest = async (name, _options, callback) => {
        locks.push(`enter:${name}`);
        try { return await callback({ name, mode: "exclusive" }); }
        finally { locks.push(`exit:${name}`); }
      };
      const runtime = createAuthStorageRuntime({ url, storage, web: true, navigatorLockRequest: request });
      await runtime.ready();
      locks.length = 0;
      let finishBody!: (value: unknown) => void;
      const body = new Promise<unknown>((resolve) => { finishBody = resolve; });
      const response = jsonResponse({});
      response.json = jest.fn(() => body) as typeof response.json;
      const fetchMock = jest.fn(async () => response);
      const fetcher = fetchMock as unknown as typeof fetch;
      const client = makeClient(runtime.storage!, runtime.storageKey, runtime.sdkLock, fetcher);
      let settled = false;
      const pending = runtime.runMutation(() => runtime.runSdkUnlockedWriter(() =>
        client.signInWithPassword({ email: "user@example.invalid", password: "test-password" }),
      ));
      void pending.then(() => { settled = true; }, () => { settled = true; });
      for (let i = 0; i < 30 && !fetchMock.mock.calls.length; i += 1) await Promise.resolve();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(locks).toContain(`enter:${authStorageKeysForUrl(url).mutationLock}`);
      expect(locks).toContain(`enter:lock:${runtime.storageKey}`);
      jest.advanceTimersByTime(AUTH_WEB_LOCK_WAIT_TIMEOUT_MS * 2);
      await Promise.resolve();
      expect(settled).toBe(false);
      expect(storage.getItem(runtime.storageKey)).toBeNull();
      finishBody(session("user", "session"));
      await expect(pending).resolves.toMatchObject({ error: null });
      expect(JSON.parse(storage.getItem(runtime.storageKey) ?? "null").user.id).toBe("user");
      expect(locks).toContain(`exit:lock:${runtime.storageKey}`);
      expect(locks).toContain(`exit:${authStorageKeysForUrl(url).mutationLock}`);
    } finally {
      jest.useRealTimers();
    }
  });

  test("a valid browser lock keeps M before S and holds M until S releases", async () => {
    const storage = new MemoryStorage();
    const trace: string[] = [];
    const request: TestBrowserLockRequest = async (name, options, callback) => {
      expect(options).toEqual({ mode: "exclusive", signal: expect.any(AbortSignal) });
      trace.push(`enter:${name}`);
      try {
        return await callback({ name, mode: "exclusive" });
      } finally {
        trace.push(`exit:${name}`);
      }
    };
    const url = "https://lock-order.supabase.co";
    const keys = authStorageKeysForUrl(url);
    const runtime = createAuthStorageRuntime({
      url,
      storage,
      web: true,
      navigatorLockRequest: request,
    });
    await runtime.ready();
    trace.length = 0;

    await runtime.runMutation(
      () => runtime.runSdkUnlockedWriter(async () => trace.push("writer")),
      { requireCrossTab: true },
    );

    expect(trace).toEqual([
      `enter:${keys.mutationLock}`,
      `enter:lock:${keys.v2Primary}`,
      "writer",
      `exit:lock:${keys.v2Primary}`,
      `exit:${keys.mutationLock}`,
    ]);
  });

  test("destructive M fails closed when its nested S lock is abnormal", async () => {
    const storage = new MemoryStorage();
    const url = "https://nested-lock-failure.supabase.co";
    const keys = authStorageKeysForUrl(url);
    const request: TestBrowserLockRequest = async (name, _options, callback) =>
      callback(name === keys.mutationLock ? { name, mode: "exclusive" } : null);
    const runtime = createAuthStorageRuntime({
      url,
      storage,
      web: true,
      navigatorLockRequest: request,
    });
    const calls: string[] = [];

    await expect(
      runtime.runMutation(
        () => runtime.runSdkUnlockedWriter(async () => calls.push("writer")),
        { requireCrossTab: true },
      ),
    ).rejects.toBeInstanceOf(AuthLocalClearUnavailableError);
    expect(calls).toEqual([]);
  });

  test("a cold client finishes migration and initialization before an externally S-locked writer", async () => {
    const backing = new MemoryStorage();
    const url = "https://cold-init-writer-test.supabase.co";
    const keys = authStorageKeysForUrl(url);
    let releaseMigration!: () => void;
    let markMigrationStarted!: () => void;
    const migrationStarted = new Promise<void>((resolve) => {
      markMigrationStarted = resolve;
    });
    const migrationRelease = new Promise<void>((resolve) => {
      releaseMigration = resolve;
    });
    let gated = true;
    const storage: SupportedStorage = {
      async getItem(key) {
        if (key === keys.migrationTombstone && gated) {
          gated = false;
          markMigrationStarted();
          await migrationRelease;
        }
        return backing.getItem(key);
      },
      async setItem(key, value) {
        backing.setItem(key, value);
      },
      async removeItem(key) {
        backing.removeItem(key);
      },
    };
    const runtime = createAuthStorageRuntime({ url, storage, web: false });
    let passwordRequests = 0;
    const b = session("user-b", "session-b");
    const fetcher = jest.fn(async (input: RequestInfo | URL) => {
      const requestUrl = String(input);
      if (requestUrl.includes("grant_type=password")) {
        passwordRequests += 1;
        return jsonResponse(b);
      }
      throw new Error(`unexpected auth request: ${requestUrl}`);
    }) as unknown as typeof fetch;
    const client = makeClient(storage, runtime.storageKey, runtime.sdkLock, fetcher);
    const signingIn = runtime.runMutation(() =>
      runtime.runSdkUnlockedWriter(() =>
        client.signInWithPassword({
          email: "user-b@example.invalid",
          password: "not-a-real-password",
        }),
      ),
    );

    await migrationStarted;
    await Promise.resolve();
    expect(passwordRequests).toBe(0);
    releaseMigration();
    await expect(signingIn).resolves.toMatchObject({ error: null });
    expect(JSON.parse(backing.getItem(runtime.storageKey) ?? "null").user.id).toBe("user-b");
  });

  test("a Web-Locks-less browser can restore and sign in with a real GoTrue client", async () => {
    const storage = new MemoryStorage();
    const runtime = createAuthStorageRuntime({
      url: "https://web-fallback-test.supabase.co",
      storage,
      web: true,
      navigatorLocksAvailable: false,
    });
    await runtime.ready();
    const a = session("user-a", "session-a");
    const b = session("user-b", "session-b");
    storage.setItem(runtime.storageKey, JSON.stringify(a));
    const fetcher = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("grant_type=password")) return jsonResponse(b);
      throw new Error(`unexpected auth request: ${url}`);
    }) as unknown as typeof fetch;
    const client = makeClient(runtime.storage!, runtime.storageKey, runtime.sdkLock, fetcher);

    await expect(client.getSession()).resolves.toMatchObject({
      data: { session: { user: { id: "user-a" } } },
      error: null,
    });
    await expect(
      runtime.runMutation(() =>
        runtime.runSdkUnlockedWriter(() =>
          client.signInWithPassword({
            email: "user-b@example.invalid",
            password: "not-a-real-password",
          }),
        ),
      ),
    ).resolves.toMatchObject({ error: null });
    const expectedB = await captureAuthSessionExpectation(client, runtime);
    await expect(
      signOutExpectedSession(client, runtime, expectedB, "global"),
    ).rejects.toBeInstanceOf(AuthLocalClearUnavailableError);
    expect(JSON.parse(storage.getItem(runtime.storageKey) ?? "null").user.id).toBe("user-b");
  });

  test("real GoTrue clients preserve B and never call logout when captured A loses the M race", async () => {
    const storage = new MemoryStorage();
    const runtimeA = createAuthStorageRuntime({ url: URL, storage, web: false });
    const runtimeB = createAuthStorageRuntime({ url: URL, storage, web: false });
    await Promise.all([runtimeA.ready(), runtimeB.ready()]);
    const a = session("user-a", "session-a");
    const b = session("user-b", "session-b");
    storage.setItem(runtimeA.storageKey, JSON.stringify(a));
    const requests: string[] = [];
    const fetcher = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      requests.push(url);
      if (url.includes("grant_type=password")) return jsonResponse(b);
      if (url.includes("/logout")) return new Response(null, { status: 204 });
      throw new Error(`unexpected auth request: ${url} ${init?.method ?? "GET"}`);
    }) as unknown as typeof fetch;
    const clientA = makeClient(runtimeA.storage!, runtimeA.storageKey, runtimeA.sdkLock, fetcher);
    const clientB = makeClient(runtimeB.storage!, runtimeB.storageKey, runtimeB.sdkLock, fetcher);
    const expectedA = await captureAuthSessionExpectation(clientA, runtimeA);

    await runtimeB.runMutation(async () => {
      const { error } = await runtimeB.runSdkUnlockedWriter(() =>
        clientB.signInWithPassword({
          email: "user-b@example.invalid",
          password: "not-a-real-password",
        }),
      );
      expect(error).toBeNull();
    });

    await expect(
      signOutExpectedSession(clientA, runtimeA, expectedA, "global"),
    ).rejects.toBeInstanceOf(AuthSessionOwnerChangedError);
    expect(requests.some((request) => request.includes("/logout"))).toBe(false);
    expect(JSON.parse(storage.getItem(runtimeA.storageKey) ?? "null").user.id).toBe("user-b");
  });

  test("an SDK-unlocked B writer waits for background refresh S and wins without stale A overwrite", async () => {
    const storage = new MemoryStorage();
    const runtimeA = createAuthStorageRuntime({
      url: "https://sdk-unlocked-writer-test.supabase.co",
      storage,
      web: false,
    });
    const runtimeB = createAuthStorageRuntime({
      url: "https://sdk-unlocked-writer-test.supabase.co",
      storage,
      web: false,
    });
    await Promise.all([runtimeA.ready(), runtimeB.ready()]);
    const a1 = session("user-a", "session-a", 1);
    const a2 = session("user-a", "session-a", 2);
    const b = session("user-b", "session-b");
    storage.setItem(runtimeA.storageKey, JSON.stringify(a1));
    let releaseRefresh!: () => void;
    let markRefreshStarted!: () => void;
    const refreshStarted = new Promise<void>((resolve) => {
      markRefreshStarted = resolve;
    });
    const refreshRelease = new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });
    let passwordRequests = 0;
    const fetcher = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("grant_type=refresh_token")) {
        markRefreshStarted();
        await refreshRelease;
        return jsonResponse(a2);
      }
      if (url.includes("grant_type=password")) {
        passwordRequests += 1;
        return jsonResponse(b);
      }
      throw new Error(`unexpected auth request: ${url}`);
    }) as unknown as typeof fetch;
    const clientA = makeClient(runtimeA.storage!, runtimeA.storageKey, runtimeA.sdkLock, fetcher);
    const clientB = makeClient(runtimeB.storage!, runtimeB.storageKey, runtimeB.sdkLock, fetcher);
    await Promise.all([clientA.getSession(), clientB.getSession()]);

    const refreshing = clientA.refreshSession();
    await refreshStarted;
    const signingIn = runtimeB.runMutation(() =>
      runtimeB.runSdkUnlockedWriter(() =>
        clientB.signInWithPassword({
          email: "user-b@example.invalid",
          password: "not-a-real-password",
        }),
      ),
    );
    await Promise.resolve();
    expect(passwordRequests).toBe(0);

    releaseRefresh();
    await expect(refreshing).resolves.toMatchObject({ error: null });
    await expect(signingIn).resolves.toMatchObject({ error: null });
    expect(JSON.parse(storage.getItem(runtimeA.storageKey) ?? "null").user.id).toBe("user-b");
  });

  test("captured A accepts an in-flight same-session refresh and revokes the refreshed token", async () => {
    const storage = new MemoryStorage();
    const url = "https://refresh-owner-test.supabase.co";
    const runtime = createAuthStorageRuntime({ url, storage, web: false });
    await runtime.ready();
    const a1 = session("user-a", "session-a", 1);
    const a2 = session("user-a", "session-a", 2);
    storage.setItem(runtime.storageKey, JSON.stringify(a1));
    let releaseRefresh!: () => void;
    let markRefreshStarted!: () => void;
    const refreshStarted = new Promise<void>((resolve) => {
      markRefreshStarted = resolve;
    });
    const refreshRelease = new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });
    let logoutAuthorization: string | null = null;
    const fetcher = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const requestUrl = String(input);
      if (requestUrl.includes("grant_type=refresh_token")) {
        markRefreshStarted();
        await refreshRelease;
        return jsonResponse(a2);
      }
      if (requestUrl.includes("/logout")) {
        logoutAuthorization = new Headers(init?.headers).get("authorization");
        return new Response(null, { status: 204 });
      }
      throw new Error(`unexpected auth request: ${requestUrl}`);
    }) as unknown as typeof fetch;
    const client = makeClient(storage, runtime.storageKey, runtime.sdkLock, fetcher);
    const expectedA = await captureAuthSessionExpectation(client, runtime);

    const refreshing = client.refreshSession();
    await refreshStarted;
    const signingOut = signOutExpectedSession(client, runtime, expectedA, "global");
    await Promise.resolve();
    expect(logoutAuthorization).toBeNull();
    releaseRefresh();

    await expect(refreshing).resolves.toMatchObject({ error: null });
    await expect(signingOut).resolves.toBeUndefined();
    expect(logoutAuthorization).toBe(`Bearer ${a2.access_token}`);
    expect(storage.getItem(runtime.storageKey)).toBeNull();
  });

  test("destructive refresh accepts token rotation only within the captured session_id", async () => {
    const a1 = session("user-a", "session-a", 1);
    const a2 = session("user-a", "session-a", 2);
    const getSession = jest.fn()
      .mockResolvedValueOnce({ data: { session: a1 }, error: null })
      .mockResolvedValueOnce({ data: { session: a2 }, error: null });
    const refreshSession = jest.fn().mockResolvedValue({ data: { session: a2 }, error: null });
    const client = { getSession, refreshSession } as unknown as Pick<
      GoTrueClient,
      "getSession" | "refreshSession"
    >;

    await expect(refreshExpectedSessionInsideMutation(client, {
      userId: "user-a",
      sessionId: "session-a",
      accessToken: a1.access_token,
    })).resolves.toBe(a2.access_token);
    expect(getSession).toHaveBeenCalledTimes(2);
    expect(refreshSession).toHaveBeenCalledTimes(1);
  });

  test("destructive refresh rejects a changed session and legacy JWT expectations", async () => {
    const a1 = session("user-a", "session-a", 1);
    const b = session("user-a", "session-b", 2);
    const changedClient = {
      getSession: jest.fn().mockResolvedValue({ data: { session: a1 }, error: null }),
      refreshSession: jest.fn().mockResolvedValue({ data: { session: b }, error: null }),
    } as unknown as Pick<GoTrueClient, "getSession" | "refreshSession">;

    await expect(refreshExpectedSessionInsideMutation(changedClient, {
      userId: "user-a",
      sessionId: "session-a",
      accessToken: a1.access_token,
    })).rejects.toBeInstanceOf(AuthSessionOwnerChangedError);

    const legacyClient = {
      getSession: jest.fn(),
      refreshSession: jest.fn(),
    } as unknown as Pick<GoTrueClient, "getSession" | "refreshSession">;
    await expect(refreshExpectedSessionInsideMutation(legacyClient, {
      userId: "user-a",
      sessionId: null,
      accessToken: "legacy-token",
    })).rejects.toBeInstanceOf(AuthSessionOwnerChangedError);
    expect(legacyClient.getSession).not.toHaveBeenCalled();
    expect(legacyClient.refreshSession).not.toHaveBeenCalled();
  });

  test("real GoTrue sign-out accepts a same-session refresh and emits SIGNED_OUT before queued B signs in", async () => {
    const storage = new MemoryStorage();
    const runtimeA = createAuthStorageRuntime({
      url: "https://event-order-test.supabase.co",
      storage,
      web: false,
    });
    const runtimeB = createAuthStorageRuntime({
      url: "https://event-order-test.supabase.co",
      storage,
      web: false,
    });
    await Promise.all([runtimeA.ready(), runtimeB.ready()]);
    const a1 = session("user-a", "session-a", 1);
    const a2 = session("user-a", "session-a", 2);
    const b = session("user-b", "session-b");
    storage.setItem(runtimeA.storageKey, JSON.stringify(a1));
    let releaseLogout!: () => void;
    let markLogoutStarted!: () => void;
    const logoutStarted = new Promise<void>((resolve) => {
      markLogoutStarted = resolve;
    });
    const logoutRelease = new Promise<void>((resolve) => {
      releaseLogout = resolve;
    });
    let passwordRequests = 0;
    const fetcher = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("grant_type=refresh_token")) return jsonResponse(a2);
      if (url.includes("grant_type=password")) {
        passwordRequests += 1;
        return jsonResponse(b);
      }
      if (url.includes("/logout")) {
        markLogoutStarted();
        await logoutRelease;
        return new Response(null, { status: 204 });
      }
      throw new Error(`unexpected auth request: ${url}`);
    }) as unknown as typeof fetch;
    const clientA = makeClient(runtimeA.storage!, runtimeA.storageKey, runtimeA.sdkLock, fetcher);
    const clientB = makeClient(runtimeB.storage!, runtimeB.storageKey, runtimeB.sdkLock, fetcher);
    const events: string[] = [];
    clientA.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") events.push(event);
    });
    clientB.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") events.push(event);
    });
    const expectedA = await captureAuthSessionExpectation(clientA, runtimeA);
    const refreshed = await clientA.refreshSession();
    expect(refreshed.error).toBeNull();
    expect(refreshed.data.session?.access_token).not.toBe(expectedA.accessToken);
    events.length = 0;

    const signingOut = signOutExpectedSession(clientA, runtimeA, expectedA, "global");
    await logoutStarted;
    const signingIn = runtimeB.runMutation(() =>
      runtimeB.runSdkUnlockedWriter(async () => {
        const { error } = await clientB.signInWithPassword({
          email: "user-b@example.invalid",
          password: "not-a-real-password",
        });
        expect(error).toBeNull();
      }),
    );
    await Promise.resolve();
    expect(passwordRequests).toBe(0);
    releaseLogout();
    await Promise.all([signingOut, signingIn]);

    expect(events).toEqual(["SIGNED_OUT", "SIGNED_IN"]);
    expect(JSON.parse(storage.getItem(runtimeA.storageKey) ?? "null").user.id).toBe("user-b");
  });
});

describe("a runtime retired during its v1 -> v2 migration (KZ-1840-1)", () => {
  // The migration writes the storage directly, not through the fenced storage
  // the runtime hands its client. A consented reset can retire the runtime
  // while a retried migration sits between two of those writes. It ends there
  // and leaves the move to the live runtime, which still waits for it on M.
  type Keys = ReturnType<typeof authStorageKeysForUrl>;

  const pairsOf = (keys: Keys): Array<[string, string]> => [
    [keys.v1Primary, keys.v2Primary],
    [`${keys.v1Primary}-code-verifier`, `${keys.v2Primary}-code-verifier`],
    [`${keys.v1Primary}-user`, `${keys.v2Primary}-user`],
    [LEGACY_RECOVERY_PROOF_KEY, RECOVERY_PROOF_KEY],
    [LEGACY_RECOVERY_PENDING_KEY, RECOVERY_PENDING_KEY],
  ];
  const copiesOf = (keys: Keys) => pairsOf(keys).map(([, revised]) => `set:${revised}`);
  const removalsOf = (keys: Keys) => pairsOf(keys).map(([legacy]) => `remove:${legacy}`);
  const VALUES = ["session-a", "verifier-a", "user-a", "proof-a", "pending-a"];

  function seedLegacyBundle(storage: MemoryStorage, keys: Keys): void {
    pairsOf(keys).forEach(([legacy], index) => storage.setItem(legacy, VALUES[index]));
  }

  /** Where each value sits, [v1, v2], plus the completion marker. */
  function bundleOnDisk(storage: MemoryStorage, keys: Keys) {
    return {
      pairs: pairsOf(keys).map(([legacy, revised]) => [storage.getItem(legacy), storage.getItem(revised)]),
      marker: storage.getItem(keys.migrationTombstone),
    };
  }
  const MIGRATED = { pairs: VALUES.map((value) => [null, value]), marker: "1" };

  /** One runtime's window onto the shared storage. It logs that runtime's calls
   *  and can stop once at one of them until the gate opens: a read before it
   *  answers, a removal after it is done. */
  function windowOnto(
    shared: MemoryStorage,
    log: string[],
    pause?: { op: "get" | "remove"; key: string; gate: Promise<void> },
  ): SupportedStorage & { reached(): boolean } {
    let reached = false;
    const stopHere = async (op: "get" | "remove", key: string) => {
      if (!pause || reached || pause.op !== op || pause.key !== key) return;
      reached = true;
      await pause.gate;
    };
    return {
      reached: () => reached,
      async getItem(key) {
        log.push(`get:${key}`);
        await stopHere("get", key);
        return shared.getItem(key);
      },
      async setItem(key, value) {
        log.push(`set:${key}`);
        shared.setItem(key, value);
      },
      async removeItem(key) {
        log.push(`remove:${key}`);
        shared.removeItem(key);
        await stopHere("remove", key);
      },
    };
  }

  async function flush(rounds = 10): Promise<void> {
    for (let round = 0; round < rounds; round += 1) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  }

  async function isPending(promise: Promise<unknown>): Promise<boolean> {
    const marker = {};
    const winner = await Promise.race([
      promise,
      new Promise((resolve) => setImmediate(() => resolve(marker))),
    ]);
    return winner === marker;
  }

  const writesIn = (log: string[]) => log.filter((entry) => !entry.startsWith("get:"));

  test.each([
    {
      point: "while it waits on the v2 read of a pair it would copy",
      slug: "copy",
      pause: (keys: Keys) => ({ op: "get" as const, key: keys.v2Primary }),
      retiredWrites: (_keys: Keys): string[] => [],
    },
    {
      point: "while one of its v1 removals is in flight",
      slug: "remove",
      pause: (keys: Keys) => ({ op: "remove" as const, key: keys.v1Primary }),
      retiredWrites: (keys: Keys) => [...copiesOf(keys), `remove:${keys.v1Primary}`],
    },
    {
      point: "while its last v1 removal is in flight, before the completion marker",
      slug: "marker",
      pause: (_keys: Keys) => ({ op: "remove" as const, key: LEGACY_RECOVERY_PENDING_KEY }),
      retiredWrites: (keys: Keys) => [...copiesOf(keys), ...removalsOf(keys)],
    },
  ])("retired $point, it writes nothing more and the live runtime finishes behind M", async ({
    slug,
    pause,
    retiredWrites,
  }) => {
    const url = `https://kz1840-${slug}.supabase.co`;
    const keys = authStorageKeysForUrl(url);
    const shared = new MemoryStorage();
    seedLegacyBundle(shared, keys);
    let openGate!: () => void;
    const gate = new Promise<void>((resolve) => {
      openGate = resolve;
    });
    const retiringLog: string[] = [];
    const retiringWindow = windowOnto(shared, retiringLog, { ...pause(keys), gate });
    const retiring = createAuthStorageRuntime({ url, storage: retiringWindow, web: false });
    const retiringReady = retiring.ready();
    await flush();
    const stoppedMidMigration = retiringWindow.reached() && (await isPending(retiringReady));
    retiring.retire();

    const liveLog: string[] = [];
    const live = createAuthStorageRuntime({ url, storage: windowOnto(shared, liveLog), web: false });
    const liveReady = live.ready();
    await flush();
    const liveWaitedOnM = (await isPending(liveReady)) && liveLog.length === 0;

    openGate();
    await expect(retiringReady).resolves.toBeUndefined();
    await liveReady;

    expect(stoppedMidMigration).toBe(true);
    expect(liveWaitedOnM).toBe(true);
    expect(writesIn(retiringLog)).toEqual(retiredWrites(keys));
    expect(bundleOnDisk(shared, keys)).toEqual(MIGRATED);
  });

  test("retired before it ever migrates, its ready() leaves the storage alone and the live runtime migrates", async () => {
    const url = "https://kz1840-entry.supabase.co";
    const keys = authStorageKeysForUrl(url);
    const shared = new MemoryStorage();
    seedLegacyBundle(shared, keys);
    const retiringLog: string[] = [];
    const retiring = createAuthStorageRuntime({
      url,
      storage: windowOnto(shared, retiringLog),
      web: false,
    });
    retiring.retire();

    await expect(retiring.ready()).resolves.toBeUndefined();
    await expect(retiring.storage?.getItem(keys.v2Primary)).resolves.toBeNull();
    expect(retiringLog).toEqual([]);
    expect(bundleOnDisk(shared, keys).marker).toBeNull();

    const live = createAuthStorageRuntime({ url, storage: windowOnto(shared, []), web: false });
    await live.ready();
    expect(bundleOnDisk(shared, keys)).toEqual(MIGRATED);
  });
});

// The SDK and auth runtime are real. The D barrier below is a sequencing double;
// scripts/qa/interview-web-logout.cjs independently executes actual IndexedDB.
describe("dormant web interview logout coordinator with the real SDK", () => {
  let sequence = 0;
  async function setup(locks: "valid" | "missing" | "invalid" = "valid") {
    const storage = new MemoryStorage();
    const trace: string[] = [];
    const request: TestBrowserLockRequest = (name, _options, callback) =>
      processLock(name, -1, async () => {
        trace.push(name.startsWith("lock:") ? "S:enter" : "M:enter");
        try { return await callback(locks === "invalid" ? null : { name, mode: "exclusive" }); }
        finally { trace.push(name.startsWith("lock:") ? "S:exit" : "M:exit"); }
      });
    const runtime = createAuthStorageRuntime({
      url: `https://web-draft-${++sequence}.supabase.co`, storage, web: true,
      ...(locks === "missing" ? { navigatorLocksAvailable: false } : { navigatorLockRequest: request }),
    });
    await runtime.ready();
    const a = session("web-a", "web-session-a");
    storage.setItem(runtime.storageKey, JSON.stringify(a));
    let sdkFailure = false;
    const fetcher = jest.fn(async (_input: RequestInfo | globalThis.URL) => {
      trace.push("SDK:request");
      return sdkFailure ? jsonResponse({ message: "synthetic failure" }, 500) : new Response(null, { status: 204 });
    });
    const client = makeClient(runtime.storage!, runtime.storageKey, runtime.sdkLock, fetcher as typeof fetch);
    const expected = await captureAuthSessionExpectation(client, runtime);
    const ticket: WebInterviewTicket = { ownerId: a.user.id, sessionId: "web-session-a", storageGeneration: "generation-a", revision: 1 };
    const receipt: WebInterviewPurgeReceipt = { ...ticket, revision: 2, phase: "inactive", logoutId: "logout-a" };
    const lifecycle: WebInterviewLifecycle = {
      storageKey: runtime.storageKey,
      inspect: jest.fn(async () => ({ kind: "empty" as const })),
      prepareIntent: jest.fn(async (intent: WebInterviewLogoutIntent) => intent),
      activate: jest.fn(async () => ticket),
      purge: jest.fn(async () => { trace.push("D:complete"); return receipt; }),
      lookup: jest.fn(async () => receipt),
    };
    trace.length = 0;
    return { storage, runtime, client, expected, ticket, receipt, lifecycle, fetcher, trace,
      failSdk: () => { sdkFailure = true; } };
  }

  test("releases snapshot S before D and never calls SDK before D ACK", async () => {
    const h = await setup();
    let release!: (value: WebInterviewPurgeReceipt) => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    h.lifecycle.purge = jest.fn(() => new Promise((resolve) => {
      expect(h.trace.at(-1)).toBe("S:exit");
      h.trace.push("D:start"); entered(); release = resolve;
    }));
    const pending = signOutExpectedWebInterviewSession(h.client, h.runtime, h.lifecycle, h.expected, h.ticket, "logout-a");
    await started;
    expect(h.fetcher).not.toHaveBeenCalled();
    expect(h.trace.filter((v) => v === "M:exit")).toHaveLength(0);
    h.trace.push("D:complete"); release(h.receipt);
    await expect(pending).resolves.toEqual(h.receipt);
    expect(h.trace.indexOf("D:complete")).toBeLessThan(h.trace.indexOf("SDK:request"));
    expect(h.trace.at(-1)).toBe("M:exit");
    expect(h.storage.getItem(h.runtime.storageKey)).toBeNull();
  });

  test.each(["unconfirmed", "conflict", "unsupported"] as const)("D %s keeps auth and calls SDK zero times", async (code) => {
    const h = await setup();
    h.lifecycle.purge = jest.fn(async () => { throw new WebInterviewLifecycleError(code); });
    await expect(signOutExpectedWebInterviewSession(h.client, h.runtime, h.lifecycle, h.expected, h.ticket, "logout-a"))
      .rejects.toMatchObject({ code });
    expect(h.fetcher).not.toHaveBeenCalled();
    expect(h.storage.getItem(h.runtime.storageKey)).not.toBeNull();
  });

  test.each(["missing", "invalid"] as const)("%s Web Locks prevent D and SDK", async (locks) => {
    const h = await setup(locks);
    await expect(signOutExpectedWebInterviewSession(h.client, h.runtime, h.lifecycle, h.expected, h.ticket, "logout-a"))
      .rejects.toBeInstanceOf(AuthLocalClearUnavailableError);
    expect(h.lifecycle.purge).not.toHaveBeenCalled();
    expect(h.fetcher).not.toHaveBeenCalled();
  });

  test.each([["web-a", "new-session"], ["web-b", "web-session-b"]])("rejects live %s / %s before D", async (owner, sid) => {
    const h = await setup();
    h.storage.setItem(h.runtime.storageKey, JSON.stringify(session(owner, sid)));
    await expect(signOutExpectedWebInterviewSession(h.client, h.runtime, h.lifecycle, h.expected, h.ticket, "logout-a"))
      .rejects.toBeInstanceOf(AuthSessionOwnerChangedError);
    expect(h.lifecycle.purge).not.toHaveBeenCalled();
    expect(h.fetcher).not.toHaveBeenCalled();
  });

  test("same stable session accepts token rotation and preserves local scope", async () => {
    const h = await setup();
    h.storage.setItem(h.runtime.storageKey, JSON.stringify(session("web-a", "web-session-a", 2)));
    await signOutExpectedWebInterviewSession(h.client, h.runtime, h.lifecycle, h.expected, h.ticket, "logout-a", "local");
    expect(h.fetcher).toHaveBeenCalledTimes(1);
    expect(String(h.fetcher.mock.calls[0][0])).toContain("scope=local");
  });

  test("missing stable session rejects activation even if a legacy token exists", async () => {
    const h = await setup();
    await expect(activateExpectedWebInterviewSession(h.client, h.runtime, h.lifecycle, { ...h.expected, sessionId: null }, "new", null))
      .rejects.toBeInstanceOf(AuthSessionOwnerChangedError);
    expect(h.lifecycle.activate).not.toHaveBeenCalled();
  });

  test("required adapter/project binding and a real-shaped receipt cannot be omitted", async () => {
    const h = await setup();
    for (const adapter of [undefined, { ...h.lifecycle, storageKey: "other-project" }]) {
      await expect(signOutExpectedWebInterviewSession(h.client, h.runtime, adapter as WebInterviewLifecycle, h.expected, h.ticket, "logout-a"))
        .rejects.toMatchObject({ code: "unsupported" });
    }
    h.lifecycle.purge = jest.fn(async () => undefined as unknown as WebInterviewPurgeReceipt);
    await expect(signOutExpectedWebInterviewSession(h.client, h.runtime, h.lifecycle, h.expected, h.ticket, "logout-a"))
      .rejects.toMatchObject({ code: "unconfirmed" });
    expect(h.fetcher).not.toHaveBeenCalled();
  });

  test("copies caller ticket and expectation before queued M work", async () => {
    const h = await setup();
    let release!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const hold = h.runtime.runMutation(() => new Promise<void>((resolve) => { release = resolve; entered(); }), { requireCrossTab: true });
    await started;
    const ticket = { ...h.ticket };
    const expected = { ...h.expected };
    const pending = signOutExpectedWebInterviewSession(h.client, h.runtime, h.lifecycle, expected, ticket, "logout-a");
    ticket.sessionId = "mutated";
    expected.sessionId = "mutated";
    release(); await hold;
    await expect(pending).resolves.toEqual(h.receipt);
    expect(h.lifecycle.purge).toHaveBeenCalledWith(h.ticket, "logout-a", "global");
  });

  test("SDK failure follows D ACK and does not reactivate", async () => {
    const h = await setup();
    h.failSdk();
    await expect(signOutExpectedWebInterviewSession(h.client, h.runtime, h.lifecycle, h.expected, h.ticket, "logout-a")).rejects.toBeDefined();
    expect(h.lifecycle.purge).toHaveBeenCalledTimes(1);
    expect(h.lifecycle.activate).not.toHaveBeenCalled();
    expect(h.trace.indexOf("D:complete")).toBeLessThan(h.trace.indexOf("SDK:request"));
  });

  test("already-cleared exact ticket still requires D before the SDK event", async () => {
    const h = await setup();
    h.storage.removeItem(h.runtime.storageKey);
    const events: string[] = [];
    h.client.onAuthStateChange((event) => { if (event === "SIGNED_OUT") events.push(event); });
    await expect(signOutExpectedWebInterviewSession(h.client, h.runtime, h.lifecycle, h.expected, h.ticket, "logout-a")).resolves.toEqual(h.receipt);
    expect(h.lifecycle.purge).toHaveBeenCalledTimes(1);
    expect(events).toContain("SIGNED_OUT");
  });

  test("already-M exact helper acquires M once and keeps the original receipt", async () => {
    const h = await setup();
    await expect(h.runtime.runMutation((context) => signOutExpectedWebInterviewSessionInsideMutation(
      h.client, h.runtime, context, h.lifecycle, h.expected, h.ticket, "logout-a",
    ), { requireCrossTab: true })).resolves.toEqual(h.receipt);
    expect(h.trace.filter((v) => v === "M:enter")).toHaveLength(1);
    expect(h.trace.filter((v) => v === "M:exit")).toHaveLength(1);
  });

  test("fresh empty uses auth-only, preserves local scope, and performs no purge", async () => {
    const h = await setup();
    h.lifecycle.inspect = jest.fn(async () => { expect(h.trace.at(-1)).toBe("S:exit"); h.trace.push("D:empty"); return { kind: "empty" as const }; });
    await expect(signOutEmptyWebInterviewSession(h.client, h.runtime, h.lifecycle, h.expected, "local"))
      .resolves.toEqual({ kind: "auth-only" });
    expect(h.lifecycle.inspect).toHaveBeenCalledTimes(1);
    expect(h.lifecycle.purge).not.toHaveBeenCalled();
    expect(String(h.fetcher.mock.calls[0][0])).toContain("scope=local");
    expect(h.trace.indexOf("D:empty")).toBeLessThan(h.trace.indexOf("SDK:request"));
  });

  test.each(["active", "inactive", "malformed"])("%s is not auth-only emptiness", async (kind) => {
    const h = await setup();
    h.lifecycle.inspect = jest.fn(async () => kind === "active" ? { kind: "active" as const, ticket: h.ticket, intent: null }
      : kind === "inactive" ? { kind: "inactive" as const, receipt: h.receipt, intent: null } : { kind: "empty" as const, unexpected: true });
    await expect(signOutEmptyWebInterviewSession(h.client, h.runtime, h.lifecycle, h.expected)).rejects.toMatchObject({ code: "unconfirmed" });
    expect(h.fetcher).not.toHaveBeenCalled();
    expect(h.lifecycle.purge).not.toHaveBeenCalled();
  });

  test.each(["unconfirmed", "unsupported", "conflict"] as const)("empty inspection %s is SDK zero", async (code) => {
    const h = await setup();
    h.lifecycle.inspect = jest.fn(async () => { throw new WebInterviewLifecycleError(code); });
    await expect(signOutEmptyWebInterviewSession(h.client, h.runtime, h.lifecycle, h.expected)).rejects.toMatchObject({ code });
    expect(h.fetcher).not.toHaveBeenCalled();
  });

  test.each(["legacy", "stable-rotation", "null", "cleared"])("auth-only retains %s expected-session meaning", async (mode) => {
    const h = await setup();
    if (mode === "legacy") h.storage.setItem(h.runtime.storageKey, JSON.stringify(session("web-a", "")));
    if (mode === "null") h.storage.removeItem(h.runtime.storageKey);
    const expected = await captureAuthSessionExpectation(h.client, h.runtime);
    if (mode === "stable-rotation") h.storage.setItem(h.runtime.storageKey, JSON.stringify(session("web-a", "web-session-a", 2)));
    if (mode === "cleared") h.storage.removeItem(h.runtime.storageKey);
    const sdk = jest.spyOn(h.client, "signOut");
    await expect(signOutEmptyWebInterviewSession(h.client, h.runtime, h.lifecycle, expected)).resolves.toEqual({ kind: "auth-only" });
    expect(sdk).toHaveBeenCalledTimes(1);
    expect(h.lifecycle.inspect).toHaveBeenCalledTimes(1);
  });

  test("legacy token rotation fails before inspection; unknown read is not known-null", async () => {
    const h = await setup();
    h.storage.setItem(h.runtime.storageKey, JSON.stringify(session("web-a", "")));
    const expected = await captureAuthSessionExpectation(h.client, h.runtime);
    h.storage.setItem(h.runtime.storageKey, JSON.stringify(session("web-a", "", 2)));
    await expect(signOutEmptyWebInterviewSession(h.client, h.runtime, h.lifecycle, expected)).rejects.toBeInstanceOf(AuthSessionOwnerChangedError);
    const original = h.client.getSession.bind(h.client);
    const failure = new Error("synthetic unknown auth");
    jest.spyOn(h.client, "getSession").mockImplementationOnce(async () => { await original(); throw failure; });
    await expect(signOutEmptyWebInterviewSession(h.client, h.runtime, h.lifecycle, expected)).rejects.toBe(failure);
    expect(h.lifecycle.inspect).not.toHaveBeenCalled();
    expect(h.fetcher).not.toHaveBeenCalled();
  });

  test("new auth after empty inspection is preserved by the final SDK comparison", async () => {
    const h = await setup();
    h.lifecycle.inspect = jest.fn(async () => {
      h.storage.setItem(h.runtime.storageKey, JSON.stringify(session("web-b", "web-session-b")));
      return { kind: "empty" as const };
    });
    await expect(signOutEmptyWebInterviewSession(h.client, h.runtime, h.lifecycle, h.expected)).rejects.toBeInstanceOf(AuthSessionOwnerChangedError);
    expect(h.fetcher).not.toHaveBeenCalled();
    expect((await h.client.getSession()).data.session?.user.id).toBe("web-b");
  });

  test("SDK failure retry inspects afresh and rejects a newly active generation", async () => {
    const h = await setup(); h.failSdk();
    await expect(signOutEmptyWebInterviewSession(h.client, h.runtime, h.lifecycle, h.expected)).rejects.toBeDefined();
    h.lifecycle.inspect = jest.fn(async () => ({ kind: "active" as const, ticket: h.ticket, intent: null }));
    await expect(signOutEmptyWebInterviewSession(h.client, h.runtime, h.lifecycle, h.expected)).rejects.toMatchObject({ code: "unconfirmed" });
    expect(h.lifecycle.inspect).toHaveBeenCalledTimes(1);
    expect(h.fetcher).toHaveBeenCalledTimes(1);
  });

  test.each(["copy", "fake", "other-runtime", "retired"])("%s context has no D or SDK authority", async (mode) => {
    const h = await setup();
    await h.runtime.runMutation(async (context) => {
      const selected = mode === "copy" ? { ...context } : mode === "fake" ? { destructiveSafe: true } : context;
      const runtime = mode === "other-runtime" ? { ...h.runtime } : h.runtime;
      if (mode === "retired") h.runtime.retire();
      await expect(signOutEmptyWebInterviewSessionInsideMutation(h.client, runtime, selected, h.lifecycle, h.expected))
        .rejects.toBeInstanceOf(AuthMutationContextUnavailableError);
    }, { requireCrossTab: true });
    expect(h.lifecycle.inspect).not.toHaveBeenCalled(); expect(h.fetcher).not.toHaveBeenCalled();
  });

  test("released context cannot be reused in a later callback of the same runtime", async () => {
    const h = await setup(); let previous!: AuthMutationContext;
    await h.runtime.runMutation((context) => { previous = context; }, { requireCrossTab: true });
    await h.runtime.runMutation(async () => {
      await expect(signOutEmptyWebInterviewSessionInsideMutation(h.client, h.runtime, previous, h.lifecycle, h.expected))
        .rejects.toBeInstanceOf(AuthMutationContextUnavailableError);
    }, { requireCrossTab: true });
    expect(h.lifecycle.inspect).not.toHaveBeenCalled(); expect(h.fetcher).not.toHaveBeenCalled();
  });

  test.each(["value", "throw", "getter-value", "getter-throw"])("%s callback closes before queued registration", async (mode) => {
    const h = await setup(); const failure = new Error("original synchronous failure");
    let child!: Promise<unknown>; let calls = 0; let reads = 0;
    const value = Object.defineProperty({}, "then", { get() {
      reads++;
      if (mode === "getter-throw") throw failure;
      return undefined;
    } });
    const outer = h.runtime.runMutation((context) => {
      queueMicrotask(() => {
        child = runWithWebAuthMutationContext(h.runtime, context, () => { calls++; return "late"; });
        void child.catch(() => undefined);
      });
      if (mode === "throw") throw failure;
      return mode.startsWith("getter") ? value : "ordinary";
    }, { requireCrossTab: true });
    if (mode.endsWith("throw")) await expect(outer).rejects.toBe(failure);
    else expect(await outer).toBe(mode.startsWith("getter") ? value : "ordinary");
    await expect(child).rejects.toBeInstanceOf(AuthMutationContextUnavailableError);
    expect(calls).toBe(0);
    // The getter may also be read while the outer Promise adopts an ordinary
    // object value; no callback-scope reopen is allowed during that adoption.
    if (mode === "getter-value") expect(reads).toBeGreaterThan(0);
    else expect(reads).toBe(mode === "getter-throw" ? 1 : 0);
  });

  test.each(["auth-only", "explicit"])("queued actual %s helper never starts S, D or SDK after sync return", async (mode) => {
    const h = await setup(); let child!: Promise<unknown>;
    const read = jest.spyOn(h.client, "getSession");
    await expect(h.runtime.runMutation((context) => {
      queueMicrotask(() => {
        child = mode === "auth-only"
          ? signOutEmptyWebInterviewSessionInsideMutation(h.client, h.runtime, context, h.lifecycle, h.expected)
          : signOutExpectedWebInterviewSessionInsideMutation(h.client, h.runtime, context, h.lifecycle, h.expected, h.ticket, "logout-a");
        void child.catch(() => undefined);
      });
      return "ordinary";
    }, { requireCrossTab: true })).resolves.toBe("ordinary");
    await expect(child).rejects.toBeInstanceOf(AuthMutationContextUnavailableError);
    expect(read).not.toHaveBeenCalled(); expect(h.lifecycle.inspect).not.toHaveBeenCalled();
    expect(h.lifecycle.purge).not.toHaveBeenCalled(); expect(h.fetcher).not.toHaveBeenCalled();
  });

  test("then getter is read once while closed; adopted pending helper keeps M until settle", async () => {
    const h = await setup(); let reads = 0; let calls = 0; let getterCalls = 0;
    let getterChild!: Promise<unknown>; let enter!: () => void; let release!: () => void;
    const entered = new Promise<void>((yes) => { enter = yes; });
    const gate = new Promise<void>((yes) => { release = yes; });
    h.lifecycle.inspect = jest.fn(async () => { enter(); await gate; return { kind: "empty" as const }; });
    const outer = h.runtime.runMutation((context) => Object.defineProperty({}, "then", { get() {
      reads++;
      getterChild = runWithWebAuthMutationContext(h.runtime, context, () => { getterCalls++; });
      void getterChild.catch(() => undefined);
      return (resolve: (value: Promise<unknown>) => void) => {
        calls++;
        resolve(signOutEmptyWebInterviewSessionInsideMutation(h.client, h.runtime, context, h.lifecycle, h.expected));
        throw new Error("ignored after resolve");
      };
    } }) as Promise<unknown>, { requireCrossTab: true });
    await entered;
    await expect(getterChild).rejects.toBeInstanceOf(AuthMutationContextUnavailableError);
    expect(getterCalls).toBe(0); expect(reads).toBe(1); expect(calls).toBe(1);
    expect(h.trace.filter((v) => v === "M:exit")).toHaveLength(0);
    release(); await expect(outer).resolves.toEqual({ kind: "auth-only" });
    expect(h.fetcher).toHaveBeenCalledTimes(1);
  });

  test("settled thenable cannot reopen registration from its queued continuation", async () => {
    const h = await setup(); let child!: Promise<unknown>; let calls = 0;
    const outer = h.runtime.runMutation((context) => ({ then(resolve: (value: string) => void) {
      resolve("settled");
      queueMicrotask(() => {
        child = runWithWebAuthMutationContext(h.runtime, context, () => { calls++; });
        void child.catch(() => undefined);
      });
    } }) as unknown as Promise<string>, { requireCrossTab: true });
    await expect(outer).resolves.toBe("settled");
    await expect(child).rejects.toBeInstanceOf(AuthMutationContextUnavailableError);
    expect(calls).toBe(0);
  });

  test("thenable settling before its registered child still drains that child under M", async () => {
    const h = await setup(); let enter!: () => void; let release!: () => void;
    const entered = new Promise<void>((yes) => { enter = yes; });
    const gate = new Promise<void>((yes) => { release = yes; });
    h.lifecycle.inspect = jest.fn(async () => { enter(); await gate; return { kind: "empty" as const }; });
    const outer = h.runtime.runMutation((context) => ({ then(resolve: (value: string) => void) {
      void signOutEmptyWebInterviewSessionInsideMutation(h.client, h.runtime, context, h.lifecycle, h.expected);
      void entered.then(() => resolve("callback settled"));
    } }) as unknown as Promise<string>, { requireCrossTab: true });
    const checked = expect(outer).rejects.toBeInstanceOf(AuthMutationContextUnavailableError);
    await entered; await new Promise<void>((yes) => setImmediate(yes));
    expect(h.trace.filter((v) => v === "M:exit")).toHaveLength(0);
    release(); await checked; expect(h.fetcher).not.toHaveBeenCalled();
  });

  test("thenable rejection and getter failure preserve the original error", async () => {
    const h = await setup(); const failure = new Error("original thenable rejection");
    let thenCalls = 0;
    const thenable = { then(_resolve: unknown, reject: (error: unknown) => void) {
      thenCalls++; reject(failure); throw new Error("ignored after rejection");
    } } as unknown as Promise<never>;
    await expect(h.runtime.runMutation(() => thenable)).rejects.toBe(failure);
    expect(thenCalls).toBe(1);
    const native = Promise.resolve("native");
    Object.defineProperty(native, "then", { get() { throw new Error("native await must not read overridden then"); } });
    await expect(h.runtime.runMutation(() => native)).resolves.toBe("native");
  });

  test.each(["snapshot", "D", "final-snapshot", "SDK"])("early callback end during %s drains under M and prevents false success", async (stage) => {
    const h = await setup();
    let enter!: () => void; let release!: () => void;
    const entered = new Promise<void>((yes) => { enter = yes; });
    const gate = new Promise<void>((yes) => { release = yes; });
    const original = h.client.getSession.bind(h.client);
    if (stage === "snapshot" || stage === "final-snapshot") {
      let reads = 0;
      jest.spyOn(h.client, "getSession").mockImplementation(async () => {
        const result = await original();
        if (++reads === (stage === "snapshot" ? 1 : 2)) { enter(); await gate; }
        return result;
      });
    } else if (stage === "D") h.lifecycle.inspect = jest.fn(async () => { enter(); await gate; return { kind: "empty" as const }; });
    else h.fetcher.mockImplementation(async () => { enter(); await gate; return new Response(null, { status: 204 }); });
    let child!: Promise<unknown>; let childError: unknown;
    const outer = h.runtime.runMutation(async (context) => {
      child = signOutEmptyWebInterviewSessionInsideMutation(h.client, h.runtime, context, h.lifecycle, h.expected);
      void child.catch((error: unknown) => { childError = error; });
      await entered; // Deliberately do not await the helper.
    }, { requireCrossTab: true });
    const outerCheck = expect(outer).rejects.toBeInstanceOf(AuthMutationContextUnavailableError);
    await entered; await new Promise<void>((yes) => setImmediate(yes));
    expect(h.trace.filter((v) => v === "M:exit")).toHaveLength(0);
    let nextEntered = false;
    const next = h.runtime.runMutation(() => { nextEntered = true; }, { requireCrossTab: true });
    await new Promise<void>((yes) => setImmediate(yes)); expect(nextEntered).toBe(false);
    release(); await outerCheck; await child.catch(() => undefined); await next;
    expect(childError).toBeInstanceOf(AuthMutationContextUnavailableError);
    expect(h.fetcher).toHaveBeenCalledTimes(stage === "SDK" ? 1 : 0);
    if (stage === "snapshot") expect(h.lifecycle.inspect).not.toHaveBeenCalled();
  });

  test("callback error wins while registered D drains; ordinary callback results stay unchanged", async () => {
    const h = await setup(); const failure = new Error("original callback failure");
    let enter!: () => void; let release!: () => void;
    const entered = new Promise<void>((yes) => { enter = yes; });
    const gate = new Promise<void>((yes) => { release = yes; });
    h.lifecycle.inspect = jest.fn(async () => { enter(); await gate; return { kind: "empty" as const }; });
    const outer = h.runtime.runMutation(async (context) => {
      void signOutEmptyWebInterviewSessionInsideMutation(h.client, h.runtime, context, h.lifecycle, h.expected);
      await entered; throw failure;
    }, { requireCrossTab: true });
    const checked = expect(outer).rejects.toBe(failure);
    await entered; await new Promise<void>((yes) => setImmediate(yes));
    expect(h.trace.filter((v) => v === "M:exit")).toHaveLength(0);
    release(); await checked;
    expect(h.fetcher).not.toHaveBeenCalled();
    await expect(h.runtime.runMutation(() => "ordinary")).resolves.toBe("ordinary");
    await expect(h.runtime.runMutation(() => { throw failure; })).rejects.toBe(failure);
  });

  function durable(h: Awaited<ReturnType<typeof setup>>, scope: "global" | "local" = "local") {
    return { v: 1 as const, kind: "web-interview-logout" as const, ownerId: h.ticket.ownerId,
      sessionId: h.ticket.sessionId, storageGeneration: h.ticket.storageGeneration,
      activeRevision: h.ticket.revision, logoutId: h.receipt.logoutId, scope };
  }

  test("B0b new request fixes one original ID and waits for prepare ACK before purge", async () => {
    const h = await setup(); const createLogoutId = jest.fn(() => "logout-a");
    h.lifecycle.inspect = jest.fn(async () => ({ kind: "active" as const, ticket: h.ticket, intent: null }));
    let release!: () => void; let enter!: () => void;
    const entered = new Promise<void>((yes) => { enter = yes; });
    h.lifecycle.prepareIntent = jest.fn(async (intent: WebInterviewLogoutIntent) => {
      enter(); await new Promise<void>((yes) => { release = yes; }); return intent;
    });
    const pending = resolveWebInterviewSignOut(h.client, h.runtime, h.lifecycle, h.expected,
      { kind: "new", scope: "local", createLogoutId });
    await entered; expect(createLogoutId).toHaveBeenCalledTimes(1);
    expect(h.lifecycle.purge).not.toHaveBeenCalled(); expect(h.fetcher).not.toHaveBeenCalled();
    release(); await expect(pending).resolves.toEqual({ kind: "draft-purged", receipt: h.receipt });
    expect(h.lifecycle.prepareIntent).toHaveBeenCalledWith(durable(h));
    expect(h.lifecycle.purge).toHaveBeenCalledWith(h.ticket, "logout-a", "local");
    expect(String(h.fetcher.mock.calls[0][0])).toContain("scope=local");
  });

  test.each(["unknown", "wrong-ack"])("B0b prepare %s never starts purge or SDK", async (mode) => {
    const h = await setup();
    h.lifecycle.inspect = jest.fn(async () => ({ kind: "active" as const, ticket: h.ticket, intent: null }));
    h.lifecycle.prepareIntent = jest.fn(async (intent: WebInterviewLogoutIntent) => {
      if (mode === "unknown") throw new WebInterviewLifecycleError("unconfirmed");
      return { ...intent, logoutId: "different" };
    });
    await expect(resolveWebInterviewSignOut(h.client, h.runtime, h.lifecycle, h.expected,
      { kind: "new", scope: "local", createLogoutId: () => "logout-a" })).rejects.toBeInstanceOf(WebInterviewLifecycleError);
    expect(h.lifecycle.purge).not.toHaveBeenCalled(); expect(h.fetcher).not.toHaveBeenCalled();
  });

  test.each(["active", "inactive"] as const)("B0b restart resumes %s with durable original revision/ID/scope", async (kind) => {
    const h = await setup(); const intent = durable(h);
    h.lifecycle.inspect = jest.fn(async () => kind === "active"
      ? { kind, ticket: h.ticket, intent } : { kind, receipt: h.receipt, intent });
    await expect(resolveWebInterviewSignOut(h.client, h.runtime, h.lifecycle, h.expected,
      { kind: "resume", emptyScope: "global" })).resolves.toEqual({ kind: "draft-purged", receipt: h.receipt });
    expect(h.lifecycle.prepareIntent).not.toHaveBeenCalled();
    expect(kind === "active" ? h.lifecycle.purge : h.lifecycle.lookup).toHaveBeenCalledWith(h.ticket, "logout-a", "local");
    expect(String(h.fetcher.mock.calls[0][0])).toContain("scope=local");
  });

  test.each(["active", "inactive"] as const)("B0b %s without original ID is never automatic new work", async (kind) => {
    const h = await setup();
    h.lifecycle.inspect = jest.fn(async () => kind === "active"
      ? { kind, ticket: h.ticket, intent: null } : { kind, receipt: h.receipt, intent: null });
    await expect(resolveWebInterviewSignOut(h.client, h.runtime, h.lifecycle, h.expected,
      { kind: "resume", emptyScope: "global" })).rejects.toMatchObject({ code: "unconfirmed-missing-origin" });
    expect(h.lifecycle.prepareIntent).not.toHaveBeenCalled(); expect(h.lifecycle.purge).not.toHaveBeenCalled();
    expect(h.lifecycle.lookup).not.toHaveBeenCalled(); expect(h.fetcher).not.toHaveBeenCalled();
  });

  test.each(["null", "foreign", "legacy"])("B0b new bound %s auth cannot mint an ID", async (mode) => {
    const h = await setup(); const createLogoutId = jest.fn(() => "logout-a");
    h.lifecycle.inspect = jest.fn(async () => ({ kind: "active" as const, ticket: h.ticket, intent: null }));
    if (mode === "null") h.storage.removeItem(h.runtime.storageKey);
    else h.storage.setItem(h.runtime.storageKey, JSON.stringify(session(mode === "foreign" ? "web-b" : "web-a", mode === "legacy" ? "" : "web-session-b")));
    const current = await captureAuthSessionExpectation(h.client, h.runtime);
    await expect(resolveWebInterviewSignOut(h.client, h.runtime, h.lifecycle, current,
      { kind: "new", scope: "global", createLogoutId })).rejects.toBeInstanceOf(AuthSessionOwnerChangedError);
    expect(createLogoutId).not.toHaveBeenCalled(); expect(h.lifecycle.prepareIntent).not.toHaveBeenCalled();
    expect(h.lifecycle.purge).not.toHaveBeenCalled(); expect(h.fetcher).not.toHaveBeenCalled();
  });

  test("B0b known-null durable origin resumes; null without an origin stays unconfirmed", async () => {
    const h = await setup();
    h.storage.removeItem(h.runtime.storageKey);
    const current = await captureAuthSessionExpectation(h.client, h.runtime);
    h.lifecycle.inspect = jest.fn(async () => ({ kind: "inactive" as const, receipt: h.receipt, intent: durable(h) }));
    await expect(resolveWebInterviewSignOut(h.client, h.runtime, h.lifecycle, current,
      { kind: "resume", emptyScope: "global" })).resolves.toMatchObject({ kind: "draft-purged" });
    expect(h.lifecycle.lookup).toHaveBeenCalledWith(h.ticket, "logout-a", "local");
  });

  test.each(["id", "scope", "revision"])("B0b captured original %s mismatch cannot consume durable intent", async (field) => {
    const h = await setup();
    h.lifecycle.inspect = jest.fn(async () => ({ kind: "active" as const, ticket: h.ticket, intent: durable(h) }));
    const original = { expected: h.expected, ticket: { ...h.ticket, revision: field === "revision" ? 3 : 1 },
      logoutId: field === "id" ? "other" : "logout-a", scope: field === "scope" ? "global" as const : "local" as const };
    await expect(resolveWebInterviewSignOut(h.client, h.runtime, h.lifecycle, h.expected,
      { kind: "resume", emptyScope: "global", original })).rejects.toMatchObject({ code: "conflict" });
    expect(h.lifecycle.prepareIntent).not.toHaveBeenCalled(); expect(h.lifecycle.purge).not.toHaveBeenCalled();
    expect(h.fetcher).not.toHaveBeenCalled();
  });

  test("B0b in-memory original retries prepare while legacy inactive uses only A explicit context", async () => {
    for (const kind of ["active", "inactive"] as const) {
      const h = await setup();
      h.lifecycle.inspect = jest.fn(async () => kind === "active"
        ? { kind, ticket: h.ticket, intent: null } : { kind, receipt: h.receipt, intent: null });
      const original = { expected: h.expected, ticket: h.ticket, logoutId: "logout-a", scope: "local" as const };
      await expect(resolveWebInterviewSignOut(h.client, h.runtime, h.lifecycle, h.expected,
        { kind: "resume", emptyScope: "global", original })).resolves.toMatchObject({ kind: "draft-purged" });
      expect(h.lifecycle.prepareIntent).toHaveBeenCalledTimes(kind === "active" ? 1 : 0);
      expect(h.lifecycle.purge).toHaveBeenCalledWith(h.ticket, "logout-a", "local");
    }
  });

  test("B0b initial empty is auth-only with no ID; new work never overwrites pending intent", async () => {
    const h = await setup(); const createLogoutId = jest.fn(() => "logout-a");
    const request: WebInterviewLogoutRequest = { kind: "new", scope: "local", createLogoutId };
    await expect(resolveWebInterviewSignOut(h.client, h.runtime, h.lifecycle, h.expected, request)).resolves.toEqual({ kind: "auth-only" });
    expect(createLogoutId).not.toHaveBeenCalled(); expect(h.lifecycle.prepareIntent).not.toHaveBeenCalled();
    h.storage.setItem(h.runtime.storageKey, JSON.stringify(session("web-a", "web-session-a")));
    h.lifecycle.inspect = jest.fn(async () => ({ kind: "active" as const, ticket: h.ticket, intent: durable(h) }));
    await expect(resolveWebInterviewSignOut(h.client, h.runtime, h.lifecycle, h.expected, request)).rejects.toMatchObject({ code: "conflict" });
    expect(createLogoutId).not.toHaveBeenCalled(); expect(h.lifecycle.prepareIntent).not.toHaveBeenCalled();
  });


  test("B0b queued new request copies expected, scope, and ID factory before first await", async () => {
    const h = await setup(); h.lifecycle.inspect = jest.fn(async () => ({ kind: "active" as const, ticket: h.ticket, intent: null }));
    let enter!: () => void; let release!: () => void;
    const entered = new Promise<void>((yes) => { enter = yes; });
    const blocker = h.runtime.runMutation(async () => { enter(); await new Promise<void>((yes) => { release = yes; }); });
    await entered;
    const expected = { ...h.expected }; const first = jest.fn(() => "logout-a"); const later = jest.fn(() => "different-id");
    const request = { kind: "new" as const, scope: "local" as "local" | "global", createLogoutId: first };
    const pending = resolveWebInterviewSignOut(h.client, h.runtime, h.lifecycle, expected, request);
    expected.userId = "changed-owner"; request.scope = "global"; request.createLogoutId = later;
    release(); await blocker; await expect(pending).resolves.toMatchObject({ kind: "draft-purged" });
    expect(first).toHaveBeenCalledTimes(1); expect(later).not.toHaveBeenCalled();
    expect(h.lifecycle.purge).toHaveBeenCalledWith(h.ticket, "logout-a", "local");
  });

});
