import {
  PRIVACY_PREF_KEYS,
  defaultPrivacyPrefs,
  resolvePrivacyPrefs,
  isPrivacyPrefEditable,
  MINOR_PROMOTABLE_KEYS,
} from "../prefs";

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

  describe("minor lock (task B1)", () => {
    test("adults may toggle every key", () => {
      for (const k of PRIVACY_PREF_KEYS) {
        expect(isPrivacyPrefEditable(k, false)).toBe(true);
      }
    });

    test("minors may only promote long_term_memory; all outward keys are locked", () => {
      for (const k of PRIVACY_PREF_KEYS) {
        const editable = isPrivacyPrefEditable(k, true);
        expect(editable).toBe(k === "long_term_memory");
      }
    });

    test("the only minor-promotable key is long_term_memory", () => {
      expect([...MINOR_PROMOTABLE_KEYS]).toEqual(["long_term_memory"]);
    });
  });
});
