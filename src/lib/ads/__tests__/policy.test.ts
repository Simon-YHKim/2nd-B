import {
  canShowAds,
  canShowRewardedAds,
  isAdAllowedRoute,
  isRewardedAdAllowedRoute,
  type AdEligibilityInput,
} from "../policy";

// adsConfigured() reads the env module; mock it so the policy rules are
// testable independent of build variables.
jest.mock("../../env", () => ({
  getEnv: jest.fn(() => ({
    EXPO_PUBLIC_ENABLE_ADS: true,
    EXPO_PUBLIC_ADSENSE_CLIENT: "ca-pub-test",
  })),
}));

import { getEnv } from "../../env";

function eligible(overrides: Partial<AdEligibilityInput> = {}): AdEligibilityInput {
  return {
    tier: "free",
    isMinor: false,
    adsConsent: true,
    route: "/records",
    ...overrides,
  };
}

describe("canShowAds", () => {
  test("free adult with consent on an allowed route: allowed", () => {
    expect(canShowAds(eligible())).toBe(true);
  });

  test("any paying tier never sees ads (ad removal is part of the purchase)", () => {
    expect(canShowAds(eligible({ tier: "soma" }))).toBe(false);
    expect(canShowAds(eligible({ tier: "cortex" }))).toBe(false);
    expect(canShowAds(eligible({ tier: "brain" }))).toBe(false);
  });

  test("UNKNOWN tier (still loading) fails closed — no ad flash for a subscriber while their tier resolves", () => {
    expect(canShowAds(eligible({ tier: null }))).toBe(false);
  });

  test("minors never see ads, and UNKNOWN minor status fails closed", () => {
    expect(canShowAds(eligible({ isMinor: true }))).toBe(false);
    expect(canShowAds(eligible({ isMinor: null }))).toBe(false);
  });

  test("no explicit ads consent (false, null, or never asked) = no ads", () => {
    expect(canShowAds(eligible({ adsConsent: false }))).toBe(false);
    expect(canShowAds(eligible({ adsConsent: null }))).toBe(false);
    expect(canShowAds(eligible({ adsConsent: undefined }))).toBe(false);
  });

  test("allow-list: every route except /records is ad-free by construction", () => {
    for (const route of ["/", "/secondb", "/capture", "/journal", "/privacy", "/sign-in", "/onboarding", "/record/abc", "/insights"]) {
      expect(canShowAds(eligible({ route }))).toBe(false);
    }
  });

  test("build-level kill switch: flag off or missing client = no ads anywhere", () => {
    (getEnv as jest.Mock).mockReturnValueOnce({
      EXPO_PUBLIC_ENABLE_ADS: false,
      EXPO_PUBLIC_ADSENSE_CLIENT: "ca-pub-test",
    });
    expect(canShowAds(eligible())).toBe(false);
    (getEnv as jest.Mock).mockReturnValueOnce({
      EXPO_PUBLIC_ENABLE_ADS: true,
      EXPO_PUBLIC_ADSENSE_CLIENT: undefined,
    });
    expect(canShowAds(eligible())).toBe(false);
  });
});

describe("isAdAllowedRoute", () => {
  test("prefix match covers nested records paths and nothing else", () => {
    expect(isAdAllowedRoute("/records")).toBe(true);
    expect(isAdAllowedRoute("/records/filter")).toBe(true);
    expect(isAdAllowedRoute("/record/abc")).toBe(false);
    expect(isAdAllowedRoute("/")).toBe(false);
  });
});

// Rewarded track: same fail-closed rules, separate allow-list. The two lists
// must never bleed into each other - /secondb and /plans are rewarded-only,
// /records is banner-only.
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

  test("rewarded allow-list excludes every other route, including the banner route", () => {
    for (const route of ["/records", "/records/filter", "/capture", "/journal", "/record/abc", "/privacy"]) {
      expect(canShowRewardedAds(rewardedEligible({ route }))).toBe(false);
    }
    // "/" admits ONLY the exact home route — no accidental global prefix.
    expect(canShowRewardedAds(rewardedEligible({ route: "/anything" }))).toBe(false);
  });

  test("build flag off = no rewarded entry; a missing AdSense client does NOT block (AdMob track)", () => {
    (getEnv as jest.Mock).mockReturnValueOnce({
      EXPO_PUBLIC_ENABLE_ADS: false,
      EXPO_PUBLIC_ADSENSE_CLIENT: "ca-pub-test",
    });
    expect(canShowRewardedAds(rewardedEligible())).toBe(false);
    (getEnv as jest.Mock).mockReturnValueOnce({
      EXPO_PUBLIC_ENABLE_ADS: true,
      EXPO_PUBLIC_ADSENSE_CLIENT: undefined,
    });
    expect(canShowRewardedAds(rewardedEligible())).toBe(true);
  });

  test("the banner gate still rejects rewarded routes (lists stay separate both ways)", () => {
    expect(canShowAds(rewardedEligible({ route: "/plans" }))).toBe(false);
    expect(canShowAds(rewardedEligible({ route: "/secondb" }))).toBe(false);
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
