import {
  ENCRYPTED_STORAGE_RECOVERY_REQUIRED,
  recoverEncryptedNativeStorageAfterUserConsent,
  type EncryptedNativeStorageRecoveryConsent,
} from "../storage/encrypted-native-storage";
import { getSupabaseClient, resetSupabaseClient } from "../supabase/client";
import { getAuthStorageRuntime } from "./session-mutation";

const MAX_ERROR_TRAVERSAL_DEPTH = 6;
const MAX_ERROR_TRAVERSAL_NODES = 16;

export type EncryptedStorageRecoveryAttempt = "recovered" | "invalid-consent" | "failed";

interface RecoveryDependencies {
  recover(consent: EncryptedNativeStorageRecoveryConsent): Promise<unknown>;
  resetClient(): Promise<void>;
  recreateClient(): unknown;
  readyStorage(): Promise<void>;
}

const RECOVERY_DEPENDENCIES: RecoveryDependencies = {
  recover: recoverEncryptedNativeStorageAfterUserConsent,
  resetClient: resetSupabaseClient,
  recreateClient: getSupabaseClient,
  readyStorage: () => getAuthStorageRuntime().ready(),
};

function ownDataValue(value: object, key: PropertyKey): unknown {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && "value" in descriptor ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

/** Match only the encrypted adapter's exact durable-corruption signal.
 * Supabase can wrap storage errors in `originalError` or `cause`, so those
 * Error-only links are traversed with strict depth/node limits. */
export function isEncryptedStorageRecoveryRequired(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const queue: Array<{ value: Error; depth: number }> = [{ value: error, depth: 0 }];
  const visited = new Set<Error>();
  let inspected = 0;

  while (queue.length > 0 && inspected < MAX_ERROR_TRAVERSAL_NODES) {
    const current = queue.shift();
    if (!current || visited.has(current.value)) continue;
    visited.add(current.value);
    inspected += 1;

    if (ownDataValue(current.value, "message") === ENCRYPTED_STORAGE_RECOVERY_REQUIRED) {
      return true;
    }
    if (current.depth >= MAX_ERROR_TRAVERSAL_DEPTH) continue;

    for (const key of ["originalError", "cause"] as const) {
      const nested = ownDataValue(current.value, key);
      if (nested instanceof Error) queue.push({ value: nested, depth: current.depth + 1 });
    }
  }

  return false;
}

function isExactRecoveryConsent(value: unknown): value is EncryptedNativeStorageRecoveryConsent {
  if (typeof value !== "object" || value === null) return false;
  try {
    const keys = Reflect.ownKeys(value);
    if (
      keys.length !== 2
      || !keys.includes("acknowledgedDataLoss")
      || !keys.includes("action")
    ) {
      return false;
    }
    return ownDataValue(value, "acknowledgedDataLoss") === true
      && ownDataValue(value, "action") === "discard-unreadable-encrypted-local-data";
  } catch {
    return false;
  }
}

/** The sole bridge from explicit UI consent to destructive local recovery.
 * A success is reported only after the old singleton/runtime are retired and
 * the fresh auth v2 plaintext-migration barrier has completed. */
export async function attemptEncryptedNativeStorageRecovery(
  consent: unknown,
  dependencies: RecoveryDependencies = RECOVERY_DEPENDENCIES,
): Promise<EncryptedStorageRecoveryAttempt> {
  if (!isExactRecoveryConsent(consent)) return "invalid-consent";

  try {
    await dependencies.recover(consent);
    await dependencies.resetClient();
    dependencies.recreateClient();
    await dependencies.readyStorage();
    return "recovered";
  } catch {
    return "failed";
  }
}
