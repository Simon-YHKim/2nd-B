\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() !~ '^dashboard_test[a-z0-9_]*$' OR current_user <> 'dashboard_local'
    OR to_regnamespace('auth') IS NOT NULL OR EXISTS(SELECT 1 FROM pg_tables WHERE schemaname='public') THEN
    RAISE EXCEPTION 'Requires a fresh local dashboard test database';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
END $$;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY, email_confirmed_at timestamptz DEFAULT now(), deleted_at timestamptz);
CREATE TABLE public.users(id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  account_status text DEFAULT 'active',minor_tier text DEFAULT 'adult',birth_date date DEFAULT '1990-01-01',
  test_consent boolean DEFAULT true,test_token text DEFAULT repeat('a',64),privacy_prefs jsonb DEFAULT '{"recommendations":true}');
CREATE TABLE public.account_deletion_tombstones(user_id uuid PRIMARY KEY);
CREATE TABLE public.ops_routines(id uuid PRIMARY KEY,user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  title text,active boolean DEFAULT true,created_at timestamptz DEFAULT now(),recurrence text DEFAULT 'daily',weekday smallint);
CREATE TABLE public.ops_routine_logs(routine_id uuid REFERENCES public.ops_routines(id) ON DELETE CASCADE,user_id uuid,
  completed_on date);
CREATE TABLE public.erasure_registry(table_name text,owner_column text,class text,reason text,delete_order integer);
CREATE FUNCTION public.effective_llm_consent_snapshot_v2(p_user_id uuid,p_allow_legacy boolean DEFAULT false) RETURNS jsonb
LANGUAGE sql AS $$ SELECT jsonb_build_object('allowed',test_consent,'token',CASE WHEN test_consent THEN test_token END) FROM public.users WHERE id=p_user_id $$;
\ir ../migrations/0236_dashboard_generation.sql
\ir ../migrations/0238_dashboard_terminal_states.sql
COMMIT;
\ir dashboard_generation_regression.sql
