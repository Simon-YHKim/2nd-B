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

  test("the pref key set is the honest, enforced-or-intentional contract", () => {
    // Guard against drift. Task D (2026-07-01) pruned llm_training /
    // persona_export / persona_share (declared but never read/enforced — false
    // privacy promises). The 0032 minor seed may still write those keys into old
    // rows, but they are inert here (resolvePrivacyPrefs drops unknown keys), so
    // no migration is required for the app contract. Keys MUST stay listed here on
    // purpose.
    expect([...PRIVACY_PREF_KEYS]).toEqual([
      "ads",
      "sharing",
      "recommendations",
      "external_analytics",
      "long_term_memory",
      "ops_push",
      "health_import",
      // D5: records semantic-embedding consent. Enforced (records-embeddings.ts
      // recordsEmbeddingAllowed), NOT yet visible (no toggle until consent copy
      // ships) — so it is an intentional, read/enforced key, not a false promise.
      "records_embedding",
    ]);
  });

  describe("minor lock (task B1)", () => {
    test("adults may toggle every key", () => {
      for (const k of PRIVACY_PREF_KEYS) {
        expect(isPrivacyPrefEditable(k, false)).toBe(true);
      }
    });

    test("minors may promote only the device-local exceptions; outward keys stay locked", () => {
      for (const k of PRIVACY_PREF_KEYS) {
        const editable = isPrivacyPrefEditable(k, true);
        expect(editable).toBe(k === "long_term_memory" || k === "ops_push");
      }
    });

    test("the minor-promotable exceptions are exactly long_term_memory and ops_push", () => {
      // ops_push hands an on-screen-approved item to the user's OWN device
      // calendar/share sheet (no outward data flow) - Simon, 2026-06-11.
      expect([...MINOR_PROMOTABLE_KEYS]).toEqual(["long_term_memory", "ops_push"]);
    });
  });
});
