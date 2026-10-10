-- G2-05: successful retention is a prerequisite for W1 generation.
-- No reusable global dashboard config exists: 0236 settings are per user;
-- 0195 config belongs to Polaris. This singleton contains no owner/content.
-- It is therefore outside the owner-table erasure registry (0237 unchanged).
CREATE TABLE public.dashboard_generation_retention (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  last_purged_at timestamptz NOT NULL
);
ALTER TABLE public.dashboard_generation_retention ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_generation_retention FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.dashboard_generation_retention FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.dashboard_generation_retention_ready() RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=off AS $$
DECLARE
  -- Provisional; Simon to ratify. Hourly pg_cron with room for delayed ticks.
  retention_max_age CONSTANT interval := interval '3 hours';
  checked_at timestamptz := clock_timestamp();
BEGIN
  RETURN EXISTS(SELECT 1 FROM public.dashboard_generation_retention
    WHERE singleton AND last_purged_at<=checked_at AND last_purged_at>checked_at-retention_max_age);
END $$;

CREATE OR REPLACE FUNCTION public.dashboard_generation_guard(p_user_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=off AS $$
DECLARE c jsonb;
BEGIN
  IF coalesce(nullif(current_setting('request.jwt.claim.role',true),''),
    nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'dashboard_forbidden' USING ERRCODE='42501';
  END IF;
  IF NOT public.dashboard_generation_retention_ready() THEN RETURN NULL; END IF;
  -- Same deletion-fence ordering as 0194; all mutations below retain these locks.
  PERFORM pg_advisory_xact_lock_shared(hashtextextended(p_user_id::text,260913));
  PERFORM 1 FROM auth.users WHERE id=p_user_id AND deleted_at IS NULL AND email_confirmed_at IS NOT NULL FOR SHARE;
  IF NOT FOUND OR EXISTS(SELECT 1 FROM public.account_deletion_tombstones WHERE user_id=p_user_id) THEN RETURN NULL; END IF;
  PERFORM 1 FROM public.users WHERE id=p_user_id AND account_status='active'
    AND minor_tier='adult' AND birth_date <= (current_date-interval '18 years')::date
    AND privacy_prefs->'recommendations'='true'::jsonb FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  c := public.effective_llm_consent_snapshot_v2(p_user_id,false);
  IF c->'allowed' IS DISTINCT FROM 'true'::jsonb OR coalesce(c->>'token','') !~ '^[a-f0-9]{64}$' THEN RETURN NULL; END IF;
  RETURN c;
END $$;

CREATE OR REPLACE FUNCTION public.purge_dashboard_generation() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path='' SET row_security=off AS $$
  -- Keep attempt rows at least 48h so midnight/travel cannot reopen a quota.
  UPDATE public.dashboard_generation_runs SET output=NULL,status='failed' WHERE expires_at<=now() AND output IS NOT NULL;
  DELETE FROM public.dashboard_generation_runs WHERE created_at<now()-interval '48 hours';
  INSERT INTO public.dashboard_generation_retention(singleton,last_purged_at) VALUES(true,clock_timestamp())
    ON CONFLICT(singleton) DO UPDATE SET last_purged_at=EXCLUDED.last_purged_at;
$$;

-- Seed through a real successful purge, not a fabricated success timestamp.
-- The existing pg_cron job and GitHub RPC both call this same function.
-- Old Edge + new DB keeps the existing signatures and generation switch.
SELECT public.purge_dashboard_generation();

REVOKE ALL ON FUNCTION public.dashboard_generation_retention_ready(),
  public.dashboard_generation_guard(uuid),public.purge_dashboard_generation()
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.dashboard_generation_retention_ready(),public.purge_dashboard_generation() TO service_role;
