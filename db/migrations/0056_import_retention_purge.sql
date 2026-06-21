-- 0056_import_retention_purge.sql
-- PIPA data-minimization: bounded retention for UNREFLECTED import-derived data.
--
-- This app's thesis is the permanent accumulation of the user's self-data, so
-- the retention policy NEVER touches what the user kept: ratified records,
-- wiki_pages, self_contexts, and memorized_patterns are retained forever. It
-- only ages out raw imported `sources` that never became knowledge (no wiki_page
-- references them and they are not a dedup anchor) plus the `ingest_log` drop
-- ledger, once older than the retention window (default 365 days).
--
-- Why these are safe to purge:
--   * ingest_log    accountability trail for clips DROPPED before storage
--                   (exact/near-dup, policy block). Inherently unreflected.
--   * sources (s)   only rows where NO wiki_page points at s (s never entered
--                   the knowledge graph) AND s is not a dedup anchor (another
--                   source's dedup_of, or an ingest_log survivor). records /
--                   self_contexts / memorized_patterns do not FK sources, so
--                   the user's kept notes are unaffected by removing a raw
--                   source row.
--
-- OFF BY DEFAULT: this migration only DEFINES purge_unreflected_import_data().
-- It does NOT schedule it (no pg_cron). Until activation, nothing is deleted.
-- Activation is a deliberate, separately reviewed deploy step (see bottom).
--
-- Hard delete (data minimization). service_role only -- never client-callable.

CREATE OR REPLACE FUNCTION purge_unreflected_import_data(retention_days int DEFAULT 365)
RETURNS TABLE (sources_deleted bigint, ingest_log_deleted bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cutoff    timestamptz;
  v_sources bigint := 0;
  v_log     bigint := 0;
BEGIN
  IF retention_days IS NULL OR retention_days < 1 THEN
    RAISE EXCEPTION 'retention_days must be >= 1 (got %)', retention_days;
  END IF;
  cutoff := now() - make_interval(days => retention_days);

  -- 1. ingest_log drop ledger: clips dropped before storage. Age out wholesale.
  DELETE FROM ingest_log WHERE dropped_at < cutoff;
  GET DIAGNOSTICS v_log = ROW_COUNT;

  -- 2. Unreflected import sources older than the window: not in the knowledge
  --    graph (no wiki_pages.source_id) and not a dedup anchor. Ratified content
  --    the user kept is untouched.
  DELETE FROM sources s
  WHERE s.captured_at < cutoff
    AND NOT EXISTS (SELECT 1 FROM wiki_pages w  WHERE w.source_id = s.id)
    AND NOT EXISTS (SELECT 1 FROM sources    d  WHERE d.dedup_of  = s.id)
    AND NOT EXISTS (SELECT 1 FROM ingest_log il WHERE il.survivor_id = s.id);
  GET DIAGNOSTICS v_sources = ROW_COUNT;

  sources_deleted    := v_sources;
  ingest_log_deleted := v_log;
  RETURN NEXT;
END;
$$;

-- service_role only. On Supabase a freshly created function auto-grants EXECUTE
-- to PUBLIC (which includes anon + authenticated), and REVOKE FROM public alone
-- does not drop the role-level grants, so revoke anon + authenticated EXPLICITLY
-- (see memory: supabase function-grants), then grant service_role.
REVOKE ALL ON FUNCTION purge_unreflected_import_data(int) FROM PUBLIC;
REVOKE ALL ON FUNCTION purge_unreflected_import_data(int) FROM anon;
REVOKE ALL ON FUNCTION purge_unreflected_import_data(int) FROM authenticated;
GRANT EXECUTE ON FUNCTION purge_unreflected_import_data(int) TO service_role;

-- ACTIVATION (deliberate, reviewed step -- intentionally NOT enabled here):
--   Option A (in-DB scheduler):
--     CREATE EXTENSION IF NOT EXISTS pg_cron;
--     SELECT cron.schedule('purge-unreflected-imports', '0 4 * * *',
--       $cron$ SELECT purge_unreflected_import_data(365); $cron$);
--   Option B (external scheduler -> service_role edge function):
--     supabase.rpc('purge_unreflected_import_data', { retention_days: 365 })
