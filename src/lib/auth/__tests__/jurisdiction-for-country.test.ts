// H6 / J1: the country signal that resolveJurisdiction() never had.
//
// These pin the ASYMMETRY, which is the whole safety property here: a wrong row
// that is too LOW admits someone who cannot legally consent, while a row that is
// too high only turns away someone who could. So every unverified country must
// land on the ceiling, and nothing may quietly drop below it.
import { digitalConsentAge, jurisdictionForCountry } from "../consent-age";

describe("jurisdictionForCountry", () => {
  it("maps the two countries whose floors are settled law", () => {
    expect(jurisdictionForCountry("KR")).toBe("KR"); // PIPA 22-2
    expect(jurisdictionForCountry("US")).toBe("US"); // COPPA
  });

  it("puts every EEA state and the UK on the Art.8 ceiling, not a per-country guess", () => {
    // France and Ireland are the two that public sources disagreed about on
    // 2026-08-16 (15 vs 16, and 13 vs 16). Both must sit at 16 until a source
    // Simon signed off on says otherwise — being too strict is survivable.
    for (const cc of ["FR", "IE", "DE", "NL", "GR", "CZ", "PL", "IS", "NO", "LI", "GB"]) {
      expect(jurisdictionForCountry(cc)).toBe("EU");
      expect(digitalConsentAge(jurisdictionForCountry(cc))).toBe(16);
    }
  });

  it("returns null for anything it does not recognise, so the caller decides", () => {
    expect(jurisdictionForCountry("JP")).toBeNull();
    expect(jurisdictionForCountry("BR")).toBeNull();
    expect(jurisdictionForCountry(null)).toBeNull();
    expect(jurisdictionForCountry("")).toBeNull();
    expect(jurisdictionForCountry("KOR")).toBeNull(); // alpha-3 is not alpha-2
  });

  it("accepts the casing and whitespace a platform might actually hand back", () => {
    expect(jurisdictionForCountry("kr")).toBe("KR");
    expect(jurisdictionForCountry(" de ")).toBe("EU");
  });

  it("never returns a floor below 13 for any input", () => {
    const inputs = ["KR", "US", "FR", "JP", "", null, "ZZ", "gb"];
    for (const cc of inputs) {
      const j = jurisdictionForCountry(cc);
      expect(digitalConsentAge(j)).toBeGreaterThanOrEqual(13);
    }
  });
});
