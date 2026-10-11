-- Requires Simon GO. Prefer a forward repair; never reset/fake the heartbeat
-- or reopen generation while retention is unavailable. No content is restored.
-- Roll back only the Edge bundle to the previous reviewed SHA. Its unchanged
-- request/dispatch/finish signatures still work with 0245. Keep this DB guard,
-- singleton and heartbeat-producing purge, plus the unconditional hourly job.
-- If the heartbeat is stale, repair and run purge before resuming generation.
-- Keep the v2 lease columns/functions and audit lineage too. Never clear a
-- dispatch marker or convert a v2 row to a legacy NULL lease. Old Edge can
-- continue on legacy claims; existing v2 keys may wait until the next slot.
-- Keep begin_classification_v2/block_v2 and +classifying evidence. A missing
-- terminal ACK must never be repaired by clearing its recovery fence.
SET LOCAL lock_timeout = '10s';
SELECT public.purge_dashboard_generation();
DO $$ BEGIN
  IF NOT public.dashboard_generation_retention_ready() THEN
    RAISE EXCEPTION 'dashboard_retention_unavailable';
  END IF;
END $$;
