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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ userId: null, hasProfile: null, loading: true });

  useEffect(() => {
    const supabase = getSupabaseClient();
    let cancelled = false;

    async function resolveSession(userId: string | null) {
      if (cancelled) return;
      if (!userId) {
        setState({ userId: null, hasProfile: null, loading: false });
        return;
      }
      // Optimistic: mark loading until we know whether the profile exists.
      // This keeps the index.tsx redirect from flickering between paths.
      setState({ userId, hasProfile: null, loading: true });
      const hasProfile = await fetchHasProfile(userId);
      if (cancelled) return;
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
