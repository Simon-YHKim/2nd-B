\set ON_ERROR_STOP on
BEGIN;
SET LOCAL request.jwt.claim.role='service_role';
-- Tiny unanalysed fixtures should not compile hundreds of one-off JIT plans.
SET LOCAL jit=off;
INSERT INTO auth.users(id) SELECT ('00000000-0000-0000-0000-00000000007'||n)::uuid FROM generate_series(1,8) n;
INSERT INTO public.users(id) SELECT id FROM auth.users WHERE id::text LIKE '%007_';
INSERT INTO public.ops_routines(id,user_id,title) SELECT id,id,'Read' FROM public.users WHERE id::text LIKE '%007_';

DO $$
DECLARE owner_id uuid := '00000000-0000-0000-0000-000000000071'; a jsonb; b jsonb;
  run_id uuid; old_lease uuid; new_lease uuid; stamp timestamptz; role_name text; fn regprocedure;
BEGIN
  a:=public.dashboard_generation_request_v2(owner_id,'open','Asia/Seoul','ko');
  run_id:=(a->>'id')::uuid; old_lease:=(a->>'lease_token')::uuid;
  IF a->>'kind'<>'claimed' OR old_lease IS NULL THEN RAISE EXCEPTION 'v2 claim'; END IF;
  SELECT created_at INTO stamp FROM public.dashboard_generation_runs WHERE id=run_id;
  IF (SELECT count(*) FROM public.ai_audit_log WHERE id=old_lease AND model_used='dashboard+attempt'
    AND outbox_event_id='dashboard:'||run_id||':'||old_lease)<>1 THEN RAISE EXCEPTION 'claim/audit atomicity'; END IF;
  -- Old Edge RPCs cannot bypass the new lease protocol.
  IF public.dashboard_generation_dispatch(owner_id,run_id)
    OR public.dashboard_generation_audit_attempt(owner_id,run_id,'claude-sonnet-5','low','abcd',false)
    OR public.dashboard_generation_finish(owner_id,run_id,'{}') THEN RAISE EXCEPTION 'legacy RPC bypass'; END IF;
  IF (SELECT status FROM public.dashboard_generation_runs WHERE id=run_id)<>'pending' THEN RAISE EXCEPTION 'legacy finish mutated v2'; END IF;
  IF public.dashboard_generation_finish_v2(owner_id,run_id,NULL,old_lease) THEN RAISE EXCEPTION 'null output saved'; END IF;
  IF (SELECT status FROM public.dashboard_generation_runs WHERE id=run_id)<>'pre_dispatch_failed'
    OR (SELECT model_used FROM public.ai_audit_log WHERE id=old_lease)<>'dashboard+pre_dispatch_failed' THEN RAISE EXCEPTION 'pre-dispatch failure evidence'; END IF;
  b:=public.dashboard_generation_request_v2(owner_id,'open','Asia/Seoul','ko');
  new_lease:=(b->>'lease_token')::uuid;
  IF b->>'kind'<>'claimed' OR b->>'id'<>run_id::text OR new_lease IS NULL OR new_lease=old_lease THEN RAISE EXCEPTION 'failed same-key recovery'; END IF;
  IF (SELECT created_at FROM public.dashboard_generation_runs WHERE id=run_id)<>stamp
    OR (SELECT count(*) FROM public.dashboard_generation_runs WHERE user_id=owner_id)<>1
    OR (SELECT count(*) FROM public.ai_audit_log WHERE user_id=owner_id)<>2 THEN RAISE EXCEPTION 'quota/audit lineage lost'; END IF;
  -- A valid old token is not authority over its replacement, even if the new
  -- lease is ready to dispatch. Guard these checks independently by mutation.
  IF public.dashboard_generation_audit_attempt_v2(owner_id,run_id,'claude-sonnet-5','low','abcd',false,old_lease) THEN RAISE EXCEPTION 'stale lease dispatched'; END IF;
  PERFORM public.dashboard_generation_finish_v2(owner_id,run_id,NULL,old_lease);
  IF (SELECT status FROM public.dashboard_generation_runs WHERE id=run_id)<>'pending' THEN RAISE EXCEPTION 'stale lease finished'; END IF;
  IF NOT public.dashboard_generation_audit_attempt_v2(owner_id,run_id,'claude-sonnet-5','low','abcd',false,new_lease) THEN RAISE EXCEPTION 'new lease dispatch'; END IF;
  IF public.dashboard_generation_audit_result_v2(owner_id,run_id,'dcba','completed',12,'green',10,old_lease) THEN RAISE EXCEPTION 'stale lease audited'; END IF;
  IF public.dashboard_generation_finish_v2(owner_id,run_id,'{}',old_lease) THEN RAISE EXCEPTION 'stale lease saved output'; END IF;
  IF (SELECT status FROM public.dashboard_generation_runs WHERE id=run_id)<>'dispatched' THEN RAISE EXCEPTION 'stale finish changed replacement'; END IF;
  IF NOT public.dashboard_generation_audit_result_v2(owner_id,run_id,'dcba','completed',12,'green',10,new_lease)
    OR NOT public.dashboard_generation_audit_result_v2(owner_id,run_id,'dcba','completed',12,'green',10,new_lease)
    OR NOT public.dashboard_generation_finish_v2(owner_id,run_id,'{"line":"Read"}',new_lease) THEN RAISE EXCEPTION 'new lease result'; END IF;
  IF public.dashboard_generation_request_v2(owner_id,'open','Asia/Seoul','ko')->>'kind'<>'ready'
    OR (SELECT count(*) FROM public.ai_audit_log WHERE user_id=owner_id)<>2
    OR (SELECT model_used FROM public.ai_audit_log WHERE id=old_lease)<>'dashboard+pre_dispatch_failed' THEN RAISE EXCEPTION 'result overwrote historical audit'; END IF;

  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    FOREACH fn IN ARRAY ARRAY['public.dashboard_generation_request_v2(uuid,text,text,text)'::regprocedure,
      'public.dashboard_generation_audit_attempt_v2(uuid,uuid,text,text,text,boolean,uuid)'::regprocedure,
      'public.dashboard_generation_audit_result_v2(uuid,uuid,text,text,integer,text,integer,uuid)'::regprocedure,
      'public.dashboard_generation_finish_v2(uuid,uuid,jsonb,uuid)'::regprocedure] LOOP
      IF has_function_privilege(role_name,fn,'EXECUTE') IS DISTINCT FROM (role_name='service_role') THEN RAISE EXCEPTION 'v2 ACL: % %',role_name,fn; END IF;
      IF NOT (SELECT prosecdef AND proconfig @> ARRAY['search_path=""','row_security=off'] FROM pg_proc WHERE oid=fn) THEN RAISE EXCEPTION 'v2 definer'; END IF;
    END LOOP;
  END LOOP;
