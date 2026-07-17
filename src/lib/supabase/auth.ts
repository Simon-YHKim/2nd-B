// C6/C10: client-side guards for sign-up (fast UX fail). The AUTHORITATIVE age
// gate is server-side: the BEFORE INSERT trigger in 0030_server_age_gate.sql
// rejects under-14 and derives minor_tier / account_status from birth_date, so a
// direct-API insert can't bypass the floor or inject a false tier. The
// users_birth_date_sane CHECK (0028) is a further backstop.

import dayjs from "dayjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { digitalConsentAge } from "../auth/consent-age";
import type { ConsentSelections } from "../auth/consent-selections";
import { isJudgeEmail } from "../judge/domains";
import { getEnv } from "../env";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getSupabaseClient } from "./client";
import * as Crypto from "expo-crypto";

// C10 age tiers: adult users and 14-17 minors self-consent and register
// directly. Under PIPA, legal-representative consent is mandatory only below 14
// (Article 22-2); users 14+ may consent themselves under the general provisions
// (Articles 15/17/22) with age-appropriate notice. Under 14 requires verifiable
// guardian consent (added in a later PR); until then they are blocked here.
// Sourced from the jurisdiction matrix (task F); KR-assumed until country
// detection exists, so the live floor is the KR value (14).
export const MIN_SELF_CONSENT_AGE = digitalConsentAge("KR");

export class AgeGateError extends Error {
  constructor() {
    super("Users under 14 cannot register without guardian consent.");
    this.name = "AgeGateError";
  }
}

// The email already belongs to ANOTHER auth identity (a different sign-in
// method): users.email is citext UNIQUE, so the profile INSERT can never
// succeed for this session. Per docs/AUDIT_2026-06-03.md we never auto-link
// accounts on email alone -- the screen signs the session out and tells the
// user to use their original method.
export class EmailInUseError extends Error {
  constructor() {
    super("This email is already registered through another sign-in method.");
    this.name = "EmailInUseError";
  }
}

/** Postgres unique_violation, as surfaced by PostgREST (code 23505). */
export function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: unknown }).code === "23505";
}

// M2 (round-4): the only credential strength check was length >= 8, and the
// Supabase leaked-password (HIBP) protection is a Pro-plan dashboard toggle the
// $0/mo free tier can't enable. This is the code-side backstop, and it matters
// most for the 14-17 minors who register through the same flow.
export class BreachedPasswordError extends Error {
  constructor() {
    super("This password appeared in a known data breach. Please choose a different one.");
    this.name = "BreachedPasswordError";
  }
}

// J3 (e2e journey register): GoTrue answers a sign-up on an already-registered
// email with an enumeration-safe FAKE success (obfuscated user, no session).
// Our auto-confirm flow then tries signInWithPassword with the just-typed
// password, which fails with invalid credentials — and the user used to loop
// on a generic "sign-up failed" toast with no way out. This error marks that
// specific shape so the screen can suggest the recovery path (sign in / reset
// password). It is a SUGGESTION, never an assertion: the same shape could in
// principle be a misconfigured confirm flow, and we must not confirm to a
// third party that the email exists (CSO R3 stays intact — the copy is
// conditional and the server told us nothing).
export class ExistingAccountLikelyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExistingAccountLikelyError";
  }
}

// HIBP k-anonymity range check: SHA-1 the password locally, send ONLY the first
// 5 hex chars to api.pwnedpasswords.com, and match the returned suffixes. The
// plaintext (and even the full hash) never leave the device — the widely-used,
// privacy-preserving HIBP model. Best-effort: if the network/HIBP fails, we DON'T block sign-up (the >= 8
// length floor + Supabase's own checks remain). `Add-Padding` masks the prefix's
// real result-count from the network.
// Native devices use expo-crypto to offload the SHA-1 hash to a native module,
// avoiding JS-thread blocking which can cause frame drops or ANRs during sign-up.
export async function isPasswordBreached(password: string): Promise<boolean> {
  try {
    const hex = (await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA1, password)).toUpperCase();
    const prefix = hex.slice(0, 5);
    const suffix = hex.slice(5);
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "Add-Padding": "true" },
    });
    if (!res.ok) return false;
    const body = await res.text();
    return body
      .split("\n")
      .some((line) => line.split(":")[0]?.trim().toUpperCase() === suffix && !line.trim().endsWith(":0"));
  } catch {
    return false;
  }
}

