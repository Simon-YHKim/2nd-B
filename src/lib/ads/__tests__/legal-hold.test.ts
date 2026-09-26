import { adNetworkPublicationReady } from "../legal-readiness";
import { adsConfigured, canShowAds, canShowRewardedAds, rewardedAdsConfigured } from "../policy";

// Real rollout state: old ads=true must never authorize a Google request.
test("ad network stays unavailable until specific disclosure and consent ship", () => {
  const otherwiseEligible = {
    tier: "free" as const,
    isMinor: false,
    adsConsent: true,
  };

  expect(adNetworkPublicationReady()).toBe(false);
  expect(adsConfigured()).toBe(false);
  expect(rewardedAdsConfigured()).toBe(false);
  expect(canShowAds({ ...otherwiseEligible, route: "/records" })).toBe(false);
  expect(canShowRewardedAds({ ...otherwiseEligible, route: "/plans" })).toBe(false);
});
