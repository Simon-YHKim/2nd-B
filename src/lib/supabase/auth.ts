// C6/C10: client-side guards for sign-up (fast UX fail). The AUTHORITATIVE age
// gate is server-side: the BEFORE INSERT trigger in 0030_server_age_gate.sql
// rejects under-14 and derives minor_tier / account_status from birth_date, so a
// direct-API insert can't bypass the floor or inject a false tier. The
// users_birth_date_sane CHECK (0028) is a further backstop.

import dayjs from "dayjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { digitalConsentAge, resolveJurisdiction } from "../auth/consent-age";
import { allRequiredAcksChecked, type ConsentSelections } from "../auth/consent-selections";
import {
  assertRecoveryOperationCurrentInsideMutation,
  clearAuthCallbackQuarantineExpectedInsideMutation,
  clearRecoveryPendingExpected,
  clearRecoveryPendingExpectedInsideMutation,
  clearRecoveryStateExpectedInsideMutation,
  clearRecoveryMarkerSnapshotExpectedInsideMutation,
  completeRecoveryHandoffExpectedInsideMutation,
  createAuthCallbackQuarantine,
  createRecoveryProof,
  loadRecoveryMarkerSnapshotInsideMutation,
  persistAuthCallbackQuarantineInsideMutation,
  persistRecoveryProofInsideMutation,
  recoveryPendingMatchesExpectedInsideMutation,
  recoveryProofOwnsCallbackQuarantine,
  recoveryProofOwnsPending,
  recoveryProofMatchesSession,
  recoverySessionIdentity,
  RecoveryOperationOwnerChangedError,
  type AuthCallbackQuarantine,
  type RecoveryMarkerSnapshot,
  type RecoveryPending,
  type RecoveryOperationExpectation,
  type RecoveryProof,
  type RecoverySessionIdentity,
} from "../auth/recovery-proof-store";
import {
  captureAuthSessionExpectation,
  getAuthStorageRuntime,
  runAuthSessionMutation,
  signOutExpectedSession,
  signOutExpectedSessionInsideMutation,
  type AuthSessionExpectation,
} from "../auth/session-mutation";
export { AuthSessionOwnerChangedError } from "../auth/session-mutation";
// ⚠ #1517 은 여기서 `isJudgeEmail` 도 들여왔다. 되살리지 않는다 —
// main 의 f42f4db2 가 C6 대회 제약과 함께 src/lib/judge/domains.ts 를 통째로
// 지웠고(CLAUDE.md C6), 이 파일에서 쓰이지도 않는다.
// #1587 은 allRequiredAcksChecked 를 더 들여온다 — 가입 동의를 화면만이 아니라
// 서버도 확인하기 위해서고, 아래 함수가 실제로 호출한다.
import { getEnv } from "../env";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getSupabaseClient } from "./client";
import * as Crypto from "expo-crypto";

// C10 age tiers: adult users and 14-17 minors self-consent and register
// directly. Under PIPA, legal-representative consent is mandatory only below 14
// (Article 22-2); users 14+ may consent themselves under the general provisions
// (Articles 15/17/22) with age-appropriate notice. Under 14 requires verifiable
// guardian consent (added in a later PR); until then they are blocked here.
// Sourced from the jurisdiction matrix (task F) via the single resolveJurisdiction()
// seam (defaults to KR until a real country signal exists), so the live floor is the
// KR value (14) unless an operator pins EXPO_PUBLIC_JURISDICTION for QA.
export const MIN_SELF_CONSENT_AGE = digitalConsentAge(resolveJurisdiction());

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

