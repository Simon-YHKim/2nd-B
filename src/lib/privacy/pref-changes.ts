// A privacy_prefs save announced to screens and stores that are still in memory.
//
// r3as H1 (2026-09-14): the chat screen stays mounted in the Stack while the user is on
// /privacy. It read chat_autosave once and kept autosaving on that value after the user
// turned it off there (and ignored turning it on). Re-reading on focus alone is late - a
// reply can land while the chat screen is hidden behind the settings screen - so the save
// choke point (src/lib/supabase/privacy.ts) announces what it wrote and a mounted screen
// applies it at once.
//
// PR #1814 redesign C2 (2026-09-16): the committed news alone is still late for a withdrawal.
// A save reads, then updates, and only then announces; for those two round trips a pre-save
// server check can still read the old "on" and send a keep. So a save now announces its
// intent BEFORE its first round trip, and afterwards exactly one of: the saved news, which
// hands that intent back, or the failed news. What an intent may do is the listener's call -
// the chat autosave consent store (src/lib/chat/autosave-consent.ts) takes a withdrawal at
// once and a grant only when it is saved.
//
// This is a same-runtime signal, not a sync channel. A change made on another device
// reaches the chat screen through its focus re-read and its server re-check right before
// each automatic save, not through here.
//
// Listeners are isolated: one that throws must never turn a committed save into a failure,
// nor stop a save from starting.

import type { PrivacyPrefs } from "./prefs";

/**
 * One save, announced before its first round trip. The object is the save's identity: its
 * saved or failed news hands the same object back.
 */
export interface PrivacyPrefsSaveIntent {
  readonly userId: string;
  /** The keys this save writes and the values it writes (every key for a whole-object save). */
  readonly change: Readonly<Partial<PrivacyPrefs>>;
}

export type PrivacyPrefsSavedListener = (userId: string, prefs: PrivacyPrefs, intent?: PrivacyPrefsSaveIntent) => void;
export type PrivacyPrefsIntentListener = (intent: PrivacyPrefsSaveIntent) => void;

const listeners = new Set<PrivacyPrefsSavedListener>();
const intentListeners = new Set<PrivacyPrefsIntentListener>();
const failedListeners = new Set<PrivacyPrefsIntentListener>();

function notify<L>(set: Set<L>, call: (listener: L) => void): void {
  for (const listener of [...set]) {
    try {
      call(listener);
    } catch {
      // The save already committed, or is about to start; a listener failing must not change that.
    }
  }
}

/** Returns the unsubscribe function - call it from the effect cleanup. */
export function subscribePrivacyPrefsSaved(listener: PrivacyPrefsSavedListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** A save is about to start its round trips. Returns the unsubscribe function. */
export function subscribePrivacyPrefsIntent(listener: PrivacyPrefsIntentListener): () => void {
  intentListeners.add(listener);
  return () => {
    intentListeners.delete(listener);
  };
}

/** A save that announced an intent threw before it could confirm a commit. Returns the unsubscribe function. */
export function subscribePrivacyPrefsSaveFailed(listener: PrivacyPrefsIntentListener): () => void {
  failedListeners.add(listener);
  return () => {
    failedListeners.delete(listener);
  };
}

/** Call before a save's first round trip; hand the returned intent to the saved or the failed news. */
export function publishPrivacyPrefsIntent(userId: string, change: Partial<PrivacyPrefs>): PrivacyPrefsSaveIntent {
  const intent: PrivacyPrefsSaveIntent = { userId, change: { ...change } };
  notify(intentListeners, (listener) => listener(intent));
  return intent;
}

export function publishPrivacyPrefsSaved(userId: string, prefs: PrivacyPrefs, intent?: PrivacyPrefsSaveIntent): void {
  notify(listeners, (listener) => listener(userId, prefs, intent));
}

/** The write may or may not have landed: the save threw before it could tell. */
export function publishPrivacyPrefsSaveFailed(intent: PrivacyPrefsSaveIntent): void {
  notify(failedListeners, (listener) => listener(intent));
}
