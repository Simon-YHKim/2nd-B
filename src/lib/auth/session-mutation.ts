import {
  processLock,
  type LockFunc,
  type SupportedStorage,
} from "@supabase/auth-js";
import type { GoTrueClient } from "@supabase/auth-js";
import { getEnv } from "../env";
import {
  getEncryptedNativeStorage,
  migrateLegacyNativePlaintextAtStartup,
} from "../storage/encrypted-native-storage";
import {
  LEGACY_RECOVERY_PENDING_KEY,
  LEGACY_RECOVERY_PROOF_KEY,
  RECOVERY_PENDING_KEY,
  RECOVERY_PROOF_KEY,
  sessionIdFromAccessToken,
} from "./auth-storage-schema";

const AUTH_STORAGE_REVISION = "v2";
const MIGRATION_VALUE = "1";
const AUTH_STORAGE_SUFFIXES = ["", "-code-verifier", "-user"] as const;

type MaybePromise<T> = T | Promise<T>;
type AuthSessionClient = Pick<GoTrueClient, "getSession" | "signOut">;
type AuthSessionRefreshClient = Pick<GoTrueClient, "getSession" | "refreshSession">;
type BrowserLockLike = { readonly name: string; readonly mode: string };
type BrowserLockRequest = <T>(
  name: string,
  options: { mode: "exclusive" },
  callback: (lock: BrowserLockLike | null) => Promise<T>,
) => Promise<T>;

export interface AuthMutationContext {
  /** True only while a real cross-tab Web Lock (or native process lock) is held. */
  readonly destructiveSafe: boolean;
}

export interface AuthStorageKeys {
  v1Primary: string;
  v2Primary: string;
  migrationTombstone: string;
  mutationLock: string;
}

export interface AuthSessionExpectation {
  readonly userId: string | null;
  readonly sessionId: string | null;
  /** Memory-only fallback for legacy JWTs without session_id. Never persist or log. */
  readonly accessToken: string | null;
}

export class AuthSessionOwnerChangedError extends Error {
  constructor() {
    super("The active auth session changed before the requested operation.");
    this.name = "AuthSessionOwnerChangedError";
  }
}

export class AuthLocalClearUnavailableError extends Error {
  constructor() {
    super("Secure local auth clearing is unavailable in this browser.");
    this.name = "AuthLocalClearUnavailableError";
  }
}

export interface AuthStorageRuntime {
  readonly storageKey: string;
  readonly storage: SupportedStorage | undefined;
  readonly sdkLock: LockFunc;
  ready(): Promise<void>;
  /** Fence this runtime's storage for good: reads answer null, writes and
   *  removes are dropped. Its locks keep working, so an SDK call that already
   *  holds S still finishes and still orders the fresh runtime behind it. */
  retire(): void;
  /** Acquire S around a 2.106.1 SDK writer that does not acquire S itself. */
  runSdkUnlockedWriter<T>(fn: () => MaybePromise<T>): Promise<T>;
  runMutation<T>(
    fn: (context: AuthMutationContext) => MaybePromise<T>,
    options?: { requireCrossTab?: boolean },
  ): Promise<T>;
}

interface CreateAuthStorageRuntimeOptions {
  url: string;
  storage: SupportedStorage | undefined;
  web: boolean;
  /** Native-only whole-allowlist plaintext scan. It must settle before the
   * auth v2 M -> S barrier can inspect or move any auth/recovery key. */
  startupMigration?: () => Promise<unknown>;
  navigatorLocksAvailable?: boolean;
  navigatorLockRequest?: BrowserLockRequest;
}

function projectRefFromUrl(url: string): string {
  return new URL(url).hostname.split(".")[0] || "unknown";
}

export function authStorageKeysForUrl(url: string): AuthStorageKeys {
  const projectRef = projectRefFromUrl(url);
  const v1Primary = `sb-${projectRef}-auth-token`;
  const v2Primary = `${v1Primary}-${AUTH_STORAGE_REVISION}`;
  return {
    v1Primary,
    v2Primary,
    // This marker is intentionally outside auth-js's primary/verifier/user
    // bundle. Public signOut removes that bundle, never this one-time fence.
    migrationTombstone: `${v2Primary}-migration-from-v1-complete`,
    mutationLock: `secondbrain:auth-mutation:${projectRef}:${AUTH_STORAGE_REVISION}`,
  };
}

function browserLockRequest(): BrowserLockRequest | null {
  const manager = (globalThis.navigator as { locks?: { request?: unknown } } | undefined)?.locks;
  if (!manager || typeof manager.request !== "function") return null;
  return (manager.request as BrowserLockRequest).bind(manager);
}

