-- Explicitly limited local fixture, never a managed Auth/Storage substitute.
-- The CI lane uses the full current schema instead. Both execute actual 0192
-- entrypoints and the actual accepted-only receipt draft, not function mocks.
DO $$ BEGIN
  IF current_database() !~ '^t04_arbitration_test_[a-z0-9_]+$' THEN
    RAISE EXCEPTION 'disposable arbitration database required';
  END IF;
END $$;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, deleted_at timestamptz);
CREATE TABLE auth.sessions(id uuid PRIMARY KEY, user_id uuid REFERENCES auth.users ON DELETE CASCADE);
CREATE TABLE public.users(id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  email text, birth_date date, locale text);
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
END $$;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
\ir ../../migrations/0192_account_deletion_completion_fence.sql
