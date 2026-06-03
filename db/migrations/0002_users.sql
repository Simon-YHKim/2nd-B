-- 0002_users.sql
-- C6: judge_mode column. C10: birth_date >= 18 CHECK constraint.
--
-- This profile row is NOT synced by a trigger (there is no handle_new_user /
-- on_auth_user_created in any migration) and `id` is a bare PK, NOT a FK to
-- auth.users. It is created client-side: signUpWithEmail / ensureUserProfile in
-- src/lib/supabase/auth.ts insert it after the auth session exists. Two
-- implications callers must know:
--   1. If the profile INSERT fails (age-gate trigger, network), the auth.users
--      account exists with no profile row -> signUpWithEmail signs that session
--      back out to avoid an orphaned/half-provisioned account.
--   2. Because deleting auth.users does not cascade here, terminal erasure
--      deletes THIS row first (cascading every user_id-owned table) and then
--      the auth row -- see supabase/functions/delete-account.

CREATE TABLE IF NOT EXISTS users (
  id           uuid PRIMARY KEY,
  email        citext UNIQUE NOT NULL,
  birth_date   date NOT NULL,
  judge_mode   boolean NOT NULL DEFAULT false,                              -- C6
  locale       text NOT NULL DEFAULT 'en' CHECK (locale IN ('en', 'ko')),
  consent_share_with_judges boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_birth_date_min_age
    CHECK (birth_date <= (current_date - interval '18 years'))              -- C10
);

CREATE INDEX IF NOT EXISTS users_email_idx ON users (email);