// This revision identifies the exact consent shape and published-document
// tuple bundled with this client. The verified-email trigger accepts only the
// matching revision, so an older installed app cannot be stamped as if it had
// shown newer documents. Any future document change needs a new revision and a
// forward migration that maps it to server-owned versions.
export const VERIFIED_EMAIL_SIGNUP_REVISION = "email-v3" as const;

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
  if (!allRequiredAcksChecked(args.consent)) {
    throw new Error("Required consent acknowledgements are missing.");
  }
  if (await isPasswordBreached(args.password)) throw new BreachedPasswordError();

  return runAuthSessionMutation(async (mutationContext) => {
    const supabase = getSupabaseClient();
    const authRuntime = getAuthStorageRuntime();
    const { data: signUpData, error: signUpErr } =
      await authRuntime.runSdkUnlockedWriter(() =>
        supabase.auth.signUp({
          email: args.email,
          password: args.password,
          options: {
            emailRedirectTo: authRedirectTo("/sign-up"),
            data: {
              signup_flow: VERIFIED_EMAIL_SIGNUP_REVISION,
              signup_birth_date: args.birthDate,
              signup_locale: args.locale ?? "en",
              signup_consent_service: args.consent.service,
              signup_consent_llm_processing: args.consent.llmProcessing,
              signup_consent_overseas_transfer: args.consent.overseasTransfer,
              signup_consent_sensitive_data: args.consent.sensitiveData,
              signup_consent_safety_notice: args.consent.safetyNotice,
              signup_consent_marketing: args.consent.marketing,
            },
          },
        }),
      );
    if (signUpErr) throw signUpErr;

    // Confirm-email enabled projects deliberately return no session here. Never
    // attempt an immediate password sign-in: doing so was the client half of the
    // old auto-confirm bypass and accepted typo/fake addresses. Migration 0086
    // creates the profile + consent ledger only on the auth.users confirmation
    // transition. The user enters the code from the code-only confirmation mail
    // on /sign-up; no bearer-token link is delivered as a fallback.
    const session = signUpData.session;
    const user = signUpData.user;
    if (!session) return { kind: "confirmationRequired" };
    if (!user || !session) throw new Error("Sign-up returned no session");
    const rollbackExpectation: AuthSessionExpectation = {
      userId: user.id,
      sessionId: recoverySessionIdentity(session)?.sessionId ?? null,
      accessToken: session.access_token,
    };

    // A brand-new row is never comped. The email-domain derivation that used to
    // decide this was deleted 2026-09-06 (Simon decision Q-260905-02) along with
    // src/lib/judge/domains.ts, whose JUDGE_DOMAINS had been empty since #1302,
    // so this call could only ever return false. Existing rows still report the
    // stored users.judge_mode below: that column stays on purpose (#1302) so an
    // account can be comped by hand.
    const judgeMode = false;
    const { error: insertErr } = await supabase.from("users").insert({
      id: user.id,
      email: args.email,
      birth_date: args.birthDate,
      locale: args.locale ?? "en",
    });
    // judge_mode is deliberately NOT sent. It used to be, with a comment saying
    // the auto_judge_mode trigger was authoritative - and it was, until 0138
    // dropped that trigger as XPRIZE cleanup. Sending a column whose only
    // remaining guard is a different trigger (0139's BEFORE INSERT) means the
    // client is asking for a privilege and being silently corrected. Not asking
    // is clearer, and the value defaults to false either way.
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
      // A browser without Web Locks cannot prove that another tab did not
      // replace A with B. Preserve the local session instead of risking B.
      if (!mutationContext.destructiveSafe) throw insertErr;
      try {
        await signOutExpectedSessionInsideMutation(supabase.auth, rollbackExpectation, "global");
      } catch {
        /* ignore — surfacing insertErr is what matters */
      }
      throw insertErr;
    }

    return { kind: "active", userId: user.id, judgeMode, created: true };
  });
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

const NATIVE_AUTH_BRIDGE_URL = "https://simon-yhkim.github.io/2nd-B/auth-bridge.html";
const NATIVE_AUTH_BRIDGE_TARGETS = {
  "/": "root",
  // Sign-up mail is OTP-only. Keep its otherwise-unused redirect on the
  // ordinary callback instead of widening the bridge destination set.
  "/sign-up": "root",
  "/reset-password": "reset-password",
} as const;

