// Native-only encrypted key/value storage. Large values stay in AsyncStorage
// as AES-256-GCM ciphertext; only the master key is kept in device-protected
// SecureStore. Native modules are resolved lazily to keep web execution inert.

export interface StringStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

interface EnumerableStringStorage extends StringStorage {
  getAllKeys(): Promise<readonly string[]>;
}

interface SecretStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

interface AuthenticatedCrypto {
  generateKey(): Promise<string>;
  fingerprintKey(encodedKey: string): Promise<string>;
  encrypt(plaintext: string, encodedKey: string, aad: string): Promise<string>;
  decrypt(sealed: string, encodedKey: string, aad: string): Promise<string>;
}

export interface EncryptedNativeStorageDependencies {
  backing: EnumerableStringStorage;
  secrets: SecretStorage;
  crypto: AuthenticatedCrypto;
}

export interface EncryptedNativeStorageRecoveryConsent {
  acknowledgedDataLoss: true;
  action: "discard-unreadable-encrypted-local-data";
}

export interface EncryptedNativeStorage extends StringStorage {
  recoverAfterUserConsent(
    consent: EncryptedNativeStorageRecoveryConsent,
  ): Promise<{ discardedManagedKeys: number }>;
  migrateLegacyPlaintextAtStartup(): Promise<{
    status: "completed" | "already-complete";
    migratedPlaintextKeys: number;
  }>;
}

export const ENCRYPTED_STORAGE_PREFIX = "SBENC1:";
export const ENCRYPTED_STORAGE_RECOVERY_REQUIRED = "secure_storage_recovery_required";
export const MAX_SECURE_BACKING_VALUE_BYTES = 1_900_000;
export const MAX_SECURE_PLAINTEXT_BYTES = 1_400_000;
export const MAX_SECURE_BACKING_TOTAL_BYTES = 4 * 1024 * 1024;
export const SECURE_AUTH_RESERVE_BYTES = 256 * 1024;
export const SECURE_AUDIT_RESERVE_BYTES = 1_500_000;
export const MAX_SECURE_NON_AUTH_BACKING_BYTES =
  MAX_SECURE_BACKING_TOTAL_BYTES - SECURE_AUTH_RESERVE_BYTES;
export const MAX_SECURE_ORDINARY_BACKING_BYTES =
  MAX_SECURE_NON_AUTH_BACKING_BYTES - SECURE_AUDIT_RESERVE_BYTES;
export const MAX_SECURE_BACKING_KEYS = 2_048;

const MAX_LOGICAL_KEY_BYTES = 512;
const MAX_ENUMERATED_KEY_BYTES = 1_024;
const MASTER_KEY_NAME = "secondB.secureStorage.master.v1";
const AAD_PREFIX = "secondB.secureStorage.v1:";
const KEY_SENTINEL_NAME = "secondB.secureStorage.keySentinel.v1";
const KEY_SENTINEL_PREFIX = "SBKEY1:";
const LEGACY_MIGRATION_MARKER_NAME = "secondB.secureStorage.plaintextMigration.v1";
const CAPACITY_LEDGER_NAME = "secondB.secureStorage.capacity.v1";
const CAPACITY_LEDGER_PREFIX = "SBCAP1:";
const CAPACITY_EXCEEDED_ERROR = "secure_storage_capacity_exceeded";
const RESERVED_BACKING_PREFIX = "secondB.secureStorage.";
const BASE64_256_BIT_KEY = /^[A-Za-z0-9+/]{43}=$/;
const BASE64_VALUE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const KEY_FINGERPRINT = /^[0-9a-f]{64}$/;
const KEY_SENTINEL = /^SBKEY1:[0-9a-f]{64}$/;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;

const MANAGED_EXACT_KEYS = new Set([
  "account.localPurgeRetry.v1",
  "capture.preauthPending.v1",
  "llm.auditWriteOutbox.v1",
  "llm.auditWriteOutbox.recovery.v1",
  "secondbrain.auth.recovery-pending.v1",
  "secondbrain.auth.recovery-proof.v1",
  "secondB_naver_oauth_state",
]);
const DELETE_ONLY_KEYS = new Set(["import.history"]);
const MANAGED_KEY_PREFIXES = [
  "capture.drafts.v2.",
  "capture.journalDraft.v1.",
  "import.history:",
  "ops.github.username:",
];
const SUPABASE_AUTH_KEY_PATTERN = /^sb-[a-z0-9_-]+-auth-token(?:-code-verifier)?$/i;

