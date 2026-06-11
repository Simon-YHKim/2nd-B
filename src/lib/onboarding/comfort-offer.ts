// Persisted dismissal of the one-time comfort offer on the graph home
// (persona sim v2, new P1-1): every 60+ persona hit the same wall - the
// readable-font option EXISTS but lives behind 설정 > 테마, reachable only
// after pushing through the pixel-dark first impression ("진작 첫 화면에서
// 물어봐 주지"). The offer asks ONCE, right where they land, and applying
// it changes the screen instantly. Declining or accepting dismisses forever.
// Mirrors onboarding/core-hint.ts (third copy of this little store - if a
// fourth appears, factor a createDismissalStore(key) instead).

import { useCallback, useEffect, useState } from "react";

export const COMFORT_OFFER_DISMISSED_KEY = "appearance.comfortOffer.dismissedAt";

interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

let memoryDismissed = false;
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

export function markComfortOfferDismissed(): void {
  const at = new Date().toISOString();
  memoryDismissed = true;
  memoryHydrated = true;
  ls()?.setItem(COMFORT_OFFER_DISMISSED_KEY, at);
  const storage = nativeStorage();
  if (storage)
    void storage.setItem(COMFORT_OFFER_DISMISSED_KEY, at).catch((e) => {
      if (typeof console !== "undefined") console.warn("[comfort-offer] persist failed", e);
    });
}

// `dismissed`: true = persisted dismissal, false = not dismissed, null = still
// hydrating native storage (callers must not show the offer while null).
export function useComfortOfferDismissed(): {
  dismissed: boolean | null;
  dismiss: () => void;
} {
  const [dismissed, setDismissed] = useState<boolean | null>(() => {
    const local = ls();
    if (local) return local.getItem(COMFORT_OFFER_DISMISSED_KEY) != null;
    if (memoryHydrated) return memoryDismissed;
    return null;
  });

  useEffect(() => {
    if (dismissed !== null) return;
    const storage = nativeStorage();
    if (!storage) {
      setDismissed(memoryDismissed);
      return;
    }
    let cancelled = false;
    storage
      .getItem(COMFORT_OFFER_DISMISSED_KEY)
      .then((v) => {
        if (cancelled) return;
        memoryHydrated = true;
        memoryDismissed = v != null;
        setDismissed(v != null);
      })
      .catch(() => {
        if (!cancelled) setDismissed(memoryDismissed);
      });
    return () => {
      cancelled = true;
    };
  }, [dismissed]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    markComfortOfferDismissed();
  }, []);

  return { dismissed, dismiss };
}

export function __resetComfortOfferForTests(): void {
  memoryDismissed = false;
  memoryHydrated = false;
}
