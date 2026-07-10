// Structural guard for db/migrations/0075_reward_credits_cap.sql - the atomic,
// capped rewarded-credit RPC (mirrors 0070's reasoning-cap guard). Closes the
// unlimited self-grant hole (audit M4, decision D1 Stage 1).

import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(
  join(__dirname, "..", "..", "..", "..", "db", "migrations", "0075_reward_credits_cap.sql"),
  "utf8",
);

describe("0075_reward_credits_cap.sql - structure", () => {
  test("defines the reward-credit RPC as SECURITY DEFINER with a locked search_path", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.bump_reward_credits_if_under_cap/);
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/SET search_path = ''/);
  });

  test("guards the caller uid against the target user", () => {
    expect(sql).toMatch(/auth\.uid\(\) != p_user_id/);
  });

  test("clamps the grant to the monthly cap atomically (never exceeds p_cap)", () => {
    expect(sql).toMatch(/ON CONFLICT \(user_id, month_bucket\) DO UPDATE/);
    expect(sql).toMatch(/reward_credits = LEAST\(uc\.reward_credits \+ p_credits, p_cap\)/);
    expect(sql).toMatch(/VALUES \(p_user_id, p_month, LEAST\(p_credits, p_cap\)\)/);
  });

  test("is executable only by authenticated callers", () => {
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.bump_reward_credits_if_under_cap[\s\S]*FROM PUBLIC/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.bump_reward_credits_if_under_cap[\s\S]*TO authenticated/);
  });
});
