// Structural guard for db/migrations/0077_reasoning_cap_server_derived.sql - the
// reasoning cap is now derived SERVER-SIDE from the user's tier and the RPC is
// adopted by the client (audit M1, decision D1 Stage 2). Supersedes 0070's
// client-supplied-cap RPC (0070's own file/test is left as historical record).

import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(
  join(__dirname, "..", "..", "..", "..", "db", "migrations", "0077_reasoning_cap_server_derived.sql"),
  "utf8",
);

describe("0077_reasoning_cap_server_derived.sql - structure", () => {
  test("redefines the atomic reasoning-cap RPC as SECURITY DEFINER with a locked search_path", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.bump_reasoning_usage_if_under_cap/);
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/SET search_path = ''/);
  });

  test("guards the caller uid against the target user", () => {
    expect(sql).toMatch(/auth\.uid\(\) != p_user_id/);
  });

  test("derives the cap from users.subscription_tier server-side (ignores client p_cap)", () => {
    expect(sql).toMatch(/SELECT subscription_tier INTO v_tier FROM public\.users WHERE id = p_user_id/);
    // effective gate uses the server-derived v_cap + reward credits, not p_cap
    expect(sql).toMatch(/WHERE uc\.reasoning_used < v_cap \+ uc\.reward_credits/);
    expect(sql).not.toMatch(/< p_cap \+ uc\.reward_credits/);
  });

  test("per-tier caps carry the 0077-era monthly literals (historical; superseded by 0089 weekly)", () => {
    // brain is unlimited (null cap) -> NULL branch, incremented without a gate
    expect(sql).toMatch(/WHEN 'brain'\s+THEN NULL/);
    expect(sql).toMatch(/IF v_cap IS NULL THEN/);
    // Frozen literals: migration text never changes. The LIVE caps moved to
    // weekly in 0089 (reasoning-weekly-cap-migration.test.ts pins them).
    expect(sql).toMatch(/WHEN 'cortex'\s+THEN 60\b/);
    expect(sql).toMatch(/WHEN 'soma'\s+THEN 60\b/);
    expect(sql).toMatch(/ELSE 30\b/);
  });

  test("raises reasoning_limit_exceeded and is authenticated-only", () => {
    expect(sql).toMatch(/RAISE EXCEPTION 'reasoning_limit_exceeded'/);
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.bump_reasoning_usage_if_under_cap[\s\S]*FROM PUBLIC/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.bump_reasoning_usage_if_under_cap[\s\S]*TO authenticated/);
  });
});
