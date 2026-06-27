// Native (on-device) social sign-in via the platform SDKs — an optional enhancement
// over the browser-brokered Supabase flow (src/lib/supabase/auth.ts). Google and Kakao
// each return an OIDC id_token that Supabase exchanges via signInWithIdToken, giving the
// native account sheet / KakaoTalk-app login instead of an in-app browser bounce.
//
// PURELY ADDITIVE + DEFENSIVE. It only runs on a real React Native runtime when
// EXPO_PUBLIC_NATIVE_SOCIAL_SDK === "true" AND the SDK is present in the binary. If the
// SDK is absent it returns false; on a runtime error it throws — either way the caller
// (startOAuthProvider) falls back to the browser flow, so a misconfigured native client
// never blocks a login that already works on web. jest/node and web never load the SDKs:
// the RN-runtime guard short-circuits first and the SDKs are pulled in via lazy require().

import { signInWithIdTokenProvider, type OAuthProvider } from "@/lib/supabase/auth";

function isNativeRuntime(): boolean {
  const nav = globalThis.navigator as { product?: string } | undefined;
  return nav?.product === "ReactNative";
}

function nativeSocialSdkEnabled(): boolean {
  return process.env.EXPO_PUBLIC_NATIVE_SOCIAL_SDK === "true";
}

// Which providers have a native-SDK path. Apple/Facebook/GitHub stay browser-brokered.
export function supportsNativeSocialSdk(provider: OAuthProvider): boolean {
  return provider === "google" || provider === "kakao";
}

// Whether to even attempt the native path for this provider in the current runtime.
export function shouldTryNativeSocialSignIn(provider: OAuthProvider): boolean {
  return nativeSocialSdkEnabled() && isNativeRuntime() && supportsNativeSocialSdk(provider);
}

// Attempt native sign-in. Returns true when it fully handled the attempt (a session was
// created OR the user cancelled). Returns false when it could not attempt (the SDK is not
// in the binary). Throws on a genuine auth error so the caller can fall back to browser.
export async function tryNativeSocialSignIn(provider: OAuthProvider): Promise<boolean> {
  if (!shouldTryNativeSocialSignIn(provider)) return false;
  if (provider === "google") return signInWithGoogleNative();
  if (provider === "kakao") return signInWithKakaoNative();
  return false;
}

async function signInWithGoogleNative(): Promise<boolean> {
  let mod: typeof import("@react-native-google-signin/google-signin");
  try {
    mod = require("@react-native-google-signin/google-signin");
  } catch {
    return false; // SDK not in this binary — caller falls back to the browser flow
  }
  const { GoogleSignin } = mod;
  // webClientId is the OAuth *web* client (the Supabase audience); the Android client is
  // matched by package name + signing SHA-1 registered in the same Google Cloud project.
  GoogleSignin.configure({ webClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID });
  await GoogleSignin.hasPlayServices();
  const res = await GoogleSignin.signIn();
  if (res.type === "cancelled") return true; // user dismissed the account sheet
  const idToken = res.data?.idToken;
  if (!idToken) throw new Error("Google native sign-in returned no idToken");
  await signInWithIdTokenProvider("google", idToken);
  return true;
}

async function signInWithKakaoNative(): Promise<boolean> {
  let mod: typeof import("@react-native-seoul/kakao-login");
  try {
    mod = require("@react-native-seoul/kakao-login");
  } catch {
    return false;
  }
  // login() prefers the KakaoTalk app, falling back to the Kakao account web view.
  // idToken is present because OpenID Connect is enabled for the Kakao app.
  const { idToken } = await mod.login();
  if (!idToken) throw new Error("Kakao native login returned no idToken (is OpenID Connect enabled?)");
  await signInWithIdTokenProvider("kakao", idToken);
  return true;
}