// birthDate format: ISO date (YYYY-MM-DD), parsed in local time by dayjs. Returns whole
// years elapsed. The sign-up floor (MIN_SELF_CONSENT_AGE = 14) is applied by
// the callers above; the DB no longer hard-codes an age CHECK (0028 relaxed the
// legacy adult-only rule to a sanity range).
const ISO_BIRTH_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  if ([4, 6, 9, 11].includes(month)) return 30;
  return 31;
}

export function ageInYears(birthDate: string, now: Date = new Date()): number {
  const match = ISO_BIRTH_DATE.exec(birthDate);
  if (!match) return -1;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return -1;
  if (day < 1 || day > daysInMonth(year, month)) return -1;

  const b = dayjs(birthDate);
  if (!b.isValid()) return -1;
  return dayjs(now).diff(b, "year");
}

export interface SignUpArgs {
  email: string;
  password: string;
  birthDate: string; // YYYY-MM-DD
  locale?: "en" | "ko";
  /** Explicit acknowledgements collected by ConsentNotice. They are copied to
   *  auth metadata so the DB can atomically create the profile + immutable
   *  consent row only after the email address is confirmed. */
  consent: ConsentSelections;
}

export type SignUpResult =
  | {
      kind: "confirmationRequired";
    }
  | {
      kind: "active";
      userId: string;
      judgeMode: boolean;
      /** False when the users row already existed (a fully-registered user
       *  re-signed-up with their CORRECT password — effectively a sign-in).
       *  The caller must not re-record sign-up consent in that case. */
      created: boolean;
    };

export async function signUpWithEmail(args: SignUpArgs): Promise<SignUpResult> {
  if (ageInYears(args.birthDate) < MIN_SELF_CONSENT_AGE) throw new AgeGateError();
  if (await isPasswordBreached(args.password)) throw new BreachedPasswordError();

  const supabase = getSupabaseClient();
  const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
    email: args.email,
    password: args.password,
    options: {
      emailRedirectTo: authRedirectTo("/sign-up"),
      data: {
        signup_flow: "email-v1",
        signup_birth_date: args.birthDate,
        signup_locale: args.locale ?? "en",
        signup_consent_service: args.consent.service,
        signup_consent_llm_processing: args.consent.llmProcessing,
        signup_consent_overseas_transfer: args.consent.overseasTransfer,
        signup_consent_sensitive_data: args.consent.sensitiveData,
        signup_consent_marketing: args.consent.marketing,
      },
    },
  });
  if (signUpErr) throw signUpErr;

  // Confirm-email enabled projects deliberately return no session here. Never
  // attempt an immediate password sign-in: doing so was the client half of the
  // old auto-confirm bypass and accepted typo/fake addresses. Migration 0086
  // creates the profile + consent ledger only on the auth.users confirmation
  // transition. The redirect returns to /sign-up, where useSignUpForm consumes
  // the native callback and lets the normal authenticated guard enter the app.
  const session = signUpData.session;
  const user = signUpData.user;
  if (!session) return { kind: "confirmationRequired" };
  if (!user || !session) throw new Error("Sign-up returned no session");

  const judgeMode = isJudgeEmail(args.email);
  const { error: insertErr } = await supabase.from("users").insert({
    id: user.id,
    email: args.email,
    birth_date: args.birthDate,
    judge_mode: judgeMode,
    locale: args.locale ?? "en",
  });
  // DB trigger auto_judge_mode also enforces judgeMode; the client-side
  // value is best-effort for instant UI updates. The trigger is authoritative.
  if (insertErr) {
    // J3 (the correct-password variant): a fully-registered user re-signing-up
    // with their own password authenticates fine above, then the INSERT hits
    // the users PK collision. They proved who they are — treating that as a
    // failure (the old rollback signed their VALID session back out and showed
    // a generic error loop) punished a successful sign-in. Probe for the
    // existing row; if it's there, hand the session through as a sign-in.
    const { data: existing } = await supabase
      .from("users")
      .select("id, judge_mode")
      .eq("id", user.id)
      .maybeSingle();
    if (existing) {
      return {
        kind: "active",
        userId: user.id,
        judgeMode: existing.judge_mode === true,
        created: false,
      };
    }
    // The auth.users account already exists with an authenticated session, but
    // the profile row failed (age-gate trigger, citext-unique email collision,
    // RLS/network). Leaving the session live would strand the user: profile-less
    // but signed in, and a retry hits "user already registered". Sign the
    // just-created session back out so the account isn't half-provisioned, then
    // surface the original error. Best-effort: never mask insertErr.
    try {
      await supabase.auth.signOut();
    } catch {
      /* ignore — surfacing insertErr is what matters */
    }
    throw insertErr;
  }

  return { kind: "active", userId: user.id, judgeMode, created: true };
}

