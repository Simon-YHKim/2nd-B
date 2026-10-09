BEGIN;
SET LOCAL request.jwt.claim.role='service_role';
INSERT INTO auth.users(id) VALUES('00000000-0000-0000-0000-000000000091');
INSERT INTO public.users(id) VALUES('00000000-0000-0000-0000-000000000091');
INSERT INTO public.ops_routines(id,user_id,title) VALUES
 ('10000000-0000-0000-0000-000000000091','00000000-0000-0000-0000-000000000091','Read'),
 ('10000000-0000-0000-0000-000000000092','00000000-0000-0000-0000-000000000091','Write');
DO $$
DECLARE owner uuid:='00000000-0000-0000-0000-000000000091'; a jsonb; b jsonb; run_id uuid; written timestamptz;
BEGIN
 a:=public.dashboard_generation_request(owner,'open','Asia/Seoul','ko'); run_id:=(a->>'id')::uuid;
 PERFORM public.dashboard_generation_dispatch(owner,run_id);
 IF NOT public.dashboard_generation_finish(owner,run_id,jsonb_build_object('slot',a->>'slot','line','Read today.',
  'basis_refs',jsonb_build_array(jsonb_build_object('kind','routine','id','10000000-0000-0000-0000-000000000091')),
  'reminder_suggestions','[]'::jsonb)) THEN RAISE EXCEPTION 'fixture finish'; END IF;
 SELECT created_at INTO written FROM public.dashboard_generation_runs WHERE id=run_id;
 INSERT INTO public.ops_routine_logs(routine_id,user_id,completed_on)
 VALUES('10000000-0000-0000-0000-000000000091',owner,(now() AT TIME ZONE 'Asia/Seoul')::date);
 b:=public.dashboard_generation_request(owner,'open','Asia/Seoul','ko');
 IF b->>'kind'<>'ready' OR b->>'previous'<>'true' OR (b->>'generatedAt')::timestamptz<>written THEN
  RAISE EXCEPTION 'completion discarded last note: %',b; END IF;
 IF (SELECT count(*) FROM public.dashboard_generation_runs WHERE user_id=owner)<>1 THEN RAISE EXCEPTION 'extra attempt'; END IF;
 UPDATE public.users SET test_consent=false WHERE id=owner;
 IF public.dashboard_generation_request(owner,'open','Asia/Seoul','ko')->>'kind'<>'denied' THEN RAISE EXCEPTION 'withdrawn note leaked'; END IF;
 UPDATE public.users SET test_consent=true,test_token=repeat('b',64) WHERE id=owner;
 IF public.dashboard_generation_request(owner,'open','Asia/Seoul','ko')->>'kind'<>'waiting' THEN RAISE EXCEPTION 'old consent reused'; END IF;
 UPDATE public.users SET test_token=repeat('a',64) WHERE id=owner;
 UPDATE public.dashboard_generation_runs SET expires_at=now()-interval '1 second' WHERE id=run_id;
 IF public.dashboard_generation_request(owner,'open','Asia/Seoul','ko')->>'kind'<>'waiting' THEN RAISE EXCEPTION 'retention extended'; END IF;
 UPDATE public.dashboard_generation_runs SET expires_at=now()+interval '1 hour' WHERE id=run_id;
 DELETE FROM public.ops_routines WHERE id='10000000-0000-0000-0000-000000000091';
 IF public.dashboard_generation_request(owner,'open','Asia/Seoul','ko')->>'kind'<>'waiting' THEN RAISE EXCEPTION 'deleted evidence reused'; END IF;
 IF has_function_privilege('authenticated','public.dashboard_generation_request(uuid,text,text,text)','EXECUTE')
 OR has_table_privilege('authenticated','public.dashboard_generation_runs','SELECT') THEN RAISE EXCEPTION 'client ACL open'; END IF;
END $$;
ROLLBACK;
