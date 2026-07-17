// React hook exposing the signed-in user's quest progression: total XP, level,
// progress breakdown, and subscription tier. Reads users.total_xp +
// users.subscription_tier (added in migrations 0019 / 0020).

import { useCallback, useEffect, useRef, useState } from "react";

import { useAuth } from "../auth/AuthContext";
import { createLatestWins } from "../async/latest-wins";
import { getEnv } from "../env";
import { getSupabaseClient } from "../supabase/client";
import { levelForXp, levelProgress, type LevelProgress } from "./levels";
import { resolveTier, type SubscriptionTier } from "./entitlements";
import { getUrlTierOverride } from "./dev-tier-url";

export interface Progression {
  totalXp: number;
  level: number;
  progress: LevelProgress;
  tier: SubscriptionTier;
  /**
   * C6 judge comp (Phase 4): server-side the cap RPCs already treat judges as
   * 'brain' (0088); this mirrors the flag so client-side gates (personas) comp
   * too. False while loading or on read failure — the server stays authoritative.
   */
  judge: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useProgression(): Progression {
  const { userId } = useAuth();
  const [totalXp, setTotalXp] = useState(0);
  const [tier, setTier] = useState<SubscriptionTier>("free");
  const [judge, setJudge] = useState(false);
  const [loading, setLoading] = useState(true);
  // refresh() is exposed so screens re-pull after a stage completes; two calls (or a
  // userId A->B switch) can overlap, and the slower/older response must not overwrite
  // the newer one, regressing XP/tier. Latest-wins guard drops superseded results.
  const guardRef = useRef(createLatestWins());

  const refresh = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    const token = guardRef.current.begin();
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("users")
        .select("total_xp, subscription_tier, judge_mode")
        .eq("id", userId)
        .maybeSingle();
      if (error) throw error;
      if (guardRef.current.isStale(token)) return;
      setTotalXp(data?.total_xp ?? 0);
      setTier(((data?.subscription_tier as SubscriptionTier) ?? "free"));
      setJudge(data?.judge_mode === true);
    } catch (e) {
      if (typeof console !== "undefined") console.warn("[progression] load failed", e);
    } finally {
      if (!guardRef.current.isStale(token)) setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Test/QA paywall override (EXPO_PUBLIC_FORCE_TIER). When not "off", every
  // user is treated as this tier, so all subscription gating that keys off
  // `progression.tier` (journal/note caps, chat daily cap, premium features)
  // is bypassed. Defaults to "brain" (everything unlocked) for the current
  // testing phase; set EXPO_PUBLIC_FORCE_TIER=off to restore real per-user
  // billing. This is the single chokepoint — no gate call-site needs editing.
  const forcedTier = getEnv().EXPO_PUBLIC_FORCE_TIER;
  // QA: a `?tier=` web URL param (when EXPO_PUBLIC_ALLOW_DEV_TIER=true) takes
  // precedence over the env FORCE_TIER, so one deployment yields per-tier links.
  const urlOverride = getUrlTierOverride();
  const override = urlOverride !== "off" ? urlOverride : forcedTier;

  return {
    totalXp,
    level: levelForXp(totalXp),
    progress: levelProgress(totalXp),
    tier: resolveTier(override, tier),
    judge,
    loading,
    refresh,
  };
}
