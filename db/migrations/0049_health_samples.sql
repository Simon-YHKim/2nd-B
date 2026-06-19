-- 0049_health_samples.sql
-- Phase B Slice 1: the health/activity ingest store that feeds routine
-- auto-completion. A logged workout (or a steps total over goal) is recorded
-- here as a row, and the deterministic mapping in src/lib/ops/health-link.ts
-- ticks off the matching routine — no Gemini call lives anywhere in this path.
--
-- Privacy posture: health/activity samples are PIPA 민감정보 (sensitive data).
-- The table is owner-only RLS (auth.uid() = user_id), mirroring the
-- ops_routines_owner_all policy in 0048 / sources_owner_all in 0022. The
-- app-level consent gate (health_import pref, OFF for everyone by default and
-- hard-locked OFF for 14-17 minors) lives in src/lib/health/ingest.ts; this
-- migration only sets the owner-only storage boundary.
--
-- Additive + idempotent (create table if not exists, guarded create policy,
-- add column if not exists) so re-running is safe.

----------------------------------------------------------------------
-- health_samples: one row per imported activity/health sample
----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS health_samples (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source          text NOT NULL
    CHECK (source IN ('manual', 'mock', 'healthkit', 'health_connect', 'strava')),
  metric_type     text NOT NULL
    CHECK (metric_type IN ('steps', 'workout', 'sleep', 'heart_rate')),
  value           numeric NOT NULL,
  unit            text NOT NULL,
  started_at      timestamptz NOT NULL,
  ended_at        timestamptz,
  external_id     text,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz DEFAULT now(),
  -- Idempotent re-import: the same sample from the same source on the same
  -- start carries the same external_id and upserts onto one row.
  CONSTRAINT health_samples_dedupe
    UNIQUE (user_id, source, metric_type, started_at, external_id)
);

CREATE INDEX IF NOT EXISTS health_samples_user_metric_idx
  ON health_samples (user_id, metric_type, started_at DESC);

----------------------------------------------------------------------
-- ops_routine_logs.source_sample_id: which sample auto-completed this log.
-- NULL = a manual tick (the existing default path); a non-null value points at
-- the health_samples row that satisfied the routine. ON DELETE SET NULL keeps
-- the completion if the sample is later removed. The existing
-- UNIQUE(routine_id, completed_on) is untouched, so auto + manual completion
-- for the same day still collapse to one idempotent row.
----------------------------------------------------------------------

ALTER TABLE ops_routine_logs
  ADD COLUMN IF NOT EXISTS source_sample_id uuid
  REFERENCES health_samples(id) ON DELETE SET NULL;

----------------------------------------------------------------------
-- Row-Level Security (owner-only, mirrors ops_routines_owner_all in 0048)
----------------------------------------------------------------------

ALTER TABLE health_samples ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    DROP POLICY IF EXISTS health_samples_owner_all ON health_samples;
    CREATE POLICY health_samples_owner_all ON health_samples
      FOR ALL TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;
