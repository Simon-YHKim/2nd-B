// Route: /sources. The screen itself is DeepSpaceSourcesScreen.
//
// New in 2026-09-13, not a retirement wrapper: nothing in the shipped app
// showed the `sources` rows that an import creates, so Phase 1 (요약 + 질문 넷)
// had no place to be called from. The screen's own header explains what was
// measured.
import { DeepSpaceSourcesScreen } from "@/screens/deepspace/dds-sources-screen";

export default function Sources() {
  return <DeepSpaceSourcesScreen />;
}
