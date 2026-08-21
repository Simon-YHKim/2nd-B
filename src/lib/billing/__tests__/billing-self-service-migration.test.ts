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

import { readdirSync, readFileSync } from "node:fs";
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

// ── 0117: the refund meter counted the wrong set of runs, in both directions ──
// Found by an adversarial audit of 0115 on 2026-08-10, before the feature was
// ever enabled. Each defect is pinned by BOTH the removal of the broken clause
// and the presence of the correct one, so a revert cannot pass silently.
describe("0117 - refund_eligibility counts every real run and only real runs", () => {
  const sql0117 = readFileSync(join(MIGRATIONS, "0117_refund_meter_counts_every_real_run.sql"), "utf8");
  // The header QUOTES the broken clauses to explain why they were wrong, so the
  // "must not come back" assertions have to run against comment-stripped SQL or
  // the documentation defeats the guard.
  const body0117 = sql0117.replace(/--[^\n]*/g, " ");

  test("the spend filter is GONE: spend='none' marks an unlimited-tier run, not a free one", () => {
    // 0092:220-221 sets spend='none' whenever the cap is NULL, and brain is the
    // NULL-cap arm (0092:214). `spend <> 'none'` therefore excluded 100% of
    // North Star runs and made v_runs always 0 for the most expensive tier.
    expect(body0117).not.toMatch(/r\.spend\s*<>\s*'none'/);
    expect(sql0117).toMatch(/FROM public\.reasoning_runs r/);
  });

  test("all three refunded terminal states are excluded, not just cancelled", () => {
    // 0092 calls refund_reasoning_spend for failed (:389), cancelled (:413) and
    // recovered (:441). Counting any of them charges the user for a run that was
    // given back.
    expect(sql0117).toMatch(/r\.status NOT IN \('cancelled', 'failed', 'recovered'\)/);
    expect(body0117).not.toMatch(/r\.status\s*<>\s*'cancelled'/);
  });

  test("the verdict and the claim now select the SAME transaction row", () => {
    // Both must require a non-NULL transaction id, or the verdict can describe
    // payment A while the adjustment targets payment B.
    expect(sql0117).toMatch(/e\.event_type = 'transaction\.completed'\s*\n\s*AND e\.paddle_transaction_id IS NOT NULL/);
  });

  test("the NULL p_user_id three-valued-logic hole is closed on both owner RPCs", () => {
    const guards = sql0117.match(/IF p_user_id IS NULL OR auth\.uid\(\) IS NULL OR auth\.uid\(\) <> p_user_id THEN/g) ?? [];
    expect(guards).toHaveLength(2);
  });

  test("an accepted cancel is scoped to the subscription it cancelled", () => {
    // Scoped only to user_id, one cancel pinned auto_renew=false forever: a
    // resumed or newly purchased subscription kept reading "auto-renewal is off"
    // while Paddle charged every month, and the cancel card stayed hidden.
    expect(sql0117).toMatch(/AND l\.paddle_subscription_id = v_sub_id/);
    expect(sql0117).toMatch(/v_auto := v_tier <> 'free' AND v_sub_id IS NOT NULL AND v_sched IS NULL AND v_req IS NULL/);
  });

  test("still definer-safe: anon revoked, owner and service_role granted", () => {
    for (const fn of ["refund_eligibility", "subscription_overview"]) {
      expect(sql0117).toContain(`REVOKE EXECUTE ON FUNCTION public.${fn}(uuid) FROM anon;`);
      expect(sql0117).toContain(`GRANT  EXECUTE ON FUNCTION public.${fn}(uuid) TO authenticated;`);
      expect(sql0117).toContain(`GRANT  EXECUTE ON FUNCTION public.${fn}(uuid) TO service_role;`);
    }
    expect(sql0117).not.toMatch(/GRANT\s+EXECUTE ON FUNCTION[^;]*\bTO[^;]*\b(anon|public)\b/i);
  });
});

