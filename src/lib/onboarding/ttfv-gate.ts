// First-day TTFV ("첫날 자기이해 한 컷") auto-trigger gate. Mirrors
// onboarding/state.ts and empty-card.ts: web localStorage, native AsyncStorage,
// with an in-memory fallback. The TTFV first-day screen must surface exactly
// ONCE, on the user's first day after onboarding. So we persist a "seen" flag
// and only auto-trigger while still inside the first-day window, anchored on the
// onboarding completedAt timestamp that state.ts already stores under
// ONBOARDING_KEY (no DB round-trip needed).

import { useEffect, useState } from "react";

import { ONBOARDING_KEY } from "./state";

export const TTFV_SEEN_KEY = "onboarding.ttfv.v1.seenAt";

/** The first-day window: TTFV auto-triggers only within 24h of onboarding. */
export const FIRST_DAY_MS = 24 * 60 * 60 * 1000;

interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

let memorySeen = false;
let memoryCompletedAt: string | null = null;
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

export function markTTFVSeen(): void {
  const at = new Date().toISOString();
  memorySeen = true;
  memoryHydrated = true;
  ls()?.setItem(TTFV_SEEN_KEY, at);
  const storage = nativeStorage();
  // Best-effort native persist with a trace (parity with empty-card.ts). A
  // silent failure would let the first-day screen auto-trigger again next
  // launch, so leave something to debug instead of swallowing it.
  if (storage)
    void storage.setItem(TTFV_SEEN_KEY, at).catch((e) => {
      if (typeof console !== "undefined") console.warn("[ttfv-gate] persist failed", e);
    });
}

/**
 * Pure: is `nowMs` still within the first day of `completedAtISO`? False for a
 * missing/unparseable timestamp. A small clock-skew window in both directions is
 * tolerated so a just-completed onboarding still counts as "first day".
 */
export function isWithinFirstDay(completedAtISO: string | null, nowMs: number): boolean {
  if (!completedAtISO) return false;
  const t = Date.parse(completedAtISO);
  if (!Number.isFinite(t)) return false;
  const delta = nowMs - t;
  return delta > -FIRST_DAY_MS && delta < FIRST_DAY_MS;
}

interface TTFVGateState {
  seen: boolean;
  completedAt: string | null;
}

/**
 * Decides whether to auto-trigger the first-day TTFV screen on the graph home.
 *   null  = native persistence still hydrating (caller shows a loader, matching
 *           the onboarding gate, rather than flashing the graph then redirecting)
 *   false = already seen, or no onboarding timestamp, or past the first day
 *   true  = show /ttfv now
 *
 * Web reads localStorage synchronously so it resolves on first render; only
 * native pays a one-tick hydrate.
 */
export function useAutoTriggerTTFV(): boolean | null {
  const [state, setState] = useState<TTFVGateState | null>(() => {
    const local = ls();
    if (local) {
      return {
        seen: !!local.getItem(TTFV_SEEN_KEY),
        completedAt: local.getItem(ONBOARDING_KEY),
      };
    }
    if (memoryHydrated) return { seen: memorySeen, completedAt: memoryCompletedAt };
    return nativeStorage() ? null : { seen: false, completedAt: null };
  });

  useEffect(() => {
    if (state !== null) return;
    const storage = nativeStorage();
    if (!storage) {
      memoryHydrated = true;
      setState({ seen: memorySeen, completedAt: memoryCompletedAt });
      return;
    }

    let cancelled = false;
    Promise.all([storage.getItem(TTFV_SEEN_KEY), storage.getItem(ONBOARDING_KEY)])
      .then(([seenVal, completedAt]) => {
        if (cancelled) return;
        memorySeen = !!seenVal;
        memoryCompletedAt = completedAt;
        memoryHydrated = true;
        setState({ seen: memorySeen, completedAt });
      })
      .catch(() => {
        if (cancelled) return;
        memoryHydrated = true;
        setState({ seen: memorySeen, completedAt: memoryCompletedAt });
      });

    return () => {
      cancelled = true;
    };
  }, [state]);

  if (state === null) return null;
  if (state.seen) return false;
  return isWithinFirstDay(state.completedAt, Date.now());
}

export function __resetTTFVGateForTests(): void {
  memorySeen = false;
  memoryCompletedAt = null;
  memoryHydrated = false;
}
