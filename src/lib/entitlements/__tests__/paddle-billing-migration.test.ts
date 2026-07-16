// Structural guard for db/migrations/0087_paddle_billing_entitlement.sql - the
// atomic, idempotent, service-role-only "purchase -> entitlement" writer the
// paddle-webhook edge function calls (Phase 4, commerce audit BLOCKER 1).
// Mirrors the 0079 SSV guard style: assert the SQL's security posture and
// idempotency shape so a refactor cannot silently weaken them.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(
  join(__dirname, "..", "..", "..", "..", "db", "migrations", "0087_paddle_billing_entitlement.sql"),
  "utf8",
);

describe("0087_paddle_billing_entitlement.sql - structure", () => {
  test("creates the webhook dedup ledger keyed by the Paddle event id, RLS on", () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.paddle_webhook_events/);
    expect(sql).toMatch(/event_id\s+text PRIMARY KEY/);
    expect(sql).toMatch(/ALTER TABLE public\.paddle_webhook_events ENABLE ROW LEVEL SECURITY/);
  });

  test("billing RPC is SECURITY DEFINER, service_role-only, with a locked search_path", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.apply_billing_event/);
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/SET search_path = ''/);
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.apply_billing_event[\s\S]*FROM PUBLIC/);
    // House style (0036/0039/0040): the role-specific revoke, not just PUBLIC.
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.apply_billing_event[\s\S]*FROM anon, authenticated/);
    expect(sql).toMatch(/GRANT\s+EXECUTE ON FUNCTION public\.apply_billing_event[\s\S]*TO service_role/);
    expect(sql).not.toMatch(/GRANT\s+EXECUTE ON FUNCTION public\.apply_billing_event[\s\S]*TO authenticated/);
  });

  test("is idempotent: dedups the event id and applies only on first sight", () => {
    expect(sql).toMatch(/INSERT INTO public\.paddle_webhook_events[\s\S]*ON CONFLICT \(event_id\) DO NOTHING/);
    expect(sql).toMatch(/GET DIAGNOSTICS v_rows = ROW_COUNT/);
    expect(sql).toMatch(/IF v_rows = 0 THEN[\s\S]*RETURN 'duplicate'/);
  });

  test("only DB-canonical tiers can be written", () => {
    expect(sql).toMatch(/p_tier NOT IN \('free', 'soma', 'cortex', 'brain'\)/);
  });

  test("revenue rows carry the C4 columns and dedup on (source, external_id)", () => {
    expect(sql).toMatch(
      /INSERT INTO public\.revenue_events[\s\S]*is_related_party, customer_relation_type, source, external_id/,
    );
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS revenue_events_source_external_uidx/);
    expect(sql).toMatch(/ON CONFLICT \(source, external_id\) WHERE external_id IS NOT NULL DO NOTHING/);
  });

  test("entitlement write covers tier, expiry, and provider together", () => {
    expect(sql).toMatch(
      /SET subscription_tier\s+= p_tier,[\s\S]*subscription_expires_at = p_expires_at,[\s\S]*subscription_provider\s+= p_provider/,
    );
  });
});
