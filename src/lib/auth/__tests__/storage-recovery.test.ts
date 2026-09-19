import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { AuthUnknownError } from "@supabase/supabase-js";

import { ENCRYPTED_STORAGE_RECOVERY_REQUIRED } from "../../storage/encrypted-native-storage";
import {
  attemptEncryptedNativeStorageRecovery,
  isEncryptedStorageRecoveryRequired,
} from "../storage-recovery";

const recoverStorage = jest.fn<Promise<unknown>, [unknown]>();
const resetClient = jest.fn<Promise<void>, []>();
const recreateClient = jest.fn<unknown, []>();
const readyStorage = jest.fn<Promise<void>, []>();
const clearPersistence = jest.fn<Promise<void>, []>();
const dependencies = {
  recover: recoverStorage,
  resetClient,
  recreateClient,
  readyStorage,
  clearPersistence,
};

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
    expect(recoverStorage).toHaveBeenCalledWith(consent);
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
});
