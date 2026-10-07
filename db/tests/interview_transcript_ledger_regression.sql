\set ON_ERROR_STOP on

-- Run only on the CI scratch database after the numbered 0225 (interview transcript
-- ledger) and 0226 (its erasure-registry rows) migrations. The staged Supabase CLI
-- push already applied both; this file never replays them. Everything below runs in
-- one transaction and is rolled back. Design: docs/design/d6-verdict-ledger-261007.md
-- section 6 (T-02, T-06, T-07, T-08, T-09, T-14, T-15, T-19).
BEGIN;

-- The vanilla PostgreSQL auth stub lacks production trigger columns.
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users (id, email) VALUES
  ('25000000-0000-4000-8000-000000000001', 'd6-one@example.com'),
  ('25000000-0000-4000-8000-000000000002', 'd6-two@example.com');
SET LOCAL session_replication_role = origin;
INSERT INTO public.users (id, email, birth_date, locale) VALUES
  ('25000000-0000-4000-8000-000000000001', 'd6-one@example.com', DATE '1990-01-01', 'ko'),
  ('25000000-0000-4000-8000-000000000002', 'd6-two@example.com', DATE '1990-01-01', 'ko');

-- Audit rows for the judged calls (the proxy writes these before the verdict).
INSERT INTO public.ai_audit_log (id, user_id, prompt_hash, output_hash, model_used, vertex_backend, safety_zone, latency_ms, purpose, event_source)
SELECT ('25000000-0000-4000-8000-0000000000' || lpad(to_hex(n), 2, '0'))::uuid,
       '25000000-0000-4000-8000-000000000001', 'p' || n, 'o' || n, 'test-model', false, 'green', 1,
       CASE WHEN n >= 200 THEN 'secondb_chat' ELSE 'interview_probe' END, 'server_verified'
  FROM (VALUES (177), (178), (179), (180), (181), (182), (183), (184), (185), (186), (187), (188), (200)) AS t(n);

