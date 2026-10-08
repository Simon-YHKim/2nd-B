-- An expected consent revision conflict is a permanent HTTP 409, not a
-- transient serialization failure. PostgREST 14 retries 40001 indefinitely.
-- Retain 0232's signature, authorization, lock order, state changes and grants.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';

CREATE OR REPLACE FUNCTION public.weather_consent(
  p_user_id uuid, p_action text, p_revision bigint DEFAULT NULL,
  p_contract text DEFAULT 'weather-v1-261007', p_locale text DEFAULT 'en'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=off AS $$
DECLARE u public.users%ROWTYPE; s public.weather_consent_state%ROWTYPE; eligible boolean;
BEGIN
  IF coalesce(nullif(current_setting('request.jwt.claim.role',true),''),
      nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'weather_forbidden' USING ERRCODE='42501';
  END IF;
  IF p_action IS NULL OR p_action NOT IN ('status','grant','revoke') OR p_contract IS DISTINCT FROM 'weather-v1-261007'
     OR p_locale IS NULL OR p_locale NOT IN ('en','ko','es','pt','id') THEN
    RAISE EXCEPTION 'weather_contract_changed' USING ERRCODE='22023';
  END IF;
  -- Same owner-deletion fence and auth/profile lock order as 0194.
  PERFORM pg_advisory_xact_lock_shared(hashtextextended(p_user_id::text,260913));
  PERFORM 1 FROM auth.users WHERE id=p_user_id AND deleted_at IS NULL AND email_confirmed_at IS NOT NULL FOR SHARE;
  IF NOT FOUND OR EXISTS(SELECT 1 FROM public.account_deletion_tombstones WHERE user_id=p_user_id) THEN
    RAISE EXCEPTION 'weather_forbidden' USING ERRCODE='42501';
  END IF;
  SELECT * INTO u FROM public.users WHERE id=p_user_id FOR UPDATE;
  IF NOT FOUND OR u.account_status IS DISTINCT FROM 'active' THEN RAISE EXCEPTION 'weather_forbidden' USING ERRCODE='42501'; END IF;
  eligible := coalesce(u.minor_tier='adult' AND u.birth_date <= (current_date-interval '18 years')::date,false);
  SELECT * INTO s FROM public.weather_consent_state WHERE user_id=p_user_id;
  IF p_action <> 'status' THEN
    IF p_revision IS DISTINCT FROM coalesce(s.revision,0) THEN RAISE EXCEPTION 'weather_changed' USING ERRCODE='PT409'; END IF;
    IF p_action='grant' AND NOT eligible THEN RAISE EXCEPTION 'weather_forbidden' USING ERRCODE='42501'; END IF;
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
