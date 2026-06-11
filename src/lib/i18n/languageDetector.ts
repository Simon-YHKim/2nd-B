import * as Localization from "expo-localization";

import { isAvailableUiLocale, matchDeviceLocale, type AvailableUiLocale } from "./locales";

const STORAGE_KEY = "2nd-brain:locale";

// Returns the user's last manual choice (if persisted), otherwise the first
// device-preferred language that has a shipped pack. Falls back to "en".
//
// Persistence is Web-only via localStorage. Native builds (EAS) can layer
// AsyncStorage on top in a later refactor — at that point the detect/save
// pair becomes async, which is fine because initI18n already accepts a
// sync initial value and updates on changeLanguage.
export function detectLanguage(): AvailableUiLocale {
  try {
    if (typeof globalThis !== "undefined" && typeof (globalThis as { localStorage?: Storage }).localStorage !== "undefined") {
      const saved = (globalThis as { localStorage: Storage }).localStorage.getItem(STORAGE_KEY);
      if (isAvailableUiLocale(saved)) return saved;
    }
  } catch {
    // ignore — fall through to device detection
  }
  try {
    // Walk the device preference list in order: a JA-primary user with KO as
    // their second language should land on KO (shipped), not EN.
    for (const entry of Localization.getLocales()) {
      const matched = matchDeviceLocale(
        entry?.languageCode,
        (entry as { scriptCode?: string | null })?.scriptCode ?? null,
      );
      if (matched) return matched;
    }
    return "en";
  } catch {
    return "en";
  }
}

/** Persist a manual language choice. Best-effort, ignored on native. */
export function saveLanguagePreference(lng: AvailableUiLocale): void {
  try {
    if (typeof globalThis !== "undefined" && typeof (globalThis as { localStorage?: Storage }).localStorage !== "undefined") {
      (globalThis as { localStorage: Storage }).localStorage.setItem(STORAGE_KEY, lng);
    }
  } catch {
    // ignore
  }
}
