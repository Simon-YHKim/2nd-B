// Static structural assertions for db/migrations/0040_insert_guard_and_crisis_rpc.sql
// (cheap regression guard; behaviour is exercised on a real DB). Guards the two
// round-4 HIGH DB fixes from silently regressing in CI:
//   H2 — users INSERT self-escalation is blocked (paid tier / XP forced to safe
//        defaults for non-service_role INSERTs).
//   H3 — crisis_events is written via a SECURITY DEFINER RPC (the RLS-deny-all
//        table was silently dropping every client-side RED log).

import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(
  join(__dirname, "..", "..", "..", "..", "db", "migrations", "0040_insert_guard_and_crisis_rpc.sql"),
  "utf8",
);

describe("0040_insert_guard_and_crisis_rpc.sql — structure", () => {
  test("H2: a BEFORE INSERT guard forces the server-controlled columns to safe defaults", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.block_self_tier_insert\(\)/);
    expect(sql).toMatch(/BEFORE INSERT ON users/);
    // service_role bypasses (server-side user creation must still work)
    expect(sql).toMatch(/request\.jwt\.claim\.role.*=.*'service_role'/);
    // each escalation target is forced to its safe default
    expect(sql).toMatch(/NEW\.subscription_tier := 'free'/);
    expect(sql).toMatch(/NEW\.subscription_expires_at := NULL/);
    expect(sql).toMatch(/NEW\.subscription_provider := NULL/);
    expect(sql).toMatch(/NEW\.total_xp := 0/);
    expect(sql).toMatch(/NEW\.onboarding_quest_completed_at := NULL/);
  });

  test("H3: log_crisis_event is SECURITY DEFINER, stamps identity server-side, hardcodes red", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.log_crisis_event\(/);
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/SET search_path = ''/);
    // user_id_hash derived from the authenticated caller, never a parameter
    expect(sql).toMatch(/md5\(auth\.uid\(\)::text\)/);
    expect(sql).not.toMatch(/p_user_id_hash/);
    // zone hardcoded to 'red' (the table's CHECK) + locale validated
    expect(sql).toMatch(/'red'/);
    expect(sql).toMatch(/p_locale NOT IN \('ko', 'en'\)/);
  });

  test("H3: log_crisis_event is callable only by authenticated (anon + service_role revoked)", () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.log_crisis_event\([\s\S]*\) FROM anon/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.log_crisis_event\([\s\S]*\) FROM service_role/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.log_crisis_event\([\s\S]*\) TO authenticated/);
  });
});
