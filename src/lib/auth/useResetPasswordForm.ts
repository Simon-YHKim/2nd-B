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

import { useAuth } from "@/lib/auth/AuthContext";
import { consumeAuthCallbackUrl, updatePassword } from "@/lib/supabase/auth";
import { resetHelperKey } from "@/lib/auth/reset-password-helpers";

export type ResetToastTone = "info" | "success" | "danger";
export type ResetToast = { message: string; tone: ResetToastTone };

export { resetHelperKey };

export interface UseResetPasswordForm {
  // session/routing signals
  loading: boolean;
  userId: string | null;
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
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [complete, setComplete] = useState(false);
  const [toast, setToast] = useState<ResetToast | null>(null);

  const helperKey = useMemo(() => resetHelperKey(password, confirmPassword), [confirmPassword, password]);

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

  return {
    loading,
    userId,
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