async function storageGet(storage: SupportedStorage, key: string): Promise<string | null> {
  return await storage.getItem(key);
}

async function storageSet(storage: SupportedStorage, key: string, value: string): Promise<void> {
  await storage.setItem(key, value);
}

async function storageRemove(storage: SupportedStorage, key: string): Promise<void> {
  await storage.removeItem(key);
}

/**
 * Build the v2 auth persistence/mutation boundary.
 *
 * Lock order is M -> S. Migration takes only M. Every SDK lock first awaits the
 * migration barrier before acquiring S, so the gated adapter never introduces
 * an S -> M edge during cold start. Once the durable marker exists, later v1
 * writes from an already-open old web tab are deliberately ignored.
 */
export function createAuthStorageRuntime(
  options: CreateAuthStorageRuntimeOptions,
): AuthStorageRuntime {
  const keys = authStorageKeysForUrl(options.url);
  const lockRequest =
    options.web && options.navigatorLocksAvailable !== false
      ? (options.navigatorLockRequest ?? browserLockRequest())
      : null;
  let readyPromise: Promise<void> | null = null;
  let retired = false;
  let verifiedMutationDepth = 0;

  type GuardedOutcome<T> =
    | { ok: true; value: T }
    | { ok: false; error: unknown };

  const guard = async <T>(fn: () => Promise<T>): Promise<GuardedOutcome<T>> => {
    // processLock mirrors fn rejection into its internal tail promise. Keep the
    // lock callback fulfilled and rethrow only after release, or an expected
    // owner-change rejection can also surface as an unhandled rejection.
    try {
      return { ok: true, value: await fn() };
    } catch (error) {
      return { ok: false, error };
    }
  };

  const unwrap = <T>(outcome: GuardedOutcome<T>): T => {
    if (outcome.ok) return outcome.value;
    throw outcome.error;
  };

  const processExclusive = async <T>(
    name: string,
    fn: (crossTabLockHeld: boolean) => Promise<T>,
  ): Promise<T> => {
    const outcome = await processLock(name, -1, () => guard(() => fn(!options.web)));
    return unwrap(outcome);
  };

  const exclusive = async <T>(
    name: string,
    fn: (crossTabLockHeld: boolean) => Promise<T>,
    requireCrossTab = false,
  ): Promise<T> => {
    if (!lockRequest) {
      if (requireCrossTab && options.web) throw new AuthLocalClearUnavailableError();
      return processExclusive(name, fn);
    }

    let operation: Promise<GuardedOutcome<T>> | null = null;
    let callbackClaimed = false;
    const marker = {};
    try {
      // Match auth-js's zone.js compatibility yield, but use the standard API
      // directly so a non-spec null lock can never run a destructive callback.
      await Promise.resolve();
      const managerResult = await lockRequest(name, { mode: "exclusive" }, async (lock) => {
        if (callbackClaimed) return { marker: null };
        callbackClaimed = true;
        if (!lock || lock.name !== name || lock.mode !== "exclusive") {
          return { marker: null };
        }
        operation = guard(() => fn(true));
        return { marker, outcome: await operation };
      });
      if (
        operation &&
        typeof managerResult === "object" &&
        managerResult !== null &&
        "marker" in managerResult &&
        managerResult.marker === marker &&
        "outcome" in managerResult
      ) {
        return unwrap(managerResult.outcome as GuardedOutcome<T>);
      }
    } catch {
      // If a broken manager throws after invoking the callback, never run the
      // operation a second time. A valid exclusive Lock object was observed.
      if (operation) return unwrap(await operation);
    }

    if (operation) return unwrap(await operation);
    if (requireCrossTab) throw new AuthLocalClearUnavailableError();
    return processExclusive(name, fn);
  };

  const migrate = async (): Promise<void> => {
    const underlying = options.storage;
    if (!underlying) return;
    if ((await storageGet(underlying, keys.migrationTombstone)) === MIGRATION_VALUE) return;

    // There is no transaction API on Storage/AsyncStorage. M serializes every
    // v2 runtime, while the "copy missing -> remove v1 -> marker last" order is
    // restart-safe. A live v1 tab cannot be frozen; only writes after the marker
    // are guaranteed to be ignored, which is the explicit cross-version limit.
    const migrationPairs: ReadonlyArray<readonly [string, string]> = [
      ...AUTH_STORAGE_SUFFIXES.map(
        (suffix) => [`${keys.v1Primary}${suffix}`, `${keys.v2Primary}${suffix}`] as const,
      ),
      [LEGACY_RECOVERY_PROOF_KEY, RECOVERY_PROOF_KEY],
      [LEGACY_RECOVERY_PENDING_KEY, RECOVERY_PENDING_KEY],
    ];
    for (const [legacyKey, revisedKey] of migrationPairs) {
      const [legacyValue, revisedValue] = await Promise.all([
        storageGet(underlying, legacyKey),
        storageGet(underlying, revisedKey),
      ]);
      if (legacyValue !== null && revisedValue === null) {
        await storageSet(underlying, revisedKey, legacyValue);
      }
    }
    for (const [legacyKey] of migrationPairs) {
      await storageRemove(underlying, legacyKey);
    }
    await storageSet(underlying, keys.migrationTombstone, MIGRATION_VALUE);
  };

  const ready = (): Promise<void> => {
    if (!readyPromise) {
      const attempt = Promise.resolve()
        .then(() => options.startupMigration?.())
        .then(() => exclusive(keys.mutationLock, () => migrate()));
      readyPromise = attempt.catch((error) => {
        readyPromise = null;
        throw error;
      });
    }
    return readyPromise;
  };

  // A consented storage reset retires this runtime in the same turn it queues
  // the wipe, and the retiring client may still be mid-refresh (R27,
  // 2026-09-20). No await separates a check from its adapter call, so a call
  // that passes the check was queued in an earlier turn, ahead of the wipe,
  // which waits for it and removes it. Every later call is dropped.
  const gatedStorage: SupportedStorage | undefined = options.storage
    ? {
        async getItem(key: string) {
          await ready();
          if (retired) return null;
          return storageGet(options.storage as SupportedStorage, key);
        },
        async setItem(key: string, value: string) {
          await ready();
          if (retired) return;
          await storageSet(options.storage as SupportedStorage, key, value);
        },
        async removeItem(key: string) {
          await ready();
          if (retired) return;
          await storageRemove(options.storage as SupportedStorage, key);
        },
      }
    : undefined;

  const sdkLock: LockFunc = async (name, _requestedTimeout, fn) => {
    // This await is before S. Adapter I/O inside fn sees an already-resolved
    // barrier and therefore never tries to acquire M while S is held.
    await ready();
    return exclusive(name, () => fn(), options.web && verifiedMutationDepth > 0);
  };

  return {
    storageKey: keys.v2Primary,
    storage: gatedStorage,
    sdkLock,
    ready,
    retire() {
      retired = true;
    },
    async runSdkUnlockedWriter<T>(fn: () => MaybePromise<T>): Promise<T> {
      return sdkLock(`lock:${keys.v2Primary}`, -1, async () => await fn());
    },
    async runMutation<T>(
      fn: (context: AuthMutationContext) => MaybePromise<T>,
      mutationOptions: { requireCrossTab?: boolean } = {},
    ): Promise<T> {
      await ready();
      return exclusive(
        keys.mutationLock,
        async (crossTabLockHeld) => {
          const destructiveSafe = crossTabLockHeld || !options.web;
          if (crossTabLockHeld) verifiedMutationDepth += 1;
          try {
            return await fn({ destructiveSafe });
          } finally {
            if (crossTabLockHeld) verifiedMutationDepth -= 1;
          }
        },
        mutationOptions.requireCrossTab,
      );
    },
  };
}

