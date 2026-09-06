import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(
  join(process.cwd(), "db", "migrations", "0177_reward_ssv_tickets.sql"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("0177 reward SSV ticket contract binding", () => {
  test("stores the exact signed AdMob reward contract with fail-closed bounds", () => {
    expect(sql).toMatch(/expected_ad_unit_id\s+text NOT NULL/);
    expect(sql).toMatch(/expected_reward_amount\s+integer NOT NULL/);
    expect(sql).toMatch(/expected_reward_item\s+text NOT NULL/);
    expect(sql).toMatch(/char_length\(expected_ad_unit_id\) BETWEEN 1 AND 256/);
    expect(sql).toMatch(/expected_reward_amount BETWEEN 1 AND 2147483647/);
    expect(sql).toMatch(/char_length\(expected_reward_item\) BETWEEN 1 AND 256/);
    expect(sql).toContain("expected_ad_unit_id !~ '[[:cntrl:]]'");
    expect(sql).toContain("expected_reward_item !~ '[[:cntrl:]]'");
  });

  test("issues only the six-argument server-owned contract", () => {
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.issue_reward_ssv_ticket\(\s*p_user_id uuid,\s*p_reward_kind text,\s*p_token_hash text,\s*p_ad_unit_id text,\s*p_reward_amount integer,\s*p_reward_item text\s*\)/,
    );
    expect(sql).toMatch(
      /INSERT INTO public\.reward_ssv_tickets\s*\(token_hash, user_id, reward_kind, expected_ad_unit_id,\s*expected_reward_amount, expected_reward_item, expires_at\)\s*VALUES\s*\(p_token_hash, p_user_id, p_reward_kind, p_ad_unit_id,\s*p_reward_amount, p_reward_item,/,
    );
    expect(sql).toContain(
      "DROP FUNCTION IF EXISTS public.issue_reward_ssv_ticket(uuid, text, text);",
    );
  });

  test("consumes only an exact six-field callback in the atomic UPDATE predicate", () => {
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.consume_reward_ssv_ticket\(\s*p_token_hash text,\s*p_callback_user_id uuid,\s*p_txn_id text,\s*p_ad_unit_id text,\s*p_reward_amount integer,\s*p_reward_item text\s*\)/,
    );
    expect(sql).toMatch(
      /UPDATE public\.reward_ssv_tickets AS tickets[\s\S]*WHERE tickets\.token_hash = p_token_hash[\s\S]*tickets\.user_id = p_callback_user_id[\s\S]*tickets\.expected_ad_unit_id = p_ad_unit_id[\s\S]*tickets\.expected_reward_amount = p_reward_amount[\s\S]*tickets\.expected_reward_item = p_reward_item[\s\S]*tickets\.expires_at >= now\(\)[\s\S]*tickets\.consumed_transaction_id IS NULL[\s\S]*tickets\.consumed_transaction_id = p_txn_id/,
    );
    expect(sql).toContain(
      "DROP FUNCTION IF EXISTS public.consume_reward_ssv_ticket(text, uuid, text);",
    );
  });

  test("keeps both new RPCs service-role-only in ACL and function bodies", () => {
    expect(sql.match(/public\.billing_request_role\(\) IS DISTINCT FROM 'service_role'/g)).toHaveLength(2);
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.issue_reward_ssv_ticket\(uuid, text, text, text, integer, text\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role;/,
    );
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.consume_reward_ssv_ticket\(text, uuid, text, text, integer, text\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role;/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.issue_reward_ssv_ticket\(uuid, text, text, text, integer, text\) TO service_role;/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.consume_reward_ssv_ticket\(text, uuid, text, text, integer, text\) TO service_role;/,
    );
    expect(sql).toMatch(
      /to_regprocedure\('public\.issue_reward_ssv_ticket\(uuid,text,text\)'\) IS NOT NULL/,
    );
    expect(sql).toMatch(
      /to_regprocedure\('public\.consume_reward_ssv_ticket\(text,uuid,text\)'\) IS NOT NULL/,
    );
  });
});
