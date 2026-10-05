// What THIS device observed while finishing a confirmed account erasure: did
// its local data purge complete, and did the deleted account's local session
// sign out. These are facts about one device, not about the server, so they
// belong neither in the server receipt nor in a URL.
//
// Why not in the URL any more (gates DEL2-R1-05 / D2A-06, 2026-10-05): the
// route used to carry them as `done`, `local` and `signout` query values, and
// /account-deleted showed them as facts. Anyone could open
// `/account-deleted?done=1&local=complete&signout=complete` and be told that an
// account deletion was confirmed and that this device was cleaned, and a link
// copied to another device carried the first device's claims with it.
//
// Now the route carries an opaque one-time token (`op`) and the observations
// stay here, in this JS realm, bound to that token AND to the receipt number.
// A forged, copied or reloaded link finds nothing and shows only what the
// server says for the number.
//
// What this is NOT: a receipt store. The receipt is still read from the server
// by number (deletion-receipt.ts), and nothing here can make a receipt appear
// (Simon decision Q-261004-42 = A). The deleted owner's id is kept in memory
// only to tell "that same account is still published because its sign-out
// failed" (gate D2A-07) from "some other account is signed in"; it never goes
// into a URL and never selects what receipt to show.
//
// One slot: a newer deletion replaces an older one.
import { randomUUID } from "expo-crypto";

import { normalizeReceiptId, type LocalPurgeOutcome, type LocalSignOutOutcome } from "./deletion-receipt";

export interface LocalDeletionOutcome {
  /** The one-time token the receipt route carries as `op`. */
  token: string;
  /** The account this device just deleted. Memory only. */
  owner: string;
  /** The server receipt number the route carries; null when none was recorded. */
  receiptId: string | null;
  /**
   * True when `receiptId` is this device's own request number and the server
   * confirmed the erasure, but whether it recorded a receipt under that number
   * could not be checked (gate D2A-03). The route asks the server; only a
   * definite "not found" then means no receipt was recorded.
   */
  receiptUnconfirmed?: boolean;
  localPurge: LocalPurgeOutcome;
  /** Null until the sign-out finished. */
  localSignOut: LocalSignOutOutcome | null;
}

let current: LocalDeletionOutcome | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      // A broken subscriber must not stop the others.
    }
  }
}

/** Start recording one deletion's local outcome. Returns the route token. */
export function beginLocalDeletionOutcome(
  input: { owner: string; receiptId: string | null; receiptUnconfirmed?: boolean; localPurge: LocalPurgeOutcome },
  newToken: () => string = randomUUID,
): string {
  const token = normalizeReceiptId(newToken());
  if (token === null) throw new Error("local deletion outcome token is not a UUID");
  const receiptId = normalizeReceiptId(input.receiptId);
  current = Object.freeze({
    token,
    owner: input.owner,
    receiptId,
    // Present only when true, so a proven or absent number reads exactly as before.
    ...(receiptId !== null && input.receiptUnconfirmed === true ? { receiptUnconfirmed: true } : {}),
    localPurge: input.localPurge,
    localSignOut: null,
  });
  emit();
  return token;
}

/** Record how the sign-out ended. Ignored unless the token is the current one. */
export function reportLocalDeletionSignOut(token: string, outcome: LocalSignOutOutcome): void {
  if (current === null || current.token !== token) return;
  current = Object.freeze({ ...current, localSignOut: outcome });
  emit();
}

/** Forget the outcome (another account took over, or the result was closed). */
export function discardLocalDeletionOutcome(token: string): void {
  if (current === null || current.token !== token) return;
  current = null;
  emit();
}

export function localDeletionOutcomeSnapshot(): LocalDeletionOutcome | null {
  return current;
}

export function subscribeLocalDeletionOutcome(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * The outcome that belongs to one route, or null. Both the token and the
 * receipt number must match: a token never lends its local claims to another
 * receipt number, and a number alone never borrows them.
 */
export function localDeletionOutcomeFor(
  snapshot: LocalDeletionOutcome | null,
  params: { op: string | null; receiptId: string | null },
): LocalDeletionOutcome | null {
  if (snapshot === null || params.op === null || snapshot.token !== params.op) return null;
  if (snapshot.receiptId !== params.receiptId) return null;
  return snapshot;
}

export function __resetLocalDeletionOutcomeForTests(): void {
  current = null;
  listeners.clear();
}
