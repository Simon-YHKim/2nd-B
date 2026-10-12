\set ON_ERROR_STOP on
BEGIN;
SET LOCAL request.jwt.claim.role='service_role';
SET LOCAL jit=off;
CREATE TEMP TABLE recovery_checks(label text);
CREATE FUNCTION pg_temp.recovery_check(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'G206: %',label; END IF;
  INSERT INTO recovery_checks VALUES(label);
END $$;
DO $$
DECLARE mode text; n integer:=500; u uuid; a jsonb; r uuid; l uuid; before_run jsonb; before_audit jsonb;
BEGIN
  FOREACH mode IN ARRAY ARRAY['unconfirmed','deleted','tombstone','suspended','minor','birth-date','recommendations','consent','token'] LOOP
    n:=n+1; u:=('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid;
    INSERT INTO auth.users(id) VALUES(u); INSERT INTO public.users(id) VALUES(u);
    INSERT INTO public.ops_routines(id,user_id,title) VALUES(u,u,'Read');
    a:=public.dashboard_generation_request_v2(u,'open','UTC','ko'); r:=(a->>'id')::uuid; l:=(a->>'lease_token')::uuid;
    PERFORM pg_temp.recovery_check(a->>'kind'='claimed','begin fixture '||mode);
    CASE mode
      WHEN 'unconfirmed' THEN UPDATE auth.users SET email_confirmed_at=NULL WHERE id=u;
      WHEN 'deleted' THEN UPDATE auth.users SET deleted_at=now() WHERE id=u;
      WHEN 'tombstone' THEN INSERT INTO public.account_deletion_tombstones VALUES(u);
      WHEN 'suspended' THEN UPDATE public.users SET account_status='suspended' WHERE id=u;
      WHEN 'minor' THEN UPDATE public.users SET minor_tier='minor_self' WHERE id=u;
      WHEN 'birth-date' THEN UPDATE public.users SET birth_date=current_date WHERE id=u;
      WHEN 'recommendations' THEN UPDATE public.users SET privacy_prefs='{"recommendations":false}' WHERE id=u;
      WHEN 'consent' THEN UPDATE public.users SET test_consent=false WHERE id=u;
      WHEN 'token' THEN UPDATE public.users SET test_token=repeat('b',64) WHERE id=u;
    END CASE;
    -- Exercise begin itself even when an existing invalidator already closed it.
    UPDATE public.dashboard_generation_runs SET status='pending' WHERE id=r;
    SELECT to_jsonb(g) INTO before_run FROM public.dashboard_generation_runs g WHERE id=r;
    SELECT to_jsonb(g) INTO before_audit FROM public.ai_audit_log g WHERE id=l;
    PERFORM pg_temp.recovery_check(public.dashboard_generation_begin_classification_v2(u,r,l) IS FALSE,'ineligible begin denied '||mode);
    PERFORM pg_temp.recovery_check((SELECT to_jsonb(g) FROM public.dashboard_generation_runs g WHERE id=r)=before_run,'begin run unchanged '||mode);
    PERFORM pg_temp.recovery_check((SELECT to_jsonb(g) FROM public.ai_audit_log g WHERE id=l)=before_audit,'begin audit unchanged '||mode);
  END LOOP;
END $$;

-- r4 finding 2: provider usage is optional even for completed. NULL means
-- unknown, not zero. Preserve this contract for failures AND successful JSON.
DO $$
DECLARE outcome text; n integer:=520; u uuid; a jsonb; r uuid; l uuid; before_audit jsonb;
BEGIN
  FOREACH outcome IN ARRAY ARRAY['completed','transport_failed','invalid_response','rejected_output','invalid_json','consent_withheld','http_429'] LOOP
    n:=n+1; u:=('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid;
    INSERT INTO auth.users(id) VALUES(u); INSERT INTO public.users(id) VALUES(u);
    INSERT INTO public.ops_routines(id,user_id,title) VALUES(u,u,'Read');
    a:=public.dashboard_generation_request_v2(u,'open','UTC','ko'); r:=(a->>'id')::uuid; l:=(a->>'lease_token')::uuid;
    PERFORM pg_temp.recovery_check(public.dashboard_generation_audit_attempt_v2(u,r,'claude-sonnet-5','low','abcd',false,l),'token fixture dispatch '||outcome);
    SELECT to_jsonb(g) INTO before_audit FROM public.ai_audit_log g WHERE id=l;
    BEGIN
      PERFORM public.dashboard_generation_audit_result_v2(u,r,'abcd',outcome,1,'green',-1,l);
      RAISE EXCEPTION 'negative tokens accepted';
    EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
    PERFORM pg_temp.recovery_check((SELECT to_jsonb(g) FROM public.ai_audit_log g WHERE id=l)=before_audit,'negative tokens leave audit unchanged '||outcome);
    PERFORM pg_temp.recovery_check(public.dashboard_generation_audit_result_v2(u,r,'abcd',outcome,1,'green',NULL,l),'unknown tokens accepted '||outcome);
    PERFORM pg_temp.recovery_check((SELECT total_tokens IS NULL FROM public.ai_audit_log WHERE id=l),'unknown tokens retained '||outcome);
  END LOOP;
END $$;

-- v2 must return a valid prior note in busy, waiting and limited branches.
-- Recovery still claims when safe: fallback must not hide a recoverable lease.
DO $$
DECLARE u uuid:='00000000-0000-0000-0000-000000000540'; a jsonb; b jsonb; r uuid; l uuid; mode text;
BEGIN
  INSERT INTO auth.users(id) VALUES(u); INSERT INTO public.users(id) VALUES(u);
  INSERT INTO public.ops_routines(id,user_id,title) VALUES(u,u,'Read');
  INSERT INTO public.dashboard_generation_runs(user_id,purpose,request_key,source_hash,consent_token,status,output,created_at,expires_at)
  VALUES(u,'daily_note','previous','old',repeat('a',64),'ready',jsonb_build_object('line','Read today.','slot','evening',
    'basis_refs',jsonb_build_array(jsonb_build_object('kind','routine','id',u)),'reminder_suggestions','[]'::jsonb),now()-interval '1 hour',now()+interval '1 day');
  a:=public.dashboard_generation_request_v2(u,'open','UTC','ko'); r:=(a->>'id')::uuid; l:=(a->>'lease_token')::uuid;
  PERFORM pg_temp.recovery_check(a->>'kind'='claimed','prior note does not hide new claim');
  UPDATE public.dashboard_generation_runs SET status='ready',output=jsonb_build_object('line','Current.','slot',a->>'slot',
    'basis_refs',jsonb_build_array(jsonb_build_object('kind','routine','id',u)),'reminder_suggestions','[]'::jsonb) WHERE id=r;
  UPDATE public.dashboard_generation_runs SET created_at=now()+interval '1 minute' WHERE user_id=u AND request_key='previous';
  b:=public.dashboard_generation_request_v2(u,'open','UTC','ko');
  PERFORM pg_temp.recovery_check(b->'previous'='false'::jsonb AND b->'value'->>'line'='Current.','v2 valid current wins over newer prior');
  UPDATE public.dashboard_generation_runs SET output=jsonb_set(output,'{basis_refs}','{}') WHERE id=r;
  b:=public.dashboard_generation_request_v2(u,'open','UTC','ko');
  PERFORM pg_temp.recovery_check(b->'previous'='true'::jsonb AND b->'value'->>'line'='Read today.','v2 malformed current returns valid prior');
  UPDATE public.dashboard_generation_runs SET status='failed' WHERE user_id=u AND request_key='previous';
  b:=public.dashboard_generation_request_v2(u,'open','UTC','ko');
  PERFORM pg_temp.recovery_check(b->>'kind'='waiting','v2 malformed current without prior waits');
  UPDATE public.dashboard_generation_runs SET status='ready',created_at=now()-interval '1 hour' WHERE user_id=u AND request_key='previous';
  UPDATE public.dashboard_generation_runs SET output=NULL WHERE id=r;
  FOREACH mode IN ARRAY ARRAY['pending','failed'] LOOP
    UPDATE public.dashboard_generation_runs SET status=mode WHERE id=r;
    b:=public.dashboard_generation_request_v2(u,'open','UTC','ko');
    PERFORM pg_temp.recovery_check(b->>'kind'='ready' AND b->'previous'='true'::jsonb
      AND b->>'generatedAt' IS NOT NULL AND b->'value'->>'line'='Read today.','v2 prior note instead of '||mode);
  END LOOP;
  UPDATE public.dashboard_generation_runs SET status='pre_dispatch_failed' WHERE id=r;
  b:=public.dashboard_generation_request_v2(u,'open','UTC','ko');
  PERFORM pg_temp.recovery_check(b->>'kind'='claimed' AND b->>'id'=r::text AND b->>'lease_token'<>l::text,'recoverable lease wins over fallback');
  PERFORM public.dashboard_generation_finish_v2(u,r,NULL,(b->>'lease_token')::uuid);
  -- Force three attempts into this service day irrespective of UTC before 06.
  UPDATE public.dashboard_generation_runs SET created_at=now() WHERE user_id=u AND lease_token IS NULL;
  b:=public.dashboard_generation_request_v2(u,'open','UTC','ko');
  PERFORM pg_temp.recovery_check(b->>'kind'='ready' AND b->'previous'='true'::jsonb,'v2 limited recovery returns prior note');
  PERFORM pg_temp.recovery_check((SELECT count(*)=2 FROM public.ai_audit_log WHERE user_id=u),'limited recovery creates no audit');
END $$;
SELECT count(*) AS recovery_assertions FROM recovery_checks;
ROLLBACK;
