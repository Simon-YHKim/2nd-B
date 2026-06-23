// Legacy UI track removed (2026-06-23): the canonical deep-space surface is the
// only build. The capture design body renders inside the shared deep-space chrome.

import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { CaptureView } from "@/components/deep-space/DeepSpaceViews";

export default function Capture() {
  return (
    <DeepSpaceScreen active="capture">
      <CaptureView />
    </DeepSpaceScreen>
  );
}
