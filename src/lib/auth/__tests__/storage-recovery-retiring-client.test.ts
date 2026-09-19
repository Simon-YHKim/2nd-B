import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";

// R27 (2026-09-20). The storage-recovery gate can be raised over a session that
// is still readable: #1835 escalates a fail-closed lock that persisted across
// cold starts. The retiring Supabase client keeps its auto-refresh tick through
// the gate. A tick that read the recovery session BEFORE consent could save the
// refreshed session AFTER the consented wipe and resetSupabaseClient, and the
// fresh client then published it as an ordinary session, with no recovery lock,
// on this launch and the next. The retiring runtime's storage is now fenced in
// the same turn the wipe is queued (storage-recovery.ts, session-mutation.ts).
//
// Everything below is the real app code on the real @supabase/auth-js: the
// client singleton, the auth storage runtime, the encrypted adapter and its
// consented wipe, the recovery helper with its default dependencies, the proof
// store and the bootstrap classifier. Only the device is fake. AsyncStorage and
// SecureStore are two Maps that outlive a cold start, expo-crypto is real
// AES-256-GCM, and fetch, AppState, timers and Date are test doubles. A cold
// start is a fresh module registry over the same two Maps.

type ClientModule = typeof import("../../supabase/client");
type MutationModule = typeof import("../session-mutation");
type RecoveryModule = typeof import("../storage-recovery");
type ProofModule = typeof import("../recovery-proof-store");
type OutcomeModule = typeof import("../bootstrap-outcome");
type StorageModule = typeof import("../../storage/encrypted-native-storage");
type SupabaseClient = ReturnType<ClientModule["getSupabaseClient"]>;

interface DiskEvent {
  op: "set" | "remove" | "list" | "secure-set" | "secure-delete";
  key?: string;
}

interface Device {
  asyncStorage: Map<string, string>;
  secureStore: Map<string, string>;
  events: DiskEvent[];
  /** Hold the consented wipe at its key listing until the gate resolves. */
  holdKeyListing(gate: Promise<void> | null): void;
  /** Hold the next read of one key until the gate resolves. */
  holdNextRead(key: string, gate: Promise<void>): { started(): boolean };
  asyncStorageModule: {
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<void>;
    removeItem(key: string): Promise<void>;
    getAllKeys(): Promise<string[]>;
  };
  secureStoreModule: {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: string;
    isAvailableAsync(): Promise<boolean>;
    getItemAsync(key: string): Promise<string | null>;
    setItemAsync(key: string, value: string): Promise<void>;
    deleteItemAsync(key: string): Promise<void>;
  };
}

interface FakeAppState {
  module: {
    addEventListener(type: string, handler: (state: string) => void): { remove(): void };
  };
  emit(state: string): void;
}

let mockDevice: Device | null = null;
let mockAppState: FakeAppState | null = null;

jest.mock("@react-native-async-storage/async-storage", () => {
  if (!mockDevice) throw new Error("no fake device for this cold start");
  return { __esModule: true, default: mockDevice.asyncStorageModule };
});
// Virtual, as in encrypted-native-storage.test.ts: jest's resolver caches the
// module id per requiring file across the suites in a worker, so one suite
// mocking this import as virtual and another as real breaks the later one.
jest.mock(
  "expo-secure-store",
  () => {
    if (!mockDevice) throw new Error("no fake device for this cold start");
    return mockDevice.secureStoreModule;
  },
  { virtual: true },
);
jest.mock("expo-crypto", () => mockExpoCrypto);
jest.mock("react-native", () => {
  if (!mockAppState) throw new Error("no fake AppState for this cold start");
  return { AppState: mockAppState.module };
});

const mockExpoCrypto = {
  CryptoDigestAlgorithm: { SHA1: "SHA-1", SHA256: "SHA-256", SHA512: "SHA-512" },
  async digestStringAsync(algorithm: string, value: string): Promise<string> {
    const name = algorithm === "SHA-1" ? "sha1" : algorithm === "SHA-512" ? "sha512" : "sha256";
    return createHash(name).update(value, "utf8").digest("hex");
  },
  randomUUID(): string {
    return randomUUID();
  },
  AESEncryptionKey: {
    async generate(bits: number) {
      const raw = randomBytes(bits / 8);
      return { encoded: () => raw.toString("base64") };
    },
    async import(encoded: string) {
      return { raw: Buffer.from(encoded, "base64") };
    },
  },
  AESSealedData: {
    fromCombined(bytes: Uint8Array) {
      return { bytes: Buffer.from(bytes) };
    },
  },
  async aesEncryptAsync(
    plaintext: Uint8Array,
    key: { raw: Buffer },
    options: { additionalData: Uint8Array; nonce: { length: number }; tagLength: number },
  ) {
    const iv = randomBytes(options.nonce.length);
    const cipher = createCipheriv("aes-256-gcm", key.raw, iv, { authTagLength: options.tagLength });
    cipher.setAAD(Buffer.from(options.additionalData));
    const body = Buffer.concat([cipher.update(Buffer.from(plaintext)), cipher.final()]);
    const combined = Buffer.concat([iv, body, cipher.getAuthTag()]);
    return { combined: () => combined.toString("base64") };
  },
  async aesDecryptAsync(
    sealed: { bytes: Buffer },
    key: { raw: Buffer },
    options: { additionalData: Uint8Array },
  ): Promise<Uint8Array> {
    const bytes = sealed.bytes;
    const decipher = createDecipheriv("aes-256-gcm", key.raw, bytes.subarray(0, 12), {
      authTagLength: 16,
    });
    decipher.setAAD(Buffer.from(options.additionalData));
    decipher.setAuthTag(bytes.subarray(bytes.length - 16));
    const body = bytes.subarray(12, bytes.length - 16);
    return new Uint8Array(Buffer.concat([decipher.update(body), decipher.final()]));
  },
};

