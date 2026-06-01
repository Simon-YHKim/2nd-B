// C6/C10: client-side guards for sign-up.
// DB-level CHECK in 0028_minor_consent.sql (users_birth_date_sane) is the
// second line of defense.

import dayjs from "dayjs";
import { isJudgeEmail } from "../judge/domains";
import { getSupabaseClient } from "./client";

// C10 age tiers: 18+ adults and 14-17 minors self-consent and register
// directly. Under PIPA, legal-representative consent is mandatory only below 14
// (Article 22-2); users 14+ may consent themselves under the general provisions
// (Articles 15/17/22) with age-appropriate notice. Under 14 requires verifiable
// guardian consent (added in a later PR); until then they are blocked here.
export const MIN_SELF_CONSENT_AGE = 14;

export class AgeGateError extends Error {
  constructor() {
    super("Users under 14 cannot register without guardian consent.");
    this.name = "AgeGateError";
  }
}

// birthDate format: ISO date (YYYY-MM-DD), UTC interpretation. Returns whole
// years elapsed. The sign-up floor (MIN_SELF_CONSENT_AGE = 14) is applied by
// the callers above; the DB no longer hard-codes an age CHECK (0028 relaxed the
// flat 18+ rule to a sanity range).
export function ageInYears(birthDate: string, now: Date = new Date()): number {
  const b = dayjs(birthDate);
  if (!b.isValid()) return -1;
  return dayjs(now).diff(b, "year");
}

export interface SignUpArgs {
  email: string;
  password: string;
  birthDate: string; // YYYY-MM-DD
  locale?: "en" | "ko";
}

export interface SignUpResult {
  userId: string;
  judgeMode: boolean;
}

export async function signUpWithEmail(args: SignUpArgs): Promise<SignUpResult> {
  if (ageInYears(args.birthDate) < MIN_SELF_CONSENT_AGE) throw new AgeGateError();

  const supabase = getSupabaseClient();
  const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
    email: args.email,
    password: args.password,
  });
  if (signUpErr) throw signUpErr;

  // The project keeps GoTrue's "confirm email" enabled, but migration 0018
  // installs an auth.users auto-confirm trigger so the free-tier flow (no SMTP
  // configured) is not a dead end. signUp() therefore returns no session; we
  // sign in immediately to obtain an authenticated session BEFORE the profile
  // INSERT, because RLS policy users_self_insert requires auth.uid() = id.
  // If the project later disables confirmation, signUp() returns a session
  // directly and the sign-in step is skipped.
  let session = signUpData.session;
  let user = signUpData.user;
  if (!session) {
    const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
      email: args.email,
      password: args.password,
    });
    if (signInErr) throw signInErr;
    session = signInData.session;
    user = signInData.user;
  }
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
  if (insertErr) throw insertErr;

  return { userId: user.id, judgeMode };
}

export async function signInWithEmail(email: string, password: string): Promise<{ userId: string }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (!data.user) throw new Error("Sign-in returned no user");
  return { userId: data.user.id };
}

export async function signOut(): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getCurrentUserId(): Promise<string | null> {
  const supabase = getSupabaseClient();
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

// --- OAuth (Google native) -----------------------------------------------
//
// Native iOS/Android builds (Sprint 1+) will need a deep-link scheme; for
// Expo Web on GitHub Pages we redirect back to the current origin. The
// Supabase project must have Google enabled and the redirect URL allowed
// in the Auth → URL Configuration page.

export interface OAuthRedirect {
  url: string;
}

function defaultRedirectTo(): string | undefined {
  if (typeof window === "undefined") return undefined;
  // ALWAYS return to the app root, not window.location.pathname.
  // If the user clicked Google from /sign-in, using pathname would
  // send them back to /sign-in post-OAuth — they'd see the sign-in
  // form again after authenticating. Routing through the root lets
  // IntroGate play the cell loader and /index decide where the
  // signed-in user actually belongs (/complete-profile or graph).
  //
  // expo-router base path is '/2nd-B/' on GitHub Pages, '/' in dev.
  // Detect by looking at the current pathname's prefix.
  const path = window.location.pathname;
  const base = path.startsWith("/2nd-B/") ? "/2nd-B/" : "/";
  return `${window.location.origin}${base}`;
}

export async function signInWithGoogle(redirectTo?: string): Promise<OAuthRedirect | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: redirectTo ?? defaultRedirectTo() },
  });
  if (error) throw error;
  // On Web, Supabase navigates the page directly; data.url is informational.
  // On native we'd open data.url via expo-web-browser — that path lands when
  // native builds come online.
  return data.url ? { url: data.url } : null;
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

export async function hasUserProfile(): Promise<boolean> {
  const supabase = getSupabaseClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;
  if (!user) return false;
  const { data, error } = await supabase.from("users").select("id").eq("id", user.id).maybeSingle();
  if (error) {
    // Network or RLS failure — caller should treat unknown as "needs sign-in".
    if (typeof console !== "undefined") console.warn("[auth] hasUserProfile failed", error.message);
    return false;
  }
  return data !== null;
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
  const { data: existing } = await supabase.from("users").select("id").eq("id", user.id).maybeSingle();
  if (existing) return { created: false, judgeMode: false };

  const judgeMode = isJudgeEmail(user.email ?? "");
  const { error: insertErr } = await supabase.from("users").insert({
    id: user.id,
    email: user.email ?? "",
    birth_date: args.birthDate,
    judge_mode: judgeMode,
    locale: args.locale,
  });
  // C6: the auto_judge_mode BEFORE INSERT trigger overrides the client value.
  if (insertErr) throw insertErr;

  return { created: true, judgeMode };
}
