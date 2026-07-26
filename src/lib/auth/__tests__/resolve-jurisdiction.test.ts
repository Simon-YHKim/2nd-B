// R2: the age gate assumed KR via scattered literal "KR" args. resolveJurisdiction()
// centralizes that assumption into one seam so a future real country signal is a
// one-function change. This pins the safe defaults: unset -> KR (unchanged live
// behavior), and the QA override only accepts the known markets.

import { digitalConsentAge, resolveJurisdiction } from "../consent-age";

describe("resolveJurisdiction seam (R2)", () => {
  const saved = process.env.EXPO_PUBLIC_JURISDICTION;
  afterEach(() => {
    process.env.EXPO_PUBLIC_JURISDICTION = saved;
  });

  test("defaults to KR when unset (live behavior unchanged: floor 14)", () => {
    delete process.env.EXPO_PUBLIC_JURISDICTION;
    expect(resolveJurisdiction()).toBe("KR");
    expect(digitalConsentAge(resolveJurisdiction())).toBe(14);
  });

  test("honors a valid operator override (QA/staging only)", () => {
    for (const [env, want] of [["US", "US"], ["eu", "EU"], [" kr ", "KR"]] as const) {
      process.env.EXPO_PUBLIC_JURISDICTION = env;
      expect(resolveJurisdiction()).toBe(want);
    }
  });

  test("falls back to KR on an unrecognized value (never a surprise floor)", () => {
    process.env.EXPO_PUBLIC_JURISDICTION = "XX";
    expect(resolveJurisdiction()).toBe("KR");
  });
});
