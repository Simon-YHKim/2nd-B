// "공상 작업실" retired (worldview v-final): 공상 is no longer a place — it is
// SecondB's Divergent chat mode. This route now redirects so any lingering link
// (evidence shards, self-portrait goals, /core-brain) lands in Divergent mode
// instead of a dead screen. The imagine generation engine (src/lib/llm/imagine.ts)
// stays as dormant internal plumbing; the tab + graph node + wiki card are gone.

import { useTranslation } from "react-i18next";

import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { PossibleLensView } from "@/components/deep-space/DeepSpaceViews";

export default function Imagine() {
  const { i18n } = useTranslation();
  // No persisted aspiration-draft store exists yet (imagine.ts is dormant
  // plumbing; divergent-mode aspirations aren't saved), so pass an empty list:
  // PossibleLensView shows the honest empty state + rewrite/add CTAs rather than
  // fabricated "future self" cards. Wire real drafts here once they persist.
  return (
    <DeepSpaceScreen active="lens">
      <PossibleLensView drafts={[]} isKo={i18n.language === "ko"} />
    </DeepSpaceScreen>
  );
}
