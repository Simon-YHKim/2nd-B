-- 0061_rls_initplan_optimize.sql
-- Perf (Supabase advisor `auth_rls_initplan`): the owner-only RLS policies on
-- the constellation profiling tables call auth.uid() bare, so Postgres
-- re-evaluates it ONCE PER ROW. Wrapping it as `(select auth.uid())` lets the
-- planner hoist it to a one-time initplan (evaluated once per query) — IDENTICAL
-- access semantics (owner = the signed-in user), just faster as these tables
-- fill. This is Supabase's documented pattern.
--
-- Scope = the three tables from this feature line:
--   star_tier_history (0045), relation_people (0058), recreation_items (0059).
-- The same optimization for the other ~40 advisor-flagged tables is a separate
-- repo-wide pass. Idempotent: DROP POLICY IF EXISTS + CREATE, role-guarded so a
-- vanilla-Postgres CI run (no `authenticated` role) is a no-op like 0058/0059.

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    DROP POLICY IF EXISTS star_tier_history_owner_all ON star_tier_history;
    CREATE POLICY star_tier_history_owner_all ON star_tier_history
      FOR ALL TO authenticated
      USING (user_id = (select auth.uid()))
      WITH CHECK (user_id = (select auth.uid()));

    DROP POLICY IF EXISTS relation_people_owner_all ON relation_people;
    CREATE POLICY relation_people_owner_all ON relation_people
      FOR ALL TO authenticated
      USING (user_id = (select auth.uid()))
      WITH CHECK (user_id = (select auth.uid()));

    DROP POLICY IF EXISTS recreation_items_owner_all ON recreation_items;
    CREATE POLICY recreation_items_owner_all ON recreation_items
      FOR ALL TO authenticated
      USING (user_id = (select auth.uid()))
      WITH CHECK (user_id = (select auth.uid()));
  END IF;
END $$;
