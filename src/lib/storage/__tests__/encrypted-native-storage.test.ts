import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ENCRYPTED_STORAGE_MIGRATION_MARKER_VALUE,
  ENCRYPTED_STORAGE_PREFIX,
  ENCRYPTED_STORAGE_RECOVERY_REQUIRED,
  MAX_SECURE_BACKING_KEYS,
  MAX_SECURE_NON_AUTH_BACKING_BYTES,
  MAX_SECURE_ORDINARY_BACKING_BYTES,
  MAX_SECURE_BACKING_TOTAL_BYTES,
  MAX_SECURE_BACKING_VALUE_BYTES,
  MAX_SECURE_PLAINTEXT_BYTES,
  SECURE_AUDIT_RESERVE_BYTES,
  SECURE_AUTH_RESERVE_BYTES,
  __resetEncryptedNativeStorageForTests,
  createEncryptedNativeStorage,
  getEncryptedNativeStorage,
  type EncryptedNativeStorageDependencies,
} from "../encrypted-native-storage";

const MASTER_KEY = "secondB.secureStorage.master.v1";
const SENTINEL = "secondB.secureStorage.keySentinel.v1";
const MIGRATION_MARKER = "secondB.secureStorage.plaintextMigration.v1";
const CAPACITY_LEDGER = "secondB.secureStorage.capacity.v1";
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

class AuthenticationFailure extends Error {}

function stableHash(value: string): string {
  let state = 0x811c9dc5;
  for (const byte of encoder.encode(value)) {
    state ^= byte;
    state = Math.imul(state, 0x01000193) >>> 0;
  }
  const word = state.toString(16).padStart(8, "0");
  return word.repeat(8);
}

function deterministicSeal(plaintext: string, key: string, aad: string): string {
  const plain = encoder.encode(plaintext);
  const mask = encoder.encode(`${key}\u0000${aad}`);
  const ciphertext = Uint8Array.from(plain, (byte, index) => byte ^ mask[index % mask.length]);
  const encodedCiphertext = Buffer.from(ciphertext).toString("base64");
  const tag = stableHash(`${key}\u0000${aad}\u0000${encodedCiphertext}`).slice(0, 32);
  return Buffer.concat([Buffer.from(tag, "ascii"), Buffer.from(ciphertext)]).toString("base64");
}

function deterministicOpen(sealed: string, key: string, aad: string): string {
  let decoded: Buffer;
  try {
    decoded = Buffer.from(sealed, "base64");
  } catch {
    throw new AuthenticationFailure();
  }
  const tag = decoded.subarray(0, 32).toString("ascii");
  const ciphertext = decoded.subarray(32);
  const encodedCiphertext = ciphertext.toString("base64");
  if (tag !== stableHash(`${key}\u0000${aad}\u0000${encodedCiphertext}`).slice(0, 32)) {
    throw new AuthenticationFailure();
  }
  const mask = encoder.encode(`${key}\u0000${aad}`);
  const plaintext = Uint8Array.from(ciphertext, (byte, index) => byte ^ mask[index % mask.length]);
  try {
    return decoder.decode(plaintext);
  } catch {
    throw new AuthenticationFailure();
  }
}

function makeNonCanonicalBase64(value: string): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  if (padding === 0) throw new Error("test fixture must contain base64 padding");
  const index = value.length - padding - 1;
  const digit = alphabet.indexOf(value[index]);
  if (digit < 0) throw new Error("invalid test fixture");
  return `${value.slice(0, index)}${alphabet[(digit + 1) % alphabet.length]}${value.slice(index + 1)}`;
}

function envelopeOfSize(bytes: number): string {
  return `${ENCRYPTED_STORAGE_PREFIX}${"A".repeat(bytes - ENCRYPTED_STORAGE_PREFIX.length)}`;
}

function seedEnvelopeBytes(values: Map<string, string>, totalBytes: number): void {
  let remaining = totalBytes;
  let index = 0;
  while (remaining > 0) {
    const size = Math.min(remaining, MAX_SECURE_BACKING_VALUE_BYTES);
    values.set(`capture.drafts.v2.seed-${index}`, envelopeOfSize(size));
    remaining -= size;
    index += 1;
  }
}

function totalEnvelopeBytes(values: Map<string, string>): number {
  return [...values.values()].reduce(
    (total, value) => total + (
      value.startsWith(ENCRYPTED_STORAGE_PREFIX) ? Buffer.byteLength(value, "utf8") : 0
    ),
    0,
  );
}

function createHarness() {
  const values = new Map<string, string>();
  const secrets = new Map<string, string>();
  let generatedKeys = 0;

  const crypto: EncryptedNativeStorageDependencies["crypto"] = {
    generateKey: jest.fn(async () => {
      generatedKeys += 1;
      return Buffer.alloc(32, generatedKeys).toString("base64");
    }),
    fingerprintKey: jest.fn(async (key) => stableHash(key)),
    encrypt: jest.fn(async (plaintext, key, aad) => deterministicSeal(plaintext, key, aad)),
    decrypt: jest.fn(async (sealed, key, aad) => deterministicOpen(sealed, key, aad)),
  };
  const dependencies: EncryptedNativeStorageDependencies = {
    backing: {
      getItem: jest.fn(async (key) => values.get(key) ?? null),
      setItem: jest.fn(async (key, value) => { values.set(key, value); }),
      removeItem: jest.fn(async (key) => { values.delete(key); }),
      getAllKeys: jest.fn(async () => [...values.keys()]),
    },
    secrets: {
      getItem: jest.fn(async (key) => secrets.get(key) ?? null),
      setItem: jest.fn(async (key, value) => { secrets.set(key, value); }),
      removeItem: jest.fn(async (key) => { secrets.delete(key); }),
    },
    crypto,
  };
  return {
    dependencies,
    generatedKeys: () => generatedKeys,
    secrets,
    storage: createEncryptedNativeStorage(dependencies),
    values,
  };
}

