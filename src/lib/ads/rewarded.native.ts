// Rewarded-ad boundary, NATIVE side of the platform split -- the single seam
// the RewardedSheet calls to play a rewarded video. Real AdMob path since
// session Y (docs/admob-ump-plan_260718.html); the SDK landed in session X
// with the UMP seam (./consent -> consent.native.ts on this platform).
//
// PLATFORM SPLIT (P0-1, web-deploy run 29645075631): Metro resolves module
// graphs statically, so even a lazily-guarded require() of the native SDK
// drags react-native internals (codegenNativeComponent via BannerAd) into the
// web bundle and kills `expo export --platform web` at build time. The SDK
// may therefore be referenced ONLY from *.native.ts files; web and default
// resolution get the fail-closed stub in ./rewarded.ts. Guarded by
// __tests__/platform-split.test.ts plus the web-export-smoke job in ci.yml.
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

import { Platform } from "react-native";

import { ensureAdsInitialized, ensureUmpConsent } from "./consent";
import type { RewardedResult, ShowRewardedAdOptions } from "./types";

export type { RewardedResult, ShowRewardedAdOptions } from "./types";

type GoogleMobileAdsModule = typeof import("react-native-google-mobile-ads");

function loadSdk(): GoogleMobileAdsModule | null {
  if (Platform.OS === "web") return null;
  try {
    return require("react-native-google-mobile-ads") as GoogleMobileAdsModule;
  } catch {
    return null;
  }
}

/** Whether the rewarded-ad SDK is present in this build (Expo Go/jest: no). */
export function isRewardedAdSdkAvailable(): boolean {
  return loadSdk() !== null;
}

// Single source for "does a live ad unit exist". The launch change is to set
// this true alongside the real unit id (cowork delivers it after the AdMob
// store link) -- both the capability answer and the in-flow guard read it.
const HAS_LIVE_AD_UNIT = false;

/**
 * Capability gate (Simon B-decision, 2026-07-21): can THIS build actually
 * complete a rewarded watch? Dev builds can (Google TEST unit); production
 * builds cannot until a real ad unit lands. Surfaces must consult this
 * BEFORE rendering any watch CTA -- rendering a CTA that walks the user
 * through consent and then silently fails is the false-UI class this gate
 * exists to remove. Distinct from policy.canShowRewardedAds (per-user legal
 * eligibility): both must pass.
 */
export function canCompleteRewardedWatch(): boolean {
  if (loadSdk() === null) return false;
  return __DEV__ || HAS_LIVE_AD_UNIT;
}

/** How long a load may take before we fail closed instead of hanging the sheet. */
const LOAD_TIMEOUT_MS = 20_000;

/**
 * Play a rewarded video and resolve whether it completed.
 *
 * Order of gates (each fails closed):
 *   1. SDK present (Expo Go / jest resolve false immediately)
 *   2. CAPABILITY (canCompleteRewardedWatch): no real ad unit exists yet, so
 *      non-dev builds fail closed BEFORE any consent is collected (P0-2:
 *      never walk a user through the UMP form on a path that cannot fulfil
 *      its purpose). Dev builds use Google's official TEST unit. The launch
 *      change = HAS_LIVE_AD_UNIT true + the real unit id, nowhere else.
 *   3. UMP regulatory consent (./consent) -- lazy, right before the request
 *   4. SDK initialize
 *   5. resolve completed:true ONLY on RewardedAdEventType.EARNED_REWARD;
 *      dismiss-before-reward, load error, or timeout resolve false.
 */
export async function showRewardedAd(opts?: ShowRewardedAdOptions): Promise<RewardedResult> {
  const sdk = loadSdk();
  if (!sdk) return { completed: false };

  // Capability BEFORE consent (P0-2, Simon B-decision): a build that cannot
  // complete a watch must not walk the user through the UMP form first --
  // collecting consent on a path that cannot fulfil its purpose is a false
  // UI and a privacy problem. Production stays fail-closed here until the
  // real unit id lands (HAS_LIVE_AD_UNIT); dev uses Google's TEST unit.
  if (!canCompleteRewardedWatch()) return { completed: false };

  const consent = await ensureUmpConsent(opts?.debugUmpEea ? { debugGeographyEea: true } : undefined);
  if (!consent.canRequestAds) return { completed: false };
  if (!(await ensureAdsInitialized())) return { completed: false };

  // Launch change: flip HAS_LIVE_AD_UNIT and replace this with the real id.
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
