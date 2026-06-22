// Rewarded-ad SEAM — the single boundary the RewardedSheet calls to play a
// rewarded video. The AdMob SDK (react-native-google-mobile-ads) is NOT yet
// installed: shipping it needs the package + a platform ad-unit id, which the
// owner provisions. Until then this is a clearly-marked dev seam so the
// EARN MECHANIC (watch -> +REWARD_PER_WATCH reasoning counts) is fully
// testable without a real ad network.
//
// IMPORTANT — this seam answers "did the watch COMPLETE", nothing else:
//   - It grants USAGE COUNTS only (the +credits happen in the caller). It must
//     never influence answer quality (entitlements SAME-QUALITY invariant).
//   - WHETHER an ad may be shown at all (adult + ads consent + non-sensitive
//     route + free tier) is the CALLER's gate, decided by canShowAds() in
//     src/lib/ads/policy.ts. This module assumes the caller already passed that
//     gate; it does not re-check eligibility.
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
 * This is NOT the eligibility gate — see canShowAds() in ./policy.ts. A caller
 * MUST still confirm adult + ads consent + non-sensitive route before
 * presenting the sheet. This flag only reports SDK availability.
 */
export function isRewardedAdSdkAvailable(): boolean {
  // TODO(AdMob): return true once react-native-google-mobile-ads is installed
  // and an ad-unit id is configured for the active platform.
  return false;
}

/**
 * Play a rewarded video and resolve whether it completed.
 *
 * Real path (TODO): construct an AdMob RewardedAd, load it, present it, and
 * resolve { completed: true } only on the EARNED_REWARD event (false on
 * dismiss-before-reward or load error).
 *
 * Dev/seam path (web, jest, or SDK absent): resolve { completed: true } after a
 * short await so the watch-to-earn flow can be exercised end to end in dev.
 */
export async function showRewardedAd(): Promise<RewardedResult> {
  if (isRewardedAdSdkAvailable() && Platform.OS !== "web") {
    // TODO(AdMob): wire react-native-google-mobile-ads RewardedAd here.
    //   import { RewardedAd, RewardedAdEventType } from "react-native-google-mobile-ads";
    //   const ad = RewardedAd.createForAdRequest(adUnitId);
    //   return a promise that resolves { completed: true } on EARNED_REWARD,
    //   { completed: false } on CLOSED-without-reward or error.
    // Falls through to the seam until the SDK is present (never reached today).
  }

  // Seam: simulate a short watch so the earn mechanic is testable in dev.
  await new Promise<void>((resolve) => setTimeout(resolve, 600));
  return { completed: true };
}
