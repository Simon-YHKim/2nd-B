// UMP consent seam, WEB/DEFAULT side of the platform split -- fail-closed
// stub. The real UMP flow lives in ./consent.native.ts; Metro resolves
// *.native.ts on ios/android and this file everywhere else (web, jest, any
// resolver without platform extensions).
//
// WHY A SPLIT (P0-1): Metro walks the module graph statically, so even a
// runtime-guarded lazy require() of the native ads SDK breaks
// `expo export --platform web` at bundle time (see ./rewarded.ts for the
// full story). Web has no UMP and no native ad SDK, so both gates answer
// with their fail-closed value -- exactly what the lazy-require guard used
// to return on web at runtime.
//
// RULES for this file (enforced by __tests__/platform-split.test.ts and the
// web-export-smoke job in ci.yml):
//   - Never reference the native ads SDK here in any form.
//   - Keep the export surface identical to consent.native.ts.

import type { UmpConsentResult } from "./types";

export type { UmpConsentResult } from "./types";

/** Web/default: no UMP form exists, so no consent signal -> no ad request. */
export async function ensureUmpConsent(_opts?: { debugGeographyEea?: boolean }): Promise<UmpConsentResult> {
  return { canRequestAds: false };
}

/** Web/default: there is no native ads SDK to initialize. */
export async function ensureAdsInitialized(): Promise<boolean> {
  return false;
}