// --- OAuth (Google / Apple / Kakao) --------------------------------------
//
// Google, Apple, and Kakao are Supabase-native social providers, so they all
// go through the same signInWithOAuth() path via signInWithProvider(). Each must
// be enabled (with its client id/secret) in the Supabase dashboard, and the
// redirect URL allowed under Auth -> URL Configuration. On Expo Web (GitHub
// Pages) Supabase navigates the page directly; on native iOS/Android we open the
// provider URL with expo-web-browser and convert the callback into a session
// (openNativeOAuthSession). Naver is NOT a built-in Supabase provider; it needs a
// custom OAuth edge function (see docs/AUTH_PROVIDERS.md) and is excluded here.

// OAuth providers we support via Supabase's built-in social login. (Naver is
// intentionally excluded: it is not a Supabase provider; see the doc above.)
export type OAuthProvider = "google" | "apple" | "kakao" | "facebook" | "github";

export interface OAuthRedirect {
  url: string;
}

type ExpoLinkingModule = typeof import("expo-linking");
type ExpoWebBrowserModule = typeof import("expo-web-browser");

function isWebRuntime(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function authRedirectTo(pathname: string): string | undefined {
  if (!isWebRuntime()) return nativeRedirectTo(pathname);
  // expo-router base path is '/2nd-B/' on GitHub Pages, '/' in dev.
  // Detect by looking at the current pathname's prefix.
  const path = window.location.pathname;
  const base = path.startsWith("/2nd-B/") ? "/2nd-B/" : "/";
  return `${window.location.origin}${base}${pathname.replace(/^\//, "")}`;
}

function defaultRedirectTo(): string | undefined {
  if (!isWebRuntime()) return nativeRedirectTo("/");
  // ALWAYS return to the app root, not window.location.pathname.
  // If the user clicked Google from /sign-in, using pathname would
  // send them back to /sign-in post-OAuth — they'd see the sign-in
  // form again after authenticating. Routing through the root lets
  // IntroGate play the cell loader and /index decide where the
  // signed-in user actually belongs (/complete-profile or graph).
  //
  return authRedirectTo("/");
}

function passwordResetRedirectTo(): string | undefined {
  return authRedirectTo("/reset-password");
}

function nativeRedirectTo(pathname: string): string | undefined {
  try {
    const Linking = require("expo-linking") as ExpoLinkingModule;
    return Linking.createURL(pathname);
  } catch {
    return undefined;
  }
}

function authParamsFromUrl(url: string): Record<string, string> {
  const params = new URLSearchParams();
  const [withoutHash, hash = ""] = url.split("#");
  const query = withoutHash.split("?")[1] ?? "";
  for (const source of [query, hash]) {
    const sourceParams = new URLSearchParams(source);
    sourceParams.forEach((value, key) => params.set(key, value));
  }
  return Object.fromEntries(params.entries());
}

async function createNativeSessionFromUrl(supabase: SupabaseClient, url: string): Promise<void> {
  const params = authParamsFromUrl(url);
  const errorCode = params.error_code ?? params.errorCode;
  if (errorCode) throw new Error(params.error_description ?? errorCode);

  if (params.code) {
    const { error } = await supabase.auth.exchangeCodeForSession(params.code);
    if (error) throw error;
    return;
  }

  if (params.access_token && params.refresh_token) {
    const { error } = await supabase.auth.setSession({
      access_token: params.access_token,
      refresh_token: params.refresh_token,
    });
    if (error) throw error;
  }
}

async function openNativeOAuthSession(
  supabase: SupabaseClient,
  authUrl: string,
  redirectTo: string | undefined,
): Promise<OAuthRedirect | null> {
  const WebBrowser = require("expo-web-browser") as ExpoWebBrowserModule;
  const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectTo);
  if (result.type !== "success") return null;
  await createNativeSessionFromUrl(supabase, result.url);
  return { url: result.url };
}

