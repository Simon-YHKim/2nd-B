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
import { Redirect, router } from "expo-router";

import { useAuth } from "@/lib/auth/AuthContext";
import { type DomainId } from "@/lib/persona/domain-stars";
import { type LadderLevel } from "@/lib/persona/brightness";
import { loadDomainLevels } from "@/lib/persona/load-domain-levels";
import { InlineLoader } from "@/components/ui/InlineLoader";
import { useOnboardingComplete } from "@/lib/onboarding/state";
import { useAutoTriggerTTFV } from "@/lib/onboarding/ttfv-gate";
import { useCoachmarksGate } from "@/lib/onboarding/coachmarks-gate";
import { DeepSpaceScreen } from "./DeepSpaceScreen";
import { ConstellationHome } from "./ConstellationHome";
import { HomeCoachmarks } from "./HomeCoachmarks";

export function DeepSpaceShell() {
  const { userId, hasProfile, loading } = useAuth();
  const onboardingComplete = useOnboardingComplete();
  // First-day activation: once onboarded + signed in, a first-launcher is sent
  // to the TTFV "첫 별 점등" once (the gate self-clears after the screen is seen).
  const autoTriggerTTFV = useAutoTriggerTTFV();

  // Live brightness for the home constellation: the no-LLM loadDomainLevels path
  // derives per-domain L1-L5 levels + the 북극성 aggregate from the user's real
  // records (grouped by their domain: tag), so the sky reflects how much of their
  // life they've mapped. Defaults to an honest empty sky (all L1) until it
  // resolves; failure leaves it empty (never blocks).
  const [domainLevels, setDomainLevels] = useState<Partial<Record<DomainId, LadderLevel>>>({});
  const [northStarBrightness, setNorthStarBrightness] = useState(0.2);

  // Home coachmarks (Screen-Spec 04): the 4-step spotlight shows once on the
  // first home visit; 다시 보지 않기/시작하기 persist the seen flag, and the
  // settings 코치마크 리셋 brings it back. Dismissal is local state so the
  // overlay drops immediately without waiting on storage.
  const coachmarksDue = useCoachmarksGate();
  const [coachmarksDismissed, setCoachmarksDismissed] = useState(false);
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
  // Login wall first (Simon 2026-07-15): a signed-out visitor hits /sign-in
  // before anything else; onboarding is now a post-login welcome. This reverses
  // the earlier "sell before signup" order so nothing renders pre-auth.
  if (!userId) return <Redirect href="/sign-in" />;
  if (hasProfile === false) return <Redirect href="/complete-profile" />;
  if (onboardingComplete === null) return <InlineLoader />;
  if (!onboardingComplete) return <Redirect href="/onboarding" />;
  // autoTriggerTTFV hydrates from AsyncStorage on native and is null until the
  // read resolves. Without this guard, null is falsy so the shell renders
  // ConstellationHome (and coachmarks) for one frame, then bounces to /ttfv once
  // storage resolves — a home flash on the very first run. Mirrors index.tsx.
  if (autoTriggerTTFV === null) return <InlineLoader />;
  if (autoTriggerTTFV) return <Redirect href="/ttfv" />;

  return (
    <DeepSpaceScreen active="home" header="none">
      <ConstellationHome
        // 여행하기 on a domain star opens that domain's LENS (/star/<id>, the
        // rev2 11-star per-domain screen: briefing + 담기/기록 + timeline), NOT
        // the flat wiki list. 뮤지엄 opens the AI museum; the 북극성 opens the
        // persona aggregate (/core-brain). Head-tap menu: 챗봇/비서 (sb-home).
        onStarTravel={(id) =>
          id === "museum" ? router.push("/museum") : router.push(`/star/${id}`)
        }
        onPolarisPress={() => router.push("/core-brain")}
        onChatPress={() => router.push("/secondb")}
        onOpsPress={() => router.push("/ops")}
        onBellPress={() => router.push("/inbox")}
        starLevels={domainLevels}
        northStarBrightness={northStarBrightness}
      />
      {coachmarksDue === true && !coachmarksDismissed ? (
        <HomeCoachmarks onDone={() => setCoachmarksDismissed(true)} />
      ) : null}
    </DeepSpaceScreen>
  );
}
