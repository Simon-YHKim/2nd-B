// Structural guard for db/migrations/0089_reasoning_weekly_cap.sql — Phase 4
// moves reasoning caps to KST ISO WEEKS (free 2 · soma/cortex 7 · brain
// unlimited, Simon 확정 2026-07-17), derives BOTH buckets server-side (a
// tampered client can no longer rotate p_month to mint fresh rows), and makes
// over-base runs consume monthly rewarded credits via the new reward_consumed
// column. The client mirrors live in tier-map.ts REASONING_PER_WEEK and
// usage.ts weekBucket()/monthBucket() — this test pins SQL ↔ TS.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REASONING_PER_WEEK } from "../tier-map";

const sql = readFileSync(
  join(__dirname, "..", "..", "..", "..", "db", "migrations", "0089_reasoning_weekly_cap.sql"),
  "utf8",
);

describe("0089_reasoning_weekly_cap.sql - structure", () => {
  test("adds the reward_consumed consumption ledger column", () => {
    expect(sql).toMatch(/ALTER TABLE public\.usage_counters\s+ADD COLUMN IF NOT EXISTS reward_consumed int NOT NULL DEFAULT 0/);
  });

  test("redefines the RPC as SECURITY DEFINER with a locked search_path and owner guard", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.bump_reasoning_usage_if_under_cap/);
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/SET search_path = ''/);
    expect(sql).toMatch(/auth\.uid\(\) != p_user_id/);
  });

  test("derives the cap from the EFFECTIVE tier (judge comp + expiry, 0088)", () => {
    expect(sql).toMatch(/public\.effective_subscription_tier\(p_user_id\)/);
  });

  test("derives BOTH buckets server-side in KST; client p_month is ignored", () => {
    expect(sql).toMatch(/now\(\) AT TIME ZONE 'Asia\/Seoul'/);
    expect(sql).toMatch(/to_char\(v_kst, 'IYYY-"W"IW'\)/); // must equal usage.ts weekBucket()
    expect(sql).toMatch(/to_char\(v_kst, 'YYYY-MM'\)/); // must equal usage.ts monthBucket()
    expect(sql).toMatch(/p_month text, -- IGNORED/);
  });

  test("weekly CASE arms match tier-map REASONING_PER_WEEK", () => {
    expect(REASONING_PER_WEEK.brain).toBeNull();
    expect(sql).toMatch(/WHEN 'brain'\s+THEN NULL/);
    expect(sql).toMatch(new RegExp(`WHEN 'cortex'\\s+THEN ${REASONING_PER_WEEK.cortex}\\b`));
    expect(sql).toMatch(new RegExp(`WHEN 'soma'\\s+THEN ${REASONING_PER_WEEK.soma}\\b`));
    expect(sql).toMatch(new RegExp(`ELSE ${REASONING_PER_WEEK.free}\\b`));
  });

  test("base bump is atomic against the weekly cap; credits consume only under a guard", () => {
    expect(sql).toMatch(/WHERE uc\.reasoning_used < v_cap/);
    // The credit consume is the atomic permission: guarded by earned > consumed.
    expect(sql).toMatch(/AND reward_credits > reward_consumed/);
    expect(sql).toMatch(/SET reward_consumed = reward_consumed \+ 1/);
  });

  test("raises reasoning_limit_exceeded and is authenticated-only", () => {
    expect(sql).toMatch(/RAISE EXCEPTION 'reasoning_limit_exceeded'/);
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.bump_reasoning_usage_if_under_cap[\s\S]*FROM PUBLIC/);
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.bump_reasoning_usage_if_under_cap[\s\S]*FROM anon/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.bump_reasoning_usage_if_under_cap[\s\S]*TO authenticated/);
  });

  test("the reward grant RPCs (0075/SSV) are NOT redefined here", () => {
    // Chat +2 (Phase 4) gets its own ledger; the reasoning credit grant paths
    // stay untouched so SSV keeps verifying against the same functions.
    expect(sql).not.toMatch(/bump_reward_credits_if_under_cap/);
    expect(sql).not.toMatch(/grant_reward_credits_ssv/);
  });
});