// ── 0118: the refund actually lands, and nothing stays stuck ─────────────────
describe("0118 - an approved refund moves the money AND the entitlement", () => {
  const sql0118 = readFileSync(join(MIGRATIONS, "0118_billing_refund_reconciliation.sql"), "utf8");
  const body0118 = sql0118.replace(/--[^\n]*/g, " ");

  test("the webhook handles adjustment.* instead of dropping it", () => {
    // ONE branch (0119): #1203 and #1205 each added a handler concurrently and
    // git merged both, leaving #1205's unreachable behind #1203's early return.
    expect(webhook.match(/const isAdjustmentEvent = /g) ?? []).toHaveLength(1);
    expect(webhook).toMatch(/rpc\('record_paddle_refund_adjustment'/);
    expect(webhook).toMatch(/rpc\('apply_billing_refund'/);
    // Only an APPROVED refund has a consequence: pending_approval / rejected /
    // reversed are recorded on the ledger and move no money and no entitlement.
    expect(webhook).toMatch(/if \(adjustmentStatus === 'approved'\)/);
    expect(webhook).toMatch(/data\.action !== 'refund'/);
  });

  test("the offsetting revenue row is negative and deduped on the adjustment event", () => {
    expect(sql0118).toMatch(/-abs\(p_amount_cents\)/);
    expect(sql0118).toMatch(/ON CONFLICT \(source, external_id\) WHERE external_id IS NOT NULL DO NOTHING/);
  });

  test("the entitlement is revoked ONLY for a full refund, under 0109's ordering guard", () => {
    expect(sql0118).toMatch(/IF v_full AND v_user_id IS NOT NULL THEN/);
    expect(sql0118).toMatch(/AND \(subscription_event_at IS NULL OR v_at >= subscription_event_at\)/);
    // A partial refund must not end a subscription the user still pays for.
    expect(sql0118).toMatch(/v_full\s+boolean := COALESCE\(p_is_full, false\)/);
  });

  test("a matching accepted self-serve refund is itself proof of a full refund", () => {
    expect(sql0118).toMatch(/WHERE action = 'refund_request'\s*\n\s*AND outcome = 'accepted'/);
    expect(sql0118).toMatch(/IF FOUND THEN\s*\n\s*v_full := true;/);
  });

  test("still idempotent on the Paddle event id", () => {
    expect(sql0118).toMatch(/ON CONFLICT \(event_id\) DO NOTHING/);
    expect(sql0118).toMatch(/IF v_rows = 0 THEN\s*\n\s*RETURN 'duplicate';/);
  });
});

describe("0118 - a dry run consumes nothing", () => {
  const sql0118 = readFileSync(join(MIGRATIONS, "0118_billing_refund_reconciliation.sql"), "utf8");

  test("'dry_run' is an allowed outcome", () => {
    expect(sql0118).toMatch(/CHECK \(outcome IN \('pending', 'accepted', 'rejected', 'provider_error', 'misconfigured', 'dry_run'\)\)/);
  });

  test("and it is OUTSIDE both idempotency indexes, so a rehearsal is repeatable", () => {
    const predicates = sql0118.match(/AND outcome IN \('pending', 'accepted'\)/g) ?? [];
    expect(predicates).toHaveLength(2);
    expect(sql0118).not.toMatch(/outcome IN \([^)]*'dry_run'[^)]*\)\s*\n\s*AND paddle_/);
  });

  test("the edge function settles a dry run as dry_run, never as accepted", () => {
    expect(edge).toMatch(/settleClaim\('dry_run'/);
    expect(edge).toMatch(/outcome: 'dry_run', dry_run: true/);
    expect(edge).not.toMatch(/settleClaim\('accepted', \{ ok: true, status: 0/);
  });
});

describe("0118 - stranded claims are released", () => {
  const sql0118 = readFileSync(join(MIGRATIONS, "0118_billing_refund_reconciliation.sql"), "utf8");

  test("a sweeper exists and settles pending rows into the retryable state", () => {
    expect(sql0118).toMatch(/CREATE OR REPLACE FUNCTION public\.sweep_stale_billing_claims/);
    expect(sql0118).toMatch(/SET outcome\s+= 'provider_error',\s*\n\s*provider_error = 'stale_claim_swept'/);
    expect(sql0118).toMatch(/WHERE outcome = 'pending'\s*\n\s*AND created_at < now\(\) - p_older_than/);
  });

  test("it is scheduled, and re-applying does not stack duplicate cron jobs", () => {
    expect(sql0118).toMatch(/cron\.schedule\(\s*\n?\s*'sweep-stale-billing-claims'/);
    expect(sql0118).toMatch(/cron\.unschedule\('sweep-stale-billing-claims'\)/);
  });
});

describe("0118 - 0116's role check is repaired", () => {
  const sql0118 = readFileSync(join(MIGRATIONS, "0118_billing_refund_reconciliation.sql"), "utf8");
  const body0118 = sql0118.replace(/--[^\n]*/g, " ");

  test("block_self_tier_insert goes through the helper, not the GUC that is never set", () => {
    expect(sql0118).toMatch(/CREATE OR REPLACE FUNCTION public\.block_self_tier_insert/);
    expect(sql0118).toMatch(/IF public\.billing_request_role\(\) = 'service_role' THEN/);
    // The raw legacy GUC may appear only inside the helper's own COALESCE.
    const raw = body0118.match(/current_setting\('request\.jwt\.claim\.role'/g) ?? [];
    expect(raw).toHaveLength(1);
  });

  test("the helper is callable from a SECURITY INVOKER trigger", () => {
    // Without DEFINER + an authenticated grant, the trigger would raise
    // permission denied on every self-insert.
    expect(sql0118).toMatch(/CREATE OR REPLACE FUNCTION public\.billing_request_role\(\)[\s\S]*?SECURITY DEFINER/);
    expect(sql0118).toContain("GRANT  EXECUTE ON FUNCTION public.billing_request_role() TO authenticated;");
    expect(sql0118).toMatch(/REVOKE EXECUTE ON FUNCTION public\.billing_request_role\(\) FROM anon/);
  });

  test("the clamp itself is unchanged: subscription_event_at still reset", () => {
    expect(sql0118).toMatch(/NEW\.subscription_event_at := NULL;/);
  });
});

// ── 0119: two concurrent 0117s, reconciled ──────────────────────────────────
// #1203 and #1205 fixed the same rail at the same time and both landed. Git saw
// no conflict and CI was green, but migrations apply in FILENAME order, so
// "refund_meter" replaced "refund_history" and each side's unique fix survived
// only in one. These pins make the union explicit.
describe("0119 - the surviving refund_eligibility carries BOTH sessions' fixes", () => {
  const sql = readFileSync(join(MIGRATIONS, "0119_reconcile_two_0117s.sql"), "utf8");

  test("it is the last definition of refund_eligibility by filename order", () => {
    const defs = readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .filter((f) => /CREATE OR REPLACE FUNCTION public\.refund_eligibility/i.test(readFileSync(join(MIGRATIONS, f), "utf8")));
    expect(defs.length).toBeGreaterThan(1);
    // 0124 re-stated the function to attach the decision record (a comment-only
    // replay of 0122's body, pinned byte-for-byte below). 0136 then re-stated it
    // again to exclude one-time credit-pack transactions from the anchor, which
    // is scope and not rule: refund-path-split-migration.test.ts proves the two
    // bodies differ by exactly that one predicate.
    expect(defs[defs.length - 1]).toBe("0136_refund_path_split.sql");
  });

  test("#1203's guard survives: a request already on file is not offered again", () => {
    expect(sql).toMatch(/'status',\s+'refund_already_requested'/);
    expect(sql).toMatch(/l\.outcome IN \('pending', 'accepted'\)/);
  });

  test("#1205's meter correction survives", () => {
    expect(sql).toMatch(/r\.status NOT IN \('cancelled', 'failed', 'recovered'\)/);
    expect(sql.replace(/--[^\n]*/g, " ")).not.toMatch(/r\.spend\s*<>\s*'none'/);
  });

  test("#1205's transaction-id requirement and NULL guard survive", () => {
    expect(sql).toMatch(/AND e\.paddle_transaction_id IS NOT NULL/);
    expect(sql).toMatch(/IF p_user_id IS NULL OR auth\.uid\(\) IS NULL OR auth\.uid\(\) <> p_user_id THEN/);
  });

  test("the client can actually receive refund_already_requested", () => {
    // It shipped in the union type and the locales while the database could no
    // longer produce it. Both halves must line up.
    const lib = readFileSync(join(__dirname, "..", "subscription-manage.ts"), "utf8");
    expect(lib).toContain("refund_already_requested");
  });

  test("the sweeper no longer reaps a refund Paddle is still reviewing", () => {
    // #1203 maps 'pending_approval' onto outcome='pending'; #1205's sweeper
    // reaped any 'pending' past 15 minutes. Together that marked a live refund
    // as failed AND released its idempotency claim, allowing a second refund.
    expect(sql).toMatch(/AND provider_ref IS NULL\s*\n\s*AND provider_status IS NULL\s*\n\s*AND paddle_adjustment_id IS NULL/);
  });
});

// ── 0121: Paddle's answer supersedes our optimistic cancel row ───────────────
// 0119 scoped our cancel signal to the subscription, which fixed "cancelled, then
// re-subscribed under a NEW id". It did NOT fix the same subscription being
// RESUMED: the accepted row survived, auto_renew stayed false forever, the cancel
// card stayed hidden, and the partial unique index blocked a genuine second
// cancel - while Paddle billed every month.
describe("0121 - a resumed subscription can be cancelled again", () => {
  const sql = readFileSync(join(MIGRATIONS, "0121_provider_supersedes_our_cancel.sql"), "utf8");

  test("the writer supersedes our row when Paddle says the sub is active and uncancelled", () => {
    expect(sql).toMatch(/AND p_scheduled_cancel_at IS NULL\s*\n\s*AND p_tier IS NOT NULL\s*\n\s*AND p_tier <> 'free'/);
    expect(sql).toMatch(/SET outcome\s+= 'rejected',\s*\n\s*provider_error = 'superseded_by_provider'/);
    // Scoped to the subscription Paddle is talking about, not the whole user.
    expect(sql).toMatch(/AND paddle_subscription_id = v_sub_id/);
  });

  test("superseding frees the idempotency index, so a second cancel can be claimed", () => {
    // The index only holds on outcome IN ('pending','accepted'); 'rejected' is
    // outside it, which is exactly why the supersede writes that value.
    expect(sql).toMatch(/outcome        = 'rejected'/);
  });

  test("the reader also ignores a cancel Paddle has already contradicted", () => {
    expect(sql).toMatch(/INTO v_sched, v_sched_seen/);
    expect(sql).toMatch(/IF v_req IS NOT NULL AND v_sched IS NULL AND v_sched_seen IS NOT NULL AND v_sched_seen > v_req THEN\s*\n\s*v_req := NULL;/);
  });

  test("0109's ordering guard and 0115's renewal anchor survive the re-creation", () => {
    expect(sql).toMatch(/AND \(subscription_event_at IS NULL OR v_at >= subscription_event_at\)/);
    expect(sql).toMatch(/SET stale_entitlement = true/);
    expect(sql).toMatch(/IF v_user_id IS NULL AND v_sub_id IS NOT NULL THEN/);
  });

  // Migrations apply in filename order, so the LAST file to define a function is
  // the one prod actually runs. This pins that per function rather than as a
  // blanket "0121 wins": 0133 took over apply_billing_event to add provider
  // ownership, and left subscription_overview alone. A blanket assertion would
  // have to be edited on every future change to either function, which is how a
  // guard quietly becomes a rubber stamp.
  test.each([
    ["apply_billing_event", "0133_billing_provider_ownership.sql"],
    ["subscription_overview", "0121_provider_supersedes_our_cancel.sql"],
  ])("%s is last defined in %s", (fn, expected) => {
    const defs = readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .filter((f) =>
        new RegExp(`CREATE OR REPLACE FUNCTION public\.${fn}`, "i").test(readFileSync(join(MIGRATIONS, f), "utf8")),
      );
    expect(defs[defs.length - 1]).toBe(expected);
  });

  // 0121's behaviour has to survive 0133 re-creating the function, the same way
  // 0121 had to preserve 0109's. Assert on 0133's own text, not 0121's.
  test("0133 carries 0121's supersede rule forward, now scoped to the user", () => {
    const sql133 = readFileSync(join(MIGRATIONS, "0133_billing_provider_ownership.sql"), "utf8");
    expect(sql133).toMatch(/provider_error = 'superseded_by_provider'/);
    expect(sql133).toMatch(/AND user_id = v_user_id/);
    expect(sql133).toMatch(/AND paddle_subscription_id = v_sub_id/);
    // 0109's guard, still present and still the same comparison.
    expect(sql133).toMatch(/AND \(subscription_event_at IS NULL OR v_at >= subscription_event_at\)/);
    expect(sql133).toMatch(/SET stale_entitlement = true/);
  });
});

describe("0121 - the refund window in copy comes from the server", () => {
  test("windowPassed interpolates the number instead of hardcoding 7", () => {
    // The window is 30 until 2026-09-08 and 7 after. Hardcoding 7 told a user
    // past day 30 that "7 days have passed" - the wrong number, and one that
    // understates the window they actually had.
    for (const code of ["en", "ko", "es", "pt", "id"]) {
      const s = JSON.parse(
        readFileSync(join(MIGRATIONS, "..", "..", "locales", code, "settings.json"), "utf8"),
      ).subscription.refund.reason.windowPassed as string;
      expect(s).toContain("{{total}}");
      expect(s).not.toMatch(/\b7\b/);
      expect(s).not.toMatch(/\b30\b/);
    }
  });
});

describe("0123 - the unhandled-event recorder is a trace and nothing more", () => {
  const sql = readFileSync(join(MIGRATIONS, "0123_record_unhandled_billing_events.sql"), "utf8");

  test("it writes the event row and stops", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.record_unhandled_billing_event/);
    expect(sql).toMatch(/INSERT INTO public\.paddle_webhook_events[\s\S]*?ON CONFLICT \(event_id\) DO NOTHING/);
    // Never the paths that move money or entitlement.
    const body = sql.replace(/--[^\n]*/g, " ");
    expect(body).not.toMatch(/UPDATE public\.users/);
    expect(body).not.toMatch(/INSERT INTO public\.revenue_events/);
  });

  test("service_role only, in the body as well as the grants", () => {
    expect(sql).toMatch(/IS DISTINCT FROM 'service_role' THEN\s*\n\s*RAISE EXCEPTION 'service_role only'/);
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.record_unhandled_billing_event[^;]*FROM anon, authenticated/);
    expect(sql).toMatch(/GRANT\s+EXECUTE ON FUNCTION public\.record_unhandled_billing_event[^;]*TO service_role/);
  });

  test("the raw payload is a diagnostic buffer with a purge, not an archive", () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS raw_payload jsonb/);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.purge_unhandled_billing_payloads/);
    expect(sql).toMatch(/SET raw_payload = NULL/);
    expect(sql).toMatch(/cron\.schedule\(\s*\n?\s*'purge-unhandled-billing-payloads'/);
    expect(sql).toMatch(/cron\.unschedule\('purge-unhandled-billing-payloads'\)/);
  });
});

