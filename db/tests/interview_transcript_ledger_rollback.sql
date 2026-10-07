\set ON_ERROR_STOP on

-- Run only on the CI scratch database after the numbered 0225 and 0226 migrations, like
-- interview_transcript_ledger_regression.sql. This file runs db/migrations/rollback/0225_down.sql
-- inside one transaction, checks what it folded, kept and dropped, deletes a saved record after it
-- (the kept lifecycle must still clean up), re-applies 0225, and rolls everything back.
-- Gate round 1: D6-06 = D6-61 (the old rollback dropped every cleanup path while keeping unsaved
-- sessions and their audit hashes). Checked to FAIL against that old rollback.
BEGIN;
SET LOCAL app.allow_missing_pg_cron = 'on';

SET LOCAL session_replication_role = replica;
INSERT INTO auth.users (id, email) VALUES ('27000000-0000-4000-8000-000000000001', 'd6-rb@example.com');
SET LOCAL session_replication_role = origin;
INSERT INTO public.users (id, email, birth_date, locale)
VALUES ('27000000-0000-4000-8000-000000000001', 'd6-rb@example.com', DATE '1990-01-01', 'ko');
INSERT INTO public.ai_audit_log (id, user_id, prompt_hash, output_hash, model_used, vertex_backend, safety_zone,
  latency_ms, purpose, event_source)
SELECT ('27000000-0000-4000-8000-0000000000a' || n)::uuid, '27000000-0000-4000-8000-000000000001',
       'p' || n, 'o' || n, 'test-model', false, 'green', 1,
       CASE n WHEN 7 THEN 'secondb_chat' ELSE 'interview_probe' END,
       'server_verified'
  FROM generate_series(1, 7) AS g(n) WHERE n <> 6;

CREATE FUNCTION pg_temp.erased(p_n integer) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT a.prompt_hash = '' AND a.output_hash = '' FROM public.ai_audit_log AS a
   WHERE a.id = ('27000000-0000-4000-8000-0000000000a' || p_n)::uuid
$$;

-- Fixture: U is unsaved (one verdict a1, one refused call a2). S is saved with record R (verdict a3, a call
-- after the save a4), and a context row naming R.
DO $fixture$
DECLARE
  v_one constant uuid := '27000000-0000-4000-8000-000000000001';
  v_u constant uuid := '27000000-0000-4000-8000-000000000051';
  v_s constant uuid := '27000000-0000-4000-8000-000000000052';
  v_r constant uuid := '27000000-0000-4000-8000-0000000000e2';
  v_turns jsonb := jsonb_build_array(
    jsonb_build_object('n', 1, 'role', 'interviewer', 'scene', 1, 'layer', 'fact', 'ask_kind', 'seed',
                       'origin', 'fixed', 'text', '그때 어디였나요?'),
    jsonb_build_object('n', 2, 'role', 'user', 'scene', 1, 'layer', 'fact', 'origin', 'user',
                       'text', '산 아래 마을이요', 'opener_unedited', false, 'state', 'judged'));
  v_result jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM public.record_interview_probe_verdict(v_one, '27000000-0000-4000-8000-0000000000a1', v_u, 'now', 'ko',
    1, 1, 2, 'fact', 'seed', 'pass', 'fact', 'credited', true, 'r0', 'openai', false, 0, 3, NULL);
  IF public.record_interview_probe_verdict(v_one, '27000000-0000-4000-8000-0000000000a2', v_u, 'now', 'ko',
       2, 1, 2, 'fact', 'seed', 'pass', 'fact', 'credited', true, 'r0', 'openai', false, 0, 3, NULL) <> 'scene_regressed' THEN
    RAISE EXCEPTION 'rollback fixture: expected a refused call';
  END IF;
  PERFORM public.record_interview_probe_verdict(v_one, '27000000-0000-4000-8000-0000000000a3', v_s, 'school', 'ko',
    1, 1, 2, 'fact', 'seed', 'pass', 'fact', 'credited', true, 'r0', 'openai', false, 0, 3,
    encode(sha256(convert_to(v_s::text || ':2:산 아래 마을이요', 'UTF8')), 'hex'));
  PERFORM set_config('request.jwt.claim.role', '', true);
  INSERT INTO public.records (id, user_id, kind, body, audit_period, system_tags, client_request_id)
  VALUES (v_r, v_one, 'audit_response', public.interview_transcript_body('ko', v_turns), 'school',
          ARRAY['interview'], 'interview:' || v_s::text);
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated","sub":"27000000-0000-4000-8000-000000000001"}', true);
  v_result := public.commit_interview_session(v_s, v_r, v_turns, true);
  IF v_result ->> 'status' <> 'committed' THEN RAISE EXCEPTION 'rollback fixture: commit %', v_result; END IF;
  IF v_result ->> 'ai_hold' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'D6R3-53: hold fixture missing'; END IF;
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  IF public.record_interview_probe_verdict(v_one, '27000000-0000-4000-8000-0000000000a4', v_s, 'school', 'ko',
       1, 2, 4, 'feeling', 'drill', 'pass', 'feeling', 'credited', true, 'r0', 'openai', false, 0, 3, NULL) <> 'session_committed' THEN
    RAISE EXCEPTION 'rollback fixture: expected session_committed';
  END IF;
  IF public.record_context_blocks('27000000-0000-4000-8000-0000000000a7', 'secondb_chat', 'r1',
       ARRAY['record:' || v_r::text, 'wiki:rb'], NULL) <> 'recorded' THEN
    RAISE EXCEPTION 'rollback fixture: context row';
  END IF;
  PERFORM set_config('request.jwt.claim.role', '', true);
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated","sub":"27000000-0000-4000-8000-000000000001"}', true);
  PERFORM set_config('request.jwt.claims', '', true);
