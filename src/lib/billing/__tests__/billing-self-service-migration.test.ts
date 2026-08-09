// Structural guard for db/migrations/0115_billing_self_service.sql - the server
// side of [설정 → 구독 관리]: the Paddle object identity the webhook now captures,
// the self-serve audit ledger with its idempotency claim, and refund_eligibility()
// (the single source of truth for whether a refund is owed).
//
// Mirrors the 0087 / 0089 guard style: assert the security posture, the
// idempotency shape, and the policy constants, so a refactor cannot silently
// weaken any of them.
//
// NOTE: 0087's own test still passes and still describes the 12-argument
// apply_billing_event that THIS migration replaces. The live shape is the
// 17-argument one asserted below; 0087 is left untouched because its test pins
// its file text verbatim.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { FREE_RUNS_PER_WEEK, REFUND_WINDOW_DAYS } from "../subscription-manage";

const MIGRATIONS = join(__dirname, "..", "..", "..", "..", "db", "migrations");
const sql = readFileSync(join(MIGRATIONS, "0115_billing_self_service.sql"), "utf8");
const edge = readFileSync(
  join(__dirname, "..", "..", "..", "..", "supabase", "functions", "subscription-manage", "index.ts"),
  "utf8",
);
const webhook = readFileSync(
  join(__dirname, "..", "..", "..", "..", "supabase", "functions", "paddle-webhook", "index.ts"),
  "utf8",
);

