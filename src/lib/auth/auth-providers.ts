// Pure auth helpers shared by the sign-in / sign-up hooks. Deliberately free of
// react-native / expo-router imports so it stays unit-testable in the node jest
// env (the hooks that consume it pull in RN state + routing). Only depends on
// the supabase auth surface (which uses lazy require() for native modules).

import {
  signInWithApple,
  signInWithFacebook,
  signInWithGithub,
  signInWithGoogle,
  signInWithKakao,
  type OAuthProvider,
} from "@/lib/supabase/auth";
import { shouldTryNativeSocialSignIn, tryNativeSocialSignIn } from "@/lib/auth/native-social";

// The Supabase-native providers, in display order. Naver is custom (separate
// handler) and is appended by the presentation layer via isNaverEnabled().
export const SUPABASE_OAUTH_PROVIDERS: readonly OAuthProvider[] = [
  "google",
  "apple",
  "kakao",
  "facebook",
  "github",
] as const;

export const OAUTH_PROVIDER_LABEL: Record<OAuthProvider, string> = {
  google: "Google",
  apple: "Apple",
  kakao: "Kakao",
  facebook: "Facebook",
  github: "GitHub",
};

// Dispatch a single OAuth provider to its start helper. On a real native runtime with
// the native-SDK flag on (google/kakao), try the on-device SDK first; any native failure
// falls back to the browser-brokered helper so a misconfigured native client never blocks
// a login that already works on web. Web/jest skip straight to the browser switch, so the
// provider→helper mapping stays unit-testable without the SDKs.
export function startOAuthProvider(provider: OAuthProvider): Promise<unknown> {
  if (shouldTryNativeSocialSignIn(provider)) {
    return startOAuthProviderNative(provider);
  }
  return startOAuthProviderBrowser(provider);
}

async function startOAuthProviderNative(provider: OAuthProvider): Promise<unknown> {
  try {
    if (await tryNativeSocialSignIn(provider)) return undefined;
  } catch (e) {
    if (typeof console !== "undefined") {
      console.warn(`[auth] native ${provider} sign-in failed; falling back to browser`, (e as Error).message);
    }
  }
  return startOAuthProviderBrowser(provider);
}

function startOAuthProviderBrowser(provider: OAuthProvider): Promise<unknown> {
  switch (provider) {
    case "apple":
      return signInWithApple();
    case "kakao":
      return signInWithKakao();
    case "facebook":
      return signInWithFacebook();
    case "github":
      return signInWithGithub();
    default:
      return signInWithGoogle();
  }
}

// A provider that is not configured in Supabase fails to even START with a
// "provider is not enabled" error; the sign-in screen hides that button for the
// session. Pure so the classification is testable.
export function isProviderNotEnabledError(message: string): boolean {
  return /not enabled|unsupported provider|validation_failed/i.test(message);
}
