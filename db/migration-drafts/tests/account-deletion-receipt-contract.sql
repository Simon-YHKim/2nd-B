-- Run against the complete current migration tree plus the inactive draft.
BEGIN;
CREATE FUNCTION pg_temp.assert_true(ok boolean, message text) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION '%', message; END IF; END $$;
CREATE FUNCTION pg_temp.expect_error(statement text, expected_state text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = expected_state THEN RETURN; END IF;
    RAISE;
  END;
  RAISE EXCEPTION 'expected SQLSTATE %, statement succeeded', expected_state;
END $$;

DO $$ DECLARE role_name text; function_id regprocedure; BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    PERFORM pg_temp.assert_true(NOT has_table_privilege(role_name,
      'deletion_receipt_private.accepted_requests', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),
      'direct ledger privileges must be absent: ' || role_name);
    FOREACH function_id IN ARRAY ARRAY[
      'public.begin_account_deletion_receipt(uuid,uuid,timestamptz,uuid,text,bytea,bytea)'::regprocedure,
      'public.lookup_account_deletion_receipt(uuid,text,bytea)'::regprocedure,
      'deletion_receipt_private.begin_request(uuid,uuid,timestamptz,uuid,text,bytea,bytea)'::regprocedure,
      'deletion_receipt_private.lookup_request(uuid,text,bytea)'::regprocedure
    ] LOOP
      PERFORM pg_temp.assert_true(has_function_privilege(role_name,function_id,'EXECUTE') = (role_name = 'service_role'),
        'function ACL mismatch: ' || role_name || ' ' || function_id);
      PERFORM pg_temp.assert_true((SELECT proconfig @> ARRAY['search_path=""'] FROM pg_proc WHERE oid = function_id),
        'empty search_path required');
    END LOOP;
  END LOOP;
END $$;
SELECT pg_temp.assert_true((SELECT relrowsecurity AND relforcerowsecurity FROM pg_class
  WHERE oid = 'deletion_receipt_private.accepted_requests'::regclass), 'RLS defense missing');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM pg_constraint
  WHERE conrelid = 'deletion_receipt_private.accepted_requests'::regclass AND contype='f'), 'receipt must survive Auth cascade');
SELECT pg_temp.assert_true((SELECT NOT prosecdef FROM pg_proc
  WHERE oid='public.lookup_account_deletion_receipt(uuid,text,bytea)'::regprocedure), 'facade must be invoker');

INSERT INTO auth.users(id,email) VALUES
  ('de1e7104-0000-4000-8000-000000000001','receipt-a@example.invalid'),
  ('de1e7104-0000-4000-8000-000000000002','receipt-b@example.invalid');
INSERT INTO public.users(id,email,birth_date,locale) VALUES
  ('de1e7104-0000-4000-8000-000000000001','receipt-a@example.invalid','1990-01-01','en'),
  ('de1e7104-0000-4000-8000-000000000002','receipt-b@example.invalid','1990-01-01','en');
INSERT INTO auth.sessions(id,user_id) VALUES
  ('de1e7104-0000-4000-8000-000000000011','de1e7104-0000-4000-8000-000000000001'),
  ('de1e7104-0000-4000-8000-000000000012','de1e7104-0000-4000-8000-000000000002'),
  ('de1e7104-0000-4000-8000-000000000013','de1e7104-0000-4000-8000-000000000001');

SET LOCAL ROLE anon;
SET LOCAL request.jwt.claim.role='service_role';
SELECT pg_temp.expect_error($q$SELECT public.lookup_account_deletion_receipt(gen_random_uuid(),'v1',decode(repeat('ab',32),'hex'))$q$,'42501');
SELECT pg_temp.expect_error($q$SELECT * FROM deletion_receipt_private.accepted_requests$q$,'42501');
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims='{"role":"service_role","user_metadata":{"role":"service_role"}}';
SELECT pg_temp.expect_error($q$SELECT deletion_receipt_private.lookup_request(gen_random_uuid(),'v1',decode(repeat('ab',32),'hex'))$q$,'42501');
SELECT pg_temp.expect_error($q$SELECT public.begin_account_deletion_receipt(NULL,NULL,NULL,NULL,NULL,NULL,NULL)$q$,'42501');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT pg_temp.expect_error($q$SELECT * FROM deletion_receipt_private.accepted_requests$q$,'42501');
SET LOCAL request.jwt.claim.role='authenticated';
SELECT pg_temp.expect_error($q$SELECT public.lookup_account_deletion_receipt(gen_random_uuid(),'v1',decode(repeat('ab',32),'hex'))$q$,'42501');
SET LOCAL request.jwt.claim.role='service_role';

