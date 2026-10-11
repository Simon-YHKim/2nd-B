-- Requires Simon GO. Prefer a forward repair; never reset/fake the heartbeat
-- or reopen generation while retention is unavailable. No content is restored.
-- Roll back only the Edge bundle to the previous reviewed SHA. Its unchanged
-- request/dispatch/finish signatures still work with 0245. Keep this DB guard,
-- singleton and heartbeat-producing purge, plus the unconditional hourly job.
-- If the heartbeat is stale, repair and run purge before resuming generation.
SET LOCAL lock_timeout = '10s';
SELECT public.purge_dashboard_generation();
DO $$ BEGIN
  IF NOT public.dashboard_generation_retention_ready() THEN
    RAISE EXCEPTION 'dashboard_retention_unavailable';
  END IF;
END $$;
