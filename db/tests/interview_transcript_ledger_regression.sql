\set ON_ERROR_STOP on

-- Run only on the CI scratch database after the numbered 0225 (interview transcript
-- ledger) and 0226 (its erasure-registry rows) migrations. The staged Supabase CLI
-- push already applied both; this file never replays them. Everything below runs in
-- one transaction and is rolled back. Design: docs/design/d6-verdict-ledger-261007.md
-- section 6 (T-02, T-06, T-07, T-08, T-09, T-14, T-15, T-19). The gate round 1 findings each
-- have a block below that names them (D6-01 ... D6-59); each was checked to FAIL with its fix
-- reverted. Two of them (D6-51's race, D6-57) need two connections and are only partly covered
-- here (the lock a writer takes is read from pg_locks).
BEGIN;

-- The vanilla PostgreSQL auth stub lacks production trigger columns.
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users (id, email) VALUES
  ('25000000-0000-4000-8000-000000000001', 'd6-one@example.com'),
  ('25000000-0000-4000-8000-000000000002', 'd6-two@example.com'),
  ('25000000-0000-4000-8000-000000000003', 'd6-three@example.com');
SET LOCAL session_replication_role = origin;
INSERT INTO public.users (id, email, birth_date, locale) VALUES
  ('25000000-0000-4000-8000-000000000001', 'd6-one@example.com', DATE '1990-01-01', 'ko'),
  ('25000000-0000-4000-8000-000000000002', 'd6-two@example.com', DATE '1990-01-01', 'ko'),
  ('25000000-0000-4000-8000-000000000003', 'd6-three@example.com', DATE '1990-01-01', 'ko');

-- Audit rows (the proxy writes these before the ledger call). Last byte of the id:
--   b1-bc, d0-de  interview_probe, user one     df  interview_probe, user one, safety_zone red
--   f0-f7         interview_probe, user two     cb  interview_probe, user three
--   90-97         self_model_propose, user one  cc  self_model_propose, user three
--   c8, ce, cf    secondb_chat, user one        ca  secondb_chat, user three
--   c9            secondb_chat, no user (account deleted: user_id SET NULL)
--   cd            interview_probe, user one, but client_unverified
INSERT INTO public.ai_audit_log (id, user_id, prompt_hash, output_hash, model_used, vertex_backend, safety_zone, latency_ms, purpose, event_source)
SELECT ('25000000-0000-4000-8000-0000000000' || lpad(to_hex(n), 2, '0'))::uuid,
       CASE WHEN n BETWEEN 240 AND 247 THEN '25000000-0000-4000-8000-000000000002'::uuid
            WHEN n IN (202, 203, 204) THEN '25000000-0000-4000-8000-000000000003'::uuid
            WHEN n = 201 THEN NULL
            ELSE '25000000-0000-4000-8000-000000000001'::uuid END,
       CASE WHEN n = 205 THEN 'aa' ELSE 'p' || n END,
       CASE WHEN n = 205 THEN 'bb' ELSE 'o' || n END,
       'test-model', false, (CASE WHEN n = 223 THEN 'red' ELSE 'green' END)::public.safety_zone, 1,
       CASE WHEN n IN (200, 201, 202, 206, 207) THEN 'secondb_chat'
            WHEN n BETWEEN 144 AND 151 OR n = 204 THEN 'self_model_propose'
            ELSE 'interview_probe' END,
       CASE WHEN n = 205 THEN 'client_unverified' ELSE 'server_verified' END
  FROM (SELECT g FROM generate_series(177, 188) AS g
        UNION ALL SELECT g FROM generate_series(200, 207) AS g
        UNION ALL SELECT g FROM generate_series(208, 223) AS g
        UNION ALL SELECT g FROM generate_series(240, 247) AS g
        UNION ALL SELECT g FROM generate_series(144, 151) AS g) AS t(n);

-- Shorthand for the fixture audit ids, and for "does this transaction hold that advisory lock".
CREATE FUNCTION pg_temp.aid(p_byte text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('25000000-0000-4000-8000-0000000000' || p_byte)::uuid
$$;
CREATE FUNCTION pg_temp.hashes_erased(p_bytes text[]) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT pg_catalog.count(*) = pg_catalog.cardinality(p_bytes)
    FROM public.ai_audit_log AS a
   WHERE a.id IN (SELECT pg_temp.aid(b) FROM pg_catalog.unnest(p_bytes) AS u(b))
     AND a.prompt_hash = '' AND a.output_hash = ''
$$;
CREATE FUNCTION pg_temp.holds_advisory(p_key bigint, p_mode text) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_locks AS l
                  WHERE l.locktype = 'advisory' AND l.pid = pg_catalog.pg_backend_pid() AND l.granted
                    AND l.mode = p_mode AND l.objsubid = 1
                    AND ((l.classid::bigint << 32) | l.objid::bigint) = p_key)
$$;

-- 1. Privileges, forced RLS, the registry rows, one verdict ledger, a rollup with no id/time/text slot.
DO $privileges$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['interview_sessions', 'interview_probe_verdicts', 'interview_unsaved_rollup',
      'ai_audit_context_blocks', 'interview_scene_metrics', 'record_layer_inferences',
      'interview_session_audit_ids', 'interview_session_tombstones', 'interview_session_starts'] LOOP
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
     OR NOT has_function_privilege('authenticated', 'public.delete_period_card(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.export_my_interview_judgements(timestamptz)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.commit_interview_session(uuid,uuid,jsonb,boolean)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.decide_period_card(uuid,text,text,text,boolean)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.delete_period_card(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'screen functions are not authenticated-only';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.unnest(ARRAY[
         'public.fold_interview_session(uuid,text)', 'public.erase_audit_hashes(uuid,uuid[],text)',
         'public.interview_account_writable(uuid)', 'public.period_card_remove(uuid,uuid[])',
         'public.interview_transcript_body(text,jsonb)', 'public.interview_verdict_erasure()',
         'public.interview_session_count_start()', 'public.interview_record_erasure()',
         'public.ai_context_block_record_erasure()', 'public.period_card_delete_guard()']) AS f(sig)
              CROSS JOIN pg_catalog.unnest(ARRAY['anon', 'authenticated', 'service_role']) AS r(role)
             WHERE has_function_privilege(r.role, f.sig, 'EXECUTE')) THEN
    RAISE EXCEPTION 'an internal helper is callable by a client or service role';
  END IF;
  FOREACH v_table IN ARRAY ARRAY['interview_sessions', 'interview_probe_verdicts', 'interview_transcripts',
      'interview_transcript_turns', 'period_card_proposals', 'interview_unsaved_rollup', 'ai_audit_context_blocks',
      'interview_session_audit_ids', 'interview_session_tombstones', 'interview_session_starts'] LOOP
    IF NOT (SELECT c.relrowsecurity AND c.relforcerowsecurity FROM pg_catalog.pg_class AS c
             WHERE c.oid = ('public.' || v_table)::regclass) THEN
      RAISE EXCEPTION '% is not under forced RLS', v_table;
    END IF;
  END LOOP;
  -- D6-05: the context-block table is owned and registered; the session-start counter too.
  IF (SELECT count(*) FROM public.erasure_registry AS r
       WHERE (r.table_name, r.owner_column, r.class, COALESCE(r.delete_order, 0)) IN (
         ('interview_sessions', 'owner_id', 'account_delete_only', 0),
         ('interview_transcript_turns', 'user_id', 'client_erasable', 28),
         ('interview_transcripts', 'user_id', 'client_erasable', 29),
         ('period_card_proposals', 'user_id', 'client_erasable', 49),
         ('ai_audit_context_blocks', 'user_id', 'account_delete_only', 0),
         ('interview_session_starts', 'owner_id', 'retained', 0))) <> 6 THEN
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
  v_status := public.record_interview_probe_verdict(v_one, pg_temp.aid('d0'), v_s1, 'school', 'ko',
    1, 9, 30, 'fact', 'drill', 'pass', 'fact', 'credited', true, 'r0', 'openai', false, 0, 3, NULL);
  IF v_status <> 'scene_regressed' THEN RAISE EXCEPTION 'a backwards scene was recorded: %', v_status; END IF;
  -- D6-54: the refused call still belongs to the session; its hash goes when the session is folded (section 6).
  IF NOT EXISTS (SELECT 1 FROM public.interview_session_audit_ids WHERE audit_id = pg_temp.aid('d0') AND session_id = v_s1)
     OR pg_temp.hashes_erased(ARRAY['d0']) THEN
    RAISE EXCEPTION 'D6-54: a refused call was not tied to its session';
  END IF;
  v_status := public.record_interview_probe_verdict(v_two, pg_temp.aid('f0'), v_s1, 'school', 'ko',
    3, 1, 31, 'fact', 'seed', 'pass', 'fact', 'credited', true, 'r0', 'openai', false, 0, 3, NULL);
  IF v_status <> 'session_not_owned' THEN RAISE EXCEPTION 'a foreign session accepted a verdict: %', v_status; END IF;
  -- A call that cannot be tied to its caller's session leaves no hash behind.
  IF NOT pg_temp.hashes_erased(ARRAY['f0'])
     OR EXISTS (SELECT 1 FROM public.interview_session_audit_ids WHERE audit_id = pg_temp.aid('f0')) THEN
    RAISE EXCEPTION 'D6-54: a call refused as session_not_owned kept its hash';
  END IF;
  v_status := public.record_interview_probe_verdict(v_one, pg_temp.aid('d1'), v_s1, 'now', 'ko',
    3, 1, 31, 'fact', 'seed', 'pass', 'fact', 'credited', true, 'r0', 'openai', false, 0, 3, NULL);
  IF v_status <> 'session_mismatch' THEN RAISE EXCEPTION 'a session changed period: %', v_status; END IF;
  v_status := public.record_interview_probe_verdict('25000000-0000-4000-8000-0000000000ff', gen_random_uuid(),
    gen_random_uuid(), 'school', 'ko', 1, 1, 2, 'fact', 'seed', 'pass', 'fact', 'credited', true, 'r0', 'openai', false, 0, 3, NULL);
  IF v_status <> 'no_account' THEN RAISE EXCEPTION 'a missing account created a session: %', v_status; END IF;

  -- D6-01: the audit row must be this user's own server-written interview_probe row. Another user's row,
  -- another purpose or a client-written row is refused before anything is written or erased.
  v_status := public.record_interview_probe_verdict(v_one, pg_temp.aid('f1'), v_s1, 'school', 'ko',
    2, 3, 32, 'fact', 'drill', 'pass', 'fact', 'credited', true, 'r0', 'openai', false, 0, 3, NULL);
  IF v_status <> 'audit_mismatch' THEN RAISE EXCEPTION 'D6-01: another user''s audit row was accepted: %', v_status; END IF;
  v_status := public.record_interview_probe_verdict(v_one, pg_temp.aid('c8'), v_s1, 'school', 'ko',
    2, 3, 32, 'fact', 'drill', 'pass', 'fact', 'credited', true, 'r0', 'openai', false, 0, 3, NULL);
  IF v_status <> 'audit_mismatch' THEN RAISE EXCEPTION 'D6-01: an audit row of another purpose was accepted: %', v_status; END IF;
  v_status := public.record_interview_probe_verdict(v_one, pg_temp.aid('cd'), v_s1, 'school', 'ko',
    2, 3, 32, 'fact', 'drill', 'pass', 'fact', 'credited', true, 'r0', 'openai', false, 0, 3, NULL);
  IF v_status <> 'audit_mismatch' THEN RAISE EXCEPTION 'D6-01: a client-written audit row was accepted: %', v_status; END IF;
  IF EXISTS (SELECT 1 FROM public.interview_probe_verdicts WHERE session_id = v_s1 AND turn_no = 32)
     OR EXISTS (SELECT 1 FROM public.interview_session_audit_ids
                 WHERE audit_id IN (pg_temp.aid('f1'), pg_temp.aid('c8'), pg_temp.aid('cd')))
     OR pg_temp.hashes_erased(ARRAY['f1']) OR pg_temp.hashes_erased(ARRAY['c8']) THEN
    RAISE EXCEPTION 'D6-01: a refused audit row was written or erased';
  END IF;
  -- erase_audit_hashes only touches the named user's rows, whatever ids it is handed.
  IF public.erase_audit_hashes(v_one, ARRAY[pg_temp.aid('f1'), pg_temp.aid('f2')], 'interview_probe') <> 0
     OR pg_temp.hashes_erased(ARRAY['f1']) THEN
    RAISE EXCEPTION 'D6-01: erase_audit_hashes erased another user''s hashes';
  END IF;

  -- D6-59: credited with no model layer is refused by the writer, and by the table if anything gets past it.
  BEGIN
    PERFORM public.record_interview_probe_verdict(v_one, pg_temp.aid('d2'), v_s1, 'school', 'ko',
      2, 3, 32, 'fact', 'drill', 'pass', NULL, 'credited', true, 'r0', 'openai', false, 0, 3, NULL);
    RAISE EXCEPTION 'D6-59: a credited verdict with no model layer was recorded';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    INSERT INTO public.interview_probe_verdicts (session_id, audit_id, scene_seq, turn_seq, turn_no, asked_layer,
      probe_kind, local_gate, model_layer, verdict, final_credit, source, vendor)
    VALUES (v_s1, gen_random_uuid(), 2, 3, 33, 'fact', 'drill', 'pass', NULL, 'credited', true, 'proxy', 'openai');
    RAISE EXCEPTION 'D6-59: the table stored a credited verdict with no model layer';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
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
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
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

  -- D6-56: after the close, a failover retry of the credited turn 2 (a new audit id, same verdict) only counts
  -- the call. The verdict and its time stay as the screen saw them at the end, so the commit below still
  -- credits fact (asserted as answers = 6).
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  v_status := public.record_interview_probe_verdict(v_one, pg_temp.aid('d3'), v_s1, 'school', 'ko',
    1, 1, 2, 'fact', 'seed', 'pass', 'fact', 'credited', true, 'r0', 'claude', false, 0, 3,
    encode(sha256(convert_to(v_s1::text || ':2:' || v_texts[2], 'UTF8')), 'hex'));
  IF v_status <> 'session_closed'
     OR (SELECT audit_id FROM public.interview_probe_verdicts WHERE session_id = v_s1 AND turn_no = 2)
        IS DISTINCT FROM pg_temp.aid('b1')
     OR COALESCE((SELECT created_at > (SELECT ended_at FROM public.interview_sessions WHERE id = v_s1)
           FROM public.interview_probe_verdicts WHERE session_id = v_s1 AND turn_no = 2), true)
     OR NOT EXISTS (SELECT 1 FROM public.interview_session_audit_ids WHERE audit_id = pg_temp.aid('d3')) THEN
    RAISE EXCEPTION 'D6-56: a retry after the close rewrote the verdict the screen ended with: %', v_status;
  END IF;
  PERFORM set_config('request.jwt.claim.role', '', true);
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated","sub":"25000000-0000-4000-8000-000000000001"}', true);

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
  v_status := public.record_interview_probe_verdict(v_one, pg_temp.aid('d4'), v_s1, 'school', 'ko',
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
  -- D6-54: a refused call (turn 2 again, but under another scene) writes no verdict row.
  v_status := public.record_interview_probe_verdict(v_one, pg_temp.aid('d6'), v_s2, 'work', 'ko',
    2, 1, 2, 'fact', 'seed', 'pass', 'fact', 'credited', true, 'r0', 'openai', false, 0, 3, NULL);
  IF v_status <> 'scene_regressed' THEN RAISE EXCEPTION 'D6-54 setup: expected scene_regressed, got %', v_status; END IF;
  v_week :=date_trunc('week', (SELECT started_at FROM public.interview_sessions WHERE id = v_s2) AT TIME ZONE 'Asia/Seoul')::date;

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
  IF NOT pg_temp.hashes_erased(ARRAY['d6']) THEN
    RAISE EXCEPTION 'D6-54: discard left the hash of a call the session refused';
  END IF;

  -- D6-55: a judged call that arrives after the discard does not bring the session back, and its hash goes
  -- at once. A late close does not either.
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  v_status := public.record_interview_probe_verdict(v_one, pg_temp.aid('d7'), v_s2, 'work', 'ko',
    1, 3, 6, 'meaning', 'drill', 'pass', 'meaning', 'credited', true, 'r0', 'openai', false, 0, 3, NULL);
  IF v_status <> 'session_closed'
     OR EXISTS (SELECT 1 FROM public.interview_sessions WHERE id = v_s2)
     OR NOT pg_temp.hashes_erased(ARRAY['d7']) THEN
    RAISE EXCEPTION 'D6-55: a late call after the discard recreated the session or kept its hash: %', v_status;
  END IF;
  PERFORM set_config('request.jwt.claim.role', '', true);
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated","sub":"25000000-0000-4000-8000-000000000001"}', true);
  v_status := public.close_interview_session(v_s2, 'work', 'ko', 'left', 0, 0);
  IF v_status <> 'not_found' OR EXISTS (SELECT 1 FROM public.interview_sessions WHERE id = v_s2) THEN
    RAISE EXCEPTION 'D6-55: a late close recreated a discarded session: %', v_status;
  END IF;
  IF (SELECT sessions FROM public.interview_unsaved_rollup
       WHERE week_kst = v_week AND period = 'work' AND outcome = 'discarded') IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'D6-55: the discarded session was counted twice';
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

-- 3b. D6-58: the hourly cap counts sessions made, so close-then-discard does not wind it back.
DO $session_cap$
DECLARE
  v_status text;
  v_id uuid;
  v_i integer;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated","sub":"25000000-0000-4000-8000-000000000002"}', true);
  FOR v_i IN 1 .. 30 LOOP
    v_id := gen_random_uuid();
    v_status := public.close_interview_session(v_id, 'now', 'ko', 'left', 0, 0);
    IF v_status <> 'closed' THEN RAISE EXCEPTION 'D6-58 setup: close % returned %', v_i, v_status; END IF;
    v_status := public.discard_interview_session(v_id);
    IF v_status <> 'discarded' THEN RAISE EXCEPTION 'D6-58 setup: discard % returned %', v_i, v_status; END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM public.interview_sessions WHERE owner_id = '25000000-0000-4000-8000-000000000002') THEN
    RAISE EXCEPTION 'D6-58 setup: discarded sessions are still there';
  END IF;
  v_id := gen_random_uuid();
  v_status := public.close_interview_session(v_id, 'now', 'ko', 'left', 0, 0);
  IF v_status <> 'rate_limited' OR EXISTS (SELECT 1 FROM public.interview_sessions WHERE id = v_id) THEN
    RAISE EXCEPTION 'D6-58: thirty close-then-discard rounds did not reach the hourly cap: %', v_status;
  END IF;
  -- The counter holds numbers per ten-minute slot, nothing else; the sweep drops slots older than two hours.
  UPDATE public.interview_session_starts SET bucket_start = bucket_start - INTERVAL '3 hours'
   WHERE owner_id = '25000000-0000-4000-8000-000000000002';
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM public.sweep_interview_sessions();
  IF EXISTS (SELECT 1 FROM public.interview_session_starts WHERE owner_id = '25000000-0000-4000-8000-000000000002') THEN
    RAISE EXCEPTION 'D6-58: the sweep kept a session-start slot past two hours';
  END IF;
  PERFORM set_config('request.jwt.claim.role', '', true);
