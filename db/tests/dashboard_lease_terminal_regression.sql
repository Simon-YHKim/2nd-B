\set ON_ERROR_STOP on
BEGIN;
SET LOCAL request.jwt.claim.role='service_role';
SET LOCAL jit=off;

-- Each scenario owns a fresh user, avoiding dependence on the clock's slot.
CREATE FUNCTION pg_temp.lease_fixture(n integer) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE owner_id uuid := ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid; a jsonb;
BEGIN
  PERFORM public.purge_dashboard_generation();
  INSERT INTO auth.users(id) VALUES(owner_id);
  INSERT INTO public.users(id) VALUES(owner_id);
  INSERT INTO public.ops_routines(id,user_id,title) VALUES(owner_id,owner_id,'Read');
  a:=public.dashboard_generation_request_v2(owner_id,'open','UTC','ko');
  IF a->>'kind' IS DISTINCT FROM 'claimed' THEN RAISE EXCEPTION 'terminal fixture'; END IF;
  RETURN a||jsonb_build_object('owner',owner_id);
END $$;

DO $$
DECLARE a jsonb:=pg_temp.lease_fixture(201); u uuid:=(a->>'owner')::uuid;
  r uuid:=(a->>'id')::uuid; l uuid:=(a->>'lease_token')::uuid;
BEGIN
  UPDATE public.dashboard_generation_runs SET created_at=now()-interval '49 hours' WHERE id=r;
  PERFORM public.purge_dashboard_generation();
  IF NOT EXISTS(SELECT 1 FROM public.dashboard_generation_runs WHERE id=r AND lease_token=l)
    THEN RAISE EXCEPTION 'purge removed recent lease'; END IF;
  IF NOT public.dashboard_generation_audit_attempt_v2(u,r,'claude-sonnet-5','low','abcd',false,l)
    THEN RAISE EXCEPTION 'recent lease cannot dispatch'; END IF;
  PERFORM public.purge_dashboard_generation();
  IF public.dashboard_generation_request_v2(u,'open','UTC','ko')->>'kind' NOT IN ('busy','waiting')
    OR NOT EXISTS(SELECT 1 FROM public.dashboard_generation_runs WHERE id=r AND dispatched_at IS NOT NULL)
    THEN RAISE EXCEPTION 'purge reopened dispatched key'; END IF;
  IF NOT public.dashboard_generation_audit_result_v2(u,r,'abcd','completed',1,'green',1,l)
    OR NOT public.dashboard_generation_finish_v2(u,r,'{}',l) THEN RAISE EXCEPTION 'purge broke current completion'; END IF;
  -- Old v2 and legacy expire as before. Audit retention is independent of run.
  UPDATE public.dashboard_generation_runs SET leased_at=now()-interval '49 hours' WHERE id=r;
  INSERT INTO public.dashboard_generation_runs(user_id,purpose,request_key,source_hash,consent_token,created_at,expires_at)
    VALUES(u,'daily_note','legacy-old','x',repeat('a',64),now()-interval '49 hours',now()+interval '1 hour'),
      (u,'daily_note','legacy-recent','x',repeat('a',64),now(),now()+interval '1 hour');
  PERFORM public.purge_dashboard_generation();
  IF EXISTS(SELECT 1 FROM public.dashboard_generation_runs WHERE id=r OR request_key='legacy-old')
    OR NOT EXISTS(SELECT 1 FROM public.dashboard_generation_runs WHERE request_key='legacy-recent')
    OR (SELECT count(*) FROM public.ai_audit_log WHERE id=l)<>1
    OR public.dashboard_generation_attempt_count(u,'daily_note','UTC')<>2
    THEN RAISE EXCEPTION 'legacy/v2 retention or independent audit quota'; END IF;
END $$;

-- A lost terminal write cannot expose the expired-pending recovery path.
DO $$
DECLARE a jsonb:=pg_temp.lease_fixture(202); u uuid:=(a->>'owner')::uuid;
  r uuid:=(a->>'id')::uuid; l uuid:=(a->>'lease_token')::uuid; n integer;
