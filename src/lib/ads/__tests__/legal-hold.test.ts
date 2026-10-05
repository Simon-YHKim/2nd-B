import { adNetworkPublicationReady } from "../legal-readiness";
import { REWARDED_AD_ALLOWED_ROUTE_PREFIXES, canShowRewardedAds, rewardedAdsConfigured } from "../policy";

// Real rollout state: old ads=true must never authorize a Google request.
test("ad network stays unavailable until specific disclosure and consent ship", () => {
  const otherwiseEligible = {
    tier: "free" as const,
    isMinor: false,
    adsConsent: true,
  };

  expect(adNetworkPublicationReady()).toBe(false);
  expect(rewardedAdsConfigured()).toBe(false);
  // 2026-10-05: the web banner gate (adsConfigured/canShowAds on "/records") left
  // with AdSlot (Q-261004-16). The hold is now pinned on every rewarded entry
  // route instead, so it still covers each surface that can open an ad flow.
  expect(REWARDED_AD_ALLOWED_ROUTE_PREFIXES.length).toBeGreaterThan(0);
  for (const route of REWARDED_AD_ALLOWED_ROUTE_PREFIXES) {
    expect({ route, shown: canShowRewardedAds({ ...otherwiseEligible, route }) }).toEqual({ route, shown: false });
  }
});
