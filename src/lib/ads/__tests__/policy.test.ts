import {
  canShowRewardedAds,
  isRewardedAdAllowedRoute,
  type AdEligibilityInput,
} from "../policy";

// rewardedAdsConfigured() reads the env module; mock it so the policy rules
// are testable independent of build variables.
jest.mock("../../env", () => ({
  getEnv: jest.fn(() => ({
    EXPO_PUBLIC_ENABLE_ADS: true,
  })),
}));

// Existing eligibility rules are tested under a hypothetical completed legal
// rollout. The real publication gate is pinned closed in legal-hold.test.ts.
jest.mock("../legal-readiness", () => ({
  adNetworkPublicationReady: jest.fn(() => true),
}));

import { getEnv } from "../../env";
import { adNetworkPublicationReady } from "../legal-readiness";

// Rewarded track: every rule fails closed, and only the listed routes admit an
// entry. The web AdSense banner half (canShowAds and its "/records" list) left
// on 2026-10-05 (Q-261004-16, docs/ADSENSE-WEB-RETIREMENT.md).
describe("canShowRewardedAds", () => {
  function rewardedEligible(overrides: Partial<AdEligibilityInput> = {}): AdEligibilityInput {
    return {
      tier: "free",
      isMinor: false,
      adsConsent: true,
      route: "/plans",
      ...overrides,
    };
  }

  test("legal hold blocks a legacy ads=true preference even when build flags are on", () => {
    (adNetworkPublicationReady as jest.Mock).mockReturnValueOnce(false);
    expect(canShowRewardedAds(rewardedEligible())).toBe(false);
  });

  test("free adult with consent on an allowed route: /plans, /secondb, home, /reasoning", () => {
    expect(canShowRewardedAds(rewardedEligible())).toBe(true);
    expect(canShowRewardedAds(rewardedEligible({ route: "/secondb" }))).toBe(true);
    // The reasoning limit sheet's surfaces (spec F 계약 14): the home
    // constellation bubble ("/", exact-match by construction) and /reasoning.
    expect(canShowRewardedAds(rewardedEligible({ route: "/" }))).toBe(true);
    expect(canShowRewardedAds(rewardedEligible({ route: "/reasoning" }))).toBe(true);
  });

  test("paying tiers and UNKNOWN (loading) tier fail closed", () => {
    expect(canShowRewardedAds(rewardedEligible({ tier: "soma" }))).toBe(false);
    expect(canShowRewardedAds(rewardedEligible({ tier: "cortex" }))).toBe(false);
    expect(canShowRewardedAds(rewardedEligible({ tier: "brain" }))).toBe(false);
    expect(canShowRewardedAds(rewardedEligible({ tier: null }))).toBe(false);
  });

  test("minors and UNRESOLVED minor status fail closed (no null pass-through)", () => {
    expect(canShowRewardedAds(rewardedEligible({ isMinor: true }))).toBe(false);
    expect(canShowRewardedAds(rewardedEligible({ isMinor: null }))).toBe(false);
  });

  test("no explicit ads consent (false, null, undefined) = no rewarded entry", () => {
    expect(canShowRewardedAds(rewardedEligible({ adsConsent: false }))).toBe(false);
    expect(canShowRewardedAds(rewardedEligible({ adsConsent: null }))).toBe(false);
    expect(canShowRewardedAds(rewardedEligible({ adsConsent: undefined }))).toBe(false);
  });

  test("rewarded allow-list excludes every other route, including the retired banner route", () => {
    for (const route of ["/records", "/records/filter", "/capture", "/journal", "/record/abc", "/privacy"]) {
      expect(canShowRewardedAds(rewardedEligible({ route }))).toBe(false);
    }
    // "/" admits ONLY the exact home route — no accidental global prefix.
    expect(canShowRewardedAds(rewardedEligible({ route: "/anything" }))).toBe(false);
  });

  test("build flag off = no rewarded entry; the flag alone decides (AdMob track)", () => {
    (getEnv as jest.Mock).mockReturnValueOnce({ EXPO_PUBLIC_ENABLE_ADS: false });
    expect(canShowRewardedAds(rewardedEligible())).toBe(false);
    (getEnv as jest.Mock).mockReturnValueOnce({ EXPO_PUBLIC_ENABLE_ADS: true });
    expect(canShowRewardedAds(rewardedEligible())).toBe(true);
  });
});

describe("isRewardedAdAllowedRoute", () => {
  test("prefix match covers the listed surfaces and nothing else", () => {
    expect(isRewardedAdAllowedRoute("/plans")).toBe(true);
    expect(isRewardedAdAllowedRoute("/secondb")).toBe(true);
    expect(isRewardedAdAllowedRoute("/secondb/session")).toBe(true);
    // Reasoning limit sheet surfaces: home is EXACT-match only ("/"'s
    // startsWith arm would need "//"), /reasoning is a normal prefix.
    expect(isRewardedAdAllowedRoute("/")).toBe(true);
    expect(isRewardedAdAllowedRoute("/reasoning")).toBe(true);
    expect(isRewardedAdAllowedRoute("/records")).toBe(false);
    expect(isRewardedAdAllowedRoute("/anything")).toBe(false);
  });
});
