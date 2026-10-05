// The language the UI is actually painted in (R2B-02 · R2B-01, 2026-10-05).
//
// WHY THIS EXISTS. Screens that keep their own es/pt/id copy in code (career
// drill-down, processing log, domain star, capture, the avatar palette date,
// the IPIP facet note) picked it with `i18n.resolvedLanguage ?? i18n.language`.
// For a lazy locale that read EN on every launch:
//
//   initI18n() calls i18next.init({ resources: en+ko, lng: "pt" }). i18next
//   fixes resolvedLanguage once, inside init, to the first language in the
//   chain that HAS resources -> "en". The pt pack is attached afterwards with
//   addResourceBundle (index.ts LAZY_PACKS), and nothing in i18next recomputes
//   resolvedLanguage when a bundle is added. Only an explicit changeLanguage
//   does, and initI18n must not call it (a DETECTED locale is never persisted
//   as a choice - pack-gate.ts). So t() painted pt while those screens painted
//   EN, until the user tapped the language again in settings.
//
// The answer cannot be plain `i18n.language` either: when a lazy chunk fails
// (offline, stale deploy) or has not landed yet, language is still "pt" while
// fallbackLng paints EN. This helper returns what is really on screen: the
// active locale when its bundles are attached, EN otherwise. The same value
// stamps <html lang> (index.ts), because screen readers pick their voice from
// it and a voice that does not match the painted text is the defect R2B-01
// describes.
//
// Rule: in src/, read the UI language through this helper, never through
// `resolvedLanguage` (ui-language.test.ts scans for it).

import { isAvailableUiLocale, type AvailableUiLocale } from "./locales";

/** The slice of an i18next instance this needs. Test stubs may omit the method. */
export interface UiLanguageSource {
  language?: string | null;
  hasResourceBundle?: (lng: string, ns: string) => boolean;
}

function shippedLocaleOf(tag: string | null | undefined): AvailableUiLocale | null {
  if (typeof tag !== "string" || tag.length === 0) return null;
  if (isAvailableUiLocale(tag)) return tag;
  const base = tag.toLowerCase().split("-")[0];
  return isAvailableUiLocale(base) ? base : null;
}

/**
 * The shipped locale the UI is painted in right now.
 *
 * - the active language when it is shipped and its bundles are attached;
 * - "en" (fallbackLng) when it is not shipped, or its pack is not attached yet
 *   or failed to load.
 *
 * A source without `hasResourceBundle` (a test stub) is trusted as-is.
 */
export function renderedUiLanguage(i18n: UiLanguageSource | null | undefined): AvailableUiLocale {
  const lng = shippedLocaleOf(i18n?.language);
  if (!lng) return "en";
  const has = i18n?.hasResourceBundle;
  if (typeof has !== "function") return lng;
  try {
    // A pack attaches every namespace in one synchronous loop
    // (ensureLocalePack), so "common" stands for the whole pack.
    return has.call(i18n, lng, "common") ? lng : "en";
  } catch {
    return "en";
  }
}