// ── 0124: the decision record, and the proof that it is only a record ────────
// Simon chose on 2026-08-11 to keep the refund rule exactly as it is, knowing
// the notice for it ran zero days and that 이용약관 제3조② asks for thirty. The
// value of writing that down is entirely in it being findable later, so these
// pins protect the two things that make it findable: that the record exists
// where a reader of the LIVE function will see it, and that re-stating the
// function to attach it changed no behaviour at all.
describe("0124 - a recorded decision, provably comment-only", () => {
  const sql0124 = readFileSync(join(MIGRATIONS, "0124_refund_eligibility_decision_record.sql"), "utf8");
  const sql0122 = readFileSync(join(MIGRATIONS, "0122_revised_refund_rule_applies_now.sql"), "utf8");

  // Executable text = the function body with comments removed and whitespace
  // collapsed. If this differs, the migration is no longer comment-only.
  const bodyOf = (text: string) => {
    const at = text.indexOf("CREATE OR REPLACE FUNCTION public.refund_eligibility");
    const from = text.indexOf("AS $$", at) + "AS $$".length;
    const to = text.indexOf("\n$$;", from);
    expect(at).toBeGreaterThan(-1);
    expect(to).toBeGreaterThan(from);
    return text.slice(from, to).replace(/--[^\n]*/g, " ").replace(/\s+/g, " ").trim();
  };

  test("the executable body is byte-identical to 0122's", () => {
    // Verified against production prosrc on 2026-08-11 as well: all three
    // normalise to md5 260f15695bfe1ea1f26752bd5d65947b (3554 chars).
    expect(bodyOf(sql0124)).toBe(bodyOf(sql0122));
    expect(bodyOf(sql0124)).toHaveLength(3554);
  });

  test("the rule itself is untouched: 7 days, 2 runs, revised, gate on", () => {
    expect(sql0124).toContain(`c_window_days   constant int := ${REFUND_WINDOW_DAYS};`);
    expect(sql0124).toContain(`c_free_per_week constant int := ${FREE_RUNS_PER_WEEK};`);
    expect(sql0124.match(/'policy',\s+'revised'/g) ?? []).toHaveLength(3);
    expect(sql0124.match(/'usage_gate_applies',\s+true/g) ?? []).toHaveLength(3);
    // No dating, no grace branch reintroduced by the edit.
    expect(sql0124).not.toContain("2026-09-08");
    expect(bodyOf(sql0124)).not.toMatch(/pre_revision|grace|effective_from/i);
  });

  // The reason this is a COMMENT ON and not only a `--` header: measured on prod
  // 2026-08-11, all seven billing functions have zero line comments in prosrc
  // while their source files are full of them. The apply path strips them, so a
  // `--` block alone would be absent from the one place a reader of the live
  // function looks. A string literal cannot be stripped.
  test("the record lands in the database, not just the repo", () => {
    expect(sql0124).toMatch(/COMMENT ON FUNCTION public\.refund_eligibility\(uuid\) IS/);
  });

  test("it carries the facts that make the decision auditable", () => {
    const comment = sql0124.slice(sql0124.indexOf("COMMENT ON FUNCTION"));
    expect(comment).toContain("Simon, 2026-08-11");
    // The notice trail, including the re-issue that lost the grace clause.
    for (const id of ["a3d822d5", "22eedef0", "d3ff81e6"]) expect(comment).toContain(id);
    expect(comment).toContain("zero days");
    expect(comment).toContain("제3조②");
    // Substance vs procedure must stay distinguishable.
    expect(comment).toContain("제17조");
    // Why nobody is hurt today, stated as luck rather than as a safeguard.
    expect(comment).toMatch(/ACCIDENT|accident/);
  });

  test("it names the trigger to re-open, with the query to check it", () => {
    expect(sql0124).toContain("RE-OPEN THIS JUDGEMENT");
    expect(sql0124).toMatch(
      /select count\(\*\) from public\.paddle_webhook_events\s*\n?\s*where event_type = 'transaction\.completed' and paddle_transaction_id is not null;/,
    );
  });

  test("re-stating a DEFINER function still revokes anon in the same file", () => {
    expect(sql0124).toMatch(/REVOKE EXECUTE ON FUNCTION public\.refund_eligibility\(uuid\) FROM anon/);
    expect(sql0124).not.toMatch(/GRANT\s+EXECUTE[\s\S]{0,80}TO\s+anon/i);
  });
});

