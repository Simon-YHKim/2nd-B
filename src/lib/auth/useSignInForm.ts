// Shared stateful logic for the sign-in screen, extracted so the legacy
// (cosmic) and deep-space presentations render IDENTICAL behavior from one
// source. The hook owns email/password state, OAuth start (with the session
// "hide a not-configured provider" behavior), the password-reset helper, the
// guest-only routing signals, and the hardware-Back contract. It returns state
// + handlers only — no JSX — so a presentation layer can lay it out freely.
//
// Behavior here is a faithful lift of the original SignInLegacy component
// (src/app/(auth)/sign-in.tsx); the only addition is facebook/github in the
// provider set (same signInWithProvider path as google).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BackHandler, Platform } from "react-native";
import { useTranslation } from "react-i18next";
import { router, useFocusEffect } from "expo-router";

import { useAuth } from "@/lib/auth/AuthContext";
import { AuthLockWaitTimeoutError } from "@/lib/auth/session-mutation";
import { createSignInProgress } from "@/lib/auth/sign-in-progress";
import { observeAuthConversion } from "@/lib/analytics/auth-conversions";
import {
  isNaverEnabled,
  isProviderEnabled,
  sendPasswordResetEmail,
  signInWithEmail,
  signInWithNaver,
  type OAuthProvider,
} from "@/lib/supabase/auth";
import {
  OAUTH_PROVIDER_LABEL,
  SUPABASE_OAUTH_PROVIDERS,
  isProviderNotEnabledError,
  startOAuthProvider,
} from "@/lib/auth/auth-providers";

import { SIGN_IN_TOAST_DURATION_MS, createSignInBackHandler } from "./sign-in-back";

export type SignInToastTone = "info" | "success" | "danger";
export type SignInToast = { message: string; tone: SignInToastTone; exitOnBackUntil?: number };

// The Supabase-native providers, in display order. (Re-export for callers/tests.)
export const SIGN_IN_PROVIDERS = SUPABASE_OAUTH_PROVIDERS;
export { isProviderNotEnabledError, startOAuthProvider as startSignInProvider };

const PROVIDER_LABEL = OAUTH_PROVIDER_LABEL;
export const SIGN_IN_LONG_WAIT_MS = 15_000;

export interface UseSignInForm {
  // session/routing signals
  loading: boolean;
  userId: string | null;
  // form state
  email: string;
  setEmail: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  showPassword: boolean;
  toggleShowPassword: () => void;
  submitting: boolean;
  signInTakingLong: boolean;
  oauthSubmitting: boolean;
  canSubmit: boolean;
  toast: SignInToast | null;
  // reset-password helper UX
  resetHelpVisible: boolean;
  resetSubmitting: boolean;
  resetEmailSentTo: string | null;
  // provider visibility
  visibleProviders: OAuthProvider[];
  naverEnabled: boolean;
  // handlers
  handleSubmit: () => Promise<void>;
  handleOAuth: (provider: OAuthProvider) => Promise<void>;
  handleNaver: () => Promise<void>;
  handleForgotPassword: () => Promise<void>;
}

