-- Real database behavior. All synthetic accounts and observations roll back.
BEGIN;
CREATE FUNCTION pg_temp.assert_true(ok boolean, message text) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION '%',message; END IF; END $$;
CREATE FUNCTION pg_temp.expect_error(statement text, expected_message text) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN
  BEGIN EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE '%'||expected_message||'%' THEN RETURN; END IF; RAISE; END;
  RAISE EXCEPTION 'expected error %, statement succeeded',expected_message;
END $$;
CREATE FUNCTION pg_temp.owner(n int) RETURNS uuid LANGUAGE sql AS $$
  SELECT ('de1e7104-0000-4000-9201-'||lpad(n::text,12,'0'))::uuid;
$$;
CREATE FUNCTION pg_temp.session(n int) RETURNS uuid LANGUAGE sql AS $$
  SELECT ('de1e7104-0000-4000-9202-'||lpad(n::text,12,'0'))::uuid;
$$;
INSERT INTO auth.users(id,email) SELECT pg_temp.owner(n),'terminal-'||n||'@example.invalid' FROM generate_series(1,12) n;
INSERT INTO public.users(id,email,birth_date,locale)
SELECT pg_temp.owner(n),'terminal-'||n||'@example.invalid','1990-01-01','en' FROM generate_series(1,12) n;
INSERT INTO auth.sessions(id,user_id) SELECT pg_temp.session(n),pg_temp.owner(n) FROM generate_series(1,12) n;
SET LOCAL request.jwt.claim.role='service_role';
SELECT public.begin_account_deletion_receipt(pg_temp.owner(n),pg_temp.session(n),clock_timestamp(),pg_temp.owner(n),
  'v1',decode(repeat('ab',32),'hex'),decode(repeat('cd',32),'hex')) FROM generate_series(1,9) n;
-- Expired, unstarted is the only timeout that releases arbitration.
INSERT INTO deletion_receipt_private.accepted_requests(operation_id,owner_id,session_id,request_id,key_version,lookup_hash,recovery_hash,
  accepted_at,admission_expires_at)
SELECT pg_temp.owner(n),pg_temp.owner(n),pg_temp.session(n),pg_temp.owner(n),'v1',decode(repeat('ab',32),'hex'),
  decode(repeat('cd',32),'hex'),clock_timestamp()-interval '11 minutes',clock_timestamp()-interval '1 minute'
FROM generate_series(10,11) n;

CREATE FUNCTION pg_temp.transition(n int,action text,token uuid DEFAULT NULL,seen timestamptz DEFAULT NULL,
  raw_empty boolean DEFAULT false,photos_empty boolean DEFAULT false,drained boolean DEFAULT false)
RETURNS jsonb LANGUAGE sql AS $$
 SELECT deletion_receipt_private.transition_request(r.operation_id,r.owner_id,token,action,seen,raw_empty,photos_empty,drained)
 FROM deletion_receipt_private.accepted_requests r WHERE r.owner_id=pg_temp.owner(n) AND r.request_id=pg_temp.owner(n);
$$;

