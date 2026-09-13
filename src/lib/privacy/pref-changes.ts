// A privacy_prefs save that just committed, announced to screens that are still mounted.
//
// r3as H1 (2026-09-14): the chat screen stays mounted in the Stack while the user is on
// /privacy. It read chat_autosave once and kept autosaving on that value after the user
// turned it off there (and ignored turning it on). Re-reading on focus alone is late - a
// reply can land while the chat screen is hidden behind the settings screen - so the save
// choke point (src/lib/supabase/privacy.ts) announces what it wrote and a mounted screen
// applies it at once.
//
// This is a same-runtime signal, not a sync channel. A change made on another device
// reaches the chat screen through its focus re-read and its server re-check right before
// each automatic save, not through here.
//
// Listeners are isolated: one that throws must never turn a committed save into a failure.

import type { PrivacyPrefs } from "./prefs";

export type PrivacyPrefsSavedListener = (userId: string, prefs: PrivacyPrefs) => void;

const listeners = new Set<PrivacyPrefsSavedListener>();

/** Returns the unsubscribe function - call it from the effect cleanup. */
export function subscribePrivacyPrefsSaved(listener: PrivacyPrefsSavedListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function publishPrivacyPrefsSaved(userId: string, prefs: PrivacyPrefs): void {
  for (const listener of [...listeners]) {
    try {
      listener(userId, prefs);
    } catch {
      // The save already committed; a screen's handler failing must not undo that.
    }
  }
}
