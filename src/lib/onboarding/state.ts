// First-run onboarding completion state (onboarding pack §4). Persisted in
// localStorage on web; on native (no localStorage) it reads as "not
// complete" but the gate is harmless there since the web build is primary.
// A logged-in mirror to profile/preferences can layer on later behind the
// same two functions.

export const ONBOARDING_KEY = "onboarding.cosmicPixel.v2.completedAt";

function ls(): Storage | null {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    // private mode / native — fall through
  }
  return null;
}

export function isOnboardingComplete(): boolean {
  return !!ls()?.getItem(ONBOARDING_KEY);
}

export function markOnboardingComplete(): void {
  ls()?.setItem(ONBOARDING_KEY, new Date().toISOString());
}
