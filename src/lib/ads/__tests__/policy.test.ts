import { canShowAds, isAdAllowedRoute, type AdEligibilityInput } from "../policy";

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
