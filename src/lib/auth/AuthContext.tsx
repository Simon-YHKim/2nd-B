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
    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setState({ userId: data.session?.user.id ?? null, loading: false });
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
