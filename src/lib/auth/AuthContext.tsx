// Lightweight auth context: subscribes to Supabase session changes and exposes
// the current user id + whether the public.users profile row exists.
// OAuth sign-in (Google) lands an authenticated session before the profile
// row exists; the app routes such users to /complete-profile rather than
// /journal until they finish the birth-date (C10) prompt.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { getSupabaseClient } from "../supabase/client";
import { ageInYears, signOut as signOutAuth } from "../supabase/auth";
import { preserveKnownMinorForMissingProfile, type ProfileProbe } from "./profile-probe";
import { subscribeRecoveryStorageEvent } from "./recovery-storage-events";
import { nextRecoveryProof } from "./reset-password-helpers";
import {
  clearRecoveryProof,
  clearRecoveryPending,
  createRecoveryProof,
  applyRecoveryPendingStorageValue,
  isRecoveryPendingInMemory,
  loadRecoveryPending,
  loadRecoveryProof,
  parseRecoveryProof,
  persistRecoveryProof,
  RECOVERY_PENDING_KEY,
  RECOVERY_PROOF_KEY,
  subscribeRecoveryPending,
  recoveryProofMatchesSession,
  type RecoveryProof,
  type RecoverySessionIdentity,
} from "./recovery-proof-store";

// A signed-in user counts as a minor for safety routing when under 18 (in
// practice 14-17, since <14 cannot register — C10). Crisis routing uses this
// to point minors at a youth-appropriate hotline (KO -> 1388).
const MINOR_AGE_CEILING = 18;

interface AuthState {
  userId: string | null;
  /** True when the public.users row exists for the current session.
   *  Null while we're still resolving it (or no session). */
  hasProfile: boolean | null;
  /** True when the profile's birth_date puts the user under 18. Null while
   *  resolving, no session, or no birth_date on file. */
  isMinor: boolean | null;
  /** 만 나이. 같은 프로브가 이미 읽는 `birth_date` 에서 나오므로 추가
   *  질의가 없다. 인터뷰의 시기 목록이 이걸 쓴다(`periodsForAge`).
   *  미해결/미로그인/프로브 실패/`birth_date` 이상이면 null. */
  age: number | null;
  /** True when the published hasProfile/isMinor came from a FAILED probe
   *  (DB error or timeout), not a server answer. hasProfile:false with this
   *  flag set means "unknown" — screens must hold + retry, never eject to
   *  /complete-profile (that stranded real accounts on network blips). */
  profileProbeFailed: boolean;
  loading: boolean;
}

interface AuthContextValue extends AuthState {
  /** Persisted, session-bound proof that Supabase entered password recovery.
   * A normal SIGNED_IN/INITIAL_SESSION event never creates it. */
  recoveryUserId: string | null;
  recoverySessionId: string | null;
  /** True only after persisted recovery proof and Supabase session agree. */
  recoveryReady: boolean;
  /** Provisional lock written before a recovery auth mutation starts. */
  recoveryPendingGlobal: boolean;
  /** Register a recovery session proven by a native callback/OTP response. */
  activateRecoverySession: (identity: RecoverySessionIdentity) => Promise<void>;
  /** Clear recovery mode only if the caller still owns the same proof. */
  completeRecovery: (expectedUserId?: string, expectedSessionId?: string) => Promise<void>;
  /** Re-probe the current session's profile. Call after changing data that
   *  feeds hasProfile/isMinor (e.g. a date-of-birth correction) so the cached
   *  values update without waiting for the next auth event or an app restart. */
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  userId: null,
  hasProfile: null,
  isMinor: null,
  age: null,
  profileProbeFailed: false,
  loading: true,
  recoveryUserId: null,
  recoverySessionId: null,
  recoveryReady: false,
  recoveryPendingGlobal: false,
  activateRecoverySession: async () => {},
  completeRecovery: async () => {},
  refresh: async () => {},
});

