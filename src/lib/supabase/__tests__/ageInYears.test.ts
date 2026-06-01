// C10: age gate. The only client-side check before the DB CHECK constraint.
// Bugs here let underage users complete sign-up before the network round trip.

import { ageInYears } from "../auth";

describe("ageInYears", () => {
  const today = new Date("2026-05-25T12:00:00Z");

  test("exactly 18 today returns 18", () => {
    expect(ageInYears("2008-05-25", today)).toBe(18);
  });

  test("18th birthday tomorrow returns 17", () => {
    expect(ageInYears("2008-05-26", today)).toBe(17);
  });

  test("18th birthday yesterday returns 18", () => {
    expect(ageInYears("2008-05-24", today)).toBe(18);
  });

  test("clearly adult returns positive", () => {
    expect(ageInYears("1990-01-01", today)).toBeGreaterThanOrEqual(36);
  });

  test("future date returns negative", () => {
    expect(ageInYears("2030-01-01", today)).toBeLessThan(0);
  });

  test("malformed date returns -1", () => {
    expect(ageInYears("not-a-date", today)).toBe(-1);
    expect(ageInYears("", today)).toBe(-1);
  });

  test("leap-year birthday — non-leap target year clamps to last of Feb", () => {
    // Born 2008-02-29 (leap). 2026 is non-leap. dayjs clamps the anniversary
    // to 2026-02-28, so the gate opens on 2026-02-28 (one day "earlier").
    // This is acceptable: ageInYears reports whole years; a person is treated
    // as having turned N on the closest valid calendar day. (The sign-up floor
    // is MIN_SELF_CONSENT_AGE = 14; these cases exercise the boundary math at
    // an example age, not the policy threshold.)
    expect(ageInYears("2008-02-29", new Date("2026-02-27T12:00:00Z"))).toBe(17);
    expect(ageInYears("2008-02-29", new Date("2026-02-28T12:00:00Z"))).toBe(18);
    expect(ageInYears("2008-02-29", new Date("2026-03-01T12:00:00Z"))).toBe(18);
  });
});
