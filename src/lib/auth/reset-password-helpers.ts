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
