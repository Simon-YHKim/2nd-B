-- 0078_usage_counters_lock_writes.sql
-- Lock usage_counters writes to the server-owned RPCs (D1 Stage 3, audit S1/M4).
--
-- usage_counters previously granted authenticated a full row-level UPDATE (and
-- INSERT) with no column lock, so any user could `update usage_counters set
-- reasoning_used = 0` or `set reward_credits = 999999` (directly with the public
-- anon key) and self-grant unlimited paid reasoning. After D1 s1/s2 the client
-- writes these counters ONLY through the atomic SECURITY DEFINER RPCs
-- (bump_reasoning_usage_if_under_cap, bump_reward_credits_if_under_cap), which run
-- as the table owner and bypass this restriction. So we now REVOKE direct
-- INSERT/UPDATE from authenticated and drop the write RLS policies. SELECT stays
-- open (the UI reads remaining usage); service_role is untouched (admin ops).
--
-- (Column-level REVOKE alone is insufficient in Postgres: a table-level UPDATE
-- grant covers every column regardless of column-level revokes, so we revoke the
-- table-level privilege outright now that nothing client-side writes directly.)
--
-- DEPLOY ORDER (IMPORTANT): apply this only AFTER the RPC-using client (this
-- branch) is deployed. A stale pre-RPC client's direct upsert will 403 once this
-- lands - usage.ts fails gracefully (warn, no throw), so it degrades rather than
-- breaks, but deploy the client first to avoid dropped increments in that window.

DROP POLICY IF EXISTS usage_counters_owner_insert ON public.usage_counters;
DROP POLICY IF EXISTS usage_counters_owner_update ON public.usage_counters;

REVOKE INSERT, UPDATE ON public.usage_counters FROM authenticated;
-- anon should never have had write access; revoke defensively (no-op if absent).
REVOKE INSERT, UPDATE ON public.usage_counters FROM anon;

-- Reads stay open for the remaining-usage UI (usage_counters_owner_select + the
-- existing SELECT grant remain). DELETE is already denied (no DELETE RLS policy).
