import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "../../../..");
const sql = readFileSync(
  path.join(root, "db", "migration-drafts", "UNNUMBERED_reward_ssv_hardening.sql"),
  "utf8",
);
const edge = readFileSync(
  path.join(root, "supabase", "functions", "rewarded-ssv", "index.ts"),
  "utf8",
);
const migrationWorkflow = readFileSync(
  path.join(root, ".github", "workflows", "supabase-dry-run.yml"),
  "utf8",
);
const dbRegression = readFileSync(
  path.join(root, "scripts", "check-reward-ssv-db.sh"),
  "utf8",
);
const ownership = readFileSync(path.join(root, "docs", "SESSION-OWNERSHIP.md"), "utf8");
const envExample = readFileSync(path.join(root, ".env.example"), "utf8");

describe("unnumbered rewarded SSV hardening draft", () => {
  test("keeps the live client unit coupled to the server SSV contract", () => {
    expect(envExample).toMatch(/^EXPO_PUBLIC_REWARD_SSV=$/m);
    expect(envExample).toMatch(/^EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID=$/m);
    expect(envExample).toMatch(/^EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID_ANDROID=$/m);
    expect(envExample).toMatch(/^EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID_IOS=$/m);
    expect(envExample).toContain("REWARD_SSV_AD_UNIT_IDS");
    expect(envExample).toContain("use the numeric suffix");
  });

  test("documents the server-first rollout and fail-closed canary window", () => {
    const sectionStart = ownership.indexOf("#### Reward SSV");
    expect(sectionStart).toBeGreaterThan(0);
    const section = ownership.slice(sectionStart, ownership.indexOf("\n## ", sectionStart));
    const rollout = section.slice(section.indexOf("1. **server OFF:**"));
    const orderedMarkers = [
      "REWARD_SSV_ENABLED=0",
      "UNNUMBERED_reward_ssv_hardening.sql",
      "rewarded-ssv Edge",
      "client capability OFF",
      "제한 canary",
      "server 유지/rollback",
      "client activation",
    ];
    let previous = -1;
    for (const marker of orderedMarkers) {
      const position = rollout.indexOf(marker);
      expect(position).toBeGreaterThan(previous);
      previous = position;
    }
    expect(section).toContain("EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID");
    expect(section).toContain("REWARD_SSV_AD_UNIT_ID");
    expect(section).toContain("DB down migration");
    expect(section).toContain("콘솔 세션");
  });

  test("requires an ads-off maintenance cutover for the legacy RPC removal", () => {
    expect(sql).toContain("There is no safe online-compatible DB/Edge ordering");
    expect(sql).toContain("keep REWARD_SSV_ENABLED");
    expect(sql).toContain("client capability OFF");
  });

  test("requires the 0172 reward authority before applying", () => {
    expect(sql).toMatch(/grant_chat_ad_bonus_ssv\(uuid,text\)/);
    expect(sql).toMatch(/grant_reward_credits_ssv\(uuid,text,integer,text\)/);
    expect(sql).toMatch(
      /has_function_privilege\(\s*'authenticated',[\s\S]*?grant_chat_ad_bonus\(uuid\)/,
    );
  });

  test("reapplies the corrected TTL and exact-retry consume contract", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.issue_reward_ssv_ticket/);
    expect(sql).toMatch(/now\(\) \+ make_interval\(mins => 20\)/);
    expect(sql).toMatch(
      /consumed_transaction_id = p_txn_id[\s\S]*?consumed_at >= now\(\) - make_interval\(days => 1\)/,
    );
  });

  test("atomically settles an opaque ticket without a provider-visible user id", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.settle_reward_ssv_ticket_v2\(/);
    const start = sql.indexOf("CREATE OR REPLACE FUNCTION public.settle_reward_ssv_ticket_v2");
    const end = sql.indexOf("$$;", start);
    const body = sql.slice(start, end);
    expect(body).not.toContain("p_callback_user_id");
    expect(body).toMatch(/UPDATE public\.reward_ssv_tickets[\s\S]*RETURNING tickets\.\*/);
    expect(body).toMatch(/grant_chat_ad_bonus_ssv/);
    expect(body).toMatch(/grant_reward_credits_ssv/);
    expect(body.indexOf("UPDATE public.reward_ssv_tickets")).toBeLessThan(
      body.indexOf("grant_chat_ad_bonus_ssv"),
    );
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.settle_reward_ssv_ticket_v2[\s\S]*?GRANT EXECUTE ON FUNCTION public\.settle_reward_ssv_ticket_v2[\s\S]*?TO service_role/,
    );
    expect(sql).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.consume_reward_ssv_ticket(?:_v2)?[\s\S]*?TO service_role/,
    );
    expect(edge).toContain("settle_reward_ssv_ticket_v2");
    expect(edge).not.toContain("consume_reward_ssv_ticket_v2");
    expect(edge).not.toContain("grant_chat_ad_bonus_ssv");
    expect(edge).not.toContain("grant_reward_credits_ssv");
    expect(edge).not.toContain("p_callback_user_id");
  });

  test("bounds consumed-ticket retention with seekable indexes and cleanup", () => {
    expect(sql).toMatch(
      /reward_ssv_tickets_user_consumed_idx[\s\S]*?\(user_id, consumed_at\)/,
    );
    expect(sql).toMatch(
      /reward_ssv_tickets_consumed_retention_idx[\s\S]*?\(consumed_at, token_hash\)/,
    );
    expect(sql).toMatch(
      /reward_ssv_tickets_expired_retention_idx[\s\S]*?\(expires_at, token_hash\)/,
    );
    expect(sql).toMatch(/LIMIT 500[\s\S]*?FOR UPDATE SKIP LOCKED/);
    expect(sql).toMatch(/purge-reward-ssv-tickets/);
  });

  test("adds a private atomic short-window issue limiter and Edge 429", () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.reward_ssv_issue_rate_limits/);
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.claim_reward_ssv_issue_rate_limit\(p_user_id uuid\)/,
    );
    expect(sql).toMatch(/cardinality\(v_claims\) >= 10/);
    expect(sql).toMatch(/make_interval\(secs => 60\)/);
    expect(sql).toMatch(/FOR UPDATE;[\s\S]*?array_append\(v_claims, v_now\)/);
    expect(sql).toMatch(/cardinality\(claimed_at\) BETWEEN 0 AND 10/);
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.claim_reward_ssv_issue_rate_limit\(uuid\) TO service_role/,
    );
    expect(sql).toMatch(
      /REVOKE ALL ON TABLE public\.reward_ssv_issue_rate_limits[\s\S]*?authenticated/,
    );

    const claimAt = edge.indexOf("claim_reward_ssv_issue_rate_limit");
    const issueAt = edge.indexOf("issue_reward_ssv_ticket");
    expect(claimAt).toBeGreaterThan(0);
    expect(claimAt).toBeLessThan(issueAt);
    expect(claimAt).toBeGreaterThan(edge.indexOf("admin.auth.getUser(accessToken)"));
    expect(claimAt).toBeGreaterThan(edge.indexOf("readIssueKind(req, contract)"));
    expect(edge).toMatch(/retry_after_seconds[\s\S]*?429/);
    expect(edge).toMatch(/'retry-after':\s*String\(retryAfter\)/);
  });

  test("admits an exact opaque ticket before any verifier-key refresh", () => {
    expect(sql).toMatch(
      /ADD COLUMN IF NOT EXISTS verification_attempts smallint NOT NULL DEFAULT 0/,
    );
    expect(sql).toMatch(/verification_attempts BETWEEN 0 AND 6/);
    expect(sql).toContain("a.atttypid = 'pg_catalog.int2'::pg_catalog.regtype");
    expect(sql).toContain("pg_catalog.pg_get_expr(d.adbin, d.adrelid)");
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.claim_reward_ssv_callback_attempt\(/,
    );
    const claimStart = sql.indexOf(
      "CREATE OR REPLACE FUNCTION public.claim_reward_ssv_callback_attempt",
    );
    const claimEnd = sql.indexOf("$$;", claimStart);
    const claimBody = sql.slice(claimStart, claimEnd);
    expect(claimBody).toMatch(/verification_attempts < 6/);
    expect(claimBody).toMatch(
      /verification_attempts = tickets\.verification_attempts \+ 1/,
    );
    for (const exactDimension of [
      "expected_ad_unit_id = p_ad_unit_id",
      "expected_reward_amount = p_reward_amount",
      "expected_reward_item = p_reward_item",
      "consumed_transaction_id = p_txn_id",
    ]) expect(claimBody).toContain(exactDimension);
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.claim_reward_ssv_callback_attempt[\s\S]*?GRANT EXECUTE ON FUNCTION public\.claim_reward_ssv_callback_attempt[\s\S]*?TO service_role/,
    );

    const handlerAt = edge.indexOf("Deno.serve");
    const parseAt = edge.indexOf("parsed = parseSignedSsvQuery(rawQuery)", handlerAt);
    const derAt = edge.indexOf("derToRawEcdsa", parseAt);
    const contractAt = edge.indexOf("parseRewardCallback(parsed.params, contract)", parseAt);
    const callbackClaimAt = edge.indexOf("'claim_reward_ssv_callback_attempt'", handlerAt);
    // The no-subject console probe has an earlier verification with zero DB
    // access. Ticket callbacks still pass admission before key retrieval.
    const signatureAt = edge.lastIndexOf("await signatureValid(parsed, rawSignature)");
    for (const position of [parseAt, derAt, contractAt, callbackClaimAt, signatureAt]) {
      expect(position).toBeGreaterThan(handlerAt);
    }
    expect(parseAt).toBeLessThan(derAt);
    expect(derAt).toBeLessThan(contractAt);
    expect(contractAt).toBeLessThan(callbackClaimAt);
    expect(callbackClaimAt).toBeLessThan(signatureAt);
    expect(dbRegression).toContain("claim_reward_ssv_callback_attempt");
    expect(dbRegression).toContain("callback attempt seven was not rejected");
    expect(dbRegression).toContain("expired callback ticket was admitted");
    expect(dbRegression).toContain("mismatched callback contract was admitted");
    expect(dbRegression).toContain("expired exact consumed callback retry was not admitted");
    expect(dbRegression).toContain("verification attempt counter did not stop at six");
  });

  test("runs the SSV replay and concurrency contract against Postgres", () => {
    expect(migrationWorkflow).toContain('- "db/migration-drafts/**"');
    expect(migrationWorkflow).toContain("bash scripts/check-reward-ssv-db.sh");
    expect(migrationWorkflow).toContain("REWARD_SSV_DB_TEST: github-actions-only");
    expect(
      dbRegression.match(
        /\\i db\/migration-drafts\/UNNUMBERED_reward_ssv_hardening\.sql/g,
      ) ?? [],
    ).toHaveLength(2);
    expect(dbRegression).toContain("claim_reward_ssv_issue_rate_limit");
    expect(dbRegression).toContain("settle_reward_ssv_ticket_v2");
    expect(dbRegression).toContain("forced settlement failure");
    expect(dbRegression).toContain("ticket consumption survived failed settlement");
    expect(dbRegression).toContain("eligible chat ticket was not issued");
    expect(dbRegression).toContain("chat ticket did not settle its server-owned reward");
    expect(dbRegression).toContain("chat reward was not exactly-once across replay");
    expect(dbRegression).toContain('REWARD_SSV_DB_TEST:-');
    expect(dbRegression).toContain("psql -X -qAt -h localhost -U postgres -d postgres");
    expect(dbRegression).toContain("inet_server_addr() <<= inet '172.16.0.0/12'");
    expect(dbRegression).toContain("inet_client_addr() <<= inet '172.16.0.0/12'");
    expect(dbRegression).not.toMatch(/DATABASE_URL|SUPABASE_DB_URL|DB_PASSWORD/);
    expect(dbRegression).toContain("PGAPPNAME='reward-ssv-lock-holder'");
    expect(dbRegression).toContain("contention_observed");
  });
});
