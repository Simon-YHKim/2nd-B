import type { PrivacyPrefs } from "./prefs";

export interface PrivacyChange {
  ownerId: string;
  revision: number;
  prefs: Partial<PrivacyPrefs>;
}
const changes = new Map<string, PrivacyChange>();
const listeners = new Set<(change: PrivacyChange) => void>();

export function currentPrivacyChange(ownerId: string): PrivacyChange | undefined {
  return changes.get(ownerId);
}

function publish(change: PrivacyChange): void {
  changes.set(change.ownerId, change);
  for (const listener of listeners) {
    try { listener(change); } catch { /* A failed subscriber cannot suppress withdrawal. */ }
  }
}

/** Withdraw immediately; a failed write never resumes processing in this session. */
export function beginPrivacyChange(ownerId: string, prefs: PrivacyPrefs): number {
  const prior = changes.get(ownerId);
  const revision = (prior?.revision ?? 0) + 1;
  const denied = Object.fromEntries(Object.entries(prefs).filter(([, value]) => value === false));
  publish({ ownerId, revision, prefs: { ...prior?.prefs, ...denied } });
  return revision;
}

/** A late grant cannot overtake a newer OFF action. */
export function commitPrivacyChange(ownerId: string, revision: number, prefs: PrivacyPrefs): void {
  if (changes.get(ownerId)?.revision !== revision) return;
  publish({ ownerId, revision, prefs: { ...prefs } });
}

export function subscribePrivacyChanges(listener: (change: PrivacyChange) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function resetPrivacyChangesForTests(): void { changes.clear(); listeners.clear(); }
