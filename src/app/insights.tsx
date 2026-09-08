// Route: /insights. The screen itself is DeepSpaceInsightsScreen.
//
// This file used to carry a second, full implementation of the same screen for
// the `EXPO_PUBLIC_UI=legacy` track and pick between them at render. Every
// delivery path pins deep-space and `ui-mode.ts` defaults to it, so that branch
// had been unreachable for months; it now lives in legacy/screens/insights.tsx, out of
// the build but still readable.
import { DeepSpaceInsightsScreen } from "@/screens/deepspace/DeepSpaceDesignScreens";

export default function Insights() {
  return <DeepSpaceInsightsScreen />;
}