function primeDeviceKey(h: ReturnType<typeof createHarness>, fill = 1): void {
  const key = Buffer.alloc(32, fill).toString("base64");
  h.secrets.set(MASTER_KEY, key);
  h.values.set(SENTINEL, `SBKEY1:${stableHash(key)}`);
  h.values.set(CAPACITY_LEDGER, "SBCAP1:0");
}

function setCapacityLedger(h: ReturnType<typeof createHarness>, total: number): void {
  h.values.set(CAPACITY_LEDGER, `SBCAP1:${total}`);
}

describe("encrypted native storage core", () => {
  test("stores authenticated ciphertext and binds it to the logical key", async () => {
    const h = createHarness();
    await h.storage.setItem("capture.drafts.v2.owner-a", "private unfinished note");

    const persisted = h.values.get("capture.drafts.v2.owner-a")!;
    expect(persisted).toMatch(/^SBENC1:/);
    expect(persisted).not.toContain("private unfinished note");
    await expect(h.storage.getItem("capture.drafts.v2.owner-a")).resolves.toBe(
      "private unfinished note",
    );

    h.values.set("capture.drafts.v2.owner-b", persisted);
    await expect(h.storage.getItem("capture.drafts.v2.owner-b")).rejects.toThrow(
      "secure_storage_decrypt_failed",
    );
    h.values.set("capture.drafts.v2.owner-a", `${persisted.slice(0, -2)}AA`);
    await expect(h.storage.getItem("capture.drafts.v2.owner-a")).rejects.toThrow(
      "secure_storage_decrypt_failed",
    );
  });

  test("creates one durable device key and sentinel under concurrent same-key writes", async () => {
    const h = createHarness();
    const originalEncrypt = h.dependencies.crypto.encrypt;
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    (originalEncrypt as jest.Mock).mockImplementationOnce(
      async (plaintext: string, key: string, aad: string) => {
        await firstGate;
        return deterministicSeal(plaintext, key, aad);
      },
    );

    const oldWrite = h.storage.setItem("capture.drafts.v2.owner-a", "old");
    const newWrite = h.storage.setItem("capture.drafts.v2.owner-a", "new");
    await Promise.resolve();
    releaseFirst();
    await Promise.all([oldWrite, newWrite]);

    await expect(h.storage.getItem("capture.drafts.v2.owner-a")).resolves.toBe("new");
    expect(h.generatedKeys()).toBe(1);
    expect(h.secrets.get(MASTER_KEY)).toBeDefined();
    expect(h.values.get(SENTINEL)).toMatch(/^SBKEY1:[0-9a-f]{64}$/);
  });

  test("fails closed when the key or sentinel write is not durable", async () => {
    const missingKey = createHarness();
    (missingKey.dependencies.secrets.setItem as jest.Mock).mockResolvedValueOnce(undefined);
    await expect(
      missingKey.storage.setItem("capture.drafts.v2.owner-a", "do not persist"),
    ).rejects.toThrow("secure_storage_key_unavailable");
    expect(missingKey.values.has("capture.drafts.v2.owner-a")).toBe(false);

    const missingSentinel = createHarness();
    (missingSentinel.dependencies.backing.setItem as jest.Mock).mockImplementation(
      async (key: string, value: string) => {
        if (key !== SENTINEL) missingSentinel.values.set(key, value);
      },
    );
    await expect(
      missingSentinel.storage.setItem("capture.drafts.v2.owner-a", "do not persist"),
    ).rejects.toThrow("secure_storage_key_unavailable");
    expect(missingSentinel.values.has("capture.drafts.v2.owner-a")).toBe(false);

    const missingCiphertext = createHarness();
    primeDeviceKey(missingCiphertext);
    (missingCiphertext.dependencies.backing.setItem as jest.Mock).mockImplementation(
      async (key: string, value: string) => {
        if (key !== "capture.drafts.v2.owner-a") missingCiphertext.values.set(key, value);
      },
    );
    await expect(
      missingCiphertext.storage.setItem("capture.drafts.v2.owner-a", "do not acknowledge"),
    ).rejects.toThrow("secure_storage_write_failed");
    expect(missingCiphertext.values.has("capture.drafts.v2.owner-a")).toBe(false);
  });

  test("uses only the recovery-required signal for sentinel-proven key loss or mismatch", async () => {
    const h = createHarness();
    await h.storage.setItem("capture.drafts.v2.owner-a", "survives backup");
    const persisted = h.values.get("capture.drafts.v2.owner-a");

    h.secrets.clear();
    const missing = createEncryptedNativeStorage(h.dependencies);
    await expect(missing.getItem("capture.drafts.v2.owner-a")).rejects.toThrow(
      ENCRYPTED_STORAGE_RECOVERY_REQUIRED,
    );
    expect(h.generatedKeys()).toBe(1);
    expect(h.values.get("capture.drafts.v2.owner-a")).toBe(persisted);

    h.secrets.set(MASTER_KEY, Buffer.alloc(32, 9).toString("base64"));
    const mismatched = createEncryptedNativeStorage(h.dependencies);
    await expect(mismatched.getItem("capture.drafts.v2.owner-a")).rejects.toThrow(
      ENCRYPTED_STORAGE_RECOVERY_REQUIRED,
    );
    expect(h.values.get("capture.drafts.v2.owner-a")).toBe(persisted);
  });

  test("does not mint a split key when ciphertext survives without key metadata", async () => {
    const h = createHarness();
    await h.storage.setItem("capture.drafts.v2.owner-a", "survives partial backup");
    h.secrets.clear();
    h.values.delete(SENTINEL);
    h.values.delete(CAPACITY_LEDGER);

    const reopened = createEncryptedNativeStorage(h.dependencies);
    await expect(reopened.getItem("capture.drafts.v2.owner-a")).rejects.toThrow(
      ENCRYPTED_STORAGE_RECOVERY_REQUIRED,
    );
    expect(h.generatedKeys()).toBe(1);

    const unrelatedWriteFirst = createHarness();
    await unrelatedWriteFirst.storage.setItem(
      "capture.drafts.v2.owner-a",
      "orphan ciphertext",
    );
    unrelatedWriteFirst.secrets.clear();
    unrelatedWriteFirst.values.delete(SENTINEL);
    unrelatedWriteFirst.values.delete(CAPACITY_LEDGER);
    const reopenedForAuth = createEncryptedNativeStorage(unrelatedWriteFirst.dependencies);
    await expect(
      reopenedForAuth.setItem("sb-project-ref-auth-token", "must not create split key"),
    ).rejects.toThrow(ENCRYPTED_STORAGE_RECOVERY_REQUIRED);
    expect(unrelatedWriteFirst.generatedKeys()).toBe(1);
  });

  test("requires recovery when an existing key has lost its ciphertext sentinel", async () => {
    const h = createHarness();
    await h.storage.setItem("capture.drafts.v2.owner-a", "cannot prove key continuity");
    h.values.delete(SENTINEL);

    const reopened = createEncryptedNativeStorage(h.dependencies);
    await expect(reopened.getItem("capture.drafts.v2.owner-a")).rejects.toThrow(
      ENCRYPTED_STORAGE_RECOVERY_REQUIRED,
    );
    expect(h.values.has(SENTINEL)).toBe(false);
  });

  test("does not advertise destructive recovery for transient dependency failures", async () => {
    const h = createHarness();
    await h.storage.setItem("capture.drafts.v2.owner-a", "private state");

    (h.dependencies.crypto.fingerprintKey as jest.Mock).mockRejectedValueOnce(
      new Error("temporary hardware failure"),
    );
    const fingerprintFailure = createEncryptedNativeStorage(h.dependencies);
    await expect(fingerprintFailure.getItem("capture.drafts.v2.owner-a")).rejects.toThrow(
      "secure_storage_key_unavailable",
    );

    (h.dependencies.secrets.getItem as jest.Mock).mockRejectedValueOnce(
      new Error("temporary keychain failure"),
    );
    const keychainFailure = createEncryptedNativeStorage(h.dependencies);
    await expect(keychainFailure.getItem("capture.drafts.v2.owner-a")).rejects.toThrow(
      "secure_storage_key_unavailable",
    );

    (h.dependencies.crypto.decrypt as jest.Mock).mockRejectedValueOnce(
      new Error("temporary crypto service failure"),
    );
    await expect(h.storage.getItem("capture.drafts.v2.owner-a")).rejects.toThrow(
      "secure_storage_decrypt_failed",
    );

    const fresh = createHarness();
    (fresh.dependencies.backing.getAllKeys as jest.Mock).mockRejectedValueOnce(
      new Error("temporary AsyncStorage scan failure"),
    );
    await expect(
      fresh.storage.setItem("sb-project-ref-auth-token", "do not persist"),
    ).rejects.toThrow("secure_storage_key_unavailable");
    expect(fresh.generatedKeys()).toBe(0);
  });

  test("migrates known legacy plaintext durably before any caller can observe it", async () => {
    const h = createHarness();
    h.values.set("capture.drafts.v2.owner-a", "first private draft");
    h.values.set("import.history:user-a", "private filenames");
    h.values.set("ops.github.username:user-a", "private account link");
    h.values.set("secondB_naver_oauth_state", "legacy native OAuth state");
    h.values.set("import.history", "unowned history must stay delete-only");
    h.values.set("secondB_naver_oauth_transaction", "unused namespace");
    h.values.set("theme.preference", "dark");

    const result = await h.storage.migrateLegacyPlaintextAtStartup();

    expect(result).toEqual({ status: "completed", migratedPlaintextKeys: 4 });
    expect(h.values.get("capture.drafts.v2.owner-a")).toMatch(/^SBENC1:/);
    expect(h.values.get("import.history:user-a")).toMatch(/^SBENC1:/);
    expect(h.values.get("ops.github.username:user-a")).toMatch(/^SBENC1:/);
    expect(h.values.get("secondB_naver_oauth_state")).toMatch(/^SBENC1:/);
    expect(h.values.get("import.history")).toBe("unowned history must stay delete-only");
    expect(h.values.get("secondB_naver_oauth_transaction")).toBe("unused namespace");
    expect(h.values.get("theme.preference")).toBe("dark");
    expect(h.values.get(MIGRATION_MARKER)).toBe(ENCRYPTED_STORAGE_MIGRATION_MARKER_VALUE);
    await expect(h.storage.getItem("capture.drafts.v2.owner-a")).resolves.toBe(
      "first private draft",
    );
  });

  test("retries an interrupted migration and never writes a premature marker", async () => {
    const h = createHarness();
    h.values.set("capture.drafts.v2.owner-a", "first");
    h.values.set("import.history:user-a", "second");
    const normalSet = h.dependencies.backing.setItem as jest.Mock;
    let failImportHistory = true;
    normalSet.mockImplementation(async (key: string, value: string) => {
      if (key === "import.history:user-a" && failImportHistory) {
        throw new Error("disk full with sensitive context");
      }
      h.values.set(key, value);
    });

    await expect(h.storage.migrateLegacyPlaintextAtStartup()).rejects.toThrow(
      "secure_storage_migration_failed",
    );
    expect(h.values.has(MIGRATION_MARKER)).toBe(false);
    expect(h.values.get("import.history:user-a")).toBe("second");

    failImportHistory = false;
    await expect(h.storage.migrateLegacyPlaintextAtStartup()).resolves.toEqual({
      status: "completed",
      migratedPlaintextKeys: 1,
    });
    expect(h.values.get(MIGRATION_MARKER)).toBe(ENCRYPTED_STORAGE_MIGRATION_MARKER_VALUE);
  });

  test("invalidates an old migration marker when the allowlist schema changes", async () => {
    const h = createHarness();
    h.values.set(MIGRATION_MARKER, "complete-v1");
    h.values.set("import.history:user-a", "newly allowlisted private history");

    await expect(h.storage.migrateLegacyPlaintextAtStartup()).resolves.toEqual({
      status: "completed",
      migratedPlaintextKeys: 1,
    });
    expect(h.values.get("import.history:user-a")).toMatch(/^SBENC1:/);
    expect(h.values.get(MIGRATION_MARKER)).toBe(ENCRYPTED_STORAGE_MIGRATION_MARKER_VALUE);
  });

  test("isolates auth from an unreadable capture migration and consent clears the blocker", async () => {
    const h = createHarness();
    // Once device-key continuity is established, an unrelated corrupt row must
    // not gate per-key auth access. Fresh-key creation is intentionally stricter.
    primeDeviceKey(h);
    const captureKey = "capture.drafts.v2.oversized-owner";
    const authKey = "sb-project-ref-auth-token";
    h.values.set(captureKey, "x".repeat(MAX_SECURE_PLAINTEXT_BYTES + 1));
    h.values.set(authKey, "legacy auth session");
    (h.dependencies.backing.getItem as jest.Mock).mockImplementation(async (key: string) => {
      if (key === captureKey && h.values.has(key)) throw new Error("CursorWindow row too large");
      return h.values.get(key) ?? null;
    });

    await expect(h.storage.migrateLegacyPlaintextAtStartup()).rejects.toThrow(
      "secure_storage_migration_failed",
    );
    expect(h.values.has(MIGRATION_MARKER)).toBe(false);

    await expect(h.storage.getItem(authKey)).resolves.toBe("legacy auth session");
    await expect(h.storage.setItem(authKey, "renewed auth session")).resolves.toBeUndefined();
    await expect(h.storage.getItem(authKey)).resolves.toBe("renewed auth session");

    await expect(h.storage.recoverAfterUserConsent({
      acknowledgedDataLoss: true,
      action: "discard-unreadable-encrypted-local-data",
    })).resolves.toEqual({ discardedManagedKeys: 2 });
    expect(h.values.has(captureKey)).toBe(false);
    expect(h.values.has(authKey)).toBe(false);
  });

  test("does not return plaintext when its just-in-time encryption is not durable", async () => {
    const h = createHarness();
    h.values.set(MIGRATION_MARKER, ENCRYPTED_STORAGE_MIGRATION_MARKER_VALUE);
    h.values.set("import.history:user-a", "must not escape before durable write");
    primeDeviceKey(h);
    (h.dependencies.backing.setItem as jest.Mock).mockImplementation(
      async (key: string, value: string) => {
        if (key !== "import.history:user-a") h.values.set(key, value);
      },
    );

    await expect(h.storage.getItem("import.history:user-a")).rejects.toThrow(
      "secure_storage_write_failed",
    );
    expect(h.values.get("import.history:user-a")).toBe(
      "must not escape before durable write",
    );
  });

  test("keeps unowned import history delete-only", async () => {
    const h = createHarness();
    h.values.set("import.history", "cross-account legacy history");

    await expect(h.storage.getItem("import.history")).rejects.toThrow(
      "secure_storage_key_invalid",
    );
    await expect(h.storage.setItem("import.history", "must not be reassigned")).rejects.toThrow(
      "secure_storage_key_invalid",
    );
    expect(h.values.get("import.history")).toBe("cross-account legacy history");

    await expect(h.storage.removeItem("import.history")).resolves.toBeUndefined();
    expect(h.values.has("import.history")).toBe(false);
  });

  test("enforces strict logical-key, UTF-16, per-value, and encrypted-envelope bounds", async () => {
    const h = createHarness();
    await expect(h.storage.setItem("", "x")).rejects.toThrow("secure_storage_key_invalid");
    await expect(h.storage.setItem(`bad\u0000key`, "x")).rejects.toThrow(
      "secure_storage_key_invalid",
    );
    await expect(h.storage.setItem("capture.drafts.v2.owner-a", "\ud800")).rejects.toThrow(
      "secure_storage_value_invalid",
    );
    await expect(
      h.storage.setItem("capture.drafts.v2.owner-a", "x".repeat(MAX_SECURE_PLAINTEXT_BYTES + 1)),
    ).rejects.toThrow("secure_storage_value_too_large");

    await h.storage.setItem(
      "capture.drafts.v2.owner-a",
      "x".repeat(MAX_SECURE_PLAINTEXT_BYTES),
    );
    expect(Buffer.byteLength(h.values.get("capture.drafts.v2.owner-a")!, "utf8")).toBeLessThanOrEqual(
      MAX_SECURE_BACKING_VALUE_BYTES,
    );
    expect(MAX_SECURE_BACKING_VALUE_BYTES).toBeLessThan(2 * 1024 * 1024);

    const padded = deterministicSeal("xx", h.secrets.get(MASTER_KEY)!,
      "secondB.secureStorage.v1:capture.drafts.v2.owner-a");
    expect(padded).toMatch(/==$/);
    h.values.set(
      "capture.drafts.v2.owner-a",
      `${ENCRYPTED_STORAGE_PREFIX}${makeNonCanonicalBase64(padded)}`,
    );
    await expect(h.storage.getItem("capture.drafts.v2.owner-a")).rejects.toThrow(
      "secure_storage_decrypt_failed",
    );
  });

  test("bounds enumeration and never reads attacker-controlled keys after the bound trips", async () => {
    const h = createHarness();
    primeDeviceKey(h);
    (h.dependencies.backing.getAllKeys as jest.Mock).mockResolvedValueOnce(
      Array.from({ length: MAX_SECURE_BACKING_KEYS + 1 }, (_, index) => `attacker.${index}`),
    );

    await expect(
      h.storage.migrateLegacyPlaintextAtStartup(),
    ).rejects.toThrow("secure_storage_migration_failed");
    expect(h.dependencies.backing.getItem).not.toHaveBeenCalledWith("attacker.0");
  });

  test("rejects malformed enumerated keys and bounds recovery before deleting anything", async () => {
    const malformed = createHarness();
    primeDeviceKey(malformed);
    (malformed.dependencies.backing.getAllKeys as jest.Mock).mockResolvedValueOnce([
      "attacker\u0000key",
    ]);
    await expect(
      malformed.storage.migrateLegacyPlaintextAtStartup(),
    ).rejects.toThrow("secure_storage_migration_failed");
    expect(malformed.dependencies.backing.getItem).not.toHaveBeenCalledWith("attacker\u0000key");

    const recovery = createHarness();
    recovery.values.set("capture.drafts.v2.owner-a", `${ENCRYPTED_STORAGE_PREFIX}AAAA`);
    const before = new Map(recovery.values);
    (recovery.dependencies.backing.getAllKeys as jest.Mock).mockResolvedValueOnce(
      Array.from({ length: MAX_SECURE_BACKING_KEYS + 1 }, (_, index) => `attacker.${index}`),
    );
    await expect(recovery.storage.recoverAfterUserConsent({
      acknowledgedDataLoss: true,
      action: "discard-unreadable-encrypted-local-data",
    })).rejects.toThrow("secure_storage_recovery_failed");
    expect(recovery.values).toEqual(before);
    expect(recovery.dependencies.backing.removeItem).not.toHaveBeenCalled();
  });

  test("serializes aggregate reservations across keys and preserves the last durable value", async () => {
    const h = createHarness();
    primeDeviceKey(h);
    h.values.set(MIGRATION_MARKER, ENCRYPTED_STORAGE_MIGRATION_MARKER_VALUE);
    seedEnvelopeBytes(h.values, MAX_SECURE_ORDINARY_BACKING_BYTES - 1_500);
    setCapacityLedger(h, totalEnvelopeBytes(h.values));

    const results = await Promise.allSettled([
      h.storage.setItem("capture.drafts.v2.owner-a", "a".repeat(1_000)),
      h.storage.setItem("capture.drafts.v2.owner-b", "b".repeat(1_000)),
    ]);
    expect(results.map(({ status }) => status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(totalEnvelopeBytes(h.values)).toBeLessThanOrEqual(MAX_SECURE_BACKING_TOTAL_BYTES);
    expect(h.values.get(CAPACITY_LEDGER)).toBe(`SBCAP1:${totalEnvelopeBytes(h.values)}`);

    const durable = h.values.get("capture.drafts.v2.owner-a");
    await expect(
      h.storage.setItem("capture.drafts.v2.owner-a", "z".repeat(MAX_SECURE_PLAINTEXT_BYTES)),
    ).rejects.toThrow("secure_storage_capacity_exceeded");
    expect(h.values.get("capture.drafts.v2.owner-a")).toBe(durable);
  });

  test("rolls back failed growth reservations instead of consuming capacity on every retry", async () => {
    const h = createHarness();
    primeDeviceKey(h);
    seedEnvelopeBytes(h.values, MAX_SECURE_ORDINARY_BACKING_BYTES - 2_000);
    setCapacityLedger(h, totalEnvelopeBytes(h.values));
    const baseline = h.values.get(CAPACITY_LEDGER);
    const normalSet = h.dependencies.backing.setItem as jest.Mock;
    let remainingFailures = 3;
    normalSet.mockImplementation(async (key: string, value: string) => {
      if (key === "capture.drafts.v2.retry" && remainingFailures > 0) {
        remainingFailures -= 1;
        throw new Error("transient backing write failure");
      }
      h.values.set(key, value);
    });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(
        h.storage.setItem("capture.drafts.v2.retry", "x".repeat(1_000)),
      ).rejects.toThrow("secure_storage_write_failed");
      expect(h.values.get(CAPACITY_LEDGER)).toBe(baseline);
    }

    await expect(
      h.storage.setItem("capture.drafts.v2.retry", "x".repeat(1_000)),
    ).resolves.toBeUndefined();
    await expect(h.storage.getItem("capture.drafts.v2.retry")).resolves.toBe(
      "x".repeat(1_000),
    );
  });

  test("reconciles a crash-overcounted ledger only when it would reject safe growth", async () => {
    const h = createHarness();
    primeDeviceKey(h);
    // Models a delete/shrink that became durable immediately before the ledger
    // decrement crashed: no ciphertext remains, but the old reservation does.
    setCapacityLedger(h, MAX_SECURE_ORDINARY_BACKING_BYTES);

    await expect(
      h.storage.setItem("capture.drafts.v2.after-crash", "safe after reconciliation"),
    ).resolves.toBeUndefined();
    await expect(h.storage.getItem("capture.drafts.v2.after-crash")).resolves.toBe(
      "safe after reconciliation",
    );
    expect(h.dependencies.backing.getAllKeys).toHaveBeenCalledTimes(1);
    expect(h.values.get(CAPACITY_LEDGER)).toBe(`SBCAP1:${totalEnvelopeBytes(h.values)}`);
  });

  test("reserves independent audit and auth capacity above the ordinary-data cap", async () => {
    const h = createHarness();
    primeDeviceKey(h);
    seedEnvelopeBytes(h.values, MAX_SECURE_ORDINARY_BACKING_BYTES);
    setCapacityLedger(h, totalEnvelopeBytes(h.values));

    await expect(
      h.storage.setItem("capture.drafts.v2.blocked", "x"),
    ).rejects.toThrow("secure_storage_capacity_exceeded");
    await expect(
      h.storage.setItem("llm.auditWriteOutbox.v1", "a".repeat(1_000_000)),
    ).resolves.toBeUndefined();
    await expect(h.storage.getItem("llm.auditWriteOutbox.v1")).resolves.toBe(
      "a".repeat(1_000_000),
    );
    await expect(
      h.storage.setItem("sb-project-ref-auth-token", "small refresh-capable session"),
    ).resolves.toBeUndefined();
    await expect(h.storage.getItem("sb-project-ref-auth-token")).resolves.toBe(
      "small refresh-capable session",
    );

    expect(SECURE_AUTH_RESERVE_BYTES).toBe(256 * 1024);
    expect(SECURE_AUDIT_RESERVE_BYTES).toBe(1_500_000);
    expect(MAX_SECURE_NON_AUTH_BACKING_BYTES).toBe(
      MAX_SECURE_ORDINARY_BACKING_BYTES + SECURE_AUDIT_RESERVE_BYTES,
    );
    expect(totalEnvelopeBytes(h.values)).toBeLessThanOrEqual(MAX_SECURE_BACKING_TOTAL_BYTES);
    expect(h.values.get(CAPACITY_LEDGER)).toBe(`SBCAP1:${totalEnvelopeBytes(h.values)}`);
  });

  test("allows bounded shrink/delete recovery from an over-cap store", async () => {
    const h = createHarness();
    primeDeviceKey(h);
    h.values.set(MIGRATION_MARKER, ENCRYPTED_STORAGE_MIGRATION_MARKER_VALUE);
    h.values.set("capture.drafts.v2.owner-a", envelopeOfSize(1_100_000));
    seedEnvelopeBytes(h.values, MAX_SECURE_BACKING_TOTAL_BYTES - 900_000);
    const before = totalEnvelopeBytes(h.values);
    setCapacityLedger(h, before);

    await h.storage.setItem("capture.drafts.v2.owner-a", "x".repeat(700_000));
    expect(totalEnvelopeBytes(h.values)).toBeLessThan(before);
    expect(h.values.get(CAPACITY_LEDGER)).toBe(`SBCAP1:${totalEnvelopeBytes(h.values)}`);
    await expect(h.storage.removeItem("capture.drafts.v2.owner-a")).resolves.toBeUndefined();
    expect(h.values.has("capture.drafts.v2.owner-a")).toBe(false);
  });

  test("requires typed data-loss consent and removes all managed local values", async () => {
    const h = createHarness();
    await h.storage.setItem("capture.drafts.v2.owner-a", "unreadable later");
    await h.storage.setItem("import.history:user-a", "private filenames");
    h.values.set("secondB_naver_oauth_state", "unmigrated managed plaintext");
    h.values.set("import.history", "unowned history remains delete-only elsewhere");
    h.values.set("unrelated.preference", "keep-me");
    const before = new Map(h.values);

    await expect(h.storage.recoverAfterUserConsent(undefined as never)).rejects.toThrow(
      "secure_storage_recovery_consent_required",
    );
    expect(h.values).toEqual(before);

    await expect(h.storage.recoverAfterUserConsent({
      acknowledgedDataLoss: true,
      action: "discard-unreadable-encrypted-local-data",
    })).resolves.toEqual({ discardedManagedKeys: 4 });
    expect(h.values.has("secondB_naver_oauth_state")).toBe(false);
    expect(h.values.has("import.history")).toBe(false);
    expect(h.values.get("unrelated.preference")).toBe("keep-me");
    expect(h.values.has(MIGRATION_MARKER)).toBe(false);
    expect(h.values.has(SENTINEL)).toBe(false);
    expect(h.secrets.has(MASTER_KEY)).toBe(false);

    await h.storage.setItem("capture.drafts.v2.owner-a", "fresh start");
    await expect(h.storage.getItem("capture.drafts.v2.owner-a")).resolves.toBe("fresh start");
    expect(h.generatedKeys()).toBe(2);
  });

  test("keeps key and sentinel fail-closed when consented recovery is interrupted", async () => {
    const h = createHarness();
    await h.storage.setItem("capture.drafts.v2.owner-a", "first encrypted value");
    await h.storage.setItem("capture.drafts.v2.owner-b", "second encrypted value");
    const normalRemove = h.dependencies.backing.removeItem as jest.Mock;
    let interrupt = true;
    normalRemove.mockImplementation(async (key: string) => {
      if (key === "capture.drafts.v2.owner-a" && interrupt) {
        h.values.delete(key);
        throw new Error("interrupted after partial delete");
      }
      h.values.delete(key);
    });

    await expect(h.storage.recoverAfterUserConsent({
      acknowledgedDataLoss: true,
      action: "discard-unreadable-encrypted-local-data",
    })).rejects.toThrow("secure_storage_recovery_failed");
    expect(h.secrets.has(MASTER_KEY)).toBe(true);
    expect(h.values.has(SENTINEL)).toBe(true);

    interrupt = false;
    await expect(h.storage.recoverAfterUserConsent({
      acknowledgedDataLoss: true,
      action: "discard-unreadable-encrypted-local-data",
    })).resolves.toEqual({ discardedManagedKeys: 1 });
    expect(h.secrets.has(MASTER_KEY)).toBe(false);
    expect(h.values.has(SENTINEL)).toBe(false);
  });

  test("serializes maintenance against in-flight writes", async () => {
    const h = createHarness();
    h.values.set(MIGRATION_MARKER, ENCRYPTED_STORAGE_MIGRATION_MARKER_VALUE);
    const normalEncrypt = h.dependencies.crypto.encrypt as jest.Mock;
    let releaseWrite!: () => void;
    const gate = new Promise<void>((resolve) => { releaseWrite = resolve; });
    normalEncrypt.mockImplementationOnce(async (plaintext: string, key: string, aad: string) => {
      await gate;
      return deterministicSeal(plaintext, key, aad);
    });

    const write = h.storage.setItem("capture.drafts.v2.owner-a", "in flight");
    const recovery = h.storage.recoverAfterUserConsent({
      acknowledgedDataLoss: true,
      action: "discard-unreadable-encrypted-local-data",
    });
    await Promise.resolve();
    expect(h.dependencies.secrets.removeItem).not.toHaveBeenCalled();
    releaseWrite();
    await write;
    await recovery;
    expect(h.values.has("capture.drafts.v2.owner-a")).toBe(false);
  });

  test("sanitizes dependency failures so keys, values, and adapter errors never escape", async () => {
    const h = createHarness();
    h.values.set(MIGRATION_MARKER, ENCRYPTED_STORAGE_MIGRATION_MARKER_VALUE);
    const logicalKey = "capture.drafts.v2.secret-owner";
    const plaintext = "highly private plaintext";
    primeDeviceKey(h);
    (h.dependencies.backing.setItem as jest.Mock).mockImplementation(
      async (key: string, value: string) => {
        if (key === logicalKey) throw new Error(`${logicalKey}:${plaintext}:disk path`);
        h.values.set(key, value);
      },
    );

    let caught: unknown;
    try {
      await h.storage.setItem(logicalKey, plaintext);
    } catch (error) {
      caught = error;
    }
    expect(caught).toEqual(expect.objectContaining({ message: "secure_storage_write_failed" }));
    expect(String(caught)).not.toContain(logicalKey);
    expect(String(caught)).not.toContain(plaintext);
    expect(String(caught)).not.toContain("disk path");
  });
});

describe("native production adapter", () => {
  afterEach(() => {
    __resetEncryptedNativeStorageForTests();
    jest.dontMock("@react-native-async-storage/async-storage");
    jest.dontMock("expo-secure-store");
    jest.dontMock("expo-crypto");
  });

  test("uses the Expo 56 base64 AES contract and device-only SecureStore", async () => {
    const h = createHarness();
    const fromCombined = jest.fn((combined: unknown) => {
      if (typeof combined !== "string") throw new Error("base64_string_required");
      return combined;
    });
    jest.doMock(
      "@react-native-async-storage/async-storage",
      () => ({ default: h.dependencies.backing }),
    );
    jest.doMock("expo-secure-store", () => ({
      WHEN_UNLOCKED_THIS_DEVICE_ONLY: "device-only",
      isAvailableAsync: async () => true,
      getItemAsync: h.dependencies.secrets.getItem,
      setItemAsync: h.dependencies.secrets.setItem,
      deleteItemAsync: h.dependencies.secrets.removeItem,
    }), { virtual: true });
    jest.doMock("expo-crypto", () => ({
      CryptoDigestAlgorithm: { SHA256: "SHA-256" },
      digestStringAsync: async (_algorithm: string, value: string) => stableHash(value),
      AESEncryptionKey: {
        generate: async () => ({ encoded: () => h.dependencies.crypto.generateKey() }),
        import: async (encoded: string) => encoded,
      },
      AESSealedData: { fromCombined },
      aesEncryptAsync: async (
        plaintext: Uint8Array,
        key: string,
        options: { additionalData: Uint8Array },
      ) => ({
        combined: () => h.dependencies.crypto.encrypt(
          decoder.decode(plaintext),
          key,
          decoder.decode(options.additionalData),
        ),
      }),
      aesDecryptAsync: async (
        sealed: string,
        key: string,
        options: { additionalData: Uint8Array },
      ) => encoder.encode(await h.dependencies.crypto.decrypt(
        sealed,
        key,
        decoder.decode(options.additionalData),
      )),
    }));

    const storage = getEncryptedNativeStorage();
    await storage.setItem("capture.drafts.v2.owner-a", "오늘 기록: 다시 읽기");
    await expect(storage.getItem("capture.drafts.v2.owner-a")).resolves.toBe(
      "오늘 기록: 다시 읽기",
    );
    expect(fromCombined).toHaveBeenCalled();
    expect(fromCombined).toHaveBeenCalledWith(expect.stringMatching(/^[A-Za-z0-9+/]+=*$/));
    expect(h.generatedKeys()).toBe(1);
  });

  test("rejects web runtime access before loading native modules", () => {
    const asyncStorageFactory = jest.fn(() => ({ default: {} }));
    const secureStoreFactory = jest.fn(() => ({}));
    jest.doMock("@react-native-async-storage/async-storage", asyncStorageFactory);
    jest.doMock("expo-secure-store", secureStoreFactory, { virtual: true });
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "document");
    Object.defineProperty(globalThis, "document", { configurable: true, value: {} });
    try {
      expect(() => getEncryptedNativeStorage()).toThrow("secure_storage_native_only");
      expect(asyncStorageFactory).not.toHaveBeenCalled();
      expect(secureStoreFactory).not.toHaveBeenCalled();
    } finally {
      if (descriptor) Object.defineProperty(globalThis, "document", descriptor);
      else Reflect.deleteProperty(globalThis, "document");
    }
  });

  test("keeps native imports lazy and pins the production cryptographic contract", () => {
    const source = readFileSync(join(__dirname, "..", "encrypted-native-storage.ts"), "utf8");
    const webGuard = source.indexOf('typeof document !== "undefined"');
    const secureStoreRequire = source.indexOf('require("expo-secure-store")');
    expect(webGuard).toBeGreaterThan(0);
    expect(secureStoreRequire).toBeGreaterThan(webGuard);
    expect(source).not.toContain('typeof import("expo-secure-store")');
    expect(source).toContain("AESEncryptionKey.generate(256)");
    expect(source).toContain("aesEncryptAsync");
    expect(source).toContain("AESSealedData.fromCombined");
    expect(source).toContain("aesDecryptAsync");
    expect(source).toContain("additionalData");
    expect(source).toContain("nonce: { length: 12 }");
    expect(source).toContain("tagLength: 16");
    expect(source).toContain("WHEN_UNLOCKED_THIS_DEVICE_ONLY");
    expect(source).toContain('new TextDecoder("utf-8", { fatal: true })');
    expect(source).not.toContain("atob(");
    expect(source).not.toMatch(/console\.(?:log|info|warn|error|debug)/);
  });
});

test("native manifests pin SecureStore without weakening Android backup protection", () => {
  const app = JSON.parse(readFileSync(join(process.cwd(), "app.json"), "utf8")) as {
    expo?: { android?: { allowBackup?: boolean }; plugins?: Array<string | [string, unknown]> };
  };
  const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
  };
  const lock = JSON.parse(readFileSync(join(process.cwd(), "package-lock.json"), "utf8")) as {
    packages?: Record<string, { version?: string; license?: string; dependencies?: Record<string, string> }>;
  };
  const pluginNames = (app.expo?.plugins ?? []).map((plugin) =>
    typeof plugin === "string" ? plugin : plugin[0]
  );

  expect(app.expo?.android?.allowBackup).toBe(false);
  expect(pluginNames).toContain("expo-secure-store");
  expect(pkg.dependencies?.["expo-secure-store"]).toBe("~56.0.4");
  expect(lock.packages?.[""]?.dependencies?.["expo-secure-store"]).toBe("~56.0.4");
  expect(lock.packages?.["node_modules/expo-secure-store"]).toEqual(expect.objectContaining({
    version: "56.0.4",
    license: "MIT",
  }));
});
