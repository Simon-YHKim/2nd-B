// Shared stateful logic for the sign-up screen, extracted so the legacy
// (cosmic) and deep-space presentations render IDENTICAL behavior — including
// the C10 age-tier consent ledger and every E2E race fix — from one source.
//
// This is a faithful lift of SignUpLegacy (src/app/(auth)/sign-up.tsx): it
// drives the EXACT submitSignUp(deps) orchestration from sign-up-flow.ts with
// the same deps construction (signUpWithEmail, recordConsentBestEffort via
// buildSignUpConsentArgs, refreshAuth, and the AgeGate/BreachedPassword/
// ExistingAccount discriminators), the same judge-mode welcome hold, and the
// same result→UI mapping. The only addition is facebook/github in the OAuth
// provider set (same signInWithProvider path as google). The consent ledger
// logic is untouched.

import { useCallback, useEffect, useMemo, useState } from "react";
import { BackHandler } from "react-native";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";

import { useAuth } from "@/lib/auth/AuthContext";
import {
  ageInYears,
  signUpWithEmail,
  isNaverEnabled,
  isProviderEnabled,
  signInWithNaver,
  AgeGateError,
  BreachedPasswordError,
  ExistingAccountLikelyError,
  MIN_SELF_CONSENT_AGE,
  type OAuthProvider,
} from "@/lib/supabase/auth";
import { isJudgeEmail } from "@/lib/judge/domains";
import {
  emptyConsentSelections,
  allRequiredAcksChecked,
  buildSignUpConsentArgs,
  type ConsentSelections,
} from "@/lib/auth/consent-selections";
import { submitSignUp } from "@/lib/auth/sign-up-flow";
import { recordConsentBestEffort } from "@/lib/supabase/consent";
import {
  OAUTH_PROVIDER_LABEL,
  SUPABASE_OAUTH_PROVIDERS,
  startOAuthProvider,
} from "@/lib/auth/auth-providers";

const ADULT_AGE = 18;

export type SignUpToastTone = "info" | "success" | "danger";
export type SignUpToast = { message: string; tone: SignUpToastTone };

// The Supabase-native providers, in display order. (Re-export for callers/tests.)
export const SIGN_UP_PROVIDERS = SUPABASE_OAUTH_PROVIDERS;
export { startOAuthProvider as startSignUpProvider };

const PROVIDER_LABEL = OAUTH_PROVIDER_LABEL;

export interface UseSignUpForm {
  // session/routing signals
  loading: boolean;
  userId: string | null;
  submitting: boolean;
  judgeWelcome: boolean;
  toast: SignUpToast | null;
  // form state
  email: string;
  setEmail: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  birthDate: string;
  setBirthDate: (value: string) => void;
  consent: ConsentSelections;
  setConsent: (next: ConsentSelections) => void;
  // derived
  judge: boolean;
  isMinorAge: boolean;
  canSubmit: boolean;
  oauthSubmitting: boolean;
  existingAccountHelp: boolean;
  // provider visibility
  visibleProviders: OAuthProvider[];
  naverEnabled: boolean;
  // handlers
  handleSubmit: () => Promise<void>;
  handleOAuth: (provider: OAuthProvider) => Promise<void>;
  handleNaver: () => void;
}

