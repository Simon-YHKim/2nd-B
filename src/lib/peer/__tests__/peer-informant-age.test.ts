// The informant screen's age gate must never be looser than peer-respond.
//
// Before 2026-10-05 the screen refused `yearAge < 14` while the Edge refuses
// `yearAge <= 14`, so a year difference of exactly 14 filled the whole form and
// then got a 403 shown as a generic send error. The guardian row had the same
// gap at 18. These tests pin the pure gate to the boundaries and pin both
// numbers to the Edge source, so changing one side alone fails here.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { INFORMANT_ADULT_AGE, MIN_INFORMANT_AGE, informantAgeGate } from "../informant-age";

const root = join(__dirname, "..", "..", "..", "..");
const EDGE = readFileSync(join(root, "supabase", "functions", "peer-respond", "index.ts"), "utf8");
const SCREEN = readFileSync(join(root, "src", "app", "peer", "[token].tsx"), "utf8");
const YEAR = 2026;

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
    expect(SCREEN).toContain("informantAgeGate(birthYear, CURRENT_YEAR)");
    expect(SCREEN).toContain("const needsGuardian = minor || yearMinor;");
    expect(SCREEN).toContain("(!needsGuardian || guardian)");
    expect(SCREEN).toContain("informantIsMinor: needsGuardian,");
    expect(SCREEN).toContain("{needsGuardian ? (");
    // The loose comparison that shipped must not come back.
    expect(SCREEN).not.toMatch(/approxAge < MIN_INFORMANT_AGE/);
    expect(SCREEN).not.toMatch(/informantIsMinor: minor,/);
  });
});
