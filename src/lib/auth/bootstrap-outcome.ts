// AuthProvider startup settlement: the async step that ends the boot wait.
//
// WHY THIS IS ITS OWN MODULE (AUTH-01, 2026-09-06)
// -----------------------------------------------
// #1517 replaced main's "boot getSession timeout -> resolveSession(null)" with
// a richer bootstrap that keeps UNKNOWN separate from "no session" so a storage
// fault can never silently unlock password recovery. That separation is right
// and stays. What went missing is the *ordinary* exit: when both recovery reads
// succeed and are empty, and getSession neither answers nor rejects, the boot
// left `sessionKnown=false`, skipped resolveSession(), and the provider sat on
// `loading:true` forever with no retry control anywhere in the UI.
//
// The bug was never in the timer - that fires correctly at 8s. It was in the
// step that consumes its result. So that step lives here as the PRODUCTION
// executor AuthProvider calls, with its collaborators injected, rather than as
// a decision table a test could agree with while the real provider still hung.
// The repo's jest setup is `testEnvironment: "node"` with no renderer installed
// (react-test-renderer / @testing-library are absent, and installing through
// the shared node_modules junction is forbidden), so this is the seam at which
// the real orchestration - bounded wait, terminal publication, and late-session
// reconciliation - can actually be executed by a fake-timer test.
//
// INVARIANTS THIS MUST PRESERVE — do not "simplify" any of them away:
//   1. UNKNOWN is never promoted to a trusted signed-out session. The
//      `session-unavailable` outcome publishes an explicit error flag, not a
//      clean `resolveSession(null)`.
//   2. A recovery proof, an unresolved pending marker, or an unreadable marker
//      store keeps the global lock. Those cases must NOT reach
//      `session-unavailable`, and must publish nothing here.
//   3. Authenticated content is never exposed before classification: every
//      non-`resolve` outcome leaves userId null.
//   4. The late answer to a timed-out getSession still reconciles, and a late
//      session arriving while recovery is pending still fails closed.

import type { EncryptedNativeStorageRecoveryConsent } from "../storage/encrypted-native-storage";
import {
  isEncryptedStorageRecoveryRequired,
  type EncryptedStorageRecoveryAttempt,
} from "./storage-recovery";

const AUTH_STORAGE_UNAVAILABLE_CODES = new Set([
  "secure_storage_key_unavailable",
  "secure_storage_key_invalid",
  "secure_storage_native_only",
  "secure_storage_read_failed",
  "secure_storage_decrypt_failed",
  "secure_storage_encrypt_failed",
  "secure_storage_write_failed",
  "secure_storage_remove_failed",
  "secure_storage_capacity_check_failed",
  "secure_storage_capacity_exceeded",
  "secure_storage_migration_failed",
  "secure_storage_value_invalid",
  "secure_storage_value_too_large",
  "secure_store_unavailable",
]);

const MAX_STORAGE_ERROR_DEPTH = 6;
const MAX_STORAGE_ERROR_NODES = 16;

function ownErrorValue(error: Error, key: "cause" | "originalError"): unknown {
  try {
    return Object.getOwnPropertyDescriptor(error, key)?.value;
  } catch {
    return undefined;
  }
}

/** Classify only exact Error signals emitted by the native encrypted adapter.
 * Message-shaped objects and mutated strings remain ordinary auth failures. */
export function classifyAuthStorageFailure(
  error: unknown,
): "recovery-required" | "unavailable" | null {
  if (isEncryptedStorageRecoveryRequired(error)) return "recovery-required";
  if (!(error instanceof Error)) return null;

  const queue: Array<{ error: Error; depth: number }> = [{ error, depth: 0 }];
  const seen = new Set<Error>();
  let visited = 0;
  while (queue.length > 0 && visited < MAX_STORAGE_ERROR_NODES) {
    const current = queue.shift();
    if (!current || seen.has(current.error)) continue;
    seen.add(current.error);
    visited += 1;
    if (AUTH_STORAGE_UNAVAILABLE_CODES.has(current.error.message)) return "unavailable";
    if (current.depth >= MAX_STORAGE_ERROR_DEPTH) continue;
    for (const key of ["originalError", "cause"] as const) {
      const nested = ownErrorValue(current.error, key);
      if (nested instanceof Error && !seen.has(nested)) {
        queue.push({ error: nested, depth: current.depth + 1 });
      }
    }
  }
  return null;
}

