// Lightweight auth context: subscribes to Supabase session changes and exposes
// the current user id + whether the public.users profile row exists.
// OAuth sign-in (Google) lands an authenticated session before the profile
// row exists; the app routes such users to /complete-profile rather than
// /journal until they finish the birth-date (C10) prompt.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getSupabaseClient } from "../supabase/client";
import { ageInYears } from "../supabase/auth";
import { preserveKnownMinorForMissingProfile, type ProfileProbe } from "./profile-probe";

// A signed-in user counts as a minor for safety routing when under 18 (in
// practice 16-17, since <16 cannot register — C10). Crisis routing uses this
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
  loading: boolean;
}

interface AuthContextValue extends AuthState {
  /** Re-probe the current session's profile. Call after changing data that
   *  feeds hasProfile/isMinor (e.g. a date-of-birth correction) so the cached
   *  values update without waiting for the next auth event or an app restart. */
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  userId: null,
  hasProfile: null,
  isMinor: null,
  loading: true,
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
    if (typeof console !== "undefined") console.log("[auth] profile probe failed", error.message);
    return { hasProfile: false, isMinor: null };
  }
  if (!data) return { hasProfile: false, isMinor: null };
  if (!data.birth_date) {
    // birth_date is NOT NULL in the schema (0002_users + the 0030 server age-gate),
    // so a profile WITHOUT it is a data anomaly. Never silently route an unknown-age
    // profile as an ADULT — that would send a possible minor to the adult crisis
    // hotline and grant adult-only data flows (the minor clamp 0033 keys off this).
    // Fail SAFE to the protective path: treat as a minor until the age is known.
    if (typeof console !== "undefined") console.warn("[auth] profile has no birth_date; routing protectively as minor");
    return { hasProfile: true, isMinor: true };
  }
  const isMinor = ageInYears(data.birth_date) < MINOR_AGE_CEILING;
  return { hasProfile: true, isMinor };
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

  useEffect(() => {
    const supabase = getSupabaseClient();
    let cancelled = false;

    async function resolveSession(userId: string | null) {
      if (cancelled) return;
      const gen = ++probeGenRef.current;
      if (!userId) {
        lastUserIdRef.current = null;
        lastProbeRef.current = null;
        setState({ userId: null, hasProfile: null, isMinor: null, loading: false });
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
          loading: false,
        });
        const refreshed = preserveKnownMinorForMissingProfile(
          await withTimeout(fetchProfile(userId), PROFILE_PROBE_TIMEOUT_MS, lastProbe),
          lastProbe,
        );
        if (cancelled || gen !== probeGenRef.current) return;
        lastProbeRef.current = refreshed;
        setState({
          userId,
          hasProfile: refreshed.hasProfile,
          isMinor: refreshed.isMinor,
          loading: false,
        });
        return;
      }
      // First resolve for this user: mark loading until we know the profile.
      setState({ userId, hasProfile: null, isMinor: null, loading: true });
      const probe = await withTimeout(fetchProfile(userId), PROFILE_PROBE_TIMEOUT_MS, {
        hasProfile: false,
        isMinor: null,
      });
      if (cancelled || gen !== probeGenRef.current) return;
      lastUserIdRef.current = userId;
      lastProbeRef.current = probe;
      setState({ userId, hasProfile: probe.hasProfile, isMinor: probe.isMinor, loading: false });
    }

    supabase.auth
      .getSession()
      .then(({ data }) => {
        void resolveSession(data.session?.user.id ?? null);
      })
      .catch((e) => {
        // Network failure (demo build with placeholder Supabase, offline,
        // blocked CORS). Don't strand the UI in loading-forever — render
        // the unauthenticated state so the landing page becomes visible.
        if (typeof console !== "undefined") console.log("[auth] getSession failed, treating as signed out", e);
        if (!cancelled) setState({ userId: null, hasProfile: null, isMinor: null, loading: false });
      });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      void resolveSession(session?.user.id ?? null);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Manual re-probe for the current session: refreshes the published state AND
  // the probe cache on demand (profile completion, DOB correction, sign-out
  // settling). Writing the cache keeps the next auth event's in-place publish
  // consistent with what we just learned, instead of re-surfacing a stale probe.
  const refresh = useCallback(async () => {
    const supabase = getSupabaseClient();
    const gen = ++probeGenRef.current;
    let uid: string | null = null;
    try {
      const { data } = await supabase.auth.getSession();
      uid = data.session?.user.id ?? null;
    } catch {
      uid = null;
    }
    if (gen !== probeGenRef.current) return; // a newer resolution superseded us
    if (!uid) {
      lastUserIdRef.current = null;
      lastProbeRef.current = null;
      setState({ userId: null, hasProfile: null, isMinor: null, loading: false });
      return;
    }
    // Timeout fallback: keep the last known-good probe for the SAME user
    // instead of hard-coding hasProfile:false — a flaky re-probe must not
    // poison the cache and yank an in-app user back to /complete-profile.
    const fallback: ProfileProbe =
      lastUserIdRef.current === uid && lastProbeRef.current !== null
        ? lastProbeRef.current
        : { hasProfile: false, isMinor: null };
    const probe = preserveKnownMinorForMissingProfile(
      await withTimeout(fetchProfile(uid), PROFILE_PROBE_TIMEOUT_MS, fallback),
      lastUserIdRef.current === uid ? lastProbeRef.current : null,
    );
    if (gen !== probeGenRef.current) return;
    lastUserIdRef.current = uid;
    lastProbeRef.current = probe;
    setState({ userId: uid, hasProfile: probe.hasProfile, isMinor: probe.isMinor, loading: false });
  }, []);

  const value = useMemo<AuthContextValue>(() => ({ ...state, refresh }), [state, refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