END
$session_cap$;

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
  v_p5 uuid; v_sha5 text;
  v_ref text;
BEGIN
  v_sent := jsonb_build_array(
    jsonb_build_object('ref', v_t2, 'len', 4, 'sha256', encode(sha256(convert_to(left('창가 자리였어요', 4), 'UTF8')), 'hex')),
    jsonb_build_object('ref', v_t4, 'len', 2, 'sha256', repeat('0', 64)),
    jsonb_build_object('ref', 'record:25000000-0000-4000-8000-0000000000e1#t1', 'len', 2,
                       'sha256', encode(sha256(convert_to(left('그때 교실은 어땠나요?', 2), 'UTF8')), 'hex')),
    jsonb_build_object('ref', 'record:25000000-0000-4000-8000-0000000000ee#t2', 'len', 2, 'sha256', repeat('0', 64)));

  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  BEGIN
    PERFORM public.record_period_card_proposal(v_one, pg_temp.aid('90'), 'openai', 'school', 'card-key-00000001',
      '그때의 나는 창가에서 설렜다', NULL, v_sent, ARRAY['record:25000000-0000-4000-8000-0000000000e1'], 2);
    RAISE EXCEPTION 'an authenticated caller recorded a proposal';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  -- A record-level citation expands to the turns that passed: only #t2 (wrong hash, question turn, foreign record drop out).
  v_result := public.record_period_card_proposal(v_one, pg_temp.aid('90'), 'openai', 'school', 'card-key-00000001',
    '그때의 나는 창가에서 설렜다', '창가 자리를 말했다', v_sent, ARRAY['record:25000000-0000-4000-8000-0000000000e1'], 2);
  IF v_result ->> 'status' <> 'recorded' THEN RAISE EXCEPTION 'proposal not recorded: %', v_result; END IF;
  v_p1 := (v_result ->> 'proposal_id')::uuid; v_sha1 := v_result ->> 'content_sha';
  IF (SELECT evidence_sent FROM public.period_card_proposals WHERE id = v_p1) <> ARRAY[v_t2]
     OR (SELECT evidence_cited FROM public.period_card_proposals WHERE id = v_p1) <> ARRAY[v_t2] THEN
    RAISE EXCEPTION 'evidence was not cited AND sent';
  END IF;
  v_result := public.record_period_card_proposal(v_one, pg_temp.aid('90'), 'openai', 'school', 'card-key-00000001',
    '다른 문장', NULL, v_sent, ARRAY[v_t2], 2);
  IF v_result ->> 'status' <> 'duplicate' OR (v_result ->> 'proposal_id')::uuid <> v_p1 THEN
    RAISE EXCEPTION 'a repeated request key made a second row: %', v_result;
  END IF;
  v_result := public.record_period_card_proposal(v_one, pg_temp.aid('91'), 'openai', 'school', 'card-key-00000002',
    '인용 밖', NULL, v_sent, ARRAY['record:25000000-0000-4000-8000-0000000000ee#t2'], 2);
  IF v_result ->> 'status' <> 'rejected' OR v_result ->> 'reason' <> 'no_cited_evidence' THEN
    RAISE EXCEPTION 'a proposal citing only unsent evidence was recorded: %', v_result;
  END IF;
  v_result := public.record_period_card_proposal(v_one, pg_temp.aid('92'), 'openai', 'now', 'card-key-00000003',
    '다른 시기', NULL, v_sent, ARRAY[v_t2], 2);
  IF v_result ->> 'status' <> 'rejected' OR v_result ->> 'reason' <> 'no_sent_evidence' THEN
    RAISE EXCEPTION 'evidence from another period was accepted: %', v_result;
  END IF;
  -- D6-01: the proposal's audit row is required and must be this user's own self_model_propose row.
  BEGIN
    PERFORM public.record_period_card_proposal(v_one, NULL, 'openai', 'school', 'card-key-0000000a',
      '감사 없음', NULL, v_sent, ARRAY[v_t2], 2);
    RAISE EXCEPTION 'D6-01: a proposal without an audit row was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  FOREACH v_ref IN ARRAY ARRAY['f1', 'b1', 'cc'] LOOP
    v_result := public.record_period_card_proposal(v_one, pg_temp.aid(v_ref), 'openai', 'school',
      'card-key-0000000b-' || v_ref, '남의 감사 행', NULL, v_sent, ARRAY[v_t2], 2);
    IF v_result ->> 'status' <> 'rejected' OR v_result ->> 'reason' <> 'audit_mismatch' THEN
      RAISE EXCEPTION 'D6-01: a proposal bound to audit row % was accepted: %', v_ref, v_result;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM public.period_card_proposals
              WHERE request_key = 'card-key-0000000a' OR request_key LIKE 'card-key-0000000b-%') THEN
    RAISE EXCEPTION 'D6-01: a refused proposal left a row';
  END IF;
  BEGIN
    INSERT INTO public.period_card_proposals (user_id, star_id, request_key, audit_id, vendor, proposal_text,
      evidence_sent, evidence_cited, content_sha, level_before)
    VALUES (v_one, 'school', 'card-key-direct-0', pg_temp.aid('90'), 'openai', 'x', ARRAY[v_t2], ARRAY[v_t4], repeat('a', 64), 2);
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
  v_result := public.record_period_card_proposal(v_one, pg_temp.aid('93'), 'claude', 'school', 'card-key-00000004',
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
  v_result := public.record_period_card_proposal(v_one, pg_temp.aid('94'), 'claude', 'school', 'card-key-00000005',
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
  v_result := public.record_period_card_proposal(v_one, pg_temp.aid('95'), 'openai', 'school', 'card-key-00000006',
    '그때의 나는 혼자였다', NULL, v_sent, ARRAY[v_t2], 5);
  v_p4 := (v_result ->> 'proposal_id')::uuid; v_sha4 := v_result ->> 'content_sha';
  PERFORM set_config('request.jwt.claim.role', '', true);
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated","sub":"25000000-0000-4000-8000-000000000001"}', true);
  v_result := public.decide_period_card(v_p4, v_sha4, 'missed', '혼자는 아니었어요', false);
  IF v_result ->> 'status' <> 'missed'
     OR (SELECT miss_text FROM public.period_card_proposals WHERE id = v_p4) <> '혼자는 아니었어요' THEN
    RAISE EXCEPTION 'missed was not stored on the same row: %', v_result;
  END IF;

  -- D6-07: a ratified card cannot be deleted directly by the owner (its chain and L5 row would break);
  -- a decided non-ratified row still can (content erasure reaches it as client_erasable).
  SET LOCAL ROLE authenticated;
  BEGIN
    DELETE FROM public.period_card_proposals WHERE id = v_p3;
    RAISE EXCEPTION 'D6-07: the owner deleted a ratified card directly';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  -- D6-53: a third ratified card makes the chain p2 -> p3 -> p5. Deleting the middle card relinks p2 to p5
  -- instead of letting ON DELETE SET NULL make p2 current next to p5, and takes p3's own L5 row with it.
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  v_result := public.record_period_card_proposal(v_one, pg_temp.aid('96'), 'openai', 'school', 'card-key-00000007',
    '그때의 나는 운동장을 좋아했다', NULL, v_sent, ARRAY[v_t2], 5);
  v_p5 := (v_result ->> 'proposal_id')::uuid; v_sha5 := v_result ->> 'content_sha';
  PERFORM set_config('request.jwt.claim.role', '', true);
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated","sub":"25000000-0000-4000-8000-000000000001"}', true);
  PERFORM public.decide_period_card(v_p5, v_sha5, 'ratified');
  IF (SELECT superseded_by FROM public.period_card_proposals WHERE id = v_p3) IS DISTINCT FROM v_p5
     OR (SELECT count(*) FROM public.star_tier_history
          WHERE user_id = v_one AND star_id = 'seven:school' AND evidence_origin = 'ratify') <> 3 THEN
    RAISE EXCEPTION 'D6-53 setup: the chain p2 -> p3 -> p5 with three L5 rows was not built';
  END IF;
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated","sub":"25000000-0000-4000-8000-000000000002"}', true);
  v_result := public.delete_period_card(v_p3);
  IF v_result ->> 'status' <> 'not_found' OR NOT EXISTS (SELECT 1 FROM public.period_card_proposals WHERE id = v_p3) THEN
    RAISE EXCEPTION 'another user deleted the card: %', v_result;
  END IF;
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated","sub":"25000000-0000-4000-8000-000000000001"}', true);
  v_result := public.delete_period_card(v_p3);
  IF v_result ->> 'status' <> 'deleted' OR (v_result ->> 'was_current')::boolean
     OR EXISTS (SELECT 1 FROM public.period_card_proposals WHERE id = v_p3)
     OR (SELECT superseded_by FROM public.period_card_proposals WHERE id = v_p2) IS DISTINCT FROM v_p5
     OR (SELECT count(*) FROM public.period_card_proposals
          WHERE user_id = v_one AND star_id = 'school' AND status = 'ratified' AND superseded_by IS NULL) <> 1
     OR (SELECT count(*) FROM public.star_tier_history
          WHERE user_id = v_one AND star_id = 'seven:school' AND evidence_origin = 'ratify') <> 2 THEN
    RAISE EXCEPTION 'D6-53: deleting the middle card broke the chain or kept its L5 row: %', v_result;
  END IF;
  -- Deleting the current card brings the previous ratified card back as current (its own L5 row stays).
  v_result := public.delete_period_card(v_p5);
  IF v_result ->> 'status' <> 'deleted' OR NOT (v_result ->> 'was_current')::boolean
     OR (SELECT superseded_by FROM public.period_card_proposals WHERE id = v_p2) IS NOT NULL
     OR (SELECT count(*) FROM public.star_tier_history
          WHERE user_id = v_one AND star_id = 'seven:school' AND evidence_origin = 'ratify') <> 1 THEN
    RAISE EXCEPTION 'D6-07: deleting the current card did not restore the previous one: %', v_result;
  END IF;
  -- A decided, non-ratified row has no chain or L5 row: the owner may delete it directly.
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  v_result := public.record_period_card_proposal(v_one, pg_temp.aid('96'), 'openai', 'school', 'card-key-00000008',
    '그때의 나는 지울 제안이다', NULL, v_sent, ARRAY[v_t2], 5);
  v_p5 := (v_result ->> 'proposal_id')::uuid; v_sha5 := v_result ->> 'content_sha';
  PERFORM set_config('request.jwt.claim.role', '', true);
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated","sub":"25000000-0000-4000-8000-000000000001"}', true);
  PERFORM public.decide_period_card(v_p5, v_sha5, 'declined');
  SET LOCAL ROLE authenticated;
  DELETE FROM public.period_card_proposals WHERE id = v_p5;
  RESET ROLE;
  IF EXISTS (SELECT 1 FROM public.period_card_proposals WHERE id = v_p5) THEN
    RAISE EXCEPTION 'D6-07: the owner could not delete a declined card';
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
  -- D6-05: the row carries the audit row's user; an audit row whose user is gone writes nothing.
  IF (SELECT user_id FROM public.ai_audit_context_blocks WHERE audit_id = v_audit)
       IS DISTINCT FROM '25000000-0000-4000-8000-000000000001'::uuid
     OR public.record_context_blocks(pg_temp.aid('c9'), 'secondb_chat', 'r1', ARRAY['record:abc'], NULL) <> 'no_account'
     OR EXISTS (SELECT 1 FROM public.ai_audit_context_blocks WHERE audit_id = pg_temp.aid('c9')) THEN
    RAISE EXCEPTION 'D6-05: a context row is not bound to a live user';
  END IF;
  -- Two more rows for section 6 (a deleted record's id) and section 9 (account deletion).
  IF public.record_context_blocks(pg_temp.aid('ce'), 'secondb_chat', 'r1',
       ARRAY['record:25000000-0000-4000-8000-0000000000e1#t2', 'wiki:page-2'], NULL) <> 'recorded'
     OR public.record_context_blocks(pg_temp.aid('cf'), 'secondb_chat', 'r1', ARRAY['wiki:keep'], NULL) <> 'recorded' THEN
    RAISE EXCEPTION 'D6-05 setup: context rows were not recorded';
  END IF;
  PERFORM set_config('request.jwt.claim.role', '', true);
END
$blocks$;

-- 5b. D6-04: the three service writers take the 0192 shared lock and stop at the deletion tombstone.
-- D6-51: deleting an interview record takes the same 'period_card:' lock as ratify. User three has
-- touched nothing in this transaction, so each lock is observed fresh (and dropped with its subtransaction).
DO $fence$
DECLARE
  v_three constant uuid := '25000000-0000-4000-8000-000000000003';
  v_fence bigint := pg_catalog.hashtextextended('25000000-0000-4000-8000-000000000003', 260913);
  v_card_lock bigint := pg_catalog.hashtext('period_card:25000000-0000-4000-8000-000000000003');
  v_rec constant uuid := '25000000-0000-4000-8000-0000000000e9';
  v_writer text;
  v_held boolean;
  v_result text;
BEGIN
  INSERT INTO public.records (id, user_id, kind, body, audit_period, system_tags, client_request_id)
  VALUES (v_rec, v_three, 'audit_response', E'질문: q\n\n답변: a', 'now', ARRAY['interview'],
          'interview:25000000-0000-4000-8000-0000000000a9');
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  FOREACH v_writer IN ARRAY ARRAY['verdict', 'proposal', 'blocks'] LOOP
    IF pg_temp.holds_advisory(v_fence, 'ShareLock') THEN
      RAISE EXCEPTION 'D6-04 setup: the fence lock is already held before %', v_writer;
    END IF;
    BEGIN
      CASE v_writer
        WHEN 'verdict' THEN
          PERFORM public.record_interview_probe_verdict(v_three, pg_temp.aid('cb'), gen_random_uuid(), 'now', 'ko',
            1, 1, 2, 'fact', 'seed', 'pass', 'fact', 'credited', true, 'r0', 'openai', false, 0, 3, NULL);
        WHEN 'proposal' THEN
          PERFORM public.record_period_card_proposal(v_three, pg_temp.aid('cc'), 'openai', 'now', 'card-key-three-01',
            '셋', NULL, '[{"ref":"record:25000000-0000-4000-8000-0000000000e9#t2","len":1,"sha256":"00"}]'::jsonb,
            ARRAY['record:25000000-0000-4000-8000-0000000000e9#t2'], 2);
        ELSE
          PERFORM public.record_context_blocks(pg_temp.aid('ca'), 'secondb_chat', 'r1', ARRAY['wiki:x'], NULL);
      END CASE;
      v_held := pg_temp.holds_advisory(v_fence, 'ShareLock');
      RAISE EXCEPTION 'fence-probe';
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM <> 'fence-probe' THEN RAISE; END IF;
    END;
    IF NOT v_held THEN
      RAISE EXCEPTION 'D6-04: % did not take the 0192 shared lock', v_writer;
    END IF;
  END LOOP;
  PERFORM set_config('request.jwt.claim.role', '', true);

  BEGIN
    DELETE FROM public.records WHERE id = v_rec;
    v_held := pg_temp.holds_advisory(v_card_lock, 'ExclusiveLock');
    RAISE EXCEPTION 'card-lock-probe';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'card-lock-probe' THEN RAISE; END IF;
  END;
  IF NOT v_held THEN
    RAISE EXCEPTION 'D6-51: deleting an interview record did not take the period_card lock';
  END IF;

  -- With the tombstone in place, all three refuse and write nothing.
  INSERT INTO public.account_deletion_tombstones (user_id, session_id) VALUES (v_three, gen_random_uuid());
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  v_result := public.record_interview_probe_verdict(v_three, pg_temp.aid('cb'), '25000000-0000-4000-8000-0000000000a9',
    'now', 'ko', 1, 1, 2, 'fact', 'seed', 'pass', 'fact', 'credited', true, 'r0', 'openai', false, 0, 3, NULL);
  IF v_result <> 'no_account' THEN RAISE EXCEPTION 'D6-04: the verdict writer ignored the tombstone: %', v_result; END IF;
  v_result := public.record_period_card_proposal(v_three, pg_temp.aid('cc'), 'openai', 'now', 'card-key-three-02',
    '셋', NULL, '[{"ref":"record:25000000-0000-4000-8000-0000000000e9#t2","len":1,"sha256":"00"}]'::jsonb,
    ARRAY['record:25000000-0000-4000-8000-0000000000e9#t2'], 2) ->> 'reason';
  IF v_result <> 'no_account' THEN RAISE EXCEPTION 'D6-04: the proposal writer ignored the tombstone: %', v_result; END IF;
  v_result := public.record_context_blocks(pg_temp.aid('ca'), 'secondb_chat', 'r1', ARRAY['wiki:x'], NULL);
  IF v_result <> 'no_account' THEN RAISE EXCEPTION 'D6-04: the context writer ignored the tombstone: %', v_result; END IF;
  IF EXISTS (SELECT 1 FROM public.interview_sessions WHERE owner_id = v_three)
     OR EXISTS (SELECT 1 FROM public.period_card_proposals WHERE user_id = v_three)
     OR EXISTS (SELECT 1 FROM public.ai_audit_context_blocks WHERE user_id = v_three) THEN
    RAISE EXCEPTION 'D6-04: a writer wrote for an account being deleted';
  END IF;
  PERFORM set_config('request.jwt.claim.role', '', true);
END
$fence$;

-- A four-turn conversation (fact question, answer, feeling question, answer) for 5c and 5d.
CREATE FUNCTION pg_temp.four_turns(p_a1 text, p_a2 text) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_array(
    jsonb_build_object('n', 1, 'role', 'interviewer', 'scene', 1, 'layer', 'fact', 'ask_kind', 'seed',
                       'origin', 'fixed', 'text', '그때 어디였나요?'),
    jsonb_build_object('n', 2, 'role', 'user', 'scene', 1, 'layer', 'fact', 'origin', 'user',
                       'text', p_a1, 'opener_unedited', false, 'state', 'judged'),
    jsonb_build_object('n', 3, 'role', 'interviewer', 'scene', 1, 'layer', 'feeling', 'ask_kind', 'drill',
                       'origin', 'model', 'text', '그때 기분은요?'),
    jsonb_build_object('n', 4, 'role', 'user', 'scene', 1, 'layer', 'feeling', 'origin', 'user',
                       'text', p_a2, 'opener_unedited', false, 'state', 'judged'))
$$;

-- 5c. D6-03 (minimal): the screen cannot lower the hold. A session whose call the proxy logged as red is held
-- even when the screen sends false, and the hold reaches every turn and the inference view.
DO $hold$
DECLARE
  v_one constant uuid := '25000000-0000-4000-8000-000000000001';
  v_s6 constant uuid := '25000000-0000-4000-8000-0000000000a6';
  v_s7 constant uuid := '25000000-0000-4000-8000-0000000000a7';
  v_r6 constant uuid := '25000000-0000-4000-8000-0000000000e6';
  v_r7 constant uuid := '25000000-0000-4000-8000-0000000000e7';
  v_turns jsonb := pg_temp.four_turns('강가에 살았어요', '무서웠어요');
  v_result jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM public.record_interview_probe_verdict(v_one, pg_temp.aid('df'), v_s6, 'twenties', 'ko',
    1, 1, 2, 'fact', 'seed', 'pass', 'fact', 'credited', true, 'r0', 'openai', false, 0, 3,
    encode(sha256(convert_to(v_s6::text || ':2:강가에 살았어요', 'UTF8')), 'hex'));
  PERFORM public.record_interview_probe_verdict(v_one, pg_temp.aid('d8'), v_s7, 'later', 'ko',
    1, 1, 2, 'fact', 'seed', 'pass', 'fact', 'credited', true, 'r0', 'openai', false, 0, 3,
    encode(sha256(convert_to(v_s7::text || ':2:강가에 살았어요', 'UTF8')), 'hex'));
  PERFORM set_config('request.jwt.claim.role', '', true);
  INSERT INTO public.records (id, user_id, kind, body, audit_period, system_tags, client_request_id) VALUES
    (v_r6, v_one, 'audit_response', public.interview_transcript_body('ko', v_turns), 'twenties',
     ARRAY['interview'], 'interview:' || v_s6::text),
    (v_r7, v_one, 'audit_response', public.interview_transcript_body('ko', v_turns), 'later',
     ARRAY['interview'], 'interview:' || v_s7::text);
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated","sub":"25000000-0000-4000-8000-000000000001"}', true);

  v_result := public.commit_interview_session(v_s6, v_r6, v_turns, false);
  IF v_result ->> 'status' <> 'committed' OR NOT (v_result ->> 'ai_hold')::boolean
     OR (v_result ->> 'cells_added')::integer <> 0
     OR NOT (SELECT ai_hold FROM public.interview_transcripts WHERE session_id = v_s6)
     OR EXISTS (SELECT 1 FROM public.interview_transcript_turns AS tt
                  JOIN public.interview_transcripts AS t ON t.id = tt.transcript_id
                 WHERE t.session_id = v_s6 AND NOT tt.ai_hold)
     OR EXISTS (SELECT 1 FROM public.interview_coverage WHERE user_id = v_one AND period = 'twenties')
     OR EXISTS (SELECT 1 FROM public.record_layer_inferences WHERE record_id = v_r6) THEN
    RAISE EXCEPTION 'D6-03: a red-logged session was not held: %', v_result;
  END IF;
  v_result := public.commit_interview_session(v_s7, v_r7, v_turns, true);
  IF v_result ->> 'status' <> 'committed' OR NOT (v_result ->> 'ai_hold')::boolean
     OR EXISTS (SELECT 1 FROM public.interview_transcript_turns AS tt
                  JOIN public.interview_transcripts AS t ON t.id = tt.transcript_id
                 WHERE t.session_id = v_s7 AND NOT tt.ai_hold) THEN
    RAISE EXCEPTION 'D6-03: the transcript hold did not reach its turns: %', v_result;
  END IF;
  PERFORM set_config('request.jwt.claims', '', true);
END
$hold$;

-- 5d. D6-02 / D6-52: delete in the registry's content order - turns (28), transcript head (29), record (30).
-- The verdict hashes go with the turns; the hash of the call the session refused goes with the record.
-- D6-53: the record is cited only by the middle card of p2 -> Y -> Z, and deleting it relinks p2 to Z.
DO $erase_order$
DECLARE
  v_one constant uuid := '25000000-0000-4000-8000-000000000001';
  v_s5 constant uuid := '25000000-0000-4000-8000-0000000000a5';
  v_r5 constant uuid := '25000000-0000-4000-8000-0000000000e3';
  v_r1_t2 text := 'record:25000000-0000-4000-8000-0000000000e1#t2';
  v_r5_t2 text := 'record:25000000-0000-4000-8000-0000000000e3#t2';
  v_turns jsonb := pg_temp.four_turns('운동장이 넓었어요', '신났어요');
  v_status text;
  v_result jsonb;
  v_p2 uuid;
  v_y uuid; v_y_sha text;
  v_z uuid; v_z_sha text;
BEGIN
  SELECT id INTO v_p2 FROM public.period_card_proposals
   WHERE user_id = v_one AND star_id = 'school' AND status = 'ratified' AND superseded_by IS NULL;
  IF v_p2 IS NULL THEN RAISE EXCEPTION 'D6-53 setup: no current school card after section 4'; END IF;

  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM public.record_interview_probe_verdict(v_one, pg_temp.aid('da'), v_s5, 'school', 'ko',
    1, 1, 2, 'fact', 'seed', 'pass', 'meaning', 'other_layer', false, 'r0', 'openai', false, 0, 3,
    encode(sha256(convert_to(v_s5::text || ':2:운동장이 넓었어요', 'UTF8')), 'hex'));
  PERFORM public.record_interview_probe_verdict(v_one, pg_temp.aid('db'), v_s5, 'school', 'ko',
    1, 2, 4, 'feeling', 'drill', 'pass', NULL, 'none', false, 'r0', 'openai', false, 0, 3,
    encode(sha256(convert_to(v_s5::text || ':4:신났어요', 'UTF8')), 'hex'));
  v_status := public.record_interview_probe_verdict(v_one, pg_temp.aid('dc'), v_s5, 'school', 'ko',
    2, 1, 2, 'fact', 'seed', 'pass', 'fact', 'credited', true, 'r0', 'openai', false, 0, 3, NULL);
  IF v_status <> 'scene_regressed' THEN RAISE EXCEPTION 'D6-02 setup: expected scene_regressed, got %', v_status; END IF;
  PERFORM set_config('request.jwt.claim.role', '', true);
  INSERT INTO public.records (id, user_id, kind, body, audit_period, system_tags, client_request_id)
  VALUES (v_r5, v_one, 'audit_response', public.interview_transcript_body('ko', v_turns), 'school',
          ARRAY['interview'], 'interview:' || v_s5::text);
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated","sub":"25000000-0000-4000-8000-000000000001"}', true);
  v_result := public.commit_interview_session(v_s5, v_r5, v_turns);
  IF v_result ->> 'status' <> 'committed' OR (v_result ->> 'cells_added')::integer <> 0 THEN
    RAISE EXCEPTION 'D6-02 setup: commit failed: %', v_result;
  END IF;

  -- Y cites only the new record, Z only the old one: p2 -> Y -> Z.
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  v_result := public.record_period_card_proposal(v_one, pg_temp.aid('97'), 'openai', 'school', 'card-key-0000000y',
    '그때의 나는 운동장에서 신났다', NULL,
    jsonb_build_array(jsonb_build_object('ref', v_r5_t2, 'len', 3,
      'sha256', encode(sha256(convert_to(left('운동장이 넓었어요', 3), 'UTF8')), 'hex'))),
    ARRAY[v_r5_t2], 5);
  v_y := (v_result ->> 'proposal_id')::uuid; v_y_sha := v_result ->> 'content_sha';
  PERFORM set_config('request.jwt.claim.role', '', true);
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated","sub":"25000000-0000-4000-8000-000000000001"}', true);
  PERFORM public.decide_period_card(v_y, v_y_sha, 'ratified');
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  v_result := public.record_period_card_proposal(v_one, pg_temp.aid('95'), 'openai', 'school', 'card-key-0000000z',
    '그때의 나는 창가를 다시 찾았다', NULL,
    jsonb_build_array(jsonb_build_object('ref', v_r1_t2, 'len', 4,
      'sha256', encode(sha256(convert_to(left('창가 자리였어요', 4), 'UTF8')), 'hex'))),
    ARRAY[v_r1_t2], 5);
  v_z := (v_result ->> 'proposal_id')::uuid; v_z_sha := v_result ->> 'content_sha';
  PERFORM set_config('request.jwt.claim.role', '', true);
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated","sub":"25000000-0000-4000-8000-000000000001"}', true);
  PERFORM public.decide_period_card(v_z, v_z_sha, 'ratified');
  IF (SELECT superseded_by FROM public.period_card_proposals WHERE id = v_p2) IS DISTINCT FROM v_y
     OR (SELECT superseded_by FROM public.period_card_proposals WHERE id = v_y) IS DISTINCT FROM v_z THEN
    RAISE EXCEPTION 'D6-53 setup: the chain p2 -> Y -> Z was not built';
  END IF;

  -- The owner deletes the turns, then the head, then the record, as content erasure orders them.
  SET LOCAL ROLE authenticated;
  DELETE FROM public.interview_transcript_turns
   WHERE transcript_id = (SELECT id FROM public.interview_transcripts WHERE session_id = v_s5);
  RESET ROLE;
  IF NOT pg_temp.hashes_erased(ARRAY['da', 'db']) OR pg_temp.hashes_erased(ARRAY['dc']) THEN
    RAISE EXCEPTION 'D6-02: deleting the turns did not erase exactly their verdict hashes';
  END IF;
  SET LOCAL ROLE authenticated;
  DELETE FROM public.interview_transcripts WHERE session_id = v_s5;
  RESET ROLE;
  -- (records' client grants are not part of this scratch schema; the trigger runs the same for any role)
  DELETE FROM public.records WHERE id = v_r5;
  IF NOT pg_temp.hashes_erased(ARRAY['da', 'db', 'dc'])
     OR EXISTS (SELECT 1 FROM public.interview_sessions WHERE id = v_s5)
     OR EXISTS (SELECT 1 FROM public.interview_session_audit_ids WHERE session_id = v_s5) THEN
    RAISE EXCEPTION 'D6-02: content erasure in registry order left the session or an audit hash';
  END IF;
  IF EXISTS (SELECT 1 FROM public.period_card_proposals WHERE id = v_y)
     OR (SELECT superseded_by FROM public.period_card_proposals WHERE id = v_p2) IS DISTINCT FROM v_z
     OR (SELECT count(*) FROM public.period_card_proposals
          WHERE user_id = v_one AND star_id = 'school' AND status = 'ratified' AND superseded_by IS NULL) <> 1
     OR EXISTS (SELECT 1 FROM public.star_tier_history AS h
                 WHERE h.user_id = v_one AND h.star_id = 'seven:school' AND v_r5_t2 = ANY (h.evidence_citations))
     OR (SELECT count(*) FROM public.star_tier_history
          WHERE user_id = v_one AND star_id = 'seven:school' AND evidence_origin = 'ratify') <> 2 THEN
    RAISE EXCEPTION 'D6-53: deleting the record behind the middle card broke the chain or kept its L5';
  END IF;
  PERFORM set_config('request.jwt.claims', '', true);
END
$erase_order$;

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
  -- D6-54: the calls the saved session refused (a backwards scene, a retry after the close, a call after the
  -- commit) lived with the record and go with it.
  IF NOT pg_temp.hashes_erased(ARRAY['d0', 'd3', 'd4'])
     OR NOT EXISTS (SELECT 1 FROM public.interview_session_tombstones
                     WHERE session_id = '25000000-0000-4000-8000-0000000000a1') THEN
    RAISE EXCEPTION 'D6-54: deleting the record kept the hash of a call its session refused';
  END IF;
  -- D6-05: the context row that carried this record's id is gone; the one that did not is kept.
  IF EXISTS (SELECT 1 FROM public.ai_audit_context_blocks WHERE audit_id = pg_temp.aid('ce'))
     OR NOT EXISTS (SELECT 1 FROM public.ai_audit_context_blocks WHERE audit_id = pg_temp.aid('c8')) THEN
    RAISE EXCEPTION 'D6-05: deleting a record did not remove exactly the context rows that named it';
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
  UPDATE public.ai_audit_context_blocks SET created_at = now() - INTERVAL '91 days'
   WHERE audit_id = '25000000-0000-4000-8000-0000000000c8';
  UPDATE public.interview_session_tombstones SET created_at = now() - INTERVAL '8 days'
   WHERE session_id = '25000000-0000-4000-8000-0000000000a2';
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  v_result := public.prune_interview_ledgers();
  IF (v_result ->> 'proposals_deleted')::integer < 2 OR (v_result ->> 'blocks_deleted')::integer <> 1
     OR (v_result ->> 'tombstones_deleted')::integer <> 1
     OR EXISTS (SELECT 1 FROM public.interview_session_tombstones WHERE session_id = '25000000-0000-4000-8000-0000000000a2') THEN
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
  -- D6-05: the context rows follow the account even though the audit rows they hang off are kept.
  IF EXISTS (SELECT 1 FROM public.ai_audit_context_blocks WHERE user_id = '25000000-0000-4000-8000-000000000001')
     OR EXISTS (SELECT 1 FROM public.ai_audit_context_blocks WHERE audit_id = pg_temp.aid('cf'))
     OR NOT EXISTS (SELECT 1 FROM public.ai_audit_log WHERE id = pg_temp.aid('cf'))
     OR EXISTS (SELECT 1 FROM public.interview_session_starts WHERE owner_id = '25000000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'D6-05: account deletion left a context row or a session-start slot';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.interview_unsaved_rollup) THEN
    RAISE EXCEPTION 'the owner-less rollup did not survive account deletion';
  END IF;
END
$cascade$;

ROLLBACK;
