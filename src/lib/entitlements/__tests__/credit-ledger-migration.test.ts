// 0134: the credit ledger.
//
// Two of these assertions guard a LEGAL boundary rather than a design taste, and
// they are the reason this file exists at all:
//
//   1. No column may name a third party. 전자금융거래법 제2조제14호 defines
//      선불전자지급수단 as value used to buy goods "발행인 외의 제3자로부터".
//      A credit spendable only on our own service has no third party and falls
//      outside the definition. Add a to_user_id / transferable / payee column and
//      the product becomes a regulated instrument AT ANY REVENUE, including zero
//      - at which point registration requires a 법인 with 자본금 20억 (제30조제2항
//      + 시행령 제17조제1항제3호), an 개인사업자 cannot register at all, and
//      operating unregistered is 3년 이하 징역 또는 2천만원 이하 벌금
//      (제49조제5항제5호). Simon's answer on 2026-08-19 was "남의것 불가하게".
//
//   2. validity_days may not drop below a year. Simon chose "표준을 따른다".
//      신유형 상품권 표준약관 제10073호 제5조② sets 금액형 at 1년 이상 and
//      제5조③ reads any shorter term AS one year regardless, so a smaller number
//      is an unenforceable promise that only creates disputes. NULL is allowed
//      and required for IAP lots: Apple 3.1.1 says credits bought via in-app
//      purchase "may not expire". Nothing between is valid.
//
// The rest pin the concurrency argument, because it is load-bearing and
// invisible: the mutex must be taken BEFORE the lot scan, or two spends read the
// same remainders.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS = join(__dirname, "..", "..", "..", "..", "db", "migrations");
const sql = readFileSync(join(MIGRATIONS, "0134_credit_ledger.sql"), "utf8");

describe("0134 - the third-party boundary is structural", () => {
  test.each(["to_user_id", "transferable", "payee", "recipient_id", "merchant_id"])(
    "credit_ledger has no %s column",
    (col) => {
      // Not "we decided not to" - there must be no column a third party could be
      // named in, so the regulated shape is unreachable by accident.
      const ddl = sql.slice(sql.indexOf("CREATE TABLE IF NOT EXISTS public.credit_ledger"), sql.indexOf("COMMENT ON TABLE public.credit_ledger"));
      expect(ddl).not.toMatch(new RegExp(`\\b${col}\\b`));
    },
  );

  test("spendable features are a closed enumeration", () => {
    expect(sql).toMatch(/feature\s+text CHECK \(feature IS NULL OR feature IN \('reasoning'\)\)/);
  });

  test("the table comment states the boundary so it survives a future reader", () => {
    expect(sql).toMatch(/제2조제14호/);
    expect(sql).toMatch(/COMMENT ON TABLE public\.credit_ledger[\s\S]{0,600}선불전자지급수단/);
  });
});

describe("0134 - the standard-terms floor is enforced by the database", () => {
  test("validity_days admits NULL or >= 365 and nothing between", () => {
    expect(sql).toMatch(/validity_days\s+int\s+CHECK \(validity_days IS NULL OR validity_days >= 365\)/);
  });

  test("the reason is recorded next to the constraint", () => {
    expect(sql).toMatch(/제10073호/);
    expect(sql).toMatch(/may not expire/); // Apple 3.1.1, why NULL exists
  });
});

describe("0134 - lots make partial refunds expressible", () => {
  test("an opening entry is its own lot, checked by the database", () => {
    expect(sql).toMatch(/CONSTRAINT credit_ledger_opening CHECK \(\s*\n?\s*kind NOT IN \('purchase', 'promo', 'ad_reward'\) OR lot_id = id/);
  });

  test("entry signs match their kind", () => {
    expect(sql).toMatch(/CONSTRAINT credit_ledger_sign CHECK/);
    expect(sql).toMatch(/'spend', 'expire', 'refund_clawback'\)\s*AND units < 0/);
  });

  test("money-bearing entries must carry a provider and an amount", () => {
    expect(sql).toMatch(/\(kind = 'purchase'\) = \(provider IS NOT NULL AND amount_cents IS NOT NULL\)/);
  });

  test("the denormalized lot stamps cannot drift", () => {
    // A caller supplying different values is rejected, not believed.
    expect(sql).toMatch(/lot_opened_at does not match lot/);
    expect(sql).toMatch(/lot_expires_at does not match lot/);
    expect(sql).toMatch(/belongs to a different user/);
  });

  test("clawback reports what was unspent at refund time", () => {
    expect(sql).toMatch(/'unspent_at_refund', v_remain/);
  });
});

