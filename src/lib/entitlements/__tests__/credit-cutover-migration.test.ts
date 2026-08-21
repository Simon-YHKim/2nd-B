// 0135: rewarded credits move onto the ledger, and usage_counters.reward_* is
// demoted from a store to a derived mirror.
//
// The assertions here are not stylistic. Each one pins a decision that an
// adversarial review found could silently lose a user's credits:
//
//   * LOCK ORDER. The migration locks reasoning_runs before usage_counters
//     because every live path takes them in that order. Reversing it deadlocks
//     the migration against a concurrent reserve.
//   * THE FREEZE. Postgres does not re-resolve a function mid-execution, so the
//     table locks manufacture a queue of backends still running the OLD bodies.
//     They resume after COMMIT. The freeze makes them abort loudly instead of
//     granting free runs and eating ad impressions.
//   * CURRENT MONTH ONLY. Today's credits die at KST month end with no record and
//     no consumer reads a past month, so backfilling history would MINT credits
//     the old system had already let lapse.
//   * NARROW EXCEPTION HANDLERS. WHEN OTHERS around the credit spend would
//     swallow 40P01/40001 and report a retryable deadlock as "out of credits".
//   * EXPLICIT REVOKES. Supabase auto-grants EXECUTE to authenticated on every
//     new function; without the revoke, grant_credits_free_internal mints credits
//     for anyone who can log in.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS = join(__dirname, "..", "..", "..", "..", "db", "migrations");
const sql = readFileSync(join(MIGRATIONS, "0135_credit_cutover.sql"), "utf8");

describe("0135 - it is one atomic transaction", () => {
  test("wrapped in BEGIN / COMMIT", () => {
    // LOCK TABLE is an ERROR outside a transaction block, and the CI dry-run
    // applies each file with psql in autocommit. Without this the file cannot
    // even be validated, and in prod a partial apply would leave the freeze on
    // with the old bodies still installed.
    const body = sql
      .split("\n")
      .filter((l) => l.trim() && !l.trim().startsWith("--"))
      .map((l) => l.trim());
    expect(body[0]).toBe("BEGIN;");
    expect(body[body.length - 1]).toBe("COMMIT;");
  });

  test("refuses to run without 0134", () => {
    expect(sql).toMatch(/to_regprocedure\('public\.spend_credits\(uuid,int,text,text\)'\) IS NULL/);
    expect(sql).toMatch(/0135 requires 0134_credit_ledger/);
  });
});

describe("0135 - lock order", () => {
  test("reasoning_runs is locked BEFORE usage_counters", () => {
    const runs = sql.indexOf("LOCK TABLE public.reasoning_runs");
    const counters = sql.indexOf("LOCK TABLE public.usage_counters");
    expect(runs).toBeGreaterThan(-1);
    expect(counters).toBeGreaterThan(runs);
  });

  test("the advisory lock stays first in reserve_reasoning_run", () => {
    const fn = sql.slice(sql.indexOf("FUNCTION public.reserve_reasoning_run"));
    const adv = fn.indexOf("pg_advisory_xact_lock");
    const firstWrite = fn.indexOf("INSERT INTO public.usage_counters");
    const firstRead = fn.indexOf("FROM public.reasoning_runs");
    expect(adv).toBeGreaterThan(-1);
    expect(adv).toBeLessThan(firstWrite);
    expect(adv).toBeLessThan(firstRead);
  });

  test("no advisory lock is added to the bump path", () => {
    const fn = sql.slice(
      sql.indexOf("FUNCTION public.bump_reasoning_usage_if_under_cap"),
      sql.indexOf("FUNCTION public.bump_reward_credits_if_under_cap"),
    );
    expect(fn).not.toMatch(/pg_advisory_xact_lock/);
  });

  test("the order is recorded where comment stripping cannot remove it", () => {
    // apply_migration strips `--` comments from function bodies (measured 7/7).
    expect(sql).toMatch(/COMMENT ON FUNCTION public\.reserve_reasoning_run\([^)]*\) IS[\s\S]{0,400}FIRST lock-taking statement/);
    expect(sql).toMatch(/COMMENT ON FUNCTION public\.bump_reasoning_usage_if_under_cap\([^)]*\) IS[\s\S]{0,300}do NOT add an advisory lock/);
  });
});

