import { AuthUnknownError } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ENCRYPTED_STORAGE_RECOVERY_REQUIRED } from "../../storage/encrypted-native-storage";
import {
  attemptEncryptedNativeStorageRecovery,
  isEncryptedStorageRecoveryRequired,
  readAuthSessionOutcome,
} from "../storage-recovery";

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

describe("AuthContext encrypted-storage recovery boundary", () => {
  test("exposes a distinct lock and an exact-consent recovery action", () => {
    expect(AUTH).toContain("storageRecoveryRequired: boolean;");
    expect(AUTH).toContain(
      "recoverEncryptedStorage: (consent: EncryptedNativeStorageRecoveryConsent) => Promise<boolean>;",
    );
    expect(AUTH).toContain("storageRecoveryRequired: false,");
    expect(AUTH).toContain("recoverEncryptedStorage: async () => false,");
  });

  test("the exact classifier masks every identity field without resolving owner-null", () => {
    const start = AUTH.indexOf("const detectEncryptedStorageRecovery = useCallback");
    const end = AUTH.indexOf("const activateRecoverySession", start);
    const block = AUTH.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(block).toContain("isEncryptedStorageRecoveryRequired(error)");
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
    const attempt = block.indexOf("attemptEncryptedNativeStorageRecovery(consent)");
    const invalidate = block.indexOf("authClientEpochRef.current = nextEpoch;");
    const ownerNote = block.indexOf("noteResolvedOwner(null);");
    const publish = block.indexOf("setState({", ownerNote);
    const rerender = block.indexOf("setAuthClientEpoch(nextEpoch);");

    expect(start).toBeGreaterThan(-1);
    expect(block).toContain("authClientEpochRef.current !== authClientEpoch");
    expect(block).toContain("|| !storageRecoveryRequiredRef.current");
    expect(block).toContain('if (result !== "recovered")');
    expect(block).toContain("setRecoveryReady(false);");
    expect(block).toContain("loading: true,");
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
