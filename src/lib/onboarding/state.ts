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
// Step 3 runs in one queue for all owners (BL-03): the device-wide key is read,
// stored under the owner and removed there, so two owners resolving at once
// cannot both take it, and a read whose screens moved to another account
// leaves it alone. It is removed only after the owner's own key is confirmed
// stored (R2-01): a write that failed or that the deletion fence refused
// leaves it for the next launch.
//
// The owner key is account data: purgeOnboardingForDeletedAccount() removes it on
// terminal deletion (src/lib/account/local-purge.ts), and once the deletion fence
// is up nothing for that owner is written again, including by a read that was
// already in flight (BL-02). A write the fence refuses also takes back the
// owner's in-memory answer.

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
/** Earlier builds' device-wide /ttfv "seen" flag. It moves with ONBOARDING_KEY
 *  (claimDeviceTTFVSeen below); ttfv-gate.ts reads only the owner's key. */
export const TTFV_SEEN_DEVICE_KEY = "onboarding.ttfv.v1.seenAt";
export const TTFV_SEEN_OWNER_KEY = (ownerId: string) => `onboarding.ttfv.v2.${ownerId}.seenAt`;

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

async function forget(key: string): Promise<void> {
  try {
    ls()?.removeItem(key);
  } catch (error) {
    warn("remove", error);
  }
  const storage = nativeStorage();
  if (storage?.removeItem) await storage.removeItem(key).catch((e) => warn("remove", e));
}

/** true only when every store present holds the value afterwards. */
async function persistOwner(key: string, value: string): Promise<boolean> {
  const web = ls();
  const storage = nativeStorage();
  if (!web && !storage) return false;
  try {
    if (web) {
      web.setItem(key, value);
      if (web.getItem(key) !== value) return false;
    }
    if (storage) await storage.setItem(key, value);
    return true;
  } catch (error) {
    warn("persist", error);
    return false;
  }
}

/**
 * saved  = the owner key is stored (memory holds it too)
 * failed = not stored, the account is not known to be deleted (storage or the
 *          fence read failed)
 * fenced = the owner's deletion fence refused the write, or went up while it ran
 */
type OwnerRecord = "saved" | "failed" | "fenced";

/**
 * Store one owner's completion, serialised with account deletion. The result is
 * the write's, not a guess (R2-01 / BL-02): a write refused by a durable fence
 * this runtime had not seen (another tab, a read that was in flight) reports
 * "fenced" and takes back any in-memory answer for the owner.
 *
 * optimistic: put the value in memory before the write lands (the carousel
 * finish, which routes home synchronously). Otherwise memory follows a saved
 * write only.
 */
async function recordOwner(ownerId: string, value: string, optimistic: boolean): Promise<OwnerRecord> {
  if (isAccountLocalDeletionFencedInMemory(ownerId)) return "fenced";
  if (optimistic) {
    memoryOwner.set(ownerId, value);
    sessionOnly.delete(ownerId);
  }
  const key = ONBOARDING_OWNER_KEY(ownerId);
  let outcome: OwnerRecord;
  try {
    const result = await runAccountLocalMutation(ownerId, () => persistOwner(key, value));
    outcome = result.executed && result.value ? "saved" : "failed";
  } catch (error) {
    warn("persist", error);
    outcome = "failed";
  }
  // runAccountLocalMutation() raises the memory fence when it finds the durable
  // marker, and installAccountLocalDeletionFence() raises it before waiting for
  // this write, so this one check covers both "refused" and "deleted meanwhile".
  if (isAccountLocalDeletionFencedInMemory(ownerId)) {
    memoryOwner.delete(ownerId);
    sessionOnly.delete(ownerId);
    return "fenced";
  }
  if (outcome === "saved" && !optimistic) {
    memoryOwner.set(ownerId, value);
    sessionOnly.delete(ownerId);
  }
  return outcome;
}

// One device-wide completion, one owner (BL-03): every read-claim-remove of the
// device-wide key runs in this queue, for all owners, so two owners resolving at
// once (an account switch while the first read is still out) cannot both read
// it before either has removed it.
let deviceClaimTail: Promise<void> = Promise.resolve();

function withDeviceClaim<T>(operation: () => Promise<T>): Promise<T> {
  const result = deviceClaimTail.then(operation);
  deviceClaimTail = result.then(() => undefined, () => undefined);
  return result;
}

