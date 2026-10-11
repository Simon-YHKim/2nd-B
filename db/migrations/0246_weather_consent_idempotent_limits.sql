-- CODEX-AUDIT-261010 G3-02 / G3-03. Forward only; 0232..0235 stay unchanged.
-- The RPC signature and JSON fields are unchanged for the already deployed Edge.
-- Quota metadata reuses existing consent and private global-quota rows, never
-- access events. Global usage survives account deletion (no owner FK in 0171).
-- 0233's retained classification, content-erasure behavior and account CASCADE
-- still apply to this table. No new owner table or erasure-registry row is needed.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';

ALTER TABLE public.weather_consent_state
  ADD COLUMN consent_check_day date,
  ADD COLUMN consent_check_count integer NOT NULL DEFAULT 0 CHECK (consent_check_count >= 0);
-- Existing exim_fx/mfds_food accounting and RPC allowlist remain unchanged.
ALTER TABLE public.public_data_provider_quota_daily
  DROP CONSTRAINT public_data_provider_quota_provider_allowed,
  ADD CONSTRAINT public_data_provider_quota_provider_allowed
    CHECK (provider IN ('exim_fx','mfds_food','weather_consent')),
  ADD COLUMN weather_check_times timestamptz[] NOT NULL DEFAULT '{}';

