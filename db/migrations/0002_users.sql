-- 0002_users.sql
-- C6: judge_mode column. C10: birth_date >= 18 CHECK constraint.
-- This table mirrors auth.users; we sync via a trigger on auth.users insert.

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
