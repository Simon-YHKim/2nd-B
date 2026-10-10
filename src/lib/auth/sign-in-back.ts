// The existing sign-in toast and Android double-Back share this one duration.
export const SIGN_IN_TOAST_DURATION_MS = 2800;

export function signInBackDecision(expiresAt: number | undefined, now: number):
  | { kind: "exit" }
  | { kind: "notice"; expiresAt: number } {
  if (expiresAt !== undefined && now < expiresAt) return { kind: "exit" };
  return { kind: "notice", expiresAt: now + SIGN_IN_TOAST_DURATION_MS };
}

/** Read live state on every press, including changes before React renders. */
export function createSignInBackHandler({ isBusy, exitDeadline, now, showNotice, exitApp }: {
  isBusy: () => boolean;
  exitDeadline: () => number | undefined;
  now: () => number;
  showNotice: (expiresAt: number) => void;
  exitApp: () => void;
}): () => boolean {
  return () => {
    if (isBusy()) return true;
    const decision = signInBackDecision(exitDeadline(), now());
    if (decision.kind === "exit") exitApp();
    else showNotice(decision.expiresAt);
    return true;
  };
}
