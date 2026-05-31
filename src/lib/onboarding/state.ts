// First-run onboarding completion state. Web uses localStorage; native uses
// AsyncStorage so Android/iOS do not bounce back to onboarding after the
// final CTA.

import { useEffect, useState } from "react";

export const ONBOARDING_KEY = "onboarding.cosmicPixel.v2.completedAt";

interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

let memoryComplete = false;
let memoryHydrated = false;

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
  if (storage) void storage.setItem(ONBOARDING_KEY, completedAt).catch(() => undefined);
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
}
