import { recommendationsAllowed } from "../recommend";

// D-20 (PROTOCOL §36): runRecommend must call recommendationsAllowed() before
// exportUserWiki/callGemini so a 14-17 minor's wiki snapshot never reaches the
// recommend LLM call ungated. `recommendations` is server-clamped OFF and
// non-promotable for minors (privacy/prefs.ts), so a minor can never pass.
describe("recommendationsAllowed (minor recommendations lock honored at the ops gate)", () => {
  test("minor is blocked while recommendations is not explicitly enabled (it is server-locked false)", () => {
    expect(recommendationsAllowed(true, false)).toBe(false);
    expect(recommendationsAllowed(true, undefined)).toBe(false);
    expect(recommendationsAllowed(true, null)).toBe(false);
  });

  test("defensive: a minor with recommendations somehow true would pass (the lock lives in the prefs contract, not this gate)", () => {
    expect(recommendationsAllowed(true, true)).toBe(true);
  });

  test("adults now opt in too (D-25 / the D-20 follow-up): OFF by default, allowed only when explicitly enabled", () => {
    expect(recommendationsAllowed(false, false)).toBe(false);
    expect(recommendationsAllowed(false, undefined)).toBe(false);
    expect(recommendationsAllowed(false, true)).toBe(true);
  });

  test("unresolved status (loading) is fail-closed: OFF until the pref is explicitly enabled", () => {
    expect(recommendationsAllowed(undefined, false)).toBe(false);
    expect(recommendationsAllowed(null, undefined)).toBe(false);
    expect(recommendationsAllowed(undefined, true)).toBe(true);
  });
});
