// Route: /plans. The screen itself is DeepSpacePlansScreen.
//
// This file used to carry a second, full implementation of the same screen for
// the `EXPO_PUBLIC_UI=legacy` track and pick between them at render. Every
// delivery path pins deep-space (eas.json, android-release.yml, web-deploy.yml,
// ci.yml) with no variable able to override it, so that branch had been
// unreachable for months; it is gone. Pricing copy is still guarded against
// drift by paywall-annual-cadence.test.ts against the live screen.
import { DeepSpacePlansScreen } from "@/screens/deepspace/DeepSpaceDesignScreens";

export default function Plans() {
  return <DeepSpacePlansScreen />;
}
