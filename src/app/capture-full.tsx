// /capture-full — the full multi-mode intake (메모/링크/클립/OCR/파일) reachable
// from the deep-space track (QA F1: the design-body capture only carried
// 한 줄/4W1H, so link scraping, OCR, and file indexing were unreachable on the
// rev2 default track). Reuses the proven legacy CaptureLegacy pipes as-is;
// on the deep-space build it just gains the shared shell + dock.
import { CaptureLegacy } from "./capture";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { isDeepSpaceUI } from "@/lib/ui-mode";

export default function CaptureFull() {
  if (isDeepSpaceUI()) {
    return (
      <DeepSpaceScreen active="capture">
        <CaptureLegacy />
      </DeepSpaceScreen>
    );
  }
  return <CaptureLegacy />;
}
