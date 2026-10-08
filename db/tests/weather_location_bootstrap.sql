-- Only scripts/test-weather-sql.mjs, on a new disposable local database.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() !~ '^weather_test[a-z0-9_]*$' OR current_user !~ '^weather_[a-z0-9_]+$'
     OR to_regnamespace('auth') IS NOT NULL
     OR EXISTS(SELECT 1 FROM pg_tables WHERE schemaname='public') THEN
    RAISE EXCEPTION 'weather fixture requires a fresh disposable database';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
END $$;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon,authenticated,service_role;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, email_confirmed_at timestamptz, deleted_at timestamptz);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
GRANT USAGE ON SCHEMA auth TO authenticated;
CREATE TABLE public.users(id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, email text,
  birth_date date, minor_tier text, account_status text, privacy_prefs jsonb DEFAULT '{}');
CREATE TABLE public.account_deletion_tombstones(user_id uuid PRIMARY KEY, session_id uuid NOT NULL);
-- Replay actual age functions and their trigger wiring, not successful mocks.
\ir ../migrations/0030_server_age_gate.sql
\ir ../migrations/0033_minor_privacy_enforcement.sql
\ir ../migrations/0050_health_consent_default.sql
\ir ../migrations/0072_records_embedding_minor_clamp.sql
\ir ../migrations/0232_weather_location_consent.sql
\ir ../migrations/0234_weather_device_only.sql
COMMIT;
\ir weather_location_regression.sql
