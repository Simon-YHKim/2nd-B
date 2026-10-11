\set ON_ERROR_STOP on
BEGIN;
SET LOCAL request.jwt.claim.role='service_role';
-- Helpers, fixtures and clock substitutions roll back. Later concurrency tests
-- use the unmodified 0247 definition and the real clock.
CREATE TEMP TABLE last_note_versions(version text PRIMARY KEY,definition text);
INSERT INTO last_note_versions VALUES('0245',(SELECT definition FROM dashboard_request_0245)),
  ('0247',pg_get_functiondef('public.dashboard_generation_request(uuid,text,text,text)'::regprocedure));
CREATE TEMP TABLE last_note_checks(label text);
CREATE FUNCTION pg_temp.note_check(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'A03: %',label; END IF;
  INSERT INTO last_note_checks VALUES(label);
END $$;
CREATE FUNCTION pg_temp.note_version(version text,at_time timestamptz DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $$
DECLARE body text;
BEGIN
  SELECT v.definition INTO STRICT body FROM last_note_versions v WHERE v.version=note_version.version;
  IF at_time IS NOT NULL THEN body:=replace(body,'now()',format('%L::timestamptz',at_time)); END IF;
  EXECUTE body;
END $$;
INSERT INTO auth.users(id) VALUES('00000000-0000-0000-0000-000000000091'),('00000000-0000-0000-0000-000000000092');
INSERT INTO public.users(id) SELECT id FROM auth.users WHERE id::text LIKE '%0091' OR id::text LIKE '%0092';
CREATE FUNCTION pg_temp.note_fixture(zone text DEFAULT 'Asia/Seoul') RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE owner uuid:='00000000-0000-0000-0000-000000000091'; a jsonb; run_id uuid;
BEGIN
  PERFORM pg_temp.note_version('0247');
  DELETE FROM public.dashboard_generation_runs WHERE user_id IN (owner,'00000000-0000-0000-0000-000000000092');
  DELETE FROM public.ops_routine_logs WHERE user_id=owner;
  UPDATE public.users SET test_consent=true,test_token=repeat('a',64),minor_tier='adult',
    birth_date='1990-01-01',privacy_prefs='{"recommendations":true}' WHERE id=owner;
  INSERT INTO public.ops_routines(id,user_id,title) VALUES
    ('10000000-0000-0000-0000-000000000091',owner,'Read'),
    ('10000000-0000-0000-0000-000000000092',owner,'Write')
    ON CONFLICT ON CONSTRAINT ops_routines_pkey DO UPDATE SET active=true,title=EXCLUDED.title;
  UPDATE public.dashboard_generation_retention SET last_purged_at=clock_timestamp();
  a:=public.dashboard_generation_request(owner,'open',zone,'ko'); run_id:=(a->>'id')::uuid;
  IF a->>'kind' IS DISTINCT FROM 'claimed' OR NOT public.dashboard_generation_dispatch(owner,run_id) THEN
    RAISE EXCEPTION 'A03 fixture claim/dispatch'; END IF;
  IF NOT public.dashboard_generation_finish(owner,run_id,jsonb_build_object('slot',a->>'slot','line','Read today.',
    'basis_refs',jsonb_build_array(jsonb_build_object('kind','routine','id','10000000-0000-0000-0000-000000000091')),
    'reminder_suggestions','[]'::jsonb)) THEN RAISE EXCEPTION 'A03 fixture finish'; END IF;
  RETURN a;
END $$;

-- Actual now(): completion changes the hash, never evidence identity or expiry.
DO $$
DECLARE owner uuid:='00000000-0000-0000-0000-000000000091'; a jsonb; b jsonb; before_row public.dashboard_generation_runs%ROWTYPE;
BEGIN
  a:=pg_temp.note_fixture();
  SELECT * INTO before_row FROM public.dashboard_generation_runs WHERE id=(a->>'id')::uuid;
  b:=public.dashboard_generation_request(owner,'open','Asia/Seoul','ko');
  PERFORM pg_temp.note_check(b->>'kind'='ready' AND b->'previous'='false'::jsonb
    AND (b->>'generatedAt')::timestamptz=before_row.created_at,'current ready metadata');
  INSERT INTO public.ops_routine_logs(routine_id,user_id,completed_on)
    VALUES('10000000-0000-0000-0000-000000000091',owner,(now() AT TIME ZONE 'Asia/Seoul')::date);
  PERFORM pg_temp.note_version('0245');
  b:=public.dashboard_generation_request(owner,'open','Asia/Seoul','ko');
  PERFORM pg_temp.note_check(b->>'kind'='waiting','0245 control: completion loses note');
  PERFORM pg_temp.note_version('0247');
  b:=public.dashboard_generation_request(owner,'open','Asia/Seoul','ko');
  PERFORM pg_temp.note_check(b->>'kind'='ready' AND b->'previous'='true'::jsonb
    AND (b->>'generatedAt')::timestamptz=before_row.created_at AND b->'value'=before_row.output
    AND b->>'slot'=before_row.output->>'slot','completion returns previous note and original timestamp/slot/value');
  PERFORM pg_temp.note_check(b->'source'=public.dashboard_generation_source(owner,'daily_note',(now() AT TIME ZONE 'Asia/Seoul')::date)
    AND b->'source' IS DISTINCT FROM a->'source','previous note uses current source');
  PERFORM pg_temp.note_check((SELECT count(*)=1 AND min(expires_at)=before_row.expires_at
    FROM public.dashboard_generation_runs WHERE user_id=owner),'read preserves attempt count and expiry');
END $$;

-- Isolate each rejection, including predicates that deletion/withdrawal hooks
-- also enforce. Inactive evidence leaves output intact and tests the read gate.
DO $$
DECLARE owner uuid:='00000000-0000-0000-0000-000000000091'; a jsonb; b jsonb; scenario text; expected text;
BEGIN
  FOREACH scenario IN ARRAY ARRAY['empty','token','regrant','deleted','partial-deleted','partial-basis','suggestion',
    'wrong-kind','expired','purged','empty-basis','minor','recommendations','heartbeat','other-owner'] LOOP
    a:=pg_temp.note_fixture(); expected:='waiting';
    UPDATE public.dashboard_generation_runs SET source_hash='stale' WHERE id=(a->>'id')::uuid;
    CASE scenario
      WHEN 'empty' THEN UPDATE public.ops_routines SET active=false WHERE user_id=owner; expected:='empty';
      WHEN 'token' THEN UPDATE public.users SET test_token=repeat('b',64) WHERE id=owner;
      WHEN 'regrant' THEN
        UPDATE public.users SET test_consent=false WHERE id=owner;
        b:=public.dashboard_generation_request(owner,'open','Asia/Seoul','ko');
        PERFORM pg_temp.note_check(b->>'kind'='denied','withdrawal denies note');
        UPDATE public.users SET test_consent=true,test_token=repeat('b',64) WHERE id=owner;
      WHEN 'deleted' THEN DELETE FROM public.ops_routines WHERE id='10000000-0000-0000-0000-000000000091';
      WHEN 'partial-deleted' THEN
        UPDATE public.dashboard_generation_runs SET output=jsonb_set(output,'{basis_refs}',output->'basis_refs'||
          '[{"kind":"routine","id":"10000000-0000-0000-0000-000000000092"}]') WHERE id=(a->>'id')::uuid;
        DELETE FROM public.ops_routines WHERE id='10000000-0000-0000-0000-000000000092';
      WHEN 'partial-basis' THEN
        UPDATE public.dashboard_generation_runs SET output=jsonb_set(output,'{basis_refs}',output->'basis_refs'||
          '[{"kind":"routine","id":"10000000-0000-0000-0000-000000000092"}]') WHERE id=(a->>'id')::uuid;
        UPDATE public.ops_routines SET active=false WHERE id='10000000-0000-0000-0000-000000000092';
      WHEN 'suggestion' THEN
        UPDATE public.dashboard_generation_runs SET output=jsonb_set(output,'{reminder_suggestions}',
          '[{"source_ref":{"kind":"routine","id":"10000000-0000-0000-0000-000000000092"}}]') WHERE id=(a->>'id')::uuid;
        UPDATE public.ops_routines SET active=false WHERE id='10000000-0000-0000-0000-000000000092';
      WHEN 'wrong-kind' THEN
        UPDATE public.dashboard_generation_runs SET output=jsonb_set(output,'{basis_refs,0,kind}','"reminder"') WHERE id=(a->>'id')::uuid;
      WHEN 'expired' THEN UPDATE public.dashboard_generation_runs SET expires_at=now()-interval '1 second' WHERE id=(a->>'id')::uuid;
      WHEN 'purged' THEN
        UPDATE public.dashboard_generation_runs SET expires_at=now()-interval '1 second' WHERE id=(a->>'id')::uuid;
        PERFORM public.purge_dashboard_generation();
        PERFORM pg_temp.note_check((SELECT output IS NULL AND status='failed' FROM public.dashboard_generation_runs
          WHERE id=(a->>'id')::uuid),'purge empties output');
      WHEN 'empty-basis' THEN UPDATE public.dashboard_generation_runs SET output=jsonb_set(output,'{basis_refs}','[]') WHERE id=(a->>'id')::uuid;
      WHEN 'minor' THEN UPDATE public.users SET minor_tier='minor' WHERE id=owner; expected:='denied';
      WHEN 'recommendations' THEN UPDATE public.users SET privacy_prefs='{"recommendations":false}' WHERE id=owner; expected:='denied';
      WHEN 'heartbeat' THEN UPDATE public.dashboard_generation_retention SET last_purged_at=clock_timestamp()-interval '4 hours'; expected:='denied';
      WHEN 'other-owner' THEN
        UPDATE public.dashboard_generation_runs SET user_id='00000000-0000-0000-0000-000000000092' WHERE id=(a->>'id')::uuid;
        INSERT INTO public.dashboard_generation_runs(user_id,purpose,request_key,source_hash,consent_token,status,expires_at)
          SELECT owner,purpose,request_key,source_hash,consent_token,'failed',expires_at FROM public.dashboard_generation_runs WHERE id=(a->>'id')::uuid;
    END CASE;
    b:=public.dashboard_generation_request(owner,'open','Asia/Seoul','ko');
    PERFORM pg_temp.note_check(b->>'kind'=expected AND NOT (b ? 'previous'),'reject '||scenario);
  END LOOP;
END $$;

DO $$
DECLARE owner uuid:='00000000-0000-0000-0000-000000000091'; a jsonb; b jsonb; zone text; action text;
BEGIN
  a:=pg_temp.note_fixture();
  UPDATE public.dashboard_generation_runs SET source_hash='stale',created_at=now()-interval '2 minutes' WHERE id=(a->>'id')::uuid;
  INSERT INTO public.dashboard_generation_runs(user_id,purpose,request_key,source_hash,consent_token,status,output,created_at,expires_at)
    SELECT user_id,purpose,'newer',source_hash,consent_token,status,jsonb_set(output,'{line}','"Newer note."'),now()-interval '1 minute',expires_at
    FROM public.dashboard_generation_runs WHERE id=(a->>'id')::uuid;
  b:=public.dashboard_generation_request(owner,'open','Asia/Seoul','ko');
  PERFORM pg_temp.note_check(b->>'kind'='ready' AND b->'previous'='true'::jsonb AND b->'value'->>'line'='Newer note.',
    'latest valid note wins by created_at descending');
  UPDATE public.dashboard_generation_runs SET request_key='old-'||request_key WHERE user_id=owner;
  INSERT INTO public.dashboard_generation_runs(user_id,purpose,request_key,source_hash,consent_token,status,expires_at)
    VALUES(owner,'daily_note','third','x',repeat('a',64),'failed',now()+interval '1 day');
  b:=public.dashboard_generation_request(owner,'open','Asia/Seoul','ko');
  PERFORM pg_temp.note_check(b->>'kind'='ready' AND b->'previous'='true'::jsonb AND b->'value'->>'line'='Newer note.',
    'quota returns previous note');
  PERFORM pg_temp.note_check((SELECT count(*)=3 FROM public.dashboard_generation_runs WHERE user_id=owner),'quota fallback adds no attempt');
  -- Real-clock due hour via timezone choice, so hourly cannot pass by being empty.
  SELECT name INTO STRICT zone FROM pg_timezone_names WHERE name ~ '^Etc/GMT[+-][0-9]+$'
    AND extract(hour FROM now() AT TIME ZONE name) IN (6,13,20) ORDER BY name LIMIT 1;
  a:=pg_temp.note_fixture(zone);
  INSERT INTO public.dashboard_generation_runs(user_id,purpose,request_key,source_hash,consent_token,status,output,expires_at)
    SELECT user_id,purpose,'older',source_hash,consent_token,status,output,expires_at FROM public.dashboard_generation_runs WHERE id=(a->>'id')::uuid;
  UPDATE public.dashboard_generation_runs SET status='pending',output=NULL WHERE id=(a->>'id')::uuid;
  b:=public.dashboard_generation_request(owner,'open',zone,'ko');
  PERFORM pg_temp.note_check(b->>'kind'='ready' AND b->'previous'='true'::jsonb,'busy returns previous note on open');
  b:=public.dashboard_generation_request(owner,'hourly');
  PERFORM pg_temp.note_check(b->>'kind'='busy' AND NOT (b ? 'previous'),'hourly never returns previous note');
  FOREACH action IN ARRAY ARRAY['summary','triage'] LOOP
    b:=public.dashboard_generation_request(owner,action,zone,'ko');
    PERFORM pg_temp.note_check(b->>'kind'='claimed','independent claim '||action);
    b:=public.dashboard_generation_request(owner,action,zone,'ko');
    PERFORM pg_temp.note_check(b->>'kind'='busy' AND NOT (b ? 'previous'),'no daily-note fallback '||action);
  END LOOP;
END $$;

-- Fixed clocks exercise the entire same-zone day on every CI hour. At 23 UTC
-- no Etc/GMT zone can put 00/06/13/20 on one local date with <3 UTC rows before
-- the last claim. Substitute only now() in a saved request inside this rolled-
-- back transaction to avoid masking G5-04 with the unchanged UTC backstop.
DO $$
DECLARE owner uuid:='00000000-0000-0000-0000-000000000091'; version text; hour integer; a jsonb;
  day date:=(now() AT TIME ZONE 'Asia/Seoul')::date; tick timestamptz; utc_rows integer; expected text;
BEGIN
  PERFORM pg_temp.note_fixture();
  FOREACH version IN ARRAY ARRAY['0245','0247'] LOOP
    DELETE FROM public.dashboard_generation_runs WHERE user_id=owner;
    FOREACH hour IN ARRAY ARRAY[2,7,14,21] LOOP
      tick:=(day+make_time(hour,0,0)) AT TIME ZONE 'Asia/Seoul';
      PERFORM pg_temp.note_version(version,tick);
      SELECT count(*) INTO utc_rows FROM public.dashboard_generation_runs WHERE user_id=owner AND purpose='daily_note'
        AND (created_at AT TIME ZONE 'UTC')::date=(tick AT TIME ZONE 'UTC')::date;
      PERFORM pg_temp.note_check(utc_rows<3,version||' UTC backstop cannot decide hour '||hour);
      a:=public.dashboard_generation_request(owner,'open','Asia/Seoul','ko');
      expected:=CASE WHEN version='0245' AND hour=21 THEN 'limited' ELSE 'claimed' END;
      PERFORM pg_temp.note_check(a->>'kind'=expected,version||' service day hour '||hour||' = '||expected);
      IF expected='claimed' THEN
        UPDATE public.dashboard_generation_runs SET created_at=tick WHERE id=(a->>'id')::uuid;
        PERFORM pg_temp.note_check((SELECT request_key=(CASE WHEN hour=2 THEN day-1 ELSE day END)::text||':'||
          CASE hour WHEN 2 THEN 'evening' WHEN 7 THEN 'morning' WHEN 14 THEN 'midday' ELSE 'evening' END
          FROM public.dashboard_generation_runs WHERE id=(a->>'id')::uuid),version||' service key hour '||hour);
      END IF;
    END LOOP;
    PERFORM pg_temp.note_check((SELECT count(*)=CASE version WHEN '0245' THEN 3 ELSE 4 END
      FROM public.dashboard_generation_runs WHERE user_id=owner),version||' full-day attempt count');
  END LOOP;
END $$;

-- Non-note quotas still count the calendar date, including pre-06:00 rows.
DO $$
DECLARE owner uuid:='00000000-0000-0000-0000-000000000091'; action text; purpose text; a jsonb; tick timestamptz;
  day date:=(now() AT TIME ZONE 'Asia/Seoul')::date;
BEGIN
  PERFORM pg_temp.note_fixture();
  tick:=(day+time '07:00') AT TIME ZONE 'Asia/Seoul';
  PERFORM pg_temp.note_version('0247',tick);
  FOREACH action IN ARRAY ARRAY['summary','triage'] LOOP
    purpose:=CASE action WHEN 'summary' THEN 'day_summary' ELSE 'inbox_triage' END;
    INSERT INTO public.dashboard_generation_runs(user_id,purpose,request_key,source_hash,consent_token,status,created_at,expires_at)
      SELECT owner,purpose,'quota-'||n,'x',repeat('a',64),'failed',(day+time '02:00') AT TIME ZONE 'Asia/Seoul',tick+interval '1 day'
        FROM generate_series(1,47) n;
    a:=public.dashboard_generation_request(owner,action,'Asia/Seoul','ko');
    PERFORM pg_temp.note_check(a->>'kind'='claimed','calendar quota admits attempt 48 '||action);
    UPDATE public.dashboard_generation_runs SET created_at=tick,request_key='attempt-48',status='failed' WHERE id=(a->>'id')::uuid;
    a:=public.dashboard_generation_request(owner,action,'Asia/Seoul','ko');
    PERFORM pg_temp.note_check(a->>'kind'='limited','calendar quota blocks attempt 49 '||action);
  END LOOP;
END $$;

-- Known residual: yesterday's late morning + midday + evening share the UTC
-- date with today's 07 KST. A03 shows the previous note, but cannot claim until 09.
DO $$
DECLARE owner uuid:='00000000-0000-0000-0000-000000000091'; a jsonb; b jsonb; version text;
  day date:=(now() AT TIME ZONE 'Asia/Seoul')::date; tick timestamptz;
BEGIN
  FOREACH version IN ARRAY ARRAY['0245','0247'] LOOP
    a:=pg_temp.note_fixture();
    UPDATE public.dashboard_generation_runs SET request_key=(day-1)::text||':evening',
      output=jsonb_set(output,'{slot}','"evening"'),created_at=((day-1)+time '20:00') AT TIME ZONE 'Asia/Seoul',
      expires_at=(day+time '20:00') AT TIME ZONE 'Asia/Seoul' WHERE id=(a->>'id')::uuid;
    INSERT INTO public.dashboard_generation_runs(user_id,purpose,request_key,source_hash,consent_token,status,created_at,expires_at)
      SELECT owner,'daily_note',(day-1)::text||':'||slot,'x',repeat('a',64),'failed',
        ((day-1)+at_time) AT TIME ZONE 'Asia/Seoul',(day+time '20:00') AT TIME ZONE 'Asia/Seoul'
        FROM (VALUES('morning',time '10:00'),('midday',time '14:00')) moments(slot,at_time);
    tick:=(day+time '07:00') AT TIME ZONE 'Asia/Seoul';
    PERFORM pg_temp.note_version(version,tick);
    PERFORM pg_temp.note_check((SELECT count(*)=3 FROM public.dashboard_generation_runs WHERE user_id=owner
      AND (created_at AT TIME ZONE 'UTC')::date=(tick AT TIME ZONE 'UTC')::date),version||' residual UTC rows = 3');
    PERFORM pg_temp.note_check((SELECT count(*)=0 FROM public.dashboard_generation_runs WHERE user_id=owner
      AND ((created_at AT TIME ZONE 'Asia/Seoul')-interval '6 hours')::date=day),version||' residual service rows = 0');
    b:=public.dashboard_generation_request(owner,'open','Asia/Seoul','ko');
    PERFORM pg_temp.note_check(CASE version WHEN '0245' THEN b->>'kind'='limited'
      ELSE b->>'kind'='ready' AND b->'previous'='true'::jsonb AND b->>'slot'='evening' END,version||' residual 07 KST response');
    PERFORM pg_temp.note_version(version,(day+time '09:00') AT TIME ZONE 'Asia/Seoul');
    b:=public.dashboard_generation_request(owner,'open','Asia/Seoul','ko');
    PERFORM pg_temp.note_check(b->>'kind'='claimed',version||' residual releases at 09 KST');
  END LOOP;
  PERFORM pg_temp.note_version('0247');
END $$;

-- Permissions are actual SET ROLE calls, not only catalog string checks.
DO $$
DECLARE role_name text; b jsonb;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    EXECUTE format('SET LOCAL ROLE %I',role_name);
    BEGIN
      PERFORM public.dashboard_generation_request('00000000-0000-0000-0000-000000000091','open','Asia/Seoul','ko');
      RAISE EXCEPTION 'A03 client execution allowed: %',role_name;
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    RESET ROLE;
    PERFORM pg_temp.note_check(NOT has_function_privilege(role_name,'public.dashboard_generation_request(uuid,text,text,text)','EXECUTE')
      AND NOT has_table_privilege(role_name,'public.dashboard_generation_runs','SELECT'),'ACL '||role_name);
  END LOOP;
  SET LOCAL ROLE service_role;
  b:=public.dashboard_generation_request('00000000-0000-0000-0000-000000000091','open','Asia/Seoul','ko');
  RESET ROLE;
  PERFORM pg_temp.note_check(b ? 'kind' AND has_function_privilege('service_role',
    'public.dashboard_generation_request(uuid,text,text,text)','EXECUTE'),'ACL service_role');
END $$;

CREATE TEMP TABLE last_note_before_down AS SELECT * FROM public.dashboard_generation_runs;
\ir ../migrations/rollback/0247_down.sql
SELECT pg_temp.note_check(pg_get_functiondef('public.dashboard_generation_request(uuid,text,text,text)'::regprocedure)
  =(SELECT definition FROM last_note_versions WHERE version='0245'),'rollback exact 0245 definition');
SELECT pg_temp.note_check(NOT EXISTS((SELECT * FROM last_note_before_down EXCEPT SELECT * FROM public.dashboard_generation_runs)
  UNION ALL (SELECT * FROM public.dashboard_generation_runs EXCEPT SELECT * FROM last_note_before_down)),'rollback preserves rows');
DO $$ BEGIN RAISE NOTICE 'A03 SQL assertions passed: %', (SELECT count(*) FROM last_note_checks); END $$;
ROLLBACK;