export function useSignInForm(): UseSignInForm {
  const { t } = useTranslation(["auth", "common"]);
  const { userId, loading, refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [signInTakingLong, setSignInTakingLong] = useState(false);
  const [oauthSubmitting, setOauthSubmitting] = useState(false);
  const [toast, setToastState] = useState<SignInToast | null>(null);
  const toastRef = useRef<SignInToast | null>(null);
  // Keep the visible toast and Back ownership together, including same-frame
  // replacements by an auth error before React has rendered the next message.
  const setToast = useCallback((next: SignInToast | null) => {
    toastRef.current = next;
    setToastState(next);
  }, []);
  const [resetHelpVisible, setResetHelpVisible] = useState(false);
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetEmailSentTo, setResetEmailSentTo] = useState<string | null>(null);
  // A provider whose OAuth start failed with a "not configured" error is hidden
  // for the rest of the session so the user is not left tapping a dead button.
  const [hiddenProviders, setHiddenProviders] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!toast) return;
    const duration = toast.exitOnBackUntil === undefined
      ? SIGN_IN_TOAST_DURATION_MS
      : Math.max(0, toast.exitOnBackUntil - Date.now());
    const timeout = setTimeout(() => setToast(null), duration);
    return () => clearTimeout(timeout);
  }, [toast, setToast]);

  useEffect(() => {
    if (!submitting) {
      setSignInTakingLong(false);
      return;
    }
    // Keep the original auth operation and the screen's action lock alive. A
    // late SDK writer may still persist a session, so this is guidance only.
    const timer = setTimeout(() => setSignInTakingLong(true), SIGN_IN_LONG_WAIT_MS);
    return () => clearTimeout(timer);
  }, [submitting]);

  // D2 (Simon 2026-10-10): only the focused Android login gate owns Back.
  // The deadline also dismisses the existing toast; an unrelated toast never
  // grants exit. Leaving this screen disarms the prompt even if it stays mounted.
  useFocusEffect(useCallback(() => {
    if (Platform.OS !== "android" || userId) return;
    const onBackPress = createSignInBackHandler({
      isBusy: () => submitting || oauthSubmitting || resetSubmitting,
      exitDeadline: () => toastRef.current?.exitOnBackUntil,
      now: Date.now,
      showNotice: (expiresAt) => setToast({ tone: "info", message: t("signIn.exitOnBack"), exitOnBackUntil: expiresAt }),
      exitApp: () => BackHandler.exitApp(),
    });
    const sub = BackHandler.addEventListener("hardwareBackPress", onBackPress);
    return () => {
      sub.remove();
      if (toastRef.current?.exitOnBackUntil !== undefined) setToast(null);
    };
  }, [userId, submitting, oauthSubmitting, resetSubmitting, setToast, t]));

  const setEmailAndClearReset = useCallback(
    (value: string) => {
      setEmail(value);
      setResetEmailSentTo((prev) => (prev && value.trim() !== prev ? null : prev));
    },
    [],
  );

  const toggleShowPassword = useCallback(() => setShowPassword((v) => !v), []);

  const handleOAuth = useCallback(
    async (provider: OAuthProvider) => {
      setOauthSubmitting(true);
      try {
        await startOAuthProvider(provider);
      } catch (e) {
        const msg = (e as Error).message ?? "";
        // A provider that is not configured in Supabase fails to even start with
        // a "provider is not enabled" error. Hide its button for the session so
        // the user is not left tapping a dead control; email/password and any
        // working provider remain.
        if (isProviderNotEnabledError(msg)) {
          setHiddenProviders((prev) => new Set(prev).add(provider));
        }
        setToast({
          tone: "danger",
          message: t("errors.oauthSignInStartFailed", { provider: PROVIDER_LABEL[provider] }),
        });
        if (typeof console !== "undefined") console.warn(`[auth] ${provider} oauth error`, msg);
      } finally {
        setOauthSubmitting(false);
      }
    },
    [t, setToast],
  );

  // Naver uses a custom web redirect (not Supabase-native), so it has its own
  // handler. isNaverEnabled() keeps it hidden on native.
  const handleNaver = useCallback(async () => {
    setOauthSubmitting(true);
    try {
      await signInWithNaver();
    } catch (e) {
      setToast({
        tone: "danger",
        message: t("errors.oauthSignInStartFailed", { provider: "Naver" }),
      });
      if (typeof console !== "undefined") console.warn("[auth] naver oauth error", (e as Error).message);
    } finally {
      setOauthSubmitting(false);
    }
  }, [t, setToast]);

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    const progress = Platform.OS === "web"
      ? createSignInProgress((stage, elapsedMs) => {
          if (typeof console !== "undefined") {
            console.warn(`[auth] sign-in pending: ${stage} (${elapsedMs}ms)`);
          }
        })
      : null;
    try {
      const result = await signInWithEmail(email.trim(), password, progress?.mark);
      progress?.mark("session-refresh");
      await refresh();
      progress?.mark("route");
      void observeAuthConversion(result.userId, "login", "email");
      // AuthContext picks up the new session; IntroGate plays the cell
      // LoadingScreen and then mounts the Stack. Route to /index so the
      // post-loading hand-off lands on the graph view (the new main).
      router.replace("/");
    } catch (e) {
      // Generic message to avoid email-enumeration. CSO finding R3.
      setToast({
        tone: "danger",
        message: e instanceof AuthLockWaitTimeoutError
          ? t("errors.signInBusy")
          : t("errors.signInFailed"),
      });
      if (typeof console !== "undefined") console.warn("[auth] signIn error", (e as Error).message);
    } finally {
      progress?.finish();
      setSubmitting(false);
    }
  }, [email, password, refresh, t, setToast]);

  const handleForgotPassword = useCallback(async () => {
    setResetHelpVisible(true);
    setResetEmailSentTo(null);
    const resetEmail = email.trim();
    if (!resetEmail.includes("@")) {
      setToast({ tone: "info", message: t("signIn.resetToast") });
      return;
    }
    setResetSubmitting(true);
    try {
      await sendPasswordResetEmail(resetEmail);
      setResetEmailSentTo(resetEmail);
      setToast({ tone: "success", message: t("signIn.resetSentToast") });
    } catch (e) {
      setToast({ tone: "danger", message: t("errors.passwordResetFailed") });
      if (typeof console !== "undefined") console.warn("[auth] password reset email error", (e as Error).message);
    } finally {
      setResetSubmitting(false);
    }
  }, [email, t, setToast]);

  const canSubmit = email.includes("@") && password.length > 0 && !submitting;

  const visibleProviders = useMemo(
    () => SIGN_IN_PROVIDERS.filter((p) => isProviderEnabled(p) && !hiddenProviders.has(p)),
    [hiddenProviders],
  );

  return {
    loading,
    userId,
    email,
    setEmail: setEmailAndClearReset,
    password,
    setPassword,
    showPassword,
    toggleShowPassword,
    submitting,
    signInTakingLong,
    oauthSubmitting,
    canSubmit,
    toast,
    resetHelpVisible,
    resetSubmitting,
    resetEmailSentTo,
    visibleProviders,
    naverEnabled: isNaverEnabled(),
    handleSubmit,
    handleOAuth,
    handleNaver,
    handleForgotPassword,
  };
}
