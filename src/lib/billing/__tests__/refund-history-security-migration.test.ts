import { readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS = join(__dirname, "..", "..", "..", "..", "db", "migrations");
const readMigration = (name: string) => readFileSync(join(MIGRATIONS, name), "utf8").replace(/\r\n/g, "\n");

const billingSelfService = readMigration("0115_billing_self_service.sql");
const canonicalEmail = readMigration("0108_canonical_email_one_account_per_mailbox.sql");
const confirmedAliasGuard = readMigration("0113_lock_orphan_backup_and_confirmed_alias_guard.sql");
const migration = readMigration("0117_refund_history_and_alias_rpc_lock.sql");

const extractRefundEligibility = (sql: string) => {
  const match = sql.match(
    /CREATE OR REPLACE FUNCTION public\.refund_eligibility\(p_user_id uuid\)[\s\S]*?\n\$\$;/,
  );
  if (!match) throw new Error("refund_eligibility() definition not found");
  return match[0];
};

const normalizeSql = (sql: string) =>
  sql
    .replace(/--[^\n]*/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

describe("0117 - refund history closes the eligibility gap", () => {
  const previousFunction = extractRefundEligibility(billingSelfService);
  const replacementFunction = extractRefundEligibility(migration);
  const replacementWithoutGuard = replacementFunction.replace(
    /\s*-- 0117 refund history guard begin[\s\S]*?-- 0117 refund history guard end\s*/i,
    "\n",
  );

  test("the 0115 function is preserved exactly apart from the new early-return guard", () => {
    expect(normalizeSql(replacementWithoutGuard)).toBe(normalizeSql(previousFunction));
  });

  test("a live refund request for the same user and transaction returns the terminal status", () => {
    expect(replacementFunction).toMatch(
      /EXISTS\s*\(\s*SELECT 1\s+FROM public\.billing_self_service_log l\s+WHERE l\.user_id = p_user_id\s+AND l\.action = 'refund_request'\s+AND l\.outcome IN \('pending', 'accepted'\)\s+AND l\.paddle_transaction_id IS NOT DISTINCT FROM v_txn\.paddle_transaction_id\s*\)/,
    );
    expect(replacementFunction).toMatch(
      /v_status := 'refund_already_requested';\s+RETURN jsonb_build_object\(\s*'status',\s+v_status/,
    );
  });

  test("the history guard runs after transaction resolution and before usage or window evaluation", () => {
    const noPayment = replacementFunction.indexOf("IF v_txn IS NULL THEN");
    const guard = replacementFunction.indexOf("-- 0117 refund history guard begin");
    const paymentAge = replacementFunction.indexOf("v_paid_at := v_txn.paid_at");

    expect(noPayment).toBeGreaterThan(-1);
    expect(guard).toBeGreaterThan(noPayment);
    expect(paymentAge).toBeGreaterThan(guard);
  });

  test("0112 role detection and the existing RPC grants remain intact", () => {
    expect(replacementFunction).toMatch(/v_is_owner := \(public\.billing_request_role\(\) = 'service_role'\)/);
    expect(replacementFunction).toMatch(/auth\.uid\(\) IS NULL OR auth\.uid\(\) <> p_user_id/);
    expect(replacementFunction).not.toMatch(/current_setting\('request\.jwt\.claim\.role'/);
    expect(migration).toMatch(/REVOKE ALL\s+ON FUNCTION public\.refund_eligibility\(uuid\) FROM PUBLIC/);
    expect(migration).toMatch(/REVOKE EXECUTE ON FUNCTION public\.refund_eligibility\(uuid\) FROM anon/);
    expect(migration).toMatch(/GRANT\s+EXECUTE ON FUNCTION public\.refund_eligibility\(uuid\) TO authenticated/);
    expect(migration).toMatch(/GRANT\s+EXECUTE ON FUNCTION public\.refund_eligibility\(uuid\) TO service_role/);
  });

  test("the migration does not touch 0109 entitlement ordering or any tier writer", () => {
    expect(migration).not.toMatch(/apply_billing_event|block_self_tier_change|block_self_tier_insert/);
    expect(migration).not.toMatch(/UPDATE\s+public\.users/i);
  });
});

describe("0117 - the alias guard leaves RPC but stays on the signup trigger path", () => {
  test("PUBLIC, anon, and authenticated all lose direct execute access", () => {
    expect(migration).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.block_alias_duplicate_signup\(\) FROM PUBLIC, anon, authenticated;/i,
    );
  });

  test("the auth.users before-insert trigger remains bound to the guard function", () => {
    expect(canonicalEmail).toMatch(
      /create trigger trg_block_alias_duplicate_signup\s+before insert on auth\.users\s+for each row\s+execute function public\.block_alias_duplicate_signup\(\);/i,
    );
    expect(confirmedAliasGuard).toMatch(
      /create or replace function public\.block_alias_duplicate_signup\(\)\s+returns trigger\s+language plpgsql\s+security definer/i,
    );
    expect(confirmedAliasGuard).toMatch(/a\.email_confirmed_at is not null/i);
  });

  test("the permission migration neither drops nor rewrites the trigger path", () => {
    expect(migration).not.toMatch(/DROP\s+(?:TRIGGER|FUNCTION)[^;]*block_alias_duplicate_signup/i);
    expect(migration).not.toMatch(/CREATE\s+(?:OR REPLACE\s+)?FUNCTION public\.block_alias_duplicate_signup/i);
    expect(migration).not.toMatch(/REVOKE[^;]*FROM[^;]*supabase_auth_admin/i);
  });

  test("the migration fails if the catalog no longer shows the enabled trigger dependency", () => {
    expect(migration).toMatch(/FROM pg_catalog\.pg_trigger t/);
    expect(migration).toMatch(/JOIN pg_catalog\.pg_proc p ON p\.oid = t\.tgfoid/);
    expect(migration).toMatch(/t\.tgenabled <> 'D'/);
    expect(migration).toMatch(/p\.proname = 'block_alias_duplicate_signup'/);
    expect(migration).toMatch(/RAISE EXCEPTION 'alias signup trigger dependency is missing or disabled'/);
  });
});

describe("0117 - Paddle refund adjustments update facts without writing tiers", () => {
  test("the audit row keeps the latest adjustment identity, status, event, and time", () => {
    for (const column of [
      "paddle_adjustment_id",
      "paddle_adjustment_status",
      "paddle_adjustment_event_id",
      "paddle_adjustment_event_at",
    ]) {
      expect(migration).toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS ${column}\\s`));
    }
    expect(migration).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS billing_self_service_adjustment_uidx/);
    expect(migration).toMatch(/ON public\.billing_self_service_log \(paddle_adjustment_id\)/);
  });

  test("the recorder is locked to service_role at both the body and grant layers", () => {
    expect(migration).toMatch(
      /CREATE OR REPLACE FUNCTION public\.record_paddle_refund_adjustment\(\s*p_event_id text,\s*p_event_type text,\s*p_adjustment_id text,\s*p_transaction_id text,\s*p_status text,\s*p_occurred_at timestamptz\s*\)/,
    );
    expect(migration).toMatch(/SECURITY DEFINER\s+SET search_path = ''/);
    expect(migration).toMatch(
      /public\.billing_request_role\(\) IS DISTINCT FROM 'service_role'[\s\S]*?RAISE EXCEPTION 'service_role only'/,
    );
    expect(migration).toMatch(
      /REVOKE ALL\s+ON FUNCTION public\.record_paddle_refund_adjustment\(text, text, text, text, text, timestamptz\) FROM PUBLIC/,
    );
    expect(migration).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.record_paddle_refund_adjustment\(text, text, text, text, text, timestamptz\) FROM anon, authenticated/,
    );
    expect(migration).toMatch(
      /GRANT\s+EXECUTE ON FUNCTION public\.record_paddle_refund_adjustment\(text, text, text, text, text, timestamptz\) TO service_role/,
    );
  });

  test("Paddle states map to the two refund-history outcomes", () => {
    expect(migration).toMatch(
      /WHEN 'pending_approval' THEN 'pending'\s+WHEN 'approved' THEN 'accepted'\s+WHEN 'rejected' THEN 'rejected'\s+WHEN 'reversed' THEN 'rejected'/,
    );
    expect(migration).toMatch(/p_status must be pending_approval, approved, rejected, or reversed/);
  });

  test("event id and adjustment id are both idempotent", () => {
    expect(migration).toMatch(/v_event_type NOT IN \('adjustment\.created', 'adjustment\.updated'\)/);
    expect(migration).toMatch(
      /INSERT INTO public\.paddle_webhook_events[\s\S]*?ON CONFLICT \(event_id\) DO NOTHING/,
    );
    expect(migration).toMatch(/v_event_id, v_event_type, v_user_id, v_transaction_id, v_occurred_at/);
    expect(migration).toMatch(/IF v_rows = 0 THEN\s+RETURN 'duplicate'/);
    expect(migration).toMatch(/WHERE l\.paddle_adjustment_id = v_adjustment_id/);
  });

  test("an existing self-service row wins, otherwise the completed transaction resolves its owner", () => {
    expect(migration).toMatch(
      /FROM public\.billing_self_service_log l[\s\S]*?l\.action = 'refund_request'[\s\S]*?l\.paddle_transaction_id = v_transaction_id/,
    );
    expect(migration).toMatch(
      /FROM public\.paddle_webhook_events e[\s\S]*?e\.event_type = 'transaction\.completed'[\s\S]*?e\.paddle_transaction_id = v_transaction_id/,
    );
    expect(migration).toMatch(/IF v_user_id IS NULL THEN\s+RAISE EXCEPTION 'refund adjustment owner not found/);
    expect(migration).toMatch(/INSERT INTO public\.billing_self_service_log/);
  });

  test("older events and terminal-to-pending regressions return stale", () => {
    expect(migration).toMatch(/v_occurred_at < v_current_event_at/);
    expect(migration).toMatch(
      /v_current_status IN \('approved', 'rejected', 'reversed'\)[\s\S]*?v_status = 'pending_approval'/,
    );
    expect(migration).toMatch(/RETURN 'stale'/);
  });

  test("the adjustment recorder never changes entitlement fields", () => {
    const recorder = migration.slice(migration.indexOf("CREATE OR REPLACE FUNCTION public.record_paddle_refund_adjustment"));
    expect(recorder).not.toMatch(/subscription_tier|subscription_expires_at|subscription_event_at/);
    expect(recorder).not.toMatch(/UPDATE\s+public\.users/i);
  });
});
