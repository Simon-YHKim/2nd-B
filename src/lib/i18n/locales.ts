// Locale registry (O-R2 ② language-pack infrastructure).
//
// Two-layer split, decided 2026-06-11 (Simon gate resolution):
//   - UiLocale     = the 12 display languages the product will offer
//                    (usage-ranked top-10 + existing EN/KO; merged
//                    representatives: zh-Hans for Chinese, hi for
//                    Hindi/Urdu, id for Malay family).
//   - SystemLocale = "en" | "ko" ONLY. The LLM prompts, safety classifier,
//                    crisis/hotline routing, audit rows, consent records and
//                    the gemini-proxy contract all stay on this pair; every
//                    other UI locale maps onto it via systemLocaleFor().
//                    Do NOT widen SystemLocale when adding a pack.
//
// AVAILABLE_UI_LOCALES is the shipped subset: a locale joins it in the same
// PR that adds its complete locales/<code>/ bundle set (check-i18n-keys
// enforces full EN parity for every shipped folder). The language picker
// renders from this list, so options appear exactly when their packs land.

export type SystemLocale = "en" | "ko";

export const UI_LOCALES = [
  "en",
  "ko",
  "zh-Hans",
  "es",
  "hi",
  "ar",
  "pt",
  "ru",
  "ja",
  "fr",
  "de",
  "id",
] as const;
export type UiLocale = (typeof UI_LOCALES)[number];

export const AVAILABLE_UI_LOCALES = ["en", "ko", "es", "pt"] as const satisfies readonly UiLocale[];
export type AvailableUiLocale = (typeof AVAILABLE_UI_LOCALES)[number];

export interface UiLocaleMeta {
  /** Self-representing label - shown in the picker in its own language. */
  nativeName: string;
  /** Right-to-left script. Drives the I18nManager work in the AR pack cycle. */
  rtl: boolean;
  /**
   * Machine-translated pack pending human review - the picker appends the
   * beta tag (default policy per Simon, 2026-06-11). safety/consent
   * namespaces are never machine-translated; they stay EN/KO.
   */
  beta: boolean;
}

export const UI_LOCALE_META: Record<UiLocale, UiLocaleMeta> = {
  en: { nativeName: "English", rtl: false, beta: false },
  ko: { nativeName: "한국어", rtl: false, beta: false },
  "zh-Hans": { nativeName: "简体中文", rtl: false, beta: true },
  es: { nativeName: "Español", rtl: false, beta: true },
  hi: { nativeName: "हिन्दी", rtl: false, beta: true },
  ar: { nativeName: "العربية", rtl: true, beta: true },
  pt: { nativeName: "Português", rtl: false, beta: true },
  ru: { nativeName: "Русский", rtl: false, beta: true },
  ja: { nativeName: "日本語", rtl: false, beta: true },
  fr: { nativeName: "Français", rtl: false, beta: true },
  de: { nativeName: "Deutsch", rtl: false, beta: true },
  id: { nativeName: "Bahasa Indonesia", rtl: false, beta: true },
};

export function isAvailableUiLocale(value: unknown): value is AvailableUiLocale {
  return (
    typeof value === "string" &&
    (AVAILABLE_UI_LOCALES as readonly string[]).includes(value)
  );
}

/**
 * Collapse any locale tag onto the system pair. "ko" (and regional variants
 * like "ko-KR") stay Korean; every other language renders prompts, safety
 * classification and hotline routing through the EN path - identical to the
 * pre-split behavior, now as an explicit, greppable seam.
 */
export function systemLocaleFor(localeTag: string | null | undefined): SystemLocale {
  if (typeof localeTag === "string" && (localeTag === "ko" || localeTag.startsWith("ko-"))) {
    return "ko";
  }
  return "en";
}

/**
 * Map a device-reported language (expo-localization getLocales entry) onto a
 * SHIPPED UI locale, or null so the caller can walk the next device
 * preference. Chinese needs the script axis: Hans maps to zh-Hans, Hant has
 * no pack (null); a missing script defaults to Hans (mainland convention).
 */
export function matchDeviceLocale(
  languageCode: string | null | undefined,
  scriptCode?: string | null,
): AvailableUiLocale | null {
  if (!languageCode) return null;
  const candidate =
    languageCode === "zh"
      ? scriptCode === "Hant"
        ? null
        : "zh-Hans"
      : languageCode;
  return isAvailableUiLocale(candidate) ? candidate : null;
}
