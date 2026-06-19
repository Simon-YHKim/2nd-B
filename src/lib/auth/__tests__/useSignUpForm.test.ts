// Unit tests for the pure pieces of useSignUpForm: the OAuth provider→helper
// dispatch (including the new facebook / github providers) and the C10 consent
// ledger mapping the hook hands to submitSignUp via buildSignUpConsentArgs. The
// submitSignUp result→branch orchestration (entered / ageGate / breached /
// maybeExistingAccount / failed, plus the refresh ordering) is covered byte-for-
// byte in sign-up-flow.test.ts; this file pins the provider routing and that the
// adult/minor consent band the hook computes feeds the ledger correctly.

jest.mock("@/lib/supabase/auth", () => ({
  signInWithGoogle: jest.fn().mockResolvedValue(null),
  signInWithApple: jest.fn().mockResolvedValue(null),
  signInWithKakao: jest.fn().mockResolvedValue(null),
  signInWithFacebook: jest.fn().mockResolvedValue(null),
  signInWithGithub: jest.fn().mockResolvedValue(null),
  signUpWithEmail: jest.fn(),
  signInWithNaver: jest.fn(),
  isNaverEnabled: jest.fn().mockReturnValue(false),
  isProviderEnabled: jest.fn().mockReturnValue(true),
  ageInYears: jest.fn().mockReturnValue(20),
  MIN_SELF_CONSENT_AGE: 14,
  AgeGateError: class AgeGateError extends Error {},
  BreachedPasswordError: class BreachedPasswordError extends Error {},
  ExistingAccountLikelyError: class ExistingAccountLikelyError extends Error {},
}));

import {
  signInWithGoogle,
  signInWithApple,
  signInWithKakao,
  signInWithFacebook,
  signInWithGithub,
} from "@/lib/supabase/auth";
// Import from the RN-free helper module so the node jest env can load it
// (the hook modules statically import react-native / expo-router).
import {
  startOAuthProvider as startSignUpProvider,
  SUPABASE_OAUTH_PROVIDERS as SIGN_UP_PROVIDERS,
} from "../auth-providers";
import { buildSignUpConsentArgs, emptyConsentSelections } from "../consent-selections";

describe("startSignUpProvider — provider dispatch", () => {
  beforeEach(() => jest.clearAllMocks());

  test("google routes to signInWithGoogle", async () => {
    await startSignUpProvider("google");
    expect(signInWithGoogle).toHaveBeenCalledTimes(1);
  });

  test("apple routes to signInWithApple", async () => {
    await startSignUpProvider("apple");
    expect(signInWithApple).toHaveBeenCalledTimes(1);
  });

  test("kakao routes to signInWithKakao", async () => {
    await startSignUpProvider("kakao");
    expect(signInWithKakao).toHaveBeenCalledTimes(1);
  });

  test("facebook routes to signInWithFacebook (new provider)", async () => {
    await startSignUpProvider("facebook");
    expect(signInWithFacebook).toHaveBeenCalledTimes(1);
  });

  test("github routes to signInWithGithub (new provider)", async () => {
    await startSignUpProvider("github");
    expect(signInWithGithub).toHaveBeenCalledTimes(1);
  });

  test("the advertised provider set matches the dispatch", () => {
    expect(SIGN_UP_PROVIDERS).toEqual(["google", "apple", "kakao", "facebook", "github"]);
  });
});

// The hook constructs recordConsent from buildSignUpConsentArgs with the
// isMinorAge band it derives. These pin that the same mapping the hook uses
// stamps the correct C10 consent band for adult vs 14-17 minor sign-ups.
describe("C10 consent ledger mapping (the args the hook hands to recordConsent)", () => {
  test("adult sign-up → adult band, all required acks recorded", () => {
    const selections = { ...emptyConsentSelections(), service: true, llmProcessing: true, overseasTransfer: true, sensitiveData: true };
    const args = buildSignUpConsentArgs({ userId: "u-adult", isMinor: false, locale: "en", selections });
    expect(args).toMatchObject({
      userId: "u-adult",
      ageBand: "adult",
      minorTier: "adult",
      requiredAck: true,
      llmProcessingAck: true,
      overseasTransferAck: true,
      sensitiveDataAck: true,
    });
  });

  test("14-17 minor sign-up → minor_self band (the high-privacy tier)", () => {
    const selections = { ...emptyConsentSelections(), service: true, llmProcessing: true, overseasTransfer: true, sensitiveData: true };
    const args = buildSignUpConsentArgs({ userId: "u-teen", isMinor: true, locale: "ko", selections });
    expect(args.ageBand).toBe("minor_self");
    expect(args.minorTier).toBe("minor_self");
  });

  test("marketing opt-in flows into purposes + optionalConsents", () => {
    const selections = { ...emptyConsentSelections(), service: true, marketing: true };
    const args = buildSignUpConsentArgs({ userId: "u1", isMinor: false, locale: "en", selections });
    expect(args.purposes).toContain("marketing");
    expect(args.optionalConsents).toEqual({ marketing: true });
  });
});
