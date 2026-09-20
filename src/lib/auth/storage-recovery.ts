import {
  ENCRYPTED_STORAGE_RECOVERY_REQUIRED,
  recoverEncryptedNativeStorageAfterUserConsent,
  type EncryptedNativeStorageRecoveryConsent,
  type EncryptedNativeStorageRecoveryOptions,
} from "../storage/encrypted-native-storage";
import { getSupabaseClient, resetSupabaseClient } from "../supabase/client";
import { clearFailClosedColdStarts } from "./fail-closed-persistence";
import { getAuthStorageRuntime, retireAuthStorageRuntime } from "./session-mutation";

// AuthContext reaches the storage-recovery gate through this one module. Its
// import block is also cited by line from docs/legal, so the persistence exit
// joins the existing specifier lines instead of adding an import statement.
export {
  clearFailClosedColdStarts,
  escalateFailClosedLockIfPersistent,
} from "./fail-closed-persistence";

const MAX_ERROR_TRAVERSAL_DEPTH = 6;
const MAX_ERROR_TRAVERSAL_NODES = 16;

/** Upper bound on one consented reset, from the wipe through the fresh auth
 * runtime's readiness. The wipe is a remove and a read-back per managed key,
 * then a few fixed entries and one keystore delete, so 15 s is a generous
 * bound for a slow device, while a store that stops answering still reaches
 * the existing `storageRecovery.failed` copy instead of `working` forever
 * (#1835 follow-up, 2026-09-19). */
export const ENCRYPTED_STORAGE_RECOVERY_TIMEOUT_MS = 15_000;

export type EncryptedStorageRecoveryAttempt = "recovered" | "invalid-consent" | "failed";

interface RecoveryDependencies {
  recover(
    consent: EncryptedNativeStorageRecoveryConsent,
    options: EncryptedNativeStorageRecoveryOptions,
  ): Promise<unknown>;
  retireStorage(): void;
  resetClient(): Promise<void>;
  recreateClient(): unknown;
  readyStorage(): Promise<void>;
  clearPersistence(): Promise<void>;
}