describe("0134 - concurrency", () => {
  test("spend takes the per-user mutex BEFORE scanning lots", () => {
    const body = sql.slice(sql.indexOf("FUNCTION public.spend_credits"));
    const mutex = body.indexOf("INSERT INTO public.credit_balance (user_id) VALUES (p_user_id)");
    const scan = body.indexOf("FOR r IN");
    expect(mutex).toBeGreaterThan(-1);
    expect(scan).toBeGreaterThan(-1);
    expect(mutex).toBeLessThan(scan);
  });

  test("every writer takes the same mutex", () => {
    for (const fn of ["grant_credits_free", "grant_credits_purchase", "refund_credit_spend", "clawback_credits", "expire_credit_lots"]) {
      const start = sql.indexOf(`FUNCTION public.${fn}`);
      const end = sql.indexOf("$$;", start);
      expect(sql.slice(start, end)).toMatch(/INSERT INTO public\.credit_balance \(user_id\)/);
    }
  });

  test("the cache carries a non-negative tripwire", () => {
    expect(sql).toMatch(/balance_available int NOT NULL DEFAULT 0 CHECK \(balance_available >= 0\)/);
  });

  test("spend is idempotent on the caller's key", () => {
    expect(sql).toMatch(/credit_ledger_idem_uidx/);
    expect(sql).toMatch(/'existing', true/);
  });

  test("a webhook retry cannot grant twice", () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS credit_ledger_provider_event_uidx/);
  });

  test("balance is derived, and expiry is honoured at read time", () => {
    expect(sql).toMatch(/FUNCTION public\.credit_available/);
    expect(sql).toMatch(/l\.lot_expires_at IS NULL OR l\.lot_expires_at > p_at/);
  });
});

describe("0134 - house rules", () => {
  test("every function is SECURITY DEFINER with an empty search_path", () => {
    const defs = sql.match(/CREATE OR REPLACE FUNCTION public\.\w+/g) ?? [];
    expect(defs.length).toBeGreaterThanOrEqual(8);
    const definer = sql.match(/SECURITY DEFINER\s*\n\s*SET search_path = ''/g) ?? [];
    expect(definer.length).toBe(defs.length);
  });

  test("service_role is detected via the 0112-safe helper, never inline", () => {
    // 0112 was an outage caused by one function reading only the GUC Supabase
    // stopped setting. billing_request_role() reads both forms.
    expect(sql).toMatch(/public\.billing_request_role\(\) <> 'service_role'/);
    expect(sql).not.toMatch(/current_setting\('request\.jwt\.claim\.role'/);
  });

  test("money-touching functions are revoked from anon AND authenticated", () => {
    for (const fn of ["grant_credits_free", "grant_credits_purchase", "refund_credit_spend", "clawback_credits", "expire_credit_lots"]) {
      expect(sql).toMatch(new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\) FROM anon, authenticated`));
      expect(sql).toMatch(new RegExp(`GRANT  EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\) TO service_role`));
    }
  });

  test("the tables are RLS-enabled, owner-select only, with writes revoked", () => {
    for (const t of ["credit_ledger", "credit_balance", "credit_skus"]) {
      expect(sql).toMatch(new RegExp(`ALTER TABLE public\\.${t}\\s+ENABLE ROW LEVEL SECURITY`));
      expect(sql).toMatch(new RegExp(`REVOKE INSERT, UPDATE, DELETE ON public\\.${t}\\s+FROM authenticated, anon`));
    }
    expect(sql).not.toMatch(/FOR (INSERT|UPDATE|DELETE) TO authenticated/);
  });

  test("deleted accounts keep the evidence, by design", () => {
    // The asymmetry with credit_balance's CASCADE is intentional and commented,
    // or someone will "fix" it.
    expect(sql).toMatch(/user_id\s+uuid REFERENCES public\.users \(id\) ON DELETE SET NULL/);
    expect(sql).toMatch(/Do not change to CASCADE/);
  });

  test("it is idempotent enough to re-apply", () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS/);
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS/);
    expect(sql).toMatch(/DROP TRIGGER IF EXISTS/);
    expect(sql).toMatch(/DROP POLICY IF EXISTS/);
  });
});

describe("0134 - it is inert", () => {
  test("no existing function or table is modified", () => {
    // The whole safety argument for applying this before the rest is written.
    expect(sql).not.toMatch(/ALTER TABLE public\.(users|usage_counters|revenue_events|paddle_webhook_events)/);
    expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION public\.(apply_billing_event|reserve_reasoning_run|refund_eligibility)/);
  });
});
