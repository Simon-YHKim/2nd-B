// Pure helpers for the reset-password screen. RN/expo-router free so it stays
// unit-testable in the node jest env (useResetPasswordForm pulls in expo-linking
// for the native recovery deep link).

import {
  createRecoveryProof,
  recoveryProofMatchesSession,
  recoverySessionIdentity,
  type RecoveryProof,
  type RecoverySessionLike,
} from "./recovery-proof-store";

// Derive the helper-line i18n key from the two password fields. The length check
// runs first, so a too-short password surfaces the too-short hint even when the
// confirm field also mismatches.
export function resetHelperKey(password: string, confirmPassword: string): string {
  if (password.length > 0 && password.length < 8) return "resetPassword.passwordTooShort";
  if (confirmPassword.length > 0 && confirmPassword !== password) return "resetPassword.passwordMismatch";
  return "resetPassword.passwordHelper";
}

// Which of the four reset phases the screen shows. A normal signed-in session is
// not recovery proof: only a PASSWORD_RECOVERY event or a verified native
// recovery callback may set recoveryActive.
export type ResetStep = "request" | "verify" | "password" | "done";

export function resetStep(input: {
  recoveryActive: boolean;
  complete: boolean;
  codeSent: boolean;
}): ResetStep {
  if (input.complete) return "done";
  if (input.recoveryActive) return "password";
  return input.codeSent ? "verify" : "request";
}

/** Reduce Supabase auth events to session-bound recovery provenance. */
export function nextRecoveryProof(
  current: RecoveryProof | null,
  event: string,
  session: RecoverySessionLike | null,
): RecoveryProof | null {
  if (event === "PASSWORD_RECOVERY") {
    const identity = recoverySessionIdentity(session);
    return identity ? createRecoveryProof(identity) : null;
  }
  if (!session) return null;
  if (current && !recoveryProofMatchesSession(current, session)) return null;
  return current;
}

/** One lock contract shared by native Back, iOS gesture, and route removal. */
export function resetExitLocked(input: {
  recoveryPending: boolean;
  recoveryActive: boolean;
  complete: boolean;
}): boolean {
  return input.recoveryPending || (input.recoveryActive && !input.complete);
}

/** Keep request, verification, and mutation controls mutually exclusive. */
export function resetActionAvailability(input: {
  emailValid: boolean;
  codeValid: boolean;
  passwordsValid: boolean;
  recoveryActive: boolean;
  recoveryPending: boolean;
  sendSubmitting: boolean;
  submitting: boolean;
  resendSeconds: number;
}): { canSendCode: boolean; canVerify: boolean; canSubmit: boolean } {
  const idle = !input.recoveryPending && !input.sendSubmitting && !input.submitting;
  return {
    canSendCode: input.emailValid && idle && input.resendSeconds === 0,
    canVerify: input.codeValid && idle,
    canSubmit: input.recoveryActive && input.passwordsValid && idle,
  };
}

type RecoveryOperationQueue = { current: Promise<void> };

/** Serialize session-changing recovery work even before React state commits. */
export function enqueueRecoveryOperation<T>(
  queue: RecoveryOperationQueue,
  operation: () => Promise<T>,
): Promise<T> {
  const task = queue.current.then(operation, operation);
  queue.current = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}
