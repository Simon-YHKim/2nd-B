\set ON_ERROR_STOP on

-- Re-apply deliberately: CREATE IF NOT EXISTS / CREATE OR REPLACE and ACL
-- repair must remain safe when a local or CI database already has the objects.
\ir ../migrations/0151_public_data_quota.sql

BEGIN;

CREATE FUNCTION pg_temp.assert_true(p_ok boolean, p_message text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_ok IS DISTINCT FROM true THEN
    RAISE EXCEPTION '%', p_message;
  END IF;
END;
$$;

SELECT pg_temp.assert_true(
  (SELECT pg_catalog.bool_and(c.relrowsecurity AND c.relforcerowsecurity)
     FROM pg_catalog.pg_class AS c
    WHERE c.oid IN (
      'public.public_data_quota_daily'::regclass,
      'public.public_data_provider_quota_daily'::regclass
    )),
  'both quota ledgers must have enabled and forced RLS'
);

SELECT pg_temp.assert_true(
  NOT pg_catalog.has_table_privilege('anon', 'public.public_data_quota_daily', 'SELECT')
  AND NOT pg_catalog.has_table_privilege(
    'authenticated', 'public.public_data_quota_daily', 'INSERT'
  )
  AND NOT pg_catalog.has_table_privilege(
    'service_role', 'public.public_data_quota_daily', 'UPDATE'
  )
  AND NOT pg_catalog.has_table_privilege(
    'anon', 'public.public_data_provider_quota_daily', 'SELECT'
  )
  AND NOT pg_catalog.has_table_privilege(
    'authenticated', 'public.public_data_provider_quota_daily', 'INSERT'
  )
  AND NOT pg_catalog.has_table_privilege(
    'service_role', 'public.public_data_provider_quota_daily', 'UPDATE'
  ),
  'quota ledgers must not expose direct role privileges'
);

SELECT pg_temp.assert_true(
  NOT pg_catalog.has_function_privilege(
    'anon', 'public.consume_public_data_quota(uuid,text,date,integer)', 'EXECUTE'
  )
  AND NOT pg_catalog.has_function_privilege(
    'authenticated', 'public.consume_public_data_quota(uuid,text,date,integer)', 'EXECUTE'
  )
  AND pg_catalog.has_function_privilege(
    'service_role', 'public.consume_public_data_quota(uuid,text,date,integer)', 'EXECUTE'
  ),
  'quota RPC must be service-role-only'
);

-- The vanilla-Postgres CI auth.users stub lacks columns used by production
-- triggers. Bypass those triggers only while inserting disposable FK parents.
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users (id, email) VALUES
  ('10000000-0000-0000-0000-000000000001', 'quota-one@example.com'),
  ('10000000-0000-0000-0000-000000000002', 'quota-two@example.com'),
  ('10000000-0000-0000-0000-000000000003', 'quota-three@example.com');
SET LOCAL session_replication_role = origin;

INSERT INTO public.users (id, email, birth_date, locale) VALUES
  ('10000000-0000-0000-0000-000000000001', 'quota-one@example.com', DATE '1990-01-01', 'en'),
  ('10000000-0000-0000-0000-000000000002', 'quota-two@example.com', DATE '1990-01-01', 'en'),
  ('10000000-0000-0000-0000-000000000003', 'quota-three@example.com', DATE '1990-01-01', 'en');

SELECT pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000000"}',
  true
);

DO $$
BEGIN
  BEGIN
    PERFORM public.consume_public_data_quota(
      '10000000-0000-0000-0000-000000000001',
      'exim_fx',
      (pg_catalog.now() AT TIME ZONE 'UTC')::date,
      1
    );
    RAISE EXCEPTION 'cross-user call unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;

SELECT pg_catalog.set_config('request.jwt.claims', '{"role":"service_role"}', true);

DO $$
DECLARE
  v_day date := (pg_catalog.now() AT TIME ZONE 'UTC')::date;