BEGIN
  IF NOT public.dashboard_generation_begin_classification_v2(u,r,l)
    OR public.dashboard_generation_begin_classification_v2(u,r,l) THEN RAISE EXCEPTION 'classification ownership'; END IF;
  UPDATE public.dashboard_generation_runs SET leased_at=clock_timestamp()-interval '4 minutes' WHERE id=r;
  IF public.dashboard_generation_request_v2(u,'open','UTC','ko')->>'kind' IS DISTINCT FROM 'waiting'
    THEN RAISE EXCEPTION 'uncertain classification recovered'; END IF;
  UPDATE public.dashboard_generation_retention SET last_purged_at=clock_timestamp()-interval '4 hours';
  FOR n IN 1..2 LOOP
    IF NOT public.dashboard_generation_block_v2(u,r,l) THEN RAISE EXCEPTION 'red terminal stale/expired/replay'; END IF;
  END LOOP;
  IF (SELECT status FROM public.dashboard_generation_runs WHERE id=r)<>'pre_dispatch_blocked'
    OR (SELECT count(*) FROM public.ai_audit_log WHERE id=l AND model_used='dashboard+crisis' AND safety_zone='red')<>1
    THEN RAISE EXCEPTION 'red terminal evidence'; END IF;
  PERFORM public.dashboard_generation_finish_v2(u,r,NULL,l);
  PERFORM public.purge_dashboard_generation();
  IF public.dashboard_generation_request_v2(u,'open','UTC','ko')->>'kind' IS DISTINCT FROM 'waiting'
    OR public.dashboard_generation_audit_attempt_v2(u,r,'claude-sonnet-5','low','abcd',false,l)
    THEN RAISE EXCEPTION 'terminal red reopened'; END IF;
END $$;

-- Green failures recover, but old classification/terminal workers cannot
-- modify a replacement or a lease whose dispatch marker already committed.
DO $$
DECLARE a jsonb:=pg_temp.lease_fixture(203); u uuid:=(a->>'owner')::uuid;
  r uuid:=(a->>'id')::uuid; l uuid:=(a->>'lease_token')::uuid; b jsonb; fresh uuid;
BEGIN
  PERFORM public.dashboard_generation_begin_classification_v2(u,r,l);
  PERFORM public.dashboard_generation_finish_v2(u,r,NULL,l);
  IF (SELECT model_used FROM public.ai_audit_log WHERE id=l)<>'dashboard+pre_dispatch_failed'
    THEN RAISE EXCEPTION 'green preflight audit left open'; END IF;
  b:=public.dashboard_generation_request_v2(u,'open','UTC','ko'); fresh:=(b->>'lease_token')::uuid;
  IF b->>'kind'<>'claimed' OR fresh=l THEN RAISE EXCEPTION 'green recovery'; END IF;
  IF public.dashboard_generation_begin_classification_v2(u,r,l) OR public.dashboard_generation_block_v2(u,r,l)
    THEN RAISE EXCEPTION 'stale classification/terminal changed replacement'; END IF;
  IF NOT public.dashboard_generation_begin_classification_v2(u,r,fresh)
    OR NOT public.dashboard_generation_audit_attempt_v2(u,r,'claude-sonnet-5','low','abcd',false,fresh)
    THEN RAISE EXCEPTION 'classified green dispatch'; END IF;
  IF public.dashboard_generation_block_v2(u,r,fresh) OR public.dashboard_generation_begin_classification_v2(u,r,fresh)
    OR (SELECT model_used FROM public.ai_audit_log WHERE id=fresh)<>'claude-sonnet-5+attempt'
    THEN RAISE EXCEPTION 'terminal mutated dispatched lease'; END IF;
  UPDATE public.dashboard_generation_runs SET status='pending' WHERE id=r;
  -- Even incomplete audit metadata is not proof that a marked dispatch did
  -- not happen. A repair must never turn that ambiguity into a free retry.
  UPDATE public.ai_audit_log SET model_used='dashboard+attempt' WHERE id=fresh;
  IF public.dashboard_generation_block_v2(u,r,fresh)
    THEN RAISE EXCEPTION 'terminal ignored dispatch marker'; END IF;
END $$;

