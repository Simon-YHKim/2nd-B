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
const dependencies = {
  recover: recoverStorage,
  resetClient,
  recreateClient,
  readyStorage,
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