export function resolveAuthStorage(web: boolean): SupportedStorage | undefined {
  if (web) {
    let candidate: Storage | undefined;
    try {
      candidate = (globalThis as unknown as { localStorage?: Storage }).localStorage;
    } catch {
      return undefined;
    }
    if (!candidate) return undefined;
    const probeKey = `secondbrain:auth-storage-probe:${Date.now()}:${Math.random()}`;
    try {
      candidate.setItem(probeKey, probeKey);
      if (candidate.getItem(probeKey) !== probeKey) {
        candidate.removeItem(probeKey);
        return undefined;
      }
      candidate.removeItem(probeKey);
      return candidate;
    } catch {
      try {
        candidate.removeItem(probeKey);
      } catch {
        // Best effort only; the adapter is rejected either way.
      }
      // Storage-denied/private contexts keep ordinary auth usable in memory.
      // Expected destructive clear still requires Web Locks on web.
      return undefined;
    }
  }
  const navigatorLike = globalThis.navigator as { product?: string } | undefined;
  return navigatorLike?.product === "ReactNative"
    ? getEncryptedNativeStorage()
    : undefined;
}

let productionRuntime: AuthStorageRuntime | null = null;

export function getAuthStorageRuntime(): AuthStorageRuntime {
  if (productionRuntime) return productionRuntime;
  const web = typeof document !== "undefined";
  const native = !web
    && (globalThis.navigator as { product?: string } | undefined)?.product === "ReactNative";
  productionRuntime = createAuthStorageRuntime({
    url: getEnv().EXPO_PUBLIC_SUPABASE_URL,
    storage: resolveAuthStorage(web),
    web,
    ...(native ? { startupMigration: migrateLegacyNativePlaintextAtStartup } : {}),
  });
  return productionRuntime;
}

