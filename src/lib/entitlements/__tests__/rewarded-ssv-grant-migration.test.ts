// Structural guard for db/migrations/0079_rewarded_ssv_grant.sql - the atomic,
// idempotent, service-role-only reward grant used by the rewarded-ssv edge
// function (D2, pre-deploy review P1/P3 fix: replay defense + atomicity).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REWARD_MONTHLY_CAP, REWARD_PER_WATCH } from "../tiers";

const sql = readFileSync(
  join(__dirname, "..", "..", "..", "..", "db", "migrations", "0079_rewarded_ssv_grant.sql"),
  "utf8",
);

describe("0079_rewarded_ssv_grant.sql - structure", () => {
  test("creates the transaction dedup ledger with a unique transaction_id", () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.rewarded_ssv_txns/);
    expect(sql).toMatch(/transaction_id text PRIMARY KEY/);
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/);
  });

  test("grant RPC is SECURITY DEFINER, service_role-only, with a locked search_path", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.grant_reward_credits_ssv/);
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/SET search_path = ''/);
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.grant_reward_credits_ssv[\s\S]*FROM PUBLIC/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.grant_reward_credits_ssv[\s\S]*TO service_role/);
    // NOT granted to authenticated - only the trusted SSV callback path may call it.
    expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.grant_reward_credits_ssv[\s\S]*TO authenticated/);
  });

  test("is idempotent: dedups the transaction_id and only grants on first sight", () => {
    expect(sql).toMatch(/INSERT INTO public\.rewarded_ssv_txns[\s\S]*ON CONFLICT \(transaction_id\) DO NOTHING/);
    expect(sql).toMatch(/GET DIAGNOSTICS v_rows = ROW_COUNT/);
    expect(sql).toMatch(/IF v_rows = 0/);
  });

  test("clamps atomically to the server cap without clawback, synced with tiers.ts", () => {
    expect(sql).toMatch(new RegExp(`c_monthly_cap constant int := ${REWARD_MONTHLY_CAP}\\b`));
    expect(sql).toMatch(new RegExp(`c_per_call constant int := ${REWARD_PER_WATCH}\\b`));
    expect(sql).toMatch(/reward_credits = GREATEST\(uc\.reward_credits, LEAST\(uc\.reward_credits \+ v_grant, c_monthly_cap\)\)/);
  });
});