export async function signInWithEmail(email: string, password: string): Promise<{ userId: string }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (!data.user) throw new Error("Sign-in returned no user");
  return { userId: data.user.id };
}

// Native recovery deep links (password-reset email) carry the session in the
// URL, but `detectSessionInUrl` is web-only and the only consumer of callback
// URLs was the in-app OAuth browser path — so on Android/iOS the reset screen
// always dead-ended at "expired" with no session. The reset screen feeds the
// deep link here to establish the recovery session.
export async function consumeAuthCallbackUrl(url: string): Promise<void> {
  const supabase = getSupabaseClient();
  await createNativeSessionFromUrl(supabase, url);
}

export async function sendPasswordResetEmail(email: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: passwordResetRedirectTo(),
  });
  if (error) throw error;
}

// Recovery-code path (flow request #5): the same resetPasswordForEmail issues a
// 6-digit token alongside the link; verifying it (type "recovery") establishes
// the session updatePassword needs, with no mail link round-trip. The link in
// the mail keeps working as a fallback — both consume the same token.
export async function verifyPasswordResetCode(email: string, code: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.verifyOtp({ type: "recovery", email: email.trim(), token: code.trim() });
  if (error) throw error;
}

// Sign-up confirm code (Gmail deliverability P1, 2026-07-18): Gmail buries any
// mail carrying a *.supabase.co auth link (A/B-verified: same sender and auth
// stack, the link alone flips inbox -> spam), which silently blocked every
// Gmail sign-up. The confirmation template is therefore CODE-ONLY; verifying
// the mailed 6-digit {{ .Token }} establishes the session with no link
// round-trip, and the 0086 trigger has already created the profile + consent
// rows on the confirmation transition. Links in already-sent mail keep working
// through the existing callback path (both consume the same token).
export async function verifySignUpCode(email: string, code: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.verifyOtp({ type: "signup", email: email.trim(), token: code.trim() });
  if (error) throw error;
}

export async function updatePassword(password: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// Start a Supabase social-login redirect for the given provider. On Web,
// Supabase navigates the page directly; data.url is informational. On native,
// open the provider URL and convert the callback URL into a Supabase session so
// AuthContext can continue the normal app hand-off.
export async function signInWithProvider(
  provider: OAuthProvider,
  redirectTo?: string,
): Promise<OAuthRedirect | null> {
  const supabase = getSupabaseClient();
  const isWeb = isWebRuntime();
  const resolvedRedirectTo = redirectTo ?? defaultRedirectTo();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: resolvedRedirectTo,
      skipBrowserRedirect: !isWeb,
    },
  });
  if (error) throw error;
  if (!isWeb && data.url) return openNativeOAuthSession(supabase, data.url, resolvedRedirectTo);
  return data.url ? { url: data.url } : null;
}

