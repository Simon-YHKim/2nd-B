\set ON_ERROR_STOP on
DO $$ BEGIN
  IF current_database() !~ '^t53_support_test_[a-z0-9_]+$' THEN
    RAISE EXCEPTION 'disposable T53 database required';
  END IF;
END $$;
CREATE SCHEMA auth;
CREATE SCHEMA cron;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
END $$;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
$$;
CREATE TABLE public.users(id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, birth_year int);
CREATE TABLE public.account_deletion_tombstones(user_id uuid PRIMARY KEY);
CREATE TABLE public.erasure_registry(table_name text PRIMARY KEY,owner_column text,class text,delete_order int,cascades_from text,reason text);
CREATE TABLE cron.job(jobname text, schedule text, command text);
CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE sql AS $$
  INSERT INTO cron.job VALUES($1,$2,$3) RETURNING 1::bigint;
$$;
\ir ../UNNUMBERED_support_reports.sql
