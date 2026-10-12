import type { SignInToast } from "./sign-in-toast";

// The timer and Android double-Back share the deadline of the committed notice.
export const SIGN_IN_TOAST_DURATION_MS = 2800;

export type PresentedSignInExit = { toast: SignInToast; exitOnBackUntil: number };

/** Called only after commit. Leave a frame for painting even if effects flush early. */
export function deferSignInExitPresentation({ requestFrame, cancelFrame, present }: {
  requestFrame: (callback: () => void) => number;
  cancelFrame: (frame: number) => void;
  present: () => (() => void) | undefined;
}): () => void {
  let active = true;
  let release: (() => void) | undefined;
  let frame = requestFrame(() => {
    if (!active) return;
    frame = requestFrame(() => {
      if (active) release = present();
    });
  });
  return () => {
    active = false;
    cancelFrame(frame);
    release?.();
  };
}

/** Only the exact notice acknowledged after commit can acquire a deadline. */
export function presentSignInExit(
  current: SignInToast | null,
  committed: SignInToast,
  presented: PresentedSignInExit | null,
  now: number,
): PresentedSignInExit | null {
  if (current !== committed || !committed.exitOnBack) return null;
  if (presented?.toast === committed) return presented;
  return { toast: committed, exitOnBackUntil: now + SIGN_IN_TOAST_DURATION_MS };
}

/** Run synchronously on every accepted replacement, before publishing state. */
export function replacePresentedSignInExit(
  presented: PresentedSignInExit | null,
  current: SignInToast | null,
  next: SignInToast | null,
): PresentedSignInExit | null {
  return current === next ? presented : null;
}

/** Blur revokes pending and presented guidance through the same synchronous writer. */
export function clearSignInExit(
  current: SignInToast | null,
  setToast: (next: SignInToast | null, expected: SignInToast) => void,
): void {
  if (current?.exitOnBack) setToast(null, current);
}

export function signInBackDecision(
  presented: PresentedSignInExit | null,
  hasPendingExit: boolean,
  now: number,
):
  | { kind: "exit" }
  | { kind: "hold" }
  | { kind: "notice" } {
  if (presented) return { kind: now < presented.exitOnBackUntil ? "exit" : "notice" };
  return { kind: hasPendingExit ? "hold" : "notice" };
}

/** Read live state on every press, including changes before React renders. */
export function createSignInBackHandler({ isBusy, presentedExit, hasPendingExit, now, showNotice, exitApp }: {
  isBusy: () => boolean;
  presentedExit: () => PresentedSignInExit | null;
  hasPendingExit: () => boolean;
  now: () => number;
  showNotice: () => void;
  exitApp: () => void;
}): () => boolean {
  return () => {
    if (isBusy()) return true;
    const decision = signInBackDecision(presentedExit(), hasPendingExit(), now());
    if (decision.kind === "exit") exitApp();
    else if (decision.kind === "notice") showNotice();
    return true;
  };
}