export function signInWithGoogle(redirectTo?: string): Promise<OAuthRedirect | null> {
  return signInWithProvider("google", redirectTo);
}

export function signInWithApple(redirectTo?: string): Promise<OAuthRedirect | null> {
  return signInWithProvider("apple", redirectTo);
}

export function signInWithKakao(redirectTo?: string): Promise<OAuthRedirect | null> {
  return signInWithProvider("kakao", redirectTo);
}

export function signInWithFacebook(redirectTo?: string): Promise<OAuthRedirect | null> {
  return signInWithProvider("facebook", redirectTo);
}

export function signInWithGithub(redirectTo?: string): Promise<OAuthRedirect | null> {
  return signInWithProvider("github", redirectTo);
}

// Native (on-device SDK) social sign-in: the platform SDK obtains an OIDC id_token
// and Supabase exchanges it for a session, no browser round-trip. Used only by the
// native-SDK path (src/lib/auth/native-social.ts); web/native browser flows use
// signInWithProvider above. Kakao is accepted by gotrue's id_token endpoint when its
// OpenID Connect is enabled in the Kakao console.
export async function signInWithIdTokenProvider(
  provider: "google" | "kakao" | "apple",
  token: string,
): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.signInWithIdToken({ provider, token });
  if (error) throw error;
}

// Whether to SHOW a built-in social provider button. The provider must ALSO be
// configured in the Supabase dashboard (client id/secret + redirect URL) to
// actually authenticate; this only gates the UI so a deploy that has not set up
// a provider can hide its otherwise-dead button via
// EXPO_PUBLIC_ENABLE_<PROVIDER>=false. Defaults on (opt-out), mirroring how the
// buttons were shown unconditionally before.
export function isProviderEnabled(provider: OAuthProvider): boolean {
  const env = getEnv();
  if (provider === "google") return env.EXPO_PUBLIC_ENABLE_GOOGLE;
  if (provider === "apple") return env.EXPO_PUBLIC_ENABLE_APPLE;
  if (provider === "facebook") return env.EXPO_PUBLIC_ENABLE_FACEBOOK;
  if (provider === "github") return env.EXPO_PUBLIC_ENABLE_GITHUB;
  return env.EXPO_PUBLIC_ENABLE_KAKAO;
}

// --- Naver social login (custom OAuth via the oauth-naver edge function) ------
//
// Naver is NOT a Supabase-native provider, so we drive the OAuth ourselves:
//   1. signInWithNaver() redirects the browser to Naver's authorize page with a
//      random `state` stashed in sessionStorage (CSRF defense).
//   2. Naver returns to /oauth-callback with ?code&state.
//   3. completeNaverOAuth() verifies the returned state matches (CSRF check),
//      hands the code to the oauth-naver edge function, and signs the user in
//      with the magic-link token_hash it returns (verifyOtp). New users then
//      route through /complete-profile (DOB + consent), like every provider.
// Gated behind EXPO_PUBLIC_ENABLE_NAVER on web plus a configured client id (and
// the server's ENABLE_NAVER_OAUTH). Native uses the registered HTTPS callback
// as a bridge back to the app. See docs/AUTH_PROVIDERS.md.

const NAVER_AUTHORIZE_URL = "https://nid.naver.com/oauth2.0/authorize";
const NAVER_STATE_KEY = "secondB_naver_oauth_state";
const NAVER_PRODUCTION_REDIRECT_URI = "https://simon-yhkim.github.io/2nd-B/oauth-callback";
const NAVER_NATIVE_STATE_PREFIX = "native.";
const NAVER_NATIVE_CALLBACK_URI = "secondbrain:///oauth-callback";

