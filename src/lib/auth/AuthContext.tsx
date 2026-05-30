// Lightweight auth context: subscribes to Supabase session changes and exposes
// the current user id + whether the public.users profile row exists.
// OAuth sign-in (Google) lands an authenticated session before the profile
// row exists; the app routes such users to /complete-profile rather than
// /journal until they finish the birth-date (C10) prompt.

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getSupabaseClient } from "../supabase/client";

interface AuthState {
  userId: string | null;
  /** True when the public.users row exists for the current session.
   *  Null while we're still resolving it (or no session). */
  hasProfile: boolean | null;
  loading: boolean;
}

const AuthContext = createContext<AuthState>({ userId: null, hasProfile: null, loading: true });

async function fetchHasProfile(userId: string): Promise<boolean> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from("users").select("id").eq("id", userId).maybeSingle();
  if (error) {
    if (typeof console !== "undefined") console.warn("[auth] hasProfile probe failed", error.message);
    return false;
  }
  return data !== null;
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
        if (typeof console !== "undefined") console.warn("[auth] profile probe timed out; continuing");
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
  const [state, setState] = useState<AuthState>({ userId: null, hasProfile: null, loading: true });

  useEffect(() => {
    const supabase = getSupabaseClient();
    let cancelled = false;
    // Remember the last resolved user so repeated auth events (TOKEN_REFRESHED,
    // a fresh SIGNED_IN for the same user on re-entry) don't re-strand the UI
    // in loading while we re-probe — we keep showing the app.
    let lastUserId: string | null = null;
    let lastHasProfile: boolean | null = null;

    async function resolveSession(userId: string | null) {
      if (cancelled) return;
      if (!userId) {
        lastUserId = null;
        lastHasProfile = null;
        setState({ userId: null, hasProfile: null, loading: false });
        return;
      }
      // Same user we already resolved — don't flip back to loading (avoids the
      // re-entry infinite-loader). Re-probe quietly and update in place.
      if (userId === lastUserId && lastHasProfile !== null) {
        setState({ userId, hasProfile: lastHasProfile, loading: false });
        const refreshed = await withTimeout(fetchHasProfile(userId), PROFILE_PROBE_TIMEOUT_MS, lastHasProfile);
        if (cancelled) return;
        lastHasProfile = refreshed;
        setState({ userId, hasProfile: refreshed, loading: false });
        return;
      }
      // First resolve for this user: mark loading until we know the profile.
      setState({ userId, hasProfile: null, loading: true });
      const hasProfile = await withTimeout(fetchHasProfile(userId), PROFILE_PROBE_TIMEOUT_MS, false);
      if (cancelled) return;
      lastUserId = userId;
      lastHasProfile = hasProfile;
      setState({ userId, hasProfile, loading: false });
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
        if (typeof console !== "undefined") console.warn("[auth] getSession failed, treating as signed out", e);
        if (!cancelled) setState({ userId: null, hasProfile: null, loading: false });
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
