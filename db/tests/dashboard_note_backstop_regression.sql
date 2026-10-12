\set ON_ERROR_STOP on
BEGIN;
SET LOCAL request.jwt.claim.role='service_role';
SET LOCAL TIME ZONE 'UTC';
-- Only the request's clock is substituted, as in the 0247 regression. The
-- inserted claim's default created_at is aligned explicitly with that clock.
-- All fixtures/clock substitutions roll back; concurrency uses real 0248.
CREATE TEMP TABLE backstop_versions(version text PRIMARY KEY,definition text);
INSERT INTO backstop_versions VALUES('0247',(SELECT definition FROM dashboard_request_0247)),
  ('0248',pg_get_functiondef('public.dashboard_generation_request(uuid,text,text,text)'::regprocedure));
CREATE TEMP TABLE backstop_checks(label text,ok boolean);
CREATE FUNCTION pg_temp.backstop_check(ok boolean,label text) RETURNS void LANGUAGE sql AS $$
  INSERT INTO backstop_checks VALUES(label,ok IS TRUE)
$$;
CREATE FUNCTION pg_temp.backstop_version(version text,at_time timestamptz) RETURNS void LANGUAGE plpgsql AS $$
DECLARE body text;
BEGIN
  SELECT v.definition INTO STRICT body FROM backstop_versions v WHERE v.version=backstop_version.version;
  EXECUTE replace(body,'now()',format('%L::timestamptz',at_time));
END $$;
INSERT INTO auth.users(id) VALUES('00000000-0000-0000-0000-000000000081'),('00000000-0000-0000-0000-000000000082');
INSERT INTO public.users(id) SELECT id FROM auth.users WHERE id IN
  ('00000000-0000-0000-0000-000000000081','00000000-0000-0000-0000-000000000082');
INSERT INTO public.ops_routines(id,user_id,title) VALUES
  ('10000000-0000-0000-0000-000000000081','00000000-0000-0000-0000-000000000081','Read');
UPDATE public.dashboard_generation_retention SET last_purged_at=clock_timestamp();
CREATE FUNCTION pg_temp.backstop_reset() RETURNS void LANGUAGE sql AS $$
  DELETE FROM public.dashboard_generation_runs WHERE user_id IN
    ('00000000-0000-0000-0000-000000000081','00000000-0000-0000-0000-000000000082')
$$;
CREATE FUNCTION pg_temp.backstop_seed(n integer,at_time timestamptz,purpose text DEFAULT 'daily_note',
  owner uuid DEFAULT '00000000-0000-0000-0000-000000000081',state text DEFAULT 'failed') RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.dashboard_generation_runs(user_id,purpose,request_key,source_hash,consent_token,status,created_at,expires_at)
    SELECT owner,purpose,'fixture-'||gen_random_uuid(),'old',repeat('a',64),state,at_time,at_time+interval '24 hours'
    FROM generate_series(1,n)
$$;
CREATE FUNCTION pg_temp.backstop_ready(run_id uuid) RETURNS void LANGUAGE sql AS $$
  UPDATE public.dashboard_generation_runs SET status='ready',output=jsonb_build_object('slot',split_part(request_key,':',2),
    'line','Read today.','basis_refs',jsonb_build_array(jsonb_build_object('kind','routine',
      'id','10000000-0000-0000-0000-000000000081')),'reminder_suggestions','[]'::jsonb) WHERE id=run_id
