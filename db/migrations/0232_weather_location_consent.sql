-- GPS weather, Q-261007-39. Allocated after reading origin/main DECISIONS
-- (2026-10-07) and its migration maximum, 0231. Code only: production needs GO.
-- Optional weather-v1-261007 is independent of email-v9/service-v4. No global
-- signup tuple changes or retrospective grants. Publication dates remain unset.
-- Coordinates, IP addresses and request bodies have no database column.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';

CREATE TABLE public.weather_consent_state (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  enabled boolean NOT NULL DEFAULT false,
  contract text NOT NULL CHECK (contract = 'weather-v1-261007'),
  locale text NOT NULL CHECK (locale IN ('en','ko','es','pt','id')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.weather_access_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  event text NOT NULL CHECK (event IN ('grant','revoke','use')),
  recipient text NOT NULL DEFAULT 'MET Norway' CHECK (recipient = 'MET Norway'),
  contract text NOT NULL DEFAULT 'weather-v1-261007' CHECK (contract = 'weather-v1-261007'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX weather_access_events_user_time ON public.weather_access_events(user_id,created_at);
CREATE INDEX weather_access_events_time ON public.weather_access_events(created_at);
ALTER TABLE public.weather_consent_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weather_consent_state FORCE ROW LEVEL SECURITY;
ALTER TABLE public.weather_access_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weather_access_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.weather_consent_state, public.weather_access_events FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.weather_consent_state, public.weather_access_events TO authenticated;
CREATE POLICY weather_consent_read_own ON public.weather_consent_state FOR SELECT TO authenticated USING (user_id=(SELECT auth.uid()));
CREATE POLICY weather_events_read_own ON public.weather_access_events FOR SELECT TO authenticated USING (user_id=(SELECT auth.uid()));

-- Defense in depth for direct privacy_prefs writes, including DOB corrections.
-- The stored state can only be granted by the owner-bound service RPC below.
CREATE FUNCTION public.guard_weather_privacy() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=off AS $$
DECLARE trusted boolean := false;
BEGIN
  IF NEW.minor_tier = 'adult' AND NEW.birth_date IS NOT NULL
     AND NEW.birth_date <= (current_date - interval '18 years')::date
     AND (TG_OP = 'INSERT' OR OLD.minor_tier = 'adult') THEN
    SELECT s.enabled INTO trusted FROM public.weather_consent_state s WHERE s.user_id=NEW.id;
  END IF;
  IF trusted IS DISTINCT FROM true THEN
    NEW.privacy_prefs := coalesce(NEW.privacy_prefs,'{}'::jsonb) || jsonb_build_object('location_weather',false);
  END IF;
  IF NEW.privacy_prefs->'location_weather' IS DISTINCT FROM 'true'::jsonb THEN
    UPDATE public.weather_consent_state SET enabled=false,revision=revision+1,updated_at=now()
      WHERE user_id=NEW.id AND enabled;
    IF FOUND THEN INSERT INTO public.weather_access_events(user_id,event) VALUES(NEW.id,'revoke'); END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_weather_privacy() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER zz_weather_privacy_guard BEFORE INSERT OR UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.guard_weather_privacy();

CREATE FUNCTION public.weather_consent(
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
    IF p_revision IS DISTINCT FROM coalesce(s.revision,0) THEN RAISE EXCEPTION 'weather_changed' USING ERRCODE='40001'; END IF;
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

-- Records an authorized forecast request, never a location. Serializing this
-- small quota keeps the whole app below MET's 20 requests/second threshold.
CREATE FUNCTION public.authorize_weather_request(p_user_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=off AS $$
DECLARE status jsonb;
BEGIN
  status := public.weather_consent(p_user_id,'status');
  IF status->'enabled' IS DISTINCT FROM 'true'::jsonb THEN RETURN false; END IF;
  PERFORM pg_advisory_xact_lock(261007,39);
  IF (SELECT count(*) FROM public.weather_access_events WHERE event='use' AND created_at >= now()-interval '1 second') >= 10
     OR (SELECT count(*) FROM public.weather_access_events WHERE event='use' AND created_at >= current_date) >= 10000
     OR (SELECT count(*) FROM public.weather_access_events WHERE user_id=p_user_id AND event='use' AND created_at >= current_date) >= 60 THEN RETURN false; END IF;
  INSERT INTO public.weather_access_events(user_id,event) VALUES(p_user_id,'use');
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.authorize_weather_request(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.authorize_weather_request(uuid) TO service_role;

CREATE FUNCTION public.purge_weather_access_events() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path='' SET row_security=off AS $$
  DELETE FROM public.weather_access_events WHERE created_at < now()-interval '6 months';
$$;
REVOKE ALL ON FUNCTION public.purge_weather_access_events() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.purge_weather_access_events() TO service_role;
DO $cron$
BEGIN
  IF to_regnamespace('cron') IS NOT NULL THEN
    PERFORM cron.schedule('purge-weather-access-events','41 19 * * *','SELECT public.purge_weather_access_events()');
  END IF;
END $cron$;