function isWebRuntime(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function authRedirectTo(pathname: string): string | undefined {
  if (!isWebRuntime()) return nativeAuthBridgeRedirectTo(pathname);
  // expo-router base path is '/2nd-B/' on GitHub Pages, '/' in dev.
  // Detect by looking at the current pathname's prefix.
  const path = window.location.pathname;
  const base = path.startsWith("/2nd-B/") ? "/2nd-B/" : "/";
  return `${window.location.origin}${base}${pathname.replace(/^\//, "")}`;
}

function defaultRedirectTo(): string | undefined {
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

function nativeAuthBridgeRedirectTo(pathname: string): string {
  const target = NATIVE_AUTH_BRIDGE_TARGETS[
    pathname as keyof typeof NATIVE_AUTH_BRIDGE_TARGETS
  ];
  if (!target) throw new Error("Unsupported native auth callback route");
  return `${NATIVE_AUTH_BRIDGE_URL}?to=${target}`;
}

function nativeAppReturnUrl(pathname: string): string | undefined {
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

export interface AuthCallbackSession {
  userId: string | null;
  sessionId: string | null;
  type: string | null;
  /** Present only after recovery session + durable proof finalize under M. */
  recoveryProof?: RecoveryProof;
}

const authCallbackExpectations = new WeakMap<AuthCallbackSession, AuthSessionExpectation>();

function authCallbackSession(
  session: { access_token: string; user: { id: string } } | null,
  type: string | null,
): AuthCallbackSession {
  const identity = recoverySessionIdentity(session);
  const callback = {
    userId: identity?.userId ?? null,
    sessionId: identity?.sessionId ?? null,
    type,
  };
  if (session) {
    authCallbackExpectations.set(callback, {
      userId: session.user.id,
      sessionId: identity?.sessionId ?? null,
      accessToken: session.access_token,
    });
  }
  return callback;
}

export function authCallbackType(url: string): string | null {
  return authParamsFromUrl(url).type ?? null;
}

/**
 * Recovery links carry either a PKCE code or fail-closed error metadata.
 * Legacy bearer-token links may still include `type=recovery`; recognize the
 * route so the reset screen can reject them instead of treating them as an
 * ordinary callback. Auth-js restores PKCE provenance from the stored verifier
 * after exchange, so a caller-controlled type is never authoritative.
 */
export function isPasswordRecoveryCallbackUrl(url: string): boolean {
  const params = authParamsFromUrl(url);
  try {
    const parsed = new URL(url);
    // Expo standalone links may be either scheme://reset-password (host form)
    // or scheme:///reset-password (path form), depending on the runtime.
    const callbackPath = parsed.pathname.replace(/\/+$/, "");
    const resetRoute =
      callbackPath === "/reset-password" ||
      (parsed.hostname === "reset-password" && callbackPath === "");
    return resetRoute && Boolean(
      params.type === "recovery" ||
      params.code ||
      params.error_code ||
      params.errorCode,
    );
  } catch {
    return false;
  }
}

class AuthCallbackSessionNotEstablishedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthCallbackSessionNotEstablishedError";
  }
}

async function createSessionFromUrlInsideMutation(
  supabase: SupabaseClient,
  url: string,
  pending: RecoveryPending | null,
): Promise<{
  callback: AuthCallbackSession;
  quarantine: AuthCallbackQuarantine | null;
}> {
  const params = authParamsFromUrl(url);
  const type = params.type ?? null;
  const errorCode = params.error_code ?? params.errorCode;
  if (errorCode) {
    throw new AuthCallbackSessionNotEstablishedError(
      params.error_description ?? errorCode,
    );
  }

  if (params.access_token || params.refresh_token) {
    // Custom URL schemes are not exclusive on mobile: another app can register
    // the same scheme and intercept a bearer-token recovery redirect. Never
    // establish a session from URL credentials, even on the recovery route.
    // PKCE codes and the explicit OTP verifier are the only link/code inputs.
    throw new AuthCallbackSessionNotEstablishedError(
      "Bearer-token auth callbacks are disabled; use a PKCE code or explicit OTP verification.",
    );
  }

  if (params.code) {
    const quarantine = createAuthCallbackQuarantine(
      pending ? "recovery" : "ordinary",
      pending,
    );
    // The durable fence is written under M before the first instruction that
    // can create/persist a callback session. A failed write means producer=0.
    await persistAuthCallbackQuarantineInsideMutation(quarantine);
    const { data, error } = await supabase.auth.exchangeCodeForSession(params.code);
    if (error) {
      await clearAuthCallbackQuarantineExpectedInsideMutation(quarantine);
      throw new AuthCallbackSessionNotEstablishedError(error.message);
    }
    // auth-js 2.106.1 returns redirectType at runtime even though the public
    // AuthTokenResponse type omits it. It is the authoritative PKCE provenance.
    const redirectType = (data as typeof data & { redirectType?: string | null })
      .redirectType;
    // PKCE provenance comes only from auth-js. A caller-controlled URL
    // `type=recovery` must not promote an ordinary exchanged code.
    return {
      callback: authCallbackSession(data.session, redirectType ?? null),
      quarantine,
    };
  }

  return {
    callback: { userId: null, sessionId: null, type },
    quarantine: null,
  };
}

function warnRecoveryFinalizeSignOutFailed(): void {
  if (typeof console !== "undefined") {
    console.warn("[auth] recovery sign-out failed; phase=transaction-finalize");
  }
}

async function failRecoverySessionInsideMutation(
  supabase: SupabaseClient,
  callback: AuthCallbackSession,
  snapshot: RecoveryMarkerSnapshot,
  error: unknown,
): Promise<never> {
  const expected = authCallbackExpectations.get(callback);
  // Without a stable producer result there is no owner-bound session we can
  // safely remove. Retain the durable tuple for bootstrap reconciliation.
  if (!expected) throw error;
  try {
    await signOutExpectedSessionInsideMutation(supabase.auth, expected, "local");
    // Validate the complete marker tuple before removing any member. A stale A
    // cleanup therefore cannot erase a quarantine/pending/proof written by B.
    await clearRecoveryMarkerSnapshotExpectedInsideMutation(snapshot);
  } catch {
    // Most importantly, leave pending durable when auth-js cannot complete its
    // remote/local sign-out. Restart will classify the stored session as
    // recovery-locked instead of silently promoting it to ordinary bootstrap.
    warnRecoveryFinalizeSignOutFailed();
  }
  throw error;
}

async function finalizeRecoverySessionInsideMutation(
  supabase: SupabaseClient,
  callback: AuthCallbackSession,
  pending: RecoveryPending,
  quarantine: AuthCallbackQuarantine,
): Promise<RecoveryProof> {
  if (!callback.userId || !callback.sessionId) {
    return failRecoverySessionInsideMutation(
      supabase,
      callback,
      { proof: null, pending, quarantine },
      new Error("Recovery verification returned no stable session"),
    );
  }
  const identity = { userId: callback.userId, sessionId: callback.sessionId };
  const proof = createRecoveryProof(
    identity,
    pending.ownerNonce ?? undefined,
    quarantine.ownerNonce,
  );
  try {
    await persistRecoveryProofInsideMutation(proof);
    if (!(
      await completeRecoveryHandoffExpectedInsideMutation({ proof, pending, quarantine })
    )) {
      throw new Error("Recovery callback ownership changed during session finalization");
    }
    return proof;
  } catch (error) {
    return failRecoverySessionInsideMutation(
      supabase,
      callback,
      { proof, pending, quarantine },
      error,
    );
  }
}

async function assertRecoveryPendingOwnerInsideMutation(
  pending: RecoveryPending,
): Promise<void> {
  if (!pending.ownerNonce) {
    throw new Error("Legacy recovery pending markers cannot authorize a new session mutation");
  }
  if (!(await recoveryPendingMatchesExpectedInsideMutation(pending))) {
    throw new Error("Recovery pending owner changed before session mutation");
  }
}

async function openNativeOAuthSession(
  authUrl: string,
  appReturnUrl: string | undefined,
): Promise<OAuthRedirect | null> {
  const WebBrowser = require("expo-web-browser") as ExpoWebBrowserModule;
  // Supabase redirects to the allowlisted HTTPS bridge. Expo must separately
  // wait for the bridge's bounded custom-scheme callback so the browser closes.
  const result = await WebBrowser.openAuthSessionAsync(authUrl, appReturnUrl);
  if (result.type !== "success") return null;
  await consumeAuthCallbackUrl(result.url);
  return { url: result.url };
}

export async function signInWithEmail(
  email: string,
  password: string,
): Promise<{ userId: string }> {
  return runAuthSessionMutation(async () => {
    const supabase = getSupabaseClient();
    const { data, error } = await getAuthStorageRuntime().runSdkUnlockedWriter(() =>
      supabase.auth.signInWithPassword({ email, password }),
    );
    if (error) throw error;
    if (!data.user) throw new Error("Sign-in returned no user");
    return { userId: data.user.id };
  });
}

// Native recovery deep links are consumed explicitly because detectSessionInUrl
// is disabled. Only PKCE codes can establish a link session; legacy URL bearer
// tokens fail closed before any auth mutation. The reset screen supplies its
// owned pending marker so exchanged recovery sessions can be proof-bound.
export async function consumeAuthCallbackUrl(
  url: string,
  pending?: RecoveryPending,
): Promise<AuthCallbackSession> {
  const explicitRecoveryIntent =
    isPasswordRecoveryCallbackUrl(url) || authCallbackType(url) === "recovery";
  if (explicitRecoveryIntent && !pending) {
    throw new Error("Recovery callback requires an owned pending marker");
  }
  return runAuthSessionMutation(async () => {
    const supabase = getSupabaseClient();
    if (pending) await assertRecoveryPendingOwnerInsideMutation(pending);
    let callback: AuthCallbackSession;
    let quarantine: AuthCallbackQuarantine | null = null;
    try {
      const established = await createSessionFromUrlInsideMutation(
        supabase,
        url,
        pending ?? null,
      );
      callback = established.callback;
      quarantine = established.quarantine;
    } catch (error) {
      // These failures are known to precede any returned/persisted callback
      // session. Release only this operation's marker; thrown/uncertain SDK
      // failures intentionally retain it as a restart fence.
      if (pending && error instanceof AuthCallbackSessionNotEstablishedError) {
        await clearRecoveryPendingExpectedInsideMutation(pending);
      }
      throw error;
    }
    if (callback.type === "recovery") {
      if (!pending || !quarantine) {
        // redirectType can reveal recovery provenance only after exchange. The
        // callback quarantine already predates that exchange, so it is the
        // restart fence for an unexpected recovery result.
        return failRecoverySessionInsideMutation(
          supabase,
          callback,
          { proof: null, pending: pending ?? null, quarantine },
          new Error("Recovery callback requires an owned pending marker"),
        );
      }
      callback.recoveryProof = await finalizeRecoverySessionInsideMutation(
        supabase,
        callback,
        pending,
        quarantine,
      );
    } else if (pending) {
      await failRecoverySessionInsideMutation(
        supabase,
        callback,
        { proof: null, pending, quarantine },
        new Error("Password reset callback was not issued for recovery"),
      );
    } else if (quarantine) {
      try {
        if (!(await clearAuthCallbackQuarantineExpectedInsideMutation(quarantine))) {
          throw new Error("Auth callback quarantine owner changed before finalization");
        }
      } catch (error) {
        await failRecoverySessionInsideMutation(
          supabase,
          callback,
          { proof: null, pending: null, quarantine },
          error,
        );
      }
    }
    return callback;
  }, { requireCrossTab: true });
}

export type AuthCallbackBootstrapReconciliation =
  | { kind: "unchanged" }
  | { kind: "recovery"; proof: RecoveryProof }
  | { kind: "cleared" }
  | { kind: "retryable" };

/**
 * Reconcile a callback transaction that crashed after its durable pre-fence.
 * This is intentionally retryable: no marker is removed until the exact live
 * session has been locally signed out, and every cleanup is a full tuple CAS.
 */
export async function reconcileAuthCallbackBootstrap(
  session: { access_token?: string | null; user?: { id?: string | null } | null } | null,
): Promise<AuthCallbackBootstrapReconciliation> {
  return runAuthSessionMutation(async () => {
    const snapshot = await loadRecoveryMarkerSnapshotInsideMutation();
    const { proof, pending, quarantine } = snapshot;
    const mismatchedPair = Boolean(
      proof && pending && !recoveryProofOwnsPending(proof, pending),
    );
    if (!quarantine && !mismatchedPair) return { kind: "unchanged" };

    if (
      session &&
      proof &&
      quarantine &&
      recoveryProofMatchesSession(proof, session) &&
      recoveryProofOwnsCallbackQuarantine(proof, quarantine) &&
      (!pending || recoveryProofOwnsPending(proof, pending))
    ) {
      try {
        const completed = await completeRecoveryHandoffExpectedInsideMutation({
          proof,
          pending,
          quarantine,
        });
        return completed ? { kind: "recovery", proof } : { kind: "retryable" };
      } catch {
        return { kind: "retryable" };
      }
    }

    if (session) {
      const identity = recoverySessionIdentity(session);
      const userId = session.user?.id;
      if (!identity || !userId || !session.access_token) return { kind: "retryable" };
      const expected: AuthSessionExpectation = {
        userId,
        sessionId: identity.sessionId,
        accessToken: session.access_token,
      };
      try {
        await signOutExpectedSessionInsideMutation(
          getSupabaseClient().auth,
          expected,
          "local",
        );
      } catch {
        // Preserve proof, pending, and quarantine exactly. A retry invokes this
        // same owner-bound operation; no authenticated surface is published.
        return { kind: "retryable" };
      }
    }

    try {
      return await clearRecoveryMarkerSnapshotExpectedInsideMutation(snapshot)
        ? { kind: "cleared" }
        : { kind: "retryable" };
    } catch {
      return { kind: "retryable" };
    }
  }, { requireCrossTab: true });
}

const AUTH_CALLBACK_KEYS = new Set([
  "access_token",
  "code",
  "error",
  "error_code",
  "error_description",
  "expires_at",
  "expires_in",
  "provider_refresh_token",
  "provider_token",
  "refresh_token",
  "token_type",
  "type",
]);

function scrubCurrentWebAuthCallback(): void {
  const current = new URL(window.location.href);
  for (const key of AUTH_CALLBACK_KEYS) current.searchParams.delete(key);
  const hash = new URLSearchParams(current.hash.replace(/^#/, ""));
  for (const key of AUTH_CALLBACK_KEYS) hash.delete(key);
  current.hash = hash.toString() ? `#${hash.toString()}` : "";
  window.history.replaceState(window.history.state, "", current.toString());
}

/**
 * Constructor URL detection is disabled so it cannot write a B session outside
 * M. AuthContext calls this once at boot for Supabase PKCE callbacks and to
 * scrub/reject any legacy implicit callback. The dedicated Naver callback
 * carries state and is intentionally excluded.
 */
export async function consumeCurrentWebAuthCallback(
  pending?: RecoveryPending | null,
): Promise<AuthCallbackSession | null> {
  if (!isWebRuntime()) return null;
  const params = authParamsFromUrl(window.location.href);
  const isNaverCallback = /\/oauth-callback\/?$/.test(window.location.pathname);
  const hasPkceCallback = Boolean(params.code || params.error || params.error_code);
  const hasImplicitCredentials = Boolean(params.access_token || params.refresh_token);
  if ((!hasPkceCallback && !hasImplicitCredentials) || isNaverCallback) return null;
  try {
    // Web auth is PKCE-only. Accepting a caller-supplied token fragment here
    // would reintroduce login CSRF: a link could silently replace the victim's
    // session with an attacker-owned account. Native rejects the same tokens.
    if (hasImplicitCredentials && !params.code) {
      if (pending) await clearRecoveryPendingExpected(pending);
      throw new Error("Implicit web auth callbacks are disabled; PKCE is required.");
    }
    return await consumeAuthCallbackUrl(window.location.href, pending ?? undefined);
  } finally {
    scrubCurrentWebAuthCallback();
  }
}

export async function sendPasswordResetEmail(email: string): Promise<void> {
  await runAuthSessionMutation(async () => {
    const supabase = getSupabaseClient();
    const { error } = await getAuthStorageRuntime().runSdkUnlockedWriter(() =>
      supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: passwordResetRedirectTo(),
      }),
    );
    if (error) throw error;
  });
}

// Recovery-code path (flow request #5): the same resetPasswordForEmail issues a
// 6-digit token alongside the link; verifying it (type "recovery") establishes
// the session updatePassword needs, with no mail link round-trip. Recovery mail
// is code-only so it never delivers a classic bearer-token link.
export async function verifyPasswordResetCode(
  email: string,
  code: string,
  pending: RecoveryPending,
): Promise<RecoveryProof> {
  return runAuthSessionMutation(async () => {
    const supabase = getSupabaseClient();
    await assertRecoveryPendingOwnerInsideMutation(pending);
    const quarantine = createAuthCallbackQuarantine("recovery", pending);
    await persistAuthCallbackQuarantineInsideMutation(quarantine);
    const { data, error } = await getAuthStorageRuntime().runSdkUnlockedWriter(() =>
      supabase.auth.verifyOtp({
        type: "recovery",
        email: email.trim(),
        token: code.trim(),
      }),
    );
    if (error) {
      await clearRecoveryMarkerSnapshotExpectedInsideMutation({
        proof: null,
        pending,
        quarantine,
      });
      throw error;
    }
    const callback = authCallbackSession(data.session, "recovery");
    return finalizeRecoverySessionInsideMutation(supabase, callback, pending, quarantine);
  }, { requireCrossTab: true });
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
  await runAuthSessionMutation(async () => {
    const supabase = getSupabaseClient();
    const quarantine = createAuthCallbackQuarantine("ordinary");
    await persistAuthCallbackQuarantineInsideMutation(quarantine);
    const { data, error } = await getAuthStorageRuntime().runSdkUnlockedWriter(() =>
      supabase.auth.verifyOtp({
        type: "signup",
        email: email.trim(),
        token: code.trim(),
      }),
    );
    if (error) {
      await clearAuthCallbackQuarantineExpectedInsideMutation(quarantine);
      throw error;
    }
    const callback = authCallbackSession(data.session, "signup");
    if (!(await clearAuthCallbackQuarantineExpectedInsideMutation(quarantine))) {
      await failRecoverySessionInsideMutation(
        supabase,
        callback,
        { proof: null, pending: null, quarantine },
        new Error("Sign-up callback quarantine owner changed before finalization"),
      );
    }
  }, { requireCrossTab: true });
}

// Supabase Auth "Require current password when updating" was enabled on the
// Email provider on 2026-08-10. auth-js 2.106.1 takes the current password as a
// FIELD on UserAttributes (types.d.ts: `current_password?: string`), not as a
// second argument, so the shape below is the one the installed client accepts.
// The recovery/reset flow calls this WITHOUT a current password on purpose: a
// user who forgot it cannot supply it. That is safe, and it was verified rather
// than assumed: on 2026-08-10, with the toggle ON, a real recovery session
// (POST /verify type=recovery) updated the password with no current_password and
// got 200. GoTrue exempts recovery sessions, so enabling the setting does NOT
// break "forgot password". The caller still handles `current_password_required`
// in case that exemption ever changes.
export async function updatePassword(
  password: string,
  currentPassword?: string,
): Promise<{ userId: string | null }> {
  // Keep the leaked-password check in the mutation facade, not either form.
  // The recovery-only facade below enforces the same check before taking M.
  // Sign-up already has its own check in signUpWithEmail.
  //
  // D-3 (Simon, 2026-08-21) chose the client check over moving auth behind an
  // edge function. The threat model is why that holds: a tampered client that
  // skips this harms only its own account, unlike an authz check where the
  // victim of a bypass is someone else.
  //
  // isPasswordBreached fails OPEN. A network problem must not make it
  // impossible to change your password, and the length floor plus GoTrue's own
  // checks still apply.
  if (await isPasswordBreached(password)) throw new BreachedPasswordError();
  return runAuthSessionMutation(async () => {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.updateUser(
      currentPassword ? { password, current_password: currentPassword } : { password },
    );
    if (error) throw error;
    return { userId: data?.user?.id ?? null };
  });
}

async function recoverySessionExpectationInsideMutation(
  expected: RecoveryOperationExpectation,
): Promise<AuthSessionExpectation> {
  await assertRecoveryOperationCurrentInsideMutation(expected);
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!recoveryProofMatchesSession(expected, data.session)) {
    throw new RecoveryOperationOwnerChangedError();
  }
  return {
    userId: expected.userId,
    sessionId: expected.sessionId,
    accessToken: data.session?.access_token ?? null,
  };
}