CREATE OR REPLACE FUNCTION public.weather_consent(
  p_user_id uuid, p_action text, p_revision bigint DEFAULT NULL,
  p_contract text DEFAULT 'weather-v1-261007', p_locale text DEFAULT 'en'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=off AS $$
DECLARE
  u public.users%ROWTYPE; s public.weather_consent_state%ROWTYPE; eligible boolean;
  checked_at timestamptz; check_day date; recent timestamptz[];
  -- Provisional policy, Simon decision required before production application.
  -- Same rolling second/minute and DB-calendar day units as authorize_weather_request.
  -- Twice its ceilings: a weather read also calls status internally. Successful
  -- status/grant calls share this budget, including no-ops. Revoke never does.
  consent_global_second_limit CONSTANT integer := 20;
  consent_global_minute_limit CONSTANT integer := 120;
  consent_global_day_limit CONSTANT integer := 20000;
  consent_user_day_limit CONSTANT integer := 120;
BEGIN
  IF coalesce(nullif(current_setting('request.jwt.claim.role',true),''),
      nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'weather_forbidden' USING ERRCODE='42501';
  END IF;
  IF p_action IS NULL OR p_action NOT IN ('status','grant','revoke') OR p_contract IS DISTINCT FROM 'weather-v1-261007'
     OR p_locale IS NULL OR p_locale NOT IN ('en','ko','es','pt','id') THEN
    RAISE EXCEPTION 'weather_contract_changed' USING ERRCODE='22023';
  END IF;
  -- Keep the owner-deletion fence and auth/profile lock order from 0235.
  PERFORM pg_advisory_xact_lock_shared(hashtextextended(p_user_id::text,260913));
  PERFORM 1 FROM auth.users WHERE id=p_user_id AND deleted_at IS NULL AND email_confirmed_at IS NOT NULL FOR SHARE;
  IF NOT FOUND OR EXISTS(SELECT 1 FROM public.account_deletion_tombstones WHERE user_id=p_user_id) THEN
    RAISE EXCEPTION 'weather_forbidden' USING ERRCODE='42501';
  END IF;
  SELECT * INTO u FROM public.users WHERE id=p_user_id FOR UPDATE;
  IF NOT FOUND OR u.account_status IS DISTINCT FROM 'active' THEN RAISE EXCEPTION 'weather_forbidden' USING ERRCODE='42501'; END IF;
  eligible := coalesce(u.minor_tier='adult' AND u.birth_date <= (current_date-interval '18 years')::date,false);
  SELECT * INTO s FROM public.weather_consent_state WHERE user_id=p_user_id;

  -- Reject invalid grants before any quota write: exceptions roll a transaction
  -- back, so writing counters first would only create unbounded aborted writes.
  IF p_action='grant' THEN
    IF p_revision IS DISTINCT FROM coalesce(s.revision,0) THEN RAISE EXCEPTION 'weather_changed' USING ERRCODE='PT409'; END IF;
    IF NOT eligible THEN RAISE EXCEPTION 'weather_forbidden' USING ERRCODE='42501'; END IF;
  END IF;

  IF p_action <> 'revoke' THEN
    -- Every instance checks AND consumes under this transaction lock. Read wall
    -- time after waiting, so a long-lived transaction cannot spend in an old window.
    PERFORM pg_advisory_xact_lock(261011,246);
    checked_at := clock_timestamp();
    check_day := checked_at::date;
    SELECT coalesce(array_agg(t), '{}'::timestamptz[]) INTO recent
      FROM public.public_data_provider_quota_daily c, unnest(c.weather_check_times) AS t
      WHERE c.provider='weather_consent' AND c.usage_day >= check_day - 1 AND t >= checked_at - interval '1 minute';
    IF (SELECT count(*) FROM unnest(recent) AS t WHERE t >= checked_at - interval '1 second') >= consent_global_second_limit
       OR cardinality(recent) >= consent_global_minute_limit
       OR coalesce((SELECT calls FROM public.public_data_provider_quota_daily
           WHERE provider='weather_consent' AND usage_day=check_day),0) >= consent_global_day_limit
       OR (s.consent_check_day=check_day AND s.consent_check_count >= consent_user_day_limit) THEN
      RAISE EXCEPTION 'weather_limited' USING ERRCODE='PT429';
    END IF;
    -- Lazily prune to today's counter and the previous day's minute boundary.
    -- Idle metadata is bounded to two rows; no per-request history accumulates.
    DELETE FROM public.public_data_provider_quota_daily
      WHERE provider='weather_consent' AND usage_day < check_day - 1;
    INSERT INTO public.public_data_provider_quota_daily(provider,usage_day,calls,weather_check_times)
      VALUES('weather_consent',check_day,1,ARRAY[checked_at])
      ON CONFLICT(provider,usage_day) DO UPDATE SET calls=public_data_provider_quota_daily.calls+1,
        weather_check_times=ARRAY(SELECT t FROM unnest(public_data_provider_quota_daily.weather_check_times) AS t
          WHERE t >= checked_at - interval '1 minute') || checked_at, updated_at=checked_at;
    INSERT INTO public.weather_consent_state(user_id,revision,enabled,contract,locale,
        consent_check_day,consent_check_count)
      VALUES(p_user_id,0,false,p_contract,p_locale,check_day,1)
      ON CONFLICT(user_id) DO UPDATE SET
        consent_check_day=check_day,
        consent_check_count=CASE WHEN weather_consent_state.consent_check_day=check_day
          THEN weather_consent_state.consent_check_count+1 ELSE 1 END
      RETURNING * INTO s;
  END IF;

  -- A stale revoke uses the locked current revision. OFF->OFF (including no row)
  -- and ON->ON do not update the profile, revision, timestamp or access events.
  IF p_action <> 'status' AND coalesce(s.enabled,false) IS DISTINCT FROM (p_action='grant') THEN
    INSERT INTO public.weather_consent_state(user_id,revision,enabled,contract,locale)
      VALUES(p_user_id,coalesce(s.revision,0)+1,p_action='grant',p_contract,p_locale)
      ON CONFLICT(user_id) DO UPDATE SET revision=EXCLUDED.revision,enabled=EXCLUDED.enabled,
        contract=EXCLUDED.contract,locale=EXCLUDED.locale,updated_at=now()
      RETURNING * INTO s;
    UPDATE public.users SET privacy_prefs=coalesce(privacy_prefs,'{}'::jsonb)||jsonb_build_object('location_weather',s.enabled) WHERE id=p_user_id;
    INSERT INTO public.weather_access_events(user_id,event) VALUES(p_user_id,p_action);
  END IF;
  RETURN jsonb_build_object('contract','weather-v1-261007','revision',coalesce(s.revision,0),
    'enabled',coalesce(s.enabled AND eligible AND (p_action='grant' OR u.privacy_prefs->'location_weather'='true'::jsonb),false), 'eligible',eligible);
END $$;
REVOKE ALL ON FUNCTION public.weather_consent(uuid,text,bigint,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.weather_consent(uuid,text,bigint,text,text) TO service_role;
