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

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { BackHandler, Platform } from "react-native";
import { useTranslation } from "react-i18next";
import { router, useIsFocused } from "expo-router";

import { useAuth } from "@/lib/auth/AuthContext";
import { AuthLockWaitTimeoutError } from "@/lib/auth/session-mutation";
import { createSignInProgress } from "@/lib/auth/sign-in-progress";
import { observeAuthConversion } from "@/lib/analytics/auth-conversions";
import { renderedUiLanguage } from "@/lib/i18n/ui-language";
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

import {
  attachSignInExit, clearSignInExit, createSignInBackHandler,
  detachSignInExit, presentSignInExit,
  replacePresentedSignInExit, type PresentedSignInExit,
} from "./sign-in-back";

import { selectSignInBranch, type SignInBranch } from "./sign-in-branch";
import { replaceSignInToast, type SignInToast } from "./sign-in-toast";
// Reuse the sign-up policy without moving its module across independent fixes.
import { clearSignUpFailure as clearAuthFailure, signUpToastTimeoutMs as authToastTimeoutMs } from "./sign-up-notice";
export type { SignInToastTone, SignInToast } from "./sign-in-toast";

// The Supabase-native providers, in display order. (Re-export for callers/tests.)
export const SIGN_IN_PROVIDERS = SUPABASE_OAUTH_PROVIDERS;
export { isProviderNotEnabledError, startOAuthProvider as startSignInProvider };

const PROVIDER_LABEL = OAUTH_PROVIDER_LABEL;
export const SIGN_IN_LONG_WAIT_MS = 15_000;

export interface UseSignInForm<T = unknown> {
  // session/routing signals
  branch: SignInBranch<T>;
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
  onExitNoticeAttached: (notice: SignInToast) => () => void;
  onExitNoticePresented: (notice: SignInToast) => (() => void) | undefined;
  // reset-password helper UX
  resetHelpVisible: boolean;
  resetSubmitting: boolean;
  resetEmailSentTo: string | null;
  // provider visibility
  visibleProviders: OAuthProvider[];
  naverEnabled: boolean;
  // handlers
  handleSubmit: (onInvalid?: (field: "email" | "password") => void) => Promise<void>;
  handleOAuth: (provider: OAuthProvider) => Promise<void>;
  handleNaver: () => Promise<void>;
  handleForgotPassword: () => Promise<void>;
}

