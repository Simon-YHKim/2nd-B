-- 0080_child_ledger_parent_ownership.sql
-- Wave-3 audit (data-integrity): child ledger tables enforced RLS on their OWN
-- user_id but never checked that the referenced PARENT row is owned by the same
-- user. Because a FK check runs as the table owner (bypassing the parent's
-- owner-only RLS), an authenticated user who knew another user's parent id could
-- INSERT a child row referencing it (row user_id = self passed WITH CHECK). For
-- ops_routine_logs that also let the attacker's row win the GLOBAL
-- UNIQUE(routine_id, completed_on), blocking the victim's own completion for that
-- day (cross-tenant DoS) and corrupting per-routine aggregates.
--
-- Fix: add a parent-ownership EXISTS to each child WITH CHECK. The subquery runs
-- under the parent table's RLS (authenticated sees only its own rows) AND
-- explicitly filters user_id = auth.uid(), so a foreign parent id fails the check
-- and the insert is rejected. Once every log's routine_id/card_id is provably
-- owned by the logger, no two users can share a parent id, so the existing global
-- UNIQUE can no longer collide across users -- no constraint/ON CONFLICT change
-- needed (idempotent upserts keep working).

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    -- ops_routine_logs: routine_id -> ops_routines, source_sample_id -> health_samples
    DROP POLICY IF EXISTS ops_routine_logs_owner_all ON public.ops_routine_logs;
    CREATE POLICY ops_routine_logs_owner_all ON public.ops_routine_logs
      FOR ALL TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (
        user_id = auth.uid()
        AND EXISTS (
          SELECT 1 FROM public.ops_routines r
          WHERE r.id = routine_id AND r.user_id = auth.uid()
        )
        AND (
          source_sample_id IS NULL
          OR EXISTS (
            SELECT 1 FROM public.health_samples s
            WHERE s.id = source_sample_id AND s.user_id = auth.uid()
          )
        )
      );

    -- srs_reviews: card_id -> srs_cards
    DROP POLICY IF EXISTS srs_reviews_owner_all ON public.srs_reviews;
    CREATE POLICY srs_reviews_owner_all ON public.srs_reviews
      FOR ALL TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (
        user_id = auth.uid()
        AND EXISTS (
          SELECT 1 FROM public.srs_cards c
          WHERE c.id = card_id AND c.user_id = auth.uid()
        )
      );
  END IF;
END $$;
