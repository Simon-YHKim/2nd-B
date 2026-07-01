-- 0062_consent_changes.sql
-- D-3: consent CHANGE ledger. consent_records (0031) is an immutable GRANT log
-- (sign-up / re-consent / age-out), but a user turning an optional privacy pref
-- OFF — withdrawing a consent they previously gave — was never recorded. That is
-- a PIPA §37 (동의 철회) / GDPR Art.7(3) (right to withdraw) accountability gap:
-- a withdrawal must be provable, not merely inferred from a pref's absence.
--
-- This append-only table records every optional-consent TRANSITION at the moment
-- the user flips a users.privacy_prefs toggle: one row per changed key, with
-- event_type 'grant' (false->true) or 'revoke' (true->false).
--
-- Append-only by design: select/insert policies only, NO update/delete, so a
-- recorded change can't be altered after the fact (mirrors consent_records 0031
-- and ingest_log 0044). Per-user RLS; hashed request metadata only (never the
-- raw IP / UA — data minimization), left NULL from the client for now.
--
-- pref_key is free text (not a CHECK enum) on purpose: the privacy-pref key set
-- evolves (see the D-1 prune of llm_training/persona_export/persona_share), and
-- coupling this ledger's schema to that set would force a migration on every key
-- change. The client only ever writes keys from PRIVACY_PREF_KEYS.
--
-- WIRED at src/lib/supabase/privacy.ts savePrivacyPrefs(): after the whole-object
-- write succeeds it diffs the before/after prefs and appends one row per changed
-- key. savePrivacyPrefs is the single choke point for every pref write (settings,
-- /ops, deep-space privacy), so no toggle path can bypass the ledger.

CREATE TABLE IF NOT EXISTS consent_changes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pref_key     text NOT NULL,                                    -- the privacy_prefs key that changed
  event_type   text NOT NULL CHECK (event_type IN ('grant', 'revoke')),
  ip_hash      text,                                             -- hashed, never the raw IP (data minimization)
  ua_hash      text,                                             -- hashed user-agent
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS consent_changes_user_idx
  ON consent_changes (user_id, created_at DESC);

ALTER TABLE consent_changes ENABLE ROW LEVEL SECURITY;

-- Per-user RLS (0031 / 0044 idiom). A user reads and appends only their own
-- change rows. No UPDATE/DELETE policies -> the ledger is immutable from the
-- client; service_role (server) bypasses RLS for admin/export.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    DROP POLICY IF EXISTS consent_changes_select_own ON consent_changes;
    DROP POLICY IF EXISTS consent_changes_insert_own ON consent_changes;

    CREATE POLICY consent_changes_select_own ON consent_changes
      FOR SELECT TO authenticated
      USING (user_id = auth.uid());

    CREATE POLICY consent_changes_insert_own ON consent_changes
      FOR INSERT TO authenticated
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;
