-- Runs after the base receipt draft and arbitration, in a disposable DB.
-- All fixture changes roll back. The race runner uses separate fixture owners.
BEGIN;
CREATE FUNCTION pg_temp.assert_true(ok boolean, message text) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION '%', message; END IF; END $$;
CREATE FUNCTION pg_temp.expect_error(statement text, expected_state text, expected_message text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN
  BEGIN EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = expected_state AND (expected_message IS NULL OR SQLERRM = expected_message) THEN RETURN; END IF;
    RAISE;
  END;
  RAISE EXCEPTION 'expected error %, statement succeeded', expected_state;
END $$;

INSERT INTO auth.users(id,email)
SELECT ('de1e7104-0000-4000-9001-' || lpad(n::text,12,'0'))::uuid, 'arbitration-' || n || '@example.invalid'
FROM generate_series(1,4) n;
INSERT INTO public.users(id,email,birth_date,locale)
SELECT id,email,'1990-01-01','en' FROM auth.users WHERE id::text LIKE 'de1e7104-0000-4000-9001-%';
INSERT INTO auth.sessions(id,user_id)
SELECT ('de1e7104-0000-4000-9002-' || lpad(n::text,12,'0'))::uuid,
  ('de1e7104-0000-4000-9001-' || lpad(n::text,12,'0'))::uuid FROM generate_series(1,4) n;

DO $$ DECLARE role_name text; guard regprocedure; BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    FOREACH guard IN ARRAY ARRAY[
      'deletion_receipt_private.guard_receipt_admission()'::regprocedure,
      'deletion_receipt_private.guard_legacy_admission()'::regprocedure
    ] LOOP
      PERFORM pg_temp.assert_true(NOT has_function_privilege(role_name,guard,'EXECUTE'), 'trigger helper exposed');
      PERFORM pg_temp.assert_true((SELECT prosecdef AND provolatile = 'v' AND proconfig @> ARRAY['search_path=""','row_security=off']
        FROM pg_proc WHERE oid=guard), 'trigger helper execution context changed');
    END LOOP;
    PERFORM pg_temp.assert_true(NOT has_table_privilege(role_name,
      'deletion_receipt_private.accepted_requests','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'), 'receipt ACL widened');
    PERFORM pg_temp.assert_true(NOT has_table_privilege(role_name,
      'public.account_deletion_tombstones','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'), 'fence ACL widened');
  END LOOP;
END $$;
SET LOCAL ROLE anon;
SET LOCAL request.jwt.claim.role='service_role';
SELECT pg_temp.expect_error('SELECT deletion_receipt_private.guard_legacy_admission()', '42501');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_error('SELECT deletion_receipt_private.guard_receipt_admission()', '42501');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT pg_temp.expect_error('SELECT deletion_receipt_private.guard_legacy_admission()', '42501');
SELECT pg_temp.expect_error('SELECT * FROM deletion_receipt_private.accepted_requests', '42501');

-- New-first: both real legacy entrypoints must abort, never return true.
SELECT public.begin_account_deletion_receipt('de1e7104-0000-4000-9001-000000000001',
  'de1e7104-0000-4000-9002-000000000001',clock_timestamp(),gen_random_uuid(),
  'v1',decode(repeat('ab',32),'hex'),decode(repeat('cd',32),'hex'));
SELECT pg_temp.expect_error($q$SELECT public.begin_account_deletion('de1e7104-0000-4000-9001-000000000001',
  'de1e7104-0000-4000-9002-000000000001',clock_timestamp())$q$, '55000', 'receipt_request_in_progress');
SELECT pg_temp.expect_error($q$SELECT public.verify_account_deletion_session('de1e7104-0000-4000-9001-000000000001',
  'de1e7104-0000-4000-9002-000000000001',clock_timestamp())$q$, '55000', 'receipt_request_in_progress');

-- Legacy-first and legacy retry preserve the existing boolean contract.
SELECT pg_temp.assert_true(public.begin_account_deletion('de1e7104-0000-4000-9001-000000000002',
  'de1e7104-0000-4000-9002-000000000002',clock_timestamp()), 'legacy admission without receipt failed');
SELECT pg_temp.assert_true(public.verify_account_deletion_session('de1e7104-0000-4000-9001-000000000002',
  'de1e7104-0000-4000-9002-000000000002',clock_timestamp()), 'legacy retry failed');
SELECT pg_temp.expect_error($q$SELECT public.begin_account_deletion_receipt('de1e7104-0000-4000-9001-000000000002',
  'de1e7104-0000-4000-9002-000000000002',clock_timestamp(),gen_random_uuid(),
  'v1',decode(repeat('ab',32),'hex'),decode(repeat('cd',32),'hex'))$q$, '55000', 'receipt_legacy_fence_unresolved');
SELECT pg_temp.assert_true(NOT public.begin_account_deletion('de1e7104-0000-4000-9001-000000000003',
  'de1e7104-0000-4000-9002-000000000002',clock_timestamp()), 'foreign session accepted');
RESET ROLE;

-- The table boundary also rejects a trusted writer bypassing either facade.
SELECT pg_temp.expect_error($q$INSERT INTO public.account_deletion_tombstones(user_id,session_id)
  VALUES('de1e7104-0000-4000-9001-000000000001','de1e7104-0000-4000-9002-000000000001')$q$,
  '55000', 'receipt_request_in_progress');
SELECT pg_temp.expect_error($q$INSERT INTO deletion_receipt_private.accepted_requests
  (owner_id,session_id,request_id,key_version,lookup_hash,recovery_hash)
  VALUES('de1e7104-0000-4000-9001-000000000002','de1e7104-0000-4000-9002-000000000002',gen_random_uuid(),
  'v1',decode(repeat('ab',32),'hex'),decode(repeat('cd',32),'hex'))$q$, '55000', 'receipt_legacy_fence_unresolved');
SELECT pg_temp.expect_error($q$UPDATE public.account_deletion_tombstones
  SET user_id='de1e7104-0000-4000-9001-000000000003'
  WHERE user_id='de1e7104-0000-4000-9001-000000000002'$q$, '55000', 'receipt_owner_binding_immutable');
SELECT pg_temp.expect_error($q$UPDATE deletion_receipt_private.accepted_requests
  SET owner_id='de1e7104-0000-4000-9001-000000000003'
  WHERE owner_id='de1e7104-0000-4000-9001-000000000001'$q$, '55000', 'receipt_owner_binding_immutable');

SELECT pg_temp.assert_true((SELECT count(*)=1 FROM deletion_receipt_private.accepted_requests
  WHERE owner_id::text LIKE 'de1e7104-0000-4000-9001-%'), 'unexpected receipt count');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.account_deletion_tombstones
  WHERE user_id::text LIKE 'de1e7104-0000-4000-9001-%'), 'unexpected fence count');
SELECT pg_temp.assert_true((SELECT count(*)=4 FROM auth.users WHERE id::text LIKE 'de1e7104-0000-4000-9001-%')
  AND (SELECT count(*)=4 FROM public.users WHERE id::text LIKE 'de1e7104-0000-4000-9001-%'), 'admission deleted account data');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM deletion_receipt_private.accepted_requests r
  JOIN public.account_deletion_tombstones t ON r.owner_id=t.user_id), 'both admissions survived');
SELECT pg_temp.assert_true((SELECT public.lookup_account_deletion_receipt(receipt_id,key_version,lookup_hash)->>'state'='accepted'
  FROM deletion_receipt_private.accepted_requests WHERE owner_id='de1e7104-0000-4000-9001-000000000001'), 'false completion');
ROLLBACK;
