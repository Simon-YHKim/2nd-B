// Structural guard for db/migrations/0077_reasoning_cap_server_derived.sql - the
// reasoning cap is now derived SERVER-SIDE from the user's tier and the RPC is
// adopted by the client (audit M1, decision D1 Stage 2). Supersedes 0070's
// client-supplied-cap RPC (0070's own file/test is left as historical record).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { reasoningCapForTier } from "../reasoning-cap";

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

  test("per-tier caps match src/lib/entitlements/reasoning-cap.ts", () => {
    // brain is unlimited (null cap) -> NULL branch, incremented without a gate
    expect(reasoningCapForTier("brain")).toBeNull();
    expect(sql).toMatch(/WHEN 'brain'\s+THEN NULL/);
    expect(sql).toMatch(/IF v_cap IS NULL THEN/);
    expect(sql).toMatch(new RegExp(`WHEN 'cortex'\\s+THEN ${reasoningCapForTier("cortex")}\\b`));
    expect(sql).toMatch(new RegExp(`WHEN 'soma'\\s+THEN ${reasoningCapForTier("soma")}\\b`));
    expect(sql).toMatch(new RegExp(`ELSE ${reasoningCapForTier("free")}\\b`));
  });

  test("raises reasoning_limit_exceeded and is authenticated-only", () => {
    expect(sql).toMatch(/RAISE EXCEPTION 'reasoning_limit_exceeded'/);
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.bump_reasoning_usage_if_under_cap[\s\S]*FROM PUBLIC/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.bump_reasoning_usage_if_under_cap[\s\S]*TO authenticated/);
  });
});
