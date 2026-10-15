-- NOAA worldwide observation bulk replaces coordinate-bearing MET requests.
-- The device selects a station locally; no device location enters these RPCs.
-- Historical recipient values are retained, including previously recorded MET use.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';

ALTER TABLE public.weather_access_events
  DROP CONSTRAINT weather_access_events_recipient_check,
  ALTER COLUMN recipient SET DEFAULT 'NOAA/NWS (bulk, no device location)',
  ADD CONSTRAINT weather_access_events_recipient_check
    CHECK (recipient IN ('MET Norway', 'NOAA/NWS (bulk, no device location)'));

-- Each request still traverses the service-role, verified-auth, adult-consent,
-- deletion fence and profile locks in weather_consent. The app lock serializes
-- every quota check, including across Edge instances with separate public caches.
-- 60/minute stays below NOAA's published 100 requests/minute limit even when cold.
CREATE OR REPLACE FUNCTION public.authorize_weather_request(p_user_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=off AS $$
DECLARE status jsonb;
BEGIN
  status := public.weather_consent(p_user_id,'status');
  IF status->'enabled' IS DISTINCT FROM 'true'::jsonb THEN RETURN false; END IF;
  PERFORM pg_advisory_xact_lock(261007,39);
  IF (SELECT count(*) FROM public.weather_access_events WHERE event='use' AND created_at >= now()-interval '1 second') >= 10
     OR (SELECT count(*) FROM public.weather_access_events WHERE event='use' AND created_at >= now()-interval '1 minute') >= 60
     OR (SELECT count(*) FROM public.weather_access_events WHERE event='use' AND created_at >= current_date) >= 10000
     OR (SELECT count(*) FROM public.weather_access_events WHERE user_id=p_user_id AND event='use' AND created_at >= current_date) >= 60 THEN RETURN false; END IF;
  INSERT INTO public.weather_access_events(user_id,event) VALUES(p_user_id,'use');
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.authorize_weather_request(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.authorize_weather_request(uuid) TO service_role;
