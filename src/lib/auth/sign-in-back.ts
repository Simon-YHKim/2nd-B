// The existing sign-in toast and Android double-Back share this one duration.
export const SIGN_IN_TOAST_DURATION_MS = 2800;

export function signInBackDecision(expiresAt: number | undefined, now: number):
  | { kind: "exit" }
  | { kind: "notice"; expiresAt: number } {
  if (expiresAt !== undefined && now < expiresAt) return { kind: "exit" };
  return { kind: "notice", expiresAt: now + SIGN_IN_TOAST_DURATION_MS };
}
