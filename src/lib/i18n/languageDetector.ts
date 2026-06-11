import * as Localization from "expo-localization";

import { isAvailableUiLocale, matchDeviceLocale, type AvailableUiLocale } from "./locales";

const STORAGE_KEY = "2nd-brain:locale";

// Same runtime/storage split as capture/draft.ts: web persists synchronously
// via localStorage; native persists via AsyncStorage (async, so the saved
// choice is applied post-init by loadNativeLanguagePreference - see initI18n).
interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
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

// Returns the user's last manual choice (if synchronously available),
// otherwise the first device-preferred language with a shipped pack.
// Falls back to "en".
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
    // No `as` casts here on purpose: languageScriptCode is the real field
    // name on expo-localization's Locale (a cast once hid a typo'd field).
    for (const entry of Localization.getLocales()) {
      const matched = matchDeviceLocale(entry?.languageCode, entry?.languageScriptCode ?? null);
      if (matched) return matched;
    }
    return "en";
  } catch {
    return "en";
  }
}

/**
 * Native persistence is async, so a manual choice saved on a previous run
 * cannot make the synchronous first paint - initI18n applies it as soon as
 * it resolves. Returns null on web (localStorage already answered in
 * detectLanguage) and when nothing valid is stored.
 */
export async function loadNativeLanguagePreference(): Promise<AvailableUiLocale | null> {
  const native = nativeStorage();
  if (!native) return null;
  try {
    const saved = await native.getItem(STORAGE_KEY);
    return isAvailableUiLocale(saved) ? saved : null;
  } catch {
    return null;
  }
}

/** Persist a manual language choice. Best-effort on both runtimes. */
export function saveLanguagePreference(lng: AvailableUiLocale): void {
  try {
    if (typeof globalThis !== "undefined" && typeof (globalThis as { localStorage?: Storage }).localStorage !== "undefined") {
      (globalThis as { localStorage: Storage }).localStorage.setItem(STORAGE_KEY, lng);
    }
  } catch {
    // ignore
  }
  const native = nativeStorage();
  if (native) {
    native.setItem(STORAGE_KEY, lng).catch(() => {
      // best-effort: the next launch falls back to device detection
    });
  }
}
