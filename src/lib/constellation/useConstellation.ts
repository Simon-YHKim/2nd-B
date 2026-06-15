// React hook exposing the signed-in user's self-understanding constellation
// (북두칠성). Mirrors useProgression: subscribes to the auth user id, resolves
// the per-stage done/lit state from live Supabase counts, and exposes a
// refresh() so screens can re-pull after the user completes a stage.
//
// Signed out (userId === null) resolves immediately to the all-dim level-0
// state — the background renders dim star outlines and the app is never
// blocked. selectConstellationLevel absorbs per-query failures internally, so
// this hook only needs the standard try/finally for unexpected throws.

import { useCallback, useEffect, useState } from "react";

import { useAuth } from "../auth/AuthContext";
import {
  selectConstellationLevel,
  type ConstellationState,
} from "./selector";

// Stable all-dim default: used before the first resolve and whenever signed
// out, so consumers always have a fully-shaped state to render.
const EMPTY: ConstellationState = { level: 0, litCount: 0, stages: [] };

export interface ConstellationHook {
  state: ConstellationState;
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useConstellation(): ConstellationHook {
  const { userId } = useAuth();
  const [state, setState] = useState<ConstellationState>(EMPTY);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const next = await selectConstellationLevel(userId ?? null);
      setState(next);
    } catch (e) {
      // selectConstellationLevel already absorbs per-stage failures; this only
      // guards a truly unexpected throw (e.g. client init). Keep last state.
      if (typeof console !== "undefined") console.warn("[constellation] load failed", e);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { state, loading, refresh };
}