END $$;

DO $$
DECLARE owner_id uuid := '00000000-0000-0000-0000-000000000072'; a jsonb; b jsonb; run_id uuid; old_lease uuid;
BEGIN
  a:=public.dashboard_generation_request_v2(owner_id,'triage','Asia/Seoul','ko');
  run_id:=(a->>'id')::uuid; old_lease:=(a->>'lease_token')::uuid;
  IF public.dashboard_generation_request_v2(owner_id,'triage','Asia/Seoul','ko')->>'kind'<>'busy' THEN RAISE EXCEPTION 'live lease stolen'; END IF;
  UPDATE public.dashboard_generation_runs SET leased_at=clock_timestamp()-interval '3 minutes' WHERE id=run_id;
  b:=public.dashboard_generation_request_v2(owner_id,'triage','Asia/Seoul','ko');
  IF b->>'kind'<>'claimed' OR b->>'lease_token'=old_lease::text
    OR (SELECT model_used FROM public.ai_audit_log WHERE id=old_lease)<>'dashboard+pre_dispatch_failed' THEN RAISE EXCEPTION 'stale pending recovery'; END IF;
  IF (SELECT count(*) FROM public.ai_audit_log WHERE user_id=owner_id)<>2 THEN RAISE EXCEPTION 'stale audit orphan'; END IF;
END $$;

