// Structural guard for db/migrations/0076_chat_cap_server_derived.sql - the chat
// cap is now derived SERVER-SIDE from the user's tier (the client-supplied p_cap
// is ignored), closing the spoofable-cap hole (audit M3, decision D1 Stage 2).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CHAT_DAILY_LIMIT } from "../limits";

const sql = readFileSync(
  join(__dirname, "..", "..", "..", "..", "db", "migrations", "0076_chat_cap_server_derived.sql"),
  "utf8",
);

describe("0076_chat_cap_server_derived.sql - structure", () => {
  test("redefines the atomic chat-cap RPC as SECURITY DEFINER with a locked search_path", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.bump_chat_usage_if_under_cap/);
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/SET search_path = ''/);
  });

  test("guards the caller uid against the target user", () => {
    expect(sql).toMatch(/auth\.uid\(\) != p_user_id/);
  });

  test("derives the cap from users.subscription_tier server-side", () => {
    expect(sql).toMatch(/SELECT subscription_tier INTO v_tier FROM public\.users WHERE id = p_user_id/);
    // the WHERE gate uses the server-derived v_cap, not the client p_cap
    expect(sql).toMatch(/WHERE cu\.count < v_cap/);
    expect(sql).not.toMatch(/WHERE cu\.count < p_cap/);
  });

  test("per-tier caps match src/lib/chat/limits.ts CHAT_DAILY_LIMIT", () => {
    expect(sql).toMatch(new RegExp(`WHEN 'brain'\\s+THEN ${CHAT_DAILY_LIMIT.brain}\\b`));
    expect(sql).toMatch(new RegExp(`WHEN 'cortex'\\s+THEN ${CHAT_DAILY_LIMIT.cortex}\\b`));
    expect(sql).toMatch(new RegExp(`WHEN 'soma'\\s+THEN ${CHAT_DAILY_LIMIT.soma}\\b`));
    expect(sql).toMatch(new RegExp(`ELSE ${CHAT_DAILY_LIMIT.free}\\b`)); // free
  });

  test("raises chat_limit_exceeded and is authenticated-only", () => {
    expect(sql).toMatch(/RAISE EXCEPTION 'chat_limit_exceeded'/);
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.bump_chat_usage_if_under_cap[\s\S]*FROM PUBLIC/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.bump_chat_usage_if_under_cap[\s\S]*TO authenticated/);
  });
});