/** Fence the production runtime's storage without replacing it. The consented
 * reset calls this in the same turn it queues its wipe, so a refresh the
 * retiring client began before consent cannot save after the wipe. */
export function retireAuthStorageRuntime(): void {
  productionRuntime?.retire();
}

/** Retire the production runtime after an explicitly-consented local recovery.
 * Existing callers may finish only on their already-invalidated client epoch,
 * and only their locks still work: their storage is fenced. Every new caller
 * receives a fresh migration/lock boundary. */
export function resetAuthStorageRuntime(): void {
  productionRuntime?.retire();
  productionRuntime = null;
}

export async function runAuthSessionMutation<T>(
  fn: (context: AuthMutationContext) => MaybePromise<T>,
  options?: { requireCrossTab?: boolean },
): Promise<T> {
  return getAuthStorageRuntime().runMutation(fn, options);
}

export async function captureAuthSessionExpectation(
  client: AuthSessionClient,
  runtime: AuthStorageRuntime = getAuthStorageRuntime(),
): Promise<AuthSessionExpectation> {
  await runtime.ready();
  const { data, error } = await client.getSession();
  if (error) throw error;
  const current = data.session;
  return {
    userId: current?.user.id ?? null,
    sessionId: sessionIdFromAccessToken(current?.access_token),
    accessToken: current?.access_token ?? null,
  };
}

function expectationMatches(
  expected: AuthSessionExpectation,
  current: Awaited<ReturnType<AuthSessionClient["getSession"]>>["data"]["session"],
): boolean {
  if (expected.userId === null) return current === null;
  if (!current || current.user.id !== expected.userId) return false;
  const currentSessionId = sessionIdFromAccessToken(current.access_token);
  if (expected.sessionId && currentSessionId) return expected.sessionId === currentSessionId;
  return expected.accessToken !== null && expected.accessToken === current.access_token;
}

/** Call only while the caller already owns M. */
export async function assertExpectedSessionInsideMutation(
  client: Pick<GoTrueClient, "getSession">,
  expected: AuthSessionExpectation,
): Promise<void> {
  const { data, error } = await client.getSession();
  if (error) throw error;
  if (!expectationMatches(expected, data.session)) throw new AuthSessionOwnerChangedError();
}

/** Refresh A while the caller already owns M, then prove that token rotation did
 * not change the stable Supabase session. Destructive remote calls deliberately
 * reject legacy JWTs without `session_id`: an access-token equality fallback
 * cannot survive a legitimate refresh and therefore cannot bind the operation. */
export async function refreshExpectedSessionInsideMutation(
  client: AuthSessionRefreshClient,
  expected: AuthSessionExpectation,
): Promise<string> {
  if (expected.userId === null || expected.sessionId === null) {
    throw new AuthSessionOwnerChangedError();
  }
  await assertExpectedSessionInsideMutation(client, expected);
  const { data, error } = await client.refreshSession();
  if (error) throw error;
  const refreshed = data.session;
  if (
    !refreshed?.access_token
    || refreshed.user.id !== expected.userId
    || sessionIdFromAccessToken(refreshed.access_token) !== expected.sessionId
  ) {
    throw new AuthSessionOwnerChangedError();
  }
  await assertExpectedSessionInsideMutation(client, expected);
  return refreshed.access_token;
}

/** Call only while the caller already owns M. */
export async function signOutExpectedSessionInsideMutation(
  client: AuthSessionClient,
  expected: AuthSessionExpectation,
  scope: "global" | "local" = "global",
): Promise<void> {
  const { data, error: sessionError } = await client.getSession();
  if (sessionError) throw sessionError;
  // A refresh/recovery in another tab may already have observed server-side
  // revocation and removed A. No B is present, so it is safe to call public
  // signOut once more to deliver this client's SIGNED_OUT event.
  const alreadyCleared = expected.userId !== null && data.session === null;
  if (!alreadyCleared && !expectationMatches(expected, data.session)) {
    throw new AuthSessionOwnerChangedError();
  }
  const { error } = await client.signOut({ scope });
  if (error) throw error;
}

export async function signOutExpectedSession(
  client: AuthSessionClient,
  runtime: AuthStorageRuntime,
  expected: AuthSessionExpectation,
  scope: "global" | "local" = "global",
): Promise<void> {
  await runtime.runMutation(() => signOutExpectedSessionInsideMutation(client, expected, scope), {
    requireCrossTab: true,
  });
}

export function __resetAuthStorageRuntimeForTests(): void {
  resetAuthStorageRuntime();
}
