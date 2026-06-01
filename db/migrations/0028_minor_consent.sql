-- 0028_minor_consent.sql
-- C10 (REDEFINED): age-tiered registration with verifiable guardian consent.
-- Replaces the flat `birth_date >= 18` CHECK from 0002. Adults (>=18) and
-- self-consent minors (14-17, per Korea PIPA Article 22-2) register directly;
-- under-14 require verifiable guardian consent (PIPA Article 22-2 / COPPA) and
-- start in account_status='pending_guardian_consent' until a guardian verifies.
--
-- BEHAVIORALLY INERT in this PR: the client (auth.ts) still throws AgeGateError
-- for < 18, so no minor can register yet. This migration only opens the schema
-- and lowers the DB floor; the client age-tier branching lands in a later PR.

-- 1. Relax the flat 18+ CHECK -> sanity range only. C10's age floor moves to the
--    app/consent layer (minor_tier + account_status + guardian_consents), not a
--    hard birth_date gate.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_birth_date_min_age;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_birth_date_sane') THEN
    ALTER TABLE users ADD CONSTRAINT users_birth_date_sane
      CHECK (birth_date > DATE '1900-01-01' AND birth_date <= current_date);    -- C10
  END IF;
END $$;

-- 2. Account status + minor tier. Set by the app at signup; default 'active'
--    keeps every existing adult row valid (inert backfill).
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status text NOT NULL DEFAULT 'active'
  CHECK (account_status IN ('active', 'pending_guardian_consent'));             -- C10
ALTER TABLE users ADD COLUMN IF NOT EXISTS minor_tier text
  CHECK (minor_tier IS NULL OR minor_tier IN ('adult', 'minor_self', 'minor_guardian'));

-- 3. Guardian consent ledger -- the verifiable parental consent record required
--    for under-14 (PIPA Article 22-2 / COPPA). verified_at NOT NULL means the
--    guardian approved; revoked_at supports the guardian's right to withdraw.
CREATE TABLE IF NOT EXISTS guardian_consents (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  guardian_email          citext NOT NULL,
  guardian_name           text,
  consent_method          text NOT NULL DEFAULT 'email'
                            CHECK (consent_method IN ('email', 'stronger')),
  consent_scope           text NOT NULL DEFAULT 'full',
  verification_token_hash text,
  requested_at            timestamptz NOT NULL DEFAULT now(),
  verified_at             timestamptz,
  revoked_at              timestamptz
);

CREATE INDEX IF NOT EXISTS guardian_consents_child_idx
  ON guardian_consents (child_user_id);

-- Per-user RLS (mirrors the 0017 idempotent idiom). A child sees/creates only
-- their own consent rows; the guardian-side verification path runs through a
-- privileged server route (service_role) added in a later PR.
ALTER TABLE guardian_consents ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    DROP POLICY IF EXISTS guardian_consents_select_own ON guardian_consents;
    DROP POLICY IF EXISTS guardian_consents_insert_own ON guardian_consents;

    CREATE POLICY guardian_consents_select_own ON guardian_consents
      FOR SELECT TO authenticated
      USING (child_user_id = auth.uid());

    CREATE POLICY guardian_consents_insert_own ON guardian_consents
      FOR INSERT TO authenticated
      WITH CHECK (child_user_id = auth.uid());
  END IF;
END $$;
