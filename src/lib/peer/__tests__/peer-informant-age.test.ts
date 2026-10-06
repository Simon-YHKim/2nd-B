// The informant screen's age gate must never be looser than peer-respond.
//
// Before 2026-10-05 the screen refused `yearAge < 14` while the Edge refuses
// `yearAge <= 14`, so a year difference of exactly 14 filled the whole form and
// then got a 403 shown as a generic send error. The guardian row had the same
// gap at 18. These tests pin the pure gate to the boundaries and pin both
// numbers to the Edge source, so changing one side alone fails here.
//
// The year matters as much as the comparison: the Edge subtracts from the UTC
// year of each request, and the screen used to subtract from the device's local
// year frozen at load. With the `<= 14` floor that refused, around New Year on
// a device west of UTC, a birth year the server accepts.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  INFORMANT_ADULT_AGE,
  MIN_INFORMANT_AGE,
  informantAgeGate,
  informantCurrentYear,
} from "../informant-age";

const root = join(__dirname, "..", "..", "..", "..");
const EDGE = readFileSync(join(root, "supabase", "functions", "peer-respond", "index.ts"), "utf8");
const SCREEN = readFileSync(join(root, "src", "app", "peer", "[token].tsx"), "utf8");
const YEAR = 2026;

// One instant on a device whose local calendar and UTC calendar disagree, as
// they do for some hours around New Year. Jest cannot change TZ in-process, so
// the two years are given directly.
const deviceAt = (utcYear: number, localYear: number) =>
  ({ getUTCFullYear: () => utcYear, getFullYear: () => localYear }) as unknown as Date;
// peer-respond for the same instant: `nowYear - birthYear` with the UTC year.
const serverYearAge = (now: Date, birthYear: number) => now.getUTCFullYear() - birthYear;

describe("informantAgeGate", () => {
  test("refuses the ambiguous floor year the server refuses", () => {
    expect(informantAgeGate(String(YEAR - 13), YEAR).tooYoung).toBe(true);
    // Year difference 14: really 13 or 14. The server answers 403 too_young.
    expect(informantAgeGate(String(YEAR - 14), YEAR).tooYoung).toBe(true);
    expect(informantAgeGate(String(YEAR - 15), YEAR).tooYoung).toBe(false);
  });

  test("asks for a guardian through the ambiguous adult year", () => {
    expect(informantAgeGate(String(YEAR - 15), YEAR).yearMinor).toBe(true);
    // Year difference 18: really 17 or 18. The server requires guardian consent.
    expect(informantAgeGate(String(YEAR - 18), YEAR).yearMinor).toBe(true);
    expect(informantAgeGate(String(YEAR - 19), YEAR).yearMinor).toBe(false);
  });

  test("decides nothing until the year looks real", () => {
    for (const text of ["", "20", "1899", String(YEAR + 1), "abcd"]) {
      const gate = informantAgeGate(text, YEAR);
      expect([text, gate.yearLooksReal, gate.yearAge, gate.tooYoung, gate.yearMinor])
        .toEqual([text, false, null, false, false]);
    }
    expect(informantAgeGate("1900", YEAR).yearLooksReal).toBe(true);
    expect(informantAgeGate(String(YEAR), YEAR).tooYoung).toBe(true);
  });

  test("uses the Edge's numbers and its inclusive comparisons", () => {
    expect(EDGE).toMatch(new RegExp(`const MIN_INFORMANT_AGE = ${MIN_INFORMANT_AGE};`));
    expect(EDGE).toMatch(new RegExp(`const ADULT_AGE = ${INFORMANT_ADULT_AGE};`));
    expect(EDGE).toMatch(/if \(yearAge <= MIN_INFORMANT_AGE\)/);
    expect(EDGE).toMatch(/yearAge <= ADULT_AGE/);
  });

  test("the screen sends and gates on the derived minor flag, not the checkbox alone", () => {
    expect(SCREEN).toContain("informantAgeGate(birthYear, informantCurrentYear())");
    expect(SCREEN).toContain("const needsGuardian = minor || yearMinor;");
    expect(SCREEN).toContain("(!needsGuardian || guardian)");
    expect(SCREEN).toContain("informantIsMinor: needsGuardian,");
    expect(SCREEN).toContain("{needsGuardian ? (");
    // The loose comparison that shipped must not come back.
    expect(SCREEN).not.toMatch(/approxAge < MIN_INFORMANT_AGE/);
    expect(SCREEN).not.toMatch(/informantIsMinor: minor,/);
  });

  test("the screen reads the UTC year inside the component, not a local year at load", () => {
    const component = SCREEN.indexOf("export default function PeerInformant()");
    expect(component).toBeGreaterThan(-1);
    expect(SCREEN.indexOf("informantAgeGate(birthYear, informantCurrentYear())")).toBeGreaterThan(component);
    expect(SCREEN).not.toMatch(/getFullYear\(\)/);
    expect(SCREEN).not.toMatch(/^const CURRENT_YEAR\b/m);
  });
});

describe("informantCurrentYear", () => {
  test("reads the UTC year the server reads, not the device's local year", () => {
    expect(informantCurrentYear(deviceAt(2027, 2026))).toBe(2027);
    expect(informantCurrentYear(deviceAt(2026, 2027))).toBe(2026);
    expect(informantCurrentYear(new Date("2027-01-01T01:00:00Z"))).toBe(2027);
    expect(informantCurrentYear(new Date("2026-12-31T20:00:00Z"))).toBe(2026);
  });

  test("agrees with the server at the UTC New Year on either side of UTC", () => {
    // 2027-01-01 01:00 UTC: a UTC-8 device is still on 2026-12-31.
    const west = deviceAt(2027, 2026);
    // 2026-12-31 20:00 UTC: a UTC+9 device is already on 2027-01-01.
    const east = deviceAt(2026, 2027);
    for (const now of [west, east]) {
      for (const birthYear of [2008, 2009, 2011, 2012, 2013]) {
        const gate = informantAgeGate(String(birthYear), informantCurrentYear(now));
        const server = serverYearAge(now, birthYear);
        expect([birthYear, gate.tooYoung, gate.yearMinor])
          .toEqual([birthYear, server <= MIN_INFORMANT_AGE, server <= INFORMANT_ADULT_AGE]);
      }
    }
    // The gate finding's case: born 2012, the server sees 15 and accepts it.
    expect(informantAgeGate("2012", informantCurrentYear(west)).tooYoung).toBe(false);
  });

  test("the Edge subtracts from the UTC year of each request", () => {
    expect(EDGE).toMatch(/const nowYear = new Date\(\)\.getUTCFullYear\(\);/);
    expect(EDGE).toMatch(/const yearAge = nowYear - birthYear;/);
  });
});
