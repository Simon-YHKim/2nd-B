// Lightweight auth context: subscribes to Supabase session changes and exposes
// the current user id + whether the public.users profile row exists.
// OAuth sign-in (Google) lands an authenticated session before the profile
// row exists; the app routes such users to /complete-profile rather than
// /journal until they finish the birth-date (C10) prompt.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getSupabaseClient } from "../supabase/client";
import { ageInYears } from "../supabase/auth";
import type { EncryptedNativeStorageRecoveryConsent } from "../storage/encrypted-native-storage";
import { preserveKnownMinorForMissingProfile, type ProfileProbe } from "./profile-probe";
import { noteResolvedOwner } from "./account-epoch";
import {
  attemptEncryptedNativeStorageRecovery,
  isEncryptedStorageRecoveryRequired,
  readAuthSessionOutcome,
} from "./storage-recovery";

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
  /** The native encrypted auth session is durably unreadable. This is an
   *  unknown auth state, not a signed-out answer. Only an explicit two-step
   *  recovery consent may clear the local encrypted data. */
  storageRecoveryRequired: boolean;
  /** Re-probe the current session's profile. Call after changing data that
   *  feeds hasProfile/isMinor (e.g. a date-of-birth correction) so the cached
   *  values update without waiting for the next auth event or an app restart. */
  refresh: () => Promise<void>;
  /** Discard unreadable encrypted local data only after the recovery UI has
   *  produced the exact explicit consent contract. Returns true only after a
   *  fresh Supabase singleton has been created and a re-subscription queued. */
  recoverEncryptedStorage: (consent: EncryptedNativeStorageRecoveryConsent) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextValue>({
  userId: null,
  hasProfile: null,
  isMinor: null,
  age: null,
  profileProbeFailed: false,
  storageRecoveryRequired: false,
  loading: true,
  refresh: async () => {},
  recoverEncryptedStorage: async () => false,
});

