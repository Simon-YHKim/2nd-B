// Static structural assertions for db/migrations/0033_minor_privacy_enforcement.sql
// (same cheap regression guard as the other migration tests). Behaviour is
// exercised on a real DB; this guards the search_path hardening + the minor
// privacy-prefs clamp from silently regressing in CI.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { MINOR_PROMOTABLE_KEYS, PRIVACY_PREF_KEYS } from "@/lib/privacy/prefs";

const sql = readFileSync(
  join(__dirname, "..", "..", "..", "..", "db", "migrations", "0033_minor_privacy_enforcement.sql"),
  "utf8",
);

// The clamp + seed are forward-extended by 0050 (Phase B Slice 1 added the
// health_import locked key there, NOT by mutating the already-applied 0033).
// 0050 CREATE OR REPLACEs BOTH functions with the full current key set, so the
// "every locked key is clamped" guard reads 0050 — the authoritative definition.
const sql0050 = readFileSync(
  join(__dirname, "..", "..", "..", "..", "db", "migrations", "0050_health_consent_default.sql"),
  "utf8",
);

describe("0033_minor_privacy_enforcement.sql — structure", () => {
  test("age-gate function is recreated with a fixed (empty) search_path", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION enforce_user_age_tier\(\)/);
    // both functions must pin search_path so neither trips the advisor again
    const pins = sql.match(/LANGUAGE plpgsql SET search_path = ''/g) ?? [];
    expect(pins.length).toBe(2);
  });

  test("keeps the under-14 hard floor", () => {
    expect(sql).toMatch(/age_years < 14/);
    expect(sql).toMatch(/registration requires age >= 14/);
  });

  test("adds a clamp trigger on privacy_prefs writes", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION clamp_minor_privacy_prefs\(\)/);
    expect(sql).toMatch(/BEFORE INSERT OR UPDATE OF privacy_prefs ON users/);
    expect(sql).toMatch(/trg_minor_privacy_clamp/);
  });

  test("clamp only acts on minor_self rows", () => {
    expect(sql).toMatch(/IF NEW\.minor_tier = 'minor_self' THEN/);
  });

  test("clamp forces every locked key false and leaves the promotable key alone", () => {
    // Authoritative current definition: 0050 redefines BOTH clamp + seed with the
    // full key set (incl. health_import). Forward-only — 0033 stays as shipped.
    expect(sql0050).toMatch(/CREATE OR REPLACE FUNCTION clamp_minor_privacy_prefs\(\)/);
    expect(sql0050).toMatch(/CREATE OR REPLACE FUNCTION enforce_user_age_tier\(\)/);
    const clampBlock = sql0050.slice(sql0050.indexOf("clamp_minor_privacy_prefs"));
    for (const key of PRIVACY_PREF_KEYS) {
      if (MINOR_PROMOTABLE_KEYS.includes(key)) {
        // long_term_memory must NOT be clamped (a minor may promote it)
        expect(clampBlock).not.toContain(`'${key}', false`);
      } else {
        expect(clampBlock).toContain(`'${key}', false`);
      }
    }
  });

  test("health_import is a locked key, seeded + clamped false for minors in 0050", () => {
    expect(PRIVACY_PREF_KEYS).toContain("health_import");
    expect(MINOR_PROMOTABLE_KEYS).not.toContain("health_import");
    // present in BOTH the seed (enforce_user_age_tier) and the UPDATE clamp
    expect((sql0050.match(/'health_import', false/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  test("age gate clamps minors on tier change too, not only on insert (DOB-correction gap)", () => {
    // The clamp inside enforce_user_age_tier must run whenever minor_tier is
    // minor_self (covers a birth_date UPDATE into 14-17), not be gated on insert.
    expect(sql).not.toMatch(/TG_OP = 'INSERT' AND NEW\.minor_tier/);
    // and it preserves the promotable key rather than hard-forcing it false
    expect(sql).toMatch(/'long_term_memory', COALESCE\(\(NEW\.privacy_prefs ->> 'long_term_memory'\)::boolean, false\)/);
  });
});