-- 1. Privileges, forced RLS, the registry rows, one verdict ledger, a rollup with no id/time/text slot.
DO $privileges$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['interview_sessions', 'interview_probe_verdicts', 'interview_unsaved_rollup',
      'ai_audit_context_blocks', 'interview_scene_metrics', 'record_layer_inferences'] LOOP
    IF has_table_privilege('authenticated', 'public.' || v_table, 'SELECT')
       OR has_table_privilege('authenticated', 'public.' || v_table, 'INSERT')
       OR has_table_privilege('authenticated', 'public.' || v_table, 'UPDATE')
       OR has_table_privilege('authenticated', 'public.' || v_table, 'DELETE')
       OR has_table_privilege('anon', 'public.' || v_table, 'SELECT') THEN
      RAISE EXCEPTION 'a client role holds a privilege on %', v_table;
    END IF;
    IF NOT has_table_privilege('service_role', 'public.' || v_table, 'SELECT')
       OR has_table_privilege('service_role', 'public.' || v_table, 'INSERT')
       OR has_table_privilege('service_role', 'public.' || v_table, 'UPDATE') THEN
      RAISE EXCEPTION 'service_role is not read-only on %', v_table;
    END IF;
  END LOOP;
  FOREACH v_table IN ARRAY ARRAY['interview_transcripts', 'interview_transcript_turns', 'period_card_proposals'] LOOP
    IF NOT has_table_privilege('authenticated', 'public.' || v_table, 'SELECT')
       OR NOT has_table_privilege('authenticated', 'public.' || v_table, 'DELETE')
       OR has_table_privilege('authenticated', 'public.' || v_table, 'INSERT')
       OR has_table_privilege('authenticated', 'public.' || v_table, 'UPDATE')
       OR has_table_privilege('anon', 'public.' || v_table, 'SELECT') THEN
      RAISE EXCEPTION 'owner privileges on % are not exactly SELECT and DELETE', v_table;
    END IF;
  END LOOP;
  IF has_function_privilege('authenticated', 'public.record_interview_probe_verdict(uuid,uuid,uuid,text,text,integer,integer,integer,text,text,text,text,text,boolean,text,text,boolean,integer,integer,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.record_interview_probe_verdict(uuid,uuid,uuid,text,text,integer,integer,integer,text,text,text,text,text,boolean,text,text,boolean,integer,integer,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.record_interview_probe_verdict(uuid,uuid,uuid,text,text,integer,integer,integer,text,text,text,text,text,boolean,text,text,boolean,integer,integer,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.record_period_card_proposal(uuid,uuid,text,text,text,text,text,jsonb,text[],integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.record_context_blocks(uuid,text,text,text[],text[])', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.sweep_interview_sessions(integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.prune_interview_ledgers()', 'EXECUTE') THEN
    RAISE EXCEPTION 'a proxy or cron function is client-callable';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.close_interview_session(uuid,text,text,text,integer,integer)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.discard_interview_session(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.commit_interview_session(uuid,uuid,jsonb,boolean)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.decide_period_card(uuid,text,text,text,boolean)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.export_my_interview_judgements(timestamptz)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.commit_interview_session(uuid,uuid,jsonb,boolean)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.decide_period_card(uuid,text,text,text,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'screen functions are not authenticated-only';
  END IF;
  IF has_function_privilege('authenticated', 'public.fold_interview_session(uuid,text)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.fold_interview_session(uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.erase_audit_hashes(uuid[],text)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.erase_audit_hashes(uuid[],text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.interview_transcript_body(text,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'an internal helper is callable by a client or service role';
  END IF;
  FOREACH v_table IN ARRAY ARRAY['interview_sessions', 'interview_probe_verdicts', 'interview_transcripts',
      'interview_transcript_turns', 'period_card_proposals', 'interview_unsaved_rollup', 'ai_audit_context_blocks'] LOOP
    IF NOT (SELECT c.relrowsecurity AND c.relforcerowsecurity FROM pg_catalog.pg_class AS c
             WHERE c.oid = ('public.' || v_table)::regclass) THEN
      RAISE EXCEPTION '% is not under forced RLS', v_table;
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM public.erasure_registry
       WHERE (table_name, owner_column, class, delete_order) IN (
         ('interview_sessions', 'owner_id', 'account_delete_only', NULL),
         ('interview_transcript_turns', 'user_id', 'client_erasable', 28),
         ('interview_transcripts', 'user_id', 'client_erasable', 29),
         ('period_card_proposals', 'user_id', 'client_erasable', 49))) <> 3
     OR NOT EXISTS (SELECT 1 FROM public.erasure_registry
                     WHERE table_name = 'interview_sessions' AND class = 'account_delete_only') THEN
    RAISE EXCEPTION 'the interview registry rows are missing or misclassified';
  END IF;
  IF (SELECT count(*) FROM pg_catalog.pg_class AS c JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r'
         AND EXISTS (SELECT 1 FROM pg_catalog.pg_attribute AS a WHERE a.attrelid = c.oid AND a.attname = 'model_layer')
         AND EXISTS (SELECT 1 FROM pg_catalog.pg_attribute AS a WHERE a.attrelid = c.oid AND a.attname = 'verdict')) <> 1 THEN
    RAISE EXCEPTION 'there is not exactly one verdict ledger';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_attribute AS a
              WHERE a.attrelid = 'public.interview_unsaved_rollup'::regclass AND a.attnum > 0 AND NOT a.attisdropped
                AND a.atttypid IN ('uuid'::regtype, 'timestamptz'::regtype, 'timestamp'::regtype, 'bytea'::regtype, 'jsonb'::regtype)) THEN
    RAISE EXCEPTION 'the unsaved rollup has an id or time column';
  END IF;
END
$privileges$;

-- 2. The proxy writer, close, commit and the reconciliation (T-02).
DO $ledger$
DECLARE
  v_one constant uuid := '25000000-0000-4000-8000-000000000001';
  v_two constant uuid := '25000000-0000-4000-8000-000000000002';
  v_s1 constant uuid := '25000000-0000-4000-8000-0000000000a1';
  v_rec constant uuid := '25000000-0000-4000-8000-0000000000e1';
  v_turns jsonb;
  v_status text;
  v_result jsonb;
  v_n integer;
  v_texts text[] := ARRAY['그때 교실은 어땠나요?', '창가 자리였어요', '그때 기분은요?', '설렜어요',
    '그게 어떤 의미였나요?', '잘 모르겠어요', '조금 더 말해 줄래요?', '음',
    '다른 장면으로 가 볼게요. 운동장은요?', '체육 시간이 좋았어요', '그때 어떤 마음이었나요?',
    '친구들이 있어서 든든했어요', '그 든든함은 지금도 있나요?', '가끔요'];
  v_digest_of text;
BEGIN
  v_turns := (
    SELECT jsonb_agg(jsonb_build_object(
      'n', n, 'role', CASE WHEN n % 2 = 1 THEN 'interviewer' ELSE 'user' END,
      'scene', CASE WHEN n <= 8 THEN 1 ELSE 2 END,
      'layer', CASE n WHEN 1 THEN 'fact' WHEN 2 THEN 'fact' WHEN 3 THEN 'feeling' WHEN 4 THEN 'feeling'
                       WHEN 5 THEN 'meaning' WHEN 6 THEN 'meaning' WHEN 7 THEN 'meaning' WHEN 8 THEN 'meaning'
                       WHEN 9 THEN 'fact' WHEN 10 THEN 'fact' WHEN 11 THEN 'feeling' WHEN 12 THEN 'feeling'
                       ELSE 'meaning' END,
      'ask_kind', CASE WHEN n % 2 = 1 THEN CASE WHEN n IN (1, 9) THEN 'seed' WHEN n = 7 THEN 'scaffold' ELSE 'drill' END END,
      'origin', CASE WHEN n % 2 = 1 THEN CASE WHEN n IN (1, 7, 9) THEN 'fixed' ELSE 'model' END ELSE 'user' END,
      'text', v_texts[n],
      'opener_unedited', CASE WHEN n % 2 = 0 THEN n = 4 END,
      'state', CASE n WHEN 8 THEN 'local_block' WHEN 12 THEN 'unsettled' WHEN 2 THEN 'judged' WHEN 4 THEN 'judged'
                       WHEN 6 THEN 'judged' WHEN 10 THEN 'judged' WHEN 14 THEN 'judged' END)
      ORDER BY n)
      FROM generate_series(1, 14) AS g(n));

  -- Not the proxy: refused before anything is written.
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  BEGIN
    PERFORM public.record_interview_probe_verdict(v_one, '25000000-0000-4000-8000-0000000000b1', v_s1, 'school', 'ko',
      1, 1, 2, 'fact', 'seed', 'pass', 'fact', 'credited', true, 'r0', 'openai', false, 0, 3, NULL);
    RAISE EXCEPTION 'an authenticated caller wrote a verdict row';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  -- Scene 1: n2 fact credited, n4 feeling credited, n6 meaning refused. n8 never reaches the proxy.
  v_status := public.record_interview_probe_verdict(v_one, '25000000-0000-4000-8000-0000000000b1', v_s1, 'school', 'ko',
    1, 1, 2, 'fact', 'seed', 'pass', 'fact', 'credited', true, 'r0', 'openai', false, 0, 3,
    encode(sha256(convert_to(v_s1::text || ':2:' || v_texts[2], 'UTF8')), 'hex'));
  IF v_status <> 'recorded' THEN RAISE EXCEPTION 'first verdict not recorded: %', v_status; END IF;
  PERFORM public.record_interview_probe_verdict(v_one, '25000000-0000-4000-8000-0000000000b2', v_s1, 'school', 'ko',
    1, 2, 4, 'feeling', 'drill', 'pass', 'feeling', 'credited', true, 'r0', 'openai', true, 2, 1,
    encode(sha256(convert_to(v_s1::text || ':4:' || v_texts[4], 'UTF8')), 'hex'));
  PERFORM public.record_interview_probe_verdict(v_one, '25000000-0000-4000-8000-0000000000b3', v_s1, 'school', 'ko',
    1, 3, 6, 'meaning', 'drill', 'pass', NULL, 'none', false, 'r0', 'openai', false, 1, 2,
    encode(sha256(convert_to(v_s1::text || ':6:' || v_texts[6], 'UTF8')), 'hex'));
  -- Scene 2: n10 credited but its digest names other text; n12 judged but the screen never got it.
  PERFORM public.record_interview_probe_verdict(v_one, '25000000-0000-4000-8000-0000000000b4', v_s1, 'school', 'ko',
    2, 1, 10, 'fact', 'seed', 'pass', 'fact', 'credited', true, 'r0', 'openai', false, 0, 3,
    encode(sha256(convert_to(v_s1::text || ':10:something else', 'UTF8')), 'hex'));
  PERFORM public.record_interview_probe_verdict(v_one, '25000000-0000-4000-8000-0000000000b5', v_s1, 'school', 'ko',
    2, 2, 12, 'feeling', 'drill', 'pass', 'feeling', 'credited', true, 'r0', 'openai', false, 0, 3,
    encode(sha256(convert_to(v_s1::text || ':12:' || v_texts[12], 'UTF8')), 'hex'));
  -- A late answer the screen threw away: turn 20 never makes it into the transcript.
  PERFORM public.record_interview_probe_verdict(v_one, '25000000-0000-4000-8000-0000000000b6', v_s1, 'school', 'ko',
    2, 9, 20, 'echo', 'drill', 'pass', 'echo', 'credited', true, 'r0', 'openai', false, 0, 3, NULL);

  -- Same turn again (failover retry): the later call wins and keeps the earlier audit id.
  v_status := public.record_interview_probe_verdict(v_one, '25000000-0000-4000-8000-0000000000b7', v_s1, 'school', 'ko',
    1, 3, 6, 'meaning', 'drill', 'pass', NULL, 'none', false, 'r0', 'claude', false, 1, 2,
    encode(sha256(convert_to(v_s1::text || ':6:' || v_texts[6], 'UTF8')), 'hex'));
  IF v_status <> 'replaced'
     OR (SELECT prior_audit_ids FROM public.interview_probe_verdicts WHERE session_id = v_s1 AND turn_no = 6)
        <> ARRAY['25000000-0000-4000-8000-0000000000b3'::uuid]
     OR (SELECT call_count FROM public.interview_probe_verdicts WHERE session_id = v_s1 AND turn_no = 6) <> 2 THEN
    RAISE EXCEPTION 'a retried turn did not replace the row and keep the earlier audit id: %', v_status;
  END IF;
  -- The same audit row twice keeps one row, an earlier one too.
  v_status := public.record_interview_probe_verdict(v_one, '25000000-0000-4000-8000-0000000000b3', v_s1, 'school', 'ko',
    1, 3, 6, 'meaning', 'drill', 'pass', NULL, 'none', false, 'r0', 'openai', false, 1, 2, NULL);
  IF v_status <> 'duplicate' THEN RAISE EXCEPTION 'a repeated audit id was not refused: %', v_status; END IF;
  -- Scenes only move forward; foreign users and other periods are refused; a missing account writes nothing.
  v_status := public.record_interview_probe_verdict(v_one, gen_random_uuid(), v_s1, 'school', 'ko',
    1, 9, 30, 'fact', 'drill', 'pass', 'fact', 'credited', true, 'r0', 'openai', false, 0, 3, NULL);
  IF v_status <> 'scene_regressed' THEN RAISE EXCEPTION 'a backwards scene was recorded: %', v_status; END IF;
  v_status := public.record_interview_probe_verdict(v_two, gen_random_uuid(), v_s1, 'school', 'ko',
    3, 1, 31, 'fact', 'seed', 'pass', 'fact', 'credited', true, 'r0', 'openai', false, 0, 3, NULL);
  IF v_status <> 'session_not_owned' THEN RAISE EXCEPTION 'a foreign session accepted a verdict: %', v_status; END IF;
  v_status := public.record_interview_probe_verdict(v_one, gen_random_uuid(), v_s1, 'now', 'ko',
    3, 1, 31, 'fact', 'seed', 'pass', 'fact', 'credited', true, 'r0', 'openai', false, 0, 3, NULL);
  IF v_status <> 'session_mismatch' THEN RAISE EXCEPTION 'a session changed period: %', v_status; END IF;
  v_status := public.record_interview_probe_verdict('25000000-0000-4000-8000-0000000000ff', gen_random_uuid(),
    gen_random_uuid(), 'school', 'ko', 1, 1, 2, 'fact', 'seed', 'pass', 'fact', 'credited', true, 'r0', 'openai', false, 0, 3, NULL);
  IF v_status <> 'no_account' THEN RAISE EXCEPTION 'a missing account created a session: %', v_status; END IF;
  -- The rule set is locked to r0 during the baseline, and r0's final credit is credited AND pass.
  BEGIN
    PERFORM public.record_interview_probe_verdict(v_one, gen_random_uuid(), v_s1, 'school', 'ko',
      2, 3, 32, 'fact', 'drill', 'pass', 'fact', 'credited', true, 'r1', 'openai', false, 0, 3, NULL);
    RAISE EXCEPTION 'a rule set other than r0 was recorded';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.record_interview_probe_verdict(v_one, gen_random_uuid(), v_s1, 'school', 'ko',
      2, 3, 32, 'fact', 'drill', 'short', 'fact', 'credited', true, 'r0', 'openai', false, 0, 3, NULL);
    RAISE EXCEPTION 'a final credit that r0 would not give was recorded';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.record_interview_probe_verdict(v_one, gen_random_uuid(), v_s1, 'school', 'ko',
      2, 3, 32, 'fact', 'drill', 'pass', 'feeling', 'credited', true, 'r0', 'openai', false, 0, 3, NULL);
    RAISE EXCEPTION 'a credited verdict for another layer was recorded';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- The screen closes the session.
  PERFORM set_config('request.jwt.claim.role', '', true);
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated","sub":"25000000-0000-4000-8000-000000000002"}', true);
  v_status := public.close_interview_session(v_s1, 'school', 'ko', 'user_end', 0, 0);
  IF v_status <> 'not_found' THEN RAISE EXCEPTION 'another user closed the session: %', v_status; END IF;
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated","sub":"25000000-0000-4000-8000-000000000001"}', true);
  v_status := public.close_interview_session(v_s1, 'school', 'ko', 'complete', 1, 1);
  IF v_status <> 'closed' THEN RAISE EXCEPTION 'owner could not close: %', v_status; END IF;
  v_status := public.close_interview_session(v_s1, 'school', 'ko', 'left', 0, 0);
  IF v_status <> 'already_closed' THEN RAISE EXCEPTION 'a second close replaced the first reason: %', v_status; END IF;

  -- The saved record: the body the screen writes, the 0218 marker, the request key (body bytes pinned once).
  IF public.interview_transcript_body('ko', '[{"n":1,"role":"interviewer","text":"a"},{"n":2,"role":"user","text":"b"}]'::jsonb)
       <> E'질문: a\n\n답변: b'
     OR public.interview_transcript_body('en', '[{"n":1,"role":"interviewer","text":"a"},{"n":2,"role":"user","text":"b"}]'::jsonb)
       <> E'Q: a\n\nA: b' THEN
    RAISE EXCEPTION 'the transcript renderer drifted from interview.tsx keepIt';
  END IF;
  INSERT INTO public.records (id, user_id, kind, body, audit_period, system_tags, client_request_id, tags)
  VALUES (v_rec, v_one, 'audit_response', public.interview_transcript_body('ko', v_turns), 'school',
          ARRAY['interview', 'recall', 'screener', 'entry-ui:ko'], 'interview:' || v_s1::text, ARRAY['domain:growth']);
  INSERT INTO public.interview_coverage (user_id, period, layer, answers) VALUES (v_one, 'school', 'fact', 5);

  PERFORM set_config('request.jwt.claims', '{"role":"authenticated","sub":"25000000-0000-4000-8000-000000000002"}', true);
  v_result := public.commit_interview_session(v_s1, v_rec, v_turns);
  IF v_result ->> 'status' <> 'not_found' THEN RAISE EXCEPTION 'another user committed the session: %', v_result; END IF;
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated","sub":"25000000-0000-4000-8000-000000000001"}', true);
  v_result := public.commit_interview_session(v_s1, v_rec, jsonb_set(v_turns, '{3,text}', '"edited"'));
  IF v_result ->> 'status' <> 'transcript_mismatch' THEN RAISE EXCEPTION 'an edited transcript was accepted: %', v_result; END IF;
  v_result := public.commit_interview_session(v_s1, v_rec, v_turns - 2);
  IF v_result ->> 'status' <> 'turns_invalid' THEN RAISE EXCEPTION 'a gap in the turn numbers was accepted: %', v_result; END IF;
  v_result := public.commit_interview_session(v_s1, gen_random_uuid(), v_turns);
  IF v_result ->> 'status' <> 'record_mismatch' THEN RAISE EXCEPTION 'a missing record was accepted: %', v_result; END IF;
  IF EXISTS (SELECT 1 FROM public.interview_transcripts WHERE session_id = v_s1) THEN
    RAISE EXCEPTION 'a refused commit wrote a transcript';
  END IF;

  v_result := public.commit_interview_session(v_s1, v_rec, v_turns);
  IF v_result ->> 'status' <> 'committed'
     OR (v_result ->> 'user_turns')::integer <> 7
     OR (v_result ->> 'ledger_rows')::integer <> 7
     OR (v_result ->> 'proxy_rows')::integer <> 5
     OR (v_result ->> 'mismatches')::integer <> 1
     OR (v_result ->> 'orphans')::integer <> 1
     OR (v_result ->> 'cells_added')::integer <> 2 THEN
    RAISE EXCEPTION 'unexpected commit result: %', v_result;
  END IF;
  -- One ledger row per user turn, each linked to its transcript turn (T-02).
  IF (SELECT count(*) FROM public.interview_probe_verdicts AS v
        JOIN public.interview_transcripts AS t ON t.id = v.transcript_id
       WHERE t.session_id = v_s1)
     <> (SELECT count(*) FROM public.interview_transcript_turns AS tt
           JOIN public.interview_transcripts AS t ON t.id = tt.transcript_id
          WHERE t.session_id = v_s1 AND tt.role = 'user') THEN
    RAISE EXCEPTION 'ledger rows do not equal user turns';
  END IF;
  IF (SELECT link_state FROM public.interview_probe_verdicts WHERE session_id = v_s1 AND turn_no = 2) <> 'linked'
     OR (SELECT link_state FROM public.interview_probe_verdicts WHERE session_id = v_s1 AND turn_no = 10) <> 'text_mismatch'
     OR (SELECT link_state FROM public.interview_probe_verdicts WHERE session_id = v_s1 AND turn_no = 12) <> 'undelivered'
     OR (SELECT link_state FROM public.interview_probe_verdicts WHERE session_id = v_s1 AND turn_no = 20) <> 'orphan'
     OR (SELECT verdict || '/' || source FROM public.interview_probe_verdicts WHERE session_id = v_s1 AND turn_no = 8) <> 'local_block/client'
     OR (SELECT verdict || '/' || source || '/' || probe_kind FROM public.interview_probe_verdicts WHERE session_id = v_s1 AND turn_no = 14) <> 'unrecorded/client/drill'
     OR EXISTS (SELECT 1 FROM public.interview_probe_verdicts WHERE session_id = v_s1 AND answer_digest IS NOT NULL) THEN
    RAISE EXCEPTION 'the reconciliation set the wrong link states or kept a digest';
  END IF;
  IF (SELECT answers FROM public.interview_coverage WHERE user_id = v_one AND period = 'school' AND layer = 'fact') <> 6
     OR (SELECT answers FROM public.interview_coverage WHERE user_id = v_one AND period = 'school' AND layer = 'feeling') <> 1
     OR EXISTS (SELECT 1 FROM public.interview_coverage WHERE user_id = v_one AND period = 'school' AND layer IN ('meaning', 'belief', 'echo')) THEN
    RAISE EXCEPTION 'commit credited the wrong cells';
  END IF;
  v_result := public.commit_interview_session(v_s1, v_rec, v_turns);
  IF v_result ->> 'status' <> 'already_committed'
     OR (SELECT answers FROM public.interview_coverage WHERE user_id = v_one AND period = 'school' AND layer = 'fact') <> 6 THEN
    RAISE EXCEPTION 'a second commit added again: %', v_result;
  END IF;
  IF (SELECT count(*) FROM public.export_my_interview_judgements(NULL)) <> 5 THEN
    RAISE EXCEPTION 'the owner export did not return the five linked answers';
  END IF;
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated","sub":"25000000-0000-4000-8000-000000000002"}', true);
  IF (SELECT count(*) FROM public.export_my_interview_judgements(NULL)) <> 0 THEN
    RAISE EXCEPTION 'another user saw the owner judgements';
  END IF;
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  v_status := public.record_interview_probe_verdict(v_one, gen_random_uuid(), v_s1, 'school', 'ko',
    3, 1, 40, 'fact', 'seed', 'pass', 'fact', 'credited', true, 'r0', 'openai', false, 0, 3, NULL);
  IF v_status <> 'session_committed' THEN RAISE EXCEPTION 'a committed session took a verdict: %', v_status; END IF;
  IF (SELECT count(*) FROM public.record_layer_inferences WHERE record_id = v_rec) <> 5 THEN
    RAISE EXCEPTION 'the layer inference view does not show the five linked turns';
  END IF;
  PERFORM set_config('request.jwt.claim.role', '', true);
END
$ledger$;

-- 3. Unsaved conversations leave no trace but numbers (T-19, D2).
DO $unsaved$
DECLARE
  v_one constant uuid := '25000000-0000-4000-8000-000000000001';
  v_s2 constant uuid := '25000000-0000-4000-8000-0000000000a2';
  v_s3 constant uuid := '25000000-0000-4000-8000-0000000000a3';
  v_s4 constant uuid := '25000000-0000-4000-8000-0000000000a4';
  v_week date;
  v_status text;
  v_n integer;
BEGIN
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM public.record_interview_probe_verdict(v_one, '25000000-0000-4000-8000-0000000000b8', v_s2, 'work', 'ko',
    1, 1, 2, 'fact', 'seed', 'pass', 'fact', 'credited', true, 'r0', 'openai', false, 0, 3, NULL);
  PERFORM public.record_interview_probe_verdict(v_one, '25000000-0000-4000-8000-0000000000b9', v_s2, 'work', 'ko',
    1, 2, 4, 'feeling', 'drill', 'pass', 'meaning', 'other_layer', false, 'r0', 'openai', false, 0, 2, NULL);
  PERFORM public.record_interview_probe_verdict(v_one, '25000000-0000-4000-8000-0000000000ba', v_s2, 'work', 'ko',
    1, 2, 4, 'feeling', 'drill', 'pass', NULL, 'no_verdict', false, 'r0', 'openai', false, 0, 2, NULL);
  v_week := date_trunc('week', (SELECT started_at FROM public.interview_sessions WHERE id = v_s2) AT TIME ZONE 'Asia/Seoul')::date;

  PERFORM set_config('request.jwt.claim.role', '', true);
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated","sub":"25000000-0000-4000-8000-000000000002"}', true);
  v_status := public.discard_interview_session(v_s2);
  IF v_status <> 'not_found' THEN RAISE EXCEPTION 'another user discarded the session: %', v_status; END IF;
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated","sub":"25000000-0000-4000-8000-000000000001"}', true);
  v_status := public.discard_interview_session(v_s2);
  IF v_status <> 'discarded' THEN RAISE EXCEPTION 'owner could not discard: %', v_status; END IF;
  IF EXISTS (SELECT 1 FROM public.interview_sessions WHERE id = v_s2)
     OR EXISTS (SELECT 1 FROM public.interview_probe_verdicts WHERE session_id = v_s2) THEN
    RAISE EXCEPTION 'discard left session or verdict rows behind';
  END IF;
  IF (SELECT count(*) FROM public.ai_audit_log
       WHERE id IN ('25000000-0000-4000-8000-0000000000b8', '25000000-0000-4000-8000-0000000000b9',
                    '25000000-0000-4000-8000-0000000000ba')
         AND prompt_hash = '' AND output_hash = '') <> 3
     OR (SELECT prompt_hash FROM public.ai_audit_log WHERE id = '25000000-0000-4000-8000-0000000000b1') = '' THEN
    RAISE EXCEPTION 'discard did not erase exactly the session audit hashes';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.interview_unsaved_rollup
                  WHERE week_kst = v_week AND period = 'work' AND locale = 'ko' AND vendor = 'openai'
                    AND rule_set = 'r0' AND outcome = 'discarded' AND end_reason = 'left'
                    AND sessions = 1 AND scenes = 1 AND judged = 2 AND v_credited = 1 AND v_no_verdict = 1
                    AND final_credit = 1 AND depth_hist = ARRAY[0, 1, 0, 0, 0, 0]
                    AND scenes_hist = ARRAY[1, 0, 0, 0, 0, 0]
                    AND layer_judged = ARRAY[1, 1, 0, 0, 0] AND layer_no_verdict = ARRAY[0, 1, 0, 0, 0]) THEN
    RAISE EXCEPTION 'the discarded session was not folded into the expected rollup row: %',
      (SELECT jsonb_agg(to_jsonb(u)) FROM public.interview_unsaved_rollup AS u);
  END IF;
  IF EXISTS (SELECT 1 FROM public.interview_unsaved_rollup AS u WHERE to_jsonb(u)::text LIKE '%' || v_s2::text || '%') THEN
    RAISE EXCEPTION 'the rollup carries the session id';
  END IF;

  -- Idle sessions are swept after six hours; fresh ones stay.
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM public.record_interview_probe_verdict(v_one, '25000000-0000-4000-8000-0000000000bb', v_s3, 'now', 'en',
    1, 1, 2, 'fact', 'seed', 'pass', 'fact', 'credited', true, 'r0', 'claude', false, 0, 3, NULL);
  UPDATE public.interview_sessions SET last_seen_at = now() - INTERVAL '7 hours' WHERE id = v_s3;
  PERFORM public.record_interview_probe_verdict(v_one, '25000000-0000-4000-8000-0000000000bc', v_s4, 'now', 'en',
    1, 1, 2, 'fact', 'seed', 'pass', 'fact', 'credited', true, 'r0', 'claude', false, 0, 3, NULL);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  BEGIN
    PERFORM public.sweep_interview_sessions();
    RAISE EXCEPTION 'an authenticated caller ran the sweep';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  v_n := public.sweep_interview_sessions();
  IF v_n <> 1
     OR EXISTS (SELECT 1 FROM public.interview_sessions WHERE id = v_s3)
     OR NOT EXISTS (SELECT 1 FROM public.interview_sessions WHERE id = v_s4)
     OR (SELECT prompt_hash FROM public.ai_audit_log WHERE id = '25000000-0000-4000-8000-0000000000bb') <> ''
     OR NOT EXISTS (SELECT 1 FROM public.interview_unsaved_rollup
                     WHERE period = 'now' AND locale = 'en' AND vendor = 'claude' AND outcome = 'left' AND sessions = 1) THEN
    RAISE EXCEPTION 'the sweep touched the wrong sessions (%)', v_n;
  END IF;
  PERFORM set_config('request.jwt.claim.role', '', true);
END
$unsaved$;

-- 4. Period cards: evidence = cited AND sent, decisions on one row, L5 written by the server (T-06, T-07, T-08).
DO $cards$
DECLARE
  v_one constant uuid := '25000000-0000-4000-8000-000000000001';
  v_rec constant uuid := '25000000-0000-4000-8000-0000000000e1';
  v_t2 text := 'record:25000000-0000-4000-8000-0000000000e1#t2';
  v_t4 text := 'record:25000000-0000-4000-8000-0000000000e1#t4';
  v_sent jsonb;
  v_result jsonb;
  v_p1 uuid; v_sha1 text;
  v_p2 uuid; v_sha2 text;
  v_p3 uuid; v_sha3 text;
  v_p4 uuid; v_sha4 text;
BEGIN
  v_sent := jsonb_build_array(
    jsonb_build_object('ref', v_t2, 'len', 4, 'sha256', encode(sha256(convert_to(left('창가 자리였어요', 4), 'UTF8')), 'hex')),
    jsonb_build_object('ref', v_t4, 'len', 2, 'sha256', repeat('0', 64)),
    jsonb_build_object('ref', 'record:25000000-0000-4000-8000-0000000000e1#t1', 'len', 2,
                       'sha256', encode(sha256(convert_to(left('그때 교실은 어땠나요?', 2), 'UTF8')), 'hex')),
    jsonb_build_object('ref', 'record:25000000-0000-4000-8000-0000000000ee#t2', 'len', 2, 'sha256', repeat('0', 64)));

  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  BEGIN
    PERFORM public.record_period_card_proposal(v_one, NULL, 'openai', 'school', 'card-key-00000001',
      '그때의 나는 창가에서 설렜다', NULL, v_sent, ARRAY['record:25000000-0000-4000-8000-0000000000e1'], 2);
    RAISE EXCEPTION 'an authenticated caller recorded a proposal';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  -- A record-level citation expands to the turns that passed: only #t2 (wrong hash, question turn, foreign record drop out).
  v_result := public.record_period_card_proposal(v_one, NULL, 'openai', 'school', 'card-key-00000001',
    '그때의 나는 창가에서 설렜다', '창가 자리를 말했다', v_sent, ARRAY['record:25000000-0000-4000-8000-0000000000e1'], 2);
  IF v_result ->> 'status' <> 'recorded' THEN RAISE EXCEPTION 'proposal not recorded: %', v_result; END IF;
  v_p1 := (v_result ->> 'proposal_id')::uuid; v_sha1 := v_result ->> 'content_sha';
  IF (SELECT evidence_sent FROM public.period_card_proposals WHERE id = v_p1) <> ARRAY[v_t2]
     OR (SELECT evidence_cited FROM public.period_card_proposals WHERE id = v_p1) <> ARRAY[v_t2] THEN
    RAISE EXCEPTION 'evidence was not cited AND sent';
  END IF;
  v_result := public.record_period_card_proposal(v_one, NULL, 'openai', 'school', 'card-key-00000001',
    '다른 문장', NULL, v_sent, ARRAY[v_t2], 2);
  IF v_result ->> 'status' <> 'duplicate' OR (v_result ->> 'proposal_id')::uuid <> v_p1 THEN
    RAISE EXCEPTION 'a repeated request key made a second row: %', v_result;
  END IF;
  v_result := public.record_period_card_proposal(v_one, NULL, 'openai', 'school', 'card-key-00000002',
    '인용 밖', NULL, v_sent, ARRAY['record:25000000-0000-4000-8000-0000000000ee#t2'], 2);
  IF v_result ->> 'status' <> 'rejected' OR v_result ->> 'reason' <> 'no_cited_evidence' THEN
    RAISE EXCEPTION 'a proposal citing only unsent evidence was recorded: %', v_result;
  END IF;
  v_result := public.record_period_card_proposal(v_one, NULL, 'openai', 'now', 'card-key-00000003',
    '다른 시기', NULL, v_sent, ARRAY[v_t2], 2);
  IF v_result ->> 'status' <> 'rejected' OR v_result ->> 'reason' <> 'no_sent_evidence' THEN
    RAISE EXCEPTION 'evidence from another period was accepted: %', v_result;
  END IF;
  BEGIN
    INSERT INTO public.period_card_proposals (user_id, star_id, request_key, vendor, proposal_text,
      evidence_sent, evidence_cited, content_sha, level_before)
    VALUES (v_one, 'school', 'card-key-direct-0', 'openai', 'x', ARRAY[v_t2], ARRAY[v_t4], repeat('a', 64), 2);
    RAISE EXCEPTION 'a citation outside the sent set was stored';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- Decide: owner only, CAS, one row per proposal.
  PERFORM set_config('request.jwt.claim.role', '', true);
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated","sub":"25000000-0000-4000-8000-000000000002"}', true);
  v_result := public.decide_period_card(v_p1, v_sha1, 'declined');
  IF v_result ->> 'status' <> 'not_found' THEN RAISE EXCEPTION 'another user decided the card: %', v_result; END IF;
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated","sub":"25000000-0000-4000-8000-000000000001"}', true);
  BEGIN
    PERFORM public.decide_period_card(v_p1, repeat('b', 64), 'declined');
    RAISE EXCEPTION 'a stale content sha was accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'period_card_changed' THEN RAISE; END IF;
  END;
  v_result := public.decide_period_card(v_p1, v_sha1, 'declined');
  IF v_result ->> 'status' <> 'declined'
     OR (SELECT count(*) FROM public.period_card_proposals WHERE user_id = v_one AND request_key = 'card-key-00000001') <> 1
     OR (SELECT decided_at FROM public.period_card_proposals WHERE id = v_p1) IS NULL
     OR EXISTS (SELECT 1 FROM public.star_tier_history WHERE user_id = v_one AND star_id = 'seven:school') THEN
    RAISE EXCEPTION 'decline did not leave one decided row and no L5: %', v_result;
  END IF;
  v_result := public.decide_period_card(v_p1, v_sha1, 'declined');
  IF v_result ->> 'status' <> 'declined' THEN RAISE EXCEPTION 'a repeated decline changed the result: %', v_result; END IF;
  BEGIN
    PERFORM public.decide_period_card(v_p1, v_sha1, 'ratified');
    RAISE EXCEPTION 'a declined card was ratified';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'invalid_period_card' THEN RAISE; END IF;
  END;

  -- Ratify writes seven:<star> L5 once, by the server; a second ratified card supersedes the first.
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  v_result := public.record_period_card_proposal(v_one, NULL, 'claude', 'school', 'card-key-00000004',
    '그때의 나는 창가를 좋아했다', NULL, v_sent, ARRAY[v_t2], 2);
  v_p2 := (v_result ->> 'proposal_id')::uuid; v_sha2 := v_result ->> 'content_sha';
  PERFORM set_config('request.jwt.claim.role', '', true);
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated","sub":"25000000-0000-4000-8000-000000000001"}', true);
  v_result := public.decide_period_card(v_p2, v_sha2, 'ratified');
  IF v_result ->> 'status' <> 'ratified' OR (v_result ->> 'level')::integer <> 5
     OR (v_result ->> 'was_l5_before')::boolean
     OR (SELECT count(*) FROM public.star_tier_history
          WHERE user_id = v_one AND star_id = 'seven:school' AND level = 5 AND evidence_origin = 'ratify'
            AND evidence_citations = ARRAY[v_t2]) <> 1 THEN
    RAISE EXCEPTION 'ratify did not write one seven:school L5 row: %', v_result;
  END IF;
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  v_result := public.record_period_card_proposal(v_one, NULL, 'claude', 'school', 'card-key-00000005',
    '그때의 나는 친구가 든든했다', NULL, v_sent, ARRAY[v_t2], 5);
  v_p3 := (v_result ->> 'proposal_id')::uuid; v_sha3 := v_result ->> 'content_sha';
  PERFORM set_config('request.jwt.claim.role', '', true);
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated","sub":"25000000-0000-4000-8000-000000000001"}', true);
  v_result := public.decide_period_card(v_p3, v_sha3, 'ratified');
  IF NOT (v_result ->> 'was_l5_before')::boolean
     OR (SELECT superseded_by FROM public.period_card_proposals WHERE id = v_p2) <> v_p3
     OR (SELECT count(*) FROM public.period_card_proposals
          WHERE user_id = v_one AND star_id = 'school' AND status = 'ratified' AND superseded_by IS NULL) <> 1 THEN
    RAISE EXCEPTION 'a second ratified card did not supersede the first: %', v_result;
  END IF;
  -- Missed: the user's own words, one row.
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  v_result := public.record_period_card_proposal(v_one, NULL, 'openai', 'school', 'card-key-00000006',
    '그때의 나는 혼자였다', NULL, v_sent, ARRAY[v_t2], 5);
  v_p4 := (v_result ->> 'proposal_id')::uuid; v_sha4 := v_result ->> 'content_sha';
  PERFORM set_config('request.jwt.claim.role', '', true);
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated","sub":"25000000-0000-4000-8000-000000000001"}', true);
  v_result := public.decide_period_card(v_p4, v_sha4, 'missed', '혼자는 아니었어요', false);
  IF v_result ->> 'status' <> 'missed'
     OR (SELECT miss_text FROM public.period_card_proposals WHERE id = v_p4) <> '혼자는 아니었어요' THEN
    RAISE EXCEPTION 'missed was not stored on the same row: %', v_result;
  END IF;
  PERFORM set_config('request.jwt.claims', '', true);
END
$cards$;

-- 5. Response block ids: ids only, against a real audit row (T-09 contract).
DO $blocks$
DECLARE
  v_audit constant uuid := '25000000-0000-4000-8000-0000000000c8';
  v_status text;
BEGIN
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  BEGIN
    PERFORM public.record_context_blocks(v_audit, 'secondb_chat', 'r1', ARRAY['record:abc'], NULL);
    RAISE EXCEPTION 'an authenticated caller recorded block ids';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  IF public.record_context_blocks(v_audit, 'secondb_chat', 'r1', ARRAY['record:abc', 'wiki:page-1'], ARRAY['wiki:page-1']) <> 'recorded'
     OR public.record_context_blocks(v_audit, 'secondb_chat', 'r1', ARRAY['record:abc'], NULL) <> 'duplicate'
     OR public.record_context_blocks(gen_random_uuid(), 'secondb_chat', 'r1', ARRAY['record:abc'], NULL) <> 'no_audit'
     OR public.record_context_blocks(v_audit, 'secondb_chat', 'r1', ARRAY['the user said hello'], NULL) <> 'rejected' THEN
    RAISE EXCEPTION 'record_context_blocks did not keep to ids only';
  END IF;
  IF (SELECT cited_ids FROM public.ai_audit_context_blocks WHERE audit_id = v_audit) <> ARRAY['wiki:page-1'] THEN
    RAISE EXCEPTION 'cited ids were not kept';
  END IF;
  PERFORM set_config('request.jwt.claim.role', '', true);
END
$blocks$;

-- 6. Deleting the saved record folds the session, erases its audit hashes, and takes the cards and L5 that cite it (D5, Q5).
DELETE FROM public.records WHERE id = '25000000-0000-4000-8000-0000000000e1';
DO $record_erasure$
DECLARE
  v_one constant uuid := '25000000-0000-4000-8000-000000000001';
BEGIN
  IF EXISTS (SELECT 1 FROM public.interview_sessions WHERE id = '25000000-0000-4000-8000-0000000000a1')
     OR EXISTS (SELECT 1 FROM public.interview_transcripts WHERE session_id = '25000000-0000-4000-8000-0000000000a1')
     OR EXISTS (SELECT 1 FROM public.interview_probe_verdicts WHERE session_id = '25000000-0000-4000-8000-0000000000a1') THEN
    RAISE EXCEPTION 'deleting the record left interview rows behind';
  END IF;
  IF (SELECT prompt_hash FROM public.ai_audit_log WHERE id = '25000000-0000-4000-8000-0000000000b1') <> ''
     OR (SELECT prompt_hash FROM public.ai_audit_log WHERE id = '25000000-0000-4000-8000-0000000000b3') <> '' THEN
    RAISE EXCEPTION 'deleting the record kept the audit hashes of its calls';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.interview_unsaved_rollup
                  WHERE period = 'school' AND outcome = 'deleted_after_save' AND end_reason = 'complete' AND sessions = 1) THEN
    RAISE EXCEPTION 'the deleted record was not folded into the rollup';
  END IF;
  IF EXISTS (SELECT 1 FROM public.period_card_proposals WHERE user_id = v_one AND status = 'ratified')
     OR EXISTS (SELECT 1 FROM public.star_tier_history WHERE user_id = v_one AND star_id = 'seven:school') THEN
    RAISE EXCEPTION 'cards or L5 rows citing the deleted record survived';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.interview_coverage WHERE user_id = v_one AND period = 'school' AND layer = 'fact' AND answers = 6) THEN
    RAISE EXCEPTION 'deleting the record changed the coverage cells';
  END IF;
