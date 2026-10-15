-- Real PostgreSQL roles, constraints, triggers and rows; every fixture rolls back.
BEGIN;
CREATE FUNCTION pg_temp.uid(n integer,kind integer DEFAULT 1) RETURNS uuid LANGUAGE sql IMMUTABLE
AS $$ SELECT ('1a161600-0000-4000-800'||kind||'-'||lpad(n::text,12,'0'))::uuid $$;
CREATE FUNCTION pg_temp.check(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL %',label; END IF; END $$;
CREATE FUNCTION pg_temp.reject(statement text,expected_state text,expected_message text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE rejected boolean:=false;
BEGIN
  BEGIN EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN
    rejected:=true;
    IF SQLSTATE<>expected_state OR (expected_message IS NOT NULL AND position(expected_message IN SQLERRM)=0) THEN
      RAISE EXCEPTION 'wrong rejection: % %',SQLSTATE,SQLERRM;
    END IF;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'expected rejection: %',statement; END IF;
END $$;
CREATE FUNCTION pg_temp.open_work(n integer,k integer DEFAULT NULL) RETURNS jsonb LANGUAGE sql VOLATILE AS $$
  SELECT public.open_interview_work(pg_temp.uid(n),pg_temp.uid(n,2),clock_timestamp()+interval '1 hour',
    pg_temp.uid(COALESCE(k,n),3),pg_temp.uid(n,4),'now','en','es',false)
$$;
CREATE FUNCTION pg_temp.private_open(n integer) RETURNS jsonb LANGUAGE sql VOLATILE AS $$
  SELECT interview_authority_private.request('open',pg_temp.uid(n),pg_temp.uid(n,2),clock_timestamp()+interval '1 hour',
    jsonb_build_object('newWorkKey',pg_temp.uid(n,3),'draftId',pg_temp.uid(n,4),'period','now',
      'conversationLocale','en','uiLanguage','es','growthOrigin',false))
$$;
CREATE FUNCTION pg_temp.reserve_work(n integer,k integer DEFAULT NULL,digest text DEFAULT repeat('ab',32))
RETURNS jsonb LANGUAGE plpgsql VOLATILE AS $$
DECLARE w jsonb;
BEGIN
  w:=pg_temp.open_work(n);
  RETURN public.reserve_interview_save(pg_temp.uid(n),pg_temp.uid(n,2),clock_timestamp()+interval '1 hour',
    (w->>'workId')::uuid,(w->>'generation')::uuid,pg_temp.uid(COALESCE(k,n),5),7,decode(digest,'hex'),
    pg_temp.uid(n,4),'now','en','es',false);
END $$;
INSERT INTO auth.users(id,email) SELECT pg_temp.uid(n),'authority-'||n||'@example.invalid' FROM generate_series(1,30)n;
INSERT INTO public.users(id,email,birth_date,locale)
SELECT pg_temp.uid(n),'authority-'||n||'@example.invalid','1990-01-01','en' FROM generate_series(1,30)n;
INSERT INTO auth.sessions(id,user_id) SELECT pg_temp.uid(n,2),pg_temp.uid(n) FROM generate_series(1,30)n;

DO $$
DECLARE r text; t text; f regprocedure;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    FOREACH t IN ARRAY ARRAY['interview_content_authority','interview_content_wipes','interview_work_contracts'] LOOP
      PERFORM pg_temp.check(NOT has_table_privilege(r,'public.'||t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),'no direct table privilege '||r||t);
    END LOOP;
    PERFORM pg_temp.check(NOT has_table_privilege(r,'public.interview_sessions','INSERT')
      AND NOT has_table_privilege(r,'public.interview_session_starts','INSERT,UPDATE'),'legacy same-owner invisible INSERT is not a direct client/service capability');
    FOR f IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE (n.nspname='interview_authority_private' AND p.proname='request') OR
        (n.nspname='public' AND p.proname IN ('open_interview_work','inspect_interview_authority',
          'begin_interview_content_wipe','inspect_interview_content_wipe','reserve_interview_save','lookup_interview_save')) LOOP
      PERFORM pg_temp.check(has_function_privilege(r,f,'EXECUTE')=(r='service_role'),'entry ACL '||r||f);
    END LOOP;
    PERFORM pg_temp.check(NOT has_function_privilege(r,'interview_authority_private.acquire_access(uuid,uuid,timestamptz,boolean)','EXECUTE')
      AND NOT has_function_privilege(r,'interview_authority_private.recheck_access(uuid,uuid,timestamptz)','EXECUTE'),'internal helper ACL');
    PERFORM pg_temp.check(has_schema_privilege(r,'interview_authority_private','USAGE')=(r='service_role')
      AND NOT has_schema_privilege(r,'interview_authority_private','CREATE'),'schema ACL');
  END LOOP;
  PERFORM pg_temp.check((SELECT count(*)=3 FROM pg_class WHERE oid=ANY(ARRAY[
    'public.interview_content_authority'::regclass,'public.interview_content_wipes'::regclass,
    'public.interview_work_contracts'::regclass]) AND relrowsecurity AND relforcerowsecurity),'FORCE RLS');
  PERFORM pg_temp.check((SELECT count(*)=6 AND bool_and(NOT prosecdef) FROM pg_proc
    WHERE pronamespace='public'::regnamespace AND proname IN ('open_interview_work','inspect_interview_authority',
    'begin_interview_content_wipe','inspect_interview_content_wipe','reserve_interview_save','lookup_interview_save')),'six INVOKER facades');
  PERFORM pg_temp.check((SELECT bool_and(prosecdef AND proconfig @> ARRAY['search_path=""']) FROM pg_proc
    WHERE pronamespace='interview_authority_private'::regnamespace),'private definer empty search path');
END $$;
SET LOCAL request.jwt.claim.role='service_role';
SET LOCAL ROLE anon;
SELECT pg_temp.reject('SELECT pg_temp.open_work(1)','42501');
SELECT pg_temp.reject('SELECT pg_temp.private_open(1)','42501');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_temp.reject('SELECT pg_temp.open_work(1)','42501');
SELECT pg_temp.reject('SELECT pg_temp.private_open(1)','42501');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT pg_temp.reject('SELECT * FROM public.interview_work_contracts','42501');
SET LOCAL request.jwt.claim.role='';
SET LOCAL request.jwt.claims='{}';
SELECT pg_temp.reject('SELECT pg_temp.open_work(1)','42501','service_required');
SELECT pg_temp.reject('SELECT pg_temp.private_open(1)','42501','service_required');
SET LOCAL request.jwt.claim.role='authenticated';
SELECT pg_temp.reject('SELECT pg_temp.open_work(1)','42501','service_required');
SELECT pg_temp.reject('SELECT pg_temp.private_open(1)','42501','service_required');
SET LOCAL request.jwt.claim.role='';
SET LOCAL request.jwt.claims='{invalid';
SELECT pg_temp.reject('SELECT pg_temp.open_work(1)','42501','service_required');
SELECT pg_temp.reject('SELECT pg_temp.private_open(1)','42501','service_required');
SET LOCAL request.jwt.claims='{}';
SET LOCAL request.jwt.claim.role='service_role';
SET LOCAL request.jwt.claims='{invalid';
SELECT pg_temp.reject('SELECT pg_temp.private_open(1)','42501','service_required');
SET LOCAL request.jwt.claims='{"role":"authenticated"}';
SELECT pg_temp.reject('SELECT pg_temp.private_open(1)','42501','service_required');
SET LOCAL request.jwt.claims='{}';
SELECT pg_temp.check(pg_temp.open_work(1)->>'state'='ready','valid facade');
SELECT pg_temp.check(pg_temp.private_open(2)->>'state'='ready','valid direct helper validates itself');
SELECT pg_temp.reject($q$SELECT public.open_interview_work(pg_temp.uid(3),pg_temp.uid(4,2),clock_timestamp()+interval '1 hour',
  pg_temp.uid(3,3),pg_temp.uid(3,4),'now','en','es',false)$q$,'42501','live_session_required');
SELECT pg_temp.reject($q$SELECT interview_authority_private.request('inspect',pg_temp.uid(3),pg_temp.uid(4,2),clock_timestamp()+interval '1 hour',
  '{"workId":null}')$q$,'42501','live_session_required');
SELECT pg_temp.reject($q$SELECT public.inspect_interview_authority(pg_temp.uid(3),pg_temp.uid(3,2),clock_timestamp(),NULL)$q$,'42501','live_session_required');
SELECT pg_temp.reject($q$SELECT public.inspect_interview_authority(pg_temp.uid(3),pg_temp.uid(3,2),'infinity',NULL)$q$,'42501','live_session_required');
SELECT pg_temp.reject($q$SELECT interview_authority_private.request('inspect',pg_temp.uid(3),pg_temp.uid(3,2),clock_timestamp()+interval '1 hour','{"workId":null,"extra":1}')$q$,'22023','invalid_input');
SELECT pg_temp.reject($q$SELECT interview_authority_private.request('inspect',pg_temp.uid(3),pg_temp.uid(3,2),clock_timestamp()+interval '1 hour','{}')$q$,'22023','invalid_input');
SELECT pg_temp.reject($q$SELECT public.open_interview_work(pg_temp.uid(3),pg_temp.uid(3,2),clock_timestamp()+interval '1 hour',
  pg_temp.uid(3,3),pg_temp.uid(3,4),'now','ko','es',false)$q$,'22023','invalid_identity');
SELECT pg_temp.check(public.inspect_interview_authority(pg_temp.uid(3),pg_temp.uid(3,2),clock_timestamp()+interval '1 hour',NULL)->>'state'='unconfirmed','read does not initialize');
RESET ROLE;
UPDATE auth.users SET deleted_at=clock_timestamp() WHERE id=pg_temp.uid(3);
SET LOCAL ROLE service_role;
SELECT pg_temp.reject('SELECT pg_temp.private_open(3)','42501','live_session_required');
RESET ROLE;
UPDATE auth.users SET deleted_at=NULL WHERE id=pg_temp.uid(3);
INSERT INTO public.account_deletion_tombstones(user_id,session_id,deletion_started_at,last_requested_at)
VALUES(pg_temp.uid(4),pg_temp.uid(4,2),clock_timestamp(),clock_timestamp());
SET LOCAL ROLE service_role;
SELECT pg_temp.reject('SELECT pg_temp.open_work(4)','42501','account_closed');
RESET ROLE;
SELECT pg_temp.check(NOT EXISTS(SELECT 1 FROM public.interview_content_authority WHERE owner_id IN(pg_temp.uid(3),pg_temp.uid(4))), 'invalid callers effect 0');

-- Same key before cap, identity conflict, no timestamp/6h extension.
CREATE TEMP TABLE original_work AS SELECT * FROM public.interview_work_contracts WHERE owner_id=pg_temp.uid(1);
CREATE TEMP TABLE original_session AS SELECT * FROM public.interview_sessions WHERE owner_id=pg_temp.uid(1);
INSERT INTO public.interview_session_starts(owner_id,bucket_start,created)
VALUES(pg_temp.uid(1),date_bin(interval '10 minutes',clock_timestamp(),timestamptz '2000-01-01'),30)
ON CONFLICT(owner_id,bucket_start) DO UPDATE SET created=30;
SET LOCAL ROLE service_role;
SELECT pg_temp.check(pg_temp.open_work(1)->>'state'='ready','same key survives cap');
SELECT pg_temp.check(pg_temp.open_work(1,101)->>'state'='rate_limited','new key cap');
SELECT pg_temp.reject($q$SELECT public.open_interview_work(pg_temp.uid(1),pg_temp.uid(1,2),clock_timestamp()+interval '1 hour',
  pg_temp.uid(1,3),pg_temp.uid(999,4),'now','en','es',false)$q$,'22023','binding_conflict');
RESET ROLE;
SELECT pg_temp.check((SELECT to_jsonb(w)=to_jsonb(o) FROM public.interview_work_contracts w JOIN original_work o USING(session_id)),'replay work immutable');
SELECT pg_temp.check((SELECT to_jsonb(s)=to_jsonb(o) FROM public.interview_sessions s JOIN original_session o USING(id)),'replay session immutable');
SELECT pg_temp.check((SELECT sum(created)=30 FROM public.interview_session_starts WHERE owner_id=pg_temp.uid(1)),'cap replay count unchanged');

-- Exactly thirty physical INSERT triggers, including the thirtieth.
SET LOCAL ROLE service_role;
DO $$ BEGIN FOR i IN 1..30 LOOP
  PERFORM pg_temp.check(pg_temp.open_work(5,500+i)->>'state'='ready','start <=30');
END LOOP;
PERFORM pg_temp.check(pg_temp.open_work(5,531)->>'state'='rate_limited','start 31 blocked'); END $$;
RESET ROLE;
SELECT pg_temp.check((SELECT count(*)=30 FROM public.interview_work_contracts WHERE owner_id=pg_temp.uid(5))
  AND (SELECT count(*)=30 FROM public.interview_sessions WHERE owner_id=pg_temp.uid(5))
  AND (SELECT sum(created)=30 FROM public.interview_session_starts WHERE owner_id=pg_temp.uid(5)),'30/31 actual work/session/count');

-- Existing date_bin inclusivity is retained, not rewritten as rolling events.
INSERT INTO public.interview_session_starts(owner_id,bucket_start,created) VALUES
  (pg_temp.uid(6),date_bin(interval '10 minutes',clock_timestamp()-interval '1 hour',timestamptz '2000-01-01'),30),
  (pg_temp.uid(7),date_bin(interval '10 minutes',clock_timestamp()-interval '1 hour',timestamptz '2000-01-01')-interval '10 minutes',30);
SET LOCAL ROLE service_role;
SELECT pg_temp.check(pg_temp.open_work(6)->>'state'='rate_limited','inclusive oldest bucket');
SELECT pg_temp.check(pg_temp.open_work(7)->>'state'='ready','previous bucket excluded');
RESET ROLE;
SELECT pg_temp.check(NOT EXISTS(SELECT 1 FROM public.interview_content_authority WHERE owner_id=pg_temp.uid(6)),'cap denied initialization 0');
SELECT pg_temp.check((SELECT w.created_at=s.started_at AND s.started_at=s.last_seen_at
  AND c.bucket_start=date_bin(interval '10 minutes',w.created_at,timestamptz '2000-01-01')
  FROM public.interview_work_contracts w JOIN public.interview_sessions s ON s.id=w.session_id
  JOIN public.interview_session_starts c ON c.owner_id=w.owner_id AND c.created=1 WHERE w.owner_id=pg_temp.uid(7)),'one admission timestamp and actual trigger bucket');

-- reserve is metadata only, one immutable slot; same owner may use a new Auth session.
SET LOCAL ROLE service_role;
SELECT pg_temp.check(pg_temp.reserve_work(8)->>'state'='reserved','reserve ACK is reserved, never committed');
SELECT pg_temp.check(pg_temp.reserve_work(8)->>'saveState'='reserved','reserve replay');
SELECT pg_temp.reject('SELECT pg_temp.reserve_work(8,81)','22023','save_binding_conflict');
SELECT pg_temp.reject($q$SELECT pg_temp.reserve_work(8,8,repeat('cd',32))$q$,'22023','save_binding_conflict');
RESET ROLE;
SELECT pg_temp.check((SELECT sum(created)=1 FROM public.interview_session_starts WHERE owner_id=pg_temp.uid(8))
  AND NOT EXISTS(SELECT 1 FROM public.records WHERE user_id=pg_temp.uid(8))
  AND NOT EXISTS(SELECT 1 FROM public.interview_probe_verdicts v JOIN public.interview_sessions s
    ON s.id=v.session_id WHERE s.owner_id=pg_temp.uid(8)),'reserve side effects limited');
INSERT INTO auth.sessions(id,user_id) VALUES(pg_temp.uid(88,2),pg_temp.uid(8));
SET LOCAL ROLE service_role;
SELECT pg_temp.check(public.lookup_interview_save(pg_temp.uid(8),pg_temp.uid(88,2),clock_timestamp()+interval '1 hour',
  (pg_temp.open_work(8)->>'workId')::uuid,pg_temp.uid(8,5))->>'saveState'='reserved','new Auth session can lookup immutable work');
SELECT pg_temp.check(public.inspect_interview_authority(pg_temp.uid(9),pg_temp.uid(9,2),clock_timestamp()+interval '1 hour',
  (pg_temp.open_work(8)->>'workId')::uuid)->>'state'='not_found','cross owner invisible');
RESET ROLE;

-- S1 does not pretend legacy close is S2 work integration; this proves count +0 only.
SET LOCAL request.jwt.claim.sub='1a161600-0000-4000-8001-000000000008';
SET LOCAL ROLE authenticated;
SELECT public.close_interview_session((SELECT id FROM public.interview_sessions WHERE owner_id=pg_temp.uid(8)), 'now','en','user_end',0,0);
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT pg_temp.check(pg_temp.reserve_work(8)->>'workState'='ended','ended remains distinct from folded');
RESET ROLE;
SELECT pg_temp.check((SELECT sum(created)=1 FROM public.interview_session_starts WHERE owner_id=pg_temp.uid(8)),'legacy close +0');

-- Missing/folded/stale work never regains a session even after legacy tombstone pruning.
SET LOCAL ROLE service_role;
SELECT pg_temp.open_work(9);
SELECT pg_temp.open_work(10);
RESET ROLE;
DELETE FROM public.interview_sessions WHERE owner_id=pg_temp.uid(9);
DELETE FROM public.interview_session_tombstones WHERE session_id=(SELECT session_id FROM public.interview_work_contracts WHERE owner_id=pg_temp.uid(9));
UPDATE public.interview_sessions SET last_seen_at=clock_timestamp()-interval '6 hours 1 second' WHERE owner_id=pg_temp.uid(10);
SET LOCAL ROLE service_role;
SELECT pg_temp.check(pg_temp.open_work(9)->>'state'='closed','missing session old key closed');
SELECT pg_temp.check(pg_temp.reserve_work(9)->>'saveState'='none','missing session reserve 0');
SELECT pg_temp.check(pg_temp.open_work(10)->>'state'='closed','six hour expiry no restart');
SELECT pg_temp.check(pg_temp.reserve_work(10)->>'saveState'='none','stale reserve 0');
RESET ROLE;
SELECT pg_temp.check(NOT EXISTS(SELECT 1 FROM public.interview_sessions WHERE owner_id=pg_temp.uid(9))
  AND (SELECT sum(created)=1 FROM public.interview_session_starts WHERE owner_id=pg_temp.uid(9)),'no recreate or rewind');

-- Barrier CAS/idempotency, old work isolation and zero actual deletions/completion.
SET LOCAL ROLE service_role;
SELECT pg_temp.open_work(11);
RESET ROLE;
CREATE TEMP TABLE before_barrier AS SELECT generation FROM public.interview_content_authority WHERE owner_id=pg_temp.uid(11);
GRANT SELECT ON before_barrier TO service_role;
SET LOCAL ROLE service_role;
SELECT public.begin_interview_content_wipe(pg_temp.uid(11),pg_temp.uid(11,2),clock_timestamp()+interval '1 hour',pg_temp.uid(11,6),
  (SELECT generation FROM before_barrier),'t16-barrier-v1');
SELECT pg_temp.check(public.begin_interview_content_wipe(pg_temp.uid(11),pg_temp.uid(11,2),clock_timestamp()+interval '1 hour',pg_temp.uid(11,6),
  (SELECT generation FROM before_barrier),'t16-barrier-v1')->>'state'='barrier_committed','wipe replay checks original binding first');
SELECT pg_temp.reject($q$SELECT public.begin_interview_content_wipe(pg_temp.uid(11),pg_temp.uid(11,2),clock_timestamp()+interval '1 hour',pg_temp.uid(11,6),
  (SELECT generation FROM before_barrier),'different-scope')$q$,'22023','wipe_binding_conflict');
SELECT pg_temp.check(pg_temp.open_work(11)->>'state'='closed','old key old generation closed');
SELECT pg_temp.check(pg_temp.open_work(11,111)->>'state'='wipe_pending','new work blocked');
SELECT pg_temp.check(pg_temp.reserve_work(11)->>'saveState'='none','old generation reserve 0');
SELECT pg_temp.check(public.inspect_interview_content_wipe(pg_temp.uid(11),pg_temp.uid(11,2),clock_timestamp()+interval '1 hour',pg_temp.uid(11,6))->>'observation'='not_executed','no false completed');
RESET ROLE;
SELECT pg_temp.check((SELECT revision=1 AND phase='wipe_pending' AND write_protocol='legacy' FROM public.interview_content_authority WHERE owner_id=pg_temp.uid(11))
  AND (SELECT count(*)=1 FROM public.interview_content_wipes WHERE owner_id=pg_temp.uid(11))
  AND (SELECT count(*)=1 FROM public.interview_sessions WHERE owner_id=pg_temp.uid(11))
  AND (SELECT sum(created)=1 FROM public.interview_session_starts WHERE owner_id=pg_temp.uid(11)),'barrier only; no deletion/rewind/activation');

-- A forced AFTER INSERT failure occurs after the real count trigger. PostgreSQL
-- rolls authority/work/session/count back together; no fake failure callback.
CREATE FUNCTION pg_temp.fail_after_session() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF NEW.owner_id=pg_temp.uid(12) THEN RAISE EXCEPTION 'forced_after_insert'; END IF; RETURN NULL; END $$;
CREATE TRIGGER zz_authority_test_failure AFTER INSERT ON public.interview_sessions
FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_after_session();
SET LOCAL ROLE service_role;
SELECT pg_temp.reject('SELECT pg_temp.open_work(12)','P0001','forced_after_insert');
RESET ROLE;
SELECT pg_temp.check(NOT EXISTS(SELECT 1 FROM public.interview_content_authority WHERE owner_id=pg_temp.uid(12))
  AND NOT EXISTS(SELECT 1 FROM public.interview_work_contracts WHERE owner_id=pg_temp.uid(12))
  AND NOT EXISTS(SELECT 1 FROM public.interview_sessions WHERE owner_id=pg_temp.uid(12))
  AND NOT EXISTS(SELECT 1 FROM public.interview_session_starts WHERE owner_id=pg_temp.uid(12)),'insert failure atomic rollback');
DROP TRIGGER zz_authority_test_failure ON public.interview_sessions;

-- Actual account cascade destroys all three control tables. Content erasure is
-- not invoked here: its executor and digest erasure hooks are S2 blockers.
DELETE FROM auth.users WHERE id=pg_temp.uid(11);
SELECT pg_temp.check(NOT EXISTS(SELECT 1 FROM public.interview_content_authority WHERE owner_id=pg_temp.uid(11))
  AND NOT EXISTS(SELECT 1 FROM public.interview_content_wipes WHERE owner_id=pg_temp.uid(11))
  AND NOT EXISTS(SELECT 1 FROM public.interview_work_contracts WHERE owner_id=pg_temp.uid(11)),'actual account FK cascade');
ROLLBACK;