export interface EncryptedStorageRecoveryRuntime {
  recover: (consent: EncryptedNativeStorageRecoveryConsent) => Promise<boolean>;
}

export interface EncryptedStorageRecoveryRuntimeDependencies<Lease> {
  acquire: () => Lease | null;
  isCurrent: (lease: Lease) => boolean;
  attempt: (
    consent: EncryptedNativeStorageRecoveryConsent,
  ) => Promise<EncryptedStorageRecoveryAttempt>;
  retainLock: (
    result: Exclude<EncryptedStorageRecoveryAttempt, "recovered">,
    lease: Lease,
  ) => void;
  commitRecovered: (lease: Lease) => boolean;
}

/** Install the mutation lease and shared promise synchronously. The actual
 * destructive attempt starts in the next microtask, after the caller has had
 * a chance to invalidate the lease. */
export function createEncryptedStorageRecoveryRuntime<Lease>(
  deps: EncryptedStorageRecoveryRuntimeDependencies<Lease>,
): EncryptedStorageRecoveryRuntime {
  let active: Promise<boolean> | null = null;
  return {
    recover(consent) {
      if (active) return active;
      const lease = deps.acquire();
      if (lease === null) return Promise.resolve(false);

      const operation = Promise.resolve().then(async () => {
        if (!deps.isCurrent(lease)) return false;
        let result: EncryptedStorageRecoveryAttempt;
        try {
          result = await deps.attempt(consent);
        } catch {
          result = "failed";
        }
        if (!deps.isCurrent(lease)) return false;
        if (result !== "recovered") {
          deps.retainLock(result, lease);
          return false;
        }
        return deps.commitRecovered(lease);
      });
      active = operation;
      const release = () => {
        if (active === operation) active = null;
      };
      void operation.then(release, release);
      return operation;
    },
  };
}

/** Discriminated result of a session read that may time out or fail. */
export type SessionLoadOutcome<S> =
  | { ok: true; session: S | null }
  | { ok: false; error: unknown };

/** Minimal shape this module needs from a Supabase session. */
export interface SessionLike {
  user: { id: string };
}

/** Resolve `p` to `fallback` if it has not settled within `ms`, and to
 *  `fallback` if it rejects. Mirrors the provider's long-standing boot guard:
 *  a wedged Supabase call must bound the wait rather than strand the loader.
 *
 *  Deliberately resolve-with-fallback (not reject): the caller distinguishes
 *  "answered" from "did not answer" through the `ok` flag it puts in the
 *  fallback value, which is what keeps UNKNOWN separate from "no session". */
export function boundedSessionLoad<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      if (typeof console !== "undefined") {
        console.log("[auth] session hydration timed out; ending the boot wait");
      }
      resolve(fallback);
    }, ms);
    void p
      .then((value) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(value);
      })
      .catch(() => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(fallback);
      });
  });
}

export type BootstrapOutcome =
  /** The session is classified. The caller resolves it (null userId included). */
  | { kind: "resolve" }
  /** Recovery provenance is unproven or a marker read failed. The global lock
   *  stays on and nothing is published here. */
  | { kind: "recovery-locked"; reason: "proof" | "pending" | "unreadable-markers" }
  /** Ordinary startup whose session lookup never answered. The wait ends with
   *  an explicit, retryable error state - NOT a trusted signed-out session. */
  | { kind: "session-unavailable" };

export interface BootstrapOutcomeInput {
  /** getSession answered (with a session or with null). False = UNKNOWN. */
  sessionKnown: boolean;
  /** A recovery proof is in force for this frame. */
  hasProof: boolean;
  /** No proof, or the proof belongs to the session we are about to resolve. */
  proofMatchesSession: boolean;
  /** A recovery attempt is marked pending on disk and still unresolved. */
  recoveryPendingOnDisk: boolean;
  /** Both the proof and pending marker reads succeeded. */
  markersReadable: boolean;
}

