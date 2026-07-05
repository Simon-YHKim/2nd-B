// Structural guard for db/migrations/0070_reasoning_usage_cap.sql — the atomic
// server-side reasoning cap RPC (mirrors 0026's atomic chat-usage guard).

import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(
  join(__dirname, "..", "..", "..", "..", "db", "migrations", "0070_reasoning_usage_cap.sql"),
  "utf8",
);

describe("0070_reasoning_usage_cap.sql — structure", () => {
  test("defines the atomic reasoning-cap RPC as SECURITY DEFINER with a locked search_path", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.bump_reasoning_usage_if_under_cap/);
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/SET search_path = ''/);
  });

  test("guards the caller uid against the target user", () => {
    expect(sql).toMatch(/auth\.uid\(\) != p_user_id/);
  });

  test("increments atomically only while under the effective cap (base cap + rewarded credits)", () => {
    expect(sql).toMatch(/ON CONFLICT \(user_id, month_bucket\) DO UPDATE/);
    expect(sql).toMatch(/reasoning_used = uc\.reasoning_used \+ 1/);
    expect(sql).toMatch(/WHERE uc\.reasoning_used < p_cap \+ uc\.reward_credits/);
  });

  test("raises reasoning_limit_exceeded when the cap is reached", () => {
    expect(sql).toMatch(/RAISE EXCEPTION 'reasoning_limit_exceeded'/);
  });

  test("is executable only by authenticated callers", () => {
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.bump_reasoning_usage_if_under_cap[\s\S]*FROM PUBLIC/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.bump_reasoning_usage_if_under_cap[\s\S]*TO authenticated/);
  });
});
