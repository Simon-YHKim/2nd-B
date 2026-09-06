import { AuthUnknownError } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ENCRYPTED_STORAGE_RECOVERY_REQUIRED } from "../../storage/encrypted-native-storage";
import {
  attemptEncryptedNativeStorageRecovery,
  isEncryptedStorageRecoveryRequired,
  readAuthSessionOutcome,
} from "../storage-recovery";
import * as authBootstrapRuntime from "../bootstrap-outcome";

const recoverStorage = jest.fn<Promise<unknown>, [unknown]>();
const getClient = jest.fn<unknown, []>();
const resetClient = jest.fn<Promise<void>, []>();
const recoveryDependencies = {
  recover: recoverStorage,
  recreateClient: getClient,
  resetClient,
};

const ROOT = resolve(__dirname, "../../../..");
const AUTH = readFileSync(resolve(ROOT, "src/lib/auth/AuthContext.tsx"), "utf8").replace(
  /\r\n/g,
  "\n",
);

function errorWithCause(message: string, cause: unknown): Error {
  const error = new Error(message);
  Object.defineProperty(error, "cause", { configurable: true, value: cause });
  return error;
}

describe("encrypted auth-storage recovery classification", () => {
  test("recognizes only the exact recovery error through bounded AuthUnknownError wrappers", () => {
    const leaf = new Error(ENCRYPTED_STORAGE_RECOVERY_REQUIRED);
    const nested = errorWithCause("outer-auth-failure", leaf);
    const wrapped = new AuthUnknownError("Auth session missing", nested);

    expect(isEncryptedStorageRecoveryRequired(leaf)).toBe(true);
    expect(isEncryptedStorageRecoveryRequired(wrapped)).toBe(true);

    const tooDeep = Array.from({ length: 20 }).reduce<Error>(
      (cause, _, index) => errorWithCause(`wrapper-${index}`, cause),
      leaf,
    );
    expect(isEncryptedStorageRecoveryRequired(tooDeep)).toBe(false);
  });

  test.each([
    ENCRYPTED_STORAGE_RECOVERY_REQUIRED,
    { message: ENCRYPTED_STORAGE_RECOVERY_REQUIRED },
    { cause: new Error(ENCRYPTED_STORAGE_RECOVERY_REQUIRED) },
    { originalError: new Error(ENCRYPTED_STORAGE_RECOVERY_REQUIRED) },
    new Error("secure_storage_key_unavailable"),
    new Error("Network request failed"),
    new Error(`prefix:${ENCRYPTED_STORAGE_RECOVERY_REQUIRED}`),
    new Error(`${ENCRYPTED_STORAGE_RECOVERY_REQUIRED} `),
    new AuthUnknownError("Network request failed", new Error("fetch failed")),
  ])("does not classify strings, generic objects, transient, network, or mutated errors", (error) => {
    expect(isEncryptedStorageRecoveryRequired(error)).toBe(false);
  });

  test("terminates safely when wrapper causes form a cycle", () => {
    const first = new Error("first");
    const second = errorWithCause("second", first);
    Object.defineProperty(first, "cause", { configurable: true, value: second });

    expect(isEncryptedStorageRecoveryRequired(first)).toBe(false);
  });
});

describe("auth session recovery outcome", () => {
  test.each(["rejected", "resolved-error"] as const)(
    "preserves recovery-required for a %s getSession failure",
    async (kind) => {
      const nested = new AuthUnknownError(
        "Auth session missing",
        new Error(ENCRYPTED_STORAGE_RECOVERY_REQUIRED),
      );
      const getSession = kind === "rejected"
        ? jest.fn().mockRejectedValue(nested)
        : jest.fn().mockResolvedValue({ data: { session: null }, error: nested });

      await expect(readAuthSessionOutcome(getSession, 100)).resolves.toEqual({
        status: "storage-recovery-required",
      });
    },
  );

  test("keeps transient key unavailability non-destructive and unknown", async () => {
    const getSession = jest.fn().mockRejectedValue(new Error("secure_storage_key_unavailable"));

    await expect(readAuthSessionOutcome(getSession, 100)).resolves.toEqual({ status: "unavailable" });
    expect(recoverStorage).not.toHaveBeenCalled();
  });

  test("returns the current user only from a successful session result", async () => {
    const getSession = jest.fn().mockResolvedValue({
      data: { session: { user: { id: "user-123" } } },
      error: null,
    });

    await expect(readAuthSessionOutcome(getSession, 100)).resolves.toEqual({
      status: "ready",
      userId: "user-123",
    });
  });
});

