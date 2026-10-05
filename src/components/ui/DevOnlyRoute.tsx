import type { ReactNode } from "react";

import { isDevSurfaceEnabled } from "@/lib/dev/gate";
import { RedirectHome } from "@/lib/nav/go-home";

// Preview / clone / dev-aid screens live under src/app/, so expo-router
// auto-registers them as live routes reachable by direct URL / deep-link. In a
// production build (web GitHub Pages + native release, __DEV__ === false) they
// would surface mock/canon data - and internal TODO strings - as if it were the
// real product (the canon/mock-as-real anti-pattern). Gate them to dev only;
// production quietly redirects to home. (audit A1)
//
// 2026-08-19: the gate moved to src/lib/dev/gate.ts so the Settings entry point
// can ask the same question. It also now opens in a QA web build
// (EXPO_PUBLIC_ALLOW_DEV_TIER), because __DEV__ alone is false on the deployed
// GitHub Pages export - which is the only place Simon can actually look at a
// screen on a phone. See that file for why no new flag was added.
//
// 2026-10-04 (QA D-01): the redirect pops back to the home already under this
// screen instead of stacking a new one (RedirectHome = router.dismissTo("/")).
// The plain expo-router Redirect replaced this route with a second home, and a
// run of dev deep links stacked homes until Android ran out of Java heap.
export function DevOnlyRoute({ children }: { children: ReactNode }) {
  if (!isDevSurfaceEnabled()) return <RedirectHome />;
  return <>{children}</>;
}
