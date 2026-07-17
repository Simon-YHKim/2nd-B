// Structural guard for db/migrations/0091_chat_ad_bonus_ssv.sql — the SSV twin
// of 0090's client-path grant. When AdMob server-side verification is the grant
// authority, the verified callback awards the chat +2 through this service-role
// RPC with the same monthly ceiling and the SHARED transaction dedup ledger
// (one impression = one grant of one kind). Pins the SQL to the TS constants
// and to the edge function's routing contract.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REWARD_MONTHLY_CAP, REWARD_PER_WATCH } from "../../entitlements/tiers";

const root = join(__dirname, "..", "..", "..", "..");
const sql = readFileSync(join(root, "db", "migrations", "0091_chat_ad_bonus_ssv.sql"), "utf8");
const edge = readFileSync(join(root, "supabase", "functions", "rewarded-ssv", "index.ts"), "utf8");

describe("0091_chat_ad_bonus_ssv.sql - structure", () => {
  test("SECURITY DEFINER with a locked search_path; no user-auth guard (service_role caller)", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.grant_chat_ad_bonus_ssv/);
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/SET search_path = ''/);
    expect(sql).not.toMatch(/auth\.uid\(\)/);
  });

  test("dedups on the SHARED rewarded_ssv_txns ledger and grants only on first sight", () => {
    expect(sql).toMatch(/INSERT INTO public\.rewarded_ssv_txns \(transaction_id, user_id\)/);
    expect(sql).toMatch(/ON CONFLICT \(transaction_id\) DO NOTHING/);
    expect(sql).toMatch(/RAISE EXCEPTION 'transaction_id required'/);
  });

  test("derives KST day/month server-side and enforces the 0090 monthly ceiling", () => {
    expect(sql).toMatch(/now\(\) AT TIME ZONE 'Asia\/Seoul'/);
    expect(sql).toMatch(/to_char\(v_kst, 'YYYY-MM'\)/);
    expect(REWARD_PER_WATCH).toBe(2);
    expect(sql).toMatch(/chat_ad_credits = uc\.chat_ad_credits \+ 2/);
    expect(sql).toMatch(new RegExp(`WHERE uc\\.chat_ad_credits <= ${REWARD_MONTHLY_CAP - REWARD_PER_WATCH}\\b`));
    // Clamp semantics: at-cap or replayed -> report today's bonus, never raise.
    expect(sql).not.toMatch(/chat_reward_cap_reached/);
  });

  test("widens today's chat_usage.ad_bonus only after the monthly grant applied", () => {
    expect(sql).toMatch(/SET ad_bonus = cu\.ad_bonus \+ 2/);
  });

  test("service_role-only: PUBLIC, anon, and authenticated are all revoked", () => {
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.grant_chat_ad_bonus_ssv\(uuid, text\) FROM PUBLIC/);
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.grant_chat_ad_bonus_ssv\(uuid, text\) FROM anon/);
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.grant_chat_ad_bonus_ssv\(uuid, text\) FROM authenticated/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.grant_chat_ad_bonus_ssv\(uuid, text\) TO service_role/);
  });
});

describe("rewarded-ssv edge function - kind routing", () => {
  test("routes custom_data '<userId>|chat' to the 0091 RPC, bare custom_data to reasoning", () => {
    expect(edge).toMatch(/rawCustom\.split\('\|'\)/);
    expect(edge).toMatch(/kindRaw === 'chat' \? 'chat' : 'reasoning'/);
    expect(edge).toMatch(/grant_chat_ad_bonus_ssv/);
    expect(edge).toMatch(/grant_reward_credits_ssv/); // reasoning path untouched
  });

  test("stays fail-closed behind REWARD_SSV_ENABLED", () => {
    expect(edge).toMatch(/REWARD_SSV_ENABLED.*!== '1'/);
  });
});
