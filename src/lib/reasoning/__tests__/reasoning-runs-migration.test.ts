// Structural guard for db/migrations/0092_reasoning_runs.sql — the
// reasoning-run job infrastructure (spec 2026-07-18 인계 계약 1~7): reserve →
// start → complete/fail/cancel → ratify/apply with stale recovery. Pins the
// contract's load-bearing pieces: idempotency, the auto/manual spend split
// (auto = weekly base only, always leaving one manual run; credits are
// manual-only — Simon 확정 2026-07-18), boundary-safe refunds against the
// buckets STAMPED on the run row, per-proposal exactly-once transitions, and
// SQL ↔ TS drift (tier-map cap arms + every RPC name the client lib calls).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REASONING_PER_WEEK } from "../../entitlements/tier-map";

const root = join(__dirname, "..", "..", "..", "..");
const sql = readFileSync(join(root, "db", "migrations", "0092_reasoning_runs.sql"), "utf8");
const lib = readFileSync(join(root, "src", "lib", "reasoning", "runs.ts"), "utf8");

describe("0092_reasoning_runs.sql - tables", () => {
  test("runs table: status machine, spend kinds, stamped buckets, key uniqueness", () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.reasoning_runs/);
    expect(sql).toMatch(
      /CHECK \(status IN \('reserved', 'running', 'proposed', 'ratified', 'cancelled', 'failed', 'recovered'\)\)/,
    );
    expect(sql).toMatch(/CHECK \(spend IN \('base', 'credit', 'none'\)\)/);
    expect(sql).toMatch(/CHECK \(trigger_kind IN \('manual', 'auto'\)\)/);
    expect(sql).toMatch(/week_bucket\s+text NOT NULL/);
    expect(sql).toMatch(/month_bucket\s+text NOT NULL/);
    expect(sql).toMatch(/UNIQUE \(user_id, idempotency_key\)/);
  });

  test("proposals table: per-run ordinals with exactly-once status states", () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.reasoning_run_proposals/);
    expect(sql).toMatch(/CHECK \(status IN \('proposed', 'ratified', 'dismissed', 'applied'\)\)/);
    expect(sql).toMatch(/PRIMARY KEY \(run_id, ordinal\)/);
  });

  test("RLS: owner-read only; writes revoked (RPC-only, 0078 pattern)", () => {
    expect(sql).toMatch(/ALTER TABLE public\.reasoning_runs ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/ALTER TABLE public\.reasoning_run_proposals ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/REVOKE INSERT, UPDATE, DELETE ON public\.reasoning_runs FROM authenticated/);
    expect(sql).toMatch(/REVOKE INSERT, UPDATE, DELETE ON public\.reasoning_runs FROM anon/);
    expect(sql).toMatch(/REVOKE INSERT, UPDATE, DELETE ON public\.reasoning_run_proposals FROM authenticated/);
    expect(sql).toMatch(/REVOKE INSERT, UPDATE, DELETE ON public\.reasoning_run_proposals FROM anon/);
  });
});

describe("0092_reasoning_runs.sql - reserve", () => {
  test("serializes per user and is idempotent on the command key", () => {
    expect(sql).toMatch(/pg_advisory_xact_lock\(hashtext\('reasoning_run:' \|\| p_user_id::text\)\)/);
    expect(sql).toMatch(/WHERE user_id = p_user_id AND idempotency_key = p_key/);
    expect(sql).toMatch(/'existing', true/);
  });

  test("one active run per user, every tier", () => {
    expect(sql).toMatch(/RAISE EXCEPTION 'reasoning_run_active'/);
  });

  test("cap arms come from the effective tier and match tier-map", () => {
    expect(sql).toMatch(/public\.effective_subscription_tier\(p_user_id\)/);
    expect(REASONING_PER_WEEK.brain).toBeNull();
    expect(sql).toMatch(/WHEN 'brain'\s+THEN NULL/);
    expect(sql).toMatch(new RegExp(`WHEN 'cortex'\\s+THEN ${REASONING_PER_WEEK.cortex}\\b`));
    expect(sql).toMatch(new RegExp(`WHEN 'soma'\\s+THEN ${REASONING_PER_WEEK.soma}\\b`));
    expect(sql).toMatch(new RegExp(`ELSE ${REASONING_PER_WEEK.free}\\b`));
  });

  test("buckets are server-derived KST and stamped on the run row", () => {
    expect(sql).toMatch(/now\(\) AT TIME ZONE 'Asia\/Seoul'/);
    expect(sql).toMatch(/to_char\(v_kst, 'IYYY-"W"IW'\)/);
    expect(sql).toMatch(/to_char\(v_kst, 'YYYY-MM'\)/);
    expect(sql).toMatch(/week_bucket, month_bucket, item_count\)/);
  });

  test("AUTO spends weekly base only and always leaves one manual run", () => {
    // The guard used < cap - 1 IS the confirmed auto ceiling (free 1 / plus 6)
    // and the manual reservation in one expression.
    expect(sql).toMatch(/WHERE uc\.reasoning_used < v_cap - 1/);
    expect(sql).toMatch(/RAISE EXCEPTION 'reasoning_auto_unavailable'/);
    // The auto branch must never touch the monthly reward ledger: the only
    // reward_consumed increment lives in the manual step-2 credit consume.
    const autoBranch = sql.slice(sql.indexOf("p_trigger = 'auto'"), sql.indexOf("-- MANUAL, step 1"));
    expect(autoBranch).not.toMatch(/reward_consumed/);
  });

  test("MANUAL keeps the 0089 order: base first, then one monthly credit", () => {
    expect(sql).toMatch(/WHERE uc\.reasoning_used < v_cap\b/);
    expect(sql).toMatch(/AND reward_credits > reward_consumed/);
    expect(sql).toMatch(/RAISE EXCEPTION 'reasoning_limit_exceeded'/);
  });
});

