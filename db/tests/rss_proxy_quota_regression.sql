\set ON_ERROR_STOP on

-- Run only on the CI scratch database after numbered 0200 and 0201.
BEGIN;

-- The vanilla PostgreSQL auth stub lacks production trigger columns.
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users (id, email) VALUES
  ('20000000-0000-0000-0000-000000000001', 'rss-one@example.com'),
  ('20000000-0000-0000-0000-000000000002', 'rss-two@example.com'),
  ('20000000-0000-0000-0000-000000000003', 'rss-three@example.com');
SET LOCAL session_replication_role = origin;
INSERT INTO public.users (id, email, birth_date, locale) VALUES
  ('20000000-0000-0000-0000-000000000001', 'rss-one@example.com', DATE '1990-01-01', 'en'),
  ('20000000-0000-0000-0000-000000000002', 'rss-two@example.com', DATE '1990-01-01', 'en'),
  ('20000000-0000-0000-0000-000000000003', 'rss-three@example.com', DATE '1990-01-01', 'en');

SET LOCAL request.jwt.claim.role = 'authenticated';
DO $unauthorized$
BEGIN
  BEGIN
    PERFORM public.consume_rss_proxy_quota('20000000-0000-0000-0000-000000000001');
    RAISE EXCEPTION 'authenticated quota call unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$unauthorized$;

SET LOCAL request.jwt.claim.role = 'service_role';
DO $regression$
DECLARE
  v_day date := (pg_catalog.now() AT TIME ZONE 'UTC')::date;
  v_attempt integer;
  v_count integer;
  v_user_one constant uuid := '20000000-0000-0000-0000-000000000001';
  v_user_two constant uuid := '20000000-0000-0000-0000-000000000002';
  v_user_three constant uuid := '20000000-0000-0000-0000-000000000003';
BEGIN
  FOR v_attempt IN 1..40 LOOP
    IF public.consume_rss_proxy_quota(v_user_one) IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'user quota denied call % before 40', v_attempt;
    END IF;
  END LOOP;
  IF public.consume_rss_proxy_quota(v_user_one) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'user quota admitted call 41';
  END IF;
  SELECT calls INTO v_count FROM public.rss_proxy_global_quota_daily
   WHERE usage_day = v_day;
  IF v_count IS DISTINCT FROM 40 THEN
    RAISE EXCEPTION 'rejected user call consumed global quota: %', v_count;
  END IF;
  IF public.consume_rss_proxy_quota(v_user_two) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'second user was denied below global cap';
  END IF;
  SELECT calls INTO v_count FROM public.rss_proxy_global_quota_daily
   WHERE usage_day = v_day;
  IF v_count IS DISTINCT FROM 41 THEN
    RAISE EXCEPTION 'global quota failed to count second user: %', v_count;
  END IF;

  UPDATE public.rss_proxy_global_quota_daily SET calls = 10000
   WHERE usage_day = v_day;
  IF public.consume_rss_proxy_quota(v_user_three) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'global quota admitted call above 10000';
  END IF;
  IF EXISTS (SELECT 1 FROM public.rss_proxy_quota_daily
              WHERE user_id = v_user_three AND usage_day = v_day) THEN
    RAISE EXCEPTION 'global rejection allocated a user quota row';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.erasure_registry
                  WHERE table_name = 'rss_proxy_quota_daily'
                    AND owner_column = 'user_id' AND class = 'retained') THEN
    RAISE EXCEPTION 'RSS user quota is missing retained erasure classification';
  END IF;
END
$regression$;

DELETE FROM public.users WHERE id = '20000000-0000-0000-0000-000000000001';
DO $cascade$
BEGIN
  IF EXISTS (SELECT 1 FROM public.rss_proxy_quota_daily
              WHERE user_id = '20000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'account deletion did not cascade RSS user quota';
  END IF;
END
$cascade$;

ROLLBACK;
