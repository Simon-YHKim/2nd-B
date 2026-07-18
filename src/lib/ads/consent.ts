// UMP (User Messaging Platform) seam -- Google's regulatory consent form
// (EU GDPR / US state messages, both published in the AdMob console), DISTINCT
// from the app's own ads consent: policy.ts (canShowAds/canShowRewardedAds)
// decides whether we may enter an ad flow AT ALL; UMP decides whether Google
// may serve ads to this user in regulated regions. Both gates must pass, in
// that order.
//
// Lazy by design (D1, docs/admob-ump-plan_260718.html): call this right
// before the FIRST ad request of a session, never at app start -- users who
// never touch an ad surface never meet the form (information-density rule).
//
// Import-safe on web and under jest: the native SDK is required lazily inside
// the functions (same discipline as rewarded.ts), so importing this module
// never pulls native code at module scope.

import { Platform } from "react-native";

export interface UmpConsentResult {
  /** true only when UMP explicitly says ad requests may proceed
   *  (form satisfied, or consent not required in this region). */
  canRequestAds: boolean;
}

type GoogleMobileAdsModule = typeof import("react-native-google-mobile-ads");

function loadSdk(): GoogleMobileAdsModule | null {
  if (Platform.OS === "web") return null;
  try {
    return require("react-native-google-mobile-ads") as GoogleMobileAdsModule;
  } catch {
    return null; // SDK absent (jest, Expo Go, web bundles): fail closed
  }
}

/**
 * Run the UMP consent flow: refresh consent info, then show Google's consent
 * form only when the region requires one that has not been answered yet.
 *
 * Every failure path resolves { canRequestAds: false } -- no consent signal,
 * no ad request (mirrors the rewarded seam's fail-closed contract, #1068).
 *
 * opts.debugGeographyEea (dev builds only) forces the EEA geography so the
 * published GDPR form can be exercised from anywhere; it is a no-op in
 * production bundles.
 */
export async function ensureUmpConsent(opts?: { debugGeographyEea?: boolean }): Promise<UmpConsentResult> {
  const sdk = loadSdk();
  if (!sdk?.AdsConsent) return { canRequestAds: false };
  try {
    const { AdsConsent, AdsConsentDebugGeography } = sdk;
    await AdsConsent.requestInfoUpdate(
      __DEV__ && opts?.debugGeographyEea
        ? { debugGeography: AdsConsentDebugGeography.EEA }
        : {},
    );
    const info = await AdsConsent.loadAndShowConsentFormIfRequired();
    return { canRequestAds: info.canRequestAds === true };
  } catch (e) {
    if (typeof console !== "undefined") {
      console.warn("[ads] UMP consent flow failed", (e as Error).message);
    }
    return { canRequestAds: false };
  }
}

let initialized = false;

/**
 * Initialize the Google Mobile Ads SDK once per process. Call AFTER
 * ensureUmpConsent() resolves canRequestAds -- Google's recommended order,
 * so no ad infrastructure spins up for users without a consent signal.
 * delayAppMeasurementInit (app.json) keeps app start free of ad-SDK work.
 */
export async function ensureAdsInitialized(): Promise<boolean> {
  const sdk = loadSdk();
  if (!sdk?.default) return false;
  if (initialized) return true;
  try {
    await sdk.default().initialize();
    initialized = true;
    return true;
  } catch (e) {
    if (typeof console !== "undefined") {
      console.warn("[ads] SDK initialize failed", (e as Error).message);
    }
    return false;
  }
}