END
$fixture$;

\ir ../migrations/rollback/0225_down.sql

-- 1. The unsaved session is folded now, with every hash it carried (the refused call's too), and tombstoned.
-- 2. The saved session and everything hanging off it are kept, hashes included.
-- 3. The entry points are gone; the lifecycle for the kept tables is still there.
DO $after_rollback$
DECLARE
  v_one constant uuid := '27000000-0000-4000-8000-000000000001';
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE oid IN (
      'public.reserve_polaris_generation(uuid,text)'::regprocedure,
      'public.polaris_evidence_snapshot(uuid,jsonb)'::regprocedure)
      AND position('interview_transcripts' IN prosrc) > 0)
     OR has_function_privilege('authenticated','public.polaris_evidence_snapshot(uuid,jsonb)','EXECUTE')
     OR has_function_privilege('service_role','public.polaris_evidence_snapshot(uuid,jsonb)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.reserve_polaris_generation(uuid,text)','EXECUTE') THEN
    RAISE EXCEPTION 'R2 D6-02: rollback did not retain independent evidence functions and 0195 grants';
  END IF;
  IF EXISTS (SELECT 1 FROM public.interview_sessions WHERE id = '27000000-0000-4000-8000-000000000051')
     OR NOT EXISTS (SELECT 1 FROM public.interview_session_tombstones
                     WHERE session_id = '27000000-0000-4000-8000-000000000051')
     OR NOT pg_temp.erased(1) OR NOT pg_temp.erased(2) THEN
    RAISE EXCEPTION 'D6-06: the rollback left an unsaved session or its audit hashes';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.interview_sessions
                  WHERE id = '27000000-0000-4000-8000-000000000052' AND committed_at IS NOT NULL)
     OR NOT EXISTS (SELECT 1 FROM public.interview_transcripts WHERE record_id = '27000000-0000-4000-8000-0000000000e2')
     OR NOT EXISTS (SELECT 1 FROM public.ai_audit_context_blocks WHERE user_id = v_one)
     OR pg_temp.erased(3) OR pg_temp.erased(4) THEN
    RAISE EXCEPTION 'D6-06: the rollback did not keep the saved data';
  END IF;
  IF to_regprocedure('public.record_interview_probe_verdict(uuid,uuid,uuid,text,text,integer,integer,integer,text,text,text,text,text,boolean,text,text,boolean,integer,integer,text)') IS NOT NULL
     OR to_regprocedure('public.commit_interview_session(uuid,uuid,jsonb,boolean)') IS NOT NULL
     OR to_regprocedure('public.fold_interview_session(uuid,text)') IS NULL
     OR to_regprocedure('public.sweep_interview_sessions(integer)') IS NULL
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger
                     WHERE tgrelid = 'public.records'::regclass AND tgname = 'interview_record_erasure') THEN
    RAISE EXCEPTION 'D6-06: the rollback dropped the wrong functions';
  END IF;
END
$after_rollback$;

-- D6R3-53: kept hold data stays excluded, even if a client deletes its ledger parents.
-- The inner subtransaction restores the saved fixture for the lifecycle checks below.
-- Supabase grants this owner write surface; the vanilla scratch schema does not.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.records TO authenticated;
DO $r3_rollback_hold$
DECLARE
  v_user uuid := '27000000-0000-4000-8000-000000000001';
  v_r uuid := '27000000-0000-4000-8000-0000000000e2';
  v_ok uuid := gen_random_uuid(); v_path integer; v_result jsonb; v_evidence jsonb;
