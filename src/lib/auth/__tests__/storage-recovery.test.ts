import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { AuthUnknownError } from "@supabase/supabase-js";

import {
  createEncryptedNativeStorage,
  ENCRYPTED_STORAGE_RECOVERY_REQUIRED,
  type EncryptedNativeStorageDependencies,
} from "../../storage/encrypted-native-storage";
import {
  attemptEncryptedNativeStorageRecovery,
  ENCRYPTED_STORAGE_RECOVERY_TIMEOUT_MS,
  isEncryptedStorageRecoveryRequired,
} from "../storage-recovery";

const recoverStorage = jest.fn<Promise<unknown>, [unknown, unknown?]>();
const resetClient = jest.fn<Promise<void>, []>();
const recreateClient = jest.fn<unknown, []>();
const readyStorage = jest.fn<Promise<void>, []>();
const clearPersistence = jest.fn<Promise<void>, []>();
// A fresh object per test: the helper keeps a wipe that is still out with the
// dependencies it was started on, so one test's stalled wipe must not become
// the next test's in-flight wipe.
const makeDependencies = () => ({
  recover: recoverStorage,
  resetClient,
  recreateClient,
  readyStorage,
  clearPersistence,
});
let dependencies = makeDependencies();

const ROOT = resolve(__dirname, "../../../..");
const read = (path: string): string =>
  readFileSync(resolve(ROOT, path), "utf8").replace(/\r\n/g, "\n");

function errorWithCause(message: string, cause: unknown): Error {
  const error = new Error(message);
  Object.defineProperty(error, "cause", { configurable: true, value: cause });
  return error;
}

describe("encrypted auth-storage recovery classification", () => {
  test("recognizes only the exact durable signal through bounded auth wrappers", () => {
    const leaf = new Error(ENCRYPTED_STORAGE_RECOVERY_REQUIRED);
    const wrapped = new AuthUnknownError("Auth session missing", errorWithCause("outer", leaf));

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
    new Error("secure_storage_key_unavailable"),
    new Error(`prefix:${ENCRYPTED_STORAGE_RECOVERY_REQUIRED}`),
    new Error(`${ENCRYPTED_STORAGE_RECOVERY_REQUIRED} `),
  ])("does not promote strings, message-shaped objects, or transient failures", (error) => {
    expect(isEncryptedStorageRecoveryRequired(error)).toBe(false);
  });

  test("terminates safely when wrapper links form a cycle", () => {
    const first = new Error("first");
    const second = errorWithCause("second", first);
    Object.defineProperty(first, "cause", { configurable: true, value: second });

    expect(isEncryptedStorageRecoveryRequired(first)).toBe(false);
  });
});

