-- 0048_ops_routines.sql
-- Phase A ops management layer (O-R3 P3). Turns an already-gated /ops
-- recommendation (migration-less, device-only until now) into a MANAGED routine:
-- a persisted row the user can be reminded about and tick off each day.
--
-- Two tables, both owner-only RLS (auth.uid() = user_id), mirroring the
-- sources / wiki_pages owner_all policies in 0022:
--   1. ops_routines       — the saved routine (cadence + reminder time/weekday)
--   2. ops_routine_logs   — one row per (routine, calendar day) completion,
--                           UNIQUE so "I did it today" is idempotent.
--
-- No Gemini call lives here: a routine is the SAVE of a recommendation the LLM
-- already produced through the C1/C9/C3 gateway. Additive + idempotent
-- (create table if not exists, guarded create policy) so re-running is safe.

----------------------------------------------------------------------
-- ops_routines: a saved, managed routine
----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ops_routines (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  domain_id        text NOT NULL,                                            -- one of OPS_DOMAIN_IDS (src/lib/ops/domains.ts)
  title            text NOT NULL,
  reason           text,
  recurrence       text NOT NULL DEFAULT 'none'
    CHECK (recurrence IN ('daily', 'weekly', 'none')),
  reminder_time    text,                                                     -- HH:MM local wall-clock, nullable
  weekday          smallint,                                                 -- 0=Sun..6=Sat, only for weekly
  duration_minutes int,
  checklist        jsonb NOT NULL DEFAULT '[]'::jsonb,
  active           boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ops_routines_weekday_range
    CHECK (weekday IS NULL OR weekday BETWEEN 0 AND 6)
);

CREATE INDEX IF NOT EXISTS ops_routines_user_active_idx
  ON ops_routines (user_id, active);

----------------------------------------------------------------------
-- ops_routine_logs: per-day completion ledger (idempotent)
----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ops_routine_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  routine_id    uuid NOT NULL REFERENCES ops_routines(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  completed_on  date NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ops_routine_logs_once_per_day UNIQUE (routine_id, completed_on)
);

CREATE INDEX IF NOT EXISTS ops_routine_logs_user_idx
  ON ops_routine_logs (user_id, completed_on DESC);

----------------------------------------------------------------------
-- Row-Level Security (owner-only, mirrors sources_owner_all in 0022)
----------------------------------------------------------------------

ALTER TABLE ops_routines      ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_routine_logs  ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    DROP POLICY IF EXISTS ops_routines_owner_all ON ops_routines;
    CREATE POLICY ops_routines_owner_all ON ops_routines
      FOR ALL TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());

    DROP POLICY IF EXISTS ops_routine_logs_owner_all ON ops_routine_logs;
    CREATE POLICY ops_routine_logs_owner_all ON ops_routine_logs
      FOR ALL TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;