END
$record_erasure$;

-- 7. interview_coverage: a cell never shrinks and never moves.
DO $coverage$
DECLARE
  v_one constant uuid := '25000000-0000-4000-8000-000000000001';
BEGIN
  BEGIN
    UPDATE public.interview_coverage SET answers = 0 WHERE user_id = v_one AND period = 'school' AND layer = 'fact';
    RAISE EXCEPTION 'a coverage cell was lowered';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.interview_coverage SET period = 'now' WHERE user_id = v_one AND period = 'school' AND layer = 'fact';
    RAISE EXCEPTION 'a coverage cell was moved to another period';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  UPDATE public.interview_coverage SET answers = answers + 1 WHERE user_id = v_one AND period = 'school' AND layer = 'fact';
END
$coverage$;

-- 8. Retention: open proposals expire at 30 days, decided non-ratified rows go at 365, the rollup at 730, block ids at 90.
DO $prune$
DECLARE
  v_result jsonb;
BEGIN
  UPDATE public.period_card_proposals SET created_at = now() - INTERVAL '400 days', decided_at = now() - INTERVAL '400 days'
   WHERE status IN ('declined', 'missed');
  UPDATE public.ai_audit_context_blocks SET created_at = now() - INTERVAL '91 days';
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  v_result := public.prune_interview_ledgers();
  IF (v_result ->> 'proposals_deleted')::integer < 2 OR (v_result ->> 'blocks_deleted')::integer <> 1 THEN
    RAISE EXCEPTION 'prune did not remove the aged rows: %', v_result;
  END IF;
  PERFORM set_config('request.jwt.claim.role', '', true);
END
$prune$;

-- 9. Account deletion takes every owned interview row; the owner-less rollup stays.
DELETE FROM auth.users WHERE id = '25000000-0000-4000-8000-000000000001';
DO $cascade$
BEGIN
  IF EXISTS (SELECT 1 FROM public.interview_sessions WHERE owner_id = '25000000-0000-4000-8000-000000000001')
     OR EXISTS (SELECT 1 FROM public.interview_transcripts WHERE user_id = '25000000-0000-4000-8000-000000000001')
     OR EXISTS (SELECT 1 FROM public.period_card_proposals WHERE user_id = '25000000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'account deletion left owned interview rows behind';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.interview_unsaved_rollup) THEN
    RAISE EXCEPTION 'the owner-less rollup did not survive account deletion';
  END IF;
END
$cascade$;

ROLLBACK;
