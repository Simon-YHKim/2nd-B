import * as Localization from "expo-localization";

const STORAGE_KEY = "2nd-brain:locale";

// Returns the user's last manual choice (if persisted), otherwise the
// device-preferred language. Falls back to "en" when neither is "ko".
//
// Persistence is Web-only via localStorage. Native builds (EAS) can layer
// AsyncStorage on top in a later refactor — at that point the detect/save
// pair becomes async, which is fine because initI18n already accepts a
// sync initial value and updates on changeLanguage.
export function detectLanguage(): "en" | "ko" {
  try {
    if (typeof globalThis !== "undefined" && typeof (globalThis as { localStorage?: Storage }).localStorage !== "undefined") {
      const saved = (globalThis as { localStorage: Storage }).localStorage.getItem(STORAGE_KEY);
      if (saved === "ko" || saved === "en") return saved;
    }
  } catch {
    // ignore — fall through to device detection
  }
  try {
    const locales = Localization.getLocales();
    const first = locales[0]?.languageCode;
    if (first === "ko") return "ko";
    return "en";
  } catch {
    return "en";
  }
}

/** Persist a manual language choice. Best-effort, ignored on native. */
export function saveLanguagePreference(lng: "en" | "ko"): void {
  try {
    if (typeof globalThis !== "undefined" && typeof (globalThis as { localStorage?: Storage }).localStorage !== "undefined") {
      (globalThis as { localStorage: Storage }).localStorage.setItem(STORAGE_KEY, lng);
    }
  } catch {
    // ignore
  }
}
