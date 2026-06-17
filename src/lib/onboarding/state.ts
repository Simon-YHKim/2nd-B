// First-run onboarding completion state. Web uses localStorage; native uses
// AsyncStorage so Android/iOS do not bounce back to onboarding after the
// final CTA.

import { useEffect, useState } from "react";

export const ONBOARDING_KEY = "onboarding.cosmicPixel.v2.completedAt";
export const FIRST_STAR_CHAT_KEY = "onboarding.firstStarChat.v1.nudgedAt";

interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

let memoryComplete = false;
let memoryHydrated = false;
let memoryStarChat = false;

function ls(): Storage | null {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    // private mode / native: fall through
  }
  return null;
}

function isReactNativeRuntime(): boolean {
  const nav = globalThis.navigator as { product?: string } | undefined;
  return nav?.product === "ReactNative";
}

function nativeStorage(): AsyncStorageLike | null {
  if (!isReactNativeRuntime()) return null;
  try {
    return require("@react-native-async-storage/async-storage").default as AsyncStorageLike;
  } catch {
    return null;
  }
}

export function isOnboardingComplete(): boolean {
  const local = ls();
  if (local) return !!local.getItem(ONBOARDING_KEY);
  return memoryHydrated ? memoryComplete : false;
}

export function markOnboardingComplete(): void {
  const completedAt = new Date().toISOString();
  memoryComplete = true;
  memoryHydrated = true;
  ls()?.setItem(ONBOARDING_KEY, completedAt);
  const storage = nativeStorage();
  // Persistence is best-effort (memory + localStorage layers still hold the
  // flag for this session), but a swallowed failure means silent re-onboarding
  // on next launch — leave a trace for debugging.
  if (storage)
    void storage.setItem(ONBOARDING_KEY, completedAt).catch((e) => {
      if (typeof console !== "undefined") console.warn("[onboarding] persist failed", e);
    });
}

// First-star chat nudge: after a user lights their very first star we steer them
// into one SecondB chat (the "session 1 = 1 star + 1 chat" activation target).
// One-shot — this returns true once the nudge has fired, so later star saves go
// straight back to the persona card. Same triple-storage layering as onboarding.
export function isFirstStarChatNudged(): boolean {
  const local = ls();
  if (local) return !!local.getItem(FIRST_STAR_CHAT_KEY);
  return memoryStarChat;
}

export function markFirstStarChatNudged(): void {
  const nudgedAt = new Date().toISOString();
  memoryStarChat = true;
  ls()?.setItem(FIRST_STAR_CHAT_KEY, nudgedAt);
  const storage = nativeStorage();
  // Best-effort native persistence (memory + localStorage already hold it for
  // this session); a swallowed failure only means the user could see the nudge
  // again on a fresh launch — leave a trace for debugging.
  if (storage)
    void storage.setItem(FIRST_STAR_CHAT_KEY, nudgedAt).catch((e) => {
      if (typeof console !== "undefined") console.warn("[onboarding] first-star-chat persist failed", e);
    });
}

export function useOnboardingComplete(): boolean | null {
  const [complete, setComplete] = useState<boolean | null>(() => {
    const local = ls();
    if (local) return !!local.getItem(ONBOARDING_KEY);
    if (memoryHydrated) return memoryComplete;
    return nativeStorage() ? null : false;
  });

  useEffect(() => {
    if (complete !== null) return;
    const storage = nativeStorage();
    if (!storage) {
      memoryHydrated = true;
      memoryComplete = false;
      setComplete(false);
      return;
    }

    let cancelled = false;
    storage
      .getItem(ONBOARDING_KEY)
      .then((value) => {
        if (cancelled) return;
        memoryComplete = !!value;
        memoryHydrated = true;
        setComplete(memoryComplete);
      })
      .catch(() => {
        if (cancelled) return;
        memoryComplete = false;
        memoryHydrated = true;
        setComplete(false);
      });

    return () => {
      cancelled = true;
    };
  }, [complete]);

  return complete;
}

export function __resetOnboardingStateForTests(): void {
  memoryComplete = false;
  memoryHydrated = false;
  memoryStarChat = false;
}