describe("0135 - the freeze catches stragglers", () => {
  test("a BEFORE trigger rejects every writer except the mirror", () => {
    expect(sql).toMatch(/CREATE TRIGGER trg_usage_counters_freeze_credits\s*\n\s*BEFORE INSERT OR UPDATE ON public\.usage_counters/);
    expect(sql).toMatch(/are frozen by 0135/);
  });

  test("the mirror is exempted by a transaction-local flag, not by role", () => {
    expect(sql).toMatch(/current_setting\('app\.credit_mirror', true\) = '1'/);
    expect(sql).toMatch(/set_config\('app\.credit_mirror', '1', true\)/);
  });

  test("the freeze covers INSERT as well as UPDATE", () => {
    // An old body's ON CONFLICT upsert can take either path.
    const fn = sql.slice(sql.indexOf("FUNCTION public.usage_counters_freeze_credits"));
    expect(fn).toMatch(/TG_OP = 'INSERT'/);
  });
});

describe("0135 - the backfill translates, it does not invent", () => {
  test("only the current KST month is migrated", () => {
    expect(sql).toMatch(/month_bucket <> public\.kst_month_bucket\(now\(\)\)\s*THEN 'skipped_past_bucket'/);
  });

  test("week-shaped and profile-less rows are recorded as skipped, not dropped", () => {
    expect(sql).toMatch(/'skipped_week_shaped_bucket'/);
    expect(sql).toMatch(/'skipped_no_profile'/);
  });

  test("a profile-less account with a live balance ABORTS the migration", () => {
    // Skipping it silently would delete a real person's spendable balance.
    expect(sql).toMatch(/account\(s\) hold rewarded credits but have no public\.users row/);
  });

  test("reward_consumed is clamped on both sides", () => {
    // The column has no CHECK anywhere (0089 added it bare), so it is untrusted.
    expect(sql).toMatch(/-LEAST\(GREATEST\(s\.reward_consumed_at_cutover, 0\), s\.reward_credits_at_cutover\)/);
  });

  test("grant and spend are separate rows so lifetime totals stay honest", () => {
    expect(sql).toMatch(/'backfill:0135:grant:'/);
    expect(sql).toMatch(/'backfill:0135:spend:'/);
  });

  test("the opening lot is ad_reward, not promo", () => {
    // promo would not count toward credit_ad_earned_this_month, handing every
    // user back their whole 20/month earning headroom.
    expect(sql).toMatch(/SELECT src\.lot_id, src\.user_id, 'ad_reward'/);
  });

  test("it re-verifies the balance and aborts on any mismatch", () => {
    expect(sql).toMatch(/0135 backfill mismatch on % user\(s\); aborting/);
  });

  test("it is re-runnable", () => {
    expect(sql).toMatch(/ON CONFLICT \(user_id, month_bucket\) DO NOTHING/);
    expect(sql).toMatch(/NOT EXISTS \(\s*\n?\s*SELECT 1 FROM public\.credit_ledger l/);
  });

  test("it refuses to run next to a KST month boundary", () => {
    expect(sql).toMatch(/refusing to apply within 2h of a KST month boundary/);
  });
});

describe("0135 - the mirror keeps deployed clients correct", () => {
  test("an AFTER trigger on the ledger re-derives the counter columns", () => {
    expect(sql).toMatch(/CREATE TRIGGER trg_credit_ledger_mirror_counter\s*\n\s*AFTER INSERT ON public\.credit_ledger/);
  });

  test("the mirrored pair yields the spendable balance by the client's own arithmetic", () => {
    // client computes earned - consumed; this makes that LEAST(available, earned)
    expect(sql).toMatch(/GREATEST\(v_earned - LEAST\(v_avail, v_earned\), 0\)/);
  });

  test("a drift view exists for the mirror specifically", () => {
    expect(sql).toMatch(/CREATE VIEW public\.credit_counter_drift/);
  });

  test("the balance drift view compares cache to raw ledger, not to available", () => {
    // Comparing to credit_available would leave it permanently non-empty after
    // every expiry until the sweep ran - a tripwire that always rings is off.
    // Slice to the view's own statement: the COMMENT that follows it explains
    // this very choice and naturally mentions credit_available in prose.
    const start = sql.indexOf("VIEW public.credit_balance_drift");
    const view = sql.slice(start, sql.indexOf(";", start));
    expect(view).toMatch(/SUM\(units\)/);
    expect(view).not.toMatch(/credit_available/);
  });
});

describe("0135 - error surface", () => {
  test("spend_credits raises a distinct sqlstate", () => {
    expect(sql).toMatch(/RAISE EXCEPTION 'credit_insufficient' USING ERRCODE = 'X0001'/);
  });

  test("both spenders translate it to reasoning_limit_exceeded", () => {
    const hits = sql.match(/WHEN sqlstate 'X0001' OR sqlstate '23503' THEN\s*\n\s*RAISE EXCEPTION 'reasoning_limit_exceeded' USING ERRCODE = 'P0001'/g) ?? [];
    expect(hits.length).toBe(2);
  });

  test("the handlers are narrow, never WHEN OTHERS", () => {
    // WHEN OTHERS would swallow 40P01 (deadlock) and 40001 (serialization) and
    // report a retryable fault as "you are out of credits".
    expect(sql).not.toMatch(/EXCEPTION\s*\n\s*WHEN OTHERS/);
  });

  test("a profile-less account gets the limit sheet, not a generic error", () => {
    const guards = sql.match(/IF NOT EXISTS \(SELECT 1 FROM public\.users u WHERE u\.id = p_user_id\) THEN\s*\n\s*RAISE EXCEPTION 'reasoning_limit_exceeded'/g) ?? [];
    expect(guards.length).toBe(2);
  });
});

describe("0135 - refunds land where the credit actually went", () => {
  test("the run records which ledger entries it drew from", () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS credit_entry_ids uuid\[\]/);
  });

  test("a pre-cutover in-flight run refunds into the ledger, not the frozen column", () => {
    // The backfill already translated its reward_consumed into a ledger spend, so
    // decrementing the counter would put the unit nowhere.
    expect(sql).toMatch(/'legacy_refund:0135:'/);
    expect(sql).toMatch(/pre-0135 in-flight run refunded/);
  });

  test("the legacy refund is spend_refund, not a fresh ad_reward grant", () => {
    // An ad_reward row would count toward the 20/month ceiling and silently eat
    // headroom the old system did not eat.
    const branch = sql.slice(sql.indexOf("PRE-0135 IN-FLIGHT RUN"), sql.indexOf("FUNCTION public.fail_reasoning_run"));
    expect(branch).toMatch(/'spend_refund'/);
    expect(branch).not.toMatch(/'ad_reward'/);
  });

  test("the 4-arg refund function is dropped, not overloaded", () => {
    // Leaving it alive would keep a body that writes the frozen column.
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS public\.refund_reasoning_spend\(uuid, text, text, text\)/);
  });

  test("all three settle paths call the new refund", () => {
    for (const fn of ["fail_reasoning_run", "cancel_reasoning_run", "recover_stale_reasoning_runs"]) {
      const start = sql.indexOf(`FUNCTION public.${fn}`);
      const end = sql.indexOf("$$;", start);
      expect(sql.slice(start, end)).toMatch(/refund_reasoning_run_spend/);
    }
  });
});