/** Remove the device-wide key only if it still holds the value that was claimed. */
async function forgetDeviceKey(claimed: string): Promise<boolean> {
  if ((await storedValue(ONBOARDING_KEY)) !== claimed) return false;
  await forget(ONBOARDING_KEY);
  memoryComplete = false;
  memoryHydrated = true;
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

async function resolveOwner(ownerId: string, wanted: () => boolean): Promise<boolean> {
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
  const rowsFound = hasRows;
  return withDeviceClaim(() => settleOwner(ownerId, rowsFound, wanted));
}

/**
 * Runs inside the device-claim queue. The device-wide key is read here, not
 * before, so an owner settled earlier in the queue has already taken it.
 * It is removed only after this owner's own key is stored (R2-01 / BL-02): a
 * refused or failed write leaves it for the next launch, and the owner counts
 * as onboarded for this session only.
 */
async function settleOwner(ownerId: string, hasRows: boolean, wanted: () => boolean): Promise<boolean> {
  if (isAccountLocalDeletionFencedInMemory(ownerId)) return true;
  const device = await storedValue(ONBOARDING_KEY);

  if (hasRows) {
    // This device's old completion now belongs to an account with data; do not
    // leave it for a later account to inherit. A lookup the screens have dropped
    // (account switch) leaves it for the account now on screen. Asked before the
    // write: the stored owner key itself settles the screens' own answer and ends
    // their wait, which must not read as "dropped".
    const discard = !!device && wanted();
    const outcome = await recordOwner(ownerId, ONBOARDING_FROM_RECORDS, false);
    if (outcome === "failed") sessionOnly.add(ownerId);
    if (outcome === "saved" && discard && device && (await forgetDeviceKey(device))) {
      await forget(TTFV_SEEN_DEVICE_KEY);
    }
    return true;
  }
  if (!device) return false;
  // A lookup the screens have dropped (account switch, BL-03) does not take the
  // device's completion: it is left for the account now on screen.
  if (!wanted()) return false;
  const outcome = await recordOwner(ownerId, device, false);
  if (outcome === "fenced") return true;
  if (outcome === "failed") {
    sessionOnly.add(ownerId);
    return true;
  }
  await claimDeviceTTFVSeen(ownerId);
  await forgetDeviceKey(device);
  return true;
}

/**
 * The device-wide /ttfv "seen" flag of earlier builds goes with the device-wide
 * completion it belonged to (R2-03): to the account that claims it, and away
 * with it when an account with rows discards it. It is never read as any
 * account's own. Removed only once the owner's copy is stored.
 */
async function claimDeviceTTFVSeen(ownerId: string): Promise<void> {
  const seen = await storedValue(TTFV_SEEN_DEVICE_KEY);
  if (!seen) return;
  const moved = await runAccountLocalMutation(ownerId, () => persistOwner(TTFV_SEEN_OWNER_KEY(ownerId), seen)).catch(
    (error: unknown) => {
      warn("persist", error);
      return { executed: false } as const;
    },
  );
  if (moved.executed && moved.value) await forget(TTFV_SEEN_DEVICE_KEY);
}

// Callers still waiting on an owner's in-flight read. A screen that moved to
// another account (or unmounted) reports false, and when no caller is left the
// read records what it found about its owner but leaves the device-wide key
// alone (BL-03).
const interest = new Map<string, Set<() => boolean>>();
const ALWAYS_WANTED = () => true;

/**
 * Has this account been onboarded? Reads the owner's key, then (only when there is
 * none) the server and the old device-wide key, in the order the header gives.
 * Concurrent callers for one owner share one read.
 *
 * stillWanted: the hook passes "my effect is not cancelled"; a direct caller
 * omits it and always counts.
 */
export function resolveOnboardingComplete(ownerId: string, stillWanted: () => boolean = ALWAYS_WANTED): Promise<boolean> {
  const sync = isOnboardingComplete(ownerId);
  if (sync !== null) return Promise.resolve(sync);
  let callers = interest.get(ownerId);
  if (!callers) {
    callers = new Set();
    interest.set(ownerId, callers);
  }
  callers.add(stillWanted);
  const pending = inflight.get(ownerId);
  if (pending) return pending;
  const waiting = callers;
  const next = resolveOwner(ownerId, () => [...waiting].some((isWanted) => isWanted())).finally(() => {
    inflight.delete(ownerId);
    if (interest.get(ownerId) === waiting) interest.delete(ownerId);
  });
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
    // Memory first: the caller routes home in the same tick. A write the deletion
    // fence refuses takes it back (recordOwner); a plain storage failure keeps it
    // for this session, as before.
    void recordOwner(ownerId, completedAt, true);
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
    // Cancelled (account switch, unmount): the read goes on, but no longer asks
    // for the device-wide completion on this screen's behalf (BL-03).
    const read = ownerId
      ? resolveOnboardingComplete(ownerId, () => !cancelled).catch(() => true)
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
  interest.clear();
  deviceClaimTail = Promise.resolve();
}
