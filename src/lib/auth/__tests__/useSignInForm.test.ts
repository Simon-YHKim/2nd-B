// Unit tests for the pure pieces of useSignInForm that carry the load-bearing
// behavior: the OAuth provider→helper dispatch (including the new facebook /
// github providers) and the "provider not enabled" error classification that
// drives the hide-the-dead-button behavior. The stateful React glue is thin and
// exercised end-to-end in app/(auth)/sign-in.tsx; the consent/sign-up
// orchestration is covered by sign-up-flow.test.ts.

jest.mock("@/lib/supabase/auth", () => ({
  signInWithGoogle: jest.fn().mockResolvedValue(null),
  signInWithApple: jest.fn().mockResolvedValue(null),
  signInWithKakao: jest.fn().mockResolvedValue(null),
  signInWithFacebook: jest.fn().mockResolvedValue(null),
  signInWithGithub: jest.fn().mockResolvedValue(null),
  // Unused-by-these-tests members the module imports at load time.
  signInWithEmail: jest.fn(),
  signInWithNaver: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
  isNaverEnabled: jest.fn().mockReturnValue(false),
  isProviderEnabled: jest.fn().mockReturnValue(true),
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
  startOAuthProvider as startSignInProvider,
  isProviderNotEnabledError,
  SUPABASE_OAUTH_PROVIDERS as SIGN_IN_PROVIDERS,
} from "../auth-providers";

describe("startSignInProvider — provider dispatch", () => {
  beforeEach(() => jest.clearAllMocks());

  test("google routes to signInWithGoogle", async () => {
    await startSignInProvider("google");
    expect(signInWithGoogle).toHaveBeenCalledTimes(1);
    expect(signInWithApple).not.toHaveBeenCalled();
  });

  test("apple routes to signInWithApple", async () => {
    await startSignInProvider("apple");
    expect(signInWithApple).toHaveBeenCalledTimes(1);
  });

  test("kakao routes to signInWithKakao", async () => {
    await startSignInProvider("kakao");
    expect(signInWithKakao).toHaveBeenCalledTimes(1);
  });

  test("facebook routes to signInWithFacebook (new provider)", async () => {
    await startSignInProvider("facebook");
    expect(signInWithFacebook).toHaveBeenCalledTimes(1);
  });

  test("github routes to signInWithGithub (new provider)", async () => {
    await startSignInProvider("github");
    expect(signInWithGithub).toHaveBeenCalledTimes(1);
  });

  test("every advertised provider has a distinct start helper", async () => {
    expect(SIGN_IN_PROVIDERS).toEqual(["google", "apple", "kakao", "facebook", "github"]);
    for (const p of SIGN_IN_PROVIDERS) {
      await startSignInProvider(p);
    }
    expect(signInWithGoogle).toHaveBeenCalledTimes(1);
    expect(signInWithApple).toHaveBeenCalledTimes(1);
    expect(signInWithKakao).toHaveBeenCalledTimes(1);
    expect(signInWithFacebook).toHaveBeenCalledTimes(1);
    expect(signInWithGithub).toHaveBeenCalledTimes(1);
  });
});

describe("isProviderNotEnabledError — hide-the-dead-button classification", () => {
  test.each([
    "Provider is not enabled",
    "Unsupported provider: facebook",
    "validation_failed",
    "AuthApiError: provider GITHUB is NOT ENABLED",
  ])("treats %p as a not-configured failure", (msg) => {
    expect(isProviderNotEnabledError(msg)).toBe(true);
  });

  test.each(["Network request failed", "invalid login credentials", ""])(
    "does NOT hide on the unrelated failure %p",
    (msg) => {
      expect(isProviderNotEnabledError(msg)).toBe(false);
    },
  );
});
