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
//
// R2-03: the "seen" flag is the owner's too (onboarding.ttfv.v2.<owner>.seenAt).
// It was one device-wide key, so account A having seen /ttfv spent account B's
// first day on the same device. The old device-wide flag is never read as an
// account's own; it moves with the device-wide completion (state.ts). The owner
// flag is account data: purgeTTFVSeenForDeletedAccount() removes it on deletion.

import { useEffect, useState } from "react";

import {
  isAccountLocalDeletionFencedInMemory,
  runAccountLocalMutation,
} from "../account/local-deletion-fence";
import { onboardingCompletedAt, TTFV_SEEN_DEVICE_KEY, TTFV_SEEN_OWNER_KEY } from "./state";

/** Earlier builds' device-wide "seen" flag. No account reads it as its own: it
 *  moves with the device-wide onboarding completion to the account that claims
 *  it (state.ts), and is otherwise ignored. */
export const TTFV_SEEN_KEY = TTFV_SEEN_DEVICE_KEY;
export { TTFV_SEEN_OWNER_KEY };

/** The first-day window: TTFV auto-triggers only within 24h of onboarding. */
export const FIRST_DAY_MS = 24 * 60 * 60 * 1000;

interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem?(key: string): Promise<void>;
}

// "Seen" is per owner (R2-03): account A having seen /ttfv must not spend
// account B's first day on the same device.
const memorySeen = new Set<string>();
// Native only: the owner's stored flag once read this launch.
const hydratedSeen = new Map<string, boolean>();

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

function warnPersist(error: unknown): void {
  if (typeof console !== "undefined") console.warn("[ttfv-gate] persist failed", error);
}

/**
 * The owner's first-day screen has been shown. The write is serialised with
 * account deletion like the onboarding owner key, so a deleted account's flag is
 * not written back after its purge.
 */
export function markTTFVSeen(ownerId: string): void {
  const owner = ownerId.trim();
  if (!owner || isAccountLocalDeletionFencedInMemory(owner)) return;
  const at = new Date().toISOString();
  memorySeen.add(owner);
  const key = TTFV_SEEN_OWNER_KEY(owner);
  // Best-effort persist with a trace (parity with empty-card.ts). A silent
  // failure would let the first-day screen auto-trigger again next launch, so
  // leave something to debug instead of swallowing it.
  void runAccountLocalMutation(owner, async () => {
    ls()?.setItem(key, at);
    const storage = nativeStorage();
    if (storage) await storage.setItem(key, at);
  })
    .then((result) => {
      if (!result.executed && isAccountLocalDeletionFencedInMemory(owner)) memorySeen.delete(owner);
    })
    .catch(warnPersist);
}

/**
 * Remove a terminally deleted owner's "seen" flag, stored and in memory. true
 * only when the stored key is confirmed gone. Called by
 * purgeDeletedAccountLocalData() after the deletion fence is up.
 */
export async function purgeTTFVSeenForDeletedAccount(userId: string): Promise<boolean> {
  const owner = userId.trim();
  if (!owner) return false;
  const key = TTFV_SEEN_OWNER_KEY(owner);
  memorySeen.delete(owner);
  hydratedSeen.delete(owner);
  try {
    const web = ls();
    if (web) {
      web.removeItem(key);
      return web.getItem(key) === null;
    }
    const native = nativeStorage();
    if (!native?.removeItem) return false;
    await native.removeItem(key);
    return (await native.getItem(key)) === null;
  } catch {
    return false;
  }
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

function syncSeen(ownerId: string): boolean | null {
  if (memorySeen.has(ownerId)) return true;
  const local = ls();
  if (local) {
    try {
      return !!local.getItem(TTFV_SEEN_OWNER_KEY(ownerId));
    } catch {
      return false;
    }
  }
  const hydrated = hydratedSeen.get(ownerId);
  if (hydrated !== undefined) return hydrated;
  return nativeStorage() ? null : false;
}

/**
 * Decides whether to auto-trigger the first-day TTFV screen on the graph home.
 *   null  = not decidable yet: onboarding has not resolved for this owner, or
 *           native persistence is still hydrating (caller shows a loader rather
 *           than flashing the graph then redirecting)
 *   false = this owner has seen it, or no first-day anchor, or past the first day
 *   true  = show /ttfv now
 *
 * Pass the signed-in owner and that owner's useOnboardingComplete() result.
 * The owner's "seen" flag is read only after onboarding has resolved for them,
 * so a device-wide flag moved to them by that resolution is already in place.
 * Web reads localStorage synchronously so it resolves on first render; only
 * native pays a one-tick hydrate of the seen flag.
 */
export function useAutoTriggerTTFV(ownerId: string | null, onboardingComplete: boolean | null): boolean | null {
  const ready = !!ownerId && onboardingComplete === true;
  const sync = ready && ownerId ? syncSeen(ownerId) : null;
  const [hydrated, setHydrated] = useState<{ ownerId: string; seen: boolean } | null>(null);

  useEffect(() => {
    if (!ready || !ownerId || sync !== null) return;
    if (hydrated?.ownerId === ownerId) return;
    const storage = nativeStorage();
    if (!storage) {
      setHydrated({ ownerId, seen: memorySeen.has(ownerId) });
      return;
    }

    let cancelled = false;
    storage
      .getItem(TTFV_SEEN_OWNER_KEY(ownerId))
      .then((seenVal) => {
        const seen = memorySeen.has(ownerId) || !!seenVal;
        hydratedSeen.set(ownerId, seen);
        if (!cancelled) setHydrated({ ownerId, seen });
      })
      .catch(() => {
        if (!cancelled) setHydrated({ ownerId, seen: memorySeen.has(ownerId) });
      });

    return () => {
      cancelled = true;
    };
  }, [ready, ownerId, sync, hydrated]);

  if (!ready || !ownerId) return null;
  const seen = sync ?? (hydrated?.ownerId === ownerId ? hydrated.seen : null);
  if (seen === null) return null;
  if (seen) return false;
  return isWithinFirstDay(onboardingCompletedAt(ownerId), Date.now());
}

export function __resetTTFVGateForTests(): void {
  memorySeen.clear();
  hydratedSeen.clear();
}
