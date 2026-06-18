/**
 * O-23 — deep-space home (index `/`). The constellation hero inside the shared
 * DeepSpaceScreen chrome (status header + 5-tab dock). The dock maps to real
 * routes; the 7 stars + 북극성 map to their engine routes, so home navigation is
 * real (not demo view-switching). Star brightness IS the user's ladder level.
 *
 * Rendered only when EXPO_PUBLIC_UI=deep-space; the legacy gameboy track is
 * untouched. Keeps the post-auth gate (logged-out / incomplete users are routed
 * to the right entry instead of seeing home).
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Redirect, router, type Href } from "expo-router";

import { useAuth } from "@/lib/auth/AuthContext";
import { loadStarLevels } from "@/lib/persona/load-star-levels";
import { type StarId } from "@/lib/persona/stars";
import type { LadderLevel } from "@/lib/persona/brightness";
import { InlineLoader } from "@/components/ui/InlineLoader";
import { useOnboardingComplete } from "@/lib/onboarding/state";
import { DeepSpaceScreen } from "./DeepSpaceScreen";
import { ConstellationHome } from "./ConstellationHome";

// Each self-understanding star opens its real engine screen (flowmap mapping).
const STAR_ROUTE: Record<StarId, Href> = {
  now: "/big-five",
  recall: "/interview",
  seen: "/persona",
  rhythm: "/esm",
  relational: "/attachment",
  possible: "/imagine",
  values: "/audit",
};

export function DeepSpaceShell() {
  const { t, i18n } = useTranslation("home");
  const isKo = i18n.language === "ko";
  const { userId, hasProfile, loading } = useAuth();
  const onboardingComplete = useOnboardingComplete();
  const [starLevels, setStarLevels] = useState<Partial<Record<StarId, LadderLevel>>>({});

  useEffect(() => {
    if (!userId) return;
    let active = true;
    loadStarLevels(userId)
      .then(({ starLevels: levels }) => {
        if (active) setStarLevels(levels);
      })
      .catch(() => {
        // Offline / no data yet: leave stars dim rather than error.
      });
    return () => {
      active = false;
    };
  }, [userId]);

  if (loading) return <InlineLoader />;
  if (!userId) return <Redirect href="/sign-in" />;
  if (hasProfile === false) return <Redirect href="/complete-profile" />;
  if (onboardingComplete === null) return <InlineLoader />;
  if (!onboardingComplete) return <Redirect href="/onboarding" />;

  return (
    <DeepSpaceScreen active="home">
      <ConstellationHome
        starLevels={starLevels}
        isKo={isKo}
        hint={t("ds.home.hint")}
        polarisLabel={t("ds.home.polaris")}
        onStarPress={(id) => router.push(STAR_ROUTE[id])}
        onPolarisPress={() => router.push("/core-brain")}
      />
    </DeepSpaceScreen>
  );
}
