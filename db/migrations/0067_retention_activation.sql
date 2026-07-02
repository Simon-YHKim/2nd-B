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
-- a minute apart to avoid lock pileups. Re-runnable: cron.schedule upserts by
-- jobname on modern pg_cron; the unschedule guard below keeps it idempotent
-- on older versions too.

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
DECLARE
  j record;
BEGIN
  FOR j IN SELECT jobid, jobname FROM cron.job
    WHERE jobname IN (
      'purge-unreflected-imports', 'purge-ai-audit-log',
      'purge-consent-request-metadata', 'purge-star-tier-history',
      'purge-expired-peer-invitations', 'purge-stale-peer-observations')
  LOOP
    PERFORM cron.unschedule(j.jobid);
  END LOOP;
END $$;

SELECT cron.schedule('purge-unreflected-imports',      '0 4 * * *', $$SELECT purge_unreflected_import_data();$$);
SELECT cron.schedule('purge-ai-audit-log',             '1 4 * * *', $$SELECT purge_ai_audit_log(365);$$);
SELECT cron.schedule('purge-consent-request-metadata', '2 4 * * *', $$SELECT purge_consent_request_metadata(365);$$);
SELECT cron.schedule('purge-star-tier-history',        '3 4 * * *', $$SELECT purge_star_tier_history(730);$$);
SELECT cron.schedule('purge-expired-peer-invitations', '4 4 * * *', $$SELECT purge_expired_peer_invitations(90);$$);
SELECT cron.schedule('purge-stale-peer-observations',  '5 4 * * *', $$SELECT purge_stale_peer_observations(730);$$);