const T0 = Date.UTC(2026, 8, 20, 0, 0, 0);
const PROJECT_URL = "https://r27probe.invalid";
const ANON_KEY = "r27-test-anon-key-not-a-secret-0000";
const SESSION_KEY = "sb-r27probe-auth-token-v2";
const MASTER_KEY_NAME = "secondB.secureStorage.master.v1";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_USER_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_SESSION_ID = "44444444-4444-4444-8444-444444444444";
const TICK_MS = 30_000;
const CONSENT = {
  acknowledgedDataLoss: true as const,
  action: "discard-unreadable-encrypted-local-data" as const,
};

function createDevice(): Device {
  const asyncStorage = new Map<string, string>();
  const secureStore = new Map<string, string>();
  const events: DiskEvent[] = [];
  let keyListingGate: Promise<void> | null = null;
  let readHold: { key: string; gate: Promise<void>; started: boolean } | null = null;
  return {
    asyncStorage,
    secureStore,
    events,
    holdKeyListing(gate) {
      keyListingGate = gate;
    },
    holdNextRead(key, gate) {
      const hold = { key, gate, started: false };
      readHold = hold;
      return { started: () => hold.started };
    },
    asyncStorageModule: {
      async getItem(key) {
        const hold = readHold;
        if (hold && hold.key === key) {
          readHold = null;
          hold.started = true;
          await hold.gate;
        }
        return asyncStorage.get(key) ?? null;
      },
      async setItem(key, value) {
        events.push({ op: "set", key });
        asyncStorage.set(key, value);
      },
      async removeItem(key) {
        events.push({ op: "remove", key });
        asyncStorage.delete(key);
      },
      async getAllKeys() {
        events.push({ op: "list" });
        if (keyListingGate) await keyListingGate;
        return [...asyncStorage.keys()];
      },
    },
    secureStoreModule: {
      WHEN_UNLOCKED_THIS_DEVICE_ONLY: "WHEN_UNLOCKED_THIS_DEVICE_ONLY",
      async isAvailableAsync() {
        return true;
      },
      async getItemAsync(key) {
        return secureStore.get(key) ?? null;
      },
      async setItemAsync(key, value) {
        events.push({ op: "secure-set", key });
        secureStore.set(key, value);
      },
      async deleteItemAsync(key) {
        events.push({ op: "secure-delete", key });
        secureStore.delete(key);
      },
    },
  };
}

function createAppState(): FakeAppState {
  const handlers: Array<(state: string) => void> = [];
  return {
    module: {
      addEventListener(type, handler) {
        if (type === "change") handlers.push(handler);
        return { remove: () => undefined };
      },
    },
    emit(state) {
      for (const handler of handlers) handler(state);
    },
  };
}

interface Proc {
  appState: FakeAppState;
  client: ClientModule;
  mutation: MutationModule;
  recovery: RecoveryModule;
  proofs: ProofModule;
  outcome: OutcomeModule;
}

/** A cold start: fresh module instances (client singleton, auth runtime,
 *  adapter and its queues, auth-js process locks) over the same device. */
function coldStart(device: Device): Proc {
  jest.resetModules();
  mockDevice = device;
  const appState = createAppState();
  mockAppState = appState;
  return {
    appState,
    client: require("../../supabase/client") as ClientModule,
    mutation: require("../session-mutation") as MutationModule,
    recovery: require("../storage-recovery") as RecoveryModule,
    proofs: require("../recovery-proof-store") as ProofModule,
    outcome: require("../bootstrap-outcome") as OutcomeModule,
  };
}

// ---- network ----------------------------------------------------------------

type Answer = () => Response | Promise<Response>;

const net: {
  log: Array<{ at: number; method: string; route: string }>;
  onRefresh: Answer | null;
  onPassword: Answer | null;
  onLogout: Answer | null;
} = { log: [], onRefresh: null, onPassword: null, onLogout: null };

function resetNet(): void {
  net.log.length = 0;
  net.onRefresh = null;
  net.onPassword = null;
  net.onLogout = null;
}

function answer(handler: Answer | null): Response | Promise<Response> {
  if (!handler) throw new TypeError("Network request failed (offline)");
  return handler();
}

async function fakeFetch(
  input: string | URL | { url: string },
  init?: { method?: string },
): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const route = url.replace(/^https:\/\/[^/]+/, "");
  net.log.push({ at: Date.now() - T0, method: init?.method ?? "GET", route });
  if (route.startsWith("/auth/v1/token?grant_type=refresh_token")) return answer(net.onRefresh);
  if (route.startsWith("/auth/v1/token?grant_type=password")) return answer(net.onPassword);
  if (route.startsWith("/auth/v1/logout")) return answer(net.onLogout);
  throw new TypeError(`Network request failed (unexpected ${route})`);
}

