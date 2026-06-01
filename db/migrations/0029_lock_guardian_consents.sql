-- 0029_lock_guardian_consents.sql
-- C10 hardening: guardian_consents (created in 0028) is NOT IN USE until the
-- server-side under-14 guardian-verification flow lands (PR-4). Until then it
-- must not be a reachable PII store — a 14-17 self-consent user could otherwise
-- INSERT arbitrary guardian_email rows (spam/abuse + guardian PII with no
-- retention/deletion policy). This locks the table to service_role only.
--
-- Drops the per-user select/insert policies from 0028 and revokes table grants
-- from the API roles. RLS stays ENABLED (from 0028); with zero policies, anon
-- and authenticated get default-deny. service_role bypasses RLS — exactly the
-- privileged path PR-4 will use. Reversible: PR-4 re-adds scoped policies once
-- the guardian PII retention/deletion policy is defined.

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'guardian_consents') THEN
    -- Remove the per-user access added in 0028.
    DROP POLICY IF EXISTS guardian_consents_select_own ON guardian_consents;
    DROP POLICY IF EXISTS guardian_consents_insert_own ON guardian_consents;

    -- Keep RLS on so the default-deny (no-policy) state applies. Idempotent.
    ALTER TABLE guardian_consents ENABLE ROW LEVEL SECURITY;

    -- Defensively strip table privileges from the API roles. Guard on role
    -- existence (a bare dry-run DB has no anon/authenticated — mirrors 0028).
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      REVOKE ALL ON guardian_consents FROM authenticated;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      REVOKE ALL ON guardian_consents FROM anon;
    END IF;

    COMMENT ON TABLE guardian_consents IS
      'NOT IN USE until PR-4 (server-side under-14 guardian verification). RLS is default-deny (no client policies); writes happen only via service_role. Do not add client policies until the guardian PII retention/deletion policy is defined.';
  END IF;
END $$;