DO $$
DECLARE owner_id uuid := '00000000-0000-0000-0000-000000000073'; a jsonb; run_id uuid; lease uuid; state text;
BEGIN
  a:=public.dashboard_generation_request_v2(owner_id,'open','Asia/Seoul','ko');
  run_id:=(a->>'id')::uuid; lease:=(a->>'lease_token')::uuid;
  IF NOT public.dashboard_generation_audit_attempt_v2(owner_id,run_id,'claude-sonnet-5','low','abcd',false,lease) THEN RAISE EXCEPTION 'dispatch fixture'; END IF;
  FOREACH state IN ARRAY ARRAY['pending','failed','pre_dispatch_failed','dispatched'] LOOP
    UPDATE public.dashboard_generation_runs SET status=state,leased_at=clock_timestamp()-interval '4 minutes' WHERE id=run_id;
    IF public.dashboard_generation_request_v2(owner_id,'open','Asia/Seoul','ko')->>'kind'<>'waiting'
      OR (SELECT lease_token FROM public.dashboard_generation_runs WHERE id=run_id)<>lease THEN RAISE EXCEPTION 'dispatched reservation recovered: %',state; END IF;
  END LOOP;
  -- Unknown old claims remain terminal even if nobody can prove dispatch.
  owner_id:='00000000-0000-0000-0000-000000000074';
  a:=public.dashboard_generation_request(owner_id,'open','Asia/Seoul','ko');
  UPDATE public.dashboard_generation_runs SET status='failed' WHERE id=(a->>'id')::uuid;
  IF public.dashboard_generation_request_v2(owner_id,'open','Asia/Seoul','ko')->>'kind'<>'waiting' THEN RAISE EXCEPTION 'legacy ambiguity retried'; END IF;
END $$;

DO $$
DECLARE owner_id uuid := '00000000-0000-0000-0000-000000000075'; a jsonb; run_id uuid; lease uuid;
BEGIN
  a:=public.dashboard_generation_request_v2(owner_id,'open','Asia/Seoul','ko');
  run_id:=(a->>'id')::uuid; lease:=(a->>'lease_token')::uuid;
  -- Daybreak add1 r1: ending red must not depend on heartbeat/lease freshness.
  -- Paid dispatch still must. A replaced token remains invalid in both paths.
  UPDATE public.dashboard_generation_retention SET last_purged_at=clock_timestamp()-interval '3 hours';
  UPDATE public.dashboard_generation_runs SET leased_at=clock_timestamp()-interval '4 minutes' WHERE id=run_id;
  IF public.dashboard_generation_audit_attempt_v2(owner_id,run_id,'claude-sonnet-5','low','abcd',false,lease) THEN RAISE EXCEPTION 'red fixture stale heartbeat allowed paid dispatch'; END IF;
  IF public.dashboard_generation_audit_attempt_v2(owner_id,run_id,'claude-sonnet-5','low','abcd',true,gen_random_uuid()) THEN RAISE EXCEPTION 'red accepted wrong lease'; END IF;
  IF NOT public.dashboard_generation_audit_attempt_v2(owner_id,run_id,'claude-sonnet-5','low','abcd',true,lease) THEN RAISE EXCEPTION 'red terminal lost at stale heartbeat'; END IF;
  PERFORM public.dashboard_generation_finish_v2(owner_id,run_id,NULL,lease);
  PERFORM public.purge_dashboard_generation();
  UPDATE public.dashboard_generation_runs SET leased_at=clock_timestamp()-interval '4 minutes' WHERE id=run_id;
  IF public.dashboard_generation_request_v2(owner_id,'open','Asia/Seoul','ko')->>'kind'<>'waiting'
    OR (SELECT model_used FROM public.ai_audit_log WHERE id=lease)<>'claude-sonnet-5+crisis'
    OR (SELECT dispatched_at FROM public.dashboard_generation_runs WHERE id=run_id) IS NOT NULL THEN RAISE EXCEPTION 'red repeated or charged'; END IF;

  owner_id:='00000000-0000-0000-0000-000000000076';
  a:=public.dashboard_generation_request_v2(owner_id,'open','Asia/Seoul','ko');
  run_id:=(a->>'id')::uuid; lease:=(a->>'lease_token')::uuid;
  UPDATE public.dashboard_generation_retention SET last_purged_at=clock_timestamp()-interval '4 hours';
  IF public.dashboard_generation_audit_attempt_v2(owner_id,run_id,'claude-sonnet-5','low','abcd',false,lease) THEN RAISE EXCEPTION 'stale heartbeat dispatch'; END IF;
  PERFORM public.dashboard_generation_finish_v2(owner_id,run_id,NULL,lease);
  IF public.dashboard_generation_request_v2(owner_id,'open','Asia/Seoul','ko')->>'kind'<>'denied' THEN RAISE EXCEPTION 'stale heartbeat request'; END IF;
  PERFORM public.purge_dashboard_generation();
  IF public.dashboard_generation_request_v2(owner_id,'open','Asia/Seoul','ko')->>'kind'<>'claimed' THEN RAISE EXCEPTION 'heartbeat repair recovery'; END IF;

  owner_id:='00000000-0000-0000-0000-000000000077';
  a:=public.dashboard_generation_request_v2(owner_id,'open','Asia/Seoul','ko');
  run_id:=(a->>'id')::uuid; lease:=(a->>'lease_token')::uuid;
  UPDATE public.users SET privacy_prefs='{"recommendations":false}' WHERE id=owner_id;
  PERFORM public.dashboard_generation_finish_v2(owner_id,run_id,NULL,lease);
  UPDATE public.users SET privacy_prefs='{"recommendations":true}' WHERE id=owner_id;
  IF public.dashboard_generation_request_v2(owner_id,'open','Asia/Seoul','ko')->>'kind'<>'waiting' THEN RAISE EXCEPTION 'withdrawal reopened'; END IF;