/** Decide how the provider's bootstrap ends. See the invariants at the top. */
export function classifyBootstrapOutcome(input: BootstrapOutcomeInput): BootstrapOutcome {
  const {
    sessionKnown,
    hasProof,
    proofMatchesSession,
    recoveryPendingOnDisk,
    markersReadable,
  } = input;

  // A classified session always wins, exactly as before this fix.
  if (sessionKnown && proofMatchesSession) return { kind: "resolve" };

  // Everything below has an UNKNOWN or unmatched session. Recovery protection
  // is checked FIRST so the ordinary exit can never swallow a locked case.
  if (hasProof) return { kind: "recovery-locked", reason: "proof" };
  if (!markersReadable) return { kind: "recovery-locked", reason: "unreadable-markers" };
  if (recoveryPendingOnDisk) return { kind: "recovery-locked", reason: "pending" };

  // Ordinary startup, both markers read and empty, session lookup unanswered.
  // This is the branch #1517 left without an exit.
  return { kind: "session-unavailable" };
}

export interface LateAuthSessionDependencies<S extends SessionLike, Snapshot> {
  isCancelled: () => boolean;
  handleStorageFailure: (error: unknown) => void;
  isRecoveryPending: () => boolean;
  currentRecoveryProof: () => unknown;
  captureRecoverySnapshot: () => Snapshot;
  isRecoverySnapshotCurrent: (snapshot: Snapshot) => boolean;
  failClosedRecovery: (error: unknown) => Promise<unknown>;
  clearRecoveryPending: () => Promise<void>;
  handleInitialSession: (session: S | null) => void;
  setRecoveryReady: (ready: boolean) => void;
}

/** Reconcile the original getSession after the bounded bootstrap has timed
 * out. This owns its rejection boundary because callers intentionally detach
 * it; no late storage failure may become an unhandled rejection. */
export async function reconcileLateAuthSession<S extends SessionLike, Snapshot>(
  rawSessionLoad: Promise<SessionLoadOutcome<S>>,
  deps: LateAuthSessionDependencies<S, Snapshot>,
): Promise<void> {
  const reportStorageFailure = (error: unknown) => {
    try {
      deps.handleStorageFailure(error);
    } catch {
      // The detached reconciliation boundary must remain rejection-safe even
      // if a consumer's state publisher has already been torn down.
    }
  };

  try {
    const late = await rawSessionLoad;
    if (deps.isCancelled()) return;
    if (!late.ok) {
      reportStorageFailure(late.error);
      return;
    }

    if (deps.isRecoveryPending() && !deps.currentRecoveryProof()) {
      const snapshot = deps.captureRecoverySnapshot();
      if (deps.isCancelled() || !deps.isRecoverySnapshotCurrent(snapshot)) return;
      if (late.session) {
        await deps.failClosedRecovery(new Error("Late recovery session arrived before proof"));
        if (deps.isCancelled() || !deps.isRecoverySnapshotCurrent(snapshot)) return;
      } else {
        await deps.clearRecoveryPending();
        if (deps.isCancelled() || !deps.isRecoverySnapshotCurrent(snapshot)) return;
        deps.setRecoveryReady(true);
        deps.handleInitialSession(null);
      }
      return;
    }

    const snapshot = deps.captureRecoverySnapshot();
    if (deps.isCancelled() || !deps.isRecoverySnapshotCurrent(snapshot)) return;
    deps.handleInitialSession(late.session);
    if (deps.isCancelled() || !deps.isRecoverySnapshotCurrent(snapshot)) return;
    deps.setRecoveryReady(true);
  } catch (error) {
    if (!deps.isCancelled()) reportStorageFailure(error);
  }
}

/** Collaborators the settlement step needs. AuthProvider passes its real
 *  closures; a test passes fakes and drives the same code. */
