// Lightweight auth context: subscribes to Supabase session changes and exposes
// the current user id to the tree. Other screens use useAuth() instead of
// poking supabase directly.

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getSupabaseClient } from "../supabase/client";

interface AuthState {
  userId: string | null;
  loading: boolean;
}

const AuthContext = createContext<AuthState>({ userId: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ userId: null, loading: true });

  useEffect(() => {
    const supabase = getSupabaseClient();
    let cancelled = false;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (cancelled) return;
        setState({ userId: data.session?.user.id ?? null, loading: false });
      })
      .catch((e) => {
        // Network failure (demo build with placeholder Supabase, offline,
        // blocked CORS). Don't strand the UI in loading-forever — render
        // the unauthenticated state so the landing page becomes visible.
        if (typeof console !== "undefined") console.warn("[auth] getSession failed, treating as signed out", e);
        if (!cancelled) setState({ userId: null, loading: false });
      });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({ userId: session?.user.id ?? null, loading: false });
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
