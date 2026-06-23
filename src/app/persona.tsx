// Legacy UI track removed (2026-06-23): the canonical deep-space surface is the
// only build. 보여지는 나 (self vs peer): no peer-review data source exists yet,
// so SeenLensView shows an honest empty state + the survey/share CTAs, never
// fabricated self/other bars (it derives locale internally).

import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { SeenLensView } from "@/components/deep-space/DeepSpaceViews";

export default function Persona() {
  return (
    <DeepSpaceScreen active="lens">
      <SeenLensView />
    </DeepSpaceScreen>
  );
}
