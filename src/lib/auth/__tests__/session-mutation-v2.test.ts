import { GoTrueClient, processLock, type LockFunc, type SupportedStorage } from "@supabase/auth-js";
import {
  AuthLocalClearUnavailableError,
  AuthSessionOwnerChangedError,
  authStorageKeysForUrl,
  captureAuthSessionExpectation,
  createAuthStorageRuntime,
  resolveAuthStorage,
  signOutExpectedSession,
} from "../session-mutation";
import {
  LEGACY_RECOVERY_PENDING_KEY,
  LEGACY_RECOVERY_PROOF_KEY,
  RECOVERY_PENDING_KEY,
  RECOVERY_PROOF_KEY,
} from "../recovery-proof-store";

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
        expect(options).toEqual({ mode: "exclusive" });
        expect(options).not.toHaveProperty("steal");
        expect(options).not.toHaveProperty("signal");
        expect(options).not.toHaveProperty("ifAvailable");
      }
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

  test("a valid browser lock keeps M before S and holds M until S releases", async () => {
    const storage = new MemoryStorage();
    const trace: string[] = [];
    const request: TestBrowserLockRequest = async (name, options, callback) => {
      expect(options).toEqual({ mode: "exclusive" });
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