// The same decision has to be reachable from the two surfaces that implement it,
// or the record is only findable by someone who already knows to look in SQL.
describe("0124 - the record is cross-referenced from the code that applies it", () => {
  test("the edge function header points at it", () => {
    expect(edge).toContain("db/migrations/0124");
    expect(edge).toContain("개정 경위");
  });

  // Simon, 2026-08-11: the published policy gets a plain revision history and
  // nothing more. The assessment of the notice procedure is an INTERNAL record
  // (0124's COMMENT ON, pinned above) because the product is still in testing
  // and there is no reason to publish it. The split is the decision, so both
  // halves are pinned: the facts must survive in the database, and must not
  // leak into the customer-facing document by a later well-meaning edit.
  test("the published policy carries a plain revision history, and only that", () => {
    const policy = readFileSync(
      join(__dirname, "..", "..", "..", "..", "docs", "legal", "refund-policy.md"),
      "utf8",
    );
    expect(policy).toContain("### 8. 개정 경위");
    expect(policy).toContain("### 8. Revision history");
    expect(policy).toContain("2026-07-17");
    // The notice-procedure assessment stays out of the published document.
    for (const s of ["사전 고지 기간", "advance notice period", "제3조②", "30일 사전공지"]) {
      expect(policy).not.toContain(s);
    }
  });
});
