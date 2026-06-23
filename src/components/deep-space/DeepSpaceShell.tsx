/**
 * Deep-space home (index `/`) — the constellation inside the shared DeepSpaceScreen
 * chrome (status header + 5-tab dock), a 1:1 clone of design/prototype.dc.html's
 * home. The dock maps to real routes; the 7 stars + 북극성 map to their engine
 * routes, so home navigation is real.
 *
 * Rendered only when EXPO_PUBLIC_UI=deep-space; the legacy track is untouched.
 * Keeps the post-auth gate.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Redirect, router, type Href } from "expo-router";

import { useAuth } from "@/lib/auth/AuthContext";
import { type StarId } from "@/lib/persona/stars";
import { type LadderLevel } from "@/lib/persona/brightness";
import { loadStarLevels } from "@/lib/persona/load-star-levels";
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

  // Live brightness for the home constellation: the no-LLM loadStarLevels path
  // derives per-star L1-L5 levels + the Soul Core aggregate from the user's real
  // data, so the sky reflects how much they've gathered. Defaults to an honest
  // empty sky (all L1) until it resolves; failure leaves it empty (never blocks).
  const [starLevels, setStarLevels] = useState<Partial<Record<StarId, LadderLevel>>>({});
  const [soulCoreBrightness, setSoulCoreBrightness] = useState(0.2);
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    loadStarLevels(userId)
      .then((b) => {
        if (!alive) return;
        setStarLevels(b.starLevels);
        setSoulCoreBrightness(b.soulCoreBrightness);
      })
      .catch(() => {});
    return () => {
      alive = false;
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
        isKo={isKo}
        hint={t("ds.home.hint")}
        polarisLabel={t("ds.home.polaris")}
        onStarPress={(id) => router.push(STAR_ROUTE[id])}
        onPolarisPress={() => router.push("/core-brain")}
        starLevels={starLevels}
        soulCoreBrightness={soulCoreBrightness}
      />
    </DeepSpaceScreen>
  );
}