async function clearRecoveryOperationInsideMutation(
  expected: RecoveryOperationExpectation,
): Promise<void> {
  if (!(await clearRecoveryStateExpectedInsideMutation(expected))) {
    throw new RecoveryOperationOwnerChangedError();
  }
}

/** Recovery-only password mutation. The full callback proof, live session,
 * update, and durable clear share one M critical section. */
export async function updatePasswordForRecovery(
  password: string,
  expected: RecoveryOperationExpectation,
): Promise<{ userId: string }> {
  if (await isPasswordBreached(password)) throw new BreachedPasswordError();
  return runAuthSessionMutation(async () => {
    await recoverySessionExpectationInsideMutation(expected);
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    if (data?.user?.id !== expected.userId) {
      throw new RecoveryOperationOwnerChangedError();
    }
    await clearRecoveryOperationInsideMutation(expected);
    return { userId: expected.userId };
  }, { requireCrossTab: true });
}

async function signOutRecoveryOperation(
  expected: RecoveryOperationExpectation,
): Promise<void> {
  return runAuthSessionMutation(async () => {
    const sessionExpectation = await recoverySessionExpectationInsideMutation(expected);
    const supabase = getSupabaseClient();
    await signOutExpectedSessionInsideMutation(
      supabase.auth,
      sessionExpectation,
      "local",
    );
    await clearRecoveryOperationInsideMutation(expected);
  }, { requireCrossTab: true });
}

