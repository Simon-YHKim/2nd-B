// Shared types for the ads seam -- type-only module, no runtime code, so it
// is safe to import from every platform variant (web stub and .native impl
// alike) without dragging anything into the web bundle graph.
//
// Both rewarded.ts (web/default stub) and rewarded.native.ts (real AdMob
// path) re-export these, so call sites keep importing from "@/lib/ads/rewarded"
// and tsc always type-checks against one canonical shape.

export interface RewardedResult {
  /** true when the user watched to the rewarded threshold and earned the reward. */
  completed: boolean;
}

export interface ShowRewardedAdOptions {
  /** local placement hint: `${userId}` requests a reasoning ticket and
   *  `${userId}|chat` requests a chat ticket. The account id is authenticated
   *  by the ticket issuer and is never forwarded as provider data. */
  ssvCustomData?: string;
  /** Dev builds only: force the EEA debug geography so the published GDPR
   *  consent form can be exercised from anywhere. No-op in production. */
  debugUmpEea?: boolean;
}

export interface UmpConsentResult {
  /** true only when UMP explicitly says ad requests may proceed
   *  (form satisfied, or consent not required in this region). */
  canRequestAds: boolean;
}
