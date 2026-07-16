// Shared stateful logic for the reset-password screen, extracted so the legacy
// (cosmic) and deep-space presentations render IDENTICAL behavior from one
// source. Faithful lift of ResetPasswordLegacy (src/app/(auth)/reset-password.tsx):
// it owns the new/confirm password state, the helper-key derivation, the
// updatePassword submit + UX states (complete / error toast), and the native
// recovery deep-link consumption (consumeAuthCallbackUrl) that establishes the
// recovery session so userId flips the form on.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";
import { useTranslation } from "react-i18next";
import { useURL } from "expo-linking";
import { useLocalSearchParams } from "expo-router";

import { useAuth } from "@/lib/auth/AuthContext";
import {
  consumeAuthCallbackUrl,
  sendPasswordResetEmail,
  updatePassword,
  verifyPasswordResetCode,
} from "@/lib/supabase/auth";
import { resetHelperKey, resetStep, type ResetStep } from "@/lib/auth/reset-password-helpers";

export type ResetToastTone = "info" | "success" | "danger";
export type ResetToast = { message: string; tone: ResetToastTone };

export { resetHelperKey };
export type { ResetStep };

const RESEND_COOLDOWN_SECONDS = 60;

export interface UseResetPasswordForm {
  // session/routing signals
  loading: boolean;
  userId: string | null;
  /** Which phase the screen shows: request -> verify -> password -> done. */
  step: ResetStep;
  // request + verify state (flow request #5: the in-screen code path)
  email: string;
  setEmail: (value: string) => void;
  canSendCode: boolean;
  sendSubmitting: boolean;
  /** Seconds until the code can be re-sent (0 = allowed now). */
  resendSeconds: number;
  handleSendCode: () => Promise<void>;
  code: string;
  setCode: (value: string) => void;
  canVerify: boolean;
  verifying: boolean;
  handleVerifyCode: () => Promise<void>;
  // form state
  password: string;
  setPassword: (value: string) => void;
  confirmPassword: string;
  setConfirmPassword: (value: string) => void;
  submitting: boolean;
  complete: boolean;
  toast: ResetToast | null;
  /** i18n key for the helper line (helper / too-short / mismatch). */
  helperKey: string;
  canSubmit: boolean;
  // handlers
  handleSubmit: () => Promise<void>;
}

export function useResetPasswordForm(): UseResetPasswordForm {
  const { t } = useTranslation("auth");
  const { userId, loading } = useAuth();
  // Sign-in's "비밀번호를 잊었어요" hands the typed address over so the user
  // does not retype it; a direct visit starts blank.
  const { email: emailParam } = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(typeof emailParam === "string" ? emailParam : "");
  const [codeSent, setCodeSent] = useState(false);
  const [sendSubmitting, setSendSubmitting] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [complete, setComplete] = useState(false);
  const [toast, setToast] = useState<ResetToast | null>(null);

  const helperKey = useMemo(() => resetHelperKey(password, confirmPassword), [confirmPassword, password]);

  // Resend cooldown ticker. Keyed on the boolean so the interval is created
  // once per countdown, not once per second; cleared on unmount
  // (ANDROID_QA_GUIDELINES — no leaked timers).
  const counting = resendSeconds > 0;
  useEffect(() => {
    if (!counting) return;
    const h = setInterval(() => setResendSeconds((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(h);
  }, [counting]);

  const handleSendCode = useCallback(async () => {
    const target = email.trim();
    if (!target.includes("@") || sendSubmitting || resendSeconds > 0) return;
    setSendSubmitting(true);
    try {
      await sendPasswordResetEmail(target);
      setCodeSent(true);
      setResendSeconds(RESEND_COOLDOWN_SECONDS);
      setToast({ tone: "success", message: t("resetPassword.codeSentToast") });
    } catch (e) {
      // Same enumeration-safe wording either way (CSO R3): the toast never says
      // whether the address exists.
      setToast({ tone: "danger", message: t("errors.passwordResetFailed") });
      if (typeof console !== "undefined") console.warn("[auth] reset code send error", (e as Error).message);
    } finally {
      setSendSubmitting(false);
    }
  }, [email, resendSeconds, sendSubmitting, t]);

  const handleVerifyCode = useCallback(async () => {
    const token = code.trim();
    if (token.length < 6 || verifying) return;
    setVerifying(true);
    try {
      // Success lands the recovery session; AuthContext flips userId and the
      // screen advances to the password step by itself.
      await verifyPasswordResetCode(email, token);
    } catch (e) {
      setToast({ tone: "danger", message: t("resetPassword.codeInvalid") });
      if (typeof console !== "undefined") console.warn("[auth] reset code verify error", (e as Error).message);
    } finally {
      setVerifying(false);
    }
  }, [code, email, verifying, t]);

  // Native: the recovery email's deep link carries the session tokens, but
  // detectSessionInUrl is web-only — without consuming the URL here the screen
  // always dead-ends at "expired". useURL covers both the cold-start initial URL
  // and a warm-app link event; AuthContext picks up the resulting session and
  // userId flips the form on.
  const deepLinkUrl = useURL();
  const consumedUrlRef = useRef<string | null>(null);
  useEffect(() => {
    if (Platform.OS === "web" || !deepLinkUrl || userId) return;
    if (consumedUrlRef.current === deepLinkUrl) return;
    consumedUrlRef.current = deepLinkUrl;
    consumeAuthCallbackUrl(deepLinkUrl).catch((e) => {
      if (typeof console !== "undefined") console.warn("[auth] recovery link consume failed", (e as Error).message);
    });
  }, [deepLinkUrl, userId]);

  const handleSubmit = useCallback(async () => {
    if (password.length < 8 || confirmPassword !== password || submitting) return;
    setSubmitting(true);
    try {
      await updatePassword(password);
      setPassword("");
      setConfirmPassword("");
      setComplete(true);
      setToast({ tone: "success", message: t("resetPassword.successToast") });
    } catch (e) {
      setToast({ tone: "danger", message: t("errors.passwordUpdateFailed") });
      if (typeof console !== "undefined") console.warn("[auth] password update error", (e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }, [password, confirmPassword, submitting, t]);

  const canSubmit = userId !== null && password.length >= 8 && confirmPassword === password && !submitting;
  const canSendCode = email.trim().includes("@") && !sendSubmitting && resendSeconds === 0;
  const canVerify = code.trim().length >= 6 && !verifying;
  const step = resetStep({ userId, complete, codeSent });

  return {
    loading,
    userId,
    step,
    email,
    setEmail,
    canSendCode,
    sendSubmitting,
    resendSeconds,
    handleSendCode,
    code,
    setCode,
    canVerify,
    verifying,
    handleVerifyCode,
    password,
    setPassword,
    confirmPassword,
    setConfirmPassword,
    submitting,
    complete,
    toast,
    helperKey,
    canSubmit,
    handleSubmit,
  };
}