describe("explicit recovery consent", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    recoverStorage.mockResolvedValue({ discardedManagedKeys: 2 });
    resetClient.mockResolvedValue(undefined);
    getClient.mockReturnValue({});
  });

  test.each([
    undefined,
    {},
    { acknowledgedDataLoss: true },
    { acknowledgedDataLoss: false, action: "discard-unreadable-encrypted-local-data" },
    { acknowledgedDataLoss: true, action: "discard-local-data" },
    {
      acknowledgedDataLoss: true,
      action: "discard-unreadable-encrypted-local-data",
      unexpected: true,
    },
  ])("does nothing before the exact two-field consent contract", async (consent) => {
    await expect(attemptEncryptedNativeStorageRecovery(
      consent as never,
      recoveryDependencies,
    )).resolves.toBe("invalid-consent");
    expect(recoverStorage).not.toHaveBeenCalled();
    expect(resetClient).not.toHaveBeenCalled();
    expect(getClient).not.toHaveBeenCalled();
  });

  test("recovers, resets, and eagerly recreates the client in order after exact consent", async () => {
    const consent = {
      acknowledgedDataLoss: true as const,
      action: "discard-unreadable-encrypted-local-data" as const,
    };

    await expect(attemptEncryptedNativeStorageRecovery(consent, recoveryDependencies)).resolves.toBe("recovered");
    expect(recoverStorage).toHaveBeenCalledWith(consent);
    expect(resetClient).toHaveBeenCalledTimes(1);
    expect(getClient).toHaveBeenCalledTimes(1);
    expect(recoverStorage.mock.invocationCallOrder[0]).toBeLessThan(resetClient.mock.invocationCallOrder[0]);
    expect(resetClient.mock.invocationCallOrder[0]).toBeLessThan(getClient.mock.invocationCallOrder[0]);
  });

  test("reports failure without resetting when destructive recovery itself fails", async () => {
    recoverStorage.mockRejectedValueOnce(new Error("raw secret must not escape"));

    await expect(attemptEncryptedNativeStorageRecovery({
      acknowledgedDataLoss: true,
      action: "discard-unreadable-encrypted-local-data",
    }, recoveryDependencies)).resolves.toBe("failed");
    expect(resetClient).not.toHaveBeenCalled();
    expect(getClient).not.toHaveBeenCalled();
  });

  test("does not claim success when recreation fails", async () => {
    getClient.mockImplementationOnce(() => {
      throw new Error("secure_storage_key_unavailable");
    });

    await expect(attemptEncryptedNativeStorageRecovery({
      acknowledgedDataLoss: true,
      action: "discard-unreadable-encrypted-local-data",
    }, recoveryDependencies)).resolves.toBe("failed");
  });
});

type RecoveryAttempt = "recovered" | "invalid-consent" | "failed";
type RecoveryRuntimeDependencies = {
  acquire: () => number | null;
  isCurrent: (lease: number) => boolean;
  attempt: (consent: unknown) => Promise<RecoveryAttempt>;
  retainLock: (result: Exclude<RecoveryAttempt, "recovered">, lease: number) => void;
  commitRecovered: (lease: number) => boolean;
};
type RecoveryRuntimeFactory = (dependencies: RecoveryRuntimeDependencies) => {
  recover: (consent: unknown) => Promise<boolean>;
};

function recoveryRuntimeFactory(): RecoveryRuntimeFactory | undefined {
  return (authBootstrapRuntime as unknown as {
    createEncryptedStorageRecoveryRuntime?: RecoveryRuntimeFactory;
  }).createEncryptedStorageRecoveryRuntime;
}

type LateSession = { user: { id: string } };
type LateSessionOutcome =
  | { ok: true; session: LateSession | null }
  | { ok: false; error: unknown };
