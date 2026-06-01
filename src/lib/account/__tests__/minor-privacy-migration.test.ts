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
    const clampBlock = sql.slice(sql.indexOf("clamp_minor_privacy_prefs"));
    for (const key of PRIVACY_PREF_KEYS) {
      if (MINOR_PROMOTABLE_KEYS.includes(key)) {
        // long_term_memory must NOT be clamped (a minor may promote it)
        expect(clampBlock).not.toContain(`'${key}', false`);
      } else {
        expect(clampBlock).toContain(`'${key}', false`);
      }
    }
  });
});
