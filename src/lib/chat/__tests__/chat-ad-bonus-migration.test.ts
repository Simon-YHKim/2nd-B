// Structural guard for db/migrations/0090_chat_ad_bonus.sql — Phase 4 lets a
// rewarded watch widen TODAY's chat allowance by +2 (KST day), earnable up to
// 20 credits per KST month — a NEW ledger beside the reasoning watch-to-earn
// (both kept, Simon 확정 2026-07-17). Pins the SQL to the TS constants so the
// two can't drift.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CHAT_DAILY_LIMIT } from "../limits";
import { REWARD_MONTHLY_CAP, REWARD_PER_WATCH } from "../../entitlements/tiers";

const sql = readFileSync(
  join(__dirname, "..", "..", "..", "..", "db", "migrations", "0090_chat_ad_bonus.sql"),
  "utf8",
);

describe("0090_chat_ad_bonus.sql - structure", () => {
  test("adds the day bonus and monthly earn ledger columns", () => {
    expect(sql).toMatch(/ALTER TABLE public\.chat_usage\s+ADD COLUMN IF NOT EXISTS ad_bonus int NOT NULL DEFAULT 0/);
    expect(sql).toMatch(/ALTER TABLE public\.usage_counters\s+ADD COLUMN IF NOT EXISTS chat_ad_credits int NOT NULL DEFAULT 0/);
  });

  test("the chat cap RPC keeps the 0088 effective-tier derivation and widens by ad_bonus", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.bump_chat_usage_if_under_cap/);
    expect(sql).toMatch(/public\.effective_subscription_tier\(p_user_id\)/);
    expect(sql).toMatch(/WHERE cu\.count < v_cap \+ cu\.ad_bonus/);
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/SET search_path = ''/);
    expect(sql).toMatch(/auth\.uid\(\) != p_user_id/);
  });

  test("per-tier caps match CHAT_DAILY_LIMIT", () => {
    expect(sql).toMatch(new RegExp(`WHEN 'brain'\\s+THEN ${CHAT_DAILY_LIMIT.brain}\\b`));
    expect(sql).toMatch(new RegExp(`WHEN 'cortex'\\s+THEN ${CHAT_DAILY_LIMIT.cortex}\\b`));
    expect(sql).toMatch(new RegExp(`WHEN 'soma'\\s+THEN ${CHAT_DAILY_LIMIT.soma}\\b`));
    expect(sql).toMatch(new RegExp(`ELSE ${CHAT_DAILY_LIMIT.free}\\b`));
  });

  test("the grant derives day/month server-side in KST and enforces the monthly ceiling", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.grant_chat_ad_bonus/);
    expect(sql).toMatch(/now\(\) AT TIME ZONE 'Asia\/Seoul'/);
    expect(sql).toMatch(/to_char\(v_kst, 'YYYY-MM'\)/);
    // +2 per watch; the guard admits a grant only while credits <= cap - watch.
    expect(REWARD_PER_WATCH).toBe(2);
    expect(sql).toMatch(/chat_ad_credits = uc\.chat_ad_credits \+ 2/);
    expect(sql).toMatch(new RegExp(`WHERE uc\\.chat_ad_credits <= ${REWARD_MONTHLY_CAP - REWARD_PER_WATCH}\\b`));
    expect(sql).toMatch(/RAISE EXCEPTION 'chat_reward_cap_reached'/);
  });

  test("both functions are authenticated-only", () => {
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.bump_chat_usage_if_under_cap[\s\S]*FROM PUBLIC/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.bump_chat_usage_if_under_cap[\s\S]*TO authenticated/);
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.grant_chat_ad_bonus\(uuid\) FROM PUBLIC/);
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.grant_chat_ad_bonus\(uuid\) FROM anon/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.grant_chat_ad_bonus\(uuid\) TO authenticated/);
  });

  test("the reasoning reward RPCs are NOT touched here (both ledgers coexist)", () => {
    expect(sql).not.toMatch(/bump_reward_credits_if_under_cap/);
    expect(sql).not.toMatch(/bump_reasoning_usage_if_under_cap/);
  });
});