export function useSignUpForm(): UseSignUpForm {
  const { t, i18n } = useTranslation(["auth", "common"]);
  const { userId, loading, refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [oauthSubmitting, setOauthSubmitting] = useState(false);
  // Judge accounts (C6) get a 900ms welcome toast before entering; this flag
  // holds the guest guard open until the delayed router.replace runs.
  const [judgeWelcome, setJudgeWelcome] = useState(false);
  const [toast, setToast] = useState<SignUpToast | null>(null);
  // J3: persistent recovery card for the likely-already-registered shape.
  const [existingAccountHelp, setExistingAccountHelp] = useState(false);
  const [consent, setConsent] = useState(emptyConsentSelections());
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";

  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(timeout);
  }, [toast]);

  // Stage 3 (O-31): hardware Back on the auth gate returns to the constellation
  // home instead of exiting the app (no dead-end). Web uses the browser back.
  useEffect(() => {
    const onBackPress = () => {
      router.push("/");
      return true;
    };
    const sub = BackHandler.addEventListener("hardwareBackPress", onBackPress);
    return () => sub.remove();
  }, []);

  const judge = useMemo(() => isJudgeEmail(email), [email]);
  // A valid DOB in the 16-17 band drives the high-privacy notice variant and
  // the minor_self consent band.
  const age = ageInYears(birthDate);
  const isMinorAge = age >= MIN_SELF_CONSENT_AGE && age < ADULT_AGE;

  const canSubmit = useMemo(() => {
    return (
      email.includes("@") &&
      password.length >= 8 &&
      ageInYears(birthDate) >= MIN_SELF_CONSENT_AGE &&
      allRequiredAcksChecked(consent) &&
      !submitting &&
      // R3: the email submit must cross-disable against an opening OAuth browser
      // so two concurrent auth flows can't race the same guard.
      !oauthSubmitting
    );
  }, [email, password, birthDate, consent, submitting, oauthSubmitting]);

  const setEmailAndClearHelp = useCallback((value: string) => {
    setEmail(value);
    // The recovery card is keyed to the email that failed; editing the address
    // makes it stale, so retire it immediately.
    setExistingAccountHelp((prev) => (prev ? false : prev));
  }, []);

  // E2E-3/E2E-4: the submit sequencing lives in sign-up-flow.ts (unit-tested).
  // The flow settles the context (refresh) BEFORE returning; this hook only maps
  // results to UI.
  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    setExistingAccountHelp(false);
    try {
      const result = await submitSignUp({
        signUp: () => signUpWithEmail({ email: email.trim(), password, birthDate, locale }),
        // Record the consent the user just gave. Awaited BEFORE navigating: on
        // web a router.replace tears down the page and cancels an in-flight
        // fire-and-forget request, which could silently drop the PIPA consent
        // row. Still best-effort -- a write failure logs at error level and must
        // not undo a created account; pre-migration it no-ops.
        recordConsent: (newUserId) =>
          recordConsentBestEffort(
            buildSignUpConsentArgs({ userId: newUserId, isMinor: isMinorAge, locale, selections: consent }),
          ),
        refreshAuth: refresh,
        isAgeGateError: (e) => e instanceof AgeGateError,
        isBreachedPasswordError: (e) => e instanceof BreachedPasswordError,
        isExistingAccountLikelyError: (e) => e instanceof ExistingAccountLikelyError,
      });
      if (result.kind === "entered") {
        if (result.judgeMode) {
          setJudgeWelcome(true); // hold the guest guard open for the toast
          setToast({ tone: "success", message: t("judge.welcome") });
          setTimeout(() => router.replace("/"), 900);
          return;
        }
        // Post-signup hand-off → graph view (main).
        router.replace("/");
        return;
      }
      if (result.kind === "ageGate") {
        setToast({ tone: "danger", message: t("errors.ageGate") });
        return;
      }
      if (result.kind === "breachedPassword") {
        setToast({ tone: "danger", message: t("errors.breachedPassword") });
        return;
      }
      if (result.kind === "maybeExistingAccount") {
        // J3: persistent card (not a toast) with the recovery path. The copy is
        // conditional — we never confirm the email exists (CSO R3).
        setExistingAccountHelp(true);
        return;
      }
      setToast({ tone: "danger", message: t("errors.signUpFailed") });
      if (typeof console !== "undefined") console.warn("[auth] signUp error", result.message);
    } finally {
      setSubmitting(false);
    }
  }, [email, password, birthDate, locale, isMinorAge, consent, refresh, t]);

  // Social sign-up: the OAuth flow creates the auth user, then /complete-profile
  // collects date of birth (C10) and records consent — so the age gate + consent
  // ledger still apply to provider sign-ups, just at the post-redirect step.
  const handleOAuth = useCallback(
    async (provider: OAuthProvider) => {
      setOauthSubmitting(true);
      try {
        await startOAuthProvider(provider);
      } catch (e) {
        const msg = (e as Error).message ?? "";
        setToast({
          tone: "danger",
          message: t("errors.oauthSignUpStartFailed", { provider: PROVIDER_LABEL[provider] }),
        });
        if (typeof console !== "undefined") console.warn(`[auth] ${provider} oauth error`, msg);
      } finally {
        setOauthSubmitting(false);
      }
    },
    [t],
  );

  // Naver: custom redirect flow (not Supabase-native). Navigates to Naver.
  const handleNaver = useCallback(() => {
    try {
      signInWithNaver();
    } catch (e) {
      setToast({
        tone: "danger",
        message: t("errors.oauthSignUpStartFailed", { provider: "Naver" }),
      });
      if (typeof console !== "undefined") console.warn("[auth] naver oauth error", (e as Error).message);
    }
  }, [t]);

  const visibleProviders = useMemo(
    () => SIGN_UP_PROVIDERS.filter((p) => isProviderEnabled(p)),
    [],
  );

  return {
    loading,
    userId,
    submitting,
    judgeWelcome,
    toast,
    email,
    setEmail: setEmailAndClearHelp,
    password,
    setPassword,
    birthDate,
    setBirthDate,
    consent,
    setConsent,
    judge,
    isMinorAge,
    canSubmit,
    oauthSubmitting,
    existingAccountHelp,
    visibleProviders,
    naverEnabled: isNaverEnabled(),
    handleSubmit,
    handleOAuth,
    handleNaver,
  };
}
