// Rewarded-ad boundary, WEB/DEFAULT side of the platform split -- fail-closed
// stub. The real AdMob path lives in ./rewarded.native.ts; Metro resolves
// *.native.ts on ios/android and this file everywhere else (web, jest, any
// resolver without platform extensions).
//
// WHY A SPLIT (P0-1, web-deploy run 29645075631): Metro walks the module
// graph statically, so even a runtime-guarded lazy require() of the native
// ads SDK pulls react-native internals (codegenNativeComponent via BannerAd)
// into the web bundle and kills `expo export --platform web`. jest and tsc
// cannot see that class of breakage, which is how three deploys in a row
// failed on green CI.
//
// RULES for this file (enforced by __tests__/platform-split.test.ts and the
// web-export-smoke job in ci.yml):
//   - Never reference the native ads SDK here in any form -- no import, no
//     require, not even a typeof import. Shared types live in ./types.
//   - Keep the export surface identical to rewarded.native.ts.
//   - Fail closed: web has no rewarded ads, so nothing ever completes
//     (#1068 contract -- same behavior the lazy-require guard used to give
//     the web bundle at runtime, now guaranteed at bundle time).

import type { RewardedResult, ShowRewardedAdOptions } from "./types";

export type { RewardedResult, ShowRewardedAdOptions } from "./types";

/** Whether the rewarded-ad SDK is present in this build (web: never). */
export function isRewardedAdSdkAvailable(): boolean {
  return false;
}

/** Web/default: no rewarded ads exist, so a watch can never complete. */
export async function showRewardedAd(_opts?: ShowRewardedAdOptions): Promise<RewardedResult> {
  return { completed: false };
}
