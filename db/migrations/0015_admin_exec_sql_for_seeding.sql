-- 0015_admin_exec_sql_for_seeding.sql
-- SECURITY DEFINER helper for the seed-knowledge-base Edge Function (deployed
-- to Supabase outside this migration set). Lets the function run arbitrary
-- INSERTs from the curated supabase/seed/*.sql files via a single RPC.
-- Strictly service-role only (Supabase environments); on vanilla Postgres
-- (the supabase-dry-run CI job) those roles don't exist, so the grants are
-- conditional.

CREATE OR REPLACE FUNCTION public.admin_exec_sql(sql_text text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  EXECUTE sql_text;
  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM, 'state', SQLSTATE);
END;
$$;

-- Always revoke from PUBLIC. Supabase-specific roles are conditional so the
-- vanilla-postgres CI dry-run doesn't fail.
REVOKE EXECUTE ON FUNCTION public.admin_exec_sql(text) FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.admin_exec_sql(text) FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.admin_exec_sql(text) FROM authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.admin_exec_sql(text) TO service_role';
  END IF;
END $$;

COMMENT ON FUNCTION public.admin_exec_sql(text) IS
  'Service-role-only seeding helper. Called by the seed-knowledge-base Edge Function. Never expose to client roles.';