describe("0092_reasoning_runs.sql - refund side", () => {
  test("refund reverses the exact spend kind against the STAMPED buckets", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.refund_reasoning_spend/);
    expect(sql).toMatch(/GREATEST\(reasoning_used - 1, 0\)/);
    expect(sql).toMatch(/GREATEST\(reward_consumed - 1, 0\)/);
    expect(sql).toMatch(/v_run\.spend, v_run\.week_bucket, v_run\.month_bucket/);
  });

  test("fail/cancel/recover refund exactly-once via guarded state transitions", () => {
    expect(sql).toMatch(/SET status = 'failed'[\s\S]*?status IN \('reserved', 'running'\)/);
    expect(sql).toMatch(/SET status = 'cancelled'[\s\S]*?status IN \('reserved', 'running'\)/);
    expect(sql).toMatch(/SET status = 'recovered', error_code = 'stale'/);
  });

  test("the refund helper is not callable by clients", () => {
    expect(sql).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.refund_reasoning_spend\(uuid, text, text, text\) FROM authenticated/,
    );
  });
});

describe("0092_reasoning_runs.sql - proposals lifecycle", () => {
  test("complete persists proposals and closes the run in one transaction", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.complete_reasoning_run/);
    expect(sql).toMatch(/jsonb_array_elements\(p_proposals\) WITH ORDINALITY/);
    expect(sql).toMatch(/UPDATE public\.reasoning_runs SET status = 'proposed' WHERE id = p_run_id/);
  });

  test("ratify/dismiss transition only 'proposed' rows; apply only 'ratified'", () => {
    expect(sql).toMatch(/SET status = 'ratified'\s+WHERE run_id = p_run_id AND status = 'proposed'/);
    expect(sql).toMatch(/SET status = 'dismissed'\s+WHERE run_id = p_run_id AND status = 'proposed'/);
    expect(sql).toMatch(/SET status = 'applied'[\s\S]*?p\.status = 'ratified'/);
  });
});

describe("0092_reasoning_runs.sql - function hygiene and grants", () => {
  const rpcSignatures = [
    "reserve_reasoning_run(uuid, text, text, int)",
    "start_reasoning_run(uuid, uuid)",
    "complete_reasoning_run(uuid, uuid, jsonb)",
    "fail_reasoning_run(uuid, uuid, text)",
    "cancel_reasoning_run(uuid, uuid)",
    "recover_stale_reasoning_runs(uuid, int)",
    "ratify_reasoning_proposals(uuid, uuid, int[], int[])",
    "mark_reasoning_proposal_applied(uuid, uuid, int)",
  ];

  test("every RPC is SECURITY DEFINER with a locked search_path and owner guard", () => {
    const definerCount = (sql.match(/^SECURITY DEFINER$/gm) ?? []).length;
    const searchPathCount = (sql.match(/^SET search_path = ''$/gm) ?? []).length;
    const ownerGuardCount = (sql.match(/auth\.uid\(\) != p_user_id/g) ?? []).length;
    expect(definerCount).toBe(9); // 8 RPCs + the private refund helper
    expect(searchPathCount).toBe(9);
    expect(ownerGuardCount).toBe(8); // all but the private helper
  });

  test.each(rpcSignatures)("%s: REVOKE PUBLIC + anon, GRANT authenticated", (signature) => {
    const escaped = signature.replace(/[()[\]]/g, (ch) => `\\${ch}`);
    expect(sql).toMatch(new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.${escaped} FROM PUBLIC`));
    expect(sql).toMatch(new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.${escaped} FROM anon`));
    expect(sql).toMatch(new RegExp(`GRANT {2}EXECUTE ON FUNCTION public\\.${escaped} TO authenticated`));
  });

  test("every RPC name the client lib calls exists in the migration", () => {
    const called = [...lib.matchAll(/\.rpc\("([a-z_]+)"/g)].map((match) => match[1]);
    expect(called.length).toBeGreaterThanOrEqual(8);
    for (const name of called) {
      expect(sql).toMatch(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\(`));
    }
  });

  test("the client lib reads only the two 0092 tables the RLS opens", () => {
    const fromCalls = [...lib.matchAll(/\.from\("([a-z_]+)"\)/g)].map((match) => match[1]);
    expect(new Set(fromCalls)).toEqual(new Set(["reasoning_runs", "reasoning_run_proposals"]));
  });
});
