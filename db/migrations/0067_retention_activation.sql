-- 0067: E-act — retention purge ACTIVATION (Simon-ratified 2026-07-03).
-- Turns ON the schedules for the purge functions that earlier migrations
-- deployed OFF-by-default, at their documented default windows:
--   purge_unreflected_import_data (0056)      - raw imports never reflected on
--   purge_ai_audit_log(365) (0063)            - C3 audit rows past 1 year
--   purge_consent_request_metadata(365) (0063)- ip/ua hash nulling only; the
--                                               consent FACT is never deleted
--   purge_star_tier_history(730) (0063)       - intermediate trail only; the
--                                               latest row per (user, star) is
--                                               always preserved
--   purge_expired_peer_invitations(90) (0065) - accepted rows preserved
--   purge_stale_peer_observations(730) (0065)
--
-- All six are SECURITY DEFINER, service_role-only; pg_cron runs as the
-- extension owner so grants hold. Nightly at 04:00 UTC (13:00 KST), staggered
-- a minute apart to avoid lock pileups.
--
-- CI-safe: the plain postgres container in the sql dry-run has no pg_cron, so
-- the whole activation is guarded on extension availability and becomes a
-- NOTICE no-op there. On Supabase (pg_cron available) it schedules for real.
-- Idempotent: existing jobs with these names are unscheduled first.

DO $$
DECLARE
  j record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    RAISE NOTICE '0067: pg_cron not available (CI dry-run); skipping retention activation';
    RETURN;
  END IF;

  EXECUTE 'CREATE EXTENSION IF NOT EXISTS pg_cron';

  FOR j IN SELECT jobid, jobname FROM cron.job
    WHERE jobname IN (
      'purge-unreflected-imports', 'purge-ai-audit-log',
      'purge-consent-request-metadata', 'purge-star-tier-history',
      'purge-expired-peer-invitations', 'purge-stale-peer-observations')
  LOOP
    PERFORM cron.unschedule(j.jobid);
  END LOOP;

  PERFORM cron.schedule('purge-unreflected-imports',      '0 4 * * *', 'SELECT purge_unreflected_import_data();');
  PERFORM cron.schedule('purge-ai-audit-log',             '1 4 * * *', 'SELECT purge_ai_audit_log(365);');
  PERFORM cron.schedule('purge-consent-request-metadata', '2 4 * * *', 'SELECT purge_consent_request_metadata(365);');
  PERFORM cron.schedule('purge-star-tier-history',        '3 4 * * *', 'SELECT purge_star_tier_history(730);');
  PERFORM cron.schedule('purge-expired-peer-invitations', '4 4 * * *', 'SELECT purge_expired_peer_invitations(90);');
  PERFORM cron.schedule('purge-stale-peer-observations',  '5 4 * * *', 'SELECT purge_stale_peer_observations(730);');
END $$;