describe("0135 - grants", () => {
  test("every internal is revoked from anon AND authenticated", () => {
    for (const fn of [
      "grant_credits_free_internal",
      "credit_refund_spend_internal",
      "usage_counters_mirror_credits",
      "credit_ledger_mirror_counter",
      "usage_counters_freeze_credits",
      "refund_reasoning_run_spend",
    ]) {
      expect(sql).toMatch(new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\) FROM anon, authenticated`));
    }
  });

  test("no internal is granted to anybody", () => {
    for (const fn of ["grant_credits_free_internal", "credit_refund_spend_internal", "usage_counters_mirror_credits"]) {
      expect(sql).not.toMatch(new RegExp(`GRANT\\s+EXECUTE ON FUNCTION public\\.${fn}\\(`));
    }
  });

  test("the client-facing contracts keep their grants", () => {
    expect(sql).toMatch(/GRANT  EXECUTE ON FUNCTION public\.bump_reward_credits_if_under_cap\(uuid, text, int\) TO authenticated/);
    expect(sql).toMatch(/GRANT  EXECUTE ON FUNCTION public\.reserve_reasoning_run\(uuid, text, text, int\) TO authenticated/);
    expect(sql).toMatch(/GRANT  EXECUTE ON FUNCTION public\.bump_reasoning_usage_if_under_cap\(uuid, text, int\) TO authenticated/);
  });

  test("the SSV grant stays service_role only", () => {
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.grant_reward_credits_ssv\([^)]*\) FROM anon, authenticated/);
    expect(sql).toMatch(/GRANT  EXECUTE ON FUNCTION public\.grant_reward_credits_ssv\([^)]*\) TO service_role/);
  });
});

describe("0135 - the server-owned ceilings are unchanged", () => {
  test("20 per month and 2 per watch, still hardcoded in both grant paths", () => {
    const caps = sql.match(/c_monthly_cap constant int := 20;/g) ?? [];
    const per = sql.match(/c_per_call\s+constant int := 2;/g) ?? [];
    expect(caps.length).toBe(2);
    expect(per.length).toBe(2);
  });

  test("the ceiling is now read under the mutex", () => {
    // A derived ceiling is read-then-write, so without the mutex two concurrent
    // watches both read 18 and both grant 2.
    const fn = sql.slice(sql.indexOf("FUNCTION public.bump_reward_credits_if_under_cap"));
    const mutex = fn.indexOf("INSERT INTO public.credit_balance");
    const read = fn.indexOf("credit_ad_earned_this_month");
    expect(mutex).toBeLessThan(read);
  });

  test("the SSV dedup stays first and stays on the shared table", () => {
    // rewarded_ssv_txns is shared with the chat SSV grant (0091); moving it would
    // let one AdMob transaction pay out on both surfaces.
    const fn = sql.slice(sql.indexOf("FUNCTION public.grant_reward_credits_ssv"));
    const dedup = fn.indexOf("INSERT INTO public.rewarded_ssv_txns");
    const grant = fn.indexOf("grant_credits_free_internal");
    expect(dedup).toBeGreaterThan(-1);
    expect(dedup).toBeLessThan(grant);
  });

  test("auto runs still never touch credits", () => {
    const auto = sql.slice(sql.indexOf("AUTO never touches credits"), sql.indexOf("MANUAL, step 1"));
    expect(auto).not.toMatch(/spend_credits/);
  });
});

describe("0135 - the sweep is safe to schedule", () => {
  test("it is ordered, chunked, and non-overlapping", () => {
    const fn = sql.slice(sql.indexOf("FUNCTION public.expire_credit_lots"));
    expect(fn).toMatch(/ORDER BY l\.user_id, l\.lot_id/);
    expect(fn).toMatch(/LIMIT GREATEST\(COALESCE\(p_limit, 500\), 1\)/);
    expect(fn).toMatch(/pg_try_advisory_xact_lock/);
  });

  test("it tolerates the no-JWT case so pg_cron can run it", () => {
    expect(sql).toMatch(/billing_request_role\(\) IS NOT NULL\s*\n\s*AND public\.billing_request_role\(\) <> 'service_role'/);
  });
});

describe("0135 - a rollback exists", () => {
  const DOWN = join(MIGRATIONS, "rollback", "0135_down.sql");

  test("the down file is present", () => {
    expect(existsSync(DOWN)).toBe(true);
  });

  test("it is outside the numbered apply glob", () => {
    // db/migrations/*.sql is non-recursive, so a subdirectory is never applied.
    expect(DOWN).toContain(join("migrations", "rollback"));
  });

  test("it re-derives the counters instead of just restoring bodies", () => {
    const down = readFileSync(DOWN, "utf8");
    expect(down).toMatch(/INSERT INTO public\.usage_counters/);
    expect(down).toMatch(/credit_ad_earned_this_month/);
  });

  test("it refuses to delete purchased balances", () => {
    const down = readFileSync(DOWN, "utf8");
    expect(down).toMatch(/purchased credit lot\(s\) exist/);
  });
});