export interface AuthBootstrapSettlement<S extends SessionLike, Snapshot = unknown> {
  /** Classification inputs, measured by the bootstrap that just ran. */
  sessionKnown: boolean;
  hasProof: boolean;
  proofMatchesSession: boolean;
  recoveryPendingOnDisk: boolean;
  markersReadable: boolean;
  /** The session to resolve when the outcome is `resolve`. */
  sessionForResolve: S | null;
  /** `sessionResult.ok` — false means the bounded wait fell back. */
  sessionAnswered: boolean;
  /** The UNBOUNDED original read. A timeout does not cancel getSession, so its
   *  eventual answer is still reconciled. */
  rawSessionLoad: Promise<SessionLoadOutcome<S>>;
  isCancelled: () => boolean;
  handleStorageFailure: (error: unknown) => void;
  captureRecoverySnapshot: () => Snapshot;
  isRecoverySnapshotCurrent: (snapshot: Snapshot) => boolean;
  setRecoveryReady: (ready: boolean) => void;
  resolveSession: (userId: string | null) => void | Promise<void>;
  /** Publish the explicit, retryable "could not classify" state. */
  publishSessionUnavailable: () => void;
  isRecoveryPendingInMemory: () => boolean;
  currentRecoveryProof: () => unknown;
  failClosedRecovery: (proof: null, error: unknown) => Promise<boolean>;
  clearRecoveryPending: () => Promise<void>;
  handleAuthEvent: (event: "INITIAL_SESSION", session: S | null) => void;
}

/** End the provider's boot wait. Returns the outcome so callers and tests can
 *  assert which branch ran. */
export function settleAuthBootstrap<S extends SessionLike, Snapshot = unknown>(
  deps: AuthBootstrapSettlement<S, Snapshot>,
): BootstrapOutcome {
  const outcome = classifyBootstrapOutcome({
    sessionKnown: deps.sessionKnown,
    hasProof: deps.hasProof,
    proofMatchesSession: deps.proofMatchesSession,
    recoveryPendingOnDisk: deps.recoveryPendingOnDisk,
    markersReadable: deps.markersReadable,
  });

  // Unchanged meaning: readiness releases the global recovery lock. An UNKNOWN
  // session with a pending marker and no proof stays locked, as before.
  deps.setRecoveryReady(deps.sessionKnown || deps.hasProof || !deps.recoveryPendingOnDisk);

  if (outcome.kind === "resolve") {
    void deps.resolveSession(deps.sessionForResolve?.user.id ?? null);
  } else if (outcome.kind === "session-unavailable") {
    // AUTH-01: end the wait with an explicit error the UI can retry, instead of
    // leaving loading:true forever. Still no session, still nothing exposed.
    deps.publishSessionUnavailable();
  }

  if (!deps.sessionAnswered) {
    // Timeout does not cancel getSession. Reconcile its eventual answer as
    // INITIAL_SESSION; normal sessions still cannot create recovery proof.
    void reconcileLateAuthSession(deps.rawSessionLoad, {
      isCancelled: deps.isCancelled,
      handleStorageFailure: deps.handleStorageFailure,
      isRecoveryPending: deps.isRecoveryPendingInMemory,
      currentRecoveryProof: deps.currentRecoveryProof,
      captureRecoverySnapshot: deps.captureRecoverySnapshot,
      isRecoverySnapshotCurrent: deps.isRecoverySnapshotCurrent,
      failClosedRecovery: (error) => deps.failClosedRecovery(null, error),
      clearRecoveryPending: deps.clearRecoveryPending,
      handleInitialSession: (session) => deps.handleAuthEvent("INITIAL_SESSION", session),
      setRecoveryReady: deps.setRecoveryReady,
    });
  }

  return outcome;
}

/** Outcome of a manual retry (`refresh()`), which re-reads the session under
 *  the same bounded wait. A retry that also fails to answer must keep the
 *  error state up rather than fall back to a clean signed-out publication. */
export function classifyRefreshOutcome<S extends SessionLike>(
  result: SessionLoadOutcome<S>,
): { userId: string | null; sessionUnavailable: boolean } {
  if (!result.ok) return { userId: null, sessionUnavailable: true };
  return { userId: result.session?.user.id ?? null, sessionUnavailable: false };
}