export function isNaverEnabled(): boolean {
  const env = getEnv();
  // Native profiles already carry the public client id. The old enable flag was
  // web-only, which accidentally hid Naver on the phone even after its server
  // and console setup were complete.
  return !!env.EXPO_PUBLIC_NAVER_CLIENT_ID && (env.EXPO_PUBLIC_ENABLE_NAVER || !isWebRuntime());
}

export function isNativeNaverCallbackState(state: string): boolean {
  return state.startsWith(NAVER_NATIVE_STATE_PREFIX);
}

export function buildNativeNaverCallbackUrl(search: string): string {
  const query = search.startsWith("?") ? search : `?${search}`;
  return `${NAVER_NATIVE_CALLBACK_URI}${query}`;
}

// Callback URL Naver redirects back to. Must be registered in the Naver console
// AND match the value the edge function forwards to Naver's token exchange.
function naverRedirectUri(): string {
  if (!isWebRuntime()) return NAVER_PRODUCTION_REDIRECT_URI;
  const path = window.location.pathname;
  const base = path.startsWith("/2nd-B/") ? "/2nd-B/" : "/";
  return `${window.location.origin}${base}oauth-callback`;
}

function randomState(): string {
  const g = globalThis as unknown as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } };
  if (g.crypto?.getRandomValues) {
    const bytes = new Uint8Array(16);
    g.crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  // Fallback only if no CSPRNG (shouldn't happen on web); state is still echoed.
  return `${Date.now().toString(16)}${Math.floor(Math.random() * 1e16).toString(16)}`;
}

// Web redirects directly. Native uses the registered HTTPS callback as a
// bridge: the callback page forwards code+state to secondbrain:///oauth-callback,
// allowing expo-web-browser to return control without adding a native SDK.
export async function signInWithNaver(): Promise<void> {
  const env = getEnv();
  const clientId = env.EXPO_PUBLIC_NAVER_CLIENT_ID;
  const web = isWebRuntime();
  if (!clientId || (!env.EXPO_PUBLIC_ENABLE_NAVER && web)) throw new Error("Naver login is not enabled.");
  const state = `${web ? "" : NAVER_NATIVE_STATE_PREFIX}${randomState()}`;
  const url = new URL(NAVER_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", naverRedirectUri());
  url.searchParams.set("state", state);

  if (web) {
    try {
      window.sessionStorage?.setItem(NAVER_STATE_KEY, state);
    } catch {
      // sessionStorage unavailable (private mode) — the state echo can't be
      // verified on return, so completeNaverOAuth() will reject. User can retry.
    }
    window.location.href = url.toString();
    return;
  }

  // Cold-start survival: Android may kill the app while the Custom Tab is up.
  // The deep link then starts a FRESH JS context where this closure (and its
  // state nonce) no longer exists — the native /oauth-callback route finishes
  // the flow instead, verifying against this persisted nonce.
  try {
    await AsyncStorage.setItem(NAVER_STATE_KEY, state);
  } catch {
    /* storage unavailable: the warm path still verifies via the closure */
  }
  const WebBrowser = require("expo-web-browser") as ExpoWebBrowserModule;
  const result = await WebBrowser.openAuthSessionAsync(url.toString(), NAVER_NATIVE_CALLBACK_URI);
  if (result.type !== "success") return;
  const returned = authParamsFromUrl(result.url);
  if (returned.error) throw new Error(returned.error_description ?? returned.error);
  const code = returned.code ?? "";
  const returnedState = returned.state ?? "";
  if (!code) throw new Error("Naver sign-in returned no authorization code.");
  await completeNaverOAuth({ code, state: returnedState }, state);
}

export interface NaverCallbackParams {
  code: string;
  state: string;
}

// Complete the Naver flow after the redirect: verify the state echo (CSRF),
// exchange the code via the edge function, and sign in with the magic-link
// token it returns. Returns the user id.
export async function completeNaverOAuth(
  params: NaverCallbackParams,
  expectedState?: string,
): Promise<{ userId: string }> {
  let stored: string | null = expectedState ?? null;
  if (!stored && isWebRuntime()) {
    try {
      stored = window.sessionStorage?.getItem(NAVER_STATE_KEY) ?? null;
    } catch {
      stored = null;
    }
  }
  if (!stored && !isWebRuntime()) {
    // Cold-start path: the persisted native nonce (single-use — cleared here).
    try {
      stored = await AsyncStorage.getItem(NAVER_STATE_KEY);
      await AsyncStorage.removeItem(NAVER_STATE_KEY);
    } catch {
      stored = null;
    }
  }
  // CSRF: the state Naver echoes back must equal the one we issued.
  if (!params.state || !stored || stored !== params.state) {
    throw new Error("Naver sign-in state mismatch (possible CSRF). Please try again.");
  }
  if (isWebRuntime()) {
    try {
      window.sessionStorage?.removeItem(NAVER_STATE_KEY);
    } catch {
      /* ignore */
    }
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase.functions.invoke("oauth-naver", {
    body: { code: params.code, state: params.state, redirect_uri: naverRedirectUri() },
  });
  if (error) throw error;
  const tokenHash = (data as { token_hash?: string } | null)?.token_hash;
  if (!tokenHash) throw new Error("Naver sign-in could not be completed.");

  const { data: otp, error: otpErr } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: "magiclink",
  });
  if (otpErr) throw otpErr;
  if (!otp.user) throw new Error("Naver sign-in returned no user.");
  return { userId: otp.user.id };
}