$$;
CREATE FUNCTION pg_temp.backstop_open(version text,at_time timestamptz,zone text,ready boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE a jsonb;
BEGIN
  PERFORM pg_temp.backstop_version(version,at_time);
  a:=public.dashboard_generation_request('00000000-0000-0000-0000-000000000081','open',zone,'ko');
  IF a->>'kind'='claimed' THEN
    UPDATE public.dashboard_generation_runs SET created_at=at_time WHERE id=(a->>'id')::uuid;
    IF ready THEN PERFORM pg_temp.backstop_ready((a->>'id')::uuid); END IF;
  END IF;
  RETURN a;
END $$;

-- Seoul missed 06:00 tick: yesterday's 09:30/13:05/20:05 all fall in UTC today.
DO $$
DECLARE tick timestamptz; a jsonb; owner uuid:='00000000-0000-0000-0000-000000000081';
BEGIN
  PERFORM pg_temp.backstop_reset();
  FOREACH tick IN ARRAY ARRAY['2026-10-10 00:30Z'::timestamptz,'2026-10-10 04:05Z','2026-10-10 11:05Z'] LOOP
    a:=pg_temp.backstop_open('0248',tick,'Asia/Seoul');
    PERFORM pg_temp.backstop_check(a->>'kind'='claimed','Seoul previous three slots: '||tick);
  END LOOP;
  a:=pg_temp.backstop_open('0247','2026-10-10 22:00Z','Asia/Seoul');
  PERFORM pg_temp.backstop_check(a->>'kind'='ready' AND a->'previous'='true'::jsonb,'0247 control: Seoul 07:00 capped with previous note');
  PERFORM pg_temp.backstop_check((SELECT count(*)=3 FROM public.dashboard_generation_runs WHERE user_id=owner),'0247 control does not claim');
  a:=pg_temp.backstop_open('0248','2026-10-10 22:00Z','Asia/Seoul');
  PERFORM pg_temp.backstop_check(a->>'kind'='claimed' AND a->>'slot'='morning','0248 Seoul 07:00 claims fourth UTC attempt');
  PERFORM pg_temp.backstop_check((SELECT count(*)=4 FROM public.dashboard_generation_runs WHERE user_id=owner),'Seoul fourth attempt persisted');
END $$;

-- Distinguish the ceilings. All statuses count; no prior ready output exists.
DO $$
DECLARE a jsonb; state text; owner uuid:='00000000-0000-0000-0000-000000000081'; last_id uuid;
BEGIN
  FOREACH state IN ARRAY ARRAY['failed','pending','dispatched','ready'] LOOP
    PERFORM pg_temp.backstop_reset();
    PERFORM pg_temp.backstop_seed(3,'2026-10-10 11:00Z','daily_note',owner,state);
    a:=pg_temp.backstop_open('0248','2026-10-10 22:00Z','Asia/Seoul',false);
    PERFORM pg_temp.backstop_check(a->>'kind'='claimed','UTC three attempts still allow fourth, status='||state);
    -- Start again so the next request has a new key and zero local attempts.
    PERFORM pg_temp.backstop_reset();
    PERFORM pg_temp.backstop_seed(4,'2026-10-10 11:00Z','daily_note',owner,state);
    a:=pg_temp.backstop_open('0248','2026-10-10 22:00Z','Asia/Seoul');
    PERFORM pg_temp.backstop_check(a->>'kind'='limited','UTC today four attempts block fifth, status='||state);
    PERFORM pg_temp.backstop_check((SELECT count(*)=4 FROM public.dashboard_generation_runs WHERE user_id=owner),'UTC cap preserves attempt count, status='||state);
  END LOOP;
  SELECT id INTO last_id FROM public.dashboard_generation_runs WHERE user_id=owner LIMIT 1;
  PERFORM pg_temp.backstop_ready(last_id);
  a:=pg_temp.backstop_open('0248','2026-10-10 22:00Z','Asia/Seoul');
  PERFORM pg_temp.backstop_check(a->>'kind'='ready' AND a->'previous'='true'::jsonb,'UTC cap returns previous note when available');
  PERFORM pg_temp.backstop_reset();
  PERFORM pg_temp.backstop_seed(1,'2026-10-10 22:00Z');
  PERFORM pg_temp.backstop_seed(1,'2026-10-11 04:00Z');
  a:=pg_temp.backstop_open('0248','2026-10-11 11:00Z','Asia/Seoul',false);
  PERFORM pg_temp.backstop_check(a->>'kind'='claimed','Local two attempts allow third across UTC dates');
  PERFORM pg_temp.backstop_reset();
  PERFORM pg_temp.backstop_seed(1,'2026-10-10 22:00Z');
  PERFORM pg_temp.backstop_seed(2,'2026-10-11 04:00Z');
  a:=pg_temp.backstop_open('0248','2026-10-11 11:00Z','Asia/Seoul');
  PERFORM pg_temp.backstop_check(a->>'kind'='limited','Local service day three attempts block fourth across UTC dates');
  PERFORM pg_temp.backstop_check((SELECT count(*)=3 FROM public.dashboard_generation_runs WHERE user_id=owner),'Local cap preserves attempt count');
  PERFORM pg_temp.backstop_reset();
  PERFORM pg_temp.backstop_seed(48,'2026-10-11 04:00Z','daily_note','00000000-0000-0000-0000-000000000082');
  PERFORM pg_temp.backstop_seed(48,'2026-10-11 04:00Z','day_summary');
  PERFORM pg_temp.backstop_seed(48,'2026-10-11 04:00Z','inbox_triage');
  a:=pg_temp.backstop_open('0248','2026-10-11 11:00Z','Asia/Seoul');
  PERFORM pg_temp.backstop_check(a->>'kind'='claimed','Other owners and purposes do not count toward daily_note');
END $$;

-- A split local/UTC union still counts each row once, at the unchanged 48.
DO $$
DECLARE action text; purpose text; zone text; version text; n integer; a jsonb; tick timestamptz;
BEGIN
  FOREACH action IN ARRAY ARRAY['summary','triage'] LOOP
    purpose:=CASE action WHEN 'summary' THEN 'day_summary' ELSE 'inbox_triage' END;
    FOREACH zone IN ARRAY ARRAY['Asia/Seoul','America/Los_Angeles'] LOOP
      tick:=CASE zone WHEN 'Asia/Seoul' THEN '2026-10-11 02:00Z'::timestamptz ELSE '2026-10-11 09:00Z'::timestamptz END;
      FOREACH version IN ARRAY ARRAY['0247','0248'] LOOP
        FOREACH n IN ARRAY ARRAY[47,48] LOOP
          PERFORM pg_temp.backstop_reset();
          -- Seoul: local-only + both. LA: UTC-only + both.
          PERFORM pg_temp.backstop_seed(24,CASE zone WHEN 'Asia/Seoul' THEN '2026-10-10 16:00Z'::timestamptz
            ELSE '2026-10-11 02:00Z'::timestamptz END,purpose);
          PERFORM pg_temp.backstop_seed(n-24,tick-interval '10 minutes',purpose);
          PERFORM pg_temp.backstop_seed(48,tick-interval '10 minutes',purpose,'00000000-0000-0000-0000-000000000082');
          PERFORM pg_temp.backstop_seed(48,tick-interval '10 minutes','daily_note');
          PERFORM pg_temp.backstop_version(version,tick);
          a:=public.dashboard_generation_request('00000000-0000-0000-0000-000000000081',action,zone,'ko');
          PERFORM pg_temp.backstop_check(a->>'kind'=CASE WHEN n=47 THEN 'claimed' ELSE 'limited' END,
            version||' '||purpose||' union '||n||' '||zone);
        END LOOP;
      END LOOP;
    END LOOP;
  END LOOP;
END $$;

DO $$
DECLARE zone text; local_tick timestamp; a jsonb; n integer;
BEGIN
  FOREACH zone IN ARRAY ARRAY['UTC','America/Los_Angeles','Asia/Kolkata'] LOOP
    PERFORM pg_temp.backstop_reset(); n:=0;
    FOREACH local_tick IN ARRAY ARRAY['2026-10-10 06:05'::timestamp,'2026-10-10 13:05','2026-10-10 20:05','2026-10-11 06:05'] LOOP
      n:=n+1; a:=pg_temp.backstop_open('0248',local_tick AT TIME ZONE zone,zone);
      PERFORM pg_temp.backstop_check(a->>'kind'='claimed',zone||' consecutive slot '||n);
    END LOOP;
    PERFORM pg_temp.backstop_check((SELECT count(*)=4 AND count(DISTINCT request_key)=4 FROM public.dashboard_generation_runs
      WHERE user_id='00000000-0000-0000-0000-000000000081'),zone||' four distinct claims');
  END LOOP;
END $$;

-- Known exception accepted by coordinator 2ndb-e7 (not a new Simon decision).
-- Chatham spring-forward makes this UTC date touch five local slot windows.
DO $$
DECLARE tick timestamptz; a jsonb; n integer:=0; owner uuid:='00000000-0000-0000-0000-000000000081';
  keys text[]:=ARRAY['2026-09-26:morning','2026-09-26:midday','2026-09-26:evening','2026-09-27:morning'];
BEGIN
  PERFORM pg_temp.backstop_reset();
  FOREACH tick IN ARRAY ARRAY['2026-09-26 00:05Z'::timestamptz,'2026-09-26 00:20Z','2026-09-26 07:20Z','2026-09-26 16:20Z'] LOOP
    n:=n+1; a:=pg_temp.backstop_open('0248',tick,'Pacific/Chatham');
    PERFORM pg_temp.backstop_check(a->>'kind'='claimed','알려진 예외: Pacific/Chatham first four claimed, slot '||n);
    PERFORM pg_temp.backstop_check((SELECT request_key=keys[n] FROM public.dashboard_generation_runs WHERE id=(a->>'id')::uuid),
      '알려진 예외: Pacific/Chatham service day and slot '||n);
  END LOOP;
  a:=pg_temp.backstop_open('0248','2026-09-26 23:20Z','Pacific/Chatham');
  PERFORM pg_temp.backstop_check(a->>'kind'='ready' AND a->'previous'='true'::jsonb
    AND a->>'slot'='morning' AND (a->>'generatedAt')::timestamptz='2026-09-26 16:20Z'::timestamptz,
    '알려진 예외: Pacific/Chatham fifth slot capped with previous note');
  UPDATE public.dashboard_generation_runs SET status='failed',output=NULL WHERE user_id=owner;
  a:=pg_temp.backstop_open('0248','2026-09-26 23:20Z','Pacific/Chatham');
  PERFORM pg_temp.backstop_check(a->>'kind'='limited','알려진 예외: Pacific/Chatham fifth slot limited without previous note');
  PERFORM pg_temp.backstop_check((SELECT count(*)=4 FROM public.dashboard_generation_runs WHERE user_id=owner),
    '알려진 예외: Pacific/Chatham only four UTC attempts');
END $$;

SELECT label,ok FROM backstop_checks ORDER BY label;
SELECT count(*) AS backstop_assertions,count(*) FILTER (WHERE NOT ok) AS failures FROM backstop_checks;
DO $$
DECLARE failures text;
BEGIN
  SELECT string_agg(label,E'\n' ORDER BY label) INTO failures FROM backstop_checks WHERE NOT ok;
  IF failures IS NOT NULL THEN RAISE EXCEPTION '0248 backstop failures:%',E'\n'||failures; END IF;
END $$;
ROLLBACK;

-- Rollback is exercised, not merely inspected; undo it before concurrency.
BEGIN;
\ir ../migrations/rollback/0248_down.sql
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM dashboard_request_0247 b JOIN pg_proc p
    ON p.oid='public.dashboard_generation_request(uuid,text,text,text)'::regprocedure
    WHERE b.definition=pg_get_functiondef(p.oid) AND b.proacl IS NOT DISTINCT FROM p.proacl)
  THEN RAISE EXCEPTION '0248 rollback must restore exact 0247 definition and ACL'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.ops_routines'::regclass
    AND tgname='dashboard_routine_changed' AND tgenabled='A')
  THEN RAISE EXCEPTION '0248 rollback must retain 0247 routine trigger'; END IF;
END $$;
ROLLBACK;
