// Ad eligibility policy — the single source of truth for WHETHER an ad
// surface may render (Simon directive 2026-06-11: ads as the free-tier
// revenue complement to subscriptions).
//
// Design constraints, in priority order:
//   1. Paying subscribers (any tier above free) NEVER see ads — ad removal is
//      part of what a subscription buys, and the upsell loop runs the other
//      way ("remove ads with a subscription"). Unknown tier (still loading)
//      fails CLOSED: a subscriber must never see an ad flash while their
//      tier resolves.
//   2. Minors (14-17, C10 band) NEVER see ads at all. Non-personalized ads
//      would be the legal minimum (AdMob child-directed ad settings / KR
//      정보통신망법), but a self-knowledge app showing ads to minors burns
//      trust for negligible revenue — full suppression is the product call.
//   3. No ads without explicit ads consent (PIPA/GDPR: personalization needs
//      opt-in; we suppress entirely rather than serve non-personalized to
//      keep the consent story simple and honest).
//   4. ALLOW-list, not a deny-list: ads may render ONLY on the routes named
//      below. A new route is ad-free by default — a deny-list would make
//      every future screen ad-eligible until someone remembered to add it
//      (review finding). Crisis-adjacent (/secondb), reading one's own piece,
//      auth, consent, and writing surfaces are therefore excluded by
//      construction.
//   5. Ads are OFF by default at the build level (EXPO_PUBLIC_ENABLE_ADS) so
//      every live surface stays ad-free until the operator opts in.

import { getEnv } from "../env";
import type { SubscriptionTier } from "../progression/entitlements";

/** The ONLY routes where an ad slot may render (rule 4). Prefix match. */
export const AD_ALLOWED_ROUTE_PREFIXES: readonly string[] = ["/records"];

export interface AdEligibilityInput {
  /** Resolved subscription tier. null = still resolving — fail closed. */
  tier: SubscriptionTier | null;
  /** AuthContext.isMinor — null (unknown) is treated as minor (fail-closed). */
  isMinor: boolean | null;
  /** Explicit ads consent. null/undefined (never asked) = no ads. */
  adsConsent: boolean | null | undefined;
  /** Current route pathname ("/records"). */
  route: string;
}

export function isAdAllowedRoute(route: string): boolean {
  return AD_ALLOWED_ROUTE_PREFIXES.some((p) => route === p || route.startsWith(`${p}/`));
}

/** Build-level switch: both the flag AND a configured AdSense client are
 *  required on web. Native (AdMob) ships in the native build track. */
export function adsConfigured(): boolean {
  const env = getEnv();
  return env.EXPO_PUBLIC_ENABLE_ADS === true && !!env.EXPO_PUBLIC_ADSENSE_CLIENT;
}

export function canShowAds(input: AdEligibilityInput): boolean {
  if (!adsConfigured()) return false;
  if (input.tier !== "free") return false; // rule 1 (null/loading fails closed)
  if (input.isMinor !== false) return false; // rule 2 (null = fail closed)
  if (input.adsConsent !== true) return false; // rule 3
  if (!isAdAllowedRoute(input.route)) return false; // rule 4 (allow-list)
  return true;
}

// ---------------------------------------------------------------------------
// Rewarded track (watch-to-earn). Same five rules, SEPARATE allow-list
// (Simon 2026-07-18): rewarded is a user-INITIATED earn surface (/plans
// count top-up, /secondb chat +2), while the banner list above is passive
// display space - /secondb stays banner-free even though its reward entry
// lives there, and /records stays rewarded-free.

/** The ONLY routes where a rewarded-ad entry may open (prefix match). "/" is
 *  exact-match by construction (its startsWith arm would need "//"), so listing
 *  it admits ONLY the constellation home — where the reasoning limit sheet
 *  lives (spec F 계약 14: the ONE sheet owns the reward path from the home
 *  bubble and /reasoning entries). */
export const REWARDED_AD_ALLOWED_ROUTE_PREFIXES: readonly string[] = ["/plans", "/secondb", "/", "/reasoning"];

export function isRewardedAdAllowedRoute(route: string): boolean {
  return REWARDED_AD_ALLOWED_ROUTE_PREFIXES.some((p) => route === p || route.startsWith(`${p}/`));
}

/** Build-level switch for the rewarded track: the flag alone. Rewarded ships
 *  via the native AdMob SDK, so the web AdSense client is irrelevant here;
 *  SDK/ad-unit availability is rewarded.ts's own seam (fail-closed, #1068). */
export function rewardedAdsConfigured(): boolean {
  const env = getEnv();
  return env.EXPO_PUBLIC_ENABLE_ADS === true;
}

/** Rewarded-entry eligibility. Every branch fails closed (null tier, unknown
 *  minor status, unresolved consent all block), mirroring canShowAds. */
export function canShowRewardedAds(input: AdEligibilityInput): boolean {
  if (!rewardedAdsConfigured()) return false;
  if (input.tier !== "free") return false; // rule 1 (null/loading fails closed)
  if (input.isMinor !== false) return false; // rule 2 (null = fail closed)
  if (input.adsConsent !== true) return false; // rule 3
  if (!isRewardedAdAllowedRoute(input.route)) return false; // rule 4 (allow-list)
  return true;
}