type LateSessionDependencies = {
  isCancelled: () => boolean;
  handleStorageFailure: (error: unknown) => void;
  isRecoveryPending: () => boolean;
  currentRecoveryProof: () => unknown;
  captureRecoverySnapshot: () => number;
  isRecoverySnapshotCurrent: (snapshot: number) => boolean;
  failClosedRecovery: (error: unknown) => Promise<unknown>;
  clearRecoveryPending: () => Promise<void>;
  handleInitialSession: (session: LateSession | null) => void;
  setRecoveryReady: (ready: boolean) => void;
};
type LateSessionReconciler = (
  rawSessionLoad: Promise<LateSessionOutcome>,
  dependencies: LateSessionDependencies,
) => Promise<void>;

function lateSessionReconciler(): LateSessionReconciler | undefined {
  return (authBootstrapRuntime as unknown as {
    reconcileLateAuthSession?: LateSessionReconciler;
  }).reconcileLateAuthSession;
}

describe("AuthContext recovery runtime", () => {
  const consent = {
    acknowledgedDataLoss: true,
    action: "discard-unreadable-encrypted-local-data",
  } as const;

  test("concurrent callers share one promise and only one mutation owner", async () => {
    const createRuntime = recoveryRuntimeFactory();
    expect(typeof createRuntime).toBe("function");
    if (!createRuntime) return;

    let finish: (result: RecoveryAttempt) => void = () => {};
    const attempt = jest.fn(() => new Promise<RecoveryAttempt>((resolve) => {
      finish = resolve;
    }));
    const retainLock = jest.fn();
    const commitRecovered = jest.fn(() => true);
    const runtime = createRuntime({
      acquire: () => 7,
      isCurrent: (lease) => lease === 7,
      attempt,
      retainLock,
      commitRecovered,
    });

    const first = runtime.recover(consent);
    const second = runtime.recover(consent);
    expect(second).toBe(first);
    expect(attempt).not.toHaveBeenCalled();

    await Promise.resolve();
    expect(attempt).toHaveBeenCalledTimes(1);
    finish("recovered");

    await expect(first).resolves.toBe(true);
    expect(commitRecovered).toHaveBeenCalledTimes(1);
    expect(retainLock).not.toHaveBeenCalled();
  });

  test("a lease lost before the first microtask cannot start destructive recovery", async () => {
    const createRuntime = recoveryRuntimeFactory();
    expect(typeof createRuntime).toBe("function");
    if (!createRuntime) return;

    let epoch = 3;
    const attempt = jest.fn<Promise<RecoveryAttempt>, [unknown]>().mockResolvedValue("recovered");
    const commitRecovered = jest.fn(() => true);
    const runtime = createRuntime({
      acquire: () => epoch,
      isCurrent: (lease) => lease === epoch,
      attempt,
      retainLock: jest.fn(),
      commitRecovered,
    });

    const result = runtime.recover(consent);
    epoch += 1;

    await expect(result).resolves.toBe(false);
    expect(attempt).not.toHaveBeenCalled();
    expect(commitRecovered).not.toHaveBeenCalled();
  });

  test("one failed concurrent attempt retains the lock exactly once", async () => {
    const createRuntime = recoveryRuntimeFactory();
    expect(typeof createRuntime).toBe("function");
    if (!createRuntime) return;

    const retainLock = jest.fn();
    const runtime = createRuntime({
      acquire: () => 11,
      isCurrent: () => true,
      attempt: jest.fn().mockResolvedValue("failed"),
      retainLock,
      commitRecovered: jest.fn(() => true),
    });

    const first = runtime.recover(consent);
    const second = runtime.recover(consent);
    await expect(Promise.all([first, second])).resolves.toEqual([false, false]);
    expect(retainLock).toHaveBeenCalledTimes(1);
  });
});

