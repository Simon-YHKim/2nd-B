import { digitalConsentAge, requiresGuardianConsent } from "../consent-age";

describe("digital consent age matrix (task F)", () => {
  test("known jurisdictions", () => {
    expect(digitalConsentAge("KR")).toBe(14); // PIPA
    expect(digitalConsentAge("US")).toBe(13); // COPPA
    expect(digitalConsentAge("EU")).toBe(16); // GDPR Art.8 ceiling
  });

  test("unknown / unset falls back to the conservative DEFAULT (16)", () => {
    expect(digitalConsentAge()).toBe(16);
    expect(digitalConsentAge(null)).toBe(16);
    expect(digitalConsentAge("DEFAULT")).toBe(16);
  });

  test("requiresGuardianConsent compares against the jurisdiction floor", () => {
    // 14-year-old: ok in KR, but below the EU/DEFAULT 16 floor.
    expect(requiresGuardianConsent(14, "KR")).toBe(false);
    expect(requiresGuardianConsent(14, "EU")).toBe(true);
    expect(requiresGuardianConsent(14)).toBe(true); // DEFAULT 16
    // 13-year-old: needs guardian consent everywhere (KR floor is 14).
    expect(requiresGuardianConsent(13, "KR")).toBe(true);
    expect(requiresGuardianConsent(12, "US")).toBe(true); // below COPPA 13
    expect(requiresGuardianConsent(17, "EU")).toBe(false);
  });
});
