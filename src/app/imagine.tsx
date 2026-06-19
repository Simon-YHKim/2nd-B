// "공상 작업실" retired (worldview v-final): 공상 is no longer a place — it is
// SecondB's Divergent chat mode. This route now redirects so any lingering link
// (evidence shards, self-portrait goals, /core-brain) lands in Divergent mode
// instead of a dead screen. The imagine generation engine (src/lib/llm/imagine.ts)
// stays as dormant internal plumbing; the tab + graph node + wiki card are gone.

import { Redirect } from "expo-router";

import { isDeepSpaceUI } from "@/lib/ui-mode";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { PossibleLensView } from "@/components/deep-space/DeepSpaceViews";

function ImagineLegacy() {
  return <Redirect href={{ pathname: "/secondb", params: { mode: "divergent" } }} />;
}

export default function Imagine() {
  if (isDeepSpaceUI()) {
    return (
      <DeepSpaceScreen active="lens">
        <PossibleLensView />
      </DeepSpaceScreen>
    );
  }
  return <ImagineLegacy />;
}
