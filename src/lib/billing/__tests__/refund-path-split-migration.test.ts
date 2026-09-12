// Structural guard for the refund path split and its 0189 integrity repair.
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
// Line endings are normalised because .gitattributes checks these files out as
// CRLF on Windows while a freshly written one is LF. Without this, any assertion
// containing a literal "\n" passes or fails depending on the checkout, not on
// the SQL - which is exactly the kind of guard that looks green for the wrong
// reason.
const read = (f: string) => readFileSync(join(MIGRATIONS, f), "utf8").replace(/\r\n/g, "\n");

const sql0136 = read("0136_refund_path_split.sql");
const sql0189 = read("0189_paddle_refund_consequence_integrity.sql");
const sql0124 = read("0124_refund_eligibility_decision_record.sql");
const sql0118 = read("0118_billing_refund_reconciliation.sql");
const sql0115 = read("0115_billing_self_service.sql");
const down0136 = readFileSync(join(MIGRATIONS, "rollback", "0136_down.sql"), "utf8").replace(/\r\n/g, "\n");
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

const effectiveApplyRefund = bodyOf(sql0189, "apply_billing_refund");

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

  test("apply_billing_refund is last defined in the 0189 integrity migration", () => {
    const defs = readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .filter((f) => /CREATE OR REPLACE FUNCTION public\.apply_billing_refund\b/i.test(read(f)));
    expect(defs[defs.length - 1]).toBe("0189_paddle_refund_consequence_integrity.sql");
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
    expect(effectiveApplyRefund).toContain("cl.provider_event_id = v_txn_id");
    expect(effectiveApplyRefund).toMatch(
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
    // side of the lookup would consider it.
    expect(effectiveApplyRefund.match(/e\.event_id <> p_event_id/g) ?? []).toHaveLength(2);
  });
});

describe("effective apply_billing_refund - a pack refund never touches the entitlement", () => {
  const body = effectiveApplyRefund;

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
    expect(body).toContain("SET stale_entitlement = true");
  });

  test("a FULL pack refund claws back; a PARTIAL one flags a human instead", () => {
    // clawback_credits removes ALL unspent units, which is more than a partial
    // refund returned. Inventing a proportional rule here is the thing not to do.
    expect(body).toContain("v_claw := public.clawback_credits(");
    expect(body).toMatch(/IF v_full THEN[\s\S]*?v_claw := public\.clawback_credits\(/);
    expect(body.match(/SET refund_review = true/g) ?? []).toHaveLength(2);
  });

  test("the money offset is still written for both products", () => {
    // A refund reduces revenue whatever it was for (C4).
    expect(body).toContain("INSERT INTO public.revenue_events");
    expect(body).toContain("-abs(p_amount_cents)");
    const revenueAt = body.indexOf("INSERT INTO public.revenue_events");
    expect(revenueAt).toBeLessThan(body.indexOf("IF v_pack_event IS NOT NULL THEN"));
  });
});

describe("0189 - provider refund type is authoritative and retries are reconcilable", () => {
  const body = effectiveApplyRefund;

  test("p_is_full is the only authority; an accepted self-service row cannot promote partial", () => {
    const oldBody = bodyOf(sql0136, "apply_billing_refund");
    const obsoletePromotion = "IF FOUND THEN v_full := true; END IF;";
    expect(oldBody).toContain(obsoletePromotion);
    expect(oldBody.replace(obsoletePromotion, "").replace(/\s+/g, " ").trim()).toBe(body);
    expect(body).toContain("v_full boolean := COALESCE(p_is_full, false)");
    expect(body.match(/v_full\s+boolean\s*:=/g) ?? []).toHaveLength(1);
    expect(body.replace("v_full boolean := COALESCE(p_is_full, false)", "")).not.toMatch(/\bv_full\s*:=/);
    expect(body).not.toContain("IF FOUND THEN v_full := true");
    expect(body).toContain("outcome = 'accepted'");
  });

  test("the consequence event claim is atomic and precedes every money or entitlement side effect", () => {
    const claim = body.indexOf("INSERT INTO public.paddle_webhook_events");
    const duplicate = body.indexOf("RETURN 'duplicate'");
    const ledger = body.indexOf("UPDATE public.billing_self_service_log");
    const revenue = body.indexOf("INSERT INTO public.revenue_events");
    const clawback = body.indexOf("public.clawback_credits");
    const revoke = body.indexOf("SET subscription_tier = 'free'");
    expect(claim).toBeGreaterThan(-1);
    expect(duplicate).toBeGreaterThan(claim);
    for (const sideEffect of [ledger, revenue, clawback, revoke]) {
      expect(sideEffect).toBeGreaterThan(duplicate);
    }
    expect(body).toContain("ON CONFLICT (event_id) DO NOTHING");
  });

  test("durable review marking is service-role-only and targets the recorded source event", () => {
    const review = bodyOf(sql0189, "set_paddle_refund_review");
    expect(review).toContain("billing_request_role() IS DISTINCT FROM 'service_role'");
    expect(review).toContain("SET refund_review = p_needs_review");
    expect(review).toContain("WHERE event_id = v_event_id");
    expect(review).toMatch(/IF NOT FOUND THEN RAISE EXCEPTION/);
    expect(sql0189).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.set_paddle_refund_review\(text, boolean\) FROM anon, authenticated/,
    );
    expect(sql0189).toMatch(
      /GRANT\s+EXECUTE ON FUNCTION public\.set_paddle_refund_review\(text, boolean\) TO service_role/,
    );
    expect(sql0189).toMatch(/COMMENT ON COLUMN public\.paddle_webhook_events\.refund_review IS/);
    expect(sql0189).toContain("ambiguous signed type evidence");
    expect(sql0189).toContain("an unconfirmed consequence");
  });

  test("both effective SECURITY DEFINER functions restate their service-only posture", () => {
    expect(sql0189.match(/SECURITY DEFINER\s*\nSET search_path = ''/g) ?? []).toHaveLength(2);
    expect(body).toContain("billing_request_role() IS DISTINCT FROM 'service_role'");
    expect(sql0189).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.apply_billing_refund\(text, text, text, text, text, timestamptz, integer, text, boolean\) FROM anon, authenticated/,
    );
    expect(sql0189).toMatch(
      /GRANT\s+EXECUTE ON FUNCTION public\.apply_billing_refund\(text, text, text, text, text, timestamptz, integer, text, boolean\) TO service_role/,
    );
  });

  test("the RPC signature stays deploy-order compatible with the handler", () => {
    const signature = (text: string) => {
      const at = text.indexOf("CREATE OR REPLACE FUNCTION public.apply_billing_refund");
      return text
        .slice(text.indexOf("(", at) + 1, text.indexOf(")\nRETURNS text", at))
        .replace(/--[^\n]*/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    };
    expect(signature(sql0189)).toBe(signature(sql0136));
  });
});

describe("0189 - the handler and RPC keep one deploy-order-compatible contract", () => {
  test("apply_billing_refund keeps 0118's exact 9-argument signature", () => {
    const sig = (text: string) => {
      const at = text.indexOf("CREATE OR REPLACE FUNCTION public.apply_billing_refund");
      return text
        .slice(text.indexOf("(", at) + 1, text.indexOf(")\nRETURNS text", at))
        .replace(/--[^\n]*/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    };
    expect(sig(sql0189)).toBe(sig(sql0118));
  });

  test("the webhook still passes exactly those parameters", () => {
    // If this drifted, the DB change would need a deploy first (the 0127/0130
    // ordering trap). It does not, and this is what keeps that true.
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