export function cancelRecoverySession(
  expected: RecoveryOperationExpectation,
): Promise<void> {
  return signOutRecoveryOperation(expected);
}

export function failClosedRecoverySession(
  expected: RecoveryOperationExpectation,
): Promise<void> {
  return signOutRecoveryOperation(expected);
}

/**
 * The password-update outcomes this app shows distinct copy for. Codes were
 * measured against the live project on 2026-08-10 (QA account): a missing and a
 * WRONG current password both return HTTP 400 with the SAME message text and
 * differ only by `error_code`, so never branch on the message.
 * `reauthentication_needed` comes from auth-js's own error-code list (Secure
 * password change, session older than 24h); it was not reproducible locally.
 */
export type PasswordUpdateFailure =
  | "current_password_required"
  | "current_password_invalid"
  | "reauthentication_needed"
  | "weak_password"
  | "breached_password"
  | "unknown";

export function passwordUpdateFailure(error: unknown): PasswordUpdateFailure {
  // Ours, not GoTrue's: it is thrown before the request goes out and carries no
  // `code`, so it has to be recognised by type or it would fall through to the
  // generic "could not update" toast and read as a server problem.
  if (error instanceof BreachedPasswordError) return "breached_password";
  const code = (error as { code?: unknown } | null)?.code;
  switch (code) {
    case "current_password_required":
    case "current_password_invalid":
    case "reauthentication_needed":
    case "weak_password":
      return code;
    case "reauthentication_not_valid":
      return "reauthentication_needed";
    default:
      return "unknown";
  }
}