-- Invariant 6: heartbeat blocks dispatch, not result evidence/finish.
DO $$
DECLARE mode text; n integer:=210; a jsonb; u uuid; r uuid; l uuid; saved boolean;
BEGIN
  FOREACH mode IN ARRAY ARRAY['success','null','invalid'] LOOP
    n:=n+1; a:=pg_temp.lease_fixture(n); u:=(a->>'owner')::uuid; r:=(a->>'id')::uuid; l:=(a->>'lease_token')::uuid;
    PERFORM public.dashboard_generation_audit_attempt_v2(u,r,'claude-sonnet-5','low','abcd',false,l);
    UPDATE public.dashboard_generation_retention SET last_purged_at=clock_timestamp()-interval '4 hours';
    IF NOT public.dashboard_generation_audit_result_v2(u,r,'abcd','completed',1,'green',1,l)
      THEN RAISE EXCEPTION 'stale heartbeat rejected result'; END IF;
    saved:=public.dashboard_generation_finish_v2(u,r,CASE mode WHEN 'success' THEN '{}'::jsonb WHEN 'invalid' THEN '[]'::jsonb END,l);
    IF saved IS DISTINCT FROM (mode='success') OR (SELECT status FROM public.dashboard_generation_runs WHERE id=r)
      IS DISTINCT FROM (CASE WHEN mode='success' THEN 'ready' ELSE 'failed' END)
      THEN RAISE EXCEPTION 'stale heartbeat rejected finish: %',mode; END IF;
  END LOOP;
END $$;

-- 0244 touches every run status, not an enumerated v1 subset. Audits remain
-- content-free evidence: no run-id lookup or deletion in the invalidator.
DO $$
DECLARE mode text; n integer:=220; a jsonb; u uuid; r uuid; l uuid;
BEGIN
  FOREACH mode IN ARRAY ARRAY['pending','dispatched','pre_dispatch_failed','pre_dispatch_blocked','classifying'] LOOP
    n:=n+1; a:=pg_temp.lease_fixture(n); u:=(a->>'owner')::uuid; r:=(a->>'id')::uuid; l:=(a->>'lease_token')::uuid;
    IF mode='dispatched' THEN PERFORM public.dashboard_generation_audit_attempt_v2(u,r,'claude-sonnet-5','low','abcd',false,l);
    ELSIF mode='pre_dispatch_failed' THEN PERFORM public.dashboard_generation_finish_v2(u,r,NULL,l);
    ELSIF mode='pre_dispatch_blocked' THEN PERFORM public.dashboard_generation_block_v2(u,r,l);
    ELSIF mode='classifying' THEN PERFORM public.dashboard_generation_begin_classification_v2(u,r,l); END IF;
    UPDATE public.users SET privacy_prefs='{"recommendations":false}' WHERE id=u;
    IF mode='classifying' AND NOT public.dashboard_generation_block_v2(u,r,l)
      THEN RAISE EXCEPTION 'withdrawal prevented red evidence'; END IF;
    UPDATE public.users SET privacy_prefs='{"recommendations":true}' WHERE id=u;
    IF (SELECT status FROM public.dashboard_generation_runs WHERE id=r)<>'failed'
      OR public.dashboard_generation_request_v2(u,'open','UTC','ko')->>'kind' IS DISTINCT FROM 'waiting'
      OR (SELECT count(*) FROM public.ai_audit_log WHERE id=l AND user_id=u)<>1
      THEN RAISE EXCEPTION 'withdrawal/regrant missed state or lease audit: %',mode; END IF;
    -- Account cascade removes run/settings; the established ledger anonymizes
    -- owner, retaining evidence. Purge does not define a new audit retention.
    DELETE FROM auth.users WHERE id=u;
    IF EXISTS(SELECT 1 FROM public.dashboard_generation_runs WHERE id=r)
      OR NOT EXISTS(SELECT 1 FROM public.ai_audit_log WHERE id=l AND user_id IS NULL)
      THEN RAISE EXCEPTION 'account deletion ownership changed'; END IF;
  END LOOP;
END $$;

DO $$
DECLARE fn regprocedure; role_name text;
BEGIN
  FOREACH fn IN ARRAY ARRAY['public.dashboard_generation_begin_classification_v2(uuid,uuid,uuid)'::regprocedure,
    'public.dashboard_generation_block_v2(uuid,uuid,uuid)'::regprocedure] LOOP
    FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
      IF has_function_privilege(role_name,fn,'EXECUTE') IS DISTINCT FROM (role_name='service_role')
        THEN RAISE EXCEPTION 'classification/terminal ACL'; END IF;
    END LOOP;
    IF NOT (SELECT prosecdef AND proconfig @> ARRAY['search_path=""','row_security=off'] FROM pg_proc WHERE oid=fn)
      THEN RAISE EXCEPTION 'classification/terminal definer'; END IF;
  END LOOP;
END $$;
ROLLBACK;
\echo 'Lease terminal: retention, fail-closed classification, red replay, fencing, stale finish, withdrawal/deletion and ACL passed.'