const RECOVERY_DEPENDENCIES: RecoveryDependencies = {
  recover: recoverEncryptedNativeStorageAfterUserConsent,
  retireStorage: retireAuthStorageRuntime,
  resetClient: resetSupabaseClient,
  recreateClient: getSupabaseClient,
  readyStorage: () => getAuthStorageRuntime().ready(),
  clearPersistence: () => clearFailClosedColdStarts(),
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

/** The wipe, the old client's retirement and replacement, and the fresh
 * runtime's readiness, answered within ENCRYPTED_STORAGE_RECOVERY_TIMEOUT_MS.
 * At the deadline the attempt has failed and no later step starts: a wipe that
 * finishes afterwards cannot retire or replace the client behind a gate that
 * already said the reset did not finish, and the persistence streak is kept.
 *
 * The adapter runs each wipe after everything already queued, including an
 * earlier attempt's wipe that stalled. A failed attempt must not leave that
 * wipe to run later for nobody (gate findings IA-1838-1 / IZ-1838-1,
 * 2026-09-19), so the adapter asks `stillAwaited` when the wipe reaches the
 * front of its queue and does not start one whose attempt has already failed.
 * A retry still asks for a wipe of its own rather than waiting on the stalled
 * one: its wipe is queued after what was written since the first consent (a
 * save by the retiring client, for one), so it removes that too. Joining the
 * stalled wipe would keep that wipe's earlier place and leave such a write for
 * the fresh client to read.
 *
 * The retiring runtime's storage is fenced in the same turn the wipe is queued
 * (R27, 2026-09-20). A refresh the retiring client began before consent can
 * still answer: unfenced, its save queued behind the wipe or landed after the
 * reset, and the fresh client published that recovery session as an ordinary
 * one. With it, a write the adapter queued before the fence is removed by the
 * wipe, and one after it is dropped. The fence stays up if the attempt fails,
 * since this storage is already consented away; a token the retiring client
 * rotates meanwhile is lost with it. A wipe request that throws at once fences
 * nothing. */
async function resetWithinDeadline(
  consent: EncryptedNativeStorageRecoveryConsent,
  dependencies: RecoveryDependencies,
): Promise<boolean> {
  let expired = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<boolean>((resolve) => {
    timeoutId = setTimeout(() => {
      expired = true;
      resolve(false);
    }, ENCRYPTED_STORAGE_RECOVERY_TIMEOUT_MS);
  });
  const step = async (run: () => unknown): Promise<void> => {
    if (expired) throw new Error("storage_recovery_timeout");
    await run();
  };
  const reset = (async (): Promise<boolean> => {
    try {
      await step(() => {
        const wipe = dependencies.recover(consent, { stillAwaited: () => !expired });
        dependencies.retireStorage();
        return wipe;
      });
      await step(() => dependencies.resetClient());
      await step(() => dependencies.recreateClient());
      await step(() => dependencies.readyStorage());
      return true;
    } catch {
      return false;
    }
  })();

  try {
    return await Promise.race([reset, deadline]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

/** The sole bridge from explicit UI consent to destructive local recovery.
 * A success is reported only after the old singleton/runtime are retired and
 * the fresh auth v2 plaintext-migration barrier has completed, all within
 * ENCRYPTED_STORAGE_RECOVERY_TIMEOUT_MS; past it the attempt is "failed". */
export async function attemptEncryptedNativeStorageRecovery(
  consent: unknown,
  dependencies: RecoveryDependencies = RECOVERY_DEPENDENCIES,
): Promise<EncryptedStorageRecoveryAttempt> {
  if (!isExactRecoveryConsent(consent)) return "invalid-consent";

  if (!(await resetWithinDeadline(consent, dependencies))) return "failed";
  // The wipe is a fresh start, so the fail-closed persistence streak ends with
  // it: the plaintext counter sits outside the encrypted store and the wipe does
  // not reach it. Best-effort by contract - a counter that cannot be cleared
  // must never turn a finished recovery into a failure.
  //
  // Fired, not awaited. Everything above this line is bounded by
  // ENCRYPTED_STORAGE_RECOVERY_TIMEOUT_MS. This step never was, and it is the last
  // thing standing between a reset that has already succeeded and the caller being
  // told so.
  //
  // Being outside that deadline is NOT the same as being unbounded, and the earlier
  // wording here said it was. The shipped dependency is bounded: clearFailClosedColdStarts()
  // puts its one remove() through fail-closed-persistence's `bounded()`, which answers
  // within FAIL_CLOSED_COUNTER_IO_TIMEOUT_MS (2 s) whatever the store does. What it is
  // not is free: that 2 s is serial (the module funnels every counter call through one
  // `storageTail` queue, so anything already queued is added to it) and it is spent
  // AFTER the outcome is known, on a result nobody reads. Measured with a remove() that
  // never answers: 2,009 ms before this change, 0 ms after.
  //
  // The unbounded case is reachable through the dependency seam rather than through the
  // default wiring - this module's own tests inject one - and a `catch` does not cover it:
  // a catch covers a call that REJECTS, not one that never answers. Holding there would
  // leave the attempt unsettled after the reset had already SUCCEEDED, and the gate has no
  // way back from that: storage-recovery-gate.tsx keeps `working` true with its button
  // disabled, and AuthContext hands every later attempt the same unsettled promise
  // (`storageRecoveryAttemptRef`), which it only clears when that promise settles.
  // fail-closed-persistence.ts says the same of its sibling call: "the provider fires it
  // without awaiting".
  //
  // The `.catch` is required, not decorative: this module's own tests reject this
  // dependency, and an unawaited rejection with no handler is an unhandled
  // rejection rather than the silent best-effort the contract above promises.
  void dependencies.clearPersistence().catch(() => {
    // The next settled bootstrap clears it again.
  });
  return "recovered";
}
