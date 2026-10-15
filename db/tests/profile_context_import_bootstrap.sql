-- Explicit disposable localhost database only; never run this on a live schema.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() !~ '^profile_import_test[a-z0-9_]*$' OR current_user !~ '^profile_import_[a-z0-9_]+$'
    OR to_regnamespace('auth') IS NOT NULL OR EXISTS(SELECT 1 FROM pg_tables WHERE schemaname='public') THEN
    RAISE EXCEPTION 'profile import fixture requires an empty disposable database'; END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role BYPASSRLS; END IF;
END $$;
ALTER ROLE service_role BYPASSRLS;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon,authenticated,service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz,deleted_at timestamptz);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
GRANT USAGE ON SCHEMA auth TO authenticated,anon;
CREATE TABLE public.users(id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,email text,
  birth_date date,minor_tier text,account_status text,profile_details jsonb NOT NULL DEFAULT '{}');
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_self ON public.users FOR ALL TO authenticated USING(id=auth.uid()) WITH CHECK(id=auth.uid());
REVOKE ALL ON public.users FROM anon,authenticated;
GRANT SELECT ON public.users TO authenticated;
GRANT UPDATE(profile_details) ON public.users TO authenticated;
CREATE TABLE public.account_deletion_tombstones(user_id uuid PRIMARY KEY,session_id uuid NOT NULL);
CREATE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at:=now(); RETURN NEW; END $$;
\ir ../migrations/0030_server_age_gate.sql
\ir ../migrations/0022_wiki_rag.sql
\ir ../migrations/0044_ingest.sql
\ir ../migrations/0239_profile_context_import.sql
COMMIT;
\ir profile_context_import_regression.sql
\ir profile_context_import_integrity.sql
\ir profile_context_import_export.sql