BEGIN
  BEGIN
    PERFORM public.consume_public_data_quota(
      '10000000-0000-0000-0000-000000000001', 'other', v_day, 1
    );
    RAISE EXCEPTION 'provider allowlist unexpectedly accepted other';
  EXCEPTION WHEN invalid_parameter_value THEN
    NULL;
  END;

  BEGIN
    PERFORM public.consume_public_data_quota(
      '10000000-0000-0000-0000-000000000001', 'exim_fx', v_day - 1, 1
    );
    RAISE EXCEPTION 'non-current day unexpectedly succeeded';
  EXCEPTION WHEN invalid_parameter_value THEN
    NULL;
  END;

  BEGIN
    PERFORM public.consume_public_data_quota(
      '10000000-0000-0000-0000-000000000001', 'exim_fx', v_day, 0
    );
    RAISE EXCEPTION 'zero cap unexpectedly succeeded';
  EXCEPTION WHEN invalid_parameter_value THEN
    NULL;
  END;

  BEGIN
    PERFORM public.consume_public_data_quota(
      '10000000-0000-0000-0000-000000000001', 'exim_fx', v_day, 21
    );
    RAISE EXCEPTION 'caller raised the EXIM user cap';
  EXCEPTION WHEN invalid_parameter_value THEN
    NULL;
  END;

  IF NOT public.consume_public_data_quota(
    '10000000-0000-0000-0000-000000000001', 'exim_fx', v_day, 2
  ) THEN
    RAISE EXCEPTION 'first per-user call was denied';
  END IF;
  IF NOT public.consume_public_data_quota(
    '10000000-0000-0000-0000-000000000001', 'exim_fx', v_day, 2
  ) THEN
    RAISE EXCEPTION 'second per-user call was denied';
  END IF;
  IF public.consume_public_data_quota(
    '10000000-0000-0000-0000-000000000001', 'exim_fx', v_day, 2
  ) THEN
    RAISE EXCEPTION 'per-user cap was exceeded';
  END IF;

  IF (SELECT q.calls
        FROM public.public_data_quota_daily AS q
       WHERE q.user_id = '10000000-0000-0000-0000-000000000001'
         AND q.provider = 'exim_fx'
         AND q.usage_day = v_day) <> 2 THEN
    RAISE EXCEPTION 'per-user count mismatch';
  END IF;
  IF (SELECT q.calls
        FROM public.public_data_provider_quota_daily AS q
       WHERE q.provider = 'exim_fx'
         AND q.usage_day = v_day) <> 2 THEN
    RAISE EXCEPTION 'denied user call changed the global count';
  END IF;

  UPDATE public.public_data_provider_quota_daily
     SET calls = 899
   WHERE provider = 'exim_fx' AND usage_day = v_day;
  IF NOT public.consume_public_data_quota(
    '10000000-0000-0000-0000-000000000002', 'exim_fx', v_day, 20
  ) THEN
    RAISE EXCEPTION 'EXIM call 900 was denied';
  END IF;
  IF public.consume_public_data_quota(
    '10000000-0000-0000-0000-000000000003', 'exim_fx', v_day, 20
  ) THEN
    RAISE EXCEPTION 'EXIM global cap was exceeded';
  END IF;

  INSERT INTO public.public_data_provider_quota_daily (provider, usage_day, calls)
  VALUES ('mfds_food', v_day, 899);
  IF NOT public.consume_public_data_quota(
    '10000000-0000-0000-0000-000000000002', 'mfds_food', v_day, 50
  ) THEN
    RAISE EXCEPTION 'MFDS call 900 was denied';
  END IF;
  IF public.consume_public_data_quota(
    '10000000-0000-0000-0000-000000000003', 'mfds_food', v_day, 50
  ) THEN
    RAISE EXCEPTION 'MFDS global cap was exceeded';
  END IF;
END;
$$;

ROLLBACK;
