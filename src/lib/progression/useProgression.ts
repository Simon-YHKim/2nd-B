// React hook exposing the signed-in user's quest progression: total XP, level,
// progress breakdown, and subscription tier. Reads users.total_xp +
// users.subscription_tier (added in migrations 0019 / 0020).

import { useCallback, useEffect, useState } from "react";

import { useAuth } from "../auth/AuthContext";
import { getSupabaseClient } from "../supabase/client";
import { levelForXp, levelProgress, type LevelProgress } from "./levels";
import type { SubscriptionTier } from "./entitlements";

export interface Progression {
  totalXp: number;
  level: number;
  progress: LevelProgress;
  tier: SubscriptionTier;
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useProgression(): Progression {
  const { userId } = useAuth();
  const [totalXp, setTotalXp] = useState(0);
  const [tier, setTier] = useState<SubscriptionTier>("free");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("users")
        .select("total_xp, subscription_tier")
        .eq("id", userId)
        .single();
      if (error) throw error;
      setTotalXp(data?.total_xp ?? 0);
      setTier(((data?.subscription_tier as SubscriptionTier) ?? "free"));
    } catch (e) {
      if (typeof console !== "undefined") console.warn("[progression] load failed", e);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    totalXp,
    level: levelForXp(totalXp),
    progress: levelProgress(totalXp),
    tier,
    loading,
    refresh,
  };
}
