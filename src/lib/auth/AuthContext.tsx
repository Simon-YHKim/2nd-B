// Lightweight auth context: subscribes to Supabase session changes and exposes
// the current user id + whether the public.users profile row exists.
// OAuth sign-in (Google) lands an authenticated session before the profile
// row exists; the app routes such users to /complete-profile rather than
// /journal until they finish the birth-date (C10) prompt.

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getSupabaseClient } from "../supabase/client";
import { ageInYears } from "../supabase/auth";

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
  loading: boolean;
}

const AuthContext = createContext<AuthState>({
  userId: null,
  hasProfile: null,
  isMinor: null,
  loading: true,
});

interface ProfileProbe {
  hasProfile: boolean;
  isMinor: boolean | null;
}

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
  const isMinor = data.birth_date ? ageInYears(data.birth_date) < MINOR_AGE_CEILING : null;
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

  useEffect(() => {
    const supabase = getSupabaseClient();
    let cancelled = false;
    // Remember the last resolved user so repeated auth events (TOKEN_REFRESHED,
    // a fresh SIGNED_IN for the same user on re-entry) don't re-strand the UI
    // in loading while we re-probe — we keep showing the app.
    let lastUserId: string | null = null;
    let lastProbe: ProfileProbe | null = null;

    async function resolveSession(userId: string | null) {
      if (cancelled) return;
      if (!userId) {
        lastUserId = null;
        lastProbe = null;
        setState({ userId: null, hasProfile: null, isMinor: null, loading: false });
        return;
      }
      // Same user we already resolved — don't flip back to loading (avoids the
      // re-entry infinite-loader). Re-probe quietly and update in place.
      if (userId === lastUserId && lastProbe !== null) {
        setState({
          userId,
          hasProfile: lastProbe.hasProfile,
          isMinor: lastProbe.isMinor,
          loading: false,
        });
        const refreshed = await withTimeout(fetchProfile(userId), PROFILE_PROBE_TIMEOUT_MS, lastProbe);
        if (cancelled) return;
        lastProbe = refreshed;
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
      if (cancelled) return;
      lastUserId = userId;
      lastProbe = probe;
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

  const value = useMemo(() => state, [state]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
