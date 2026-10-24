-- 0270 read-view rollback. Run the whole file in one transaction.
-- Keep every hold bit, original row, monotonic trigger and cleared vector.
-- No automatic unhold or vector restoration. Existing 0225/0263 stays active.
-- Missing AI views must fail closed in future readers; never fall back to tables.
-- This is not a pre-0270 catalog restore. Full retirement needs separate review.
-- Reapply 0270_crisis_ai_hold.sql to restore the views. Keep the ledger row.
SET LOCAL lock_timeout = '10s';
DO $rollback0270$
BEGIN
  DROP VIEW IF EXISTS public.wiki_pages_ai_eligible;
  DROP VIEW IF EXISTS public.sources_ai_eligible;
  DROP VIEW IF EXISTS public.records_ai_eligible;
END;
$rollback0270$;