END $$;

-- Every lease consumes an attempt, including an expired pending reservation.
DO $$
DECLARE owner_id uuid; a jsonb; b jsonb; last_lease uuid; action text; mode text;
  limit_count integer; n integer; scenario integer := 100;
BEGIN
  FOREACH action IN ARRAY ARRAY['open','summary','triage'] LOOP
    limit_count := CASE WHEN action='open' THEN 3 ELSE 48 END;
    FOREACH mode IN ARRAY ARRAY['failed','expired','normal'] LOOP
      scenario := scenario+1;
      owner_id := ('00000000-0000-0000-0000-'||lpad(scenario::text,12,'0'))::uuid;
      INSERT INTO auth.users(id) VALUES(owner_id);
      INSERT INTO public.users(id) VALUES(owner_id);
      INSERT INTO public.ops_routines(id,user_id,title) VALUES(owner_id,owner_id,'Read');
      FOR n IN 1..limit_count LOOP
        a := public.dashboard_generation_request_v2(owner_id,action,CASE WHEN n=1 THEN 'UTC' END,'ko');
        IF a->>'kind' IS DISTINCT FROM 'claimed' THEN RAISE EXCEPTION 'attempt %/% % %: %',n,limit_count,action,mode,a; END IF;
        last_lease := (a->>'lease_token')::uuid;
        IF mode='failed' THEN
          PERFORM public.dashboard_generation_finish_v2(owner_id,(a->>'id')::uuid,NULL,last_lease);
        ELSIF mode='expired' THEN
          UPDATE public.dashboard_generation_runs SET leased_at=clock_timestamp()-interval '4 minutes' WHERE id=(a->>'id')::uuid;
        ELSE
          IF NOT public.dashboard_generation_audit_attempt_v2(owner_id,(a->>'id')::uuid,'claude-sonnet-5','low','abcd',false,last_lease)
            OR NOT public.dashboard_generation_finish_v2(owner_id,(a->>'id')::uuid,'{}',last_lease) THEN RAISE EXCEPTION 'normal completion'; END IF;
          -- Simulate the next distinct key/source without a failed call.
          UPDATE public.dashboard_generation_runs SET request_key='normal-'||n,source_hash='previous-source' WHERE id=(a->>'id')::uuid;
        END IF;
      END LOOP;
      b := public.dashboard_generation_request_v2(owner_id,action,NULL,'ko');
      IF b->>'kind' IS DISTINCT FROM 'limited' THEN RAISE EXCEPTION 'retry quota bypass % %: %',action,mode,b; END IF;
      IF (SELECT lease_token FROM public.dashboard_generation_runs WHERE id=(a->>'id')::uuid) IS DISTINCT FROM last_lease
        OR (SELECT count(*) FROM public.ai_audit_log WHERE user_id=owner_id)<>limit_count
        OR (SELECT count(*) FROM public.dashboard_generation_runs WHERE user_id=owner_id)<>(CASE WHEN mode='normal' THEN limit_count ELSE 1 END)
        THEN RAISE EXCEPTION 'limited changed lease/audit/run'; END IF;
      IF mode='expired' AND (SELECT model_used FROM public.ai_audit_log WHERE id=last_lease)<>'dashboard+attempt'
        THEN RAISE EXCEPTION 'limited changed existing audit'; END IF;
      -- A new key, or an old Edge still in flight, shares the same allowance.
      UPDATE public.dashboard_generation_runs SET request_key='old-'||request_key WHERE user_id=owner_id;
      IF public.dashboard_generation_request_v2(owner_id,action,NULL,'ko')->>'kind' IS DISTINCT FROM 'limited'
        OR public.dashboard_generation_request(owner_id,action,NULL,'ko')->>'kind' IS DISTINCT FROM 'limited'
        THEN RAISE EXCEPTION 'new key or legacy quota bypass'; END IF;
      -- A +14 -> -12 timezone change can keep a triage date/key for 50h.
      -- Purge may remove the first run while today's lease audits still count.
      UPDATE public.dashboard_generation_runs SET created_at=now()-interval '49 hours' WHERE user_id=owner_id;
      PERFORM public.purge_dashboard_generation();
      IF EXISTS(SELECT 1 FROM public.dashboard_generation_runs WHERE user_id=owner_id)
        OR public.dashboard_generation_request_v2(owner_id,action,NULL,'ko')->>'kind' IS DISTINCT FROM 'limited'
        OR public.dashboard_generation_request(owner_id,action,NULL,'ko')->>'kind' IS DISTINCT FROM 'limited'
        THEN RAISE EXCEPTION 'purged run discarded recent attempt quota'; END IF;
    END LOOP;
  END LOOP;
