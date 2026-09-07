// 상상하기(Imagine) — restored to the reference design (Simon 2026-07-03: the design
// handoff is canonical for all terminology and design). The deep-space route
// renders the reference ImagineScreen 1:1: three divergent seeds (확장/반전/연결)
// with next-step candidates, feeding 담기 (prefill) or Divergent chat. The
// legacy track keeps redirecting into Divergent mode. PossibleLensView (미래의
// 나 lens) lives on in the core-brain lens track — it just no longer squats on
// this route. The generation engine (src/lib/llm/imagine.ts) stays dormant.

import { router } from "expo-router";
import { useTranslation } from "react-i18next";

import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { ImagineDivergentView } from "@/components/deep-space/DeepSpaceViews";

function ImagineDeepSpace() {
  const { t, i18n } = useTranslation("imagine");
  return (
    <DeepSpaceScreen
      active="lens"
      header="none"
      variant="windowed"
      title={t("title")}
      onBack={() => router.back()}
    >
      <ImagineDivergentView isKo={i18n.language === "ko"} />
    </DeepSpaceScreen>
  );
}

export default function Imagine() {
  return <ImagineDeepSpace />;
}