export async function captureSignOutExpectation(): Promise<AuthSessionExpectation> {
  const supabase = getSupabaseClient();
  const runtime = getAuthStorageRuntime();
  return captureAuthSessionExpectation(supabase.auth, runtime);
}

export async function signOutExpected(
  expected: AuthSessionExpectation,
  scope: "global" | "local" = "global",
): Promise<void> {
  const supabase = getSupabaseClient();
  await signOutExpectedSession(supabase.auth, getAuthStorageRuntime(), expected, scope);
}

export async function signOutRecoverySession(
  expected: RecoverySessionIdentity,
  scope: "global" | "local" = "local",
): Promise<void> {
  await signOutExpected(
    {
      userId: expected.userId,
      sessionId: expected.sessionId,
      accessToken: null,
    },
    scope,
  );
}

export async function signOutAuthCallbackSession(
  callback: AuthCallbackSession,
  scope: "global" | "local" = "local",
): Promise<boolean> {
  const expected = authCallbackExpectations.get(callback);
  if (!expected) return false;
  await signOutExpected(expected, scope);
  return true;
}

export async function signOut(scope: "global" | "local" = "global"): Promise<void> {
  const expected = await captureSignOutExpectation();
  await signOutExpected(expected, scope);
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
  // A native caller cannot override the fixed HTTPS bridge with a custom
  // scheme. Supabase's production redirect allowlist contains HTTPS URLs only.
  const resolvedRedirectTo = isWeb ? (redirectTo ?? defaultRedirectTo()) : defaultRedirectTo();
  const { data, error } = await runAuthSessionMutation(() =>
    getAuthStorageRuntime().runSdkUnlockedWriter(() =>
      supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: resolvedRedirectTo,
          skipBrowserRedirect: !isWeb,
        },
      }),
    ),
  );
  if (error) throw error;
  if (!isWeb && data.url) {
    return openNativeOAuthSession(data.url, nativeAppReturnUrl("/"));
  }
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
  await runAuthSessionMutation(async () => {
    const supabase = getSupabaseClient();
    const quarantine = createAuthCallbackQuarantine("ordinary");
    await persistAuthCallbackQuarantineInsideMutation(quarantine);
    const { data, error } = await getAuthStorageRuntime().runSdkUnlockedWriter(() =>
      supabase.auth.signInWithIdToken({ provider, token }),
    );
    if (error) {
      await clearAuthCallbackQuarantineExpectedInsideMutation(quarantine);
      throw error;
    }
    const callback = authCallbackSession(data.session, null);
    if (!(await clearAuthCallbackQuarantineExpectedInsideMutation(quarantine))) {
      await failRecoverySessionInsideMutation(
        supabase,
        callback,
        { proof: null, pending: null, quarantine },
        new Error("Native social callback quarantine owner changed before finalization"),
      );
    }
  }, { requireCrossTab: true });
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

  return runAuthSessionMutation(async () => {
    const quarantine = createAuthCallbackQuarantine("ordinary");
    await persistAuthCallbackQuarantineInsideMutation(quarantine);
    const { data: otp, error: otpErr } = await getAuthStorageRuntime().runSdkUnlockedWriter(() =>
      supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: "magiclink",
      }),
    );
    if (otpErr) {
      await clearAuthCallbackQuarantineExpectedInsideMutation(quarantine);
      throw otpErr;
    }
    const callback = authCallbackSession(otp.session, null);
    if (!otp.user) {
      return failRecoverySessionInsideMutation(
        supabase,
        callback,
        { proof: null, pending: null, quarantine },
        new Error("Naver sign-in returned no user."),
      );
    }
    if (!(await clearAuthCallbackQuarantineExpectedInsideMutation(quarantine))) {
      await failRecoverySessionInsideMutation(
        supabase,
        callback,
        { proof: null, pending: null, quarantine },
        new Error("Naver callback quarantine owner changed before finalization"),
      );
    }
    return { userId: otp.user.id };
  }, { requireCrossTab: true });
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
  /**
   * What the user wants to be called (0127, L4). Optional: onboarding must not
   * become a wall, and a nameless account still works everywhere -- the IDEN
   * export has been falling back to 나/You since it was written.
   */
  displayName?: string | null;
}