async function fetchProfile(userId: string): Promise<ProfileProbe> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("users")
    .select("id, birth_date")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    // A query ERROR is not "no profile". supabase-js resolves errors as
    // { error } (it does not throw), and folding that into hasProfile:false
    // ejected real accounts to /complete-profile on any network blip.
    if (typeof console !== "undefined") console.log("[auth] profile probe failed", error.message);
    return { hasProfile: false, isMinor: null, age: null, probeFailed: true };
  }
  if (!data) return { hasProfile: false, isMinor: null, age: null };
  if (!data.birth_date) {
    // birth_date is NOT NULL in the schema (0002_users + the 0030 server age-gate),
    // so a profile WITHOUT it is a data anomaly. Never silently route an unknown-age
    // profile as an ADULT — that would send a possible minor to the adult crisis
    // hotline and grant adult-only data flows (the minor clamp 0033 keys off this).
    // Fail SAFE to the protective path: treat as a minor until the age is known.
    if (typeof console !== "undefined") console.warn("[auth] profile has no birth_date; routing protectively as minor");
    return { hasProfile: true, isMinor: true, age: null };
  }
  const age = ageInYears(data.birth_date);
  const isMinor = age < MINOR_AGE_CEILING;
  return { hasProfile: true, isMinor, age };
}

/** Resolve a promise to `fallback` if it doesn't settle within `ms`. Guards
 *  the UI from a Supabase call that hangs (flaky network, blocked CORS on the
 *  demo build) leaving the app stuck on the loader forever. */
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    let done = false;
    const t = setTimeout(() => {
      if (!done) {
        done = true;
        if (typeof console !== "undefined") console.log("[auth] profile probe timed out; continuing");
        resolve(fallback);
      }
    }, ms);
    void p.then((v) => {
      if (!done) {
        done = true;
        clearTimeout(t);
        resolve(v);
      }
    }).catch(() => {
      if (!done) {
        done = true;
        clearTimeout(t);
        resolve(fallback);
      }
    });
  });
}

