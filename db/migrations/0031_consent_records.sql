-- 0031_consent_records.sql
-- C10 (PR-5 / task B): immutable consent ledger. One row per consent event
-- (sign-up, re-consent on a policy-version bump, age-out re-consent). Records
-- WHAT the user agreed to and under which document versions, for PIPA
-- accountability — general consent (Articles 15/17/22) + §23 sensitive-data
-- acknowledgement + overseas-transfer notice (Gemini/Supabase processing).
--
-- Append-only by design: select/insert policies only, NO update/delete, so a
-- recorded consent can't be altered after the fact.
--
-- NOT YET WIRED at sign-up: the consent NOTICE + ack checkboxes are a UI surface
-- (delegated to the design pass). recordConsent() writes here only after the UI
-- collects the acks — we never record a consent the user didn't give.

CREATE TABLE IF NOT EXISTS consent_records (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  age_band               text NOT NULL CHECK (age_band IN ('minor_self', 'adult')),
  minor_tier             text CHECK (minor_tier IS NULL OR minor_tier IN ('adult', 'minor_self', 'minor_guardian')),
  consent_version        text NOT NULL,
  policy_version         text NOT NULL,
  terms_version          text NOT NULL,
  purposes               jsonb NOT NULL DEFAULT '[]'::jsonb,   -- agreed processing purposes
  required_ack           boolean NOT NULL DEFAULT false,        -- required (service) consent given
  optional_consents      jsonb NOT NULL DEFAULT '{}'::jsonb,    -- optional per-purpose toggles
  llm_processing_ack     boolean NOT NULL DEFAULT false,        -- Gemini/LLM processing acknowledged
  overseas_transfer_ack  boolean NOT NULL DEFAULT false,        -- 국외이전 (overseas transfer) acknowledged
  sensitive_data_ack     boolean NOT NULL DEFAULT false,        -- PIPA §23 sensitive-data acknowledged
  locale                 text NOT NULL,
  ip_hash                text,                                  -- hashed, never the raw IP (data minimization)
  ua_hash                text,                                  -- hashed user-agent
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS consent_records_user_idx ON consent_records (user_id, created_at DESC);

ALTER TABLE consent_records ENABLE ROW LEVEL SECURITY;

-- Per-user RLS (mirrors the 0017 idempotent idiom). A user reads and appends
-- only their own consent rows. No UPDATE/DELETE policies -> the ledger is
-- immutable from the client; service_role (server) bypasses RLS for admin.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    DROP POLICY IF EXISTS consent_records_select_own ON consent_records;
    DROP POLICY IF EXISTS consent_records_insert_own ON consent_records;

    CREATE POLICY consent_records_select_own ON consent_records
      FOR SELECT TO authenticated
      USING (user_id = auth.uid());

    CREATE POLICY consent_records_insert_own ON consent_records
      FOR INSERT TO authenticated
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;
