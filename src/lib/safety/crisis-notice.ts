import { subscribeAccountTransition, type AccountOwnerLease } from "../auth/account-epoch";
import type { HotlineId } from "./lexicon";

// Safety guidance outlives the route that requested it, but never its account.
// Keep only routing metadata here: no submitted text, persistence, or analytics.
export interface CrisisNotice {
  readonly id: number;
  readonly hotline: HotlineId;
}

let sequence = 0;
let notice: CrisisNotice | null = null;
let owner: AccountOwnerLease | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

subscribeAccountTransition(() => {
  if (!owner || owner.isCurrent()) return;
  owner = null;
  notice = null;
  emit();
});

/** The lease must be captured BEFORE starting the request, not on completion. */
export function publishCrisisNotice(lease: AccountOwnerLease | null, hotline: HotlineId): boolean {
  if (!lease?.isCurrent()) return false;
  owner = lease;
  notice = { id: ++sequence, hotline };
  emit();
  return true;
}

export function dismissCrisisNotice(id: number): void {
  // An older dialog's close must not swallow a newer result.
  if (notice?.id !== id) return;
  owner = null;
  notice = null;
  emit();
}

export function getCrisisNotice(): CrisisNotice | null {
  return notice;
}

export function subscribeCrisisNotice(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
