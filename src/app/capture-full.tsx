// /capture-full — the full multi-mode intake (메모/링크/클립/OCR/파일) inside the
// shared deep-space shell + dock (QA F1: the design-body capture only carried
// 한 줄/4W1H, so link scraping, OCR, and file indexing were unreachable on the
// rev2 default track). Reuses the proven CaptureLegacy pipes as-is — the name is
// history; this is the shipped intake.
import { CaptureLegacy } from "./capture";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";

export default function CaptureFull() {
  return (
    <DeepSpaceScreen active="capture">
      <CaptureLegacy embeddedInDock enableLifeAreaIntents />
    </DeepSpaceScreen>
  );
}
