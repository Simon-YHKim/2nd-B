export type SignInToastTone = "info" | "success" | "danger";
export type SignInToast = { message: string; tone: SignInToastTone; exitOnBackUntil?: number };

/** Immediate writers replace; delayed writers may only replace their own notice. */
export function replaceSignInToast(
  current: SignInToast | null,
  next: SignInToast | null,
  expected?: SignInToast | null,
): SignInToast | null {
  if (expected !== undefined && current !== expected) return current;
  return next;
}
