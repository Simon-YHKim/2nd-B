// Synchronous account ownership boundary.
//
// Supabase can publish A -> B without an intermediate signed-out frame. Any
// module queue or mounted screen that was created for A must be able to reject
// work before AuthContext exposes B. AuthContext therefore calls
// noteResolvedOwner() immediately before every state publication.

export type AccountOwner = string | null;

export interface AccountOwnerChange {
  previousOwner: AccountOwner;
  owner: AccountOwner;
  epoch: number;
}

type Listener = () => void;
type OwnerListener = (change: AccountOwnerChange) => void;

interface RootNavigationSnapshot {
  routes: readonly { name?: string }[];
}

let epoch = 0;
let publishedOwner: AccountOwner = null;
let lastNonNullOwner: string | null = null;
let transitionPending = false;

const transitionListeners = new Set<Listener>();
const ownerListeners = new Set<OwnerListener>();

function emitTransition(): void {
  for (const listener of transitionListeners) {
    try {
      listener();
    } catch {
      // One broken subscriber must not prevent the remaining scene boundaries.
    }
  }
}

function emitOwner(change: AccountOwnerChange): void {
  // One cleanup surface must not prevent the remaining security boundaries or
  // AuthContext publication from running.
  for (const listener of ownerListeners) {
    try {
      listener(change);
    } catch {
      // Account transitions are fail-isolated; each subscriber owns its log.
    }
  }
}

/**
 * Record the owner that AuthContext is about to publish.
 *
 * This function is intentionally synchronous and import-free. Call it in the
 * same continuation immediately before setState; never from a React effect.
 */
export function noteResolvedOwner(owner: AccountOwner): void {
  if (owner === publishedOwner) return;

  const previousOwner = publishedOwner;
  epoch += 1;
  publishedOwner = owner;

  // A different non-null owner must never see the retained route tree. Keep
  // lastNonNullOwner across a signed-out frame so A -> null -> B is covered too.
  if (
    owner !== null &&
    lastNonNullOwner !== null &&
    owner !== lastNonNullOwner
  ) {
    transitionPending = true;
  }
  if (owner !== null) lastNonNullOwner = owner;

  emitOwner({ previousOwner, owner, epoch });
  // The epoch is part of the external-store snapshot. Notify even when a hold
  // stays true (B -> C before navigation settles), otherwise a resolver can
  // retain B's epoch and fail its compare-and-set forever.
  emitTransition();
}

export function currentAccountEpoch(): number {
  return epoch;
}

export function isCurrentAccountEpoch(expectedEpoch: number): boolean {
  return expectedEpoch === epoch;
}

/** Execute a side effect only while its captured account epoch is current. */
export function withAccountEpoch<T>(
  expectedEpoch: number,
  effect: () => T,
): T | undefined {
  return isCurrentAccountEpoch(expectedEpoch) ? effect() : undefined;
}

/** Synchronous fan-out for owner-owned module caches and abort controllers. */
export function onAccountOwnerChange(listener: OwnerListener): () => void {
  ownerListeners.add(listener);
  return () => ownerListeners.delete(listener);
}

export function isAccountTransitionPending(): boolean {
  return transitionPending;
}

/**
 * Stable primitive snapshot for useSyncExternalStore. The low bit is pending;
 * the remaining bits are the epoch, so owner changes notify React even when a
 * pending hold remains true across multiple rapid account switches.
 */
export function accountTransitionSnapshot(): number {
  return epoch * 2 + (transitionPending ? 1 : 0);
}

export function accountEpochFromSnapshot(snapshot: number): number {
  return Math.floor(snapshot / 2);
}

export function accountTransitionPendingFromSnapshot(snapshot: number): boolean {
  return snapshot % 2 === 1;
}

/** useSyncExternalStore-compatible transition subscription. */
export function subscribeAccountTransition(listener: Listener): () => void {
  transitionListeners.add(listener);
  return () => transitionListeners.delete(listener);
}

/**
 * Release only the transition that the caller observed. A stale resolver from
 * epoch N cannot clear a newer N+1 owner transition.
 */
export function clearAccountTransition(expectedEpoch: number): boolean {
  if (expectedEpoch !== epoch || !transitionPending) return false;
  transitionPending = false;
  emitTransition();
  return true;
}

/**
 * Navigation proof required before retained scenes may render for a new owner.
 * The URL/segments alone are insufficient: dismissAll and replace are queued,
 * so the old stack can still exist for a commit after the path changes.
 */
export function shouldReleaseAccountTransition(
  segments: readonly string[],
  rootState: RootNavigationSnapshot | undefined,
): boolean {
  return (
    segments.length === 0 &&
    rootState?.routes.length === 1 &&
    rootState.routes[0]?.name === "index"
  );
}

/** Test-only reset for this module singleton. */
export function __resetAccountEpochForTests(): void {
  epoch = 0;
  publishedOwner = null;
  lastNonNullOwner = null;
  transitionPending = false;
  transitionListeners.clear();
  ownerListeners.clear();
}