function migrationSchemaFingerprint(): string {
  const descriptor = [
    ...[...MANAGED_EXACT_KEYS].sort().map((key) => `exact:${key}`),
    ...[...MANAGED_KEY_PREFIXES].sort().map((prefix) => `prefix:${prefix}`),
    `pattern:${SUPABASE_AUTH_KEY_PATTERN.source}/${SUPABASE_AUTH_KEY_PATTERN.flags}`,
  ].join("\n");
  let state = 0x811c9dc5;
  for (const unit of descriptor) {
    state ^= unit.charCodeAt(0);
    state = Math.imul(state, 0x01000193) >>> 0;
  }
  return state.toString(16).padStart(8, "0");
}

// The marker is bound to the exact allowlist. Adding or renaming a managed
// namespace changes this value automatically, forcing a bounded rescan.
export const ENCRYPTED_STORAGE_MIGRATION_MARKER_VALUE =
  `complete-v2:${migrationSchemaFingerprint()}`;

function isManagedDataKey(key: string): boolean {
  return MANAGED_EXACT_KEYS.has(key)
    || MANAGED_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))
    || isAuthDataKey(key);
}

function isAuthDataKey(key: string): boolean {
  return SUPABASE_AUTH_KEY_PATTERN.test(key);
}

function isAuditCriticalDataKey(key: string): boolean {
  return key === "account.localPurgeRetry.v1"
    || key === "llm.auditWriteOutbox.v1"
    || key === "llm.auditWriteOutbox.recovery.v1";
}

