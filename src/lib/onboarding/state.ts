// First-run onboarding completion state. Web uses localStorage; native uses
// AsyncStorage so Android/iOS do not bounce back to onboarding after the
// final CTA.
//
// Completion belongs to the signed-in ACCOUNT, not the device (W-12, QA 261004).
// Onboarding has been a post-login welcome since #1000, yet the flag was one
// device-wide key: a new browser, a private window or a reinstall put an existing
// account back through the carousel (and then the first-day /ttfv screen), and a
// second account on the same device skipped it. coachmarks-gate.ts moved to
// "owner key + existing rows" in #1883 for the same reason; this follows it:
//
//   1. the owner's own key (memory, then localStorage / AsyncStorage)
//   2. the server: one record or source row for this owner means the account is
//      not new. That is recorded as ONBOARDING_FROM_RECORDS, which is not a date,
//      so the /ttfv first-day window never opens for it.
//   3. the old device-wide key (written by earlier builds, or by the carousel while
//      signed out) is claimed by the first account that reaches this point, then
//      removed, so a later account on the device does not inherit it.
//   4. a failed server read is never read as "empty account": the owner counts as
//      onboarded for this session only (nothing is written; the next launch asks
//      again), instead of being pushed into the welcome on a network blip. This is
//      decided before step 3: a failed read neither claims nor removes the
//      device-wide key, so an existing account cannot take a fresh device
//      completion as its own first day (BL-01).
//
// The owner key is account data: purgeOnboardingForDeletedAccount() removes it on
// terminal deletion (src/lib/account/local-purge.ts), and once the deletion fence
// is up nothing for that owner is written again, including by a read that was
// already in flight (BL-02).

import { useEffect, useState } from "react";

import {
  isAccountLocalDeletionFencedInMemory,
  runAccountLocalMutation,
} from "../account/local-deletion-fence";
import { hasCoachmarkContent as hasOwnerContent } from "./coachmarks-gate";

/** Device-wide completion not tied to an account: earlier builds wrote it, and the
 *  carousel still writes it when finished while signed out. Claimed once (above). */
export const ONBOARDING_KEY = "onboarding.cosmicPixel.v2.completedAt";
export const ONBOARDING_OWNER_KEY = (ownerId: string) => `onboarding.v3.${ownerId}.completedAt`;
/** Stored instead of a timestamp when completion is inferred from existing rows. */
export const ONBOARDING_FROM_RECORDS = "inferred:existing-records";
export const FIRST_STAR_CHAT_KEY = "onboarding.firstStarChat.v1.nudgedAt";

interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem?(key: string): Promise<void>;
}

// Device-wide (ownerless) flag, as before.
let memoryComplete = false;
let memoryHydrated = false;
let memoryStarChat = false;
// Per-owner completion values. Only completed owners are held here.
const memoryOwner = new Map<string, string>();
// Owners treated as onboarded for this session only, after a failed server read.
const sessionOnly = new Set<string>();
const inflight = new Map<string, Promise<boolean>>();

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

function warn(operation: string, error: unknown): void {
  if (typeof console !== "undefined") console.warn(`[onboarding] ${operation} failed`, error);
}

