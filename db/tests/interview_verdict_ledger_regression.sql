\set ON_ERROR_STOP on

-- Run only on the CI scratch database after the numbered 0220 (interview verdict
-- ledger) and 0229 (its erasure-registry row) migrations. The staged Supabase CLI
-- push already applied both; this file never replays them. Everything below runs
-- in one transaction and is rolled back.
BEGIN;

-- The vanilla PostgreSQL auth stub lacks production trigger columns.
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users (id, email) VALUES
  ('22000000-0000-4000-8000-000000000001', 'ledger-one@example.com'),
  ('22000000-0000-4000-8000-000000000002', 'ledger-two@example.com');
SET LOCAL session_replication_role = origin;
INSERT INTO public.users (id, email, birth_date, locale) VALUES
  ('22000000-0000-4000-8000-000000000001', 'ledger-one@example.com', DATE '1990-01-01', 'ko'),
  ('22000000-0000-4000-8000-000000000002', 'ledger-two@example.com', DATE '1990-01-01', 'ko');

-- 1. Privileges: clients hold nothing on the tables; the proxy writer and the
--    clean-up job are service_role only; close/commit are authenticated only.
DO $privileges$
BEGIN
  IF has_table_privilege('authenticated', 'public.interview_sessions', 'SELECT')
     OR has_table_privilege('authenticated', 'public.interview_sessions', 'INSERT')
     OR has_table_privilege('authenticated', 'public.interview_sessions', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.interview_sessions', 'DELETE')
     OR has_table_privilege('anon', 'public.interview_sessions', 'SELECT')
     OR has_table_privilege('authenticated', 'public.interview_probe_verdicts', 'SELECT')
     OR has_table_privilege('authenticated', 'public.interview_probe_verdicts', 'INSERT')
     OR has_table_privilege('anon', 'public.interview_probe_verdicts', 'SELECT')
     OR has_table_privilege('authenticated', 'public.interview_scene_metrics', 'SELECT')
     OR has_table_privilege('anon', 'public.interview_scene_metrics', 'SELECT') THEN
    RAISE EXCEPTION 'a client role holds a privilege on the interview ledger';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.interview_scene_metrics', 'SELECT')
     OR has_table_privilege('service_role', 'public.interview_sessions', 'INSERT')
     OR has_table_privilege('service_role', 'public.interview_probe_verdicts', 'UPDATE') THEN
    RAISE EXCEPTION 'service_role table privileges are not read-only';
  END IF;
  IF has_function_privilege('authenticated', 'public.record_interview_probe_verdict(uuid,uuid,uuid,text,text,integer,integer,text,text,text,text,text,boolean,integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.record_interview_probe_verdict(uuid,uuid,uuid,text,text,integer,integer,text,text,text,text,text,boolean,integer)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.record_interview_probe_verdict(uuid,uuid,uuid,text,text,integer,integer,text,text,text,text,text,boolean,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'record_interview_probe_verdict is not service_role only';
  END IF;
  IF has_function_privilege('authenticated', 'public.anonymize_interview_sessions(integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.anonymize_interview_sessions(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anonymize_interview_sessions is client-callable';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.close_interview_session(uuid,text,text,text,integer,integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.close_interview_session(uuid,text,text,text,integer,integer)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.commit_interview_session(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.commit_interview_session(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'close/commit are not authenticated-only';
  END IF;
  IF NOT (SELECT c.relrowsecurity AND c.relforcerowsecurity FROM pg_catalog.pg_class AS c
           WHERE c.oid = 'public.interview_sessions'::regclass)
     OR NOT (SELECT c.relrowsecurity AND c.relforcerowsecurity FROM pg_catalog.pg_class AS c
           WHERE c.oid = 'public.interview_probe_verdicts'::regclass) THEN
    RAISE EXCEPTION 'interview ledger tables are not under forced RLS';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.erasure_registry
                  WHERE table_name = 'interview_sessions' AND owner_column = 'owner_id'
                    AND class = 'account_delete_only') THEN
    RAISE EXCEPTION 'interview_sessions is missing its erasure-registry row';
  END IF;
END
$privileges$;

-- 2. The proxy writer, the screen's close and the screen's commit.
DO $ledger$
DECLARE
  v_one constant uuid := '22000000-0000-4000-8000-000000000001';
  v_two constant uuid := '22000000-0000-4000-8000-000000000002';
  v_s1 constant uuid := '22000000-0000-4000-8000-0000000000a1';
  v_s2 constant uuid := '22000000-0000-4000-8000-0000000000a2';
  v_s3 constant uuid := '22000000-0000-4000-8000-0000000000a3';
  v_s4 constant uuid := '22000000-0000-4000-8000-0000000000a4';
  v_status text;
  v_result jsonb;
  v_n integer;
  v_i integer;
BEGIN
  -- Not the proxy: refused before anything is written.
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  BEGIN
    PERFORM public.record_interview_probe_verdict(v_one, gen_random_uuid(), v_s1, 'school', 'ko', 1, 1,
      'fact', 'seed', 'pass', 'fact', 'credited', false, 3);
    RAISE EXCEPTION 'an authenticated caller wrote a verdict row';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  -- Scene 1: fact and feeling credited, meaning refused, meaning credited by the
  -- model but short on the local gate, belief credited but its prompt tail unverified.
  v_status := public.record_interview_probe_verdict(v_one, '22000000-0000-4000-8000-0000000000b1', v_s1,
    'school', 'ko', 1, 1, 'fact', 'seed', 'pass', 'fact', 'credited', false, 3);
  IF v_status <> 'recorded' THEN RAISE EXCEPTION 'first verdict not recorded: %', v_status; END IF;
  PERFORM public.record_interview_probe_verdict(v_one, '22000000-0000-4000-8000-0000000000b2', v_s1,
    'school', 'ko', 1, 2, 'feeling', 'drill', 'pass', 'feeling', 'credited', true, 1);
  PERFORM public.record_interview_probe_verdict(v_one, '22000000-0000-4000-8000-0000000000b3', v_s1,
    'school', 'ko', 1, 3, 'meaning', 'drill', 'pass', NULL, 'none', false, 2);
  PERFORM public.record_interview_probe_verdict(v_one, '22000000-0000-4000-8000-0000000000b4', v_s1,
    'school', 'ko', 1, 4, 'meaning', 'scaffold', 'short', 'meaning', 'credited', false, 1);
  PERFORM public.record_interview_probe_verdict(v_one, '22000000-0000-4000-8000-0000000000b5', v_s1,
    'school', 'ko', 1, 5, 'belief', 'drill', 'unverified', 'belief', 'credited', false, NULL);
  -- Scene 2: fact credited twice in the same scene counts once; feeling judged as another layer.
  PERFORM public.record_interview_probe_verdict(v_one, '22000000-0000-4000-8000-0000000000b6', v_s1,
    'school', 'ko', 2, 1, 'fact', 'seed', 'pass', 'fact', 'credited', false, 3);
  PERFORM public.record_interview_probe_verdict(v_one, '22000000-0000-4000-8000-0000000000b7', v_s1,
    'school', 'ko', 2, 2, 'fact', 'drill', 'pass', 'fact', 'credited', false, 3);
  PERFORM public.record_interview_probe_verdict(v_one, '22000000-0000-4000-8000-0000000000b8', v_s1,
    'school', 'ko', 2, 3, 'feeling', 'drill', 'pass', 'meaning', 'other_layer', false, 2);

  -- The same audit row twice keeps one ledger row.
  v_status := public.record_interview_probe_verdict(v_one, '22000000-0000-4000-8000-0000000000b8', v_s1,
    'school', 'ko', 2, 3, 'feeling', 'drill', 'pass', 'meaning', 'other_layer', false, 2);
  IF v_status <> 'duplicate' THEN RAISE EXCEPTION 'a repeated audit id was not refused: %', v_status; END IF;
  -- Scenes only move forward.
  v_status := public.record_interview_probe_verdict(v_one, gen_random_uuid(), v_s1,
    'school', 'ko', 1, 9, 'fact', 'drill', 'pass', 'fact', 'credited', false, 3);
  IF v_status <> 'scene_regressed' THEN RAISE EXCEPTION 'a backwards scene was recorded: %', v_status; END IF;
  -- Another user cannot write into this session; neither can another period.
  v_status := public.record_interview_probe_verdict(v_two, gen_random_uuid(), v_s1,
    'school', 'ko', 3, 1, 'fact', 'seed', 'pass', 'fact', 'credited', false, 3);
  IF v_status <> 'session_not_owned' THEN RAISE EXCEPTION 'a foreign session accepted a verdict: %', v_status; END IF;
  v_status := public.record_interview_probe_verdict(v_one, gen_random_uuid(), v_s1,
    'now', 'ko', 3, 1, 'fact', 'seed', 'pass', 'fact', 'credited', false, 3);
  IF v_status <> 'session_mismatch' THEN RAISE EXCEPTION 'a session changed period: %', v_status; END IF;
  -- An account that no longer exists gets no rows.
  v_status := public.record_interview_probe_verdict('22000000-0000-4000-8000-0000000000ff', gen_random_uuid(),
    v_s4, 'school', 'ko', 1, 1, 'fact', 'seed', 'pass', 'fact', 'credited', false, 3);
  IF v_status <> 'no_account' OR EXISTS (SELECT 1 FROM public.interview_sessions WHERE id = v_s4) THEN
    RAISE EXCEPTION 'a missing account created a session: %', v_status;
  END IF;
  -- Out-of-contract values are refused, not coerced.
  BEGIN
    PERFORM public.record_interview_probe_verdict(v_one, gen_random_uuid(), v_s1, 'school', 'ko', 2, 4,
      'fact', 'drill', 'pass', 'fact', 'approved', false, 3);
    RAISE EXCEPTION 'an unknown verdict was recorded';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.record_interview_probe_verdict(v_one, gen_random_uuid(), v_s1, 'teens', 'ko', 2, 4,
      'fact', 'drill', 'pass', 'fact', 'credited', false, 3);
    RAISE EXCEPTION 'an unknown period was recorded';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  -- A credited row must name the layer it credits.
  BEGIN
    PERFORM public.record_interview_probe_verdict(v_one, gen_random_uuid(), v_s1, 'school', 'ko', 2, 4,
      'fact', 'drill', 'pass', 'feeling', 'credited', false, 3);
    RAISE EXCEPTION 'a credited verdict for another layer was recorded';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  SELECT count(*) INTO v_n FROM public.interview_probe_verdicts WHERE session_id = v_s1;
  IF v_n <> 8 THEN RAISE EXCEPTION 'expected 8 ledger rows for the session, found %', v_n; END IF;

  -- The screen closes the session (authenticated, own session only, first reason wins).
  PERFORM set_config('request.jwt.claim.role', '', true);
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated","sub":"22000000-0000-4000-8000-000000000002"}', true);
  v_status := public.close_interview_session(v_s1, 'school', 'ko', 'user_end', 0, 0);
  IF v_status <> 'not_found' THEN RAISE EXCEPTION 'another user closed the session: %', v_status; END IF;
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated","sub":"22000000-0000-4000-8000-000000000001"}', true);
  v_status := public.close_interview_session(v_s1, 'school', 'ko', 'complete', 2, 1);
  IF v_status <> 'closed' THEN RAISE EXCEPTION 'owner could not close: %', v_status; END IF;
  v_status := public.close_interview_session(v_s1, 'school', 'ko', 'left', 0, 0);
  IF v_status <> 'already_closed'
     OR (SELECT end_reason FROM public.interview_sessions WHERE id = v_s1) <> 'complete' THEN
    RAISE EXCEPTION 'a second close replaced the first reason: %', v_status;
  END IF;
  BEGIN
    PERFORM public.close_interview_session(v_s2, 'school', 'ko', 'finished', 0, 0);
    RAISE EXCEPTION 'an unknown end reason was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;

  -- A verdict the screen threw away (it arrived after the close) is stored but not counted.
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM public.record_interview_probe_verdict(v_one, '22000000-0000-4000-8000-0000000000b9', v_s1,
    'school', 'ko', 2, 4, 'echo', 'drill', 'pass', 'echo', 'credited', false, 3);
  UPDATE public.interview_probe_verdicts
     SET created_at = (SELECT ended_at FROM public.interview_sessions WHERE id = v_s1) + INTERVAL '1 second'
   WHERE audit_id = '22000000-0000-4000-8000-0000000000b9';
  PERFORM set_config('request.jwt.claim.role', '', true);

  -- Commit adds to what is already there (atomic increment, never an absolute write).
  INSERT INTO public.interview_coverage (user_id, period, layer, answers) VALUES (v_one, 'school', 'fact', 5);
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated","sub":"22000000-0000-4000-8000-000000000002"}', true);
  v_result := public.commit_interview_session(v_s1);
  IF v_result ->> 'status' <> 'not_found' THEN RAISE EXCEPTION 'another user committed the session: %', v_result; END IF;
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated","sub":"22000000-0000-4000-8000-000000000001"}', true);
  v_result := public.commit_interview_session(v_s1);
  IF v_result ->> 'status' <> 'committed'
     OR (v_result ->> 'ledger_rows')::integer <> 9
     OR (v_result ->> 'cells_added')::integer <> 3 THEN
    RAISE EXCEPTION 'unexpected commit result: %', v_result;
  END IF;
  IF (SELECT answers FROM public.interview_coverage WHERE user_id = v_one AND period = 'school' AND layer = 'fact') <> 7
     OR (SELECT answers FROM public.interview_coverage WHERE user_id = v_one AND period = 'school' AND layer = 'feeling') <> 1
     OR EXISTS (SELECT 1 FROM public.interview_coverage
                 WHERE user_id = v_one AND period = 'school' AND layer IN ('meaning', 'belief', 'echo')) THEN
    RAISE EXCEPTION 'commit credited the wrong cells';
  END IF;
  v_result := public.commit_interview_session(v_s1);
  IF v_result ->> 'status' <> 'already_committed'
     OR (SELECT answers FROM public.interview_coverage WHERE user_id = v_one AND period = 'school' AND layer = 'fact') <> 7 THEN
    RAISE EXCEPTION 'a second commit added again: %', v_result;
  END IF;
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  v_status := public.record_interview_probe_verdict(v_one, gen_random_uuid(), v_s1,
    'school', 'ko', 3, 1, 'fact', 'seed', 'pass', 'fact', 'credited', false, 3);
  IF v_status <> 'session_committed' THEN RAISE EXCEPTION 'a committed session took a verdict: %', v_status; END IF;
  PERFORM set_config('request.jwt.claim.role', '', true);

  -- A conversation with no judged call: close creates the row, commit reports an empty ledger.
  v_status := public.close_interview_session(v_s2, 'now', 'en', 'user_stop', 1, 0);
  v_result := public.commit_interview_session(v_s2);
  IF v_status <> 'closed' OR v_result ->> 'status' <> 'committed'
     OR (v_result ->> 'ledger_rows')::integer <> 0 OR (v_result ->> 'cells_added')::integer <> 0 THEN
    RAISE EXCEPTION 'an empty session did not report an empty ledger: % %', v_status, v_result;
  END IF;

  -- Unsaved sessions lose their owner and audit link after six idle hours (Q3 a).
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM public.record_interview_probe_verdict(v_one, '22000000-0000-4000-8000-0000000000c1', v_s3,
    'work', 'ko', 1, 1, 'fact', 'seed', 'pass', 'fact', 'credited', false, 3);
  UPDATE public.interview_sessions SET last_seen_at = pg_catalog.now() - INTERVAL '7 hours' WHERE id = v_s3;
  PERFORM public.record_interview_probe_verdict(v_one, '22000000-0000-4000-8000-0000000000c2', v_s4,
    'work', 'ko', 1, 1, 'fact', 'seed', 'pass', 'fact', 'credited', false, 3);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  BEGIN
    PERFORM public.anonymize_interview_sessions();
    RAISE EXCEPTION 'an authenticated caller ran the clean-up';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  v_n := public.anonymize_interview_sessions();
  IF v_n <> 1 THEN RAISE EXCEPTION 'expected one idle session to be released, got %', v_n; END IF;
  IF (SELECT owner_id FROM public.interview_sessions WHERE id = v_s3) IS NOT NULL
     OR (SELECT anonymized_at FROM public.interview_sessions WHERE id = v_s3) IS NULL
     OR (SELECT audit_id FROM public.interview_probe_verdicts WHERE session_id = v_s3) IS NOT NULL
     OR (SELECT owner_id FROM public.interview_sessions WHERE id = v_s4) IS DISTINCT FROM v_one
     OR (SELECT owner_id FROM public.interview_sessions WHERE id = v_s1) IS DISTINCT FROM v_one THEN
    RAISE EXCEPTION 'clean-up touched the wrong sessions';
  END IF;
  PERFORM set_config('request.jwt.claim.role', '', true);
  v_result := public.commit_interview_session(v_s3);
  IF v_result ->> 'status' <> 'not_found' THEN
    RAISE EXCEPTION 'a released session could be committed: %', v_result;
  END IF;

  -- A client cannot make empty session rows without limit.
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated","sub":"22000000-0000-4000-8000-000000000002"}', true);
  FOR v_i IN 1..30 LOOP
    v_status := public.close_interview_session(gen_random_uuid(), 'now', 'ko', 'user_end', 0, 0);
    IF v_status <> 'closed' THEN RAISE EXCEPTION 'session % was refused: %', v_i, v_status; END IF;
  END LOOP;
  v_status := public.close_interview_session(gen_random_uuid(), 'now', 'ko', 'user_end', 0, 0);
  IF v_status <> 'rate_limited' THEN RAISE EXCEPTION 'the 31st new session in an hour was created: %', v_status; END IF;

  -- The scene view reads per scene.
  IF (SELECT count(*) FROM public.interview_scene_metrics WHERE session_id = v_s1) <> 2
     OR (SELECT depth FROM public.interview_scene_metrics WHERE session_id = v_s1 AND scene_seq = 1) <> 2
     OR (SELECT verdict_none FROM public.interview_scene_metrics WHERE session_id = v_s1 AND scene_seq = 1) <> 1
     OR (SELECT gate_short FROM public.interview_scene_metrics WHERE session_id = v_s1 AND scene_seq = 1) <> 1
     OR (SELECT gate_untrusted FROM public.interview_scene_metrics WHERE session_id = v_s1 AND scene_seq = 1) <> 1
     OR (SELECT verdict_other_layer FROM public.interview_scene_metrics WHERE session_id = v_s1 AND scene_seq = 2) <> 1 THEN
    RAISE EXCEPTION 'scene metrics disagree with the ledger';
  END IF;
END
$ledger$;

-- 3. interview_coverage: a cell never shrinks and never moves.
DO $coverage$
DECLARE
  v_one constant uuid := '22000000-0000-4000-8000-000000000001';
BEGIN
  BEGIN
    UPDATE public.interview_coverage SET answers = 0
     WHERE user_id = v_one AND period = 'school' AND layer = 'fact';
    RAISE EXCEPTION 'a coverage cell was lowered';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.interview_coverage SET period = 'now'
     WHERE user_id = v_one AND period = 'school' AND layer = 'fact';
    RAISE EXCEPTION 'a coverage cell was moved to another period';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  UPDATE public.interview_coverage SET answers = answers + 1, updated_at = pg_catalog.now()
   WHERE user_id = v_one AND period = 'school' AND layer = 'fact';
  IF (SELECT answers FROM public.interview_coverage WHERE user_id = v_one AND period = 'school' AND layer = 'fact') <> 8 THEN
    RAISE EXCEPTION 'an increasing update was refused';
  END IF;
END
$coverage$;

-- 4. Account deletion takes the owned sessions and their verdicts; released ones stay ownerless.
DELETE FROM auth.users WHERE id = '22000000-0000-4000-8000-000000000001';
DO $cascade$
BEGIN
  IF EXISTS (SELECT 1 FROM public.interview_sessions
              WHERE id IN ('22000000-0000-4000-8000-0000000000a1', '22000000-0000-4000-8000-0000000000a2',
                           '22000000-0000-4000-8000-0000000000a4'))
     OR EXISTS (SELECT 1 FROM public.interview_probe_verdicts
                 WHERE session_id = '22000000-0000-4000-8000-0000000000a1') THEN
    RAISE EXCEPTION 'account deletion left owned interview sessions behind';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.interview_sessions
                  WHERE id = '22000000-0000-4000-8000-0000000000a3' AND owner_id IS NULL) THEN
    RAISE EXCEPTION 'the released aggregate row did not survive account deletion';
  END IF;
END
$cascade$;

ROLLBACK;
