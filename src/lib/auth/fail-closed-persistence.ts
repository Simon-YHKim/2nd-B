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
//      waiting for a count that can never advance. A call that does not answer
//      within FAIL_CLOSED_COUNTER_IO_TIMEOUT_MS is the same failure.
//   3. Clearing is best-effort and silent. It runs on the HEALTHY path, where a
//      storage hiccup must never raise a gate.
//   4. Web does nothing. Consented recovery is native-only
//      (`secure_storage_native_only`), so a web gate could never succeed. The
//      same hole on web is tracked as follow-up work, not solved here.
//   5. This module only ever answers "keep the lock" or "offer the gate". It
//      never publishes a session and never retries the bootstrap.
//   6. A storage call is issued only after every earlier one has SETTLED, not
//      merely timed out (gate finding AA-1835-1). A write that misses its
//      deadline may still land, but it lands before any clear issued after it,
//      so it can never revive a streak that clear removed. Nothing continues
//      from an answer that arrives after its deadline.

/** Consecutive failing cold starts before the consent gate is offered. */
export const FAIL_CLOSED_ESCALATION_THRESHOLD = 3;

/** Upper bound on ONE counter storage call: the read, the write, the read-back,
 *  or the clear's remove. One small AsyncStorage key answers in milliseconds on
 *  a working device, so 2 s leaves wide headroom for a slow cold start, while a
 *  count that has to wait out every step still answers within about 6 s of
 *  "Loading" instead of never (gate finding AA-1835-1, 2026-09-19). */
export const FAIL_CLOSED_COUNTER_IO_TIMEOUT_MS = 2_000;

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
let callTail: Promise<void> = Promise.resolve();

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
 *  to back can never read and write around each other. Never rejects, and
 *  every operation ends within its calls' deadlines, so a stuck native call
 *  cannot hold this queue. */
function enqueue<T>(operation: () => Promise<T>, fallback: T): Promise<T> {
  const result = storageTail.then(operation).catch(() => fallback);
  storageTail = result.then(() => undefined);
  return result;
}

/** One storage call under Invariant 6: issued once every earlier call has
 *  settled, answered to the caller within FAIL_CLOSED_COUNTER_IO_TIMEOUT_MS
 *  (time spent waiting behind a stuck call included). A miss rejects exactly
 *  like a failed call, and the call's own late answer goes nowhere. */
function bounded<T>(call: () => Promise<T>): Promise<T> {
  const settled = callTail.then(call);
  callTail = settled.then(
    () => undefined,
    () => undefined,
  );
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("fail_closed_count_timeout"));
    }, FAIL_CLOSED_COUNTER_IO_TIMEOUT_MS);
    settled.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
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
    previous = parseStoredCount(await bounded(() => storage.getItem(FAIL_CLOSED_COLD_START_KEY)));
  } catch {
    return "escalate"; // Invariant 2: an unreadable counter, or one that never answered.
  }

  // Clamped so a user who declines the gate and relaunches does not grow the
  // value without bound; at or above the threshold always escalates.
  const next = Math.min(previous + 1, FAIL_CLOSED_ESCALATION_THRESHOLD);
  try {
    const encoded = String(next);
    await bounded(() => storage.setItem(FAIL_CLOSED_COLD_START_KEY, encoded));
    if ((await bounded(() => storage.getItem(FAIL_CLOSED_COLD_START_KEY))) !== encoded) {
      throw new Error("fail_closed_count_not_durable");
    }
  } catch {
    return "escalate"; // Invariant 2: an unwritable counter, or one that never answered.
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
 *  new episode that counts again. Best-effort and silent; never rejects. A
 *  remove that misses its deadline stays queued and still runs once the calls
 *  before it settle (Invariant 6). */
export function clearFailClosedColdStarts(storage?: FailClosedCounterStorage): Promise<void> {
  // Reopened at call time, not inside the queue: a count requested right after
  // this clear must queue behind it rather than reuse the pre-clear answer.
  countedThisRun = null;
  return enqueue<void>(async () => {
    if (!storage && !isNativeRuntime()) return;
    const opened = storage ?? openCounterStorage();
    await bounded(() => opened.removeItem(FAIL_CLOSED_COLD_START_KEY));
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
 *  No storage failure can reject it and no stalled call can hold it past the
 *  counter's deadlines, so the provider fires it without awaiting;
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