export function useSignInForm<T>(deletionNotice: T | null): UseSignInForm<T> {
  const { t, i18n } = useTranslation(["auth", "common"]);
  const language = renderedUiLanguage(i18n);
  const { userId, loading, refresh } = useAuth();
  const branch = selectSignInBranch({ deletionNotice, loading, userId });
  const isFocused = useIsFocused();
  const isGuestRef = useRef(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [signInTakingLong, setSignInTakingLong] = useState(false);
  const [oauthSubmitting, setOauthSubmitting] = useState(false);
  const [toast, setToastState] = useState<SignInToast | null>(null);
  const toastRef = useRef<SignInToast | null>(null);
  const presentedExitRef = useRef<PresentedSignInExit | null>(null);
  // A requested toast is not a presented toast. Revoke before React renders
  // any replacement; only the attached overlay may acquire a painted deadline.
  const setToast = useCallback((next: SignInToast | null, expected?: SignInToast | null) => {
    next = replaceSignInToast(toastRef.current, next, expected);
    presentedExitRef.current = replacePresentedSignInExit(presentedExitRef.current, toastRef.current, next);
    toastRef.current = next;
    setToastState(next);
  }, []);
  const onExitNoticeAttached = useCallback((notice: SignInToast) => {
    presentedExitRef.current = attachSignInExit(toastRef.current, notice, presentedExitRef.current);
    return () => {
      presentedExitRef.current = detachSignInExit(presentedExitRef.current, notice);
    };
  }, []);
  const onExitNoticePresented = useCallback((notice: SignInToast) => {
    const presented = presentSignInExit(toastRef.current, notice, presentedExitRef.current, Date.now());
    if (!presented || presented.exitOnBackUntil === null) return;
    presentedExitRef.current = presented;
    const duration = Math.max(0, presented.exitOnBackUntil - Date.now());
    const timeout = setTimeout(() => setToast(null, notice), duration);
    return () => clearTimeout(timeout);
  }, [setToast]);
  // Commit branch/focus ownership alongside the layout subscription below.
  // Only home releases it; a late session cannot displace a receipt or loading.
  useLayoutEffect(() => {
    isGuestRef.current = branch.includesNotice && isFocused;
    return () => {
      isGuestRef.current = false;
      clearSignInExit(toastRef.current, setToast);
    };
  }, [branch.includesNotice, isFocused, setToast]);
  const [resetHelpVisible, setResetHelpVisible] = useState(false);
  const [resetSubmitting, setResetSubmitting] = useState(false);
  // Back reads this synchronous count, not a render's busy snapshot. Counting
  // preserves existing submit behavior even if auth writes overlap.
  const actionLockRef = useRef(0);
  const [resetEmailSentTo, setResetEmailSentTo] = useState<string | null>(null);
  // A provider whose OAuth start failed with a "not configured" error is hidden
  // for the rest of the session so the user is not left tapping a dead button.
  const [hiddenProviders, setHiddenProviders] = useState<Set<string>>(new Set());

  const clearFailure = useCallback(() => {
    const current = toastRef.current;
    if (current?.tone === "danger") setToast(clearAuthFailure(current), current);
  }, [setToast]);

  useEffect(() => {
    clearFailure();
  }, [language, clearFailure]);

  const previousBranchKindRef = useRef(branch.kind);
  useEffect(() => {
    const previous = previousBranchKindRef.current;
    previousBranchKindRef.current = branch.kind;
    // A failure belongs to the form that produced it.
    // - Lost focus: retire it, including a result that arrives after the route was covered.
    // - Leaving the form: retire what was on screen, so an old failure is not waiting when it returns.
    // - The receipt and home never hand back to this form, so nothing may wait there either.
    // - Loading is different: a failure that ARRIVES while loading is the answer to the attempt the
    //   user just made. It is kept (the placement hides it there) and shown when the form returns.
    const leftForm = previous === "form" && branch.kind !== "form";
    if (!isFocused || branch.kind === "deletion" || branch.kind === "home") {
      clearFailure();
    } else if (leftForm && toast?.tone === "danger") {
      // Leaving the form retires only what THIS render had on screen. An answer can land between
      // this commit and this effect; it is already in toastRef, and it is the one to keep. The
      // identity guard in setToast skips it (review of #2341, round three).
      setToast(clearAuthFailure(toast), toast);
    }
  }, [isFocused, branch.kind, toast, clearFailure, setToast]);

  useEffect(() => {
    if (!toast || toast.exitOnBack) return;
    const duration = authToastTimeoutMs(toast);
    if (duration === null) return;
    const timeout = setTimeout(() => setToast(null, toast), duration);
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
  // Installation reads render inputs, never the ownership effect's ref. Both
  // finish in layout in either order; changing t must not clear a painted grant.
  useLayoutEffect(() => {
    if (Platform.OS !== "android" || !isFocused || !branch.includesNotice) return;
    const onBackPress = createSignInBackHandler({
      isGuest: () => isGuestRef.current,
      isBusy: () => actionLockRef.current > 0,
      presentedExit: () => presentedExitRef.current,
      hasPendingExit: () => toastRef.current?.exitOnBack === true,
      now: Date.now,
      showNotice: () => setToast({ tone: "info", message: t("signIn.exitOnBack"), exitOnBack: true }),
      exitApp: () => BackHandler.exitApp(),
    });
    const sub = BackHandler.addEventListener("hardwareBackPress", onBackPress);
    return () => sub.remove();
  }, [branch.includesNotice, isFocused, setToast, t]);

  const setEmailAndClearReset = useCallback(
    (value: string) => {
      clearFailure();
      setEmail(value);
      setResetEmailSentTo((prev) => (prev && value.trim() !== prev ? null : prev));
    },
    [clearFailure],
  );

  const setPasswordAndClearFailure = useCallback((value: string) => {
    clearFailure();
    setPassword(value);
  }, [clearFailure]);

  const toggleShowPassword = useCallback(() => setShowPassword((v) => !v), []);

  const handleOAuth = useCallback(
    async (provider: OAuthProvider) => {
      if (actionLockRef.current > 0) return;
      clearFailure();
      setOauthSubmitting(true);
      actionLockRef.current += 1;
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
        actionLockRef.current -= 1;
        setOauthSubmitting(false);
      }
    },
    [t, setToast, clearFailure],
  );

  // Naver uses a custom web redirect (not Supabase-native), so it has its own
  // handler. isNaverEnabled() keeps it hidden on native.
  const handleNaver = useCallback(async () => {
    if (actionLockRef.current > 0) return;
    clearFailure();
    setOauthSubmitting(true);
    actionLockRef.current += 1;
    try {
      await signInWithNaver();
    } catch (e) {
      setToast({
        tone: "danger",
        message: t("errors.oauthSignInStartFailed", { provider: "Naver" }),
      });
      if (typeof console !== "undefined") console.warn("[auth] naver oauth error", (e as Error).message);
    } finally {
      actionLockRef.current -= 1;
      setOauthSubmitting(false);
    }
  }, [t, setToast, clearFailure]);

  const handleSubmit = useCallback(async (onInvalid?: (field: "email" | "password") => void) => {
    if (actionLockRef.current > 0) return;
    clearFailure();
    if (!email.trim().includes("@")) {
      setToast({ tone: "danger", message: t("signIn.resetToast") });
      onInvalid?.("email");
      return;
    }
    if (password.length === 0) {
      setToast({ tone: "danger", message: t("errors.signInFailed") });
      onInvalid?.("password");
      return;
    }
    setSubmitting(true);
    const progress = Platform.OS === "web"
      ? createSignInProgress((stage, elapsedMs) => {
          if (typeof console !== "undefined") {
            console.warn(`[auth] sign-in pending: ${stage} (${elapsedMs}ms)`);
          }
        })
      : null;
    actionLockRef.current += 1;
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
      if (typeof console !== "undefined") console.warn("[auth] signIn error");
    } finally {
      actionLockRef.current -= 1;
      progress?.finish();
      setSubmitting(false);
    }
  }, [email, password, refresh, t, setToast, clearFailure]);

  const handleForgotPassword = useCallback(async () => {
    if (actionLockRef.current > 0) return;
    clearFailure();
    setResetHelpVisible(true);
    setResetEmailSentTo(null);
    const resetEmail = email.trim();
    if (!resetEmail.includes("@")) {
      setToast({ tone: "info", message: t("signIn.resetToast") });
      return;
    }
    setResetSubmitting(true);
    actionLockRef.current += 1;
    try {
      await sendPasswordResetEmail(resetEmail);
      setResetEmailSentTo(resetEmail);
      setToast({ tone: "success", message: t("signIn.resetSentToast") });
    } catch {
      setToast({ tone: "danger", message: t("errors.passwordResetFailed") });
      if (typeof console !== "undefined") console.warn("[auth] password reset email error");
    } finally {
      actionLockRef.current -= 1;
      setResetSubmitting(false);
    }
  }, [email, t, setToast, clearFailure]);

  const canSubmit = email.includes("@") && password.length > 0 && !submitting;

  const visibleProviders = useMemo(
    () => SIGN_IN_PROVIDERS.filter((p) => isProviderEnabled(p) && !hiddenProviders.has(p)),
    [hiddenProviders],
  );

  return {
    branch,
    email,
    setEmail: setEmailAndClearReset,
    password,
    setPassword: setPasswordAndClearFailure,
    showPassword,
    toggleShowPassword,
    submitting,
    signInTakingLong,
    oauthSubmitting,
    canSubmit,
    toast,
    onExitNoticeAttached,
    onExitNoticePresented,
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
