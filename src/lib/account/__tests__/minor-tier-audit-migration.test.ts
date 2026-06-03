// Static structural assertions for db/migrations/0038_minor_tier_guard_and_audit_lockdown.sql
// (same cheap regression guard as the other migration tests; behaviour is
// exercised on a real DB). Guards the two round-3 HIGH fixes from silently
// regressing in CI:
//   A1 — minor_tier is server-only + the clamp keys off the real (OLD) tier.
//   A2 — the forgeable client INSERT policy is gone, replaced by a SECURITY
//        DEFINER RPC that stamps user_id server-side.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(
  join(__dirname, "..", "..", "..", "..", "db", "migrations", "0038_minor_tier_guard_and_audit_lockdown.sql"),
  "utf8",
);

describe("0038_minor_tier_guard_and_audit_lockdown.sql — structure", () => {
  test("A1(a): block_self_tier_change rejects a standalone minor_tier self-write", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.block_self_tier_change\(\)/);
    // minor_tier change is blocked only when birth_date is NOT also changing
    // (the age-gate path stays allowed).
    expect(sql).toMatch(/NEW\.minor_tier IS DISTINCT FROM OLD\.minor_tier/);
    expect(sql).toMatch(/NEW\.birth_date IS NOT DISTINCT FROM OLD\.birth_date/);
    // existing protections must be preserved (regression guard)
    expect(sql).toMatch(/NEW\.judge_mode IS DISTINCT FROM OLD\.judge_mode/);
    expect(sql).toMatch(/NEW\.total_xp IS DISTINCT FROM OLD\.total_xp/);
  });

  test("A1(a): the guard keeps the NULL-safe xp marker + service_role early return", () => {
    expect(sql).toMatch(/current_setting\('app\.allow_xp_write', true\) IS NOT DISTINCT FROM '1'/);
    expect(sql).toMatch(/request\.jwt\.claim\.role.*=.*'service_role'/);
  });

  test("A1(b): clamp keys off the real (OLD) tier, falling back to NEW on insert", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION clamp_minor_privacy_prefs\(\)/);
    expect(sql).toMatch(/COALESCE\(OLD\.minor_tier, NEW\.minor_tier\) = 'minor_self'/);
    // long_term_memory must still NOT be hard-clamped (a minor may promote it)
    const clampBlock = sql.slice(sql.indexOf("clamp_minor_privacy_prefs"));
    expect(clampBlock).not.toContain("'long_term_memory', false");
  });

  test("A2: the forgeable authenticated INSERT policy is dropped", () => {
    expect(sql).toMatch(/DROP POLICY IF EXISTS audit_owner_insert ON ai_audit_log/);
    expect(sql).toMatch(/ALTER TABLE public\.ai_audit_log ENABLE ROW LEVEL SECURITY/);
  });

  test("A2: log_ai_audit is SECURITY DEFINER, stamps auth.uid(), and is authenticated-only", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.log_ai_audit\(/);
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/SET search_path = ''/);
    // user_id is server-stamped, never a parameter
    expect(sql).toMatch(/user_id[\s\S]*VALUES \(\s*auth\.uid\(\)/);
    expect(sql).not.toMatch(/p_user_id/);
    // zone validated + cast to the enum
    expect(sql).toMatch(/p_safety_zone NOT IN \('green', 'yellow', 'red'\)/);
    expect(sql).toMatch(/p_safety_zone::public\.safety_zone/);
    // blanket grant revoked, execute granted only to authenticated
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.log_ai_audit\([\s\S]*\) FROM public/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.log_ai_audit\([\s\S]*\) TO authenticated/);
  });
});