END $$;

-- Test both halves of the day OR separately. Moving only the run's timestamp
-- must not discard today's retries, and midnight in just one calendar must
-- not reopen the allowance. Timestamps here simulate those boundary instants.
DO $$
DECLARE owner_id uuid := '00000000-0000-0000-0000-000000000110'; a jsonb;
  zone text := 'Etc/GMT-12'; stamp timestamptz; local_day date; utc_day date;
  mode text; n integer; fn regprocedure; role_name text;
BEGIN
  INSERT INTO auth.users(id) VALUES(owner_id);
  INSERT INTO public.users(id) VALUES(owner_id);
  INSERT INTO public.ops_routines(id,user_id,title) VALUES(owner_id,owner_id,'Read');
  FOR n IN 1..3 LOOP
    a := public.dashboard_generation_request_v2(owner_id,'open',zone,'ko');
    IF a->>'kind' IS DISTINCT FROM 'claimed' THEN RAISE EXCEPTION 'day boundary fixture'; END IF;
    PERFORM public.dashboard_generation_finish_v2(owner_id,(a->>'id')::uuid,NULL,(a->>'lease_token')::uuid);
  END LOOP;
  UPDATE public.dashboard_generation_runs SET created_at=now()-interval '30 hours' WHERE user_id=owner_id;
  IF public.dashboard_generation_request_v2(owner_id,'open',zone,'ko')->>'kind' IS DISTINCT FROM 'limited'
    THEN RAISE EXCEPTION 'old run discarded current-day retries'; END IF;
  local_day := (now() AT TIME ZONE zone)::date;
  utc_day := (now() AT TIME ZONE 'UTC')::date;
  FOREACH mode IN ARRAY ARRAY['local-only','utc-only'] LOOP
    IF mode='local-only' THEN
      stamp := local_day::timestamp AT TIME ZONE zone;
      IF (stamp AT TIME ZONE 'UTC')::date=utc_day THEN stamp := stamp+interval '23 hours 59 minutes'; END IF;
      IF (stamp AT TIME ZONE zone)::date<>local_day OR (stamp AT TIME ZONE 'UTC')::date=utc_day THEN RAISE EXCEPTION 'local-only fixture'; END IF;
    ELSE
      stamp := utc_day::timestamp AT TIME ZONE 'UTC';
      IF (stamp AT TIME ZONE zone)::date=local_day THEN stamp := stamp+interval '23 hours 59 minutes'; END IF;
      IF (stamp AT TIME ZONE 'UTC')::date<>utc_day OR (stamp AT TIME ZONE zone)::date=local_day THEN RAISE EXCEPTION 'utc-only fixture'; END IF;
    END IF;
    UPDATE public.ai_audit_log SET created_at=stamp WHERE user_id=owner_id;
    IF public.dashboard_generation_request_v2(owner_id,'open',zone,'ko')->>'kind' IS DISTINCT FROM 'limited'
      THEN RAISE EXCEPTION 'midnight quota reopened: %',mode; END IF;
  END LOOP;
  UPDATE public.ai_audit_log SET created_at=now()-interval '48 hours' WHERE user_id=owner_id;
  FOR n IN 1..3 LOOP
    a := public.dashboard_generation_request_v2(owner_id,'open',zone,'ko');
    IF a->>'kind' IS DISTINCT FROM 'claimed' THEN RAISE EXCEPTION 'new day allowance %',n; END IF;
    PERFORM public.dashboard_generation_finish_v2(owner_id,(a->>'id')::uuid,NULL,(a->>'lease_token')::uuid);
  END LOOP;
  IF public.dashboard_generation_request_v2(owner_id,'open',zone,'ko')->>'kind' IS DISTINCT FROM 'limited'
    OR (SELECT count(*) FROM public.ai_audit_log WHERE user_id=owner_id)<>6
    THEN RAISE EXCEPTION 'new day retries unbounded'; END IF;
  -- Neither internal helper is a new service/client RPC.
  FOREACH fn IN ARRAY ARRAY['public.dashboard_generation_eligibility(uuid)'::regprocedure,
    'public.dashboard_generation_attempt_count(uuid,text,text)'::regprocedure] LOOP
    FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
      IF has_function_privilege(role_name,fn,'EXECUTE') THEN RAISE EXCEPTION 'private helper ACL'; END IF;
    END LOOP;
    IF NOT (SELECT prosecdef AND proconfig @> ARRAY['search_path=""','row_security=off'] FROM pg_proc WHERE oid=fn)
      THEN RAISE EXCEPTION 'private helper definer'; END IF;
  END LOOP;
