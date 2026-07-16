// Pure helpers for the reset-password screen. RN/expo-router free so it stays
// unit-testable in the node jest env (useResetPasswordForm pulls in expo-linking
// for the native recovery deep link).

// Derive the helper-line i18n key from the two password fields. The length check
// runs first, so a too-short password surfaces the too-short hint even when the
// confirm field also mismatches.
export function resetHelperKey(password: string, confirmPassword: string): string {
  if (password.length > 0 && password.length < 8) return "resetPassword.passwordTooShort";
  if (confirmPassword.length > 0 && confirmPassword !== password) return "resetPassword.passwordMismatch";
  return "resetPassword.passwordHelper";
}

// Which of the four reset phases the screen shows. A session (userId) always
// wins: it can arrive from the verified code OR from the legacy mail link, and
// in both cases the only remaining job is setting the new password.
export type ResetStep = "request" | "verify" | "password" | "done";

export function resetStep(input: { userId: string | null; complete: boolean; codeSent: boolean }): ResetStep {
  if (input.complete) return "done";
  if (input.userId) return "password";
  return input.codeSent ? "verify" : "request";
}