describe("explicit recovery consent", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    dependencies = makeDependencies();
    recoverStorage.mockResolvedValue({ discardedManagedKeys: 2 });
    resetClient.mockResolvedValue(undefined);
    recreateClient.mockReturnValue({});
    readyStorage.mockResolvedValue(undefined);
    clearPersistence.mockResolvedValue(undefined);
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
  ])("does nothing before the exact two-field contract", async (consent) => {
    await expect(
      attemptEncryptedNativeStorageRecovery(consent as never, dependencies),
    ).resolves.toBe("invalid-consent");
    expect(recoverStorage).not.toHaveBeenCalled();
    expect(resetClient).not.toHaveBeenCalled();
    expect(recreateClient).not.toHaveBeenCalled();
    expect(readyStorage).not.toHaveBeenCalled();
    expect(clearPersistence).not.toHaveBeenCalled();
  });

  test("wipes, retires, recreates, and readies the fresh runtime in order", async () => {
    const consent = {
      acknowledgedDataLoss: true as const,
      action: "discard-unreadable-encrypted-local-data" as const,
    };

    await expect(
      attemptEncryptedNativeStorageRecovery(consent, dependencies),
    ).resolves.toBe("recovered");
    expect(recoverStorage).toHaveBeenCalledWith(consent, { stillAwaited: expect.any(Function) });
    expect(resetClient).toHaveBeenCalledTimes(1);
    expect(recreateClient).toHaveBeenCalledTimes(1);
    expect(readyStorage).toHaveBeenCalledTimes(1);
    expect(recoverStorage.mock.invocationCallOrder[0]).toBeLessThan(
      resetClient.mock.invocationCallOrder[0],
    );
    expect(resetClient.mock.invocationCallOrder[0]).toBeLessThan(
      recreateClient.mock.invocationCallOrder[0],
    );
    expect(recreateClient.mock.invocationCallOrder[0]).toBeLessThan(
      readyStorage.mock.invocationCallOrder[0],
    );
    // R14-BOOT-EXIT: the wipe is a fresh start, so the fail-closed persistence
    // streak ends with it - last, only once the fresh runtime is ready.
    expect(clearPersistence).toHaveBeenCalledTimes(1);
    expect(readyStorage.mock.invocationCallOrder[0]).toBeLessThan(
      clearPersistence.mock.invocationCallOrder[0],
    );
  });

  test("a streak that cannot be cleared never turns a finished recovery into a failure", async () => {
    clearPersistence.mockRejectedValueOnce(new Error("backing store offline"));
    await expect(
      attemptEncryptedNativeStorageRecovery(
        {
          acknowledgedDataLoss: true,
          action: "discard-unreadable-encrypted-local-data",
        },
        dependencies,
      ),
    ).resolves.toBe("recovered");
  });

  test("retains the lock when wipe or fresh-runtime readiness fails", async () => {
    recoverStorage.mockRejectedValueOnce(new Error("private dependency detail"));
    await expect(
      attemptEncryptedNativeStorageRecovery(
        {
          acknowledgedDataLoss: true,
          action: "discard-unreadable-encrypted-local-data",
        },
        dependencies,
      ),
    ).resolves.toBe("failed");
    expect(resetClient).not.toHaveBeenCalled();

    recoverStorage.mockResolvedValueOnce({ discardedManagedKeys: 1 });
    readyStorage.mockRejectedValueOnce(new Error("secure_store_unavailable"));
    await expect(
      attemptEncryptedNativeStorageRecovery(
        {
          acknowledgedDataLoss: true,
          action: "discard-unreadable-encrypted-local-data",
        },
        dependencies,
      ),
    ).resolves.toBe("failed");
    // A retained lock keeps its streak: the gate must come straight back.
    expect(clearPersistence).not.toHaveBeenCalled();
  });
});

