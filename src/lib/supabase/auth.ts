// C6/C10: client-side guards for sign-up.
// DB-level CHECK constraint in 0002_users.sql is the second line of defense.

import dayjs from "dayjs";
import { isJudgeEmail } from "../judge/domains";
import { getSupabaseClient } from "./client";

export class AgeGateError extends Error {
  constructor() {
    super("Users under 18 are not permitted.");
    this.name = "AgeGateError";
  }
}

// birthDate format: ISO date (YYYY-MM-DD), UTC interpretation.
// Equivalent to the SQL CHECK: birth_date <= (current_date - interval '18 years').
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
  if (ageInYears(args.birthDate) < 18) throw new AgeGateError();

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