const PROFILE_PROBE_TIMEOUT_MS = 8000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    userId: null,
    hasProfile: null,
    isMinor: null,
    age: null,
    profileProbeFailed: false,
    loading: true,
  });

  // Last resolved user + probe, so repeated auth events (TOKEN_REFRESHED, a
  // fresh SIGNED_IN for the same user on re-entry) don't re-strand the UI in
  // loading while we re-probe — we keep showing the app. Refs (not effect
  // closure variables) because refresh() must update this cache too: after
  // /complete-profile refreshes hasProfile to true, the next auth event would
  // otherwise re-publish the stale pre-refresh probe (hasProfile=false) and
  // bounce the user back to /complete-profile mid-session (E2E-1 family).
  const lastUserIdRef = useRef<string | null>(null);
  const lastProbeRef = useRef<ProfileProbe | null>(null);
  // Resolution generation: every new resolution (auth event or refresh()) takes
  // ++gen; an async probe only publishes if its gen is still current. Without
  // this, a slow in-flight probe that started BEFORE a profile change could
  // resolve last and overwrite the fresher state/cache with a stale snapshot
  // (e.g. re-publishing hasProfile=false right after /complete-profile created
  // the row, bouncing the user back through the index/IntroGate guards).
  const probeGenRef = useRef(0);
  // Supabase persists auth sessions, so recovery provenance must persist too.
  // Bind it to JWT session_id: the same user's later normal login must never be
  // mistaken for the earlier recovery session.
  const [recoveryProof, setRecoveryProof] = useState<RecoveryProof | null>(null);
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [recoveryPendingGlobal, setRecoveryPendingGlobal] = useState(isRecoveryPendingInMemory);
  const recoveryProofRef = useRef<RecoveryProof | null>(null);
  const recoveryProofGenerationRef = useRef(0);
  const latestSessionRef = useRef<Session | null>(null);
  const publishRecoveryProof = useCallback((proof: RecoveryProof | null) => {
    recoveryProofGenerationRef.current += 1;
    recoveryProofRef.current = proof;
    setRecoveryProof(proof);
  }, []);
  const activateRecoverySession = useCallback(async (identity: RecoverySessionIdentity) => {
    const proof = createRecoveryProof(identity);
    // Lock the current frame immediately; persistence completes before the
    // verify/callback handler releases its pending state.
    publishRecoveryProof(proof);
    try {
      await persistRecoveryProof(proof);
      setRecoveryReady(true);
    } catch (error) {
      // A recovery session without a durable marker could escape on restart.
      // Fail closed by removing this device's session and the in-memory proof.
      if (
        recoveryProofRef.current?.userId === proof.userId &&
        recoveryProofRef.current.sessionId === proof.sessionId
      ) {
        try {
          await signOutAuth("local");
          publishRecoveryProof(null);
        } catch (signOutError) {
          // signOut returns { error } rather than throwing at the client layer;
          // the wrapper converts that to a throw. Keep proof locked on failure.
          if (typeof console !== "undefined") {
            console.warn("[auth] recovery persistence sign-out failed", signOutError);
          }
        }
      }
      throw error;
    }
  }, [publishRecoveryProof]);
  const completeRecovery = useCallback(async (expectedUserId?: string, expectedSessionId?: string) => {
    const owned = recoveryProofRef.current;
    if (owned && (
      (expectedUserId && owned.userId !== expectedUserId) ||
      (expectedSessionId && owned.sessionId !== expectedSessionId)
    )) {
      return;
    }
    // Clear disk first. If it fails, keep the route lock and let the caller
    // surface an error instead of silently restoring stale recovery on restart.
    await clearRecoveryProof();
    await clearRecoveryPending();
    if (recoveryProofRef.current === owned) publishRecoveryProof(null);
  }, [publishRecoveryProof]);

  useEffect(() => subscribeRecoveryPending(setRecoveryPendingGlobal), []);

  useEffect(() => {
    const supabase = getSupabaseClient();
    let cancelled = false;

    async function resolveSession(userId: string | null) {
      if (cancelled) return;
      const gen = ++probeGenRef.current;
      if (!userId) {
        lastUserIdRef.current = null;
        lastProbeRef.current = null;
        setState({ userId: null, hasProfile: null, isMinor: null, age: null, profileProbeFailed: false, loading: false });
        return;
      }
      // Same user we already resolved — don't flip back to loading (avoids the
      // re-entry infinite-loader). Re-probe quietly and update in place.
      const lastProbe = lastProbeRef.current;
      if (userId === lastUserIdRef.current && lastProbe !== null) {
        setState({
          userId,
          hasProfile: lastProbe.hasProfile,
          isMinor: lastProbe.isMinor,
          age: lastProbe.age ?? null,
          profileProbeFailed: lastProbe.probeFailed === true,
          loading: false,
        });
        const reprobe = preserveKnownMinorForMissingProfile(
          await withTimeout(fetchProfile(userId), PROFILE_PROBE_TIMEOUT_MS, lastProbe),
          lastProbe,
        );
        // The timeout fallback above already keeps lastProbe, but fetchProfile
        // RESOLVES (never rejects) on a DB error — so an errored re-probe used
        // to publish hasProfile:false over a known-good cache and yank the
        // user to /complete-profile mid-session. Same rule for both failure
        // shapes: a failed probe never overwrites a known-good answer.
        const refreshed = reprobe.probeFailed === true ? lastProbe : reprobe;
        if (cancelled || gen !== probeGenRef.current) return;
        lastProbeRef.current = refreshed;
        setState({
          userId,
          hasProfile: refreshed.hasProfile,
          isMinor: refreshed.isMinor,
          age: refreshed.age ?? null,
          profileProbeFailed: refreshed.probeFailed === true,
          loading: false,
        });
        return;
      }
      // First resolve for this user: mark loading until we know the profile.
      setState({ userId, hasProfile: null, isMinor: null, age: null, profileProbeFailed: false, loading: true });
      const probe = await withTimeout(fetchProfile(userId), PROFILE_PROBE_TIMEOUT_MS, {
        hasProfile: false,
        isMinor: null,
        age: null,
        // A timed-out FIRST probe is "unknown", not "no profile" — flag it so
        // guard screens hold on their loader instead of ejecting the account.
        probeFailed: true,
      });
      if (cancelled || gen !== probeGenRef.current) return;
      lastUserIdRef.current = userId;
      lastProbeRef.current = probe;
      setState({
        userId,
        hasProfile: probe.hasProfile,
        isMinor: probe.isMinor,
        age: probe.age ?? null,
        profileProbeFailed: probe.probeFailed === true,
        loading: false,
      });
    }

    type QueuedAuthEvent = { event: AuthChangeEvent; session: Session | null };
    let bootstrapped = false;
    const queuedAuthEvents: QueuedAuthEvent[] = [];
    let storageProofGeneration = 0;

    const sameProof = (left: RecoveryProof | null, right: RecoveryProof | null) =>
      left?.userId === right?.userId && left?.sessionId === right?.sessionId;

    let failClosedRunning = false;
    const failClosedRecovery = async (proof: RecoveryProof | null, error: unknown): Promise<boolean> => {
      // A stale A failure must never revoke a newer B proof. Restore A only when
      // no newer owner exists, then yield once so already-queued auth/storage
      // publications can win before local sign-out begins.
      if (proof && !recoveryProofRef.current) publishRecoveryProof(proof);
      const requestedGeneration = recoveryProofGenerationRef.current;
      await Promise.resolve();
      const currentOwner = recoveryProofRef.current;
      if (
        (proof && (!currentOwner || !sameProof(currentOwner, proof))) ||
        (!proof && currentOwner)
      ) {
        return false;
      }
      if (failClosedRunning) {
        // The in-flight owner handles this failure. Do not let a second stale
        // path overwrite its proof/readiness state.
        if (requestedGeneration === recoveryProofGenerationRef.current && !currentOwner) {
          setRecoveryReady(false);
        }
        return false;
      }
      failClosedRunning = true;
      if (typeof console !== "undefined") {
        console.warn("[auth] recovery proof persistence failed; signing out locally", error);
      }
      // Restore the last proof before an async sign-out attempt. Account-change
      // handling may already have published null; leaving that gap would let an
      // intro-complete route render while local sign-out is still unresolved.
      if (!proof) setRecoveryReady(false);
      try {
        await signOutAuth("local");
        const ownerAfterSignOut = recoveryProofRef.current;
        if (
          (proof && ownerAfterSignOut && !sameProof(ownerAfterSignOut, proof)) ||
          (!proof && ownerAfterSignOut)
        ) {
          // signOut may already have removed the live session, but a newer proof
          // must remain durable/locked and must not be deleted by stale cleanup.
          setRecoveryReady(false);
          failClosedRunning = false;
          return false;
        }
        await clearRecoveryProof();
        await clearRecoveryPending();
        if (!proof || sameProof(recoveryProofRef.current, proof)) publishRecoveryProof(null);
        setRecoveryReady(true);
        void resolveSession(null);
        failClosedRunning = false;
        return true;
      } catch (signOutError) {
        if (typeof console !== "undefined") {
          console.warn("[auth] recovery fail-closed sign-out failed", signOutError);
        }
        // Never publish loading=false while a session we could not classify or
        // revoke remains. Existing proof stays visible so route guards lock.
        if (
          proof &&
          (!recoveryProofRef.current || sameProof(recoveryProofRef.current, proof))
        ) {
          publishRecoveryProof(proof);
        }
        setRecoveryReady(false);
        setState((current) => ({ ...current, loading: true }));
        failClosedRunning = false;
        return false;
      }
    };

    const handleAuthEvent = (event: AuthChangeEvent, session: Session | null) => {
      latestSessionRef.current = session;
      const previous = recoveryProofRef.current;
      const next = nextRecoveryProof(previous, event, session);
      if (!sameProof(previous, next)) publishRecoveryProof(next);

      if (
        event === "INITIAL_SESSION" &&
        isRecoveryPendingInMemory() &&
        !previous &&
        !next
      ) {
        if (session) {
          void failClosedRecovery(
            null,
            new Error("Recovery bootstrap restored a session before proof"),
          );
        } else {
          void clearRecoveryPending()
            .then(() => resolveSession(null))
            .catch((error) => failClosedRecovery(null, error));
        }
        return;
      }

      if (event === "PASSWORD_RECOVERY") {
        if (!next) {
          // A recovery event without a session_id cannot be safely bound.
          void failClosedRecovery(null, new Error("Recovery session has no stable session_id"));
        } else {
          void persistRecoveryProof(next)
            .then(() => clearRecoveryPending())
            .catch((error) => failClosedRecovery(next, error));
        }
      } else if (event === "SIGNED_OUT") {
        void clearRecoveryProof()
          .then(() => clearRecoveryPending())
          .catch((error) => failClosedRecovery(previous, error));
      } else if (previous && !next) {
        if (session) {
          if (isRecoveryPendingInMemory()) {
            // A provisional B callback intentionally replaces A's session
            // before its authoritative redirectType/proof is available. Hold A's
            // lock; activateRecoverySession(B) or PASSWORD_RECOVERY will replace
            // it, while B failure cleanup revokes the resulting live session.
            publishRecoveryProof(previous);
            void resolveSession(session.user.id);
            return;
          }
          // A different live session appeared while recovery owned navigation.
          // Revoke it rather than clearing A's marker and treating B as ordinary.
          void failClosedRecovery(previous, new Error("Recovery session identity changed"));
        } else {
          void clearRecoveryProof()
            .then(() => clearRecoveryPending())
            .catch((error) => failClosedRecovery(previous, error));
        }
      }
      void resolveSession(session?.user.id ?? null);
    };

    // Subscribe before getSession/hydration. auth-js may emit PASSWORD_RECOVERY
    // while it consumes a cold web callback URL; queue that event until both the
    // persisted marker and current session have been reconciled.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!bootstrapped) {
        queuedAuthEvents.push({ event, session });
        return;
      }
      handleAuthEvent(event, session);
    });
    const handleRecoveryStorage = (event: StorageEvent) => {
      if (event.key === RECOVERY_PENDING_KEY) {
        const pending = applyRecoveryPendingStorageValue(event.newValue);
        if (event.newValue && !pending) {
          void failClosedRecovery(
            recoveryProofRef.current,
            new Error("Cross-tab recovery pending marker is invalid"),
          );
        }
        return;
      }
      if (event.key !== RECOVERY_PROOF_KEY) return;
      const generation = ++storageProofGeneration;
      const stored = parseRecoveryProof(event.newValue);
      if (!stored) {
        if (event.newValue) {
          void failClosedRecovery(
            recoveryProofRef.current,
            new Error("Cross-tab recovery proof marker is invalid"),
          );
          return;
        }
        if (!isRecoveryPendingInMemory()) publishRecoveryProof(null);
        return;
      }
      // Proof can arrive before Supabase broadcasts its session. Publishing it
      // now closes the cross-tab gap; then read shared auth storage to validate
      // without treating the tab's stale in-memory session as authoritative.
      publishRecoveryProof(stored);
      void supabase.auth.getSession()
        .then(({ data, error }) => {
          if (
            generation !== storageProofGeneration ||
            !sameProof(recoveryProofRef.current, stored)
          ) {
            return undefined;
          }
          if (error || !recoveryProofMatchesSession(stored, data.session)) {
            return failClosedRecovery(
              stored,
              error ?? new Error("Cross-tab recovery proof session mismatch"),
            );
          }
          latestSessionRef.current = data.session;
          void resolveSession(data.session?.user.id ?? null);
          return undefined;
        })
        .catch((error) => {
          if (
            generation !== storageProofGeneration ||
            !sameProof(recoveryProofRef.current, stored)
          ) {
            return false;
          }
          return failClosedRecovery(stored, error);
        });
    };
    const unsubscribeRecoveryStorage = subscribeRecoveryStorageEvent(
      typeof window === "undefined" ? undefined : window,
      handleRecoveryStorage,
    );

    void (async () => {
      type ProofLoadResult =
        | { ok: true; proof: RecoveryProof | null }
        | { ok: false; error: unknown };
      const proofLoad = loadRecoveryProof()
        .then<ProofLoadResult>((proof) => ({ ok: true, proof }))
        .catch<ProofLoadResult>((error) => ({ ok: false, error }));
      type PendingLoadResult =
        | { ok: true; pending: boolean }
        | { ok: false; error: unknown };
      const pendingLoad = loadRecoveryPending()
        .then<PendingLoadResult>((pending) => ({ ok: true, pending: pending !== null }))
        .catch<PendingLoadResult>((error) => ({ ok: false, error }));
      type SessionLoadResult =
        | { ok: true; session: Session | null }
        | { ok: false; error: unknown };
      const rawSessionLoad = supabase.auth.getSession()
        .then<SessionLoadResult>(({ data, error }) =>
          error ? { ok: false, error } : { ok: true, session: data.session },
        )
        .catch<SessionLoadResult>((error) => ({ ok: false, error }));
      const [sessionResult, markerResult, pendingResult] = await Promise.all([
        // getSession may refresh an expired token under the auth lock. Keep the
        // existing boot timeout, but preserve UNKNOWN separately from no session.
        withTimeout<SessionLoadResult>(
          rawSessionLoad,
          PROFILE_PROBE_TIMEOUT_MS,
          { ok: false, error: new Error("Auth session hydration timed out") },
        ),
        withTimeout<ProofLoadResult>(
          proofLoad,
          PROFILE_PROBE_TIMEOUT_MS,
          { ok: false, error: new Error("Recovery proof hydration timed out") },
        ),
        withTimeout<PendingLoadResult>(
          pendingLoad,
          PROFILE_PROBE_TIMEOUT_MS,
          { ok: false, error: new Error("Recovery pending hydration timed out") },
        ),
      ]);
      if (cancelled) return;

      let session = sessionResult.ok ? sessionResult.session : null;
      let sessionKnown = sessionResult.ok;
      const loadedMarker = markerResult.ok ? markerResult.proof : null;
      let proof = loadedMarker && (
        !sessionKnown || recoveryProofMatchesSession(loadedMarker, session)
      ) ? loadedMarker : null;
      let persisted = loadedMarker;
      let recoveryPendingOnDisk = pendingResult.ok && pendingResult.pending;

      // Events can arrive during either storage operation. Reconcile and flush
      // until the queue is empty before exposing loading=false.
      do {
        const batch = queuedAuthEvents.splice(0);
        for (const queued of batch) {
          sessionKnown = true;
          session = queued.session;
          proof = nextRecoveryProof(proof, queued.event, queued.session);
        }
        if (!sameProof(proof, persisted)) {
          if (proof) {
            await persistRecoveryProof(proof);
            if (recoveryPendingOnDisk) {
              await clearRecoveryPending();
              recoveryPendingOnDisk = false;
            }
          }
          else if (persisted) await clearRecoveryProof();
          persisted = proof;
        }
      } while (queuedAuthEvents.length > 0);

      // A cold callback may publish the session just before auth-js emits the
      // authoritative PASSWORD_RECOVERY event. Give that already-running event
      // one short turn before treating pending+session-without-proof as orphaned.
      if (recoveryPendingOnDisk && sessionKnown && session && !proof) {
        await new Promise<void>((resolve) => setTimeout(resolve, 50));
        const delayed = queuedAuthEvents.splice(0);
        for (const queued of delayed) {
          sessionKnown = true;
          session = queued.session;
          proof = nextRecoveryProof(proof, queued.event, queued.session);
        }
        const externallyPublished = recoveryProofRef.current;
        if (!proof && externallyPublished && recoveryProofMatchesSession(externallyPublished, session)) {
          proof = externallyPublished;
        }
        if (!sameProof(proof, persisted)) {
          if (proof) await persistRecoveryProof(proof);
          else if (persisted) await clearRecoveryProof();
          persisted = proof;
        }
      }

      if (proof && recoveryPendingOnDisk) {
        await clearRecoveryPending();
        recoveryPendingOnDisk = false;
      }

      const unreadableMarker = !markerResult.ok || !pendingResult.ok;
      const markerSessionMismatch = Boolean(
        sessionKnown &&
        loadedMarker &&
        session &&
        !recoveryProofMatchesSession(loadedMarker, session) &&
        !proof,
      );
      const unresolvedPending = recoveryPendingOnDisk && !proof;
      if (
        (unreadableMarker || markerSessionMismatch || (unresolvedPending && sessionKnown && !!session)) &&
        !proof
      ) {
        // We cannot prove this persisted session is ordinary. Remove only this
        // device's session; a storage fault must not silently unlock recovery.
        if (markerResult.ok === false && typeof console !== "undefined") {
          console.warn("[auth] recovery proof hydration failed; signing out locally", markerResult.error);
        }
        if (loadedMarker) publishRecoveryProof(loadedMarker);
        const closed = await failClosedRecovery(
          loadedMarker,
          markerResult.ok === false
            ? markerResult.error
            : pendingResult.ok === false
              ? pendingResult.error
              : unresolvedPending
                ? new Error("Recovery session changed before proof was persisted")
                : new Error("Persisted recovery proof does not match the current session"),
        );
        if (!closed) return;
        session = null;
        proof = null;
        queuedAuthEvents.splice(0);
      }

      if (recoveryPendingOnDisk && sessionKnown && !session && !proof) {
        // Invalid/expired callback never established a session. Releasing the
        // provisional lock is safe and lets the reset screen show its error.
        await clearRecoveryPending();
        recoveryPendingOnDisk = false;
      }

      // A cross-tab proof can arrive while the three bootstrap reads are in
      // flight. Never let their older null snapshot erase that newer lock.
      const externallyPublishedProof = recoveryProofRef.current;
      if (
        externallyPublishedProof &&
        (!proof || Date.parse(externallyPublishedProof.issuedAt) > Date.parse(proof.issuedAt))
      ) {
        proof = externallyPublishedProof;
      }
      publishRecoveryProof(proof);
      if (!latestSessionRef.current) latestSessionRef.current = session;
      bootstrapped = true;
      const bootstrapReady = sessionKnown || Boolean(proof) || !recoveryPendingOnDisk;
      setRecoveryReady(bootstrapReady);
      const sessionForResolve = latestSessionRef.current ?? session;
      const proofMatchesSession =
        !proof ||
        Boolean(sessionForResolve && recoveryProofMatchesSession(proof, sessionForResolve));
      if (sessionKnown && proofMatchesSession) {
        void resolveSession(sessionForResolve?.user.id ?? null);
      }
      if (!sessionResult.ok) {
        // Timeout does not cancel getSession. Reconcile its eventual answer as
        // INITIAL_SESSION; normal sessions still cannot create recovery proof.
        void rawSessionLoad.then(async (late) => {
          if (!cancelled && late.ok) {
            if (isRecoveryPendingInMemory() && !recoveryProofRef.current) {
              if (late.session) {
                await failClosedRecovery(
                  null,
                  new Error("Late recovery session arrived before proof"),
                );
              } else {
                await clearRecoveryPending();
                setRecoveryReady(true);
                handleAuthEvent("INITIAL_SESSION", null);
              }
              return;
            }
            handleAuthEvent("INITIAL_SESSION", late.session);
            setRecoveryReady(true);
          }
        });
      }
      // No await exists between the last queue check and bootstrapped=true, so
      // every subsequent event is handled by handleAuthEvent rather than lost.
    })().catch((error) => {
      if (cancelled) return;
      // Storage/session bootstrap failed before provenance could be reconciled.
      // Keep the app fail-closed by clearing local auth before publishing signed-out.
      void failClosedRecovery(recoveryProofRef.current, error).then((closed) => {
        if (closed) {
          bootstrapped = true;
          setRecoveryReady(true);
        }
      });
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
      unsubscribeRecoveryStorage();
    };
  }, [publishRecoveryProof]);

  // Manual re-probe for the current session: refreshes the published state AND
  // the probe cache on demand (profile completion, DOB correction, sign-out
  // settling). Writing the cache keeps the next auth event's in-place publish
  // consistent with what we just learned, instead of re-surfacing a stale probe.
  const refresh = useCallback(async () => {
    const supabase = getSupabaseClient();
    const gen = ++probeGenRef.current;
    let uid: string | null = null;
    try {
      // Same hang guard as boot: a wedged getSession would otherwise stall
      // submitSignUp/submitCompleteProfile (which await refresh() before
      // navigating) with the submit spinner stuck on.
      const { data } = await withTimeout(
        supabase.auth.getSession(),
        PROFILE_PROBE_TIMEOUT_MS,
        { data: { session: null }, error: null } as Awaited<ReturnType<typeof supabase.auth.getSession>>,
      );
      uid = data.session?.user.id ?? null;
    } catch {
      uid = null;
    }
    if (gen !== probeGenRef.current) return; // a newer resolution superseded us
    if (!uid) {
      lastUserIdRef.current = null;
      lastProbeRef.current = null;
      setState({ userId: null, hasProfile: null, isMinor: null, age: null, profileProbeFailed: false, loading: false });
      return;
    }
    // Timeout fallback: keep the last known-good probe for the SAME user
    // instead of hard-coding hasProfile:false — a flaky re-probe must not
    // poison the cache and yank an in-app user back to /complete-profile.
    const cached = lastUserIdRef.current === uid ? lastProbeRef.current : null;
    const fallback: ProfileProbe = cached ?? { hasProfile: false, isMinor: null, probeFailed: true };
    const reprobe = preserveKnownMinorForMissingProfile(
      await withTimeout(fetchProfile(uid), PROFILE_PROBE_TIMEOUT_MS, fallback),
      cached,
    );
    // Same anti-poison rule as the auth-event path: a FAILED re-probe (error,
    // not just timeout) never overwrites a known-good cached answer.
    const probe = reprobe.probeFailed === true && cached !== null && cached.probeFailed !== true ? cached : reprobe;
    if (gen !== probeGenRef.current) return;
    lastUserIdRef.current = uid;
    lastProbeRef.current = probe;
    setState({
      userId: uid,
      hasProfile: probe.hasProfile,
      isMinor: probe.isMinor,
      age: probe.age ?? null,
      profileProbeFailed: probe.probeFailed === true,
      loading: false,
    });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      recoveryUserId: recoveryProof?.userId ?? null,
      recoverySessionId: recoveryProof?.sessionId ?? null,
      recoveryReady,
      recoveryPendingGlobal,
      activateRecoverySession,
      completeRecovery,
      refresh,
    }),
    [
      activateRecoverySession,
      completeRecovery,
      recoveryPendingGlobal,
      recoveryProof,
      recoveryReady,
      refresh,
      state,
    ],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