BEGIN
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.records WHERE id=v_r AND interview_ai_hold)
       OR NOT EXISTS (SELECT 1 FROM public.interview_transcripts WHERE record_id=v_r AND ai_hold) THEN
      RAISE EXCEPTION 'D6R3-53: rollback lost the hold fixture';
    END IF;
    UPDATE public.polaris_generation_config SET enabled=true;
    INSERT INTO public.records(id,user_id,kind,body,audit_period,system_tags)
    VALUES(v_ok,v_user,'audit_response','eligible evidence','now',ARRAY['interview']);
    PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_user)::text,true);
    SELECT jsonb_build_array(jsonb_build_object('id',id,'domain',audit_period,
      'body_hash',encode(sha256(convert_to(body,'UTF8')),'hex'))) INTO v_evidence FROM public.records WHERE id=v_r;
    FOR v_path IN 0..2 LOOP
      SET LOCAL ROLE authenticated;
      IF v_path=1 THEN DELETE FROM public.interview_transcripts WHERE record_id=v_r;
      ELSIF v_path=2 THEN DELETE FROM public.interview_sessions WHERE record_id=v_r; END IF;
      BEGIN
        UPDATE public.records SET interview_ai_hold=false WHERE id=v_r;
        RAISE EXCEPTION 'D6R3-53: rollback let a client release hold';
      EXCEPTION WHEN insufficient_privilege THEN
        IF SQLERRM <> 'interview_record_hold_server_only' THEN RAISE; END IF;
      END;
      RESET ROLE;
      BEGIN
        PERFORM public.polaris_evidence_snapshot(v_user,v_evidence);
        RAISE EXCEPTION 'D6R3-53: rollback snapshot returned hold evidence';
      EXCEPTION WHEN raise_exception THEN
        IF SQLERRM <> 'polaris_evidence_changed' THEN RAISE; END IF;
      END;
      BEGIN
        v_result := public.reserve_polaris_generation(v_user,'r3-rollback-hold-'||v_path);
        IF EXISTS (SELECT 1 FROM public.polaris_generations g, jsonb_array_elements(g.evidence) e
                    WHERE g.id=(v_result->>'generation_id')::uuid AND e->>'id'=v_r::text)
           OR NOT EXISTS (SELECT 1 FROM public.polaris_generations g, jsonb_array_elements(g.evidence) e
                    WHERE g.id=(v_result->>'generation_id')::uuid AND e->>'id'=v_ok::text) THEN
          RAISE EXCEPTION 'D6R3-53: rollback reserve selected hold or lost eligible evidence';
        END IF;
        RAISE EXCEPTION 'r3-reserve-done';
      EXCEPTION WHEN raise_exception THEN
        IF SQLERRM <> 'r3-reserve-done' THEN RAISE; END IF;
      END;
    END LOOP;
    RAISE EXCEPTION 'r3-rollback-probe-done';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'r3-rollback-probe-done' THEN RAISE; END IF;
  END;
END $r3_rollback_hold$;

-- 4. After the rollback, deleting the saved record still folds its session, empties every hash it carried,
--    takes the context row that named it. Sweep and prune still run.
DELETE FROM public.records WHERE id = '27000000-0000-4000-8000-0000000000e2';
DO $lifecycle$
DECLARE
  v_one constant uuid := '27000000-0000-4000-8000-000000000001';
BEGIN
  IF EXISTS (SELECT 1 FROM public.interview_sessions WHERE owner_id = v_one)
     OR NOT pg_temp.erased(3) OR NOT pg_temp.erased(4)
     OR EXISTS (SELECT 1 FROM public.ai_audit_context_blocks WHERE user_id = v_one) THEN
    RAISE EXCEPTION 'D6-06: after the rollback, deleting a saved record no longer cleaned up';
  END IF;
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM public.sweep_interview_sessions();
  PERFORM public.prune_interview_ledgers();
  PERFORM set_config('request.jwt.claim.role', '', true);
END
$lifecycle$;

-- 5. 0225 applies again on top of the rollback.
\ir ../migrations/0225_interview_transcript_ledger.sql
DO $reapplied$
BEGIN
  IF (SELECT count(*) FROM pg_proc WHERE oid IN (
      'public.reserve_polaris_generation(uuid,text)'::regprocedure,
      'public.polaris_evidence_snapshot(uuid,jsonb)'::regprocedure)
      AND position('interview_ai_hold' IN prosrc) > 0) <> 2 THEN
    RAISE EXCEPTION 'R2 D6-02: reapply did not restore both hold exclusions';
  END IF;
  IF to_regprocedure('public.commit_interview_session(uuid,uuid,jsonb,boolean)') IS NULL
     OR to_regclass('public.record_layer_inferences') IS NULL
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger
                     WHERE tgrelid = 'public.interview_coverage'::regclass
                       AND tgname = 'trg_interview_coverage_no_decrease') THEN
    RAISE EXCEPTION 'D6-06: 0225 did not re-apply on top of its rollback';
  END IF;
END
$reapplied$;

ROLLBACK;