END $$;

-- Every non-retention disqualifier is terminal even when heartbeat is stale.
-- Reset only the fixture status after invalidation to exercise finish's own
-- eligibility decision independently of the existing withdrawal triggers.
DO $$
DECLARE owner_id uuid; a jsonb; mode text; n integer := 120;
BEGIN
  FOREACH mode IN ARRAY ARRAY['suspended','minor','birth-date','recommendations','consent','token','auth','tombstone'] LOOP
    n := n+1;
    owner_id := ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid;
    INSERT INTO auth.users(id) VALUES(owner_id);
    INSERT INTO public.users(id) VALUES(owner_id);
    INSERT INTO public.ops_routines(id,user_id,title) VALUES(owner_id,owner_id,'Read');
    a := public.dashboard_generation_request_v2(owner_id,'open','UTC','ko');
    IF a->>'kind' IS DISTINCT FROM 'claimed' THEN RAISE EXCEPTION 'eligibility fixture'; END IF;
    CASE mode
      WHEN 'suspended' THEN UPDATE public.users SET account_status='suspended' WHERE id=owner_id;
      WHEN 'minor' THEN UPDATE public.users SET minor_tier='minor_self' WHERE id=owner_id;
      WHEN 'birth-date' THEN UPDATE public.users SET birth_date=current_date WHERE id=owner_id;
      WHEN 'recommendations' THEN UPDATE public.users SET privacy_prefs='{"recommendations":false}' WHERE id=owner_id;
      WHEN 'consent' THEN UPDATE public.users SET test_consent=false WHERE id=owner_id;
      WHEN 'token' THEN UPDATE public.users SET test_token=repeat('b',64) WHERE id=owner_id;
      WHEN 'auth' THEN UPDATE auth.users SET email_confirmed_at=NULL WHERE id=owner_id;
      WHEN 'tombstone' THEN INSERT INTO public.account_deletion_tombstones VALUES(owner_id);
    END CASE;
    UPDATE public.dashboard_generation_runs SET status='pending' WHERE id=(a->>'id')::uuid;
    UPDATE public.dashboard_generation_retention SET last_purged_at=clock_timestamp()-interval '4 hours';
    PERFORM public.dashboard_generation_finish_v2(owner_id,(a->>'id')::uuid,NULL,(a->>'lease_token')::uuid);
    IF (SELECT status FROM public.dashboard_generation_runs WHERE id=(a->>'id')::uuid)<>'failed'
      THEN RAISE EXCEPTION 'ineligible pending recovered: %',mode; END IF;
    PERFORM public.purge_dashboard_generation();
  END LOOP;
END $$;

-- A failed audit write cannot commit a claim without its attempt evidence.
CREATE FUNCTION pg_temp.reject_dashboard_attempt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'fixture_audit_failure'; END $$;
CREATE TRIGGER fixture_reject_dashboard_audit BEFORE INSERT ON public.ai_audit_log
  FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_dashboard_attempt();
DO $$ BEGIN
  BEGIN
    PERFORM public.dashboard_generation_request_v2('00000000-0000-0000-0000-000000000078','open','Asia/Seoul','ko');
    RAISE EXCEPTION 'audit failure did not abort claim';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'fixture_audit_failure' THEN RAISE; END IF;
  END;
  IF EXISTS(SELECT 1 FROM public.dashboard_generation_runs WHERE user_id='00000000-0000-0000-0000-000000000078') THEN RAISE EXCEPTION 'unaudited claim survived'; END IF;
END $$;
ROLLBACK;
