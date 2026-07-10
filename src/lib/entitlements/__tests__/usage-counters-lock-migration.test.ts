// Structural guard for db/migrations/0078_usage_counters_lock_writes.sql - direct
// client writes to usage_counters are revoked so reasoning_used / reward_credits
// can only change through the server-owned RPCs (audit S1/M4, decision D1 Stage 3).

import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(
  join(__dirname, "..", "..", "..", "..", "db", "migrations", "0078_usage_counters_lock_writes.sql"),
  "utf8",
);

describe("0078_usage_counters_lock_writes.sql - structure", () => {
  test("revokes direct INSERT/UPDATE on usage_counters from authenticated", () => {
    expect(sql).toMatch(/REVOKE INSERT, UPDATE ON public\.usage_counters FROM authenticated/);
  });

  test("drops the write RLS policies so the write path is unambiguously RPC-only", () => {
    expect(sql).toMatch(/DROP POLICY IF EXISTS usage_counters_owner_insert ON public\.usage_counters/);
    expect(sql).toMatch(/DROP POLICY IF EXISTS usage_counters_owner_update ON public\.usage_counters/);
  });

  test("does not revoke SELECT (the remaining-usage UI still reads)", () => {
    expect(sql).not.toMatch(/REVOKE[^\n]*SELECT[^\n]*usage_counters/);
  });

  test("documents the deploy order (client-first)", () => {
    expect(sql).toMatch(/DEPLOY ORDER/i);
  });
});
