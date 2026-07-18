// Rewarded-ad boundary -- the single seam the RewardedSheet calls to play a
// rewarded video. Real AdMob path since session Y (docs/admob-ump-plan_260718.html);
// the SDK landed in session X with the UMP seam (./consent).
//
// IMPORTANT -- this module answers "did the watch COMPLETE", nothing else:
//   - It grants USAGE COUNTS only (the +credits happen in the caller). It must
//     never influence answer quality (entitlements SAME-QUALITY invariant).
//   - WHETHER an ad may be shown at all (adult + ads consent + free tier +
//     allowed route) is the CALLER's gate: canShowRewardedAds() in ./policy.ts
//     (#1076). This module assumes that gate already passed and adds the two
//     Google-side gates in order: UMP regulatory consent, then SDK init.
//   - FAIL-CLOSED everywhere: no consent signal, no SDK, no EARNED_REWARD
//     event, load timeout, error -> { completed: false }. The only path to
//     completed:true is Google's EARNED_REWARD event (#1068 contract).
//
// No top-level native import lives here, so the module is import-safe on web
// and under jest (same discipline as ./consent).

import { Platform } from "react-native";

import { ensureAdsInitialized, ensureUmpConsent } from "./consent";

export interface RewardedResult {
  /** true when the user watched to the rewarded threshold and earned the reward. */
  completed: boolean;
}

export interface ShowRewardedAdOptions {
  /** SSV customData (0091 contract): `${userId}` credits a reasoning reward,
   *  `${userId}|chat` credits a chat +2 -- the rewarded-ssv edge function
   *  routes on that suffix. Omitted = client-grant path only. */
  ssvCustomData?: string;
  /** Dev builds only: force the EEA debug geography so the published GDPR
   *  consent form can be exercised from anywhere. No-op in production. */
  debugUmpEea?: boolean;
}

type GoogleMobileAdsModule = typeof import("react-native-google-mobile-ads");

function loadSdk(): GoogleMobileAdsModule | null {
  if (Platform.OS === "web") return null;
  try {
    return require("react-native-google-mobile-ads") as GoogleMobileAdsModule;
  } catch {
    return null;
  }
}

/** Whether the rewarded-ad SDK is present in this build (web/Expo Go: no). */
export function isRewardedAdSdkAvailable(): boolean {
  return loadSdk() !== null;
}

/** How long a load may take before we fail closed instead of hanging the sheet. */
const LOAD_TIMEOUT_MS = 20_000;

/**
 * Play a rewarded video and resolve whether it completed.
 *
 * Order of gates (each fails closed):
 *   1. SDK present (web / Expo Go / jest resolve false immediately)
 *   2. UMP regulatory consent (./consent) -- lazy, right before the request
 *   3. SDK initialize
 *   4. PRODUCTION GUARD: no real ad unit exists yet (creating live units is
 *      forbidden until launch GO), so non-dev builds fail closed even if
 *      EXPO_PUBLIC_ENABLE_ADS were flipped. Dev builds use Google's official
 *      TEST unit. Replacing this guard with the real unit id is the launch
 *      change, nowhere else.
 *   5. resolve completed:true ONLY on RewardedAdEventType.EARNED_REWARD;
 *      dismiss-before-reward, load error, or timeout resolve false.
 */
export async function showRewardedAd(opts?: ShowRewardedAdOptions): Promise<RewardedResult> {
  const sdk = loadSdk();
  if (!sdk) return { completed: false };

  const consent = await ensureUmpConsent(opts?.debugUmpEea ? { debugGeographyEea: true } : undefined);
  if (!consent.canRequestAds) return { completed: false };
  if (!(await ensureAdsInitialized())) return { completed: false };

  if (!__DEV__) {
    // No live ad unit has been created (owner instruction). Fail closed in
    // production until the real unit id replaces this guard at launch.
    return { completed: false };
  }
  const unitId = sdk.TestIds.REWARDED;

  const request = opts?.ssvCustomData
    ? { serverSideVerificationOptions: { customData: opts.ssvCustomData } }
    : undefined;
  const ad = sdk.RewardedAd.createForAdRequest(unitId, request);

  return await new Promise<RewardedResult>((resolve) => {
    let earned = false;
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const subs: Array<() => void> = [];
    const settle = (completed: boolean) => {
      if (settled) return;
      settled = true;
      if (timeoutId !== null) clearTimeout(timeoutId);
      for (const unsub of subs) unsub();
      resolve({ completed });
    };

    subs.push(
      ad.addAdEventListener(sdk.RewardedAdEventType.LOADED, () => {
        if (timeoutId !== null) clearTimeout(timeoutId);
        timeoutId = null;
        ad.show();
      }),
      ad.addAdEventListener(sdk.RewardedAdEventType.EARNED_REWARD, () => {
        earned = true;
      }),
      // CLOSED fires after EARNED_REWARD on a full watch; on early dismiss
      // earned is still false -- the honest no-reward outcome.
      ad.addAdEventListener(sdk.AdEventType.CLOSED, () => settle(earned)),
      ad.addAdEventListener(sdk.AdEventType.ERROR, () => settle(earned)),
    );

    timeoutId = setTimeout(() => settle(false), LOAD_TIMEOUT_MS);
    ad.load();
  });
}
