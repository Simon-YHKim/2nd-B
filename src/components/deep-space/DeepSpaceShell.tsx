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
import { Redirect, router } from "expo-router";

import { useAuth } from "@/lib/auth/AuthContext";
import { type DomainId } from "@/lib/persona/domain-stars";
import { type LadderLevel } from "@/lib/persona/brightness";
import { loadDomainLevels } from "@/lib/persona/load-domain-levels";
import { InlineLoader } from "@/components/ui/InlineLoader";
import { useOnboardingComplete } from "@/lib/onboarding/state";
import { DeepSpaceScreen } from "./DeepSpaceScreen";
import { ConstellationHome } from "./ConstellationHome";

export function DeepSpaceShell() {
  const { t, i18n } = useTranslation("home");
  const isKo = i18n.language === "ko";
  const { userId, hasProfile, loading } = useAuth();
  const onboardingComplete = useOnboardingComplete();

  // Live brightness for the home constellation: the no-LLM loadDomainLevels path
  // derives per-domain L1-L5 levels + the 북극성 aggregate from the user's real
  // records (grouped by their domain: tag), so the sky reflects how much of their
  // life they've mapped. Defaults to an honest empty sky (all L1) until it
  // resolves; failure leaves it empty (never blocks).
  const [domainLevels, setDomainLevels] = useState<Partial<Record<DomainId, LadderLevel>>>({});
  const [northStarBrightness, setNorthStarBrightness] = useState(0.2);
  useEffect(() => {
    // Wait for the auth session restore (`loading`) as well as the userId:
    // firing on userId alone raced the token attach at boot, so the Supabase
    // reads went out anon → RLS 401 (observed on recreation_items in the
    // authenticated capture pass) and the swallowed catch left the first paint
    // silently missing the relation/recreation brightness with no retry.
    // Depending on `loading` re-fires the load once the session is ready.
    if (loading || !userId) return;
    let alive = true;
    loadDomainLevels(userId)
      .then((b) => {
        if (!alive) return;
        setDomainLevels(b.domainLevels);
        setNorthStarBrightness(b.northStarBrightness);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [loading, userId]);

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
        // Each domain star opens that domain's records (the 리스트업 view) via
        // the existing /records ?tags= filter — domain:<slug> matches the tag
        // capture writes. The 북극성 opens the persona aggregate (/core-brain).
        onStarPress={(id: DomainId) => router.push({ pathname: "/records", params: { tags: `domain:${id}` } })}
        onPolarisPress={() => router.push("/core-brain")}
        starLevels={domainLevels}
        northStarBrightness={northStarBrightness}
      />
    </DeepSpaceScreen>
  );
}
