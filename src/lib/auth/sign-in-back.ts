import type { SignInToast } from "./sign-in-toast";

// The timer and Android double-Back share the deadline of the committed notice.
export const SIGN_IN_TOAST_DURATION_MS = 2800;

export type PresentedSignInExit = {
  toast: SignInToast;
  attached: boolean;
  exitOnBackUntil: number | null;
};

/** The overlay's layout effect owns attachment, independently of its later paint. */
export function attachSignInExit(
  current: SignInToast | null,
  notice: SignInToast,
  presented: PresentedSignInExit | null,
): PresentedSignInExit | null {
  if (current !== notice || !notice.exitOnBack) return presented;
  if (presented?.toast === notice && presented.attached) return presented;
  // Accepted residual: reattachment waits two frames again, conservatively withholding exit.
  return { toast: notice, attached: true, exitOnBackUntil: null };
}

/** Layout cleanup revokes in the removal commit, even before passive cleanup. */
export function detachSignInExit(
  presented: PresentedSignInExit | null,
  notice: SignInToast,
): PresentedSignInExit | null {
  return presented?.toast === notice ? { ...presented, attached: false } : presented;
}

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

/** Only the exact notice still attached after two frames can acquire a deadline. */
export function presentSignInExit(
  current: SignInToast | null,
  committed: SignInToast,
  presented: PresentedSignInExit | null,
  now: number,
): PresentedSignInExit | null {
  if (current !== committed || !committed.exitOnBack ||
      presented?.toast !== committed || !presented.attached) return null;
  if (presented.exitOnBackUntil !== null) return presented;
  return { ...presented, exitOnBackUntil: now + SIGN_IN_TOAST_DURATION_MS };
}

/** Run synchronously on every accepted replacement, before publishing state. */
export function replacePresentedSignInExit(
  presented: PresentedSignInExit | null,
  current: SignInToast | null,
  next: SignInToast | null,
): PresentedSignInExit | null {
  // Accepted residual: replacement revokes before commit; a still-visible old notice cannot exit.
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
  if (presented?.attached && presented.exitOnBackUntil !== null) {
    return { kind: now < presented.exitOnBackUntil ? "exit" : "notice" };
  }
  return { kind: hasPendingExit ? "hold" : "notice" };
}

/** Read live state on every press, including changes before React renders. */
export function createSignInBackHandler({ isGuest, isBusy, presentedExit, hasPendingExit, now, showNotice, exitApp }: {
  isGuest: () => boolean;
  isBusy: () => boolean;
  presentedExit: () => PresentedSignInExit | null;
  hasPendingExit: () => boolean;
  now: () => number;
  showNotice: () => void;
  exitApp: () => void;
}): () => boolean {
  return () => {
    // Layout removes the subscription on home/blur. A retained callback also
    // consumes without exit or notice after ownership has been revoked.
    if (!isGuest() || isBusy()) return true;
    const decision = signInBackDecision(presentedExit(), hasPendingExit(), now());
    if (decision.kind === "exit") exitApp();
    else if (decision.kind === "notice") showNotice();
    return true;
  };
}