async function fetchProfile(
  userId: string,
  supabase = getSupabaseClient(),
): Promise<ProfileProbe> {
  const { data, error } = await supabase
    .from("users")
    .select("id, birth_date")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    // A query ERROR is not "no profile". supabase-js resolves errors as
    // { error } (it does not throw), and folding that into hasProfile:false
    // ejected real accounts to /complete-profile on any network blip.
    if (typeof console !== "undefined") console.log("[auth] profile probe unavailable");
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
  const [storageRecoveryRequired, setStorageRecoveryRequired] = useState(false);
  // Recovery-required/loading transitions deliberately do not publish an
  // owner resolution. They are unknown auth states, so keep them separate
  // from the setState + noteResolvedOwner invariant for resolved states.
  const publishUnresolvedAuthState = setState;

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
  // A storage-recovery epoch invalidates old-client callbacks immediately,
  // before React runs the effect cleanup. The next effect always obtains the
  // freshly recreated singleton and installs a new auth subscription.
  const [sessionEpoch, setSessionEpoch] = useState(0);
  const sessionEpochRef = useRef(0);
  const storageRecoveryRequiredRef = useRef(false);

  const markStorageRecoveryRequired = useCallback(() => {
    storageRecoveryRequiredRef.current = true;
    probeGenRef.current += 1;
    if (typeof console !== "undefined") {
      console.warn("[auth] encrypted session storage requires explicit recovery");
    }
    // Block authenticated surfaces while preserving the distinct recovery
    // flag. Do not publish a resolved owner-null event: unreadable storage is
    // still not evidence that the user explicitly signed out.
    setStorageRecoveryRequired(true);
    publishUnresolvedAuthState({
      userId: null,
      hasProfile: null,
      isMinor: null,
      age: null,
      profileProbeFailed: false,
      loading: false,
    });
  }, [publishUnresolvedAuthState]);

  useEffect(() => {
    let cancelled = false;
    const effectEpoch = sessionEpoch;
    const isCurrent = () => !cancelled
      && sessionEpochRef.current === effectEpoch
      && !storageRecoveryRequiredRef.current;
    let supabase: ReturnType<typeof getSupabaseClient>;
    try {
      supabase = getSupabaseClient();
    } catch (error) {
      if (isEncryptedStorageRecoveryRequired(error)) {
        markStorageRecoveryRequired();
      } else {
        if (typeof console !== "undefined") console.log("[auth] session client unavailable");
        noteResolvedOwner(null);
        setState({
          userId: null,
          hasProfile: null,
          isMinor: null,
          age: null,
          profileProbeFailed: false,
          loading: false,
        });
      }
      return () => {
        cancelled = true;
      };
    }

    async function resolveSession(userId: string | null) {
      if (!isCurrent()) return;
      const gen = ++probeGenRef.current;
      if (!userId) {
        lastUserIdRef.current = null;
        lastProbeRef.current = null;
        noteResolvedOwner(null);
        setState({
          userId: null,
          hasProfile: null,
          isMinor: null,
          age: null,
          profileProbeFailed: false,
          loading: false,
        });
        return;
      }
      // Same user we already resolved — don't flip back to loading (avoids the
      // re-entry infinite-loader). Re-probe quietly and update in place.
      const lastProbe = lastProbeRef.current;
      if (userId === lastUserIdRef.current && lastProbe !== null) {
        noteResolvedOwner(userId);
        setState({
          userId,
          hasProfile: lastProbe.hasProfile,
          isMinor: lastProbe.isMinor,
          age: lastProbe.age ?? null,
          profileProbeFailed: lastProbe.probeFailed === true,
          loading: false,
        });
        const reprobe = preserveKnownMinorForMissingProfile(
          await withTimeout(fetchProfile(userId, supabase), PROFILE_PROBE_TIMEOUT_MS, lastProbe),
          lastProbe,
        );
        // The timeout fallback above already keeps lastProbe, but fetchProfile
        // RESOLVES (never rejects) on a DB error — so an errored re-probe used
        // to publish hasProfile:false over a known-good cache and yank the
        // user to /complete-profile mid-session. Same rule for both failure
        // shapes: a failed probe never overwrites a known-good answer.
        const refreshed = reprobe.probeFailed === true ? lastProbe : reprobe;
        if (!isCurrent() || gen !== probeGenRef.current) return;
        lastProbeRef.current = refreshed;
        noteResolvedOwner(userId);
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
      noteResolvedOwner(userId);
      setState({ userId, hasProfile: null, isMinor: null, age: null, profileProbeFailed: false, loading: true });
      const probe = await withTimeout(fetchProfile(userId, supabase), PROFILE_PROBE_TIMEOUT_MS, {
        hasProfile: false,
        isMinor: null,
        age: null,
        // A timed-out FIRST probe is "unknown", not "no profile" — flag it so
        // guard screens hold on their loader instead of ejecting the account.
        probeFailed: true,
      });
      if (!isCurrent() || gen !== probeGenRef.current) return;
      lastUserIdRef.current = userId;
      lastProbeRef.current = probe;
      noteResolvedOwner(userId);
      setState({
        userId,
        hasProfile: probe.hasProfile,
        isMinor: probe.isMinor,
        age: probe.age ?? null,
        profileProbeFailed: probe.probeFailed === true,
        loading: false,
      });
    }

    // Preserve both getSession failure shapes. Supabase may reject or resolve
    // with { error }; neither may be collapsed to session:null before the exact
    // encrypted-storage recovery signal is classified.
    void readAuthSessionOutcome(
      () => supabase.auth.getSession(),
      PROFILE_PROBE_TIMEOUT_MS,
    ).then((outcome) => {
      if (cancelled || sessionEpochRef.current !== effectEpoch) return;
      if (outcome.status === "storage-recovery-required") {
        markStorageRecoveryRequired();
        return;
      }
      if (outcome.status === "unavailable") {
        if (typeof console !== "undefined") console.log("[auth] session read unavailable");
        void resolveSession(null);
        return;
      }
      void resolveSession(outcome.userId);
    }).catch(() => {
      // The outcome helper is fail-closed, but keep this boundary sanitized if
      // a future implementation introduces a new rejection path.
      if (typeof console !== "undefined") console.log("[auth] session read unavailable");
      void resolveSession(null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      void resolveSession(session?.user.id ?? null);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [markStorageRecoveryRequired, sessionEpoch]);

  // Manual re-probe for the current session: refreshes the published state AND
  // the probe cache on demand (profile completion, DOB correction, sign-out
  // settling). Writing the cache keeps the next auth event's in-place publish
  // consistent with what we just learned, instead of re-surfacing a stale probe.
  const refresh = useCallback(async () => {
    if (storageRecoveryRequiredRef.current) return;
    let supabase: ReturnType<typeof getSupabaseClient>;
    try {
      supabase = getSupabaseClient();
    } catch (error) {
      if (isEncryptedStorageRecoveryRequired(error)) markStorageRecoveryRequired();
      else if (typeof console !== "undefined") console.log("[auth] session client unavailable");
      return;
    }
    const gen = ++probeGenRef.current;
    const outcome = await readAuthSessionOutcome(
      () => supabase.auth.getSession(),
      PROFILE_PROBE_TIMEOUT_MS,
    );
    if (outcome.status === "storage-recovery-required") {
      if (gen === probeGenRef.current) markStorageRecoveryRequired();
      return;
    }
    if (gen !== probeGenRef.current) return; // a newer resolution superseded us
    if (outcome.status === "unavailable" && typeof console !== "undefined") {
      console.log("[auth] session read unavailable");
    }
    const uid = outcome.status === "ready" ? outcome.userId : null;
    if (!uid) {
      lastUserIdRef.current = null;
      lastProbeRef.current = null;
      noteResolvedOwner(null);
      setState({
        userId: null,
        hasProfile: null,
        isMinor: null,
        age: null,
        profileProbeFailed: false,
        loading: false,
      });
      return;
    }
    // Timeout fallback: keep the last known-good probe for the SAME user
    // instead of hard-coding hasProfile:false — a flaky re-probe must not
    // poison the cache and yank an in-app user back to /complete-profile.
    const cached = lastUserIdRef.current === uid ? lastProbeRef.current : null;
    const fallback: ProfileProbe = cached ?? { hasProfile: false, isMinor: null, probeFailed: true };
    const reprobe = preserveKnownMinorForMissingProfile(
      await withTimeout(fetchProfile(uid, supabase), PROFILE_PROBE_TIMEOUT_MS, fallback),
      cached,
    );
    // Same anti-poison rule as the auth-event path: a FAILED re-probe (error,
    // not just timeout) never overwrites a known-good cached answer.
    const probe = reprobe.probeFailed === true && cached !== null && cached.probeFailed !== true ? cached : reprobe;
    if (gen !== probeGenRef.current) return;
    lastUserIdRef.current = uid;
    lastProbeRef.current = probe;
    noteResolvedOwner(uid);
    setState({
      userId: uid,
      hasProfile: probe.hasProfile,
      isMinor: probe.isMinor,
      age: probe.age ?? null,
      profileProbeFailed: probe.probeFailed === true,
      loading: false,
    });
  }, [markStorageRecoveryRequired]);

  const recoverEncryptedStorage = useCallback(async (
    consent: EncryptedNativeStorageRecoveryConsent,
  ): Promise<boolean> => {
    // Consent alone is insufficient: recovery is available only after this
    // provider observed the exact durable-recovery signal.
    if (!storageRecoveryRequiredRef.current) return false;

    const result = await attemptEncryptedNativeStorageRecovery(consent);
    if (result !== "recovered") {
      storageRecoveryRequiredRef.current = true;
      if (result === "failed" && typeof console !== "undefined") {
        console.warn("[auth] encrypted session storage recovery failed");
      }
      return false;
    }

    // Invalidate every callback bound to the retired client before publishing
    // the epoch. The next effect subscribes to the newly-created singleton and
    // performs a fresh getSession; no signOut call touches the old client.
    const nextEpoch = sessionEpochRef.current + 1;
    sessionEpochRef.current = nextEpoch;
    storageRecoveryRequiredRef.current = false;
    setStorageRecoveryRequired(false);
    probeGenRef.current += 1;
    lastUserIdRef.current = null;
    lastProbeRef.current = null;
    publishUnresolvedAuthState({
      userId: null,
      hasProfile: null,
      isMinor: null,
      age: null,
      profileProbeFailed: false,
      loading: true,
    });
    setSessionEpoch(nextEpoch);
    return true;
  }, [publishUnresolvedAuthState]);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, storageRecoveryRequired, refresh, recoverEncryptedStorage }),
    [state, storageRecoveryRequired, refresh, recoverEncryptedStorage],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