// --- Profile completion (OAuth post-step) --------------------------------
//
// OAuth providers don't ask for date of birth. After the OAuth callback the
// app routes new users to /complete-profile, which calls ensureUserProfile()
// to write the public.users row. This is the second line of C10 (the DB
// CHECK constraint on users.birth_date is the third).

export interface CompleteProfileArgs {
  birthDate: string;
  locale: "en" | "ko";
}

export interface CompleteProfileResult {
  created: boolean;
  judgeMode: boolean;
}

export async function ensureUserProfile(args: CompleteProfileArgs): Promise<CompleteProfileResult> {
  if (ageInYears(args.birthDate) < MIN_SELF_CONSENT_AGE) throw new AgeGateError();

  const supabase = getSupabaseClient();
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  if (authErr) throw authErr;
  const user = authData.user;
  if (!user) throw new Error("No authenticated user — complete-profile requires an active OAuth session.");

  // Idempotent: if the profile already exists, we're done. This protects
  // against double-submits and Supabase auth refresh loops.
  const { data: existing } = await supabase.from("users").select("id, judge_mode").eq("id", user.id).maybeSingle();
  if (existing) return { created: false, judgeMode: existing.judge_mode === true };

  const judgeMode = isJudgeEmail(user.email ?? "");
  const { error: insertErr } = await supabase.from("users").insert({
    id: user.id,
    email: user.email ?? "",
    birth_date: args.birthDate,
    judge_mode: judgeMode,
    locale: args.locale,
  });
  // C6: the auto_judge_mode BEFORE INSERT trigger overrides the client value.
  if (insertErr) {
    // A 23505 here has two shapes. (a) users_pkey: our own row won a
    // double-submit race -- re-probe by id and report idempotent success,
    // mirroring signUpWithEmail's defence. (b) users_email_key: the email
    // belongs to ANOTHER auth uid via a different sign-in method. Before
    // this branch existed that session was STRANDED -- authed but unable to
    // ever gain a profile, every retry re-colliding into the same generic
    // "save failed" toast (U6, commerce handoff).
    const { data: raced } = await supabase.from("users").select("id, judge_mode").eq("id", user.id).maybeSingle();
    if (raced) return { created: false, judgeMode: raced.judge_mode === true };
    if (isUniqueViolation(insertErr)) throw new EmailInUseError();
    throw insertErr;
  }

  return { created: true, judgeMode };
}