DO $$ DECLARE first_reply jsonb; replay jsonb; statement text; variant text; BEGIN
  statement := $q$SELECT public.begin_account_deletion_receipt(
    'de1e7104-0000-4000-8000-000000000001','de1e7104-0000-4000-8000-000000000011',clock_timestamp(),
    'de1e7104-0000-4000-8000-000000000021','v1',decode(repeat('ab',32),'hex'),decode(repeat('cd',32),'hex'))$q$;
  EXECUTE statement INTO first_reply;
  EXECUTE statement INTO replay;
  PERFORM pg_temp.assert_true(first_reply = replay, 'same request must return identical receipt');
  PERFORM pg_temp.assert_true(first_reply->>'state'='accepted'
    AND first_reply->'expiresAt'='null'::jsonb
    AND first_reply->'observations'='{"auth":"unknown","profile":"unknown","raw":"unknown","photos":"unknown"}'::jsonb,
    'accepted must not claim any deletion or invented expiry');
  PERFORM pg_temp.assert_true((SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(first_reply) AS key)
    = ARRAY['acceptedAt','expiresAt','observations','receiptId','scopeVersion','state','version'], 'projection leaked internal data');
  PERFORM pg_temp.assert_true(public.lookup_account_deletion_receipt((first_reply->>'receiptId')::uuid,'v1',decode(repeat('ab',32),'hex'))=first_reply,
    'lookup should return exact projection');
  PERFORM pg_temp.assert_true(public.lookup_account_deletion_receipt((first_reply->>'receiptId')::uuid,'v1',decode(repeat('cd',32),'hex'))->>'state'='not_found',
    'recovery purpose must not authorize lookup');
  PERFORM pg_temp.assert_true(public.lookup_account_deletion_receipt((first_reply->>'receiptId')::uuid,'v2',decode(repeat('ab',32),'hex'))->>'state'='not_found',
    'wrong key version must not authorize lookup');
  PERFORM pg_temp.assert_true(public.lookup_account_deletion_receipt(gen_random_uuid(),'v1',decode(repeat('ab',32),'hex'))->>'state'='not_found',
    'wrong receipt must not authorize lookup');
  PERFORM pg_temp.expect_error(replace(statement,'000000000011','000000000012'),'42501');
  PERFORM pg_temp.expect_error(replace(statement,'000000000011','000000000013'),'22023');
  PERFORM pg_temp.expect_error(replace(statement,'000000000021','000000000022'),'55000');
  PERFORM pg_temp.expect_error(replace(statement,'''v1''','''v2'''),'22023');
  PERFORM pg_temp.expect_error(replace(statement,'''ab''','''ef'''),'22023');
  PERFORM pg_temp.expect_error(replace(statement,'''cd''','''ef'''),'22023');
  PERFORM pg_temp.expect_error(replace(statement,'''cd''','''ab'''),'22023');
  PERFORM pg_temp.expect_error(replace(statement,'32','31'),'22023');
  PERFORM pg_temp.expect_error(replace(statement,'''v1''',''''''),'22023');
  PERFORM pg_temp.expect_error(replace(statement,'clock_timestamp()','NULL'),'22023');
  PERFORM pg_temp.expect_error(replace(statement,'clock_timestamp()','clock_timestamp()-interval ''6 minutes'''),'42501');
  PERFORM pg_temp.expect_error(replace(statement,'clock_timestamp()','clock_timestamp()+interval ''2 minutes'''),'42501');
END $$;
RESET ROLE;
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM deletion_receipt_private.accepted_requests), 'idempotency inserted extra rows');
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM auth.users WHERE id::text LIKE 'de1e7104-%')
  AND (SELECT count(*)=2 FROM public.users WHERE id::text LIKE 'de1e7104-%')
  AND NOT EXISTS(SELECT 1 FROM public.account_deletion_tombstones WHERE user_id::text LIKE 'de1e7104-%'), 'begin changed account or fence');
SELECT pg_temp.expect_error($q$UPDATE deletion_receipt_private.accepted_requests SET phase='completed'$q$,'23514');

-- A legacy operation remains distinct: begin cannot overwrite its fence.
SET LOCAL request.jwt.claim.role='service_role';
SELECT pg_temp.assert_true(public.begin_account_deletion('de1e7104-0000-4000-8000-000000000002',
 'de1e7104-0000-4000-8000-000000000012',clock_timestamp()),'legacy fixture failed');
SET LOCAL ROLE service_role;
SELECT pg_temp.expect_error($q$SELECT public.begin_account_deletion_receipt('de1e7104-0000-4000-8000-000000000002',
 'de1e7104-0000-4000-8000-000000000012',clock_timestamp(),'de1e7104-0000-4000-8000-000000000022',
 'v1',decode(repeat('ab',32),'hex'),decode(repeat('cd',32),'hex'))$q$,'55000');
RESET ROLE;

-- Profile-only deletion and Auth cascade cannot turn accepted into completed
-- or remove the receipt. These fixture deletes are not a new executor.
DELETE FROM public.users WHERE id='de1e7104-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true((SELECT phase='accepted' FROM deletion_receipt_private.accepted_requests), 'profile delete falsely completed receipt');
DELETE FROM auth.users WHERE id='de1e7104-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true((SELECT phase='accepted' FROM deletion_receipt_private.accepted_requests), 'Auth cascade lost or falsely completed receipt');
DO $$ DECLARE receipt uuid; BEGIN
  SELECT receipt_id INTO receipt FROM deletion_receipt_private.accepted_requests;
  PERFORM pg_temp.assert_true(public.lookup_account_deletion_receipt(receipt,'v1',decode(repeat('ab',32),'hex'))->>'state'='accepted',
    'signed-out service lookup must preserve accepted-only facts');
END $$;
ROLLBACK;