function isWellFormedUtf16(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function utf8Size(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function assertLogicalKeyShape(key: string): void {
  if (
    typeof key !== "string"
    || key.length === 0
    || key.startsWith(RESERVED_BACKING_PREFIX)
    || CONTROL_CHARACTER.test(key)
    || !isWellFormedUtf16(key)
    || utf8Size(key) > MAX_LOGICAL_KEY_BYTES
  ) {
    throw new Error("secure_storage_key_invalid");
  }
}

function assertManagedLogicalKey(key: string): void {
  assertLogicalKeyShape(key);
  if (!isManagedDataKey(key)) throw new Error("secure_storage_key_invalid");
}

function assertRemovableLogicalKey(key: string): void {
  assertLogicalKeyShape(key);
  if (!isManagedDataKey(key) && !DELETE_ONLY_KEYS.has(key)) {
    throw new Error("secure_storage_key_invalid");
  }
}

function assertPlaintext(value: string): void {
  if (typeof value !== "string" || !isWellFormedUtf16(value)) {
    throw new Error("secure_storage_value_invalid");
  }
  if (utf8Size(value) > MAX_SECURE_PLAINTEXT_BYTES) {
    throw new Error("secure_storage_value_too_large");
  }
}

function isCanonicalBase64(value: string): boolean {
  if (value.length === 0 || value.length % 4 !== 0 || !BASE64_VALUE.test(value)) {
    return false;
  }
  if (value.endsWith("==")) {
    return (BASE64_ALPHABET.indexOf(value[value.length - 3]) & 0x0f) === 0;
  }
  if (value.endsWith("=")) {
    return (BASE64_ALPHABET.indexOf(value[value.length - 2]) & 0x03) === 0;
  }
  return true;
}

function assertEncodedMasterKey(encodedKey: string): void {
  if (
    typeof encodedKey !== "string"
    || !BASE64_256_BIT_KEY.test(encodedKey)
    || !isCanonicalBase64(encodedKey)
  ) {
    throw new Error("secure_storage_key_invalid");
  }
}

export function createEncryptedNativeStorage(
  dependencies: EncryptedNativeStorageDependencies,
): EncryptedNativeStorage {
  let masterKeyPromise: Promise<string> | null = null;
  const keyQueues = new Map<string, Promise<void>>();
  let maintenanceTail: Promise<void> = Promise.resolve();
  let capacityTail: Promise<void> = Promise.resolve();
  let encryptedBackingBytes: number | null = null;
  let capacityMeasurementVerified = false;

  async function readSentinel(): Promise<string | null> {
    try {
      const sentinel = await dependencies.backing.getItem(KEY_SENTINEL_NAME);
      if (typeof sentinel !== "string" && sentinel !== null) {
        throw new Error("invalid_sentinel");
      }
      return sentinel;
    } catch {
      throw new Error("secure_storage_key_unavailable");
    }
  }

  async function fingerprintKey(encodedKey: string): Promise<string> {
    try {
      const fingerprint = (await dependencies.crypto.fingerprintKey(encodedKey)).toLowerCase();
      if (!KEY_FINGERPRINT.test(fingerprint)) throw new Error("invalid_fingerprint");
      return fingerprint;
    } catch {
      throw new Error("secure_storage_key_unavailable");
    }
  }

  async function writeSentinel(encodedKey: string): Promise<void> {
    const sentinel = `${KEY_SENTINEL_PREFIX}${await fingerprintKey(encodedKey)}`;
    try {
      await dependencies.backing.setItem(KEY_SENTINEL_NAME, sentinel);
      if ((await dependencies.backing.getItem(KEY_SENTINEL_NAME)) !== sentinel) {
        throw new Error("sentinel_write_not_durable");
      }
    } catch {
      throw new Error("secure_storage_key_unavailable");
    }
  }

  async function validateSentinel(encodedKey: string, sentinel: string): Promise<void> {
    if (!KEY_SENTINEL.test(sentinel)) {
      throw new Error("secure_storage_key_unavailable");
    }
    const actualFingerprint = await fingerprintKey(encodedKey);
    if (sentinel !== `${KEY_SENTINEL_PREFIX}${actualFingerprint}`) {
      throw new Error(ENCRYPTED_STORAGE_RECOVERY_REQUIRED);
    }
  }

  async function readCapacityLedger(errorCode: string): Promise<number | null> {
    try {
      const raw = await dependencies.backing.getItem(CAPACITY_LEDGER_NAME);
      if (raw === null) return null;
      if (!/^SBCAP1:(?:0|[1-9]\d{0,15})$/.test(raw)) throw new Error("invalid_ledger");
      const total = Number(raw.slice(CAPACITY_LEDGER_PREFIX.length));
      if (!Number.isSafeInteger(total) || total < 0) throw new Error("invalid_ledger");
      return total;
    } catch {
      encryptedBackingBytes = null;
      capacityMeasurementVerified = false;
      throw new Error(errorCode);
    }
  }

  async function writeCapacityLedger(total: number, errorCode: string): Promise<void> {
    if (!Number.isSafeInteger(total) || total < 0) throw new Error(errorCode);
    const value = `${CAPACITY_LEDGER_PREFIX}${total}`;
    try {
      await dependencies.backing.setItem(CAPACITY_LEDGER_NAME, value);
      if ((await dependencies.backing.getItem(CAPACITY_LEDGER_NAME)) !== value) {
        throw new Error("ledger_write_not_durable");
      }
    } catch {
      encryptedBackingBytes = null;
      capacityMeasurementVerified = false;
      throw new Error(errorCode);
    }
  }

  async function hasEncryptedBackingEvidence(): Promise<boolean> {
    const keys = await boundedBackingKeys("secure_storage_key_unavailable");
    try {
      for (const key of keys) {
        const value = await dependencies.backing.getItem(key);
        if (typeof value !== "string" && value !== null) {
          throw new Error("invalid_backing_value");
        }
        if (value?.startsWith(ENCRYPTED_STORAGE_PREFIX)) return true;
      }
      return false;
    } catch {
      throw new Error("secure_storage_key_unavailable");
    }
  }

  function masterKey(): Promise<string> {
    if (!masterKeyPromise) {
      masterKeyPromise = (async () => {
        try {
          const existing = await dependencies.secrets.getItem(MASTER_KEY_NAME);
          const sentinel = await readSentinel();
          if (existing !== null) {
            try {
              assertEncodedMasterKey(existing);
            } catch {
              if (sentinel !== null) throw new Error(ENCRYPTED_STORAGE_RECOVERY_REQUIRED);
              throw new Error("secure_storage_key_unavailable");
            }
            if (sentinel !== null) await validateSentinel(existing, sentinel);
            const ledger = await readCapacityLedger("secure_storage_key_unavailable");
            if (sentinel === null) {
              if (ledger !== null && ledger !== 0) {
                throw new Error(ENCRYPTED_STORAGE_RECOVERY_REQUIRED);
              }
              if (await hasEncryptedBackingEvidence()) {
                throw new Error(ENCRYPTED_STORAGE_RECOVERY_REQUIRED);
              }
              if (ledger === null) {
                await writeCapacityLedger(0, "secure_storage_key_unavailable");
              }
              capacityMeasurementVerified = true;
              await writeSentinel(existing);
            } else if (ledger === null) throw new Error("secure_storage_key_unavailable");
            return existing;
          }

          if (sentinel !== null) {
            // AsyncStorage can be restored from backup while this-device-only
            // SecureStore cannot. Never mint a split key beside old ciphertext.
            throw new Error(ENCRYPTED_STORAGE_RECOVERY_REQUIRED);
          }
          const ledger = await readCapacityLedger("secure_storage_key_unavailable");
          if (ledger !== null && ledger !== 0) {
            throw new Error(ENCRYPTED_STORAGE_RECOVERY_REQUIRED);
          }
          if (await hasEncryptedBackingEvidence()) {
            throw new Error(ENCRYPTED_STORAGE_RECOVERY_REQUIRED);
          }
          if (ledger === null) {
            await writeCapacityLedger(0, "secure_storage_key_unavailable");
          }
          capacityMeasurementVerified = true;

          const generated = await dependencies.crypto.generateKey();
          assertEncodedMasterKey(generated);
          await dependencies.secrets.setItem(MASTER_KEY_NAME, generated);
          if ((await dependencies.secrets.getItem(MASTER_KEY_NAME)) !== generated) {
            throw new Error("key_write_not_durable");
          }
          await writeSentinel(generated);
          return generated;
        } catch (error) {
          masterKeyPromise = null;
          if (
            error instanceof Error
            && error.message === ENCRYPTED_STORAGE_RECOVERY_REQUIRED
          ) {
            throw error;
          }
          throw new Error("secure_storage_key_unavailable");
        }
      })();
    }
    return masterKeyPromise;
  }

  function enqueue<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const maintenance = maintenanceTail;
    const previous = keyQueues.get(key) ?? Promise.resolve();
    const result = Promise.all([
      maintenance.catch(() => undefined),
      previous.catch(() => undefined),
    ]).then(operation);
    const tail = result.then(() => undefined, () => undefined);
    keyQueues.set(key, tail);
    void tail.then(() => {
      if (keyQueues.get(key) === tail) keyQueues.delete(key);
    });
    return result;
  }

  function runMaintenance<T>(operation: () => Promise<T>): Promise<T> {
    const previousMaintenance = maintenanceTail;
    const existingOperations = [...keyQueues.values()];
    const result = Promise.all([
      previousMaintenance.catch(() => undefined),
      ...existingOperations.map((pending) => pending.catch(() => undefined)),
    ]).then(operation);
    maintenanceTail = result.then(() => undefined, () => undefined);
    return result;
  }

  function runCapacityMutation<T>(operation: () => Promise<T>): Promise<T> {
    const previous = capacityTail;
    const result = previous.catch(() => undefined).then(operation);
    capacityTail = result.then(() => undefined, () => undefined);
    return result;
  }

  async function boundedBackingKeys(errorCode: string): Promise<string[]> {
    try {
      const keys = await dependencies.backing.getAllKeys();
      if (!Array.isArray(keys) || keys.length > MAX_SECURE_BACKING_KEYS) {
        throw new Error("invalid_key_list");
      }
      const unique = new Set<string>();
      for (const key of keys) {
        if (
          typeof key !== "string"
          || key.length === 0
          || CONTROL_CHARACTER.test(key)
          || !isWellFormedUtf16(key)
          || utf8Size(key) > MAX_ENUMERATED_KEY_BYTES
        ) {
          throw new Error("invalid_backing_key");
        }
        unique.add(key);
      }
      return [...unique].sort();
    } catch {
      throw new Error(errorCode);
    }
  }

  async function currentEncryptedBackingBytes(): Promise<number> {
    if (encryptedBackingBytes === null) {
      const ledger = await readCapacityLedger("secure_storage_capacity_check_failed");
      if (ledger === null) throw new Error("secure_storage_capacity_check_failed");
      encryptedBackingBytes = ledger;
    }
    return encryptedBackingBytes;
  }

  async function reconcileEncryptedBackingBytes(): Promise<number> {
    try {
      const keys = await boundedBackingKeys("secure_storage_capacity_check_failed");
      let actualBytes = 0;
      for (const key of keys) {
        if (!isManagedDataKey(key) && !DELETE_ONLY_KEYS.has(key)) continue;
        const value = await dependencies.backing.getItem(key);
        if (typeof value !== "string" && value !== null) {
          throw new Error("invalid_backing_value");
        }
        if (!value?.startsWith(ENCRYPTED_STORAGE_PREFIX)) continue;
        if (value.length > MAX_SECURE_BACKING_VALUE_BYTES) {
          throw new Error("invalid_backing_value");
        }
        const valueBytes = utf8Size(value);
        if (valueBytes > MAX_SECURE_BACKING_VALUE_BYTES) {
          throw new Error("invalid_backing_value");
        }
        actualBytes += valueBytes;
        if (!Number.isSafeInteger(actualBytes)) throw new Error("invalid_backing_total");
      }
      await writeCapacityLedger(actualBytes, "secure_storage_capacity_check_failed");
      encryptedBackingBytes = actualBytes;
      capacityMeasurementVerified = true;
      return actualBytes;
    } catch {
      encryptedBackingBytes = null;
      capacityMeasurementVerified = false;
      throw new Error("secure_storage_capacity_check_failed");
    }
  }

  async function writeEncryptedWithinCapacity(
    key: string,
    encrypted: string,
    verifyDurability = false,
  ): Promise<void> {
    return runCapacityMutation(async () => {
      let total: number;
      let current: string | null;
      try {
        total = await currentEncryptedBackingBytes();
        current = await dependencies.backing.getItem(key);
        if (typeof current !== "string" && current !== null) {
          throw new Error("invalid_backing_value");
        }
      } catch (error) {
        encryptedBackingBytes = null;
        if (
          error instanceof Error
          && error.message === "secure_storage_capacity_check_failed"
        ) {
          throw error;
        }
        throw new Error("secure_storage_capacity_check_failed");
      }

      const previousBytes = current?.startsWith(ENCRYPTED_STORAGE_PREFIX)
        ? utf8Size(current)
        : 0;
      const nextBytes = utf8Size(encrypted);
      let projectedBytes = total - previousBytes + nextBytes;
      if (!Number.isSafeInteger(projectedBytes) || projectedBytes < 0) {
        encryptedBackingBytes = null;
        throw new Error("secure_storage_capacity_check_failed");
      }
      const growthLimit = isAuthDataKey(key)
        ? MAX_SECURE_BACKING_TOTAL_BYTES
        : isAuditCriticalDataKey(key)
          ? MAX_SECURE_NON_AUTH_BACKING_BYTES
          : MAX_SECURE_ORDINARY_BACKING_BYTES;
      if (nextBytes > previousBytes && projectedBytes > growthLimit) {
        if (!capacityMeasurementVerified) {
          total = await reconcileEncryptedBackingBytes();
          projectedBytes = total - previousBytes + nextBytes;
          if (!Number.isSafeInteger(projectedBytes) || projectedBytes < 0) {
            encryptedBackingBytes = null;
            capacityMeasurementVerified = false;
            throw new Error("secure_storage_capacity_check_failed");
          }
        }
        if (projectedBytes > growthLimit) throw new Error(CAPACITY_EXCEEDED_ERROR);
      }

      // Reserve growth before the ciphertext write. A crash can conservatively
      // over-count capacity, but can never leave newly written bytes uncounted.
      if (projectedBytes > total) {
        await writeCapacityLedger(projectedBytes, "secure_storage_capacity_check_failed");
        encryptedBackingBytes = projectedBytes;
      }
      try {
        await dependencies.backing.setItem(key, encrypted);
        if (verifyDurability && (await dependencies.backing.getItem(key)) !== encrypted) {
          throw new Error("ciphertext_write_not_durable");
        }
      } catch {
        let observed: string | null;
        try {
          observed = await dependencies.backing.getItem(key);
          if (typeof observed !== "string" && observed !== null) {
            throw new Error("invalid_backing_value");
          }
        } catch {
          encryptedBackingBytes = null;
          capacityMeasurementVerified = false;
          throw new Error("secure_storage_write_failed");
        }

        if (observed !== encrypted) {
          if (observed === current && projectedBytes > total) {
            try {
              await writeCapacityLedger(total, "secure_storage_capacity_check_failed");
              encryptedBackingBytes = total;
            } catch {
              // An uncertain rollback keeps the larger reservation fail-closed.
              encryptedBackingBytes = null;
              capacityMeasurementVerified = false;
            }
          } else if (observed !== current) {
            // A third state indicates an out-of-band race; retain the reservation.
            encryptedBackingBytes = null;
            capacityMeasurementVerified = false;
          }
          throw new Error("secure_storage_write_failed");
        }
        // The adapter threw after committing, but the exact ciphertext is now
        // durable. Treat it as success so retry cannot double-reserve capacity.
      }
      // Release capacity only after the smaller ciphertext is durable.
      if (projectedBytes < total) {
        await writeCapacityLedger(projectedBytes, "secure_storage_capacity_check_failed");
      }
      encryptedBackingBytes = projectedBytes;
    });
  }

  async function removeEncryptedWithinCapacity(key: string): Promise<void> {
    return runCapacityMutation(async () => {
      let current: string | null = null;
      let measuredCurrent = true;
      let total: number | null = null;
      try {
        current = await dependencies.backing.getItem(key);
        if (typeof current !== "string" && current !== null) {
          current = null;
          measuredCurrent = false;
          encryptedBackingBytes = null;
          capacityMeasurementVerified = false;
        }
        if (current?.startsWith(ENCRYPTED_STORAGE_PREFIX)) {
          total = await currentEncryptedBackingBytes();
        }
      } catch {
        measuredCurrent = false;
        encryptedBackingBytes = null;
        capacityMeasurementVerified = false;
      }

      try {
        await dependencies.backing.removeItem(key);
        if ((await dependencies.backing.getItem(key)) !== null) {
          throw new Error("remove_not_durable");
        }
      } catch {
        encryptedBackingBytes = null;
        capacityMeasurementVerified = false;
        throw new Error("secure_storage_remove_failed");
      }

      if (
        measuredCurrent
        && total !== null
        && current?.startsWith(ENCRYPTED_STORAGE_PREFIX)
      ) {
        const removedBytes = utf8Size(current);
        if (removedBytes > total) {
          encryptedBackingBytes = null;
          capacityMeasurementVerified = false;
          throw new Error("secure_storage_capacity_check_failed");
        }
        const projectedBytes = total - removedBytes;
        await writeCapacityLedger(projectedBytes, "secure_storage_capacity_check_failed");
        encryptedBackingBytes = projectedBytes;
      }
    });
  }

  async function encryptValue(key: string, value: string): Promise<string> {
    assertPlaintext(value);
    const encodedKey = await masterKey();
    let sealed: string;
    try {
      sealed = await dependencies.crypto.encrypt(value, encodedKey, `${AAD_PREFIX}${key}`);
    } catch {
      throw new Error("secure_storage_encrypt_failed");
    }
    if (typeof sealed !== "string" || !isCanonicalBase64(sealed)) {
      throw new Error("secure_storage_encrypt_failed");
    }
    const encrypted = `${ENCRYPTED_STORAGE_PREFIX}${sealed}`;
    if (utf8Size(encrypted) > MAX_SECURE_BACKING_VALUE_BYTES) {
      throw new Error("secure_storage_encrypt_failed");
    }
    return encrypted;
  }

  function performLegacyPlaintextMigration() {
    return runMaintenance(async () => {
      let markerWriteAttempted = false;
      try {
        if (
          (await dependencies.backing.getItem(LEGACY_MIGRATION_MARKER_NAME))
          === ENCRYPTED_STORAGE_MIGRATION_MARKER_VALUE
        ) {
          return { status: "already-complete" as const, migratedPlaintextKeys: 0 };
        }

        const keys = await boundedBackingKeys("secure_storage_migration_failed");
        let migratedPlaintextKeys = 0;
        for (const key of keys) {
          if (!isManagedDataKey(key)) continue;
          const raw = await dependencies.backing.getItem(key);
          if (raw === null || raw.startsWith(ENCRYPTED_STORAGE_PREFIX)) continue;
          const encrypted = await encryptValue(key, raw);
          await writeEncryptedWithinCapacity(key, encrypted, true);
          migratedPlaintextKeys += 1;
        }

        markerWriteAttempted = true;
        await dependencies.backing.setItem(
          LEGACY_MIGRATION_MARKER_NAME,
          ENCRYPTED_STORAGE_MIGRATION_MARKER_VALUE,
        );
        if (
          (await dependencies.backing.getItem(LEGACY_MIGRATION_MARKER_NAME))
          !== ENCRYPTED_STORAGE_MIGRATION_MARKER_VALUE
        ) {
          throw new Error("migration_marker_not_durable");
        }
        return { status: "completed" as const, migratedPlaintextKeys };
      } catch (error) {
        if (markerWriteAttempted) {
          try {
            await dependencies.backing.removeItem(LEGACY_MIGRATION_MARKER_NAME);
          } catch {
            // Only the exact marker is trusted; a later run retries otherwise.
          }
        }
        if (
          error instanceof Error
          && error.message === ENCRYPTED_STORAGE_RECOVERY_REQUIRED
        ) {
          throw error;
        }
        throw new Error("secure_storage_migration_failed");
      }
    });
  }

  return {
    async getItem(key) {
      assertManagedLogicalKey(key);
      return enqueue(key, async () => {
        let raw: string | null;
        try {
          raw = await dependencies.backing.getItem(key);
        } catch {
          throw new Error("secure_storage_read_failed");
        }
        if (typeof raw !== "string" && raw !== null) {
          throw new Error("secure_storage_read_failed");
        }
        if (raw === null) return null;

        if (!raw.startsWith(ENCRYPTED_STORAGE_PREFIX)) {
          const encrypted = await encryptValue(key, raw);
          await writeEncryptedWithinCapacity(key, encrypted, true);
          return raw;
        }

        if (utf8Size(raw) > MAX_SECURE_BACKING_VALUE_BYTES) {
          throw new Error("secure_storage_decrypt_failed");
        }
        const sealed = raw.slice(ENCRYPTED_STORAGE_PREFIX.length);
        if (!isCanonicalBase64(sealed)) throw new Error("secure_storage_decrypt_failed");
        const encodedKey = await masterKey();
        try {
          const plaintext = await dependencies.crypto.decrypt(
            sealed,
            encodedKey,
            `${AAD_PREFIX}${key}`,
          );
          assertPlaintext(plaintext);
          return plaintext;
        } catch {
          throw new Error("secure_storage_decrypt_failed");
        }
      });
    },

    async setItem(key, value) {
      assertManagedLogicalKey(key);
      assertPlaintext(value);
      return enqueue(key, async () => {
        const encrypted = await encryptValue(key, value);
        await writeEncryptedWithinCapacity(key, encrypted, true);
      });
    },

    async removeItem(key) {
      assertRemovableLogicalKey(key);
      return enqueue(key, () => removeEncryptedWithinCapacity(key));
    },

    async recoverAfterUserConsent(consent) {
      if (
        consent?.acknowledgedDataLoss !== true
        || consent.action !== "discard-unreadable-encrypted-local-data"
      ) {
        throw new Error("secure_storage_recovery_consent_required");
      }

      return runMaintenance(() => runCapacityMutation(async () => {
        try {
          const keys = await boundedBackingKeys("secure_storage_recovery_failed");
          let discardedManagedKeys = 0;
          for (const key of keys) {
            if (!isManagedDataKey(key) && !DELETE_ONLY_KEYS.has(key)) continue;
            // Typed consent covers both ciphertext and plaintext that could not
            // be migrated (for example an unreadable oversized AsyncStorage row).
            await dependencies.backing.removeItem(key);
            if ((await dependencies.backing.getItem(key)) !== null) {
              throw new Error("managed_value_remove_not_durable");
            }
            discardedManagedKeys += 1;
          }

          await dependencies.backing.removeItem(LEGACY_MIGRATION_MARKER_NAME);
          if ((await dependencies.backing.getItem(LEGACY_MIGRATION_MARKER_NAME)) !== null) {
            throw new Error("marker_remove_not_durable");
          }
          await writeCapacityLedger(0, "secure_storage_recovery_failed");
          await dependencies.secrets.removeItem(MASTER_KEY_NAME);
          masterKeyPromise = null;
          if ((await dependencies.secrets.getItem(MASTER_KEY_NAME)) !== null) {
            throw new Error("key_remove_not_durable");
          }
          await dependencies.backing.removeItem(KEY_SENTINEL_NAME);
          if ((await dependencies.backing.getItem(KEY_SENTINEL_NAME)) !== null) {
            throw new Error("sentinel_remove_not_durable");
          }

          encryptedBackingBytes = 0;
          capacityMeasurementVerified = true;
          return { discardedManagedKeys };
        } catch {
          encryptedBackingBytes = null;
          capacityMeasurementVerified = false;
          throw new Error("secure_storage_recovery_failed");
        }
      }));
    },

    migrateLegacyPlaintextAtStartup() {
      return performLegacyPlaintextMigration();
    },
  };
}

interface SecureStoreRuntime {
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: string;
  isAvailableAsync(): Promise<boolean>;
  getItemAsync(key: string, options: { keychainAccessible: string }): Promise<string | null>;
  setItemAsync(
    key: string,
    value: string,
    options: { keychainAccessible: string },
  ): Promise<void>;
  deleteItemAsync(key: string, options: { keychainAccessible: string }): Promise<void>;
}

interface ExpoCryptoRuntime {
  CryptoDigestAlgorithm: { SHA256: string };
  digestStringAsync(algorithm: string, value: string): Promise<string>;
  AESEncryptionKey: {
    generate(bits: number): Promise<{ encoded(format: "base64"): string | Promise<string> }>;
    import(encoded: string, format: "base64"): Promise<unknown>;
  };
  AESSealedData: { fromCombined(value: string): unknown };
  aesEncryptAsync(
    plaintext: Uint8Array,
    key: unknown,
    options: { additionalData: Uint8Array; nonce: { length: number }; tagLength: number },
  ): Promise<{ combined(format: "base64"): string | Promise<string> }>;
  aesDecryptAsync(
    sealed: unknown,
    key: unknown,
    options: { additionalData: Uint8Array; output: "bytes" },
  ): Promise<Uint8Array>;
}

let runtimeStorage: EncryptedNativeStorage | null = null;

function getEncryptedNativeStorageRuntime(): EncryptedNativeStorage {
  if (typeof document !== "undefined") throw new Error("secure_storage_native_only");
  if (runtimeStorage) return runtimeStorage;

  const AsyncStorage = require("@react-native-async-storage/async-storage")
    .default as EnumerableStringStorage;
  const SecureStore = require("expo-secure-store") as SecureStoreRuntime;
  const ExpoCrypto = require("expo-crypto") as ExpoCryptoRuntime;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const secureStoreOptions = {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  };

  runtimeStorage = createEncryptedNativeStorage({
    backing: AsyncStorage,
    secrets: {
      async getItem(key) {
        if (!(await SecureStore.isAvailableAsync())) throw new Error("secure_store_unavailable");
        return SecureStore.getItemAsync(key, secureStoreOptions);
      },
      async setItem(key, value) {
        if (!(await SecureStore.isAvailableAsync())) throw new Error("secure_store_unavailable");
        await SecureStore.setItemAsync(key, value, secureStoreOptions);
      },
      async removeItem(key) {
        if (!(await SecureStore.isAvailableAsync())) throw new Error("secure_store_unavailable");
        await SecureStore.deleteItemAsync(key, secureStoreOptions);
      },
    },
    crypto: {
      async generateKey() {
        const key = await ExpoCrypto.AESEncryptionKey.generate(256);
        return await key.encoded("base64");
      },
      async fingerprintKey(encodedKey) {
        return ExpoCrypto.digestStringAsync(
          ExpoCrypto.CryptoDigestAlgorithm.SHA256,
          encodedKey,
        );
      },
      async encrypt(plaintext, encodedKey, aad) {
        const key = await ExpoCrypto.AESEncryptionKey.import(encodedKey, "base64");
        const sealed = await ExpoCrypto.aesEncryptAsync(encoder.encode(plaintext), key, {
          additionalData: encoder.encode(aad),
          nonce: { length: 12 },
          tagLength: 16,
        });
        return await sealed.combined("base64");
      },
      async decrypt(sealed, encodedKey, aad) {
        const key = await ExpoCrypto.AESEncryptionKey.import(encodedKey, "base64");
        const encrypted = ExpoCrypto.AESSealedData.fromCombined(sealed);
        const plaintext = await ExpoCrypto.aesDecryptAsync(encrypted, key, {
          additionalData: encoder.encode(aad),
          output: "bytes",
        });
        if (!(plaintext instanceof Uint8Array)) throw new Error("invalid_plaintext_encoding");
        return decoder.decode(plaintext);
      },
    },
  });
  return runtimeStorage;
}

export function getEncryptedNativeStorage(): StringStorage {
  return getEncryptedNativeStorageRuntime();
}

export function migrateLegacyNativePlaintextAtStartup() {
  return getEncryptedNativeStorageRuntime().migrateLegacyPlaintextAtStartup();
}

export function recoverEncryptedNativeStorageAfterUserConsent(
  consent: EncryptedNativeStorageRecoveryConsent,
) {
  return getEncryptedNativeStorageRuntime().recoverAfterUserConsent(consent);
}

export function __resetEncryptedNativeStorageForTests(): void {
  runtimeStorage = null;
}
