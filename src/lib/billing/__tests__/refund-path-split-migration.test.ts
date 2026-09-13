// Structural guard for the refund path split and its unnumbered integrity draft.
//
// 0136 exists because three functions decided refunds by "the user's newest
// transaction.completed" and none of them could say what that payment bought:
//
//   claim_billing_self_service -> the id we POST to Paddle as the thing to
//     refund. A subscription refund request would have refunded a credit pack.
//   refund_eligibility         -> the anchor for the 7-day window AND the usage
//     gate. A pack would re-open a window that had closed.
//   apply_billing_refund       -> revoked the tier on any full refund, so
//     refunding a pack cancelled a live subscription.
//
// The whole safety argument for landing this ahead of the purchase path is that
// it is SCOPE-ONLY: with no purchase lots in existence the added predicate
// matches nothing and every function behaves exactly as before. These tests are
// what make that argument checkable rather than asserted, which is why the
// central one compares normalised bodies against 0115 and 0124 rather than
// grepping for a few strings.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { FREE_RUNS_PER_WEEK, REFUND_WINDOW_DAYS } from "../subscription-manage";

const MIGRATIONS = join(__dirname, "..", "..", "..", "..", "db", "migrations");
const MIGRATION_DRAFTS = join(MIGRATIONS, "..", "migration-drafts");
// Line endings are normalised because .gitattributes checks these files out as
// CRLF on Windows while a freshly written one is LF. Without this, any assertion
// containing a literal "\n" passes or fails depending on the checkout, not on
// the SQL - which is exactly the kind of guard that looks green for the wrong
// reason.
const read = (f: string) => readFileSync(join(MIGRATIONS, f), "utf8").replace(/\r\n/g, "\n");
const readDraft = (f: string) =>
  readFileSync(join(MIGRATION_DRAFTS, f), "utf8").replace(/\r\n/g, "\n");

const sql0136 = read("0136_refund_path_split.sql");
const refundIntegrityDraft = readDraft("UNNUMBERED_paddle_refund_consequence_integrity.sql");
const sql0124 = read("0124_refund_eligibility_decision_record.sql");
const sql0118 = read("0118_billing_refund_reconciliation.sql");
const sql0115 = read("0115_billing_self_service.sql");
const down0136 = readFileSync(join(MIGRATIONS, "rollback", "0136_down.sql"), "utf8").replace(/\r\n/g, "\n");
const deploymentContract = readFileSync(
  join(MIGRATIONS, "..", "..", "docs", "SESSION-OWNERSHIP.md"),
  "utf8",
).replace(/\r\n/g, "\n");
const migrationWorkflow = readFileSync(
  join(MIGRATIONS, "..", "..", ".github", "workflows", "supabase-dry-run.yml"),
  "utf8",
).replace(/\r\n/g, "\n");
const paddleRegression = readFileSync(
  join(MIGRATIONS, "..", "tests", "paddle_refund_consequence_regression.sql"),
  "utf8",
).replace(/\r\n/g, "\n");
const webhook = readFileSync(
  join(__dirname, "..", "..", "..", "..", "supabase", "functions", "paddle-webhook", "index.ts"),
  "utf8",
).replace(/\r\n/g, "\n");

