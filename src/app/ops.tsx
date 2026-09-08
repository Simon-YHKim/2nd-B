// Route: /ops. The screen itself is DeepSpaceOpsScreen.
//
// This file used to carry a second, full implementation of the same screen for
// the `EXPO_PUBLIC_UI=legacy` track and pick between them at render. Every
// delivery path pins deep-space and `ui-mode.ts` defaults to it, so that branch
// had been unreachable for months; it now lives in legacy/screens/ops.tsx, out of
// the build but still readable.
import { DeepSpaceOpsScreen } from "@/screens/deepspace/dds-ops-screen";

export default function Ops() {
  return <DeepSpaceOpsScreen />;
}
