// First-day TTFV ("첫날 자기이해 한 컷") auto-trigger gate. Mirrors
// onboarding/state.ts and empty-card.ts: web localStorage, native AsyncStorage,
// with an in-memory fallback. The TTFV first-day screen must surface exactly
// ONCE, on the user's first day after onboarding. So we persist a "seen" flag
// and only auto-trigger while still inside the first-day window, anchored on the
// signed-in account's onboarding completion (state.ts onboardingCompletedAt).
//
// W-12 (QA 261004): the anchor used to be the device-wide ONBOARDING_KEY, so an
// existing account on a new browser finished the repeated welcome with a fresh
// timestamp and got the first-day screen again. The anchor is now the owner's
// own completion, read only after onboarding has resolved for that owner. A
// completion inferred from existing rows is not a date, so it never opens the
// window.

import { useEffect, useState } from "react";

import { onboardingCompletedAt } from "./state";

export const TTFV_SEEN_KEY = "onboarding.ttfv.v1.seenAt";

/** The first-day window: TTFV auto-triggers only within 24h of onboarding. */
export const FIRST_DAY_MS = 24 * 60 * 60 * 1000;

interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

let memorySeen = false;
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

function syncSeen(): boolean | null {
  const local = ls();
  if (local) return !!local.getItem(TTFV_SEEN_KEY);
  if (memoryHydrated) return memorySeen;
  return nativeStorage() ? null : false;
}

/**
 * Decides whether to auto-trigger the first-day TTFV screen on the graph home.
 *   null  = not decidable yet: onboarding has not resolved for this owner, or
 *           native persistence is still hydrating (caller shows a loader rather
 *           than flashing the graph then redirecting)
 *   false = already seen, or no first-day anchor, or past the first day
 *   true  = show /ttfv now
 *
 * Pass the signed-in owner and that owner's useOnboardingComplete() result.
 * Web reads localStorage synchronously so it resolves on first render; only
 * native pays a one-tick hydrate of the seen flag.
 */
export function useAutoTriggerTTFV(ownerId: string | null, onboardingComplete: boolean | null): boolean | null {
  const [hydratedSeen, setHydratedSeen] = useState<boolean | null>(() => syncSeen());

  useEffect(() => {
    if (hydratedSeen !== null) return;
    const storage = nativeStorage();
    if (!storage) {
      memoryHydrated = true;
      setHydratedSeen(memorySeen);
      return;
    }

    let cancelled = false;
    storage
      .getItem(TTFV_SEEN_KEY)
      .then((seenVal) => {
        if (cancelled) return;
        memorySeen = memorySeen || !!seenVal;
        memoryHydrated = true;
        setHydratedSeen(memorySeen);
      })
      .catch(() => {
        if (cancelled) return;
        memoryHydrated = true;
        setHydratedSeen(memorySeen);
      });

    return () => {
      cancelled = true;
    };
  }, [hydratedSeen]);

  if (!ownerId || onboardingComplete !== true) return null;
  const seen = syncSeen() ?? hydratedSeen;
  if (seen === null) return null;
  if (seen) return false;
  return isWithinFirstDay(onboardingCompletedAt(ownerId), Date.now());
}

export function __resetTTFVGateForTests(): void {
  memorySeen = false;
  memoryHydrated = false;
}
