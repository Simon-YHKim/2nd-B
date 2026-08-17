// The country signal the age gate never had.
//
// consent-age.ts documented this gap in its own header for months: "The app does
// not yet collect a reliable jurisdiction signal (locale en/ko is not a country)".
// So resolveJurisdiction() always answered KR, and DIGITAL_CONSENT_AGE.EU never
// applied to anyone. Simon chose the device region as the signal (2026-08-16, J1)
// over a store-country API that this app has no package for and a payment country
// that does not exist until someone pays.
//
// Deliberately its own module with a single dependency: consent-age.ts stays a
// pure table that tests can call without a native module, and the zero-tolerance
// require-cycle gate has nothing to chew on here.
//
// What this is NOT: proof of residence. A device region is a setting, it travels,
// and it can be changed. It is the same class of signal as the self-reported birth
// date it sits next to, and it is used the same way — to pick which floor applies,
// not to verify anyone.
import { getLocales } from "expo-localization";

/**
 * ISO 3166-1 alpha-2 region from the device's locale settings, uppercased.
 * Returns null when the platform reports nothing usable, which is common enough
 * on web that callers must treat it as "unknown", never as a country.
 */
export function deviceRegionCode(): string | null {
  try {
    const locales = getLocales();
    for (const l of locales ?? []) {
      const raw = l?.regionCode;
      if (typeof raw === "string" && /^[A-Za-z]{2}$/.test(raw)) {
        return raw.toUpperCase();
      }
    }
  } catch {
    // getLocales throws on some web/SSR paths. An unreadable region is an
    // unknown region, and unknown is a case the caller already handles.
  }
  return null;
}
