// Shared stateful logic for the sign-up screen, extracted so the legacy
// (cosmic) and deep-space presentations render IDENTICAL behavior — including
// the C10 age-tier consent ledger and every E2E race fix — from one source.
//
// This is a faithful lift of SignUpLegacy (src/app/(auth)/sign-up.tsx): it
// drives the EXACT submitSignUp(deps) orchestration from sign-up-flow.ts with
// the same deps construction (signUpWithEmail, recordConsentBestEffort via
// buildSignUpConsentArgs, refreshAuth, and the AgeGate/BreachedPassword/
// ExistingAccount discriminators), the same judge-mode welcome hold, and the
// same result→UI mapping. It also owns facebook/github provider dispatch plus
// the real email-confirmation pending state and native callback; the consent
// selections themselves still come from the shared C10 contract.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BackHandler, Platform } from "react-native";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import { useURL } from "expo-linking";

import { useAuth } from "@/lib/auth/AuthContext";
import {
  ageInYears,
  consumeAuthCallbackUrl,
  signUpWithEmail,
  verifySignUpCode,
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
  /** Confirmation email sent to this address; the screen's primary post-submit state. */
  confirmSentTo: string | null;
  /** 6-digit code from the code-only confirmation mail (Gmail buries supabase.co links). */
  confirmCode: string;
  setConfirmCode: (value: string) => void;
  canVerifyConfirmCode: boolean;
  confirmVerifying: boolean;
  handleVerifyConfirmCode: () => Promise<void>;
  // provider visibility
  visibleProviders: OAuthProvider[];
  naverEnabled: boolean;
  // handlers
  handleSubmit: () => Promise<void>;
  handleOAuth: (provider: OAuthProvider) => Promise<void>;
  handleNaver: () => Promise<void>;
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
  // Judge-rehearsal finding #1 (260717): mandatory email confirmation (0086)
  // was announced by a two-word toast reusing signIn.resetSentTitle -- easy to
  // miss, looked like a failed submit. This is the screen's PRIMARY state
  // after a successful sign-up, so it gets a persistent card naming the
  // address, not a transient bar.
  const [confirmSentTo, setConfirmSentTo] = useState<string | null>(null);
  // In-card entry for the mailed 6-digit code. The confirmation template is
  // code-only (deliverability P1: Gmail buries mail carrying supabase.co
  // links), so the code is the primary finish path; it mirrors the
  // reset-password OTP flow (#1013).
  const [confirmCode, setConfirmCode] = useState("");
  const [confirmVerifying, setConfirmVerifying] = useState(false);
  const [consent, setConsent] = useState(emptyConsentSelections());
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";
  const deepLinkUrl = useURL();
  const consumedUrlRef = useRef<string | null>(null);

  useEffect(() => {
    // The confirm-email state is the screen's current status, not a transient
    // success message. Keep it visible until the address changes or the native
    // confirmation callback establishes a session.
    if (!toast || toast.tone === "info") return;
    const timeout = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(timeout);
  }, [toast]);

  // Supabase's detectSessionInUrl handles web confirmation links. Native links
  // need the same token/code consumption used by password recovery. The email
  // redirects to /sign-up, so this hook is mounted for cold and warm app links;
  // after refresh, the guest guard routes the now-authenticated user onward.
  useEffect(() => {
    if (Platform.OS === "web" || !deepLinkUrl || userId) return;
    if (!/[?#&](?:code|access_token|error_code)=/.test(deepLinkUrl)) return;
    if (consumedUrlRef.current === deepLinkUrl) return;
    consumedUrlRef.current = deepLinkUrl;
    consumeAuthCallbackUrl(deepLinkUrl)
      .then(async () => {
        await refresh();
        setToast(null);
        setConfirmSentTo(null);
        setConfirmCode("");
      })
      .catch((e) => {
        setToast({ tone: "danger", message: t("errors.signUpFailed") });
        if (typeof console !== "undefined") {
          console.warn("[auth] confirmation link consume failed", (e as Error).message);
        }
      });
  }, [deepLinkUrl, refresh, t, userId]);

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
  // A valid DOB in the 14-17 band drives the high-privacy notice variant and
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
    // The recovery + confirm cards are keyed to the email they were shown
    // for; editing the address makes them stale, so retire them immediately.
    setExistingAccountHelp((prev) => (prev ? false : prev));
    setConfirmSentTo((prev) => (prev ? null : prev));
    setConfirmCode((prev) => (prev ? "" : prev));
    setToast((prev) => (prev?.tone === "info" ? null : prev));
  }, []);

  // E2E-3/E2E-4: the submit sequencing lives in sign-up-flow.ts (unit-tested).
  // The flow settles the context (refresh) BEFORE returning; this hook only maps
  // results to UI.
  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    setExistingAccountHelp(false);
    try {
      const result = await submitSignUp({
        signUp: () => signUpWithEmail({ email: email.trim(), password, birthDate, locale, consent }),
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
      if (result.kind === "confirmationRequired") {
        // Persistent card with the target address (judge-rehearsal #1); it
        // stays until the address changes or the confirmation callback
        // establishes a session.
        setConfirmSentTo(email);
        setToast(null);
        return;
      }
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

  // Verifies the mailed 6-digit confirmation code (verifySignUpCode). Success
  // establishes the session server-side; refresh() settles the context (the
  // 0086 trigger already created the profile + consent rows on the confirm
  // transition), then the card tears down and the guest guard routes the
  // authenticated user onward -- identical destination to the link path.
  const handleVerifyConfirmCode = useCallback(async () => {
    const target = confirmSentTo;
    const token = confirmCode.trim();
    if (!target || token.length < 6 || confirmVerifying) return;
    setConfirmVerifying(true);
    try {
      await verifySignUpCode(target, token);
      await refresh();
      setToast(null);
      setConfirmSentTo(null);
      setConfirmCode("");
    } catch (e) {
      setToast({ tone: "danger", message: t("signUp.confirmCodeInvalid") });
      if (typeof console !== "undefined") console.warn("[auth] confirm code verify error", (e as Error).message);
    } finally {
      setConfirmVerifying(false);
    }
  }, [confirmCode, confirmSentTo, confirmVerifying, refresh, t]);

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

  // Naver: custom redirect flow (not Supabase-native). Native awaits the
  // browser bridge; web navigates immediately.
  const handleNaver = useCallback(async () => {
    setOauthSubmitting(true);
    try {
      await signInWithNaver();
    } catch (e) {
      setToast({
        tone: "danger",
        message: t("errors.oauthSignUpStartFailed", { provider: "Naver" }),
      });
      if (typeof console !== "undefined") console.warn("[auth] naver oauth error", (e as Error).message);
    } finally {
      setOauthSubmitting(false);
    }
  }, [t]);

  const visibleProviders = useMemo(
    () => SIGN_UP_PROVIDERS.filter((p) => isProviderEnabled(p)),
    [],
  );

  const canVerifyConfirmCode = confirmSentTo !== null && confirmCode.trim().length >= 6 && !confirmVerifying;

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
    confirmSentTo,
    confirmCode,
    setConfirmCode,
    canVerifyConfirmCode,
    confirmVerifying,
    handleVerifyConfirmCode,
    visibleProviders,
    naverEnabled: isNaverEnabled(),
    handleSubmit,
    handleOAuth,
    handleNaver,
  };
}