describe("strict auth-storage failure classification", () => {
  type Classifier = (error: unknown) => "recovery-required" | "unavailable" | null;
  const classifier = () => (authBootstrapRuntime as unknown as {
    classifyAuthStorageFailure?: Classifier;
  }).classifyAuthStorageFailure;

  test("only the exact durable signal opens recovery while strict adapter failures retry", () => {
    const classify = classifier();
    expect(typeof classify).toBe("function");
    if (!classify) return;

    expect(classify(new Error(ENCRYPTED_STORAGE_RECOVERY_REQUIRED))).toBe("recovery-required");
    for (const code of [
      "secure_storage_key_unavailable",
      "secure_storage_key_invalid",
      "secure_storage_native_only",
      "secure_storage_read_failed",
      "secure_storage_decrypt_failed",
      "secure_storage_encrypt_failed",
      "secure_storage_write_failed",
      "secure_storage_remove_failed",
      "secure_storage_capacity_check_failed",
      "secure_storage_capacity_exceeded",
      "secure_storage_migration_failed",
      "secure_storage_value_invalid",
      "secure_storage_value_too_large",
      "secure_store_unavailable",
    ]) {
      expect(classify(errorWithCause("auth wrapper", new Error(code)))).toBe("unavailable");
    }
  });

  test.each([
    new Error("Network request failed"),
    new Error("secure_storage_key_unavailable "),
    new Error("prefix:secure_storage_read_failed"),
    { message: "secure_storage_decrypt_failed" },
    "secure_storage_key_unavailable",
  ])("does not promote generic or message-shaped failures: %p", (error) => {
    const classify = classifier();
    expect(typeof classify).toBe("function");
    if (!classify) return;
    expect(classify(error)).toBeNull();
  });
});

describe("late bootstrap session reconciliation", () => {
  function makeLateDependencies(overrides: Partial<LateSessionDependencies> = {}) {
    const calls = {
      storageFailures: [] as unknown[],
      sessions: [] as Array<LateSession | null>,
      recoveryReady: [] as boolean[],
    };
    const dependencies: LateSessionDependencies = {
      isCancelled: () => false,
      handleStorageFailure: (error) => calls.storageFailures.push(error),
      isRecoveryPending: () => false,
      currentRecoveryProof: () => null,
      captureRecoverySnapshot: () => 1,
      isRecoverySnapshotCurrent: () => true,
      failClosedRecovery: async () => true,
      clearRecoveryPending: async () => {},
      handleInitialSession: (session) => calls.sessions.push(session),
      setRecoveryReady: (ready) => calls.recoveryReady.push(ready),
      ...overrides,
    };
    return { calls, dependencies };
  }

  test.each([
    new Error(ENCRYPTED_STORAGE_RECOVERY_REQUIRED),
    new Error("secure_storage_key_unavailable"),
  ])("routes a late strict failure through the storage boundary: %p", async (error) => {
    const reconcile = lateSessionReconciler();
    expect(typeof reconcile).toBe("function");
    if (!reconcile) return;
    const { calls, dependencies } = makeLateDependencies();

    await reconcile(Promise.resolve({ ok: false, error }), dependencies);

    expect(calls.storageFailures).toEqual([error]);
    expect(calls.sessions).toEqual([]);
    expect(calls.recoveryReady).toEqual([]);
  });

  test("absorbs a detached pending-clear rejection and routes it without publishing", async () => {
    const reconcile = lateSessionReconciler();
    expect(typeof reconcile).toBe("function");
    if (!reconcile) return;
    const failure = new Error("secure_storage_read_failed");
    const { calls, dependencies } = makeLateDependencies({
      isRecoveryPending: () => true,
      clearRecoveryPending: async () => Promise.reject(failure),
    });

    await expect(reconcile(
      Promise.resolve({ ok: true, session: null }),
      dependencies,
    )).resolves.toBeUndefined();
    expect(calls.storageFailures).toEqual([failure]);
    expect(calls.sessions).toEqual([]);
  });

  test("re-checks cancellation and the proof snapshot after an awaited clear", async () => {
    const reconcile = lateSessionReconciler();
    expect(typeof reconcile).toBe("function");
    if (!reconcile) return;
    let cancelled = false;
    const { calls, dependencies } = makeLateDependencies({
      isCancelled: () => cancelled,
      isRecoveryPending: () => true,
      clearRecoveryPending: async () => {
        cancelled = true;
      },
    });

    await reconcile(Promise.resolve({ ok: true, session: null }), dependencies);
    expect(calls.sessions).toEqual([]);
    expect(calls.recoveryReady).toEqual([]);
  });

  test("a changed recovery snapshot cannot publish after an awaited clear", async () => {
    const reconcile = lateSessionReconciler();
    expect(typeof reconcile).toBe("function");
    if (!reconcile) return;
    let current = true;
    const { calls, dependencies } = makeLateDependencies({
      isRecoveryPending: () => true,
      clearRecoveryPending: async () => {
        current = false;
      },
      isRecoverySnapshotCurrent: () => current,
    });

    await reconcile(Promise.resolve({ ok: true, session: null }), dependencies);
    expect(calls.sessions).toEqual([]);
    expect(calls.recoveryReady).toEqual([]);
  });
});

