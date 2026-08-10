// Signed-in password change (Settings -> 비밀번호 변경).
//
// Distinct from useResetPasswordForm: that one runs on a RECOVERY session where
// the user cannot know the current password. This one runs on a normal session,
// so Supabase Auth's "Require current password when updating" (Email provider,
// enabled 2026-08-10) applies and the current password is mandatory.
//
// The four outcomes each get their own copy, keyed off error_code and never the
// message: a missing and a WRONG current password come back with identical
// message text (measured 2026-08-10) and differ only by the code.

import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { passwordUpdateFailure, updatePassword } from "@/lib/supabase/auth";

export type ChangePasswordTone = "success" | "danger";
export type ChangePasswordToast = { message: string; tone: ChangePasswordTone };

export const MIN_PASSWORD_LENGTH = 8;

export interface UseChangePasswordForm {
  currentPassword: string;
  setCurrentPassword: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  confirmPassword: string;
  setConfirmPassword: (value: string) => void;
  submitting: boolean;
  complete: boolean;
  toast: ChangePasswordToast | null;
  /** i18n key for the helper line under the new-password field. */
  helperKey: string;
  canSubmit: boolean;
  /** True once the server says the session is too old; the screen offers sign-in. */
  needsReauth: boolean;
  handleSubmit: () => Promise<void>;
}

export function changePasswordHelperKey(password: string, confirmPassword: string): string {
  if (password.length > 0 && password.length < MIN_PASSWORD_LENGTH) return "resetPassword.passwordTooShort";
  if (confirmPassword.length > 0 && confirmPassword !== password) return "resetPassword.passwordMismatch";
  return "resetPassword.passwordHelper";
}

export function useChangePasswordForm(): UseChangePasswordForm {
  const { t } = useTranslation("auth");
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [complete, setComplete] = useState(false);
  const [needsReauth, setNeedsReauth] = useState(false);
  const [toast, setToast] = useState<ChangePasswordToast | null>(null);

  const helperKey = useMemo(
    () => changePasswordHelperKey(password, confirmPassword),
    [confirmPassword, password],
  );

  const canSubmit =
    currentPassword.length > 0 &&
    password.length >= MIN_PASSWORD_LENGTH &&
    confirmPassword === password &&
    !submitting;

  const handleSubmit = useCallback(async () => {
    if (
      currentPassword.length === 0 ||
      password.length < MIN_PASSWORD_LENGTH ||
      confirmPassword !== password ||
      submitting
    ) {
      return;
    }
    setSubmitting(true);
    setNeedsReauth(false);
    try {
      await updatePassword(password, currentPassword);
      setCurrentPassword("");
      setPassword("");
      setConfirmPassword("");
      setComplete(true);
      setToast({ tone: "success", message: t("changePassword.success") });
    } catch (e) {
      const failure = passwordUpdateFailure(e);
      if (failure === "reauthentication_needed") setNeedsReauth(true);
      const message =
        failure === "current_password_invalid" || failure === "current_password_required"
          ? t("errors.currentPasswordInvalid")
          : failure === "reauthentication_needed"
            ? t("errors.reauthRequired")
            : failure === "weak_password"
              ? t("changePassword.errorTooShort")
              : t("errors.passwordUpdateFailed");
      setToast({ tone: "danger", message });
      if (typeof console !== "undefined") console.warn("[auth] change password error", failure);
    } finally {
      setSubmitting(false);
    }
  }, [confirmPassword, currentPassword, password, submitting, t]);

  return {
    currentPassword,
    setCurrentPassword,
    password,
    setPassword,
    confirmPassword,
    setConfirmPassword,
    submitting,
    complete,
    toast,
    helperKey,
    canSubmit,
    needsReauth,
    handleSubmit,
  };
}