function refreshRequests(): number {
  return net.log.filter((entry) => entry.route.startsWith("/auth/v1/token?grant_type=refresh_token"))
    .length;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

/** Unsigned JWT-shaped token. Nothing in the client verifies the signature. */
function fakeJwt(payload: Record<string, unknown>): string {
  return `${base64UrlJson({ alg: "none", typ: "JWT" })}.${base64UrlJson(payload)}.test`;
}

function sessionPayload(options: {
  expiresInSeconds: number;
  refreshToken: string;
  method: "recovery" | "password";
  userId?: string;
  sessionId?: string;
}) {
  const userId = options.userId ?? USER_ID;
  const expiresAt = Math.floor(Date.now() / 1000) + options.expiresInSeconds;
  return {
    access_token: fakeJwt({
      sub: userId,
      session_id: options.sessionId ?? SESSION_ID,
      exp: expiresAt,
      role: "authenticated",
      amr: [{ method: options.method, timestamp: Math.floor(T0 / 1000) }],
    }),
    token_type: "bearer",
    expires_in: options.expiresInSeconds,
    expires_at: expiresAt,
    refresh_token: options.refreshToken,
    user: {
      id: userId,
      aud: "authenticated",
      role: "authenticated",
      email: `${userId}@example.invalid`,
      app_metadata: {},
      user_metadata: {},
      created_at: new Date(T0).toISOString(),
    },
  };
}

// ---- scheduling ---------------------------------------------------------------

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

/** Let promise chains and real body reads run; timers stay frozen. */
async function settle(rounds = 25): Promise<void> {
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

/** Step the retiring client's own 30 s interval until it sends POST /token. */
async function advanceUntilRefreshStarts(maxTicks = 4): Promise<boolean> {
  for (let tick = 0; tick < maxTicks && refreshRequests() === 0; tick += 1) {
    await jest.advanceTimersByTimeAsync(TICK_MS);
    await settle();
  }
  return refreshRequests() > 0;
}

// ---- what the app would publish -----------------------------------------------

interface BootView {
  outcome: string;
  /** IntroGate's answer: the recovery lock, ordinary routes, or signed out. */
  route: "recovery lock" | "ordinary routes" | "signed out" | "fail-closed sign-out";
  userId: string | null;
  refreshToken: string | null;
  amr: string | null;
}

/** The provider bootstrap's three reads (session, proof, pending marker), its
 *  fail-closed branch and the real classifyBootstrapOutcome, then the route
 *  IntroGate picks: a proof in force keeps /reset-password, a resolved owner
 *  without one gets ordinary routes. AuthContext itself is a React provider
 *  and is not rendered here. */
async function bootView(proc: Proc, client: SupabaseClient): Promise<BootView> {
  const [sessionResult, proof, pending] = await Promise.all([
    client.auth.getSession(),
    proc.proofs.loadRecoveryProof(),
    proc.proofs.loadRecoveryPending(),
  ]);
  const session = sessionResult.data.session;
  const sessionKnown = !sessionResult.error;
  const matches = Boolean(proof && proc.proofs.recoveryProofMatchesSession(proof, session));
  const proofInForce = proof && (!sessionKnown || matches) ? proof : null;
  const pendingOnDisk = pending !== null;
  const view = {
    refreshToken: session?.refresh_token ?? null,
    amr: session
      ? (JSON.parse(Buffer.from(session.access_token.split(".")[1], "base64url").toString()) as {
          amr: Array<{ method: string }>;
        }).amr[0].method
      : null,
  };
  const markerMismatch = Boolean(sessionKnown && proof && session && !matches);
  if ((markerMismatch || (pendingOnDisk && sessionKnown && session)) && !proofInForce) {
    return { outcome: "fail-closed", route: "fail-closed sign-out", userId: null, ...view };
  }
  const outcome = proc.outcome.classifyBootstrapOutcome({
    sessionKnown,
    hasProof: Boolean(proofInForce),
    proofMatchesSession: !proofInForce || Boolean(session && matches),
    recoveryPendingOnDisk: pendingOnDisk,
    markersReadable: true,
  });
  const userId = outcome.kind === "resolve" ? session?.user.id ?? null : null;
  const route = proofInForce ? "recovery lock" : userId ? "ordinary routes" : "signed out";
  return { outcome: outcome.kind, route, userId, ...view };
}

async function seedRecoverySession(proc: Proc, expiresInSeconds: number): Promise<void> {
  const runtime = proc.mutation.getAuthStorageRuntime();
  await runtime.ready();
  const session = sessionPayload({ expiresInSeconds, refreshToken: "rt-old", method: "recovery" });
  await runtime.storage?.setItem(runtime.storageKey, JSON.stringify(session));
  const identity = proc.proofs.recoverySessionIdentity(session);
  if (!identity) throw new Error("seeded session has no recovery identity");
  await proc.proofs.persistRecoveryProof(proc.proofs.createRecoveryProof(identity));
}

/** Launch 1 consumed a recovery link: session B and its proof are on disk.
 *  Launch N ends at the gate: its local fail-closed sign-out fails offline and
 *  leaves the readable session in place (the #1835 escalation's precondition). */
async function launchToGate(device: Device): Promise<{
  proc: Proc;
  retiring: SupabaseClient;
  beforeGate: BootView;
  signOutError: string | null;
  retiringEvents: string[];
}> {
  const seed = coldStart(device);
  await seedRecoverySession(seed, 150);

  const proc = coldStart(device);
  const retiring = proc.client.getSupabaseClient();
  const retiringEvents: string[] = [];
  retiring.auth.onAuthStateChange((event) => {
    retiringEvents.push(event);
  });
  await jest.advanceTimersByTimeAsync(1);
  await settle();
  const beforeGate = await bootView(proc, retiring);

  const runtime = proc.mutation.getAuthStorageRuntime();
  const expected = await proc.mutation.captureAuthSessionExpectation(retiring.auth, runtime);
  let signOutError: string | null = null;
  try {
    await proc.mutation.signOutExpectedSession(retiring.auth, runtime, expected, "local");
  } catch (error) {
    signOutError = error instanceof Error ? error.name : String(error);
  }
  return { proc, retiring, beforeGate, signOutError, retiringEvents };
}

async function relaunchView(device: Device): Promise<BootView> {
  const proc = coldStart(device);
  const client = proc.client.getSupabaseClient();
  await jest.advanceTimersByTimeAsync(1);
  await settle();
  const view = await bootView(proc, client);
  await proc.client.resetSupabaseClient();
  return view;
}

const SIGNED_OUT = { outcome: "resolve", route: "signed out", userId: null, refreshToken: null };

const saved: {
  fetch?: typeof globalThis.fetch;
  navigator?: PropertyDescriptor;
  url?: string;
  key?: string;
} = {};

beforeAll(() => {
  saved.fetch = globalThis.fetch;
  saved.navigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  saved.url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  saved.key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  process.env.EXPO_PUBLIC_SUPABASE_URL = PROJECT_URL;
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = ANON_KEY;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    writable: true,
    value: { product: "ReactNative" },
  });
  globalThis.fetch = fakeFetch as unknown as typeof globalThis.fetch;
});

