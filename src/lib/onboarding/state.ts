// First-run onboarding (the welcome) completion state.
//
// A signed-in account follows the SERVER (Q-261004-40, strict variant, migration
// 0219, account-first-run.ts): the welcome opens by itself once per account, by
// a server grant, and finishing it is recorded on the account. A signed-in
// account never reads the device flag below, so another account's flag on the
// same device cannot skip the welcome (gate CDA-04 = CD-02).
//
// The device flag is kept for one case only: a signed-out visitor who opens
// /onboarding directly (since the login wall, 2026-07-15, the only way a
// signed-out visitor gets there). Web uses localStorage; native uses
// AsyncStorage. Every device read and write is best effort: a storage error must
// never stop the screen from moving on (gate CDA-05).

import { useEffect, useState } from "react";

import {
  finishFirstRun,
  useAccountOnboardingComplete,
  type OnboardingOutcome,
} from "./account-first-run";

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

/** The device flag (web localStorage). A blocked or failing store reads as "not yet". */
function readLocalFlag(local: Storage, key: string): boolean {
  try {
    return !!local.getItem(key);
  } catch {
    return false;
  }
}

/** Signed-out device flag: has this device finished the welcome? */
export function isOnboardingComplete(): boolean {
  const local = ls();
  if (local) return readLocalFlag(local, ONBOARDING_KEY);
  return memoryHydrated ? memoryComplete : false;
}

/** Signed-out only: remember on this device that the welcome was finished. Never throws. */
function markDeviceOnboardingComplete(): void {
  const completedAt = new Date().toISOString();
  memoryComplete = true;
  memoryHydrated = true;
  try {
    ls()?.setItem(ONBOARDING_KEY, completedAt);
  } catch (e) {
    if (typeof console !== "undefined") console.warn("[onboarding] persist failed", e);
  }
  const storage = nativeStorage();
  // Persistence is best-effort (memory + localStorage layers still hold the
  // flag for this session), but a swallowed failure means silent re-onboarding
  // on next launch, so leave a trace for debugging.
  if (storage)
    void storage.setItem(ONBOARDING_KEY, completedAt).catch((e) => {
      if (typeof console !== "undefined") console.warn("[onboarding] persist failed", e);
    });
}

/**
 * The welcome was finished (or skipped).
 *   signed in   the account mark on the server (finish_first_run). Resolves true
 *               only when the server stored it for this sign-in; the screen
 *               shows "could not save" otherwise. Even then the welcome does not
 *               open by itself again: the grant it opened with is already stored.
 *   signed out  the device flag. Resolves true.
 * Never rejects.
 */
export async function markOnboardingComplete(
  ownerId: string | null,
  outcome: OnboardingOutcome = "completed",
): Promise<boolean> {
  if (ownerId) return finishFirstRun(ownerId, "onboarding", outcome, null);
  markDeviceOnboardingComplete();
  return true;
}

// First-star chat nudge: after a user lights their very first star we steer them
// into one SecondB chat (the "session 1 = 1 star + 1 chat" activation target).
// One-shot — this returns true once the nudge has fired, so later star saves go
// straight back to the persona card. Same triple-storage layering as onboarding.
/**
 * One-shot consume for the first-star→chat activation nudge (med#7): every
 * quant instrument calls this from its save celebration; only the FIRST star
 * ever lit returns true (and marks). Before this helper the nudge was wired
 * only on /attachment — the other five instruments skipped activation.
 */
export function consumeFirstStarChatNudge(): boolean {
  if (isFirstStarChatNudged()) return false;
  markFirstStarChatNudged();
  return true;
}

export function isFirstStarChatNudged(): boolean {
  const local = ls();
  if (local) return !!local.getItem(FIRST_STAR_CHAT_KEY);
  return memoryStarChat;
}

/**
 * Load the persisted flag into memory once per launch.
 *
 * markFirstStarChatNudged() has always written to AsyncStorage, but NOTHING read
 * it back: isFirstStarChatNudged() falls through to `memoryStarChat`, which is
 * re-initialized to false on every JS bundle load. So on native the value sat on
 * disk and was ignored, and every cold start re-armed the one-shot — a user who
 * had already been nudged got yanked into a SecondB chat again on their next
 * quant save, on all seven instruments that share this helper.
 *
 * Web is unaffected and deliberately skipped: localStorage is synchronous and
 * already the source of truth there.
 *
 * Fail-soft: on any error the flag stays false, which costs at most one extra
 * nudge — never a lost save.
 */
export async function hydrateFirstStarChatNudge(): Promise<void> {
  if (memoryStarChat) return;
  if (ls()) return;
  const storage = nativeStorage();
  if (!storage) return;
  try {
    const nudgedAt = await storage.getItem(FIRST_STAR_CHAT_KEY);
    if (nudgedAt) memoryStarChat = true;
  } catch (e) {
    if (typeof console !== "undefined") {
      console.warn("[onboarding] first-star-chat hydrate failed", (e as Error).message);
    }
  }
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

/**
 * Has the welcome been finished?
 *   signed in (ownerId)  the account's server mark once `ready` (null while it
 *                        is read). A read that fails answers false: only a
 *                        direct visit gets here without a grant, and it may show
 *                        the welcome.
 *   signed out           the device flag.
 * The device flag is never used for a signed-in account.
 */
export function useOnboardingComplete(ownerId: string | null = null, ready = true): boolean | null {
  const device = useDeviceOnboardingComplete();
  const account = useAccountOnboardingComplete(ownerId, ready);
  return ownerId ? account : device;
}

function useDeviceOnboardingComplete(): boolean | null {
  const [complete, setComplete] = useState<boolean | null>(() => {
    const local = ls();
    if (local) return readLocalFlag(local, ONBOARDING_KEY);
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
