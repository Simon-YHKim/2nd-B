import {
  consentFloorForCountry,
  resolveJurisdiction,
  type ConsentFloor,
} from "./consent-age";
import { CONSENT_AGE_TABLE } from "./consent-age-table";

/**
 * The user could not find their residence in the researched table. This is a
 * UI-only sentinel: it is never persisted or sent to Supabase. `ZZ` is kept
 * inside this module as the conservative `country-no-row` representative.
 */
export const RESIDENCE_COUNTRY_NOT_LISTED = "__not-listed__" as const;

export type ResidenceCountrySelection =
  | string
  | typeof RESIDENCE_COUNTRY_NOT_LISTED;

/** Countries for which the generated C10 table has a researched row. */
export const RESIDENCE_COUNTRY_CODES: readonly string[] = Object.freeze(
  Object.keys(CONSENT_AGE_TABLE).sort(),
);

const RESEARCHED_COUNTRIES = new Set(RESIDENCE_COUNTRY_CODES);
const CONSERVATIVE_NO_ROW_COUNTRY = "ZZ";
export const RESIDENCE_COUNTRY_NOT_LISTED_MIN_AGE = consentFloorForCountry(
  CONSERVATIVE_NO_ROW_COUNTRY,
).effectiveAge;

/**
 * Recover a registration floor only when the device supplied no region.
 *
 * A readable device region remains the chosen C10 signal and cannot be
 * weakened or replaced by form state. An unreadable region remains unresolved
 * until the user chooses a researched country or the conservative “not listed”
 * path. Unexpected strings also fail conservatively to 18 rather than ever
 * creating a lower floor.
 */
export function resolveRegistrationConsentFloor(
  residenceCountry?: ResidenceCountrySelection | null,
  detectedFloor: ConsentFloor = resolveJurisdiction(),
): ConsentFloor | null {
  if (detectedFloor.source !== "region-unreadable") return detectedFloor;
  if (residenceCountry === null || residenceCountry === undefined) return null;

  const country = residenceCountry.trim().toUpperCase();
  if (country === RESIDENCE_COUNTRY_NOT_LISTED.toUpperCase()) {
    return consentFloorForCountry(CONSERVATIVE_NO_ROW_COUNTRY);
  }
  if (!RESEARCHED_COUNTRIES.has(country)) {
    return consentFloorForCountry(CONSERVATIVE_NO_ROW_COUNTRY);
  }
  return consentFloorForCountry(country);
}
