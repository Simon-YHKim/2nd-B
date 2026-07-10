// Structural guard for db/migrations/0075_reward_credits_cap.sql - the atomic,
// SERVER-capped rewarded-credit RPC. Closes the unlimited self-grant hole
// (audit M4, decision D1 Stage 1). The ceiling is server-owned (not a client
// parameter) so a tampered client cannot raise it.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REWARD_MONTHLY_CAP, REWARD_PER_WATCH } from "../tiers";

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

  test("takes NO client cap parameter - the ceiling is server-owned", () => {
    // Signature is exactly (p_user_id uuid, p_month text, p_credits int): a caller
    // cannot pass a cap or otherwise raise the ceiling.
    expect(sql).toMatch(/bump_reward_credits_if_under_cap\(\s*p_user_id uuid,\s*p_month text,\s*p_credits int\s*\)/);
    expect(sql).toMatch(/bump_reward_credits_if_under_cap\(uuid, text, int\)/); // revoke/grant sig
  });

  test("hardcodes the server ceilings, kept in sync with tiers.ts", () => {
    expect(sql).toMatch(new RegExp(`c_monthly_cap constant int := ${REWARD_MONTHLY_CAP}\\b`));
    expect(sql).toMatch(new RegExp(`c_per_call constant int := ${REWARD_PER_WATCH}\\b`));
  });

  test("clamps each grant to the per-call max and the monthly cap, without clawback", () => {
    // one call grants at most c_per_call
    expect(sql).toMatch(/v_grant := LEAST\(GREATEST\(COALESCE\(p_credits, 0\), 0\), c_per_call\)/);
    expect(sql).toMatch(/ON CONFLICT \(user_id, month_bucket\) DO UPDATE/);
    // capped add, GREATEST() so an already-over-cap balance is never clawed back
    expect(sql).toMatch(/reward_credits = GREATEST\(uc\.reward_credits, LEAST\(uc\.reward_credits \+ v_grant, c_monthly_cap\)\)/);
  });

  test("is executable only by authenticated callers", () => {
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.bump_reward_credits_if_under_cap[\s\S]*FROM PUBLIC/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.bump_reward_credits_if_under_cap[\s\S]*TO authenticated/);
  });
});