/** Executable text of one function: body only, comments stripped, whitespace collapsed. */
function bodyOf(text: string, fn: string): string {
  const at = text.indexOf(`CREATE OR REPLACE FUNCTION public.${fn}`);
  expect(at).toBeGreaterThan(-1);
  const from = text.indexOf("AS $$", at) + "AS $$".length;
  const to = text.indexOf("\n$$;", from);
  expect(to).toBeGreaterThan(from);
  return text
    .slice(from, to)
    .replace(/--[^\n]*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const draftApplyRefund = bodyOf(refundIntegrityDraft, "apply_billing_refund");
const draftRecordAdjustment = bodyOf(
  refundIntegrityDraft,
  "record_paddle_refund_adjustment",
);
const draftRecordAdjustmentReview = bodyOf(
  refundIntegrityDraft,
  "record_paddle_adjustment_review",
);
const draftRecordUnhandled = bodyOf(
  refundIntegrityDraft,
  "record_unhandled_billing_event",
);
const draftSetRefundReview = bodyOf(
  refundIntegrityDraft,
  "set_paddle_refund_review",
);
const draftSettleSelfService = bodyOf(
  refundIntegrityDraft,
  "settle_billing_self_service",
);

// The one predicate 0136 adds, as it reads after whitespace collapse.
const PREDICATE =
  "AND NOT EXISTS ( SELECT 1 FROM public.credit_ledger cl WHERE cl.kind = 'purchase' " +
  "AND cl.provider = e.provider AND cl.provider_event_id IN (e.paddle_transaction_id, e.event_id) )";

const withoutPredicate = (body: string) => body.split(PREDICATE).join(" ").replace(/\s+/g, " ").trim();

describe("refund migrations - each function's live definition is pinned", () => {
  // Migrations apply in filename order, so the LAST file to define a function is
  // the one prod runs. Pinned per function rather than as a blanket assertion,
  // for the reason 0121's test gives: a blanket pin has to be edited on every
  // change to anything, which is how a guard becomes a rubber stamp.
  test.each([
    ["refund_eligibility"],
    ["claim_billing_self_service"],
  ])("%s is last defined in 0136_refund_path_split.sql", (fn) => {
    const defs = readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .filter((f) => new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\b`, "i").test(read(f)));
    expect(defs.length).toBeGreaterThan(0);
    expect(defs[defs.length - 1]).toBe("0136_refund_path_split.sql");
  });

  test("apply_billing_refund remains live in 0136 while its repair is an unnumbered draft", () => {
    const defs = readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .filter((f) => /CREATE OR REPLACE FUNCTION public\.apply_billing_refund\b/i.test(read(f)));
    expect(defs[defs.length - 1]).toBe("0136_refund_path_split.sql");
    expect(migrationWorkflow).toContain(
      "\\i db/migration-drafts/UNNUMBERED_paddle_refund_consequence_integrity.sql",
    );
  });

  test("the rollback lives outside the apply glob", () => {
    // db/migrations/*.sql is non-recursive, so rollback/ is never applied. If
    // this ever moved up a directory it would run as a migration and undo 0136.
    expect(readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql"))).not.toContain("0136_down.sql");
  });
});

describe("0136 - scope only: the added predicate is the ENTIRE difference", () => {
  test("refund_eligibility equals 0124's body once the predicate is removed", () => {
    expect(bodyOf(sql0136, "refund_eligibility")).toContain(PREDICATE);
    expect(withoutPredicate(bodyOf(sql0136, "refund_eligibility"))).toBe(
      bodyOf(sql0124, "refund_eligibility"),
    );
  });

  test("claim_billing_self_service equals 0115's body once the predicate is removed", () => {
    expect(bodyOf(sql0136, "claim_billing_self_service")).toContain(PREDICATE);
    expect(withoutPredicate(bodyOf(sql0136, "claim_billing_self_service"))).toBe(
      bodyOf(sql0115, "claim_billing_self_service"),
    );
  });

  test("the recorded refund rule is untouched: 7 days, 2 runs, revised, gate on", () => {
    // Simon's 2026-08-11 decision. 0136 narrows WHICH payment the rule is about;
    // it must not touch the rule.
    expect(sql0136).toContain(`c_window_days   constant int := ${REFUND_WINDOW_DAYS};`);
    expect(sql0136).toContain(`c_free_per_week constant int := ${FREE_RUNS_PER_WEEK};`);
    expect(sql0136.match(/'policy',\s+'revised'/g) ?? []).toHaveLength(3);
    expect(sql0136.match(/'usage_gate_applies',\s+true/g) ?? []).toHaveLength(3);
    expect(bodyOf(sql0136, "refund_eligibility")).not.toMatch(/pre_revision|grace|effective_from/i);
  });

  test("the decision record is re-attached, not dropped, and says what changed", () => {
    // CREATE OR REPLACE keeps the previous COMMENT ON, so a re-stated function
    // with an un-restated comment silently describes the old body.
    expect(sql0136).toMatch(/COMMENT ON FUNCTION public\.refund_eligibility\(uuid\) IS/);
    expect(sql0136).toContain("RECORDED DECISION, Simon, 2026-08-11");
    expect(sql0136).toContain("AMENDED BY 0136");
  });
});

describe("0136 - the discriminator is the ledger, and it tolerates both key conventions", () => {
  test("a lot is matched by transaction id OR webhook event id", () => {
    // 0134's comment proposed the event id; a refund adjustment only carries the
    // transaction id. Accepting both is what stops a purchase path that followed
    // the original wording from producing an unrefundable pack.
    expect(PREDICATE).toContain("cl.provider_event_id IN (e.paddle_transaction_id, e.event_id)");
    expect(draftApplyRefund).toContain("cl.provider_event_id = v_txn_id");
    expect(draftApplyRefund).toMatch(
      /cl\.provider_event_id IN \( SELECT e\.event_id FROM public\.paddle_webhook_events e/,
    );
  });

  test("the preferred convention is written where a reader of the live DB sees it", () => {
    // Same reason 0124 used a COMMENT ON: the apply path strips line comments
    // from prosrc, but a string literal cannot be stripped.
    expect(sql0136).toMatch(/COMMENT ON COLUMN public\.credit_ledger\.provider_event_id IS/);
    expect(sql0136).toContain("SHOULD be the provider TRANSACTION id");
  });

  test("the lookup excludes the adjustment row 0136 itself just inserted", () => {
    // That row carries the same transaction id, so without this the event-id
    // side of the lookup would consider it. The draft derives provider from the
    // provider-scoped transaction instead of doing the old second event lookup.
    expect(draftApplyRefund.match(/e\.event_id <> v_consequence_event_id/g) ?? []).toHaveLength(1);
  });
});

describe("draft apply_billing_refund - a pack refund never touches the entitlement", () => {
  const body = draftApplyRefund;

  test("the pack branch runs BEFORE the revoke and returns instead of falling through", () => {
    const packAt = body.indexOf("IF v_pack_event IS NOT NULL THEN");
    const revokeAt = body.indexOf("SET subscription_tier = 'free'");
    expect(packAt).toBeGreaterThan(-1);
    expect(revokeAt).toBeGreaterThan(packAt);
    for (const ret of ["'clawed_back'", "'pack_partial_review'", "'pack_clawback_missed'"]) {
      expect(body).toContain(`RETURN ${ret};`);
    }
  });

  test("there is exactly ONE tier write, and it is the subscription branch", () => {
    expect(body.match(/SET subscription_tier = 'free'/g) ?? []).toHaveLength(1);
    // 0109's ordering guard and 0115's stale marker survive the re-creation.
    expect(body).toContain("AND (subscription_event_at IS NULL OR v_at >= subscription_event_at)");
    expect(body).toMatch(/SET refund_review = true, stale_entitlement = true/);
  });

  test("a FULL pack refund claws back; a PARTIAL one flags a human instead", () => {
    // clawback_credits removes ALL unspent units, which is more than a partial
    // refund returned. Inventing a proportional rule here is the thing not to do.
    expect(body).toContain("v_claw := public.clawback_credits(");
    expect(body).toMatch(/IF v_full THEN[\s\S]*?v_claw := public\.clawback_credits\(/);
    const packBranch = body.slice(
      body.indexOf("IF v_pack_event IS NOT NULL"),
      body.indexOf("IF v_full AND v_user_id IS NOT NULL"),
    );
    expect(packBranch.match(/SET refund_review = true/g) ?? []).toHaveLength(2);
  });

  test("the money offset is still written for both products", () => {
    // A refund reduces revenue whatever it was for (C4).
    expect(body).toContain("INSERT INTO public.revenue_events");
    expect(body).toContain("-p_amount_cents");
    const revenueAt = body.indexOf("INSERT INTO public.revenue_events");
    expect(revenueAt).toBeLessThan(body.indexOf("IF v_pack_event IS NOT NULL THEN"));
  });
});

describe("unnumbered Paddle refund integrity draft - authoritative and reconcilable", () => {
  const body = draftApplyRefund;

  test("hot-table index work fails closed on bounded lock and statement deadlines", () => {
    expect(refundIntegrityDraft).toContain("SET LOCAL lock_timeout = '10s'");
    expect(refundIntegrityDraft).toContain("SET LOCAL statement_timeout = '15min'");
  });

  test("p_is_full is the only authority; an accepted self-service row cannot promote partial", () => {
    const oldBody = bodyOf(sql0136, "apply_billing_refund");
    const obsoletePromotion = "IF FOUND THEN v_full := true; END IF;";
    expect(oldBody).toContain(obsoletePromotion);
    expect(body).toContain("v_full boolean := COALESCE(p_is_full, false)");
    expect(body.match(/v_full\s+boolean\s*:=/g) ?? []).toHaveLength(1);
    expect(body.replace("v_full boolean := COALESCE(p_is_full, false)", "")).not.toMatch(/\bv_full\s*:=/);
    expect(body).not.toContain("IF FOUND THEN v_full := true");
    expect(body).toContain("outcome = 'accepted'");
  });

  test("the consequence event claim is atomic and precedes every money or entitlement side effect", () => {
    const claim = body.indexOf("INSERT INTO public.paddle_webhook_events");
    const duplicate = body.indexOf(
      "RETURN CASE WHEN v_consequence_needs_review THEN 'duplicate_review' ELSE 'duplicate' END",
    );
    const ledger = body.indexOf("UPDATE public.billing_self_service_log");
    const revenue = body.indexOf("INSERT INTO public.revenue_events");
    const clawback = body.indexOf("public.clawback_credits");
    const revoke = body.indexOf("SET subscription_tier = 'free'");
    expect(claim).toBeGreaterThan(-1);
    expect(duplicate).toBeGreaterThan(claim);
    for (const sideEffect of [ledger, revenue, clawback, revoke]) {
      expect(sideEffect).toBeGreaterThan(duplicate);
    }
    expect(body).toContain("ON CONFLICT DO NOTHING");
  });

  test("the current adjustment lifecycle is locked and must still be approved before any consequence claim", () => {
    const lifecycleLock = body.indexOf(
      "FROM public.billing_self_service_log l WHERE l.paddle_adjustment_id = v_adjustment_id FOR UPDATE",
    );
    const statusGuard = body.indexOf("v_adjustment_status IS DISTINCT FROM 'approved'");
    const claim = body.indexOf("INSERT INTO public.paddle_webhook_events");

    expect(lifecycleLock).toBeGreaterThan(-1);
    expect(statusGuard).toBeGreaterThan(lifecycleLock);
    expect(claim).toBeGreaterThan(statusGuard);
    expect(body).toContain("RETURN 'adjustment_not_approved_review'");
  });

  test("the consequence RPC binds the exact source lifecycle event before deriving one adjustment claim", () => {
    const sourceGuard = body.indexOf(
      "v_adjustment_event_id IS DISTINCT FROM v_source_event_id",
    );
    const claim = body.indexOf("INSERT INTO public.paddle_webhook_events");

    expect(body).toContain("v_source_event_id text := NULLIF(btrim(p_event_id), '')");
    expect(body).toContain("v_consequence_event_id text := v_adjustment_id || ':consequence'");
    expect(sourceGuard).toBeGreaterThan(-1);
    expect(sourceGuard).toBeLessThan(claim);
    expect(body).toContain("RETURN 'stale_consequence_review'");
    expect(body).toMatch(
      /WHERE event_id = v_source_event_id[\s\S]*?GET DIAGNOSTICS v_rows = ROW_COUNT; IF v_rows = 0 THEN RAISE EXCEPTION 'refund consequence source event not found'/,
    );
    expect(body).toMatch(
      /VALUES \( v_consequence_event_id,[\s\S]*?v_adjustment_id \) ON CONFLICT DO NOTHING/,
    );
    expect(body).toMatch(
      /INSERT INTO public\.revenue_events[\s\S]*?'paddle', v_consequence_event_id/,
    );
    expect(body).toContain(
      "RETURN CASE WHEN v_consequence_needs_review THEN 'duplicate_review' ELSE 'duplicate' END",
    );
  });

  test("the actual old Edge caller cannot silently lose a consequence during cutover", () => {
    const oldCallerGuard = body.indexOf(
      "v_source_event_id = v_adjustment_event_id || ':consequence'",
    );
    const sourceGuard = body.indexOf(
      "v_adjustment_event_id IS DISTINCT FROM v_source_event_id",
    );

    expect(oldCallerGuard).toBeGreaterThan(-1);
    expect(oldCallerGuard).toBeLessThan(sourceGuard);
    expect(body).toContain(
      "RAISE EXCEPTION 'source lifecycle event id required; deploy the matching paddle-webhook'",
    );
    expect(draftRecordAdjustment).toContain("'refund_consequence_pending'");
    expect(paddleRegression).toContain("'evt_ci_race_approved_2:consequence'");
    expect(paddleRegression).toContain("billing_review_reason = 'refund_consequence_pending'");
    expect(deploymentContract).toMatch(/in-flight[\s\S]*?0건/);
  });

  test("an ownerless terminal lifecycle becomes a durable tombstone before later approved delivery", () => {
    expect(draftRecordAdjustment).not.toContain(
      "RAISE EXCEPTION 'refund adjustment owner not found",
    );
    expect(draftRecordAdjustment).toContain("RETURN 'owner_missing_review'");
    expect(draftRecordAdjustment).toMatch(
      /pg_catalog\.pg_advisory_xact_lock\(\s*pg_catalog\.hashtextextended\(v_adjustment_id, 0\)\s*\)/,
    );
    expect(draftRecordAdjustment).toContain("v_prior_status IN ('rejected', 'reversed')");
    expect(draftRecordAdjustment).toContain(
      "v_prior_status = 'approved' AND v_status = 'rejected'",
    );
    expect(draftRecordAdjustment).toContain("v_occurred_at < v_prior_event_at");
    expect(draftRecordAdjustment).not.toContain("v_occurred_at <= v_prior_event_at");
    expect(draftRecordAdjustment).toContain("v_prior_event_id <> v_event_id");
    expect(draftRecordAdjustment).toContain("billing_review_reason = 'stale_adjustment_lifecycle'");
  });

  test("provider lifecycle rows do not consume the one live self-service request claim", () => {
    expect(refundIntegrityDraft).toMatch(
      /ADD COLUMN IF NOT EXISTS provider_adjustment_only boolean NOT NULL DEFAULT false/,
    );
    expect(refundIntegrityDraft).toMatch(
      /CREATE UNIQUE INDEX billing_self_service_refund_once_uidx[\s\S]*?AND NOT provider_adjustment_only/,
    );
    expect(draftRecordAdjustment).toContain("provider_adjustment_only");
    expect(draftRecordAdjustment).toContain("true");
    expect(refundIntegrityDraft).toMatch(
      /eligibility_detail ->> 'source' = 'paddle_adjustment'/,
    );
    expect(body).toMatch(
      /paddle_transaction_id = v_txn_id\s+AND paddle_adjustment_id = v_adjustment_id\s+AND provider_refunded_at IS NULL/,
    );
  });

  test("a provider adjustment only attaches to a self-service row with the same provider identity", () => {
    expect(draftRecordAdjustment).toContain(
      "l.provider_ref IS NULL OR l.provider_ref = v_adjustment_id",
    );
    expect(draftRecordAdjustment).toContain(
      "provider_ref = COALESCE(provider_ref, v_adjustment_id)",
    );
    expect(draftRecordAdjustment).toContain(
      "RAISE EXCEPTION 'refund adjustment provider reference mismatch'",
    );
    expect(paddleRegression).toContain("provider_ref = 'adj_ci_self_service_a'");
    expect(paddleRegression).toContain("paddle_adjustment_id = 'adj_ci_self_service_b'");
  });

  test("self-service settlement cannot overwrite a provider identity claimed by an earlier webhook", () => {
    expect(draftSettleSelfService).toContain(
      "billing_request_role() IS DISTINCT FROM 'service_role'",
    );
    expect(draftSettleSelfService).toContain("FOR UPDATE");
    expect(draftSettleSelfService).toContain("NOT provider_adjustment_only");
    expect(draftSettleSelfService).toContain(
      "v_existing_ref IS DISTINCT FROM v_provider_ref",
    );
    expect(draftSettleSelfService).toContain(
      "RAISE EXCEPTION 'self-service provider reference mismatch'",
    );
    expect(draftSettleSelfService).toContain(
      "provider_ref = COALESCE(v_existing_ref, v_provider_ref)",
    );
    expect(paddleRegression).toContain("adj_ci_settle_race_a");
    expect(paddleRegression).toContain("adj_ci_settle_race_b");
    expect(paddleRegression).toContain("settlement overwrote an earlier webhook provider identity");
    expect(refundIntegrityDraft).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.settle_billing_self_service\(uuid, text, integer, text, text\) FROM anon, authenticated/,
    );
    expect(refundIntegrityDraft).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.settle_billing_self_service\(uuid, text, integer, text, text\) TO service_role/,
    );
  });

  test("a late synchronous error cannot downgrade webhook-owned refund state", () => {
    const lifecycleGuard = draftSettleSelfService.indexOf(
      "v_existing_adjustment_id IS NOT NULL",
    );
    const acceptedGuard = draftSettleSelfService.indexOf(
      "v_existing_outcome = 'accepted' AND p_outcome <> 'accepted'",
    );
    const settlementUpdate = draftSettleSelfService.indexOf(
      "UPDATE public.billing_self_service_log",
    );
    expect(lifecycleGuard).toBeGreaterThan(-1);
    expect(acceptedGuard).toBeGreaterThan(lifecycleGuard);
    expect(settlementUpdate).toBeGreaterThan(acceptedGuard);
    expect(paddleRegression).toContain("adj_ci_late_settle");
    expect(paddleRegression).toContain("late settlement downgraded webhook-owned outcome");
  });

  test("chargeback reversal review keeps normalized identifiers after raw payload purge", () => {
    for (const column of [
      "paddle_adjustment_id",
      "paddle_adjustment_action",
      "paddle_adjustment_status",
      "billing_review_reason",
    ]) {
      expect(refundIntegrityDraft).toMatch(
        new RegExp(`ADD COLUMN IF NOT EXISTS ${column}\\s+text`),
      );
    }
    const reviewRecorder = bodyOf(refundIntegrityDraft, "record_paddle_adjustment_review");
    expect(reviewRecorder).toContain("refund_review");
    expect(reviewRecorder).toContain("billing_review_reason");
    expect(reviewRecorder).toContain("paddle_adjustment_action");
    expect(refundIntegrityDraft).toMatch(
      /GRANT\s+EXECUTE ON FUNCTION public\.record_paddle_adjustment_review\([\s\S]*?TO service_role/,
    );
  });

  test("an exact replay cannot reopen an operator-resolved review", () => {
    expect(draftRecordAdjustmentReview).toContain("billing_review_resolved_at IS NOT NULL");
    expect(draftRecordAdjustmentReview).toContain(
      "billing_review_reason IS NOT DISTINCT FROM v_review_reason",
    );
    expect(paddleRegression).toContain("resolved review replay reopened the queue");
  });

  test("operator review resolution clears both the source and its canonical consequence claim", () => {
    expect(draftSetRefundReview).toContain(
      "SELECT e.paddle_adjustment_id INTO v_adjustment_id",
    );
    expect(draftSetRefundReview).toContain(
      "refund_consequence_adjustment_id = v_adjustment_id",
    );
    expect(draftSetRefundReview).toContain(
      "billing_review_resolved_at = CASE WHEN p_needs_review THEN NULL ELSE now() END",
    );
    expect(draftSetRefundReview).toContain("NOT p_needs_review");
    expect(draftSetRefundReview).toContain("paddle_adjustment_id = v_adjustment_id");
    expect(paddleRegression).toContain("older adjustment source review survived consequence success");
  });

  test("a review-only reversal is durable even before its transaction owner is known", () => {
    expect(draftRecordAdjustmentReview).not.toContain(
      "RAISE EXCEPTION 'adjustment review owner not found'",
    );
    expect(draftRecordAdjustmentReview).toContain(
      "user_id = COALESCE(user_id, v_user_id)",
    );
    expect(draftRecordAdjustmentReview).toContain(
      "user_id IS NULL OR v_user_id IS NULL OR user_id = v_user_id",
    );
  });

  test("an unhandled-event redelivery may enrich nulls but cannot switch provider identity", () => {
    for (const field of [
      "user_id = COALESCE(user_id, v_user_id)",
      "paddle_subscription_id = COALESCE(paddle_subscription_id, v_sub_id)",
      "paddle_transaction_id = COALESCE(paddle_transaction_id, v_txn_id)",
    ]) {
      expect(draftRecordUnhandled).toContain(field);
    }
    for (const identityGuard of [
      "provider = 'paddle'",
      "user_id IS NULL OR v_user_id IS NULL OR user_id = v_user_id",
      "paddle_adjustment_action IS NULL OR v_adjustment_action IS NULL OR paddle_adjustment_action = v_adjustment_action",
      "paddle_adjustment_status IS NULL OR v_adjustment_status IS NULL OR paddle_adjustment_status = v_adjustment_status",
    ]) {
      expect(draftRecordUnhandled).toContain(identityGuard);
    }
    expect(draftRecordUnhandled).toMatch(
      /WHERE e\.event_type = 'transaction\.completed' AND e\.provider = 'paddle' AND e\.paddle_transaction_id = v_txn_id/,
    );
    expect(draftRecordUnhandled).toMatch(
      /WHERE e\.event_type = 'transaction\.completed' AND e\.provider = 'paddle' AND e\.paddle_subscription_id = v_sub_id/,
    );
  });

  test("legacy event-scoped claims are bridged into one adjustment-scoped consequence claim", () => {
    expect(refundIntegrityDraft).toMatch(
      /ADD COLUMN IF NOT EXISTS refund_consequence_adjustment_id text/,
    );
    expect(refundIntegrityDraft).toMatch(
      /c\.event_id = l\.paddle_adjustment_event_id \|\| ':consequence'/,
    );
    expect(refundIntegrityDraft).toMatch(
      /c\.event_id = l\.paddle_adjustment_id \|\| ':consequence'/,
    );
    expect(refundIntegrityDraft).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS paddle_webhook_events_refund_consequence_adjustment_uidx[\s\S]*?refund_consequence_adjustment_id/,
    );
    expect(body).toContain("v_adjustment_id text := NULLIF(btrim(p_adjustment_id), '')");
    expect(body).toContain("refund_consequence_adjustment_id");
    // No conflict target: both the event primary key and the adjustment-claim
    // partial unique index are valid duplicate proofs during the cutover.
    expect(body).toContain("ON CONFLICT DO NOTHING");
    expect(body).not.toContain("ON CONFLICT (event_id) DO NOTHING");
  });

  test("migration preflight detects every historical event-scoped consequence before the unique index", () => {
    const duplicateAbort = refundIntegrityDraft.indexOf(
      "duplicate refund consequences already exist; reconcile before applying this draft",
    );
    const unmappedAbort = refundIntegrityDraft.indexOf(
      "unmapped legacy refund consequence exists; reconcile before applying this draft",
    );
    const uniqueIndex = refundIntegrityDraft.indexOf(
      "paddle_webhook_events_refund_consequence_adjustment_uidx",
    );

    expect(refundIntegrityDraft).toMatch(
      /c\.event_id = s\.event_id \|\| ':consequence'/,
    );
    expect(refundIntegrityDraft).toContain("legacy_event_source");
    expect(refundIntegrityDraft).not.toContain("transaction_fallback AS");
    expect(duplicateAbort).toBeGreaterThan(-1);
    expect(unmappedAbort).toBeGreaterThan(-1);
    expect(uniqueIndex).toBeGreaterThan(duplicateAbort);
    expect(uniqueIndex).toBeGreaterThan(unmappedAbort);
    expect(migrationWorkflow).toContain(
      "db/tests/paddle_refund_duplicate_preflight_fixture.sql",
    );
  });

  test("an older event-scoped claim that cannot be mapped exactly fails closed for review", () => {
    const legacyGuard = body.indexOf("RETURN 'legacy_consequence_review'");
    const revenue = body.indexOf("INSERT INTO public.revenue_events");

    // The self-service row only retains the latest lifecycle event id. If an
    // earlier created event already applied a consequence, its event-scoped
    // claim must still stop the canonical adjustment claim from paying twice.
    expect(body).toMatch(
      /JOIN public\.paddle_webhook_events s\s+ON c\.event_id = s\.event_id \|\| ':consequence'/,
    );
    expect(body).toMatch(
      /c\.refund_consequence_adjustment_id IS NULL[\s\S]*?s\.paddle_transaction_id = v_txn_id/,
    );
    expect(legacyGuard).toBeGreaterThan(-1);
    expect(revenue).toBeGreaterThan(legacyGuard);
  });

  test("the database refuses a consequence without exact financial facts and an owner", () => {
    const claim = body.indexOf("INSERT INTO public.paddle_webhook_events");
    const amountGuard = body.indexOf("p_amount_cents IS NULL OR p_amount_cents <= 0");
    const currencyGuard = body.indexOf("p_currency IS NULL OR p_currency NOT IN");
    const ownerGuard = body.indexOf("IF v_user_id IS NULL THEN RAISE EXCEPTION");
    for (const guard of [amountGuard, currencyGuard, ownerGuard]) {
      expect(guard).toBeGreaterThan(-1);
      expect(guard).toBeLessThan(claim);
    }
    expect(body).toContain("-p_amount_cents");
    expect(body).not.toContain("COALESCE(p_currency, 'USD')");
  });

  test("a full refund revokes only the current Paddle entitlement owned by its target transaction", () => {
    const lock = body.indexOf("FOR UPDATE");
    const ownershipGuard = body.indexOf("v_current_provider IS DISTINCT FROM 'paddle'");
    const subscriptionGuard = body.indexOf(
      "v_current_subscription_id IS DISTINCT FROM v_target_subscription_id",
    );
    const newerEntitlementGuard = body.indexOf("v_at < v_current_event_at");
    const laterPaymentGuard = body.indexOf("paddle_transaction_id <> v_txn_id");
    const review = body.indexOf("RETURN 'entitlement_review'");
    const revoke = body.indexOf("SET subscription_tier = 'free'");

    expect(lock).toBeGreaterThan(-1);
    expect(laterPaymentGuard).toBeGreaterThan(lock);
    expect(ownershipGuard).toBeGreaterThan(laterPaymentGuard);
    expect(subscriptionGuard).toBeGreaterThan(ownershipGuard);
    expect(newerEntitlementGuard).toBeGreaterThan(subscriptionGuard);
    expect(review).toBeGreaterThan(laterPaymentGuard);
    expect(revoke).toBeGreaterThan(review);
    expect(body).toContain("event_type = 'transaction.completed'");
    expect(body).toContain("provider = 'paddle'");
    expect(body).toContain("SET refund_review = true");
  });

  test("the Edge and database currency allowlists are identical", () => {
    const edgeBlock = webhook.match(/PADDLE_ADJUSTMENT_CURRENCIES = new Set<string>\(\[([\s\S]*?)\]\)/)?.[1];
    const sqlBlock = refundIntegrityDraft.match(/p_currency NOT IN \(([\s\S]*?)\) THEN/)?.[1];
    expect(edgeBlock).toBeDefined();
    expect(sqlBlock).toBeDefined();
    const currencies = (value: string) => [...value.matchAll(/'([A-Z]{3})'/g)].map((match) => match[1]);
    const edgeCurrencies = currencies(edgeBlock!);
    const sqlCurrencies = currencies(sqlBlock!);
    expect(new Set(edgeCurrencies).size).toBe(edgeCurrencies.length);
    expect(new Set(sqlCurrencies).size).toBe(sqlCurrencies.length);
    expect(sqlCurrencies).toEqual(edgeCurrencies);
  });

  test("durable review marking is service-role-only and targets the recorded source event", () => {
    const review = bodyOf(refundIntegrityDraft, "set_paddle_refund_review");
    expect(review).toContain("billing_request_role() IS DISTINCT FROM 'service_role'");
    expect(review).toContain("SET refund_review = p_needs_review");
    expect(review).toContain("WHERE event_id = v_event_id");
    expect(review).toMatch(/IF NOT FOUND THEN RAISE EXCEPTION/);
    expect(refundIntegrityDraft).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.set_paddle_refund_review\(text, boolean\) FROM anon, authenticated/,
    );
    expect(refundIntegrityDraft).toMatch(
      /GRANT\s+EXECUTE ON FUNCTION public\.set_paddle_refund_review\(text, boolean\) TO service_role/,
    );
    expect(refundIntegrityDraft).toMatch(
      /COMMENT ON COLUMN public\.paddle_webhook_events\.refund_review IS/,
    );
    expect(refundIntegrityDraft).toContain("ambiguous signed type or financial evidence");
    expect(refundIntegrityDraft).toContain("an unconfirmed consequence");
  });

  test("all effective SECURITY DEFINER functions restate their service-only posture", () => {
    expect(refundIntegrityDraft.match(/SECURITY DEFINER\s*\nSET search_path = ''/g) ?? []).toHaveLength(
      6,
    );
    expect(body).toContain("billing_request_role() IS DISTINCT FROM 'service_role'");
    expect(refundIntegrityDraft).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.apply_billing_refund\(text, text, text, text, text, timestamptz, integer, text, boolean\) FROM anon, authenticated/,
    );
    expect(refundIntegrityDraft).toMatch(
      /GRANT\s+EXECUTE ON FUNCTION public\.apply_billing_refund\(text, text, text, text, text, timestamptz, integer, text, boolean\) TO service_role/,
    );
  });

  test("the draft preserves the 9-argument signature while changing p_event_id behind an OFF cutover", () => {
    const signature = (text: string) => {
      const at = text.indexOf("CREATE OR REPLACE FUNCTION public.apply_billing_refund");
      return text
        .slice(text.indexOf("(", at) + 1, text.indexOf(")\nRETURNS text", at))
        .replace(/--[^\n]*/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    };
    expect(signature(refundIntegrityDraft)).toBe(signature(sql0136));
    expect(refundIntegrityDraft).toContain("preserves its 9-argument SQL signature only");
  });
});

describe("unnumbered Paddle refund integrity draft - explicitly disabled cutover", () => {
  test("pins the only safe migration and Edge deployment order", () => {
    expect(deploymentContract).toContain("유일한 안전 순서");

    const orderedSteps = [
      "1. `PADDLE_WEBHOOK_ENABLED`를 `1`이 아닌 값으로 설정",
      "2. Edge invocation·gateway·Paddle delivery 로그",
      "3. 초기 rollout에서는 server-only `PADDLE_CHECKOUT_BINDING_SECRET`을 `subscription-manage`와",
      "4. `subscription-manage`을 먼저 배포",
      "5. 새 Paddle client token",
      "6. 기존 client token을 폐기",
      "7. 이미 열린 legacy checkout을 조정",
      "8. `db/migration-drafts/UNNUMBERED_paddle_refund_consequence_integrity.sql`에 당시 새 번호를",
      "9. strict `paddle-webhook`을 배포",
      "10. 격리된 staging 또는 local에서 `PADDLE_WEBHOOK_ENABLED=1`로 설정하고",
      "11. 운영에서는 콘솔 소유자가 제한된 점검 창에서만 `PADDLE_WEBHOOK_ENABLED=1`로 전환",
      "12. 모든 운영 canary가 통과한 경우에만 `PADDLE_WEBHOOK_ENABLED=1`을 유지",
    ];
    const offsets = orderedSteps.map((step) => deploymentContract.indexOf(step));
    expect(offsets.every((offset) => offset >= 0)).toBe(true);
    expect(offsets).toEqual([...offsets].sort((left, right) => left - right));
    expect(deploymentContract).toContain("DB-first만으로는 안전하지 않다");
    expect(deploymentContract).toContain("Edge-first도 안전하지 않다");
    expect(deploymentContract).toContain("9개 인자 SQL 시그니처만 유지한다");
    expect(deploymentContract).toContain("구 Edge와 새 DB 함수는 의미상 호환되지 않는다");
    expect(deploymentContract).toContain("구 Edge는 그 두 번째 RPC 오류를 기록한 뒤에도 200을 반환했다");
    expect(deploymentContract).toContain("하나라도 실패하면 즉시 `PADDLE_WEBHOOK_ENABLED`를 다시 끈다");
  });

  test("pins the checkout-binding transition before the strict webhook cutover", () => {
    const orderedSteps = [
      "1. `PADDLE_WEBHOOK_ENABLED`",
      "in-flight가",
      "초기 rollout에서는 server-only `PADDLE_CHECKOUT_BINDING_SECRET`을 `subscription-manage`와",
      "subscription-manage`을 먼저 배포",
      "새 Paddle client token",
      "기존 client token을 폐기",
      "열린 legacy checkout을 조정",
      "8. `db/migration-drafts/UNNUMBERED_paddle_refund_consequence_integrity.sql`",
      "strict `paddle-webhook`을 배포",
      "PADDLE_WEBHOOK_ENABLED=1",
    ];
    const offsets = orderedSteps.map((step) => deploymentContract.indexOf(step));
    expect(offsets.every((offset) => offset >= 0)).toBe(true);
    expect(offsets).toEqual([...offsets].sort((left, right) => left - right));
  });

  test("pins an executable one-signer/two-verifier checkout-binding rotation", () => {
    const orderedRotation = [
      "`paddle-webhook`의 current를 new, previous를 old로 먼저 설정",
      "`paddle-webhook`을 먼저 재배포",
      "그 다음 `subscription-manage`의 current signer를 new로 전환",
      "실제 마지막 old binding 발급 시각을 기록",
      "실제 시각 + 7일 + 5분보다 이르면 즉시 뒤로 연장",
      "webhook의 previous secret과 expiry를 제거",
    ];
    const offsets = orderedRotation.map((step) => deploymentContract.indexOf(step));
    expect(offsets.every((offset) => offset >= 0)).toBe(true);
    expect(offsets).toEqual([...offsets].sort((left, right) => left - right));
    expect(deploymentContract).toContain(
      "`subscription-manage`는 previous secret을 읽거나 서명하지 않는다",
    );
  });

  test("pins failure recovery to a disabled roll-forward, never an unsafe rollback", () => {
    expect(deploymentContract).toContain("웹훅을 비활성 상태로 유지한 채 roll-forward");
    expect(deploymentContract).toContain("구 Edge 함수를 재배포하지 않는다");
    expect(deploymentContract).toContain("`db/migrations/rollback/0136_down.sql`을 실행하지 않는다");
  });

  test("the webhook still passes the established apply_billing_refund parameters", () => {
    for (const p of [
      "p_event_id",
      "p_event_type",
      "p_adjustment_id",
      "p_transaction_id",
      "p_subscription_id",
      "p_occurred_at",
      "p_amount_cents",
      "p_currency",
      "p_is_full",
    ]) {
      expect(webhook).toMatch(new RegExp(`${p}:`));
    }
    expect(webhook).toMatch(/rpc\('apply_billing_refund'/);
  });

  test("the scratch Postgres job executes lifecycle, retry, multi-adjustment, and durable-review regressions", () => {
    expect(migrationWorkflow).toContain(
      "\\i db/tests/paddle_refund_consequence_regression.sql",
    );
    for (const evidence of [
      "reversed then older approved applied a forbidden consequence",
      "rolled-back approved retry applied after reversal",
      "multiple adjustments collided or stamped one another",
      "raw payload purge erased the durable chargeback reversal queue",
      "ownerless reversed tombstone allowed an older approved consequence",
      "same-time pending to approved transition was rejected",
      "same-time approved to rejected transition was accepted",
      "adjustment review RPC privileges are not service-role-only",
      "review identity mismatch changed the durable adjustment id",
    ]) {
      expect(paddleRegression).toContain(evidence);
    }
  });
});

describe("0136 - the security posture is restated, not inherited", () => {
  test.each([
    ["claim_billing_self_service", "uuid, text, text, text, jsonb"],
    [
      "apply_billing_refund",
      "text, text, text, text, text, timestamptz, integer, text, boolean",
    ],
  ])("%s revokes anon + authenticated and grants only service_role", (fn, args) => {
    const sig = `public\\.${fn}\\(${args.replace(/,\s*/g, ",\\s*")}\\)`;
    expect(sql0136).toMatch(new RegExp(`REVOKE EXECUTE ON FUNCTION ${sig} FROM anon, authenticated`));
    expect(sql0136).toMatch(new RegExp(`GRANT\\s+EXECUTE ON FUNCTION ${sig} TO service_role`));
  });

  test("refund_eligibility stays readable by the owner it is about", () => {
    expect(sql0136).toMatch(/REVOKE EXECUTE ON FUNCTION public\.refund_eligibility\(uuid\) FROM anon/);
    expect(sql0136).toContain("GRANT  EXECUTE ON FUNCTION public.refund_eligibility(uuid) TO authenticated;");
    // The body still refuses a caller asking about somebody else.
    expect(bodyOf(sql0136, "refund_eligibility")).toContain("auth.uid() <> p_user_id");
  });

  test("every re-created function keeps SECURITY DEFINER with an empty search_path", () => {
    const definers = sql0136.match(/SECURITY DEFINER\s*\nSET search_path = ''/g) ?? [];
    expect(definers).toHaveLength(3);
  });
});

describe("0136 - the operator's inbox", () => {
  test("refund_review is added, defaulted false, and indexed for the rows that matter", () => {
    expect(sql0136).toMatch(/ADD COLUMN IF NOT EXISTS refund_review boolean NOT NULL DEFAULT false/);
    expect(sql0136).toMatch(
      /CREATE INDEX IF NOT EXISTS paddle_webhook_events_refund_review_idx[\s\S]*?WHERE refund_review;/,
    );
    expect(sql0136).toMatch(/COMMENT ON COLUMN public\.paddle_webhook_events\.refund_review IS/);
  });

  test("it is a third, distinct flag - not a reuse of the other two", () => {
    // stale_entitlement = same provider, out of order. provider_conflict = a
    // different provider owns the entitlement. Neither means "a person decides".
    expect(sql0136).toContain("Distinct from stale_entitlement");
    expect(sql0136).toContain("provider_conflict");
  });
});

describe("0136 - the rollback is honest about what it re-arms", () => {
  test("it refuses to run once real purchases exist", () => {
    expect(down0136).toMatch(/FROM public\.credit_ledger WHERE kind = 'purchase'/);
    expect(down0136).toMatch(/RAISE EXCEPTION[\s\S]*?0136_down/);
  });

  test("it restores all three bodies", () => {
    for (const fn of ["claim_billing_self_service", "refund_eligibility", "apply_billing_refund"]) {
      expect(down0136).toContain(`CREATE OR REPLACE FUNCTION public.${fn}`);
    }
    expect(withoutPredicate(bodyOf(down0136, "refund_eligibility"))).toBe(
      bodyOf(sql0124, "refund_eligibility"),
    );
    expect(bodyOf(down0136, "refund_eligibility")).not.toContain(PREDICATE);
    expect(bodyOf(down0136, "apply_billing_refund")).toBe(bodyOf(sql0118, "apply_billing_refund"));
  });

  test("it does not drop the column: the one irreversible step is left out", () => {
    expect(down0136).not.toMatch(/DROP COLUMN[^\n]*refund_review/);
  });
});
