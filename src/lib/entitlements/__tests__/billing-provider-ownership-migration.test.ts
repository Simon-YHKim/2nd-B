// 0133: one user is owned by one payment provider at a time (Simon 2026-08-19).
//
// The bug this closes is not "two providers overwrite each other" - it is worse
// than that, because the losing write was SILENT. 0109 made the entitlement
// write monotonic against users.subscription_event_at, a single per-user clock
// with no idea which provider stamped it, and recorded any skipped write as
// `stale_entitlement` ("upstream delivery is reordering; the tier is still
// correct"). With a second provider that comparison is between unrelated
// timelines, so a real payment whose webhook happened to land after a newer
// event from the OTHER provider would update zero rows, raise nothing, and be
// filed under an upstream artifact. Money in, no entitlement, ledger blaming
// the wrong thing.
//
// Ownership fixes it at the root: a foreign provider never reaches the ordering
// guard, so within a provider 0109's semantics are untouched.
//
// These assertions are deliberately about the DECISIONS, not the formatting.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS = join(__dirname, "..", "..", "..", "..", "db", "migrations");
const sql = readFileSync(join(MIGRATIONS, "0133_billing_provider_ownership.sql"), "utf8");

const PROVIDERS = ["paddle", "toss", "revenuecat", "manual"];

describe("0133 - the provider vocabulary is closed", () => {
  test("users.subscription_provider gains a CHECK", () => {
    expect(sql).toMatch(/ADD CONSTRAINT users_subscription_provider_check/);
    for (const p of PROVIDERS) expect(sql).toMatch(new RegExp(`'${p}'`));
  });

  test("existing values are normalised BEFORE the constraint is added", () => {
    // ADD CONSTRAINT validates existing rows; a stray value would abort the
    // whole migration on a table we cannot leave half-migrated.
    expect(sql.indexOf("UPDATE public.users")).toBeLessThan(sql.indexOf("ADD CONSTRAINT users_subscription_provider_check"));
  });

  test("apply_billing_event validates p_provider and p_source", () => {
    expect(sql).toMatch(/invalid provider: %/);
    expect(sql).toMatch(/invalid source: %/);
  });

  test("recorded events are attributable to a provider", () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'paddle'/);
  });
});

describe("0133 - ownership decides before entitlement is written", () => {
  test("the owning row is locked while ownership is decided", () => {
    // Without FOR UPDATE two providers' webhooks can both read "not owned" and
    // both proceed to claim the same user.
    expect(sql).toMatch(/FROM public\.users u\s*\n\s*WHERE u\.id = v_user_id\s*\n\s*FOR UPDATE/);
  });

  test("a foreign provider is refused while the incumbent is LIVE", () => {
    expect(sql).toMatch(/IF v_owner IS NOT NULL AND v_owner <> v_provider THEN/);
    expect(sql).toMatch(/COALESCE\(v_own_tier, 'free'\) <> 'free'/);
    expect(sql).toMatch(/v_own_until IS NULL OR v_own_until > v_at/);
    expect(sql).toMatch(/RETURN 'provider_conflict'/);
  });

  test("a refused event still logs revenue - the money moved regardless", () => {
    // The conflict branch must not lose the payment. Someone has to be able to
    // see that this user is paying twice in order to refund one of them.
    const conflict = sql.slice(sql.indexOf("RETURN 'provider_conflict'") - 1400, sql.indexOf("RETURN 'provider_conflict'"));
    expect(conflict).toMatch(/INSERT INTO public\.revenue_events/);
  });

  test("a conflict is recorded distinctly from staleness", () => {
    // stale_entitlement means "same provider, out of order" and is benign.
    // Reusing it for a conflict would hide a double-charge behind a flag whose
    // documented meaning is "the tier is still correct".
    expect(sql).toMatch(/SET provider_conflict = true/);
    expect(sql).toMatch(/provider_conflict boolean NOT NULL DEFAULT false/);
    expect(sql).toMatch(/paddle_webhook_events_conflict_idx/);
  });

  test("takeover is allowed only after the incumbent has lapsed", () => {
    expect(sql).toMatch(/v_takeover := true/);
    // and it is reached only by falling through the live-entitlement branch
    expect(sql.indexOf("RETURN 'provider_conflict'")).toBeLessThan(sql.indexOf("v_takeover := true"));
  });

  test("takeover bypasses the ordering guard, and says why", () => {
    // The two clocks are unrelated; applying 0109 across the boundary would
    // swallow the first event of the new subscription.
    const takeover = sql.slice(sql.indexOf("IF v_takeover THEN"), sql.indexOf("ELSE", sql.indexOf("IF v_takeover THEN")));
    expect(takeover).toMatch(/UPDATE public\.users/);
    expect(takeover).not.toMatch(/subscription_event_at IS NULL OR v_at >=/);
  });

  test("the same-provider path keeps 0109's guard verbatim", () => {
    expect(sql).toMatch(/WHERE id = v_user_id\s*\n\s*AND \(subscription_event_at IS NULL OR v_at >= subscription_event_at\)/);
    expect(sql).toMatch(/SET stale_entitlement = true/);
  });
});

describe("0133 - predicates that assumed a single provider", () => {
  test("the renewal anchor is scoped by provider", () => {
    expect(sql).toMatch(/WHERE e\.paddle_subscription_id = v_sub_id\s*\n\s*AND e\.provider = v_provider/);
  });

  test("the 0121 supersede UPDATE is scoped to the user", () => {
    expect(sql).toMatch(/AND user_id = v_user_id\s*\n\s*AND paddle_subscription_id = v_sub_id/);
  });
});

describe("0133 - house rules", () => {
  test("SECURITY DEFINER with an empty search_path", () => {
    expect(sql).toMatch(/SECURITY DEFINER\s*\n\s*SET search_path = ''/);
  });

  test("EXECUTE is revoked from anon and authenticated, granted to service_role", () => {
    // Supabase auto-grants EXECUTE to anon on creation, so REVOKE FROM PUBLIC
    // alone is not sufficient. check:definer-grants enforces this repo-wide.
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.apply_billing_event\([^)]*\) FROM anon, authenticated/);
    expect(sql).toMatch(/GRANT  EXECUTE ON FUNCTION public\.apply_billing_event\([^)]*\) TO service_role/);
  });

  test("the 18-argument signature is dropped before being recreated", () => {
    // CREATE OR REPLACE cannot change default arguments in place.
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS public\.apply_billing_event\(/);
    expect(sql.indexOf("DROP FUNCTION IF EXISTS public.apply_billing_event")).toBeLessThan(
      sql.indexOf("CREATE OR REPLACE FUNCTION public.apply_billing_event"),
    );
  });

  test("it is idempotent enough to re-apply", () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS/);
    expect(sql).toMatch(/DROP CONSTRAINT IF EXISTS/);
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS/);
  });
});
