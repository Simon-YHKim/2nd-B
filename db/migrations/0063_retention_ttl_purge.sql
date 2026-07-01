-- 0063_retention_ttl_purge.sql
-- PIPA §21 (파기) / GDPR Art.5(1)(e) storage-limitation: bounded retention for the
-- long-lived operational + metadata trails that currently accumulate forever.
-- Mirrors 0056 (purge_unreflected_import_data): SECURITY DEFINER, service_role-
-- only purge functions, OFF BY DEFAULT (no pg_cron here). Nothing is deleted or
-- scrubbed until a deliberate, separately reviewed activation sets the window.
--
-- The retention WINDOWS below are provisional engineering defaults, NOT the final
-- legal/product policy — the definitive periods are decided at activation
-- (docs/CONSTRAINTS.md / legal review). The function parameter is the single
-- point that controls each period.
--
-- Consistent with the app thesis (permanent accumulation of the user's kept
-- self-data), these functions NEVER touch ratified/kept content. They age out:
--   1. ai_audit_log      operational audit of Gemini calls. C3 requires the
--                        INSERT on every call, not infinite retention. Hard
--                        delete past the window.
--   2. consent ip/ua     hashed request metadata on the consent ledgers. The
--                        consent RECORDS stay forever (immutable accountability);
--                        only the ip/ua hash is nulled past the window (data
--                        minimization) — an UPDATE, never a delete of the consent
--                        fact.
--   3. star_tier_history superseded tier observations, PRESERVING the latest row
--                        per (user_id, star_id) so the user's CURRENT standing is
--                        never lost — only the intermediate trail ages out.

-- 1. ai_audit_log --------------------------------------------------------------
CREATE OR REPLACE FUNCTION purge_ai_audit_log(retention_days int DEFAULT 365)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cutoff    timestamptz;
  v_deleted bigint := 0;
BEGIN
  IF retention_days IS NULL OR retention_days < 1 THEN
    RAISE EXCEPTION 'retention_days must be >= 1 (got %)', retention_days;
  END IF;
  cutoff := now() - make_interval(days => retention_days);
  DELETE FROM ai_audit_log WHERE created_at < cutoff;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- 2. consent request metadata (ip/ua hashes) -----------------------------------
-- NULLs the hashed request metadata on BOTH consent ledgers past the window. The
-- consent rows themselves are retained (immutable accountability); this is a
-- targeted metadata scrub — the storage-limitation counterpart to keeping the
-- consent fact forever. Runs as SECURITY DEFINER (service_role), which bypasses
-- the append-only client RLS on the ledgers by design.
CREATE OR REPLACE FUNCTION purge_consent_request_metadata(retention_days int DEFAULT 365)
RETURNS TABLE (consent_records_scrubbed bigint, consent_changes_scrubbed bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cutoff    timestamptz;
  v_records bigint := 0;
  v_changes bigint := 0;
BEGIN
  IF retention_days IS NULL OR retention_days < 1 THEN
    RAISE EXCEPTION 'retention_days must be >= 1 (got %)', retention_days;
  END IF;
  cutoff := now() - make_interval(days => retention_days);

  UPDATE consent_records
    SET ip_hash = NULL, ua_hash = NULL
    WHERE created_at < cutoff AND (ip_hash IS NOT NULL OR ua_hash IS NOT NULL);
  GET DIAGNOSTICS v_records = ROW_COUNT;

  UPDATE consent_changes
    SET ip_hash = NULL, ua_hash = NULL
    WHERE created_at < cutoff AND (ip_hash IS NOT NULL OR ua_hash IS NOT NULL);
  GET DIAGNOSTICS v_changes = ROW_COUNT;

  consent_records_scrubbed := v_records;
  consent_changes_scrubbed := v_changes;
  RETURN NEXT;
END;
$$;

-- 3. star_tier_history (preserve current standing) -----------------------------
-- Ages out superseded observations only. The most-recent row per (user_id,
-- star_id) is ALWAYS kept, so the user's current tier/brightness survives even if
-- it was recorded before the cutoff. Longer default window (self-data adjacent).
CREATE OR REPLACE FUNCTION purge_star_tier_history(retention_days int DEFAULT 730)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cutoff    timestamptz;
  v_deleted bigint := 0;
BEGIN
  IF retention_days IS NULL OR retention_days < 1 THEN
    RAISE EXCEPTION 'retention_days must be >= 1 (got %)', retention_days;
  END IF;
  cutoff := now() - make_interval(days => retention_days);

  -- Delete only rows that are BOTH older than the window AND superseded by a
  -- newer observation for the same (user, star). The latest row per star is
  -- never matched by the EXISTS, so current standing is preserved.
  DELETE FROM star_tier_history h
  WHERE h.recorded_at < cutoff
    AND EXISTS (
      SELECT 1 FROM star_tier_history n
      WHERE n.user_id = h.user_id
        AND n.star_id = h.star_id
        AND n.recorded_at > h.recorded_at
    );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- service_role only for all three. On Supabase a freshly created function auto-
-- grants EXECUTE to PUBLIC (anon + authenticated), and REVOKE FROM public alone
-- does not drop the role-level grants, so revoke anon + authenticated EXPLICITLY
-- (see memory: supabase function-grants), then grant service_role.
REVOKE ALL ON FUNCTION purge_ai_audit_log(int) FROM PUBLIC;
REVOKE ALL ON FUNCTION purge_ai_audit_log(int) FROM anon;
REVOKE ALL ON FUNCTION purge_ai_audit_log(int) FROM authenticated;
GRANT EXECUTE ON FUNCTION purge_ai_audit_log(int) TO service_role;

REVOKE ALL ON FUNCTION purge_consent_request_metadata(int) FROM PUBLIC;
REVOKE ALL ON FUNCTION purge_consent_request_metadata(int) FROM anon;
REVOKE ALL ON FUNCTION purge_consent_request_metadata(int) FROM authenticated;
GRANT EXECUTE ON FUNCTION purge_consent_request_metadata(int) TO service_role;

REVOKE ALL ON FUNCTION purge_star_tier_history(int) FROM PUBLIC;
REVOKE ALL ON FUNCTION purge_star_tier_history(int) FROM anon;
REVOKE ALL ON FUNCTION purge_star_tier_history(int) FROM authenticated;
GRANT EXECUTE ON FUNCTION purge_star_tier_history(int) TO service_role;

-- ACTIVATION (deliberate, reviewed step -- intentionally NOT enabled here):
--   Option A (in-DB scheduler):
--     CREATE EXTENSION IF NOT EXISTS pg_cron;
--     SELECT cron.schedule('purge-ai-audit-log', '30 4 * * *',
--       $cron$ SELECT purge_ai_audit_log(365); $cron$);
--     SELECT cron.schedule('purge-consent-metadata', '40 4 * * *',
--       $cron$ SELECT purge_consent_request_metadata(365); $cron$);
--     SELECT cron.schedule('purge-star-tier-history', '50 4 * * *',
--       $cron$ SELECT purge_star_tier_history(730); $cron$);
--   Option B (external scheduler -> service_role edge function):
--     supabase.rpc('purge_ai_audit_log', { retention_days: 365 })
