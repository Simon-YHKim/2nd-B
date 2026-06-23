// Big Five (BFI-44) personality questionnaire — John, Donahue, & Kentle
// (1991). 44 items, 5-point Likert. Public domain. Replaces the older TIPI
// 10-item screener (Sprint 5) for better per-trait precision. Result is
// saved as a record so it surfaces in /persona and feeds Inference Engine.

import { useEffect, useState } from "react";
import { router } from "expo-router";

import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { LensView, type LensTraits } from "@/components/deep-space/DeepSpaceViews";
import { useAuth } from "@/lib/auth/AuthContext";
import { loadLatestBfi } from "@/lib/persona/build";
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  bfiMeanToPercent,
} from "@/lib/persona/bfi";

function BigFiveDeepSpace() {
  const { userId, loading } = useAuth();
  const [traits, setTraits] = useState<LensTraits | null>(null);
  const [hasError, setHasError] = useState(false);
  // Bumping reloadKey re-runs the BFI load (retry path from the error state).
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (loading) return;
    if (!userId) {
      setTraits(null);
      setHasError(false);
      return;
    }
    let cancelled = false;
    setHasError(false);
    loadLatestBfi(getSupabaseClient(), userId)
      .then((r) => {
        if (cancelled) return;
        // BFI trait means are 1-5 Likert; bfiMeanToPercent maps to 0-100 using
        // the same (v-1)/4 anchor buildPersona uses (1->0%, 3->50%, 5->100%).
        setTraits(
          r
            ? {
                openness: bfiMeanToPercent(r.openness),
                conscientiousness: bfiMeanToPercent(r.conscientiousness),
                extraversion: bfiMeanToPercent(r.extraversion),
                agreeableness: bfiMeanToPercent(r.agreeableness),
                neuroticism: bfiMeanToPercent(r.neuroticism),
              }
            : null,
        );
      })
      .catch(() => {
        // Distinguish a fetch failure (offline / query error) from "no result
        // yet": the former drives LensView's error+retry state, never dummy data.
        if (!cancelled) {
          setTraits(null);
          setHasError(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [userId, loading, reloadKey]);

  return (
    <DeepSpaceScreen active="lens">
      <LensView
        traits={traits}
        hasError={hasError}
        onStart={() => router.push("/interview")}
        onRetry={() => setReloadKey((k) => k + 1)}
      />
    </DeepSpaceScreen>
  );
}

export default function BigFive() {
  return <BigFiveDeepSpace />;
}
