import {
  ENCRYPTED_STORAGE_RECOVERY_REQUIRED,
  recoverEncryptedNativeStorageAfterUserConsent,
  type EncryptedNativeStorageRecoveryConsent,
} from "../storage/encrypted-native-storage";
import { getSupabaseClient, resetSupabaseClient } from "../supabase/client";

const MAX_ERROR_TRAVERSAL_DEPTH = 6;
const MAX_ERROR_TRAVERSAL_NODES = 16;

type AuthSessionOutcome =
  | { status: "ready"; userId: string | null }
  | { status: "storage-recovery-required" }
  | { status: "unavailable" };

export type EncryptedStorageRecoveryAttempt = "recovered" | "invalid-consent" | "failed";

interface RecoveryDependencies {
  recover(consent: EncryptedNativeStorageRecoveryConsent): Promise<unknown>;
  resetClient(): Promise<void>;
  recreateClient(): unknown;
}

const RECOVERY_DEPENDENCIES: RecoveryDependencies = {
  recover: recoverEncryptedNativeStorageAfterUserConsent,
  resetClient: resetSupabaseClient,
  recreateClient: getSupabaseClient,
};

function ownDataValue(value: object, key: PropertyKey): unknown {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && "value" in descriptor ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Match only the encrypted adapter's exact durable-corruption signal. Supabase
 * may wrap a storage exception in AuthUnknownError.originalError (and Error
 * causes may wrap it again), so those two links are traversed with strict
 * depth/node limits. Strings and message-shaped plain objects are never enough.
 */
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
      if (nested instanceof Error) {
        queue.push({ value: nested, depth: current.depth + 1 });
      }
    }
  }

  return false;
}

function outcomeFromResult(result: unknown): AuthSessionOutcome {
  if ((typeof result !== "object" && typeof result !== "function") || result === null) {
    return { status: "unavailable" };
  }

  const error = ownDataValue(result, "error");
  if (error !== null && error !== undefined) {
    return isEncryptedStorageRecoveryRequired(error)
      ? { status: "storage-recovery-required" }
      : { status: "unavailable" };
  }

  const data = ownDataValue(result, "data");
  if ((typeof data !== "object" && typeof data !== "function") || data === null) {
    return { status: "unavailable" };
  }
  const session = ownDataValue(data, "session");
  if (session === null) return { status: "ready", userId: null };
  if ((typeof session !== "object" && typeof session !== "function") || session === null) {
    return { status: "unavailable" };
  }
  const user = ownDataValue(session, "user");
  if ((typeof user !== "object" && typeof user !== "function") || user === null) {
    return { status: "unavailable" };
  }
  const userId = ownDataValue(user, "id");
  return typeof userId === "string" && userId.length > 0
    ? { status: "ready", userId }
    : { status: "unavailable" };
}

/** Read getSession without collapsing a rejection or resolved { error } into sign-out. */
export async function readAuthSessionOutcome(
  getSession: () => PromiseLike<unknown> | unknown,
  timeoutMs: number,
): Promise<AuthSessionOutcome> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<AuthSessionOutcome>((resolve) => {
    timeoutId = setTimeout(() => resolve({ status: "unavailable" }), timeoutMs);
  });
  const settled = Promise.resolve()
    .then(getSession)
    .then(
      outcomeFromResult,
      (error): AuthSessionOutcome => isEncryptedStorageRecoveryRequired(error)
        ? { status: "storage-recovery-required" }
        : { status: "unavailable" },
    );

  try {
    return await Promise.race([settled, timedOut]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
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

/**
 * The only core path from explicit UI consent to destructive local recovery.
 * Every destructive dependency is intentionally behind the runtime consent
 * check. The freshly-created client is returned through the normal singleton
 * getter so no caller can keep using the unreadable client by accident.
 */
export async function attemptEncryptedNativeStorageRecovery(
  consent: unknown,
  dependencies: RecoveryDependencies = RECOVERY_DEPENDENCIES,
): Promise<EncryptedStorageRecoveryAttempt> {
  if (!isExactRecoveryConsent(consent)) return "invalid-consent";

  try {
    await dependencies.recover(consent);
    await dependencies.resetClient();
    dependencies.recreateClient();
    return "recovered";
  } catch {
    return "failed";
  }
}
