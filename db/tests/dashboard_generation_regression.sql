\set ON_ERROR_STOP on
BEGIN;
SET LOCAL request.jwt.claim.role='service_role';
INSERT INTO auth.users(id) VALUES('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
INSERT INTO public.users(id) SELECT id FROM auth.users;
INSERT INTO public.ops_routines(id,user_id,title) VALUES
  ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','Read a book'),
  ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','Other owner'),
  ('10000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','Payment 5000');
DO $$
DECLARE owner uuid:='00000000-0000-0000-0000-000000000001'; a jsonb; b jsonb; original_id uuid;
BEGIN
  IF has_function_privilege('authenticated','public.dashboard_generation_request(uuid,text,text,text)','EXECUTE')
    OR has_table_privilege('authenticated','public.dashboard_generation_runs','SELECT') THEN RAISE EXCEPTION 'client ACL open'; END IF;
  a:=public.dashboard_generation_request(owner,'open','Asia/Seoul','ko');
  IF a->>'kind'<>'claimed' THEN RAISE EXCEPTION 'first claim: %',a; END IF;
  IF a->'source'::text IS NULL THEN RAISE EXCEPTION 'missing source'; END IF;
  IF jsonb_array_length(a->'source'->'reminders')<>1 OR a::text LIKE '%Other owner%' OR a::text LIKE '%5000%' THEN RAISE EXCEPTION 'source isolation'; END IF;
  original_id:=(a->>'id')::uuid;
  b:=public.dashboard_generation_request(owner,'open','Asia/Seoul','ko');
  IF b->>'kind'<>'busy' THEN RAISE EXCEPTION 'duplicate claim'; END IF;
  IF NOT public.dashboard_generation_dispatch(owner,original_id) THEN RAISE EXCEPTION 'dispatch'; END IF;
  IF public.dashboard_generation_dispatch(owner,original_id) THEN RAISE EXCEPTION 'double dispatch'; END IF;
  IF NOT public.dashboard_generation_finish(owner,original_id,'{"line":"cached"}') THEN RAISE EXCEPTION 'finish'; END IF;
  b:=public.dashboard_generation_request(owner,'open','Asia/Seoul','ko');
  IF b->>'kind'<>'ready' THEN RAISE EXCEPTION 'cache'; END IF;
  IF public.dashboard_generation_finish(owner,original_id,'{}') THEN RAISE EXCEPTION 'double finish'; END IF;
  UPDATE public.users SET test_token=repeat('b',64) WHERE id=owner;
  b:=public.dashboard_generation_request(owner,'open','Asia/Seoul','ko');
  IF b->>'kind'<>'waiting' THEN RAISE EXCEPTION 'old consent cache must wait without pretending to run'; END IF;
  a:=public.dashboard_generation_request(owner,'summary','Asia/Seoul','ko');
  IF a->>'kind'<>'claimed' THEN RAISE EXCEPTION 'summary independent'; END IF;
  IF NOT public.dashboard_generation_dispatch(owner,(a->>'id')::uuid) THEN RAISE EXCEPTION 'summary dispatch'; END IF;
  UPDATE public.users SET test_token=repeat('c',64) WHERE id=owner;
  IF public.dashboard_generation_finish(owner,(a->>'id')::uuid,'{}') THEN RAISE EXCEPTION 'changed consent finish'; END IF;
  UPDATE public.users SET test_consent=false WHERE id=owner;
  b:=public.dashboard_generation_request(owner,'triage','Asia/Seoul','ko');
  IF b->>'kind'<>'denied' THEN RAISE EXCEPTION 'withdrawal'; END IF;
  UPDATE public.users SET test_consent=true,minor_tier='minor' WHERE id=owner;
  b:=public.dashboard_generation_request(owner,'triage','Asia/Seoul','ko');
  IF b->>'kind'<>'denied' THEN RAISE EXCEPTION 'minor'; END IF;
  UPDATE public.users SET minor_tier='adult' WHERE id=owner;
  UPDATE public.users SET privacy_prefs='{"recommendations":false}' WHERE id=owner;
  b:=public.dashboard_generation_request(owner,'triage','Asia/Seoul','ko');
  IF b->>'kind'<>'denied' THEN RAISE EXCEPTION 'recommendation opt-out'; END IF;
  UPDATE public.users SET privacy_prefs='{"recommendations":true}' WHERE id=owner;
  INSERT INTO public.account_deletion_tombstones VALUES(owner);
  b:=public.dashboard_generation_request(owner,'triage','Asia/Seoul','ko');
  IF b->>'kind'<>'denied' THEN RAISE EXCEPTION 'deletion fence'; END IF;
  DELETE FROM public.account_deletion_tombstones WHERE user_id=owner;
  -- Fixed local/UTC quota cannot be reset by choosing another timezone.
  INSERT INTO public.dashboard_generation_runs(user_id,purpose,request_key,source_hash,consent_token,expires_at)
    SELECT owner,'daily_note','extra-'||n,'hash',repeat('c',64),now()+interval '1 day' FROM generate_series(1,2) n;
  UPDATE public.dashboard_generation_runs SET request_key='moved-'||request_key WHERE user_id=owner AND purpose='daily_note';
  b:=public.dashboard_generation_request(owner,'open','Pacific/Honolulu','ko');
  IF b->>'kind'<>'limited' THEN RAISE EXCEPTION 'timezone quota reset'; END IF;
  -- Changing back does not reset counters either.
  b:=public.dashboard_generation_request(owner,'open','Asia/Seoul','ko');
  IF b->>'kind'<>'limited' THEN RAISE EXCEPTION 'local day quota reset'; END IF;
  -- A source mutation cannot save an in-flight response or expose an old cache.
  a:=public.dashboard_generation_request(owner,'triage','Asia/Seoul','ko');
  IF NOT public.dashboard_generation_dispatch(owner,(a->>'id')::uuid) THEN RAISE EXCEPTION 'triage dispatch'; END IF;
  UPDATE public.dashboard_generation_runs SET status='failed' WHERE id=(a->>'id')::uuid;
  b:=public.dashboard_generation_request(owner,'triage','Asia/Seoul','ko');
  IF b->>'kind'<>'waiting' THEN RAISE EXCEPTION 'failed attempt must not spin forever'; END IF;
  UPDATE public.dashboard_generation_runs SET status='dispatched' WHERE id=(a->>'id')::uuid;
  UPDATE public.ops_routines SET title='Walk' WHERE user_id=owner;
  IF public.dashboard_generation_finish(owner,(a->>'id')::uuid,'{}') THEN RAISE EXCEPTION 'stale source finish'; END IF;
  DELETE FROM public.ops_routines WHERE user_id=owner;
  IF EXISTS(SELECT 1 FROM public.dashboard_generation_runs WHERE user_id=owner AND output IS NOT NULL) THEN RAISE EXCEPTION 'source deletion cache'; END IF;
  b:=public.dashboard_generation_request(owner,'summary','Asia/Seoul','ko');
  IF b->>'kind'<>'empty' THEN RAISE EXCEPTION 'deleted source must be empty even when an old attempt exists'; END IF;
  DELETE FROM auth.users WHERE id=owner;
  IF EXISTS(SELECT 1 FROM public.dashboard_generation_runs WHERE user_id=owner) OR
    EXISTS(SELECT 1 FROM public.dashboard_generation_settings WHERE user_id=owner) THEN RAISE EXCEPTION 'account cascade'; END IF;
END $$;
ROLLBACK;
