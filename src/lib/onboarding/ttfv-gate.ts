// First-day TTFV ("첫날 자기이해 한 컷") auto-trigger gate. The TTFV first-day
// screen must surface exactly ONCE per ACCOUNT, on the account's first day after
// onboarding (Q-261004-40 = A). So it auto-triggers only while no "seen" mark
// exists and we are still inside the first-day window anchored on the
// onboarding completion time.
//
// A signed-in account reads both from the server (users.ttfv_seen_at and
// users.onboarding_completed_at, migration 0219, account-first-run.ts), so a new
// browser or a reinstall does not send an existing account to /ttfv again
// (QA-LEGACY W-12). The device values below (web localStorage, native
// AsyncStorage, in-memory fallback; mirrors comfort-offer.ts) are used only when
// there is no owner or the server marks could not be read.

import { useEffect, useState } from "react";

import { markAccountTTFVSeen, useAccountFirstRun, type AccountFirstRunMarks } from "./account-first-run";
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

/** The first-day review showed content. Device value plus, for an owner, the server mark. */
export function markTTFVSeen(ownerId: string | null = null): void {
  if (ownerId) void markAccountTTFVSeen(ownerId);
  const at = new Date().toISOString();
  memorySeen = true;
  memoryHydrated = true;
  ls()?.setItem(TTFV_SEEN_KEY, at);
  const storage = nativeStorage();
  // Best-effort native persist with a trace (parity with comfort-offer.ts). A
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

export interface TTFVGateState {
  seen: boolean;
  completedAt: string | null;
}

/** The device-only answer: null while native storage hydrates. */
export function deviceTTFVDecision(state: TTFVGateState | null, nowMs: number): boolean | null {
  if (state === null) return null;
  if (state.seen) return false;
  return isWithinFirstDay(state.completedAt, nowMs);
}

/**
 *   no owner (signed out)     the device answer
 *   owner, read pending       null (the caller shows a loader)
 *   owner, server answered    the server marks only: seen, or the first-day
 *                             window of the account's completion time
 *   owner, server unreadable  the device answer
 */
export function ttfvDecision(
  ownerId: string | null,
  account: AccountFirstRunMarks | "device" | null,
  device: TTFVGateState | null,
  nowMs: number,
): boolean | null {
  if (!ownerId) return deviceTTFVDecision(device, nowMs);
  if (account === null) return null;
  if (account === "device") return deviceTTFVDecision(device, nowMs);
  if (account.ttfvSeenAt) return false;
  return isWithinFirstDay(account.onboardingCompletedAt, nowMs);
}

/**
 * Decides whether to auto-trigger the first-day TTFV screen on the graph home.
 *   null  = still reading (native device storage, or the owner's server marks);
 *           the caller shows a loader, matching the onboarding gate, rather than
 *           flashing the graph then redirecting
 *   false = already seen, or no onboarding timestamp, or past the first day
 *   true  = show /ttfv now
 *
 * Pass the signed-in owner and `ready` once the auth session is restored.
 */
export function useAutoTriggerTTFV(ownerId: string | null = null, ready = true): boolean | null {
  const device = useDeviceTTFVState();
  const account = useAccountFirstRun(ownerId, ready);
  return ttfvDecision(ownerId, account, device, Date.now());
}

/**
 * Web reads localStorage synchronously so it resolves on first render; only
 * native pays a one-tick hydrate.
 */
function useDeviceTTFVState(): TTFVGateState | null {
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

  return state;
}

export function __resetTTFVGateForTests(): void {
  memorySeen = false;
  memoryCompletedAt = null;
  memoryHydrated = false;
}
