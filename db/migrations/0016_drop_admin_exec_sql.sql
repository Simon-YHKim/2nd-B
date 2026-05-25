-- 0016_drop_admin_exec_sql.sql
-- Drop the SECURITY DEFINER seeding helper. Seeding is complete (94 rows in
-- knowledge_sources via the supabase/seed/*.sql bundle); the function is no
-- longer needed and leaves arbitrary-SQL-as-service-role available. Per CSO
-- 2nd audit (CRITICAL 9/10): the function had no input validation, so any
-- principal with the service_role JWT could pass any SQL string and have it
-- run with definer rights. Re-seeding (if ever needed) goes through a fresh
-- migration in the supabase/migrations/ pipeline, not a runtime RPC.

DROP FUNCTION IF EXISTS public.admin_exec_sql(text);
