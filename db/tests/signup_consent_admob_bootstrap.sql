-- Run ONLY through scripts/test-signup-consent-sql.mjs against a fresh local DB.
-- Minimal Supabase compatibility schema; all signup routines and trigger wiring
-- are loaded from the real migrations, never replaced by successful stubs.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout = '20s';
DO $empty$
BEGIN
  IF current_database() !~ '^signup_test[a-z0-9_]*$'
    OR current_user !~ '^signup_[a-z0-9_]+$'
    OR to_regnamespace('auth') IS NOT NULL
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f')) THEN
    RAISE EXCEPTION 'signup fixture requires an empty disposable signup_test database';
  END IF;
END
$empty$;
DO $roles$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
END
$roles$;
-- Model Supabase's permissive function defaults so missing revokes fail the ACL test.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon,authenticated,service_role;
CREATE SCHEMA auth;
CREATE TABLE auth.users (
  id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  email_confirmed_at timestamptz, deleted_at timestamptz
);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('test.user_id',true),'')::uuid
$$;
CREATE TABLE public.users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, email text UNIQUE,
  birth_date date, judge_mode boolean DEFAULT false, locale text,
  display_name text, account_status text DEFAULT 'active', minor_tier text DEFAULT 'adult'
);
\ir ../migrations/0031_consent_records.sql
\ir ../migrations/0130_safety_notice_ack.sql
\ir ../migrations/0148_verified_email_signup_consent_ledger.sql
-- @LOAD_VERIFIED_EMAIL_TRIGGER@
\ir ../migrations/0149_atomic_complete_profile_signup_consent.sql
\ir ../migrations/0150_signup_consent_contract_20260902.sql
DO $before_draft$
BEGIN
  IF EXISTS(SELECT 1 FROM public.signup_consent_contract('email-v4')) THEN
    RAISE EXCEPTION 'fixture already accepts email-v4 before forward migration';
  END IF;
END
$before_draft$;
\ir ../migration-drafts/UNNUMBERED_signup_consent_admob_20260925.sql
COMMIT;

\ir signup_consent_admob_regression.sql

-- The behavior fixture rolls back its users and intentional resolver mutation.
DO $after_regression$
BEGIN
  IF EXISTS(SELECT 1 FROM auth.users) OR EXISTS(SELECT 1 FROM public.consent_records)
    OR NOT EXISTS(SELECT 1 FROM public.signup_consent_contract_status()
      WHERE signup_revision='email-v4' AND policy_version='2026-09-26'
        AND confirmation_eligible AND confirmation_ready) THEN
    RAISE EXCEPTION 'signup regression did not restore the migrated contract';
  END IF;
END
$after_regression$;
SELECT 'PASS: actual signup migrations, old/new confirmation tuples, required acknowledgement, retry, public metadata, private ACLs and rollback' AS result;
