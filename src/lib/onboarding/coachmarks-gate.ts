// First-record coach gate (rev2 Screen-Spec 04): the cross-route guide starts
// ONCE on the first visit to the constellation home, and can be brought back
// from settings ("코치마크 리셋", Screen-Spec 09). Mirrors ttfv-gate.ts: web
// localStorage (sync), native AsyncStorage (one-tick hydrate), in-memory
// fallback. No first-day window — first home visit is the trigger whenever it
// happens.

import { useEffect, useState } from "react";

export const COACHMARKS_SEEN_KEY = "onboarding.coachmarks.home.v1.seenAt";

interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

let memorySeen = false;
let memoryHydrated = false;
const coachmarkListeners = new Set<(due: boolean) => void>();

function publishCoachmarksDue(due: boolean): void {
  for (const listener of coachmarkListeners) listener(due);
}

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

export function markCoachmarksSeen(): void {
  const at = new Date().toISOString();
  memorySeen = true;
  memoryHydrated = true;
  publishCoachmarksDue(false);
  ls()?.setItem(COACHMARKS_SEEN_KEY, at);
  const storage = nativeStorage();
  if (storage)
    void storage.setItem(COACHMARKS_SEEN_KEY, at).catch((e) => {
      if (typeof console !== "undefined") console.warn("[coachmarks-gate] persist failed", e);
    });
}

/** Settings "코치마크 리셋": first-record coaching starts on the next home visit. */
export function resetCoachmarks(): void {
  memorySeen = false;
  memoryHydrated = true;
  publishCoachmarksDue(true);
  ls()?.removeItem(COACHMARKS_SEEN_KEY);
  const storage = nativeStorage();
  if (storage)
    void storage.removeItem(COACHMARKS_SEEN_KEY).catch((e) => {
      if (typeof console !== "undefined") console.warn("[coachmarks-gate] reset failed", e);
    });
}

/**
 * Should the home show the coachmarks overlay?
 *   null  = native persistence still hydrating (render nothing yet — the home
 *           stays interactive underneath, no loader needed for an overlay)
 *   false = already seen
 *   true  = start the first-record guide from the live SecondB head
 */
export function useCoachmarksGate(): boolean | null {
  const [state, setState] = useState<boolean | null>(() => {
    const local = ls();
    if (local) return !local.getItem(COACHMARKS_SEEN_KEY);
    if (memoryHydrated) return !memorySeen;
    return nativeStorage() ? null : true;
  });

  // The home can stay mounted underneath /capture. A successful first-record
  // save must therefore close that already-mounted overlay immediately instead
  // of waiting for a remount that may never happen in the router stack.
  useEffect(() => {
    const listener = (due: boolean) => setState(due);
    coachmarkListeners.add(listener);
    return () => {
      coachmarkListeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (state !== null) return;
    const storage = nativeStorage();
    if (!storage) {
      memoryHydrated = true;
      setState(!memorySeen);
      return;
    }

    let cancelled = false;
    storage
      .getItem(COACHMARKS_SEEN_KEY)
      .then((seenVal) => {
        if (cancelled) return;
        // A mark/reset can finish while the first native read is in flight.
        // In that case memory is newer than the read that just returned.
        if (memoryHydrated) {
          setState(!memorySeen);
          return;
        }
        memorySeen = !!seenVal;
        memoryHydrated = true;
        setState(!memorySeen);
      })
      .catch(() => {
        if (cancelled) return;
        memoryHydrated = true;
        setState(!memorySeen);
      });

    return () => {
      cancelled = true;
    };
  }, [state]);

  return state;
}

export function __resetCoachmarksGateForTests(): void {
  memorySeen = false;
  memoryHydrated = false;
  coachmarkListeners.clear();
}
