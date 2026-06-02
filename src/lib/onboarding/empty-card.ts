// Persisted dismissal of the first-run empty-graph card (src/app/index.tsx).
// Mirrors onboarding/state.ts: web localStorage, native AsyncStorage, with an
// in-memory fallback. Without this the card's "먼저 둘러볼게요" / ✕ used
// mount-local React state, so it re-appeared on every return to the graph.

import { useCallback, useEffect, useState } from "react";

export const EMPTY_GRAPH_DISMISSED_KEY = "graph.emptyCard.dismissedAt";

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

export function markEmptyGraphDismissed(): void {
  const at = new Date().toISOString();
  memoryDismissed = true;
  memoryHydrated = true;
  ls()?.setItem(EMPTY_GRAPH_DISMISSED_KEY, at);
  const storage = nativeStorage();
  if (storage) void storage.setItem(EMPTY_GRAPH_DISMISSED_KEY, at).catch(() => undefined);
}

// `dismissed`: true = persisted dismissal, false = not dismissed, null = still
// hydrating native storage (callers must not show the card while null).
// `dismiss()` hides the card immediately (local state) and persists it.
export function useEmptyGraphDismissed(): {
  dismissed: boolean | null;
  dismiss: () => void;
} {
  const [dismissed, setDismissed] = useState<boolean | null>(() => {
    const local = ls();
    if (local) return !!local.getItem(EMPTY_GRAPH_DISMISSED_KEY);
    if (memoryHydrated) return memoryDismissed;
    return nativeStorage() ? null : false;
  });

  useEffect(() => {
    if (dismissed !== null) return;
    const storage = nativeStorage();
    if (!storage) {
      memoryHydrated = true;
      memoryDismissed = false;
      setDismissed(false);
      return;
    }

    let cancelled = false;
    storage
      .getItem(EMPTY_GRAPH_DISMISSED_KEY)
      .then((value) => {
        if (cancelled) return;
        memoryDismissed = !!value;
        memoryHydrated = true;
        setDismissed(memoryDismissed);
      })
      .catch(() => {
        if (cancelled) return;
        memoryDismissed = false;
        memoryHydrated = true;
        setDismissed(false);
      });

    return () => {
      cancelled = true;
    };
  }, [dismissed]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    markEmptyGraphDismissed();
  }, []);

  return { dismissed, dismiss };
}

export function __resetEmptyGraphDismissedForTests(): void {
  memoryDismissed = false;
  memoryHydrated = false;
}
