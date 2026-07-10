import { Redirect } from "expo-router";
import type { ReactNode } from "react";

// Preview / clone / dev-aid screens live under src/app/, so expo-router
// auto-registers them as live routes reachable by direct URL / deep-link. In a
// production build (web GitHub Pages + native release, __DEV__ === false) they
// would surface mock/canon data - and internal TODO strings - as if it were the
// real product (the canon/mock-as-real anti-pattern). Gate them to dev only;
// production quietly redirects to home. (audit A1)
//
// __DEV__ is not typed in this project's tsconfig, so read it via globalThis,
// mirroring src/lib/env.ts. Redirect only when NOT explicitly dev, so an
// unknown runtime hides the preview rather than leaking it.
function isDevRuntime(): boolean {
  return (globalThis as { __DEV__?: boolean }).__DEV__ === true;
}

export function DevOnlyRoute({ children }: { children: ReactNode }) {
  if (!isDevRuntime()) return <Redirect href="/" />;
  return <>{children}</>;
}