describe("0115 - Paddle object identity on the webhook ledger", () => {
  test("captures the ids self-serve needs, all nullable so old rows stay valid", () => {
    expect(sql).toMatch(/ALTER TABLE public\.paddle_webhook_events/);
    for (const col of [
      "paddle_subscription_id",
      "paddle_transaction_id",
      "occurred_at",
      "payment_method",
      "payment_card_brand",
      "payment_card_last4",
      "scheduled_cancel_at",
    ]) {
      expect(sql).toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS ${col}\\s`));
    }
    expect(sql).not.toMatch(/ADD COLUMN[^\n]*NOT NULL/);
  });

  test("both lookup paths are indexed (user+time, and subscription for renewal recovery)", () => {
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS paddle_webhook_events_user_time_idx/);
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS paddle_webhook_events_subscription_idx/);
  });

  test("the webhook actually parses and forwards them (capture is useless if it does not)", () => {
    expect(webhook).toMatch(/data\.subscription_id/);
    expect(webhook).toMatch(/p_subscription_id: subscriptionId/);
    expect(webhook).toMatch(/p_transaction_id: transactionId/);
    expect(webhook).toMatch(/p_payment_method: paymentMethod/);
    expect(webhook).toMatch(/p_scheduled_cancel_at: scheduledCancelAt/);
  });

  test("a scheduled change that is not a cancel stores null, so a reversal is recorded", () => {
    expect(webhook).toMatch(/sc\?\.action === 'cancel' \? \(sc\.effective_at \?\? null\) : null/);
  });
});

describe("0115 - auto-renewal state is answerable (Simon 2026-08-09)", () => {
  test("subscription_overview reports auto_renew plus both signals behind it", () => {
    for (const key of ["'auto_renew'", "'cancel_scheduled_at'", "'cancel_requested_at'"]) {
      expect(sql).toMatch(new RegExp(key));
    }
  });

  test("auto_renew is false if EITHER Paddle or our own accepted cancel says so", () => {
    expect(sql).toMatch(/v_auto := v_tier <> 'free' AND v_sched IS NULL AND v_req IS NULL/);
  });

  test("the Paddle signal is read from the LATEST subscription event, not max()", () => {
    // Paddle clears scheduled_change to null on reversal; max() would keep
    // reporting a cancellation the user already undid.
    expect(sql).toMatch(
      /SELECT e\.scheduled_cancel_at[\s\S]*?e\.event_type LIKE 'subscription\.%'[\s\S]*?ORDER BY COALESCE\(e\.occurred_at, e\.processed_at\) DESC\s*\n\s*LIMIT 1;/,
    );
    // Checked against comment-stripped SQL: the header explains WHY max() is
    // wrong here, and that explanation must not be read as the code doing it.
    const body = sql.replace(/--[^\n]*/g, " ");
    expect(body).not.toMatch(/max\(\s*e?\.?scheduled_cancel_at/i);
  });

  test("cancel keeps the paid period: next_billing_period is the default, immediate is opt-in", () => {
    expect(sql).toMatch(
      /effective_from\s+text CHECK \(effective_from IS NULL OR effective_from IN \('next_billing_period', 'immediately'\)\)/,
    );
    expect(edge).toMatch(/'immediately'\s*:\s*'next_billing_period'/);
  });
});

describe("0115 - apply_billing_event keeps its 0087 guarantees while growing", () => {
  test("the old 12-argument signature is dropped, not left as a second overload", () => {
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS public\.apply_billing_event\(/);
  });

  test("still SECURITY DEFINER, locked search_path, service_role only", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.apply_billing_event/);
    // [^;]* keeps each assertion inside ONE statement: a greedy [\s\S]* would run
    // past the semicolon and match a grant belonging to a different function.
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.apply_billing_event[^;]*FROM anon, authenticated/);
    expect(sql).toMatch(/GRANT\s+EXECUTE ON FUNCTION public\.apply_billing_event[^;]*TO service_role/);
    expect(sql).not.toMatch(/GRANT\s+EXECUTE ON FUNCTION public\.apply_billing_event[^;]*TO authenticated/);
  });

  test("still idempotent on the Paddle event id", () => {
    expect(sql).toMatch(/ON CONFLICT \(event_id\) DO NOTHING/);
    expect(sql).toMatch(/GET DIAGNOSTICS v_rows = ROW_COUNT/);
    expect(sql).toMatch(/IF v_rows = 0 THEN[\s\S]*?RETURN 'duplicate'/);
  });

  // 0109 and 0112 both landed on this exact function while this work was in
  // flight. Re-creating it is the moment their fixes could silently vanish, so
  // each one is pinned here rather than trusted to review.
  test("0109's ordering guard survives the re-creation (monotonic on subscription_event_at)", () => {
    expect(sql).toMatch(/subscription_event_at\s+= v_at/);
    expect(sql).toMatch(/AND \(subscription_event_at IS NULL OR v_at >= subscription_event_at\)/);
    expect(sql).toMatch(/SET stale_entitlement = true/);
    // Existence is checked separately, so a deliberately-skipped stale event
    // does not masquerade as an unknown user and make Paddle retry it.
    expect(sql).toMatch(/IF NOT EXISTS \(SELECT 1 FROM public\.users WHERE id = v_user_id\)/);
    // The unconditional UPDATE this replaced must not come back.
    expect(sql).not.toMatch(/subscription_provider\s+= p_provider\s*\n\s*WHERE id = v_user_id;/);
  });

  test("0112's role detection is used, never the legacy GUC alone", () => {
    // request.jwt.claim.role is NOT set by the current PostgREST stack. It may
    // appear exactly once: inside the helper, as the first COALESCE arm.
    const rawReads = sql.match(/current_setting\('request\.jwt\.claim\.role'/g) ?? [];
    expect(rawReads).toHaveLength(1);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.billing_request_role\(\)/);
    expect(sql).toMatch(/current_setting\('request\.jwt\.claims', true\)[^;]*::jsonb ->> 'role'/);
    // Every guard goes through the helper.
    const guards = sql.match(/public\.billing_request_role\(\)/g) ?? [];
    expect(guards.length).toBeGreaterThanOrEqual(5);
  });

  test("a renewal with no checkout custom_data recovers its owner by subscription id", () => {
    expect(sql).toMatch(/IF v_user_id IS NULL AND v_sub_id IS NOT NULL THEN/);
    expect(sql).toMatch(/WHERE e\.paddle_subscription_id = v_sub_id/);
    // and the entitlement/revenue writes use the recovered id, not the raw param
    expect(sql).toMatch(/WHERE id = v_user_id/);
  });
});

describe("0115 - billing_self_service_log is the audit ledger AND the idempotency claim", () => {
  test("every self-serve action is recorded with its verdict and evidence", () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.billing_self_service_log/);
    expect(sql).toMatch(/action\s+text NOT NULL CHECK \(action IN \('cancel', 'refund_request'\)\)/);
    expect(sql).toMatch(/eligibility\s+text/);
    expect(sql).toMatch(/eligibility_detail\s+jsonb/);
  });

  test("a duplicate refund on the same transaction is impossible while one is live", () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS billing_self_service_refund_once_uidx/);
    expect(sql).toMatch(
      /billing_self_service_refund_once_uidx[\s\S]*?WHERE action = 'refund_request'[\s\S]*?AND outcome IN \('pending', 'accepted'\)/,
    );
  });

  test("a failed attempt leaves the index so a genuine retry is possible", () => {
    // provider_error / rejected are NOT in the partial index predicate.
    expect(sql).toMatch(/outcome IN \('pending', 'accepted'\)/);
    expect(sql).not.toMatch(/outcome IN \('pending', 'accepted', 'provider_error'\)/);
  });

  test("cancel has its own claim so a double tap cannot double-cancel", () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS billing_self_service_cancel_once_uidx/);
  });

  test("RLS: owner reads, nobody but service_role writes", () => {
    expect(sql).toMatch(/ALTER TABLE public\.billing_self_service_log ENABLE ROW LEVEL SECURITY/);
    // 0061/0102 initplan rule: the subquery form, not a bare auth.uid().
    expect(sql).toMatch(/USING \(user_id = \(select auth\.uid\(\)\)\)/);
    expect(sql).toMatch(/REVOKE INSERT, UPDATE, DELETE ON public\.billing_self_service_log FROM authenticated/);
    expect(sql).toMatch(/REVOKE INSERT, UPDATE, DELETE ON public\.billing_self_service_log FROM anon/);
  });
});

describe("0115 - refund_eligibility() is the server-side single source of truth", () => {
  test("definer + locked search_path, anon revoked, owner and service_role granted", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.refund_eligibility\(p_user_id uuid\)/);
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/SET search_path = ''/);
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.refund_eligibility\(uuid\) FROM anon/);
    expect(sql).toMatch(/GRANT\s+EXECUTE ON FUNCTION public\.refund_eligibility\(uuid\) TO authenticated/);
    expect(sql).toMatch(/GRANT\s+EXECUTE ON FUNCTION public\.refund_eligibility\(uuid\) TO service_role/);
  });

  test("IDOR guard: a caller that is not the owner and not service_role is rejected", () => {
    expect(sql).toMatch(/auth\.uid\(\) IS NULL OR auth\.uid\(\) <> p_user_id/);
    expect(sql).toMatch(/ERRCODE = '42501'/);
  });

  test("policy constants match the TS mirror and the published policy", () => {
    // 7, not 30 (Simon 2026-08-09). Pinned as a literal too, so a drift that
    // changed BOTH the SQL and the TS mirror together still fails here and gets
    // read against docs/legal/refund-policy.md.
    expect(REFUND_WINDOW_DAYS).toBe(7);
    expect(sql).toMatch(new RegExp(`c_window_days\\s+constant int := ${REFUND_WINDOW_DAYS};`));
    expect(sql).toMatch(new RegExp(`c_free_per_week constant int := ${FREE_RUNS_PER_WEEK};`));
  });

  test("the window anchors on the Paddle payment time, never the DB write time", () => {
    expect(sql).toMatch(/e\.event_type = 'transaction\.completed'/);
    expect(sql).toMatch(/COALESCE\(e\.occurred_at, e\.processed_at\) DESC/);
  });

  test("allowance is pro-rated by whole or partial weeks, minimum one", () => {
    expect(sql).toMatch(/v_weeks\s+:= GREATEST\(1, CEIL\(v_age_days \/ 7\.0\)\)/);
    expect(sql).toMatch(/v_allowance := c_free_per_week \* v_weeks/);
  });

  test("runs are the meter; the audit log is the fallback, not the gate", () => {
    expect(sql).toMatch(/FROM public\.reasoning_runs r/);
    expect(sql).toMatch(/r\.spend <> 'none'/);
    expect(sql).toMatch(/r\.status <> 'cancelled'/);
    expect(sql).toMatch(/v_used := CASE WHEN v_runs > 0 THEN v_runs ELSE v_calls END/);
  });

  test("the audit-log arm includes the legacy reasoning labels so old rows still count", () => {
    expect(sql).toMatch(/'reasoning_connect'/);
    expect(sql).toMatch(/'journal_reflect'/);
    expect(sql).toMatch(/'knowledge_lookup'/);
  });

  test("the window is checked before usage, and every verdict is reachable", () => {
    expect(sql).toMatch(/IF v_age_days > c_window_days THEN\s*\n\s*v_status := 'window_passed'/);
    expect(sql).toMatch(/ELSIF v_used > v_allowance THEN\s*\n\s*v_status := 'used_beyond_free'/);
    expect(sql).toMatch(/v_status := 'eligible'/);
    expect(sql).toMatch(/'status',\s+'no_payment'/);
  });

  test("the evidence numbers are returned, not just the verdict", () => {
    for (const key of [
      "days_since_payment",
      "refund_window_days",
      "free_runs_per_week",
      "weeks_elapsed",
      "free_allowance",
      "reasoning_runs_used",
      "reasoning_calls_logged",
      "counted_usage",
    ]) {
      expect(sql).toMatch(new RegExp(`'${key}'`));
    }
  });
});

describe("0115 - the claim/settle helpers are service_role only", () => {
  test.each([
    ["claim_billing_self_service", "uuid, text, text, text, jsonb"],
    ["settle_billing_self_service", "uuid, text, integer, text, text"],
    ["log_billing_self_service", "uuid, text, text, text, jsonb, text"],
  ])("%s revokes anon + authenticated and grants only service_role", (fn, args) => {
    const sig = `public\\.${fn}\\(${args.replace(/\s+/g, "\\s*")}\\)`;
    expect(sql).toMatch(new RegExp(`REVOKE EXECUTE ON FUNCTION ${sig} FROM anon, authenticated`));
    expect(sql).toMatch(new RegExp(`GRANT\\s+EXECUTE ON FUNCTION ${sig} TO service_role`));
  });

  test("each helper refuses a non-service_role caller in the body too, not just by grant", () => {
    const guards = sql.match(/IS DISTINCT FROM 'service_role' THEN\s*\n\s*RAISE EXCEPTION 'service_role only'/g);
    expect(guards).toHaveLength(3);
  });

  test("the client never names a subscription or transaction: the claim resolves them", () => {
    expect(sql).toMatch(/FROM public\.paddle_webhook_events e[\s\S]*?INTO v_sub_id/);
    expect(edge).not.toMatch(/body\.(subscription_id|transaction_id|user_id)/);
  });
});

describe("0115 - definer-grant lint contract (scripts/check-definer-grants.ts, BASELINE 96)", () => {
  test("every SECURITY DEFINER create in the file is matched by a FROM anon revoke", () => {
    const definers = sql.match(/SECURITY DEFINER/g) ?? [];
    expect(definers.length).toBeGreaterThan(0);
    expect(sql).toMatch(/REVOKE\s+(ALL|EXECUTE)\s+ON FUNCTION[\s\S]*?FROM[^;]*\banon\b/);
  });

  test("no function is granted to anon or public", () => {
    expect(sql).not.toMatch(/GRANT\s+EXECUTE ON FUNCTION[^;]*\bTO[^;]*\b(anon|public)\b/i);
  });
});
