// /seen - 보여지는 나 (Seen lens, T5). The SOKA "observable self" view + the T5
// peer-review aggregate (t5_seen_aggregate, min-N 3), rendered over the shared
// deep-space sky. Reachable from the profile hub (analyze group).
//
// SeenLensView is self-contained: it loads its own data (loadSeenAggregate +
// loadLatestBfi + observableSelf) and wires its own CTAs (설문/공유 → /interview,
// /peer-invites), so this route only wraps it in the lens dock — the same shape
// as /big-five and /attachment. Legacy (non-deep-space) has no standalone skin,
// so it falls back to the persona synthesis.
import { Redirect, router } from "expo-router";
import { useTranslation } from "react-i18next";

import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { SeenLensView } from "@/components/deep-space/DeepSpaceViews";
import { isDeepSpaceUI } from "@/lib/ui-mode";

function SeenDeepSpace() {
  const { t } = useTranslation("home");
  return (
    <DeepSpaceScreen
      active="lens"
      variant="windowed"
      header="none"
      title={t("ds.seen.title")}
      onBack={() => router.back()}
    >
      <SeenLensView />
    </DeepSpaceScreen>
  );
}

export default function Seen() {
  if (isDeepSpaceUI()) return <SeenDeepSpace />;
  return <Redirect href="/persona" />;
}