function lsGet(key: string): string | null {
  try {
    return ls()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

async function storedValue(key: string): Promise<string | null> {
  const local = lsGet(key);
  if (local) return local;
  const storage = nativeStorage();
  if (!storage) return null;
  try {
    return await storage.getItem(key);
  } catch (error) {
    warn("read", error);
    return null;
  }
}

function persist(key: string, value: string): void {
  try {
    ls()?.setItem(key, value);
  } catch (error) {
    warn("persist", error);
  }
  const storage = nativeStorage();
  // Persistence is best-effort (memory + localStorage layers still hold the
  // flag for this session), but a swallowed failure means silent re-onboarding
  // on next launch — leave a trace for debugging.
  if (storage) void storage.setItem(key, value).catch((e) => warn("persist", e));
}

function forget(key: string): void {
  try {
    ls()?.removeItem(key);
  } catch (error) {
    warn("remove", error);
  }
  const storage = nativeStorage();
  if (storage?.removeItem) void storage.removeItem(key).catch((e) => warn("remove", e));
}

async function persistOwner(key: string, value: string): Promise<void> {
  try {
    ls()?.setItem(key, value);
  } catch (error) {
    warn("persist", error);
  }
  const storage = nativeStorage();
  if (storage) await storage.setItem(key, value).catch((e) => warn("persist", e));
}

/** false = the owner's deletion fence is up, so nothing was recorded (BL-02). */
function recordOwner(ownerId: string, value: string): boolean {
  if (isAccountLocalDeletionFencedInMemory(ownerId)) return false;
  memoryOwner.set(ownerId, value);
  sessionOnly.delete(ownerId);
  const key = ONBOARDING_OWNER_KEY(ownerId);
  // Serialised with account deletion: a write that would land after the durable
  // fence (another tab, or a read that was in flight) is dropped, not resurrected.
  void runAccountLocalMutation(ownerId, () => persistOwner(key, value)).catch((e) => warn("persist", e));
  return true;
}

/**
 * Synchronous answer when one is available without a read that can wait:
 * memory, or localStorage on web. null = it needs resolveOnboardingComplete().
 * Without an owner this is the device-wide flag (the signed-out carousel).
 */
export function isOnboardingComplete(ownerId: string | null = null): boolean | null {
  if (!ownerId) {
    const local = ls();
    if (local) return !!lsGet(ONBOARDING_KEY);
    if (memoryHydrated) return memoryComplete;
    return nativeStorage() ? null : false;
  }
  if (memoryOwner.has(ownerId) || sessionOnly.has(ownerId)) return true;
  const local = lsGet(ONBOARDING_OWNER_KEY(ownerId));
  if (local) {
    memoryOwner.set(ownerId, local);
    return true;
  }
  return null;
}

/**
 * The value the owner's completion was recorded with: an ISO timestamp when they
 * finished the carousel (or claimed a device-wide one), ONBOARDING_FROM_RECORDS
 * when inferred from their rows, null when unknown or session-only. /ttfv anchors
 * its first-day window on it.
 */
export function onboardingCompletedAt(ownerId: string | null): string | null {
  if (!ownerId) return null;
  if (!memoryOwner.has(ownerId)) isOnboardingComplete(ownerId);
  return memoryOwner.get(ownerId) ?? null;
}

async function resolveOwner(ownerId: string): Promise<boolean> {
  const stored = await storedValue(ONBOARDING_OWNER_KEY(ownerId));
  if (stored) {
    if (!isAccountLocalDeletionFencedInMemory(ownerId)) memoryOwner.set(ownerId, stored);
    return true;
  }

  let hasRows: boolean | null;
  try {
    hasRows = await hasOwnerContent(ownerId);
  } catch (error) {
    warn("existing-rows check", error);
    hasRows = null;
  }
  // Deleted while the read was in flight (BL-02): record nothing, claim nothing.
  if (isAccountLocalDeletionFencedInMemory(ownerId)) return true;
  // A failed read is settled before the device-wide key is looked at (BL-01):
  // session only, nothing written or removed, the next launch asks again.
  if (hasRows === null) {
    sessionOnly.add(ownerId);
    return true;
  }
  const device = await storedValue(ONBOARDING_KEY);

  if (hasRows === true) {
    // This device's old completion now belongs to an account with data; do not
    // leave it for a later account to inherit.
    if (recordOwner(ownerId, ONBOARDING_FROM_RECORDS) && device) forget(ONBOARDING_KEY);
    return true;
  }
  if (device) {
    if (!recordOwner(ownerId, device)) return true;
    forget(ONBOARDING_KEY);
    memoryComplete = false;
    memoryHydrated = true;
    return true;
  }
  return false;
}

/**
 * Has this account been onboarded? Reads the owner's key, then (only when there is
 * none) the server and the old device-wide key, in the order the header gives.
 * Concurrent callers for one owner share one read.
 */
export function resolveOnboardingComplete(ownerId: string): Promise<boolean> {
  const sync = isOnboardingComplete(ownerId);
  if (sync !== null) return Promise.resolve(sync);
  const pending = inflight.get(ownerId);
  if (pending) return pending;
  const next = resolveOwner(ownerId).finally(() => inflight.delete(ownerId));
  inflight.set(ownerId, next);
  return next;
}

/**
 * Record completion. With an owner it belongs to that account; without one (the
 * carousel finished while signed out) it is the device-wide flag that the next
 * account to sign in claims.
 */
export function markOnboardingComplete(ownerId: string | null = null): void {
  const completedAt = new Date().toISOString();
  if (ownerId) {
    recordOwner(ownerId, completedAt);
    return;
  }
  memoryComplete = true;
  memoryHydrated = true;
  persist(ONBOARDING_KEY, completedAt);
}

/**
 * Remove one terminally deleted owner's completion: the stored key and the
 * in-memory and session-only answers. true only when the key is confirmed gone.
 * purgeDeletedAccountLocalData() calls it after the deletion fence is up, so a
 * read still in flight cannot write it back (recordOwner checks the fence).
 */
export async function purgeOnboardingForDeletedAccount(userId: string): Promise<boolean> {
  const owner = userId.trim();
  if (!owner) return false;
  const key = ONBOARDING_OWNER_KEY(owner);
  memoryOwner.delete(owner);
  sessionOnly.delete(owner);
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

async function hydrateDeviceFlag(): Promise<boolean> {
  const storage = nativeStorage();
  if (!storage) {
    memoryHydrated = true;
    return memoryComplete;
  }
  try {
    const value = await storage.getItem(ONBOARDING_KEY);
    memoryComplete = memoryComplete || !!value;
  } catch {
    // keep what memory says
  }
  memoryHydrated = true;
  return memoryComplete;
}

/**
 * Pass the signed-in owner (null while signed out or still loading).
 *   null  = still reading (the caller shows a loader)
 *   true  = this account has been onboarded
 *   false = a new account with no completion anywhere: show the welcome
 */
export function useOnboardingComplete(ownerId: string | null): boolean | null {
  const sync = isOnboardingComplete(ownerId);
  const [resolved, setResolved] = useState<{ ownerId: string | null; complete: boolean } | null>(null);

  useEffect(() => {
    if (sync !== null) return;
    if (resolved && resolved.ownerId === ownerId) return;
    let cancelled = false;
    const read = ownerId
      ? resolveOnboardingComplete(ownerId).catch(() => true)
      : hydrateDeviceFlag().catch(() => false);
    void read.then((complete) => {
      if (!cancelled) setResolved({ ownerId, complete });
    });
    return () => {
      cancelled = true;
    };
  }, [ownerId, sync, resolved]);

  if (sync !== null) return sync;
  return resolved?.ownerId === ownerId ? resolved.complete : null;
}

export function __resetOnboardingStateForTests(): void {
  memoryComplete = false;
  memoryHydrated = false;
  memoryStarChat = false;
  memoryOwner.clear();
  sessionOnly.clear();
  inflight.clear();
}
