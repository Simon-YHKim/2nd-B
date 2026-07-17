// Structural guard for db/migrations/0088_cap_tier_expiry_and_judge.sql (U5):
// the cap RPCs must derive an EFFECTIVE tier -- judge comp (C6) + expiry-aware --
// and their cap numbers must stay in sync with the client constants, exactly
// like the 0076/0077 guards.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CHAT_DAILY_LIMIT } from "../../chat/limits";

const sql = readFileSync(
  join(__dirname, "..", "..", "..", "..", "db", "migrations", "0088_cap_tier_expiry_and_judge.sql"),
  "utf8",
);

describe("0088_cap_tier_expiry_and_judge.sql - structure", () => {
  test("effective-tier helper: judge comps to brain, lapsed collapses to free, NULL expiry keeps the tier", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.effective_subscription_tier/);
    expect(sql).toMatch(/WHEN u\.judge_mode THEN 'brain'/);
    expect(sql).toMatch(
      /subscription_expires_at IS NOT NULL[\s\S]*subscription_expires_at < now\(\) THEN 'free'/,
    );
    expect(sql).toMatch(/COALESCE\(u\.subscription_tier, 'free'\)/);
  });

  test("helper is service-internal: locked search_path, no client-role execute", () => {
    expect(sql).toMatch(/effective_subscription_tier[\s\S]*SECURITY DEFINER/);
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.effective_subscription_tier\(uuid\) FROM PUBLIC/);
    expect(sql).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.effective_subscription_tier\(uuid\) FROM anon, authenticated/,
    );
    expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.effective_subscription_tier/);
  });

  test("both cap RPCs now derive tier through the helper (no raw tier read remains)", () => {
    const helperCalls = sql.match(/v_tier := public\.effective_subscription_tier\(p_user_id\)/g) ?? [];
    expect(helperCalls).toHaveLength(2);
    expect(sql).not.toMatch(/SELECT subscription_tier INTO v_tier/);
  });

  test("chat caps stay in sync with CHAT_DAILY_LIMIT", () => {
    expect(sql).toMatch(new RegExp(`WHEN 'brain'\\s+THEN ${CHAT_DAILY_LIMIT.brain}\\b`));
    expect(sql).toMatch(new RegExp(`WHEN 'cortex' THEN ${CHAT_DAILY_LIMIT.cortex}\\b`));
    expect(sql).toMatch(new RegExp(`WHEN 'soma'\\s+THEN ${CHAT_DAILY_LIMIT.soma}\\b`));
    expect(sql).toMatch(new RegExp(`ELSE ${CHAT_DAILY_LIMIT.free}\\b`));
  });

  test("reasoning caps carry the 0088-era monthly literals (historical; superseded by 0089 weekly)", () => {
    expect(sql).toMatch(/WHEN 'brain'\s+THEN NULL/);
    // Frozen literals: migration text never changes. The LIVE caps moved to
    // weekly in 0089 (reasoning-weekly-cap-migration.test.ts pins them).
    expect(sql).toMatch(/WHEN 'cortex' THEN 60\b/);
    expect(sql).toMatch(/WHEN 'soma'\s+THEN 60\b/);
    expect(sql).toMatch(/ELSE 30\b/);
  });

  test("cap RPC signatures, owner guard, and grants are unchanged from 0076/0077", () => {
    expect(sql).toMatch(/bump_chat_usage_if_under_cap\(\s*p_user_id uuid,\s*p_day date,\s*p_cap int/);
    expect(sql).toMatch(/bump_reasoning_usage_if_under_cap\(\s*p_user_id uuid,\s*p_month text,\s*p_cap int/);
    const ownerGuards = sql.match(/auth\.uid\(\) IS NULL OR auth\.uid\(\) != p_user_id/g) ?? [];
    expect(ownerGuards).toHaveLength(2);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.bump_chat_usage_if_under_cap\(uuid, date, int\) TO authenticated/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.bump_reasoning_usage_if_under_cap\(uuid, text, int\) TO authenticated/);
  });

  test("rewarded credits still extend the capped reasoning limit", () => {
    expect(sql).toMatch(/reasoning_used < v_cap \+ uc\.reward_credits/);
  });
});
