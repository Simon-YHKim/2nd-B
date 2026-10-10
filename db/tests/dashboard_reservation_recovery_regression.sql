\set ON_ERROR_STOP on
BEGIN;
SET LOCAL request.jwt.claim.role='service_role';
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
