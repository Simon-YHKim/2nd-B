-- 0084_initplan_optimize_child_ledger_policies.sql
-- Wave-3 perf (get_advisors auth_rls_initplan): the 0080 policies call auth.uid()
-- bare, so Postgres re-evaluates it per row. Wrapping it in (select auth.uid())
-- makes it an initplan (evaluated once per query). Behavior is identical
-- (auth.uid() is stable within a statement); this only removes the per-row cost,
-- mirroring the 0061 initplan optimization. Only the 2 policies 0080 added are
-- fixed here; the other pre-existing flagged policies are a separate broader pass.

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    DROP POLICY IF EXISTS ops_routine_logs_owner_all ON public.ops_routine_logs;
    CREATE POLICY ops_routine_logs_owner_all ON public.ops_routine_logs
      FOR ALL TO authenticated
      USING (user_id = (select auth.uid()))
      WITH CHECK (
        user_id = (select auth.uid())
        AND EXISTS (
          SELECT 1 FROM public.ops_routines r
          WHERE r.id = routine_id AND r.user_id = (select auth.uid())
        )
        AND (
          source_sample_id IS NULL
          OR EXISTS (
            SELECT 1 FROM public.health_samples s
            WHERE s.id = source_sample_id AND s.user_id = (select auth.uid())
          )
        )
      );

    DROP POLICY IF EXISTS srs_reviews_owner_all ON public.srs_reviews;
    CREATE POLICY srs_reviews_owner_all ON public.srs_reviews
      FOR ALL TO authenticated
      USING (user_id = (select auth.uid()))
      WITH CHECK (
        user_id = (select auth.uid())
        AND EXISTS (
          SELECT 1 FROM public.srs_cards c
          WHERE c.id = card_id AND c.user_id = (select auth.uid())
        )
      );
  END IF;
END $$;