describe("AuthContext encrypted-storage recovery boundary", () => {
  test("exposes a distinct lock and an exact-consent recovery action", () => {
    expect(AUTH).toContain("storageRecoveryRequired: boolean;");
    expect(AUTH).toContain(
      "recoverEncryptedStorage: (consent: EncryptedNativeStorageRecoveryConsent) => Promise<boolean>;",
    );
    expect(AUTH).toContain("storageRecoveryRequired: false,");
    expect(AUTH).toContain("recoverEncryptedStorage: async () => false,");
  });

  test("the strict classifier masks every identity field without resolving owner-null", () => {
    const start = AUTH.indexOf("const detectAuthStorageFailure = useCallback");
    const end = AUTH.indexOf("const activateRecoverySession", start);
    const block = AUTH.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(block).toContain("classifyAuthStorageFailure(error)");
    expect(block).toContain('kind === "recovery-required"');
    expect(block).toContain("storageRecoveryRequiredRef.current = true;");
    expect(block).toContain("setStorageRecoveryRequired(true);");
    expect(block).toContain("setRecoveryReady(false);");
    expect(block).toContain("userId: null,");
    expect(block).toContain("hasProfile: null,");
    expect(block).toContain("isMinor: null,");
    expect(block).toContain("age: null,");
    expect(block).not.toContain("noteResolvedOwner(");
    expect(block).not.toContain("signOutAuth(");
  });

  test("successful consent retires old callbacks and starts a locked fresh bootstrap", () => {
    const start = AUTH.indexOf("const recoverEncryptedStorage = useCallback");
    const end = AUTH.indexOf("const value = useMemo", start);
    const block = AUTH.slice(start, end);
    const runtime = block.indexOf("createEncryptedStorageRecoveryRuntime<number>({");
    const attempt = block.indexOf("attempt: attemptEncryptedNativeStorageRecovery,");
    const invalidate = block.indexOf("authClientEpochRef.current = nextEpoch;");
    const ownerNote = block.indexOf("noteResolvedOwner(null);");
    const publish = block.indexOf("setState({", ownerNote);
    const rerender = block.indexOf("setAuthClientEpoch(nextEpoch);");

    expect(start).toBeGreaterThan(-1);
    expect(block).toContain("authClientEpochRef.current !== lease");
    expect(block).toContain("|| !storageRecoveryRequiredRef.current");
    expect(block).toContain("commitRecovered: (lease) => {");
    expect(block).toContain("setRecoveryReady(false);");
    expect(block).toContain("loading: true,");
    expect(runtime).toBeGreaterThan(-1);
    expect(attempt).toBeGreaterThan(-1);
    expect(invalidate).toBeGreaterThan(attempt);
    expect(ownerNote).toBeGreaterThan(invalidate);
    expect(publish).toBeGreaterThan(ownerNote);
    expect(rerender).toBeGreaterThan(publish);
  });

  test("recovery failures are phase-only and never interpolate raw operands", () => {
    const calls = AUTH.match(/console\.warn\("\[auth\] encrypted storage[^\n]*/g) ?? [];
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call).toMatch(/^console\.warn\("\[auth\] encrypted storage[^\"]*"\);$/);
      expect(call).toContain("phase=");
    }
  });
});
