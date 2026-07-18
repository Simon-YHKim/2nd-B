// Rewarded-ad SEAM -- the single boundary the RewardedSheet calls to play a
// rewarded video. The AdMob SDK (react-native-google-mobile-ads) is NOT yet
// installed: shipping it needs the package + a platform ad-unit id, which the
// owner provisions.
//
// IMPORTANT -- this seam answers "did the watch COMPLETE", nothing else:
//   - It grants USAGE COUNTS only (the +credits happen in the caller). It must
//     never influence answer quality (entitlements SAME-QUALITY invariant).
//   - WHETHER an ad may be shown at all (adult + ads consent + non-sensitive
//     route + free tier) is the CALLER's gate, decided by canShowAds() in
//     src/lib/ads/policy.ts. This module assumes the caller already passed that
//     gate; it does not re-check eligibility.
//   - FAIL-CLOSED (2026-07-18): with no SDK there is no EARNED_REWARD event,
//     so there is no completed watch. The previous dev seam resolved
//     completed:true here, which paid out real usage counts with no ad
//     watched. Exercising the earn mechanic in dev/tests now goes through
//     jest mocks of this module (or the real SDK on a dev build), never
//     through a fabricated completion.
//
// No top-level native-only import lives here, so the module is import-safe on
// web and under jest.

import { Platform } from "react-native";

export interface RewardedResult {
  /** true when the user watched to the rewarded threshold and earned the reward. */
  completed: boolean;
}

/**
 * Whether a real rewarded-ad SDK is wired up in this build. Today it never is
 * (the SDK is not a dependency). When the owner adds AdMob, flip this to detect
 * the native module instead of returning false.
 *
 * This is NOT the eligibility gate -- see canShowAds() in ./policy.ts. A caller
 * MUST still confirm adult + ads consent + non-sensitive route before
 * presenting the sheet. This flag only reports SDK availability.
 */
export function isRewardedAdSdkAvailable(): boolean {
  // TODO(AdMob): return true once react-native-google-mobile-ads is installed
  // and an ad-unit id is configured for the active platform.
  // SSV note (0091): when wiring the real SDK, set serverSideVerificationOptions
  // customData to `${userId}` for a reasoning reward or `${userId}|chat` for a
  // chat +2 -- the rewarded-ssv edge function routes on that suffix.
  return false;
}

/**
 * Play a rewarded video and resolve whether it completed.
 *
 * Real path (TODO): construct an AdMob RewardedAd, load it, present it, and
 * resolve completed:true ONLY on the EARNED_REWARD event (false on
 * dismiss-before-reward or load error).
 *
 * SDK-absent path (web, jest, or package not installed): resolve
 * completed:false immediately. The caller already treats false as
 * dismiss-without-reward (the sheet closes and nothing is granted), which is
 * exactly the honest outcome when no ad could be shown.
 */
export async function showRewardedAd(): Promise<RewardedResult> {
  if (isRewardedAdSdkAvailable() && Platform.OS !== "web") {
    // TODO(AdMob): wire react-native-google-mobile-ads RewardedAd here.
    //   import { RewardedAd, RewardedAdEventType } from "react-native-google-mobile-ads";
    //   const ad = RewardedAd.createForAdRequest(adUnitId);
    //   resolve completed:true on RewardedAdEventType.EARNED_REWARD,
    //   completed:false on CLOSED-without-reward or error.
    // Falls through fail-closed until the SDK is present (never reached today).
  }

  // Fail-closed: no SDK, no EARNED_REWARD event, no reward.
  return { completed: false };
}
