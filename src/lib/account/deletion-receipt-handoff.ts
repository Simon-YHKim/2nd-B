// One-shot, memory-only note from "this device just deleted an account" to the
// /account-deleted screen: the receipt NUMBER and this device's own local results
// (cleanup, sign-out). Never the receipt itself - the screen reads that from the
// server - and never in a URL or in storage.
//
// Why it cannot leak another account's result (설계서 I6, X1-X3): the screen
// shows a receipt only while NO account is signed in, and this note is dropped
// the moment any other account becomes the owner. It also expires on its own.
import { onAccountOwnerChange } from "../auth/account-epoch";
import type { LocalPurgeOutcome, LocalSignOutOutcome, ReceiptSweeps } from "./deletion-receipt";

export const DELETION_RECEIPT_HANDOFF_TTL_MS = 10 * 60_000;

export interface DeletionReceiptHandoff {
  /** The account that was deleted on this device. */
  owner: string;
  /** Null when the deletion went through the old flow and has no number. */
  opId: string | null;
  /** What the server answered this device directly; used only when there is no number to look up. */
  observed: ReceiptSweeps | null;
  localPurge: LocalPurgeOutcome | null;
  /** Null while the sign-out has not finished yet. */
  localSignOut: LocalSignOutOutcome | null;
  at: number;
}

let current: DeletionReceiptHandoff | null = null;
let stopOwnerWatch: (() => void) | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) {
    try { listener(); } catch { /* a subscriber cannot block the others */ }
  }
}

export function clearDeletionReceiptHandoff(): void {
  stopOwnerWatch?.();
  stopOwnerWatch = null;
  if (current === null) return;
  current = null;
  emit();
}

export function setDeletionReceiptHandoff(next: Omit<DeletionReceiptHandoff, "at">, now = Date.now()): void {
  clearDeletionReceiptHandoff();
  current = Object.freeze({ ...next, at: now });
  // Signed out (null) or still the deleted owner: keep. Any other owner: drop.
  stopOwnerWatch = onAccountOwnerChange((change) => {
    if (change.owner !== null && change.owner !== next.owner) clearDeletionReceiptHandoff();
  });
  emit();
}

/** Record the sign-out result once it is known. Ignored for a replaced or cleared note. */
export function noteDeletionReceiptSignOut(owner: string, opId: string | null, outcome: LocalSignOutOutcome): void {
  if (current === null || current.owner !== owner || current.opId !== opId) return;
  current = Object.freeze({ ...current, localSignOut: outcome });
  emit();
}

/** The live note, or null once it expired or was cleared. Reading never consumes it. */
export function deletionReceiptHandoffSnapshot(now = Date.now()): DeletionReceiptHandoff | null {
  if (current !== null && now - current.at > DELETION_RECEIPT_HANDOFF_TTL_MS) return null;
  return current;
}

export function subscribeDeletionReceiptHandoff(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
