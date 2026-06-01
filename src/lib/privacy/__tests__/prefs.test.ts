import { PRIVACY_PREF_KEYS, defaultPrivacyPrefs, resolvePrivacyPrefs } from "../prefs";

describe("privacy prefs (task D)", () => {
  test("default is privacy-by-design — every key OFF", () => {
    const d = defaultPrivacyPrefs();
    expect(Object.keys(d).sort()).toEqual([...PRIVACY_PREF_KEYS].sort());
    expect(Object.values(d).every((v) => v === false)).toBe(true);
  });

  test("resolve overlays stored booleans; non-booleans fall back to default", () => {
    const r = resolvePrivacyPrefs({ ads: true, recommendations: true, sharing: "yes", bogus: 1 });
    expect(r.ads).toBe(true);
    expect(r.recommendations).toBe(true);
    expect(r.sharing).toBe(false); // non-boolean ignored -> default false
    expect((r as Record<string, unknown>).bogus).toBeUndefined(); // unknown key dropped
  });

  test("null / empty stored resolves to all defaults", () => {
    expect(resolvePrivacyPrefs(null)).toEqual(defaultPrivacyPrefs());
    expect(resolvePrivacyPrefs(undefined)).toEqual(defaultPrivacyPrefs());
    expect(resolvePrivacyPrefs({})).toEqual(defaultPrivacyPrefs());
  });

  test("the seeded minor key set matches the migration (0032)", () => {
    // Guard against drift between src and the SQL jsonb_build_object keys.
    expect([...PRIVACY_PREF_KEYS]).toEqual([
      "ads",
      "sharing",
      "recommendations",
      "external_analytics",
      "llm_training",
      "persona_export",
      "persona_share",
      "long_term_memory",
    ]);
  });
});
