// Age gate for the no-account peer informant (src/app/peer/[token].tsx).
//
// The informant gives a birth YEAR only, so the age is `currentYear - year`,
// and before the birthday that number is one higher than the real age. The
// server (supabase/functions/peer-respond/index.ts) therefore treats the
// ambiguous boundary as the younger side: it refuses `yearAge <= 14` (C10
// floor) and requires guardian consent for `yearAge <= 18`. The screen used to
// refuse only `< 14`, so a year difference of exactly 14 passed the screen and
// then got a 403 that the screen shows as a generic send error. The same gap
// existed at 18 (guardian row hidden, server answers guardian_required).
//
// This module is the screen's copy of those two comparisons. It is a pure
// function so the boundaries can be tested without rendering the screen, and
// peer-informant-age.test.ts pins it to the Edge source.

/** C10 floor, the same number the Edge uses. */
export const MIN_INFORMANT_AGE = 14;
/** At or below this year difference the informant may be a minor. */
export const INFORMANT_ADULT_AGE = 18;

const OLDEST_BIRTH_YEAR = 1900;

/**
 * The year peer-respond subtracts from: `new Date().getUTCFullYear()`, read on
 * every request. The screen used the device's local year, read once when the
 * module loaded. Around New Year those differ by one: at 2027-01-01 01:00 UTC a
 * device at UTC-8 is still on 2026-12-31, so with the `<= 14` floor it refused
 * a 2012 birth year the server accepts (2027 - 2012 = 15), and a device east of
 * UTC let through a year the server refuses. Read the UTC year on every render,
 * never once at load. A form left open across New Year keeps the older year
 * only until its next render, and an older year can only be stricter than the
 * server (the year difference only grows), never looser.
 */
export function informantCurrentYear(now: Date = new Date()): number {
  return now.getUTCFullYear();
}

export interface InformantAgeGate {
  /** Parsed birth year, or NaN when the field is not a number. */
  year: number;
  /** A four-digit year between 1900 and the current year. */
  yearLooksReal: boolean;
  /** `currentYear - year` when the year looks real. One higher than the real age before the birthday. */
  yearAge: number | null;
  /** The server refuses this year (C10 floor, conservative side). */
  tooYoung: boolean;
  /** The server treats this year as a minor and requires guardian consent. */
  yearMinor: boolean;
}

export function informantAgeGate(birthYearText: string, currentYear: number): InformantAgeGate {
  const year = Number.parseInt(birthYearText, 10);
  const yearLooksReal = Number.isInteger(year) && year >= OLDEST_BIRTH_YEAR && year <= currentYear;
  const yearAge = yearLooksReal ? currentYear - year : null;
  return {
    year,
    yearLooksReal,
    yearAge,
    tooYoung: yearAge != null && yearAge <= MIN_INFORMANT_AGE,
    yearMinor: yearAge != null && yearAge <= INFORMANT_ADULT_AGE,
  };
}