DO $$ DECLARE role_name text; BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    PERFORM pg_temp.assert_true(NOT has_table_privilege(role_name,'deletion_receipt_private.accepted_requests',
      'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),'receipt table exposed');
    PERFORM pg_temp.assert_true(NOT has_function_privilege(role_name,
      'deletion_receipt_private.expire_unstarted(uuid)','EXECUTE'),'expiry helper exposed');
    PERFORM pg_temp.assert_true(has_function_privilege(role_name,
      'deletion_receipt_private.transition_request(uuid,uuid,uuid,text,timestamptz,boolean,boolean,boolean)','EXECUTE')
      = (role_name='service_role'),'transition ACL wrong');
  END LOOP;
END $$;
SET LOCAL ROLE service_role;
SET LOCAL request.jwt.claim.role='authenticated';
SELECT pg_temp.expect_error($q$SELECT deletion_receipt_private.transition_request(pg_temp.owner(1),pg_temp.owner(1),NULL,'failed')$q$,
  'receipt_service_required');
RESET ROLE;
SET LOCAL request.jwt.claim.role='service_role';
SELECT pg_temp.assert_true(pg_temp.transition(1,'failed')->>'state'='failed','prestart failure missing');
SELECT pg_temp.assert_true(pg_temp.transition(2,'abandoned')->>'state'='abandoned','prestart abandonment missing');
SELECT pg_temp.assert_true(public.begin_account_deletion(pg_temp.owner(1),pg_temp.session(1),clock_timestamp()),'failed blocks legacy');
SELECT pg_temp.assert_true(public.verify_account_deletion_session(pg_temp.owner(2),pg_temp.session(2),clock_timestamp()),'abandoned blocks legacy');
SELECT pg_temp.assert_true(public.begin_account_deletion(pg_temp.owner(10),pg_temp.session(10),clock_timestamp()),'expired blocks legacy');
SELECT pg_temp.assert_true((SELECT phase='abandoned' FROM deletion_receipt_private.accepted_requests WHERE owner_id=pg_temp.owner(10)),
  'expiry not persisted');
SELECT pg_temp.assert_true(pg_temp.transition(11,'start',pg_temp.owner(11))->>'state'='abandoned','expired start resurrected');
SELECT pg_temp.assert_true(pg_temp.transition(2,'start',pg_temp.owner(2))->>'state'='abandoned','terminal start resurrected');

SELECT pg_temp.assert_true(pg_temp.transition(3,'start',pg_temp.owner(3))->>'state'='executing','start missing');
SELECT pg_temp.assert_true(pg_temp.transition(3,'start',pg_temp.owner(3))->>'state'='executing','same start not idempotent');
SELECT pg_temp.expect_error($q$SELECT pg_temp.transition(3,'start',pg_temp.owner(4))$q$,'receipt_execution_mismatch');
SELECT pg_temp.expect_error($q$SELECT pg_temp.transition(3,'failed')$q$,'receipt_execution_unresolved');
SELECT pg_temp.expect_error($q$SELECT pg_temp.transition(3,'abandoned')$q$,'receipt_execution_unresolved');
SELECT pg_temp.expect_error($q$SELECT public.begin_account_deletion(pg_temp.owner(3),pg_temp.session(3),clock_timestamp())$q$,
  'receipt_request_in_progress');
SELECT pg_temp.expect_error($q$SELECT pg_temp.transition(3,'completed',pg_temp.owner(3),clock_timestamp(),true,true,true)$q$,'receipt_completion_unconfirmed');
-- Profile absence alone cannot confirm Auth hard deletion (including soft delete).
-- Preserve the valid full-schema row before disabling FK triggers below. Rebuilding
-- four columns would skip the real tier initializer and fail users_active_has_tier.
CREATE TEMP TABLE saved_terminal_profile AS SELECT * FROM public.users WHERE id=pg_temp.owner(3);
DELETE FROM public.users WHERE id=pg_temp.owner(3);
UPDATE auth.users SET deleted_at=clock_timestamp() WHERE id=pg_temp.owner(3);
SELECT pg_temp.expect_error($q$SELECT pg_temp.transition(3,'completed',pg_temp.owner(3),clock_timestamp(),true,true,true)$q$,'receipt_completion_unconfirmed');
DELETE FROM auth.users WHERE id=pg_temp.owner(3);
-- Synthetic broken-cascade fixture: observe the profile independently even if Auth is gone.
SET LOCAL session_replication_role=replica;
INSERT INTO public.users SELECT * FROM saved_terminal_profile;
SET LOCAL session_replication_role=origin;
SELECT pg_temp.expect_error($q$SELECT pg_temp.transition(3,'completed',pg_temp.owner(3),clock_timestamp(),true,true,true)$q$,'receipt_completion_unconfirmed');
DELETE FROM public.users WHERE id=pg_temp.owner(3);
SELECT pg_temp.expect_error($q$SELECT pg_temp.transition(3,'completed',pg_temp.owner(4),clock_timestamp(),true,true,true)$q$,'receipt_execution_mismatch');
SELECT pg_temp.expect_error($q$SELECT pg_temp.transition(3,'completed',pg_temp.owner(3),clock_timestamp(),false,true,true)$q$,'receipt_completion_unconfirmed');
SELECT pg_temp.expect_error($q$SELECT pg_temp.transition(3,'completed',pg_temp.owner(3),clock_timestamp(),true,false,true)$q$,'receipt_completion_unconfirmed');
SELECT pg_temp.expect_error($q$SELECT pg_temp.transition(3,'completed',pg_temp.owner(3),clock_timestamp(),true,true,false)$q$,'receipt_completion_unconfirmed');
SELECT pg_temp.expect_error($q$SELECT pg_temp.transition(3,'completed',pg_temp.owner(3),NULL,true,true,true)$q$,'receipt_completion_unconfirmed');
SELECT pg_temp.expect_error($q$SELECT pg_temp.transition(3,'completed',pg_temp.owner(3),clock_timestamp()-interval '1 hour',true,true,true)$q$,'receipt_completion_unconfirmed');
SELECT pg_temp.expect_error($q$SELECT pg_temp.transition(3,'completed',pg_temp.owner(3),clock_timestamp()+interval '1 hour',true,true,true)$q$,'receipt_completion_unconfirmed');
SELECT pg_temp.assert_true(pg_temp.transition(3,'completed',pg_temp.owner(3),clock_timestamp(),true,true,true)->>'state'='completed',
  'independent evidence not completed');
-- Completed does not veto a fence writer; real legacy authentication still refuses absent users.
INSERT INTO public.account_deletion_tombstones(user_id,session_id) VALUES(pg_temp.owner(3),pg_temp.session(3));
SELECT pg_temp.assert_true(pg_temp.transition(3,'failed')->>'state'='completed','terminal changed');
SELECT pg_temp.assert_true((SELECT receipt_expires_at=finished_at+interval '365 days'
  FROM deletion_receipt_private.accepted_requests WHERE owner_id=pg_temp.owner(3)),'completed retention wrong');
SELECT pg_temp.assert_true((SELECT receipt_expires_at=finished_at+interval '30 days'
  FROM deletion_receipt_private.accepted_requests WHERE owner_id=pg_temp.owner(1)),'failed retention wrong');
SELECT pg_temp.assert_true((SELECT public.lookup_account_deletion_receipt(receipt_id,key_version,lookup_hash)->>'state'='completed'
  FROM deletion_receipt_private.accepted_requests WHERE owner_id=pg_temp.owner(3)),'lookup omitted terminal');
SELECT pg_temp.assert_true((SELECT public.lookup_account_deletion_receipt(receipt_id,key_version,recovery_hash)->>'state'='not_found'
  FROM deletion_receipt_private.accepted_requests WHERE owner_id=pg_temp.owner(3)),'recovery capability used for lookup');
SELECT pg_temp.transition(8,'abandoned');
SELECT pg_temp.expect_error($q$UPDATE deletion_receipt_private.accepted_requests SET phase='accepted',finished_at=NULL,receipt_expires_at=NULL
  WHERE owner_id=pg_temp.owner(8)$q$,'receipt_terminal_immutable');
SELECT pg_temp.expect_error($q$UPDATE deletion_receipt_private.accepted_requests SET phase='accepted',finished_at=NULL,receipt_expires_at=NULL
  WHERE owner_id=pg_temp.owner(1)$q$,'receipt_terminal_immutable');
SELECT pg_temp.expect_error($q$UPDATE deletion_receipt_private.accepted_requests SET execution_id=gen_random_uuid()
  WHERE owner_id=pg_temp.owner(3)$q$,'receipt_terminal_immutable');
SELECT pg_temp.expect_error($q$UPDATE deletion_receipt_private.accepted_requests SET session_id=gen_random_uuid()
  WHERE owner_id=pg_temp.owner(4)$q$,'receipt_binding_immutable');
-- Retained negative receipt + new request can coexist; the old request returns its original terminal.
SELECT pg_temp.transition(4,'failed');
SELECT pg_temp.assert_true(public.begin_account_deletion_receipt(pg_temp.owner(4),pg_temp.session(4),clock_timestamp(),pg_temp.owner(4),
  'v1',decode(repeat('ab',32),'hex'),decode(repeat('cd',32),'hex'))->>'state'='failed','retry recreated terminal');
SELECT public.begin_account_deletion_receipt(pg_temp.owner(4),pg_temp.session(4),clock_timestamp(),gen_random_uuid(),
  'v1',decode(repeat('aa',32),'hex'),decode(repeat('cc',32),'hex'));
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM deletion_receipt_private.accepted_requests WHERE owner_id=pg_temp.owner(4)),
  'new admission overwrote retained receipt');