export interface CompleteProfileResult {
  created: boolean;
  judgeMode: boolean;
}

export async function ensureUserProfile(args: CompleteProfileArgs): Promise<CompleteProfileResult> {
  if (ageInYears(args.birthDate) < MIN_SELF_CONSENT_AGE) throw new AgeGateError();

  return runAuthSessionMutation(async () => {
    const supabase = getSupabaseClient();
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr) throw authErr;
    const user = authData.user;
    if (!user) {
      throw new Error("No authenticated user — complete-profile requires an active OAuth session.");
    }

    // Idempotent: if the profile already exists, we're done. This protects
    // against double-submits and Supabase auth refresh loops.
    const { data: existing } = await supabase
      .from("users")
      .select("id, judge_mode")
      .eq("id", user.id)
      .maybeSingle();
    if (existing) return { created: false, judgeMode: existing.judge_mode === true };

    const judgeMode = false; // see the note above: no email-domain derivation any more
    // Trim to null rather than storing "" — an empty string would count as a
    // filled profile slot and light the star for someone who typed nothing.
    const displayName = args.displayName?.trim() ? args.displayName.trim().slice(0, 40) : null;
    const { error: insertErr } = await supabase.from("users").insert({
      id: user.id,
      email: user.email ?? "",
      birth_date: args.birthDate,
      locale: args.locale,
      display_name: displayName,
    });
    // judge_mode is deliberately NOT sent here either; see the note on the other
    // sign-up path. auto_judge_mode() no longer exists (0138).
    if (insertErr) {
      // A 23505 here has two shapes. (a) users_pkey: our own row won a
      // double-submit race -- re-probe by id and report idempotent success,
      // mirroring signUpWithEmail's defence. (b) users_email_key: the email
      // belongs to ANOTHER auth uid via a different sign-in method. Before
      // this branch existed that session was STRANDED -- authed but unable to
      // ever gain a profile, every retry re-colliding into the same generic
      // "save failed" toast (U6, commerce handoff).
      const { data: raced } = await supabase
        .from("users")
        .select("id, judge_mode")
        .eq("id", user.id)
        .maybeSingle();
      if (raced) return { created: false, judgeMode: raced.judge_mode === true };
      if (isUniqueViolation(insertErr)) throw new EmailInUseError();
      throw insertErr;
    }

    return { created: true, judgeMode };
  });
}