describe("a consented reset that stops answering", () => {
  // #1835 follow-up (2026-09-19). The gate #1835 raises for a stuck store could
  // then sit on its `working` label forever if the wipe or the fresh runtime
  // never answered. The attempt now fails within a named bound, which the gate
  // shows as the existing failure copy, and nothing that answers after the
  // bound changes state behind that answer.
  const DEADLINE = ENCRYPTED_STORAGE_RECOVERY_TIMEOUT_MS;
  const CONSENT = {
    acknowledgedDataLoss: true as const,
    action: "discard-unreadable-encrypted-local-data" as const,
  };
  const never = <T>(): Promise<T> => new Promise<T>(() => undefined);

  /** Where a promise stands, read without awaiting it. */
  function watch<T>(promise: Promise<T>): { settled: boolean; value?: T } {
    const state: { settled: boolean; value?: T } = { settled: false };
    void promise.then((value) => {
      state.settled = true;
      state.value = value;
    });
    return state;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    dependencies = makeDependencies();
    recoverStorage.mockResolvedValue({ discardedManagedKeys: 2 });
    resetClient.mockResolvedValue(undefined);
    recreateClient.mockReturnValue({});
    readyStorage.mockResolvedValue(undefined);
    clearPersistence.mockResolvedValue(undefined);
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("is a named, explicit bound", () => {
    expect(DEADLINE).toBe(15_000);
  });

  test("a wipe that never answers fails at the deadline, not before", async () => {
    recoverStorage.mockImplementationOnce(never);
    const attempt = watch(attemptEncryptedNativeStorageRecovery(CONSENT, dependencies));

    await jest.advanceTimersByTimeAsync(DEADLINE - 1);
    expect(attempt.settled).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    expect(attempt).toEqual({ settled: true, value: "failed" });
    expect(resetClient).not.toHaveBeenCalled();
    expect(clearPersistence).not.toHaveBeenCalled();
  });

  test("a wipe that finishes after the deadline changes nothing behind the failure", async () => {
    let finish: () => void = () => undefined;
    recoverStorage.mockImplementationOnce(
      () =>
        new Promise<unknown>((resolve) => {
          finish = () => resolve({ discardedManagedKeys: 2 });
        }),
    );
    const attempt = watch(attemptEncryptedNativeStorageRecovery(CONSENT, dependencies));
    await jest.advanceTimersByTimeAsync(DEADLINE);
    expect(attempt).toEqual({ settled: true, value: "failed" });

    finish();
    await jest.advanceTimersByTimeAsync(0);
    // The client is neither retired nor replaced and the streak is kept, so
    // the gate that said the reset did not finish stays the only state.
    expect(resetClient).not.toHaveBeenCalled();
    expect(recreateClient).not.toHaveBeenCalled();
    expect(readyStorage).not.toHaveBeenCalled();
    expect(clearPersistence).not.toHaveBeenCalled();
  });

  test("a fresh runtime that never becomes ready is the same failure, and the streak is kept", async () => {
    readyStorage.mockImplementationOnce(never);
    const attempt = watch(attemptEncryptedNativeStorageRecovery(CONSENT, dependencies));

    await jest.advanceTimersByTimeAsync(DEADLINE);
    expect(attempt).toEqual({ settled: true, value: "failed" });
    expect(clearPersistence).not.toHaveBeenCalled();
  });

  test("a retry while the first wipe is still out waits on that wipe instead of starting another", async () => {
    // Gate findings IA-1838-1 / IZ-1838-1 (2026-09-19). The failure copy says
    // to try again, and the first wipe may still be out when the user does.
    // The adapter serializes every wipe behind the one before it, so a second
    // wipe could never run first: it only queued a duplicate that ran later,
    // after its own attempt had already failed. The retry now waits, under a
    // fresh bound, on the wipe that is still out, and only the attempt still
    // waiting acts on the client once it lands.
    let finishFirst: () => void = () => undefined;
    recoverStorage.mockImplementationOnce(
      () =>
        new Promise<unknown>((resolve) => {
          finishFirst = () => resolve({ discardedManagedKeys: 2 });
        }),
    );
    const first = watch(attemptEncryptedNativeStorageRecovery(CONSENT, dependencies));
    await jest.advanceTimersByTimeAsync(DEADLINE);
    expect(first).toEqual({ settled: true, value: "failed" });

    const retry = watch(attemptEncryptedNativeStorageRecovery(CONSENT, dependencies));
    await jest.advanceTimersByTimeAsync(0);
    expect(retry.settled).toBe(false);
    expect(recoverStorage).toHaveBeenCalledTimes(1);

    finishFirst();
    await jest.advanceTimersByTimeAsync(0);
    expect(retry).toEqual({ settled: true, value: "recovered" });
    expect(recoverStorage).toHaveBeenCalledTimes(1);
    expect(resetClient).toHaveBeenCalledTimes(1);
    expect(recreateClient).toHaveBeenCalledTimes(1);
    expect(readyStorage).toHaveBeenCalledTimes(1);
    expect(clearPersistence).toHaveBeenCalledTimes(1);
  });

  test("a consent after the wipe has settled starts a new wipe", async () => {
    // Joining lasts only while the wipe is out. Data written after it landed
    // belongs to no earlier consent, so the next consent wipes again.
    await expect(
      attemptEncryptedNativeStorageRecovery(CONSENT, dependencies),
    ).resolves.toBe("recovered");
    await expect(
      attemptEncryptedNativeStorageRecovery(CONSENT, dependencies),
    ).resolves.toBe("recovered");
    expect(recoverStorage).toHaveBeenCalledTimes(2);
  });

  test("a slow reset that answers inside the deadline still recovers", async () => {
    // The bound is for a store that stopped answering, not for a slow one.
    recoverStorage.mockImplementationOnce(
      () =>
        new Promise<unknown>((resolve) => {
          setTimeout(() => resolve({ discardedManagedKeys: 2 }), DEADLINE - 1);
        }),
    );
    const attempt = watch(attemptEncryptedNativeStorageRecovery(CONSENT, dependencies));

    await jest.advanceTimersByTimeAsync(DEADLINE - 1);
    expect(attempt).toEqual({ settled: true, value: "recovered" });
    expect(clearPersistence).toHaveBeenCalledTimes(1);
  });

  // IA-1838-1 / IZ-1838-1. The tests above answer the wipe with a mock, and a
  // mock that answers the second call at once is how the first version of this
  // bound missed that the adapter queues every wipe behind the one before it.
  // These run the production adapter's maintenance queue.
  describe("against the adapter's real maintenance queue", () => {
    const MASTER_KEY = "secondB.secureStorage.master.v1";
    const SENTINEL = "secondB.secureStorage.keySentinel.v1";
    const DRAFT = "capture.drafts.v2.owner-a";
    const UNMANAGED = "unrelated.preference";

    /** The production adapter over an in-memory store and keystore. */
    function realStore() {
      const values = new Map<string, string>([
        [DRAFT, "SBENC1:AAAA"],
        [UNMANAGED, "keep"],
        [SENTINEL, `SBKEY1:${"0".repeat(64)}`],
        ["secondB.secureStorage.capacity.v1", "SBCAP1:11"],
      ]);
      const secrets = new Map([[MASTER_KEY, Buffer.alloc(32, 1).toString("base64")]]);
      const backing = {
        getItem: jest.fn(async (key: string): Promise<string | null> => values.get(key) ?? null),
        setItem: jest.fn(async (key: string, value: string) => {
          values.set(key, value);
        }),
        removeItem: jest.fn(async (key: string) => {
          values.delete(key);
        }),
        getAllKeys: jest.fn(async (): Promise<readonly string[]> => [...values.keys()]),
      };
      const keystore = {
        getItem: jest.fn(async (key: string): Promise<string | null> => secrets.get(key) ?? null),
        setItem: jest.fn(async (key: string, value: string) => {
          secrets.set(key, value);
        }),
        removeItem: jest.fn(async (key: string) => {
          secrets.delete(key);
        }),
      };
      const unused = async (): Promise<string> => {
        throw new Error("a wipe never encrypts");
      };
      const adapter: EncryptedNativeStorageDependencies = {
        backing,
        secrets: keystore,
        crypto: { generateKey: unused, fingerprintKey: unused, encrypt: unused, decrypt: unused },
      };
      const storage = createEncryptedNativeStorage(adapter);
      return {
        backing,
        secrets,
        storage,
        values,
        dependencies: { ...makeDependencies(), recover: storage.recoverAfterUserConsent },
        /** Every remove the wipe issues, in the store and in the keystore. */
        removals: () =>
          backing.removeItem.mock.calls.length + keystore.removeItem.mock.calls.length,
      };
    }

    /** A promise the test resolves by hand. */
    function gate(): { wait: Promise<void>; open: () => void } {
      let open: () => void = () => undefined;
      const wait = new Promise<void>((resolve) => {
        open = resolve;
      });
      return { wait, open };
    }

    /** The first wipe's key scan does not answer until the test opens it. */
    function stallFirstScan(store: ReturnType<typeof realStore>): () => void {
      const scan = gate();
      store.backing.getAllKeys.mockImplementationOnce(async () => {
        await scan.wait;
        return [...store.values.keys()];
      });
      return scan.open;
    }

    /** A read already in the queue stalls, so a wipe queued after it waits. */
    function stallReadAhead(store: ReturnType<typeof realStore>): () => void {
      const read = gate();
      store.backing.getItem.mockImplementationOnce(async () => {
        await read.wait;
        return null;
      });
      void store.storage.getItem("capture.drafts.v2.owner-b");
      return read.open;
    }

    test("a retry rejoins the stalled wipe: one scan, one wipe, one fresh client", async () => {
      const store = realStore();
      const openScan = stallFirstScan(store);

      const first = watch(attemptEncryptedNativeStorageRecovery(CONSENT, store.dependencies));
      await jest.advanceTimersByTimeAsync(DEADLINE);
      expect(first).toEqual({ settled: true, value: "failed" });

      const retry = watch(attemptEncryptedNativeStorageRecovery(CONSENT, store.dependencies));
      await jest.advanceTimersByTimeAsync(DEADLINE / 2);
      expect(retry.settled).toBe(false);

      openScan();
      await jest.advanceTimersByTimeAsync(0);
      expect(retry).toEqual({ settled: true, value: "recovered" });
      expect(store.backing.getAllKeys).toHaveBeenCalledTimes(1);
      // The draft, the migration marker, the master key, and the sentinel.
      expect(store.removals()).toBe(4);
      expect(store.values.has(DRAFT)).toBe(false);
      expect(store.secrets.has(MASTER_KEY)).toBe(false);
      expect(store.values.get(UNMANAGED)).toBe("keep");
      expect(resetClient).toHaveBeenCalledTimes(1);
      expect(recreateClient).toHaveBeenCalledTimes(1);
      expect(readyStorage).toHaveBeenCalledTimes(1);
      expect(clearPersistence).toHaveBeenCalledTimes(1);
    });

    test("a wipe that outlives every attempt runs once and acts on nothing behind the failures", async () => {
      const store = realStore();
      const openScan = stallFirstScan(store);

      const first = watch(attemptEncryptedNativeStorageRecovery(CONSENT, store.dependencies));
      await jest.advanceTimersByTimeAsync(DEADLINE);
      const retry = watch(attemptEncryptedNativeStorageRecovery(CONSENT, store.dependencies));
      await jest.advanceTimersByTimeAsync(DEADLINE);
      expect(first).toEqual({ settled: true, value: "failed" });
      expect(retry).toEqual({ settled: true, value: "failed" });

      openScan();
      await jest.advanceTimersByTimeAsync(0);
      // The wipe that had started finishes once; the retry queued no second one.
      expect(store.backing.getAllKeys).toHaveBeenCalledTimes(1);
      expect(store.removals()).toBe(4);
      expect(store.values.has(DRAFT)).toBe(false);
      // Both attempts had already answered "failed", so nothing acts on the client.
      expect(resetClient).not.toHaveBeenCalled();
      expect(recreateClient).not.toHaveBeenCalled();
      expect(readyStorage).not.toHaveBeenCalled();
      expect(clearPersistence).not.toHaveBeenCalled();

      // The next consent is a new wipe of the store as it is now, and it recovers.
      const third = watch(attemptEncryptedNativeStorageRecovery(CONSENT, store.dependencies));
      await jest.advanceTimersByTimeAsync(0);
      expect(third).toEqual({ settled: true, value: "recovered" });
      expect(store.backing.getAllKeys).toHaveBeenCalledTimes(2);
      expect(resetClient).toHaveBeenCalledTimes(1);
      expect(clearPersistence).toHaveBeenCalledTimes(1);
      expect(store.values.get(UNMANAGED)).toBe("keep");
    });

    test("a wipe still queued when its attempt fails never starts", async () => {
      const store = realStore();
      const openRead = stallReadAhead(store);

      const first = watch(attemptEncryptedNativeStorageRecovery(CONSENT, store.dependencies));
      await jest.advanceTimersByTimeAsync(DEADLINE);
      expect(first).toEqual({ settled: true, value: "failed" });

      openRead();
      await jest.advanceTimersByTimeAsync(0);
      // No attempt waits on it any more, so it does not start: the gate said
      // the reset did not finish, and nothing is removed behind that answer.
      expect(store.backing.getAllKeys).not.toHaveBeenCalled();
      expect(store.removals()).toBe(0);
      expect(store.values.has(DRAFT)).toBe(true);
      expect(store.secrets.has(MASTER_KEY)).toBe(true);
      expect(resetClient).not.toHaveBeenCalled();
    });

    test("a retry keeps a queued wipe wanted, so it starts once the queue frees", async () => {
      const store = realStore();
      const openRead = stallReadAhead(store);

      const first = watch(attemptEncryptedNativeStorageRecovery(CONSENT, store.dependencies));
      await jest.advanceTimersByTimeAsync(DEADLINE);
      expect(first).toEqual({ settled: true, value: "failed" });

      const retry = watch(attemptEncryptedNativeStorageRecovery(CONSENT, store.dependencies));
      await jest.advanceTimersByTimeAsync(DEADLINE / 2);
      openRead();
      await jest.advanceTimersByTimeAsync(0);
      expect(retry).toEqual({ settled: true, value: "recovered" });
      expect(store.backing.getAllKeys).toHaveBeenCalledTimes(1);
      expect(store.removals()).toBe(4);
      expect(resetClient).toHaveBeenCalledTimes(1);
      expect(clearPersistence).toHaveBeenCalledTimes(1);
    });

    test("a malformed consent does not keep a queued wipe wanted", async () => {
      const store = realStore();
      const openRead = stallReadAhead(store);

      const first = watch(attemptEncryptedNativeStorageRecovery(CONSENT, store.dependencies));
      await jest.advanceTimersByTimeAsync(DEADLINE);
      expect(first).toEqual({ settled: true, value: "failed" });

      await expect(
        attemptEncryptedNativeStorageRecovery(
          { acknowledgedDataLoss: true, action: "discard-local-data" },
          store.dependencies,
        ),
      ).resolves.toBe("invalid-consent");
      openRead();
      await jest.advanceTimersByTimeAsync(0);
      expect(store.backing.getAllKeys).not.toHaveBeenCalled();
      expect(store.removals()).toBe(0);
    });
  });
});

describe("current auth v2 and PIXEL-CLAY recovery wiring", () => {
  const AUTH = read("src/lib/auth/AuthContext.tsx");
  const PROOF_STORE = read("src/lib/auth/recovery-proof-store.ts");
  const LAYOUT = read("src/app/_layout.tsx");
  const GATE = read("src/screens/deepspace/storage-recovery-gate.tsx");

  test("native recovery proof state uses the encrypted adapter, never raw AsyncStorage", () => {
    expect(PROOF_STORE).toContain("getEncryptedNativeStorage()");
    expect(PROOF_STORE).not.toContain("@react-native-async-storage/async-storage");
  });

  test("AuthContext keeps durable storage loss distinct from sign-out and old recovery cleanup", () => {
    expect(AUTH).toContain("storageRecoveryRequired: boolean;");
    expect(AUTH).toContain("recoverEncryptedStorage:");
    expect(AUTH).toContain("isEncryptedStorageRecoveryRequired(error)");
    expect(AUTH).toContain("markStorageRecoveryRequired");
    expect(AUTH).toContain("storageRecoveryRequiredRef.current");
    expect(AUTH).toContain("attemptEncryptedNativeStorageRecovery(consent)");
  });

  // R14-BOOT-EXIT. No renderer exists in this jest setup, so the provider's side
  // of the persistence exit is pinned against the real source; the executor it
  // calls runs for real in fail-closed-persistence.test.ts.
  test("a persistent fail-closed lock escalates only after today's lock is published", () => {
    const branch = AUTH.indexOf("phase=fail-closed-signout");
    const lockReady = AUTH.indexOf("setRecoveryReady(false);", branch);
    const lockLoading = AUTH.indexOf(
      "setState((current) => ({ ...current, loading: true }));",
      branch,
    );
    const escalation = AUTH.indexOf("void escalateFailClosedLockIfPersistent({", branch);
    const end = AUTH.indexOf("return false;", escalation);
    expect(branch).toBeGreaterThan(-1);
    expect(lockReady).toBeGreaterThan(branch);
    expect(lockLoading).toBeGreaterThan(lockReady);
    expect(escalation).toBeGreaterThan(lockLoading);
    expect(end).toBeGreaterThan(escalation);

    const block = AUTH.slice(escalation, end);
    expect(block).toContain("isCurrent: isCurrentEffect,");
    expect(block).toContain("markStorageRecoveryRequired();");
    // The only exit is the explicit-consent gate. Nothing here may publish a
    // session, release the recovery lock, or retry through refresh(), which
    // does not read the recovery markers.
    for (const forbidden of [
      "resolveSession(",
      "refresh(",
      "setRecoveryReady(true)",
      "loading: false",
      "bootstrapped",
    ]) {
      expect(block).not.toContain(forbidden);
    }
  });

  test("the sentinel-proven path keeps its own branch and is not counted", () => {
    const entry = AUTH.indexOf("} catch (signOutError) {");
    const proven = AUTH.indexOf("isEncryptedStorageRecoveryRequired(signOutError)", entry);
    const escalation = AUTH.indexOf("void escalateFailClosedLockIfPersistent({", entry);
    expect(entry).toBeGreaterThan(-1);
    expect(proven).toBeGreaterThan(entry);
    expect(proven).toBeLessThan(escalation);
    expect(AUTH.match(/escalateFailClosedLockIfPersistent\(/g)).toHaveLength(1);
  });

  test("every settled bootstrap ends the persistence streak through one helper", () => {
    expect(AUTH.match(/bootstrapped = true;/g)).toHaveLength(1);
    expect(AUTH.match(/markBootstrapped\(\);/g)).toHaveLength(4);
    const helper = AUTH.indexOf("const markBootstrapped = () => {");
    expect(helper).toBeGreaterThan(-1);
    const body = AUTH.slice(helper, AUTH.indexOf("};", helper));
    expect(body).toContain("bootstrapped = true;");
    expect(body).toContain("void clearFailClosedColdStarts();");
  });

  test("the escalation log is one literal with a stable phase", () => {
    expect(AUTH.match(/phase=fail-closed-escalate/g)).toHaveLength(1);
    expect(AUTH).toContain(
      'console.warn("[auth] recovery fail-closed lock persisted across cold starts; phase=fail-closed-escalate");',
    );
  });

  test("the root route gate replaces every screen with localized two-step consent", () => {
    const storageGate = LAYOUT.indexOf(
      "if (storageRecoveryRequired) return <EncryptedStorageRecoveryGate />;",
    );
    const bootstrapLoader = LAYOUT.indexOf("if (!recoveryReady) return <InlineLoader />;");
    expect(storageGate).toBeGreaterThan(-1);
    expect(storageGate).toBeLessThan(bootstrapLoader);
    expect(GATE).toContain('t("auth:storageRecovery.reviewAction")');
    expect(GATE).toContain('t("auth:storageRecovery.confirmAction")');
    expect(GATE).toContain('action: "discard-unreadable-encrypted-local-data"');
    expect(GATE).toContain('accessibilityLiveRegion="assertive"');
  });

  test.each(["en", "es", "id", "ko", "pt"])("%s has complete recovery copy", (locale) => {
    const auth = JSON.parse(read(`locales/${locale}/auth.json`)) as {
      storageRecovery?: Record<string, string>;
    };
    expect(Object.keys(auth.storageRecovery ?? {}).sort()).toEqual([
      "backAction",
      "body",
      "confirmAction",
      "confirmBody",
      "confirmTitle",
      "failed",
      "reviewAction",
      "title",
      "warning",
      "working",
    ]);
  });

  // Gate finding AZ-1835-1 (2026-09-19). The consented reset deletes EVERY
  // managed key on the device and the master key, readable or not
  // (recoverAfterUserConsent in encrypted-native-storage.ts), and #1835 lets
  // the gate appear when only part of the store is damaged. Consent copy that
  // says "only the unreadable data" would ask for less than what is deleted.
  const SCOPE_COPY: Record<string, { only: RegExp; unreadable: RegExp }> = {
    en: { only: /\b(?:only|just|solely)\b/i, unreadable: /unreadable|cannot be read/i },
    es: {
      only: /(?<![A-Za-zÀ-ÿ])(?:solo|sólo|solamente|únicamente)(?![A-Za-zÀ-ÿ])/i,
      unreadable: /no se pueden leer/i,
    },
    id: {
      only: /(?<![A-Za-z])(?:hanya|saja|cuma)(?![A-Za-z])/i,
      unreadable: /tidak dapat dibaca/i,
    },
    // The particle 만 ("only"), but not the 지만 ending or words like 만들다.
    ko: { only: /(?<=[가-힣])(?<!지)만(?![가-힣])|뿐|오직|단지/, unreadable: /읽을 수 없는/ },
    pt: {
      only: /(?<![A-Za-zÀ-ÿ])(?:apenas|somente|só|unicamente)(?![A-Za-zÀ-ÿ])/i,
      unreadable: /não podem ser lidos/i,
    },
  };

  test.each(Object.keys(SCOPE_COPY))("%s consent copy does not narrow the reset to unreadable data", (locale) => {
    const copy = (JSON.parse(read(`locales/${locale}/auth.json`)) as {
      storageRecovery: Record<string, string>;
    }).storageRecovery;
    const { only, unreadable } = SCOPE_COPY[locale];
    for (const key of ["body", "confirmTitle", "confirmBody", "confirmAction"]) {
      expect(copy[key]).not.toMatch(only);
    }
    // The title may still say what went wrong; what is removed may not be
    // named as the unreadable part.
    for (const key of ["confirmTitle", "confirmAction"]) {
      expect(copy[key]).not.toMatch(unreadable);
    }
  });

  // Gate finding EA-1835-2 (2026-09-19). The check above only rejects words
  // that narrow the reset, so copy that simply stopped saying what is removed
  // still passed it. Each key must now SAY its part of the real scope, in every
  // language: all protected app data on this device goes, including what can
  // still be read; the account and data on the server stay; drafts not yet
  // saved are lost and sign-in is needed again. One core phrase per concept
  // and language, so a reworded string has to be re-checked on purpose.
  const SCOPE_CONCEPT_KEYS = {
    allProtected: ["body", "confirmTitle", "confirmBody", "confirmAction"],
    stillReadable: ["body", "confirmBody"],
    thisDevice: ["body", "confirmTitle", "confirmBody"],
    serverKept: ["body", "confirmBody"],
    irreversible: ["warning"],
    draftsLost: ["warning"],
    signInAgain: ["warning"],
  } as const;
  type ScopeConcept = keyof typeof SCOPE_CONCEPT_KEYS;
  const SCOPE_TERMS: Record<string, Record<ScopeConcept, RegExp>> = {
    en: {
      allProtected: /\ball protected (?:app )?data\b/i,
      stillReadable: /\bincluding\b[^.]*\bcan still be read\b/i,
      thisDevice: /\bthis device\b/i,
      serverKept: /\baccount and data on the server (?:will not be deleted|remain)\b/i,
      irreversible: /\bcannot be undone\b/i,
      draftsLost: /\bdrafts\b[^.]*\bwill be lost\b/i,
      signInAgain: /\bsign in again\b/i,
    },
    es: {
      allProtected: /todos los datos protegidos/i,
      stillReadable: /incluidos los que todavía se pueden leer/i,
      thisDevice: /este dispositivo/i,
      serverKept: /tu cuenta y tus datos del servidor (?:no se eliminarán|se conservan)/i,
      irreversible: /no se puede deshacer/i,
      draftsLost: /se perderán los borradores/i,
      signInAgain: /volver a iniciar sesión/i,
    },
    id: {
      allProtected: /semua data (?:aplikasi )?terlindungi/i,
      stillReadable: /termasuk yang masih dapat dibaca/i,
      thisDevice: /perangkat ini/i,
      serverKept: /akunmu dan data (?:yang tersimpan )?di server (?:tidak akan dihapus|tetap ada)/i,
      irreversible: /tidak dapat dibatalkan/i,
      draftsLost: /\bdraf\b[^.]*\bakan hilang\b/i,
      signInAgain: /\bmasuk lagi\b/i,
    },
    ko: {
      allProtected: /보호된 (?:앱 )?데이터[^.?]*모두 삭제/,
      stillReadable: /아직 읽을 수 있는 것까지/,
      thisDevice: /이 기기/,
      serverKept: /서버에 있는 계정과 데이터는 (?:삭제되지 않아요|그대로 남아요)/,
      irreversible: /되돌릴 수 없/,
      draftsLost: /초안은 사라지/,
      signInAgain: /다시 로그인해야/,
    },
    pt: {
      allProtected: /todos os dados protegidos/i,
      stillReadable: /inclusive os que ainda podem ser lidos/i,
      thisDevice: /[nd]este dispositivo/i,
      serverKept: /sua conta e seus dados no servidor (?:não serão excluídos|permanecem)/i,
      irreversible: /não pode ser desfeita/i,
      draftsLost: /\brascunhos\b[^.]*\bserão perdidos\b/i,
      signInAgain: /\bentrar novamente\b/i,
    },
  };

  test.each(["en", "es", "id", "ko", "pt"])("%s consent copy states the full scope of the reset", (locale) => {
    const copy = (JSON.parse(read(`locales/${locale}/auth.json`)) as {
      storageRecovery: Record<string, string>;
    }).storageRecovery;
    const terms = SCOPE_TERMS[locale];
    const missing: string[] = [];
    for (const [concept, keys] of Object.entries(SCOPE_CONCEPT_KEYS) as Array<
      [ScopeConcept, readonly string[]]
    >) {
      for (const key of keys) {
        if (!terms[concept].test(copy[key] ?? "")) missing.push(`${key} lacks ${concept}`);
      }
    }
    expect(missing).toEqual([]);
  });

  test("a reset that does not finish, a stalled one included, keeps the gate and shows its failure copy", () => {
    const attempt = AUTH.indexOf("const result = await attemptEncryptedNativeStorageRecovery(consent);");
    const notRecovered = AUTH.indexOf('if (result !== "recovered") {', attempt);
    const failedExit = AUTH.indexOf("return false;", notRecovered);
    const release = AUTH.indexOf("storageRecoveryRequiredRef.current = false;", attempt);
    expect(attempt).toBeGreaterThan(-1);
    expect(notRecovered).toBeGreaterThan(attempt);
    expect(failedExit).toBeGreaterThan(notRecovered);
    expect(release).toBeGreaterThan(failedExit);
    expect(GATE).toContain("if (!recovered) {");
    expect(GATE).toContain("setFailed(true);");
    expect(GATE).toContain('t("auth:storageRecovery.failed")');
  });
});
