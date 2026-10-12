// RN-free notice policy shared by the form and its lifecycle tests.
export type SignUpToastTone = "info" | "success" | "danger";
export type SignUpToast = { message: string; tone: SignUpToastTone };

export function signUpToastTimeoutMs(toast: SignUpToast | null): number | null {
  return toast && toast.tone !== "danger" ? 2800 : null;
}

export function clearSignUpFailure(toast: SignUpToast | null): SignUpToast | null {
  return toast?.tone === "danger" ? null : toast;
}
