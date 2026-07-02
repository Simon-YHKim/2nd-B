-- 0065_peer_retention.sql
-- F-ret (rev2 P6): bounded retention for the T5 peer-review surfaces (0064).
-- Third-party PII demands TIGHTER aging than self-data: an invitation that was
-- never answered must not sit as an open door forever, and stale peer
-- observations should not outlive their usefulness to the aggregate view.
-- Mirrors 0056/0063 exactly: SECURITY DEFINER, service_role-only functions,
-- OFF BY DEFAULT (no pg_cron here). Nothing runs until a deliberate, separately
-- reviewed activation (E-act sibling) sets the schedule + final windows.
--
-- The retention WINDOWS below are provisional engineering defaults, NOT the
-- final legal/product policy (informant-PII copy is still under legal review,
-- F2 gate). The function parameter is the single control point per period.
--
--   1. peer_invitations   pending/declined/withdrawn invitations past their
--                          window are hard-deleted; EXPIRED marking happens
--                          first (status flip for anything past expires_at) so
--                          the ledger reflects reality before aging out.
--                          ACCEPTED invitations are preserved (they anchor
--                          consent + observations provenance).
--   2. peer_observations  observations older than the window are hard-deleted.
--                          The t5_seen_aggregate() min-N>=3 gate already
--                          tolerates shrinkage; aging keeps the "보여지는 나"
--                          view current rather than archival. Consent rows
--                          (informant_consents) are NEVER touched here — they
--                          are the immutable accountability ledger.

-- 1. peer_invitations -----------------------------------------------------------
CREATE OR REPLACE FUNCTION purge_expired_peer_invitations(retention_days int DEFAULT 90)
RETURNS TABLE (marked_expired bigint, deleted bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cutoff     timestamptz;
  v_marked   bigint := 0;
  v_deleted  bigint := 0;
BEGIN
  IF retention_days IS NULL OR retention_days < 1 THEN
    RAISE EXCEPTION 'retention_days must be >= 1 (got %)', retention_days;
  END IF;
  cutoff := now() - make_interval(days => retention_days);

  -- Honest ledger first: anything past its own expires_at that is still
  -- pending flips to 'expired' (no delete yet — the flip is visible state).
  UPDATE peer_invitations
    SET status = 'expired'
    WHERE status = 'pending' AND expires_at < now();
  GET DIAGNOSTICS v_marked = ROW_COUNT;

  -- Age out closed-without-consent invitations past the retention window.
  -- 'accepted' rows are kept: they anchor informant_consents provenance.
  DELETE FROM peer_invitations
    WHERE status IN ('expired', 'declined', 'withdrawn')
      AND created_at < cutoff;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  marked_expired := v_marked;
  deleted := v_deleted;
  RETURN NEXT;
END;
$$;

-- 2. peer_observations ----------------------------------------------------------
CREATE OR REPLACE FUNCTION purge_stale_peer_observations(retention_days int DEFAULT 730)
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
  DELETE FROM peer_observations WHERE created_at < cutoff;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- service_role only (Supabase auto-grants EXECUTE to PUBLIC on creation and
-- role-level grants survive a bare REVOKE FROM public — revoke anon +
-- authenticated explicitly, then grant service_role; same as 0063).
REVOKE ALL ON FUNCTION purge_expired_peer_invitations(int) FROM PUBLIC;
REVOKE ALL ON FUNCTION purge_expired_peer_invitations(int) FROM anon;
REVOKE ALL ON FUNCTION purge_expired_peer_invitations(int) FROM authenticated;
GRANT EXECUTE ON FUNCTION purge_expired_peer_invitations(int) TO service_role;

REVOKE ALL ON FUNCTION purge_stale_peer_observations(int) FROM PUBLIC;
REVOKE ALL ON FUNCTION purge_stale_peer_observations(int) FROM anon;
REVOKE ALL ON FUNCTION purge_stale_peer_observations(int) FROM authenticated;
GRANT EXECUTE ON FUNCTION purge_stale_peer_observations(int) TO service_role;

-- ACTIVATION (deliberate, reviewed step -- intentionally NOT enabled here):
--   Option A (in-DB scheduler):
--     CREATE EXTENSION IF NOT EXISTS pg_cron;
--     SELECT cron.schedule('purge-peer-invitations', '10 4 * * *',
--       $cron$ SELECT purge_expired_peer_invitations(90); $cron$);
--     SELECT cron.schedule('purge-peer-observations', '20 4 * * *',
--       $cron$ SELECT purge_stale_peer_observations(730); $cron$);
--   Option B (external scheduler -> service_role edge function):
--     supabase.rpc('purge_expired_peer_invitations', { retention_days: 90 })
