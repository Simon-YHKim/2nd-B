-- PROVISIONAL 0169: final integration must re-scan and may renumber this file.
-- 0165 is reserved by the native-release coordinator and is intentionally unused.
--
-- Each successful claim spends both the global UTC-day allowance and the
-- caller's UTC-day allowance in one transaction. The global row is locked
-- first for every caller, which gives concurrent requests one lock order.

BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.rss_proxy_quota_daily (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  usage_day date NOT NULL,
  calls integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  PRIMARY KEY (user_id, usage_day),
  CONSTRAINT rss_proxy_quota_calls_nonnegative CHECK (calls >= 0)
);

CREATE TABLE IF NOT EXISTS public.rss_proxy_global_quota_daily (
  usage_day date PRIMARY KEY,
  calls integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT rss_proxy_global_quota_calls_nonnegative CHECK (calls >= 0)
);

ALTER TABLE public.rss_proxy_quota_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rss_proxy_quota_daily FORCE ROW LEVEL SECURITY;
ALTER TABLE public.rss_proxy_global_quota_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rss_proxy_global_quota_daily FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.rss_proxy_quota_daily
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.rss_proxy_global_quota_daily
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.consume_rss_proxy_quota(
  p_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_request_role text;
  v_day date := (pg_catalog.now() AT TIME ZONE 'UTC')::date;
  v_user_cap constant integer := 40;
  v_global_cap constant integer := 10000;
  v_global_calls integer;
  v_user_calls integer;
BEGIN
  v_request_role := COALESCE(
    NULLIF(pg_catalog.current_setting('request.jwt.claim.role', true), ''),
    NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  );
  IF v_request_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role only' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id required' USING ERRCODE = '22004';
  END IF;

  INSERT INTO public.rss_proxy_global_quota_daily AS global_quota
    (usage_day, calls)
  VALUES (v_day, 0)
  ON CONFLICT (usage_day) DO NOTHING;

  SELECT global_quota.calls
    INTO STRICT v_global_calls
    FROM public.rss_proxy_global_quota_daily AS global_quota
   WHERE global_quota.usage_day = v_day
   FOR UPDATE;

  IF v_global_calls >= v_global_cap THEN
    RETURN false;
  END IF;

  INSERT INTO public.rss_proxy_quota_daily AS user_quota
    (user_id, usage_day, calls)
  VALUES (p_user_id, v_day, 0)
  ON CONFLICT (user_id, usage_day) DO NOTHING;

  SELECT user_quota.calls
    INTO STRICT v_user_calls
    FROM public.rss_proxy_quota_daily AS user_quota
   WHERE user_quota.user_id = p_user_id
     AND user_quota.usage_day = v_day
   FOR UPDATE;

  IF v_user_calls >= v_user_cap THEN
    RETURN false;
  END IF;

  UPDATE public.rss_proxy_global_quota_daily AS global_quota
     SET calls = global_quota.calls + 1,
         updated_at = pg_catalog.now()
   WHERE global_quota.usage_day = v_day;

  UPDATE public.rss_proxy_quota_daily AS user_quota
     SET calls = user_quota.calls + 1,
         updated_at = pg_catalog.now()
   WHERE user_quota.user_id = p_user_id
     AND user_quota.usage_day = v_day;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_rss_proxy_quota(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.consume_rss_proxy_quota(uuid)
  TO service_role;

DO $postconditions$
BEGIN
  IF pg_catalog.to_regclass('public.rss_proxy_quota_daily') IS NULL
     OR pg_catalog.to_regclass('public.rss_proxy_global_quota_daily') IS NULL
     OR pg_catalog.to_regprocedure('public.consume_rss_proxy_quota(uuid)') IS NULL THEN
    RAISE EXCEPTION 'rss proxy quota objects missing after migration';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_catalog.pg_class AS relation
     WHERE relation.oid IN (
       'public.rss_proxy_quota_daily'::regclass,
       'public.rss_proxy_global_quota_daily'::regclass
     )
       AND (NOT relation.relrowsecurity OR NOT relation.relforcerowsecurity)
  ) THEN
    RAISE EXCEPTION 'rss proxy quota RLS postcondition failed';
  END IF;

  IF pg_catalog.has_table_privilege('anon', 'public.rss_proxy_quota_daily', 'SELECT')
     OR pg_catalog.has_table_privilege('authenticated', 'public.rss_proxy_quota_daily', 'SELECT')
     OR pg_catalog.has_table_privilege('service_role', 'public.rss_proxy_quota_daily', 'SELECT')
     OR pg_catalog.has_table_privilege('anon', 'public.rss_proxy_global_quota_daily', 'SELECT')
     OR pg_catalog.has_table_privilege('authenticated', 'public.rss_proxy_global_quota_daily', 'SELECT')
     OR pg_catalog.has_table_privilege('service_role', 'public.rss_proxy_global_quota_daily', 'SELECT')
     OR pg_catalog.has_function_privilege(
       'anon',
       'public.consume_rss_proxy_quota(uuid)',
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'authenticated',
       'public.consume_rss_proxy_quota(uuid)',
       'EXECUTE'
     )
     OR NOT pg_catalog.has_function_privilege(
       'service_role',
       'public.consume_rss_proxy_quota(uuid)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'rss proxy quota ACL postcondition failed' USING ERRCODE = '42501';
  END IF;
END
$postconditions$;

COMMIT;
