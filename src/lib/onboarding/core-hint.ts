// Persisted dismissal of the first-graph coach hint (src/app/index.tsx).
// Audit B-1: once nodes exist, the spotlight card only appears AFTER the
// first graph touch — a user who never taps gets no nudge that tapping a
// Pattern Core drills down, exactly at the moment their first classified
// save lands them here. The hint fills that gap once; the first graph
// interaction (or a tap on the hint) dismisses it forever.
// Mirrors onboarding/empty-card.ts: web localStorage, native AsyncStorage,
// in-memory fallback.

import { useCallback, useEffect, useState } from "react";

export const CORE_HINT_DISMISSED_KEY = "graph.coreHint.dismissedAt";

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

export function markCoreHintDismissed(): void {
  const at = new Date().toISOString();
  memoryDismissed = true;
  memoryHydrated = true;
  ls()?.setItem(CORE_HINT_DISMISSED_KEY, at);
  const storage = nativeStorage();
  if (storage)
    void storage.setItem(CORE_HINT_DISMISSED_KEY, at).catch((e) => {
      if (typeof console !== "undefined") console.warn("[core-hint] persist failed", e);
    });
}

// `dismissed`: true = persisted dismissal, false = not dismissed, null = still
// hydrating native storage (callers must not show the hint while null).
export function useCoreHintDismissed(): {
  dismissed: boolean | null;
  dismiss: () => void;
} {
  const [dismissed, setDismissed] = useState<boolean | null>(() => {
    const local = ls();
    if (local) return local.getItem(CORE_HINT_DISMISSED_KEY) != null;
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
      .getItem(CORE_HINT_DISMISSED_KEY)
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
    markCoreHintDismissed();
  }, []);

  return { dismissed, dismiss };
}

export function __resetCoreHintForTests(): void {
  memoryDismissed = false;
  memoryHydrated = false;
}