SELECT pg_temp.expect_error($q$SELECT public.begin_account_deletion(pg_temp.owner(4),pg_temp.session(4),clock_timestamp())$q$,
  'receipt_request_in_progress');
SELECT pg_temp.assert_true(deletion_receipt_private.purge_terminal_requests()=0,'purged unexpired or unresolved receipt');
-- Terminal cleanup removes only aged negatives, retaining all unresolved executions.
INSERT INTO deletion_receipt_private.accepted_requests(owner_id,session_id,request_id,key_version,lookup_hash,recovery_hash,
  accepted_at,admission_expires_at)
VALUES(pg_temp.owner(12),pg_temp.session(12),pg_temp.owner(12),'v1',decode(repeat('ab',32),'hex'),
  decode(repeat('cd',32),'hex'),clock_timestamp()-interval '40 days',clock_timestamp()-interval '39 days');
UPDATE deletion_receipt_private.accepted_requests SET phase='failed',finished_at=accepted_at+interval '1 hour',
  receipt_expires_at=accepted_at+interval '1 hour 30 days' WHERE owner_id=pg_temp.owner(12);
SELECT pg_temp.assert_true((SELECT public.lookup_account_deletion_receipt(receipt_id,key_version,lookup_hash)->>'state'='not_found'
  FROM deletion_receipt_private.accepted_requests WHERE owner_id=pg_temp.owner(12)),'expired lookup visible');
SELECT pg_temp.assert_true(deletion_receipt_private.purge_terminal_requests()=1,'terminal purge count wrong');
ROLLBACK;