afterAll(() => {
  globalThis.fetch = saved.fetch as typeof globalThis.fetch;
  if (saved.navigator) Object.defineProperty(globalThis, "navigator", saved.navigator);
  else Reflect.deleteProperty(globalThis, "navigator");
  if (saved.url === undefined) delete process.env.EXPO_PUBLIC_SUPABASE_URL;
  else process.env.EXPO_PUBLIC_SUPABASE_URL = saved.url;
  if (saved.key === undefined) delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  else process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = saved.key;
  mockDevice = null;
  mockAppState = null;
});

beforeEach(() => {
  resetNet();
  // auth-js reports each failed refresh attempt through console.error.
  jest.spyOn(console, "error").mockImplementation(() => undefined);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  jest.useFakeTimers({
    now: T0,
    doNotFake: ["nextTick", "setImmediate", "clearImmediate", "queueMicrotask", "hrtime", "performance"],
  });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("the auth runtime a consented reset retires", () => {
  test("stops reading and writing the storage its client still holds, but keeps its locks", async () => {
    const device = createDevice();
    const proc = coldStart(device);
    const retired = proc.mutation.getAuthStorageRuntime();
    const storage = retired.storage;
    if (!storage) throw new Error("native runtime without storage");
    await storage.setItem(SESSION_KEY, "kept");

    proc.mutation.resetAuthStorageRuntime();
    const fresh = proc.mutation.getAuthStorageRuntime();
    expect(fresh).not.toBe(retired);

    // The retired client reads nothing, and its late writes and removes land nowhere.
    await expect(storage.getItem(SESSION_KEY)).resolves.toBeNull();
    await storage.setItem(SESSION_KEY, "late write");
    await storage.removeItem(SESSION_KEY);
    await expect(fresh.storage?.getItem(SESSION_KEY)).resolves.toBe("kept");

    // S stays shared, so the retired client's lock still orders the fresh one.
    const held = deferred<void>();
    const retiredHold = retired.sdkLock(`lock:${SESSION_KEY}`, -1, () => held.promise);
    await settle();
    const freshTurn = fresh.sdkLock(`lock:${SESSION_KEY}`, -1, async () => "fresh");
    await settle();
    expect(await isPending(freshTurn)).toBe(true);
    held.resolve();
    await retiredHold;
    await expect(freshTurn).resolves.toBe("fresh");
  });
});

describe("a refresh the retiring client started before consent (R27)", () => {
  async function straddle(answerBeforeConsent: boolean) {
    const device = createDevice();
    const gate = await launchToGate(device);
    const { proc, retiring } = gate;
    const sessionOnDiskAtGate = device.asyncStorage.has(SESSION_KEY);

    // The network is back. The retiring client's own interval reaches the
    // refresh threshold and sends POST /token; the answer is held in flight.
    const answerRefresh = deferred<Response>();
    net.onRefresh = () => answerRefresh.promise;
    const refreshStartedBeforeConsent = await advanceUntilRefreshStarts();
    const refreshed = sessionPayload({ expiresInSeconds: 3600, refreshToken: "rt-new", method: "recovery" });
    if (answerBeforeConsent) {
      answerRefresh.resolve(jsonResponse(refreshed));
      await settle();
    }
    const sessionOnDiskBeforeConsent = device.asyncStorage.has(SESSION_KEY);

    const attempt = await proc.recovery.attemptEncryptedNativeStorageRecovery(CONSENT);
    const fresh = proc.client.getSupabaseClient();
    const boot = bootView(proc, fresh);
    await settle();
    const freshBootWaitedForRetiringRefresh = await isPending(boot);
    if (!answerBeforeConsent) {
      answerRefresh.resolve(jsonResponse(refreshed));
      await settle();
    }
    const freshBoot = await boot;
    const sessionOnDiskAfter = device.asyncStorage.has(SESSION_KEY);
    await proc.client.resetSupabaseClient();
    const relaunch = await relaunchView(device);
    return {
      ...gate,
      sessionOnDiskAtGate,
      refreshStartedBeforeConsent,
      sessionOnDiskBeforeConsent,
      attempt,
      freshIsNewClient: fresh !== retiring,
      freshBootWaitedForRetiringRefresh,
      freshBoot,
      sessionOnDiskAfter,
      relaunch,
    };
  }

  test("A: answered after the wipe, it is not published as an ordinary session", async () => {
    const run = await straddle(false);

    // The path under test really ran: a recovery-locked session survived an
    // offline fail-closed sign-out, the retiring client refreshed it across
    // consent, and the fresh boot had to wait for that refresh.
    expect(run.beforeGate).toMatchObject({ route: "recovery lock", amr: "recovery" });
    expect(run.signOutError).toBe("AuthRetryableFetchError");
    expect(run.sessionOnDiskAtGate).toBe(true);
    expect(run.refreshStartedBeforeConsent).toBe(true);
    expect(run.attempt).toBe("recovered");
    expect(run.freshIsNewClient).toBe(true);
    expect(run.freshBootWaitedForRetiringRefresh).toBe(true);
    expect(run.retiringEvents).toContain("TOKEN_REFRESHED");

    expect(run.freshBoot).toMatchObject(SIGNED_OUT);
    expect(run.sessionOnDiskAfter).toBe(false);
    expect(run.relaunch).toMatchObject(SIGNED_OUT);
  });

  test("C0 control: answered before consent, the wipe removes it", async () => {
    const run = await straddle(true);

    expect(run.refreshStartedBeforeConsent).toBe(true);
    expect(run.sessionOnDiskBeforeConsent).toBe(true);
    expect(run.attempt).toBe("recovered");
    expect(run.freshBootWaitedForRetiringRefresh).toBe(false);
    expect(run.freshBoot).toMatchObject(SIGNED_OUT);
    expect(run.sessionOnDiskAfter).toBe(false);
    expect(run.relaunch).toMatchObject(SIGNED_OUT);
  });

  test("A2: a refresh held in auth-js backoff across consent is not published either", async () => {
    const device = createDevice();
    const { proc } = await launchToGate(device);

    let networkUp = false;
    let attempts = 0;
    let attemptsAtSuccess = 0;
    net.onRefresh = () => {
      attempts += 1;
      if (!networkUp) throw new TypeError("Network request failed (flaky)");
      attemptsAtSuccess = attempts;
      return jsonResponse(
        sessionPayload({ expiresInSeconds: 3600, refreshToken: "rt-new", method: "recovery" }),
      );
    };
    expect(await advanceUntilRefreshStarts()).toBe(true);
    await jest.advanceTimersByTimeAsync(3_000);
    await settle();
    const attemptsBeforeConsent = attempts;

    const attempt = await proc.recovery.attemptEncryptedNativeStorageRecovery(CONSENT);
    const boot = bootView(proc, proc.client.getSupabaseClient());
    // Past the provider's 8 s bootstrap bound: still offline, still retrying.
    await jest.advanceTimersByTimeAsync(9_000);
    await settle();
    const freshBootStillWaiting = await isPending(boot);
    const attemptsAfterConsentWhileOffline = attempts - attemptsBeforeConsent;

    networkUp = true;
    await jest.advanceTimersByTimeAsync(15_000);
    await settle();
    const freshBoot = await boot;
    await proc.client.resetSupabaseClient();

    expect(attemptsBeforeConsent).toBeGreaterThanOrEqual(2);
    expect(attempt).toBe("recovered");
    expect(freshBootStillWaiting).toBe(true);
    expect(attemptsAfterConsentWhileOffline).toBeGreaterThanOrEqual(1);
    expect(attemptsAtSuccess).toBeGreaterThan(attemptsBeforeConsent);

    expect(freshBoot).toMatchObject(SIGNED_OUT);
    expect(device.asyncStorage.has(SESSION_KEY)).toBe(false);
    expect(await relaunchView(device)).toMatchObject(SIGNED_OUT);
  });

  test("A3: a save already under way when the wipe is queued cannot queue its session behind it", async () => {
    // auth-js saves in two writes: the PKCE verifier is removed, then the
    // session is set. Here the first write is in the adapter when consent
    // queues the wipe, so the wipe waits for it, and the session write comes
    // while the wipe runs, before the client is reset. A fence raised only by
    // resetSupabaseClient, or once the wipe is done, lets that write queue
    // behind the wipe and land after it. The fence goes up with the wipe.
    const device = createDevice();
    const { proc, retiringEvents } = await launchToGate(device);
    const retiringStorage = proc.mutation.getAuthStorageRuntime().storage;
    if (!retiringStorage) throw new Error("native runtime without storage");
    const retiringSet = jest.spyOn(retiringStorage, "setItem");
    const sessionWrites = () =>
      retiringSet.mock.calls.filter(([key]) => key === SESSION_KEY).length;
    const answerRefresh = deferred<Response>();
    net.onRefresh = () => answerRefresh.promise;
    expect(await advanceUntilRefreshStarts()).toBe(true);

    const releaseSave = deferred<void>();
    const verifierRemove = device.holdNextRead(`${SESSION_KEY}-code-verifier`, releaseSave.promise);
    answerRefresh.resolve(
      jsonResponse(sessionPayload({ expiresInSeconds: 3600, refreshToken: "rt-new", method: "recovery" })),
    );
    await settle();
    const saveUnderWayBeforeConsent = verifierRemove.started();

    const releaseWipe = deferred<void>();
    device.holdKeyListing(releaseWipe.promise);
    device.events.length = 0;
    const attemptPromise = proc.recovery.attemptEncryptedNativeStorageRecovery(CONSENT);
    await settle();
    const wipeWaitedForTheSave = !device.events.some((event) => event.op === "list");

    releaseSave.resolve();
    await settle();
    const sessionWrittenWhileWipeRan =
      sessionWrites() === 1
      && device.events.some((event) => event.op === "list")
      && (await isPending(attemptPromise));

    device.holdKeyListing(null);
    releaseWipe.resolve();
    const attempt = await attemptPromise;
    const freshBoot = await bootView(proc, proc.client.getSupabaseClient());
    await proc.client.resetSupabaseClient();

    expect(saveUnderWayBeforeConsent).toBe(true);
    expect(wipeWaitedForTheSave).toBe(true);
    expect(sessionWrittenWhileWipeRan).toBe(true);
    expect(attempt).toBe("recovered");
    expect(retiringEvents).toContain("TOKEN_REFRESHED");

    expect(freshBoot).toMatchObject(SIGNED_OUT);
    expect(device.asyncStorage.has(SESSION_KEY)).toBe(false);
    expect(await relaunchView(device)).toMatchObject(SIGNED_OUT);
  });
});

describe("controls the fence must not change (R27 C1, C2, D, E)", () => {
  test("C1: a refresh the retiring client starts after the wipe is queued finds no session", async () => {
    const device = createDevice();
    const seed = coldStart(device);
    await seedRecoverySession(seed, 150);
    const proc = coldStart(device);
    const retiring = proc.client.getSupabaseClient();
    await jest.advanceTimersByTimeAsync(1);
    await settle();

    net.onRefresh = () =>
      jsonResponse(sessionPayload({ expiresInSeconds: 3600, refreshToken: "rt-new", method: "recovery" }));
    const releaseWipe = deferred<void>();
    device.holdKeyListing(releaseWipe.promise);
    const attemptPromise = proc.recovery.attemptEncryptedNativeStorageRecovery(CONSENT);
    await settle();
    const forced = retiring.auth.refreshSession();
    await settle();
    device.holdKeyListing(null);
    releaseWipe.resolve();
    const forcedResult = await forced;
    const attempt = await attemptPromise;
    const freshBoot = await bootView(proc, proc.client.getSupabaseClient());
    await proc.client.resetSupabaseClient();

    expect(forcedResult.error?.name).toBe("AuthSessionMissingError");
    expect(refreshRequests()).toBe(0);
    expect(attempt).toBe("recovered");
    expect(freshBoot).toMatchObject(SIGNED_OUT);
    expect(await relaunchView(device)).toMatchObject(SIGNED_OUT);
  });

  test("C2: at the key-loss entry nothing is readable, and the fresh runtime saves again", async () => {
    const device = createDevice();
    const seed = coldStart(device);
    await seedRecoverySession(seed, 150);
    device.secureStore.delete(MASTER_KEY_NAME);

    const proc = coldStart(device);
    // The storage the retiring client would hold. A Supabase client built on it
    // cannot even initialize (supabase-js's own auth subscription then rejects
    // unobserved, which jest would report against this test), so read through
    // the runtime directly: the same object, the same answer.
    const retiring = proc.mutation.getAuthStorageRuntime();
    const readError = await Promise.resolve(retiring.storage?.getItem(retiring.storageKey)).then(
      () => null,
      (error: unknown) => (error instanceof Error ? error.message : String(error)),
    );

    const attempt = await proc.recovery.attemptEncryptedNativeStorageRecovery(CONSENT);
    const fresh = proc.client.getSupabaseClient();
    const freshBoot = await bootView(proc, fresh);

    // After the reset the fresh runtime is not fenced: a new sign-in persists.
    net.onPassword = () =>
      jsonResponse(
        sessionPayload({
          expiresInSeconds: 3600,
          refreshToken: "rt-after-reset",
          method: "password",
          userId: OTHER_USER_ID,
          sessionId: OTHER_SESSION_ID,
        }),
      );
    const signIn = await proc.mutation.runAuthSessionMutation(() =>
      proc.mutation.getAuthStorageRuntime().runSdkUnlockedWriter(() =>
        fresh.auth.signInWithPassword({ email: "other@example.invalid", password: "x" }),
      ),
    );
    await proc.client.resetSupabaseClient();

    expect(readError).toBe("secure_storage_recovery_required");
    expect(refreshRequests()).toBe(0);
    expect(attempt).toBe("recovered");
    expect(freshBoot).toMatchObject(SIGNED_OUT);
    expect(signIn.error).toBeNull();
    expect(await relaunchView(device)).toMatchObject({
      route: "ordinary routes",
      userId: OTHER_USER_ID,
      refreshToken: "rt-after-reset",
    });
  });

  test("D: another account signing in on the fresh client ends as that account, and its sign-out sticks", async () => {
    const device = createDevice();
    const { proc } = await launchToGate(device);
    const answerRefresh = deferred<Response>();
    net.onRefresh = () => answerRefresh.promise;
    expect(await advanceUntilRefreshStarts()).toBe(true);

    const attempt = await proc.recovery.attemptEncryptedNativeStorageRecovery(CONSENT);
    const fresh = proc.client.getSupabaseClient();
    const runtime = proc.mutation.getAuthStorageRuntime();
    net.onPassword = () =>
      jsonResponse(
        sessionPayload({
          expiresInSeconds: 3600,
          refreshToken: "rt-other",
          method: "password",
          userId: OTHER_USER_ID,
          sessionId: OTHER_SESSION_ID,
        }),
      );
    // signInWithEmail's order: M, then S, then the SDK writer.
    const signIn = proc.mutation.runAuthSessionMutation(() =>
      runtime.runSdkUnlockedWriter(() =>
        fresh.auth.signInWithPassword({ email: "other@example.invalid", password: "x" }),
      ),
    );
    await settle();
    const signInWaitedForRetiringRefresh = await isPending(signIn);

    answerRefresh.resolve(
      jsonResponse(sessionPayload({ expiresInSeconds: 3600, refreshToken: "rt-new", method: "recovery" })),
    );
    await settle();
    const signInResult = await signIn;
    const afterSignIn = await bootView(proc, fresh);
    const relaunchAfterSignIn = await relaunchView(device);

    net.onLogout = () => new Response(null, { status: 204 });
    const expected = await proc.mutation.captureAuthSessionExpectation(fresh.auth, runtime);
    await proc.mutation.signOutExpectedSession(fresh.auth, runtime, expected, "local");
    await jest.advanceTimersByTimeAsync(3 * TICK_MS);
    await settle();
    const afterSignOut = await bootView(proc, fresh);
    await proc.client.resetSupabaseClient();

    expect(attempt).toBe("recovered");
    expect(signInWaitedForRetiringRefresh).toBe(true);
    expect(signInResult.data.user?.id).toBe(OTHER_USER_ID);
    expect(afterSignIn).toMatchObject({ userId: OTHER_USER_ID, refreshToken: "rt-other" });
    expect(relaunchAfterSignIn).toMatchObject({ userId: OTHER_USER_ID, refreshToken: "rt-other" });
    expect(afterSignOut).toMatchObject(SIGNED_OUT);
    expect(await relaunchView(device)).toMatchObject(SIGNED_OUT);
  });

  test("E: an AppState re-arm reaches the retired client only inside the reset's own turn", async () => {
    const run = async (order: "same-turn" | "separate-tasks" | "reset-first") => {
      const proc = coldStart(createDevice());
      const retiring = proc.client.getSupabaseClient();
      await jest.advanceTimersByTimeAsync(1);
      await settle();
      if (order === "same-turn") {
        proc.appState.emit("active");
        await proc.client.resetSupabaseClient();
      } else if (order === "separate-tasks") {
        proc.appState.emit("active");
        await settle();
        await proc.client.resetSupabaseClient();
      } else {
        await proc.client.resetSupabaseClient();
        proc.appState.emit("active");
      }
      await settle();
      const ticking =
        (retiring.auth as unknown as { autoRefreshTicker: unknown }).autoRefreshTicker !== null;
      if (ticking) await retiring.auth.stopAutoRefresh();
      return ticking;
    };

    expect(await run("same-turn")).toBe(true);
    expect(await run("separate-tasks")).toBe(false);
    expect(await run("reset-first")).toBe(false);
  });
});

// ---- KZ-1840-1 --------------------------------------------------------------------

// Gate finding KZ-1840-1 (2026-09-20). The runtime's v1 -> v2 migration writes
// the adapter directly, not through the fenced storage. On a device whose v1
// session was never moved, the first migration can fail on an unreadable master
// key (the gate goes up), and the retiring client's next S call retries it once
// the key reads again. A retry that already held the v1 session when consent
// queued the wipe wrote it to v2 behind the wipe, and the fresh client restored it.

/** An older build left its session under the v1 key; this build has not moved
 *  it yet (no migration marker). */
async function seedLegacySession(device: Device): Promise<void> {
  const seed = coldStart(device);
  const storage = require("../../storage/encrypted-native-storage") as StorageModule;
  await storage.migrateLegacyNativePlaintextAtStartup();
  await storage.getEncryptedNativeStorage().setItem(
    seed.mutation.authStorageKeysForUrl(PROJECT_URL).v1Primary,
    JSON.stringify(sessionPayload({ expiresInSeconds: 3600, refreshToken: "rt-legacy", method: "password" })),
  );
}

/** The launch that raises the gate over it: the first read of the master key
 *  answers null, so the migration fails with secure_storage_recovery_required.
 *  The same key reads again afterwards. */
async function launchWithFailedMigration(device: Device) {
  await seedLegacySession(device);
  const proc = coldStart(device);
  const storage = require("../../storage/encrypted-native-storage") as StorageModule;
  const runtime = proc.mutation.getAuthStorageRuntime();
  const masterKey = device.secureStore.get(MASTER_KEY_NAME);
  if (masterKey === undefined) throw new Error("the seed minted no master key");
  device.secureStore.delete(MASTER_KEY_NAME);
  const firstReadyError = await runtime.ready().then(
    () => null,
    (error: unknown) => (error instanceof Error ? error.message : String(error)),
  );
  device.secureStore.set(MASTER_KEY_NAME, masterKey);
  return {
    proc,
    runtime,
    adapter: storage.getEncryptedNativeStorage(),
    keys: proc.mutation.authStorageKeysForUrl(PROJECT_URL),
    firstReadyError,
  };
}

/** The retiring client's next S call, as its auto-refresh tick makes it: the
 *  lock awaits ready(), which retries the migration, then reads the session. */
function retryThroughSdkLock(
  runtime: ReturnType<MutationModule["getAuthStorageRuntime"]>,
  key: string,
): Promise<string | null> {
  return runtime.sdkLock(`lock:${key}`, -1, async () => (await runtime.storage?.getItem(key)) ?? null);
}

describe("a v1 -> v2 migration the retiring runtime retries across consent (KZ-1840-1)", () => {
  test("a retry that read the v1 session before the wipe does not write it back behind the wipe", async () => {
    const device = createDevice();
    const { proc, runtime, adapter, keys, firstReadyError } = await launchWithFailedMigration(device);
    const adapterReads = jest.spyOn(adapter, "getItem");

    // The retry has the v1 session in hand and is still waiting for its v2 read.
    const releaseRevisedRead = deferred<void>();
    const revisedRead = device.holdNextRead(keys.v2Primary, releaseRevisedRead.promise);
    const retried = retryThroughSdkLock(runtime, keys.v2Primary);
    await settle();
    const legacyReadIndex = adapterReads.mock.calls.findIndex(([key]) => key === keys.v1Primary);
    const legacyRead = adapterReads.mock.results[legacyReadIndex]?.value as
      | Promise<string | null>
      | undefined;
    const legacySessionInHand =
      legacyRead !== undefined && !(await isPending(legacyRead)) ? await legacyRead : null;
    const retryWaitingOnRevisedRead = revisedRead.started() && (await isPending(retried));

    // Consent queues the wipe and fences the runtime in one turn; only then
    // does the v2 read answer.
    device.events.length = 0;
    const attemptPromise = proc.recovery.attemptEncryptedNativeStorageRecovery(CONSENT);
    releaseRevisedRead.resolve();
    const attempt = await attemptPromise;
    const retiredAnswer = await retried;
    const sessionWritesAfterConsent = device.events.filter(
      (event) => event.op === "set" && event.key === keys.v2Primary,
    ).length;
    const freshBoot = await bootView(proc, proc.client.getSupabaseClient());
    const sessionOnDiskAfter = device.asyncStorage.has(keys.v2Primary);
    await proc.client.resetSupabaseClient();
    const relaunch = await relaunchView(device);

    // The path under test really ran: the first migration failed on the key,
    // the retry held the v1 session while its v2 read waited, and the wipe ran.
    expect(firstReadyError).toBe("secure_storage_recovery_required");
    expect(JSON.parse(legacySessionInHand ?? "null")).toMatchObject({ refresh_token: "rt-legacy" });
    expect(retryWaitingOnRevisedRead).toBe(true);
    expect(attempt).toBe("recovered");
    expect(device.events).toContainEqual({ op: "secure-delete", key: MASTER_KEY_NAME });
    expect(retiredAnswer).toBeNull();

    expect({ freshBoot, sessionOnDiskAfter, relaunch, sessionWritesAfterConsent }).toMatchObject({
      freshBoot: SIGNED_OUT,
      sessionOnDiskAfter: false,
      relaunch: SIGNED_OUT,
      sessionWritesAfterConsent: 0,
    });
  });

  test("control: a retry that finished before consent is wiped with the rest", async () => {
    const device = createDevice();
    const { proc, runtime, keys, firstReadyError } = await launchWithFailedMigration(device);
    const migrated = await retryThroughSdkLock(runtime, keys.v2Primary);
    const attempt = await proc.recovery.attemptEncryptedNativeStorageRecovery(CONSENT);
    const freshBoot = await bootView(proc, proc.client.getSupabaseClient());
    const sessionOnDiskAfter = device.asyncStorage.has(keys.v2Primary);
    await proc.client.resetSupabaseClient();

    expect(firstReadyError).toBe("secure_storage_recovery_required");
    expect(JSON.parse(migrated ?? "null")).toMatchObject({ refresh_token: "rt-legacy" });
    expect(attempt).toBe("recovered");
    expect(freshBoot).toMatchObject(SIGNED_OUT);
    expect(sessionOnDiskAfter).toBe(false);
    expect(await relaunchView(device)).toMatchObject(SIGNED_OUT);
  });

  test.each([
    ["on an ordinary cold start", false],
    ["when the retry meets no consent", true],
  ] as const)(
    "control: without a wipe the v1 session still moves to v2 and is published %s",
    async (_case, keyLostOnFirstRead) => {
      const device = createDevice();
      let proc: Proc;
      let firstReadyError: string | null = null;
      if (keyLostOnFirstRead) {
        ({ proc, firstReadyError } = await launchWithFailedMigration(device));
      } else {
        await seedLegacySession(device);
        proc = coldStart(device);
      }
      // The client's own first S call runs, or retries, the migration.
      const client = proc.client.getSupabaseClient();
      await jest.advanceTimersByTimeAsync(1);
      await settle();
      const boot = await bootView(proc, client);
      const keys = proc.mutation.authStorageKeysForUrl(PROJECT_URL);
      const disk = {
        legacy: device.asyncStorage.has(keys.v1Primary),
        revised: device.asyncStorage.has(keys.v2Primary),
        marker: device.asyncStorage.has(keys.migrationTombstone),
      };
      await proc.client.resetSupabaseClient();

      const published = { route: "ordinary routes", userId: USER_ID, refreshToken: "rt-legacy" };
      expect(firstReadyError).toBe(keyLostOnFirstRead ? "secure_storage_recovery_required" : null);
      expect(boot).toMatchObject(published);
      expect(disk).toEqual({ legacy: false, revised: true, marker: true });
      expect(await relaunchView(device)).toMatchObject(published);
    },
  );
});
