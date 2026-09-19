// Persistence counter behind the fail-closed boot lock.
//
// WHY THIS EXISTS (R14-BOOT-EXIT, 2026-09-19)
// -------------------------------------------
// When the boot cannot read auth storage AND the fail-closed local sign-out
// also fails, AuthProvider holds `loading:true` on purpose: a session it could
// neither classify nor revoke must not be published. For one bad start that is
// right. For a durable fault it is a dead end - "Loading" on every launch and no
// way out (damaged ciphertext, a keystore fault, the next library defect; the
// 2026-09-19 Android hang had exactly this shape).
//
// Error codes cannot tell the two apart. `secure_storage_decrypt_failed` meant
// "the data is intact, this build cannot read it" on 2026-09-19, so offering the
// destructive reset on that code alone would have cost people a session they
// did not need to lose. The discriminator is PERSISTENCE: the same double
// failure on FAIL_CLOSED_ESCALATION_THRESHOLD consecutive cold starts. Only then
// does the provider publish the existing two-step consent gate, which discards
// nothing before the user agrees.
//
// The counter is PLAINTEXT AsyncStorage on purpose. The encrypted store is the
// thing that is broken, and a small integer is not a secret. Its key sits
// outside the encrypted adapter's managed allowlist, so neither the startup
// plaintext migration nor the consented wipe touches it - which is why the wipe
// clears it explicitly (storage-recovery.ts).
//
// INVARIANTS - do not "simplify" any of them away:
//   1. One JS run counts at most once, however many times the failing branch
//      is re-entered (later auth events re-run the same failing sign-out).
//   2. A counter that cannot be read, parsed, or durably written is itself
//      evidence of a persistent backing fault: escalate at once instead of
//      waiting for a count that can never advance.
//   3. Clearing is best-effort and silent. It runs on the HEALTHY path, where a
//      storage hiccup must never raise a gate.
//   4. Web does nothing. Consented recovery is native-only
//      (`secure_storage_native_only`), so a web gate could never succeed. The
//      same hole on web is tracked as follow-up work, not solved here.
//   5. This module only ever answers "keep the lock" or "offer the gate". It
//      never publishes a session and never retries the bootstrap.

/** Consecutive failing cold starts before the consent gate is offered. */
export const FAIL_CLOSED_ESCALATION_THRESHOLD = 3;

/** Plaintext AsyncStorage key. Not a secret; see the header. */
export const FAIL_CLOSED_COLD_START_KEY = "secondbrain.auth.fail-closed-cold-starts.v1";

export interface FailClosedCounterStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/** `locked` keeps today's lock. `escalate` offers the gate. `unsupported` is a
 *  runtime this exit does not cover, which also keeps today's lock. */
export type FailClosedPersistence = "locked" | "escalate" | "unsupported";

// Only what this module itself writes: "0" or a canonical 1-999.
const STORED_COUNT = /^(?:0|[1-9][0-9]{0,2})$/;

let countedThisRun: Promise<FailClosedPersistence> | null = null;
let storageTail: Promise<void> = Promise.resolve();

/** Same native test the production auth runtime applies (session-mutation.ts). */
function isNativeRuntime(): boolean {
  if (typeof document !== "undefined") return false;
  const nav = globalThis.navigator as { product?: string } | undefined;
  return nav?.product === "ReactNative";
}

function openCounterStorage(): FailClosedCounterStorage {
  return require("@react-native-async-storage/async-storage").default as FailClosedCounterStorage;
}

/** Run storage work strictly in call order, so a clear and a count issued back
 *  to back can never read and write around each other. Never rejects. */
function enqueue<T>(operation: () => Promise<T>, fallback: T): Promise<T> {
  const result = storageTail.then(operation).catch(() => fallback);
  storageTail = result.then(() => undefined);
  return result;
}

function parseStoredCount(raw: string | null): number {
  if (raw === null) return 0;
  if (typeof raw !== "string" || !STORED_COUNT.test(raw)) {
    throw new Error("fail_closed_count_unreadable");
  }
  return Number(raw);
}

async function countColdStart(
  injected: FailClosedCounterStorage | undefined,
): Promise<FailClosedPersistence> {
  if (!injected && !isNativeRuntime()) return "unsupported";

  let storage: FailClosedCounterStorage;
  let previous: number;
  try {
    storage = injected ?? openCounterStorage();
    previous = parseStoredCount(await storage.getItem(FAIL_CLOSED_COLD_START_KEY));
  } catch {
    return "escalate"; // Invariant 2: an unreadable counter.
  }

  // Clamped so a user who declines the gate and relaunches does not grow the
  // value without bound; at or above the threshold always escalates.
  const next = Math.min(previous + 1, FAIL_CLOSED_ESCALATION_THRESHOLD);
  try {
    const encoded = String(next);
    await storage.setItem(FAIL_CLOSED_COLD_START_KEY, encoded);
    if ((await storage.getItem(FAIL_CLOSED_COLD_START_KEY)) !== encoded) {
      throw new Error("fail_closed_count_not_durable");
    }
  } catch {
    return "escalate"; // Invariant 2: an unwritable counter.
  }

  return next >= FAIL_CLOSED_ESCALATION_THRESHOLD ? "escalate" : "locked";
}

/** Record that this cold start reached the double failure. Counts once per JS
 *  run; later calls in the same run share the first answer. Never rejects. */
export function noteFailClosedColdStart(
  storage?: FailClosedCounterStorage,
): Promise<FailClosedPersistence> {
  if (!countedThisRun) {
    countedThisRun = enqueue<FailClosedPersistence>(() => countColdStart(storage), "escalate");
  }
  return countedThisRun;
}

/** Return the streak to zero: a bootstrap settled, or the consented wipe
 *  finished. Also reopens the current run, so a failure AFTER this point is a
 *  new episode that counts again. Best-effort and silent; never rejects. */
export function clearFailClosedColdStarts(storage?: FailClosedCounterStorage): Promise<void> {
  // Reopened at call time, not inside the queue: a count requested right after
  // this clear must queue behind it rather than reuse the pre-clear answer.
  countedThisRun = null;
  return enqueue<void>(async () => {
    if (!storage && !isNativeRuntime()) return;
    await (storage ?? openCounterStorage()).removeItem(FAIL_CLOSED_COLD_START_KEY);
  }, undefined);
}

export interface FailClosedEscalation {
  /** The provider's `isCurrentEffect`: false once the effect is cancelled,
   *  superseded, or the storage gate is already up. */
  isCurrent: () => boolean;
  /** Publish the explicit-consent gate (`markStorageRecoveryRequired`). */
  escalate: () => void;
  /** Test seam. Production counts in plaintext AsyncStorage. */
  note?: () => Promise<FailClosedPersistence>;
}

export type FailClosedEscalationOutcome = "escalated" | "locked" | "unsupported" | "stale";

/** The step AuthProvider runs AFTER it has published today's lock for a failed
 *  fail-closed sign-out. Until the failure has persisted it changes nothing.
 *  No storage failure can reject it, so the provider fires it without awaiting;
 *  `escalate` is the provider's own synchronous publication. */
export async function escalateFailClosedLockIfPersistent(
  deps: FailClosedEscalation,
): Promise<FailClosedEscalationOutcome> {
  let persistence: FailClosedPersistence;
  try {
    persistence = await (deps.note ?? noteFailClosedColdStart)();
  } catch {
    persistence = "escalate";
  }
  if (persistence !== "escalate") return persistence;
  if (!deps.isCurrent()) return "stale";
  deps.escalate();
  return "escalated";
}
