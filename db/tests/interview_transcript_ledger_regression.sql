\set ON_ERROR_STOP on

-- Run only on the CI scratch database after the numbered 0225 (interview transcript
-- ledger) and 0226 (its erasure-registry rows) migrations. The staged Supabase CLI
-- push already applied both; this file never replays them. Everything below runs in
-- one transaction and is rolled back. Design: docs/design/d6-verdict-ledger-261007.md
-- section 6 (T-02, T-09, T-14, T-15, T-19). RD-261007-13 moves period cards to phase two.
-- Blocks prefixed R2 cover gate round 2; other D6 labels preserve round 1's tests.
-- R2 D6-01/05/09/52/53 also run with two connections in interview_transcript_ledger_concurrency.py.
-- R2 D6-08's psql startup guard and D6-10's CI message are checked by supabase-security-drafts.test.ts.
BEGIN;
SET LOCAL app.allow_missing_pg_cron = 'on';

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
--   c8, ce, cf    secondb_chat, user one        ca  secondb_chat, user three
--   c9            secondb_chat, no user (account deleted: user_id SET NULL)
--   cd            interview_probe, user one, but client_unverified
INSERT INTO public.ai_audit_log (id, user_id, prompt_hash, output_hash, model_used, vertex_backend, safety_zone, latency_ms, purpose, event_source)
SELECT ('25000000-0000-4000-8000-0000000000' || lpad(to_hex(n), 2, '0'))::uuid,
       CASE WHEN n BETWEEN 240 AND 247 THEN '25000000-0000-4000-8000-000000000002'::uuid
            WHEN n IN (202, 203) THEN '25000000-0000-4000-8000-000000000003'::uuid
            WHEN n = 201 THEN NULL
            ELSE '25000000-0000-4000-8000-000000000001'::uuid END,
       CASE WHEN n = 205 THEN 'aa' ELSE 'p' || n END,
       CASE WHEN n = 205 THEN 'bb' ELSE 'o' || n END,
       'test-model', false, (CASE WHEN n = 223 THEN 'red' ELSE 'green' END)::public.safety_zone, 1,
       CASE WHEN n IN (200, 201, 202, 206, 207) THEN 'secondb_chat'
            ELSE 'interview_probe' END,
       CASE WHEN n = 205 THEN 'client_unverified' ELSE 'server_verified' END
  FROM (SELECT g FROM generate_series(177, 188) AS g
        UNION ALL SELECT g FROM generate_series(200, 207) AS g WHERE g <> 204
        UNION ALL SELECT g FROM generate_series(208, 223) AS g
        UNION ALL SELECT g FROM generate_series(240, 247) AS g) AS t(n);

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
  FOREACH v_table IN ARRAY ARRAY['interview_probe_verdicts', 'interview_unsaved_rollup', 'interview_scene_metrics', 'record_layer_inferences',
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
  FOREACH v_table IN ARRAY ARRAY['interview_transcripts', 'interview_transcript_turns', 'interview_sessions', 'ai_audit_context_blocks'] LOOP
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
     OR has_function_privilege('authenticated', 'public.record_context_blocks(uuid,text,text,text[],text[])', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.sweep_interview_sessions(integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.prune_interview_ledgers()', 'EXECUTE') THEN
    RAISE EXCEPTION 'a proxy or cron function is client-callable';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.close_interview_session(uuid,text,text,text,integer,integer)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.discard_interview_session(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.commit_interview_session(uuid,uuid,jsonb,boolean)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.export_my_interview_judgements(timestamptz)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.commit_interview_session(uuid,uuid,jsonb,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'screen functions are not authenticated-only';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.unnest(ARRAY[
         'public.fold_interview_session(uuid,text)', 'public.erase_audit_hashes(uuid,uuid[],text)',
         'public.interview_account_writable(uuid)',
         'public.interview_transcript_body(text,jsonb)', 'public.interview_verdict_erasure()',
         'public.interview_session_count_start()', 'public.interview_record_erasure()',
         'public.interview_session_erasure()', 'public.interview_account_erasure()',
         'public.ai_context_block_record_erasure()']) AS f(sig)
              CROSS JOIN pg_catalog.unnest(ARRAY['anon', 'authenticated', 'service_role']) AS r(role)
             WHERE has_function_privilege(r.role, f.sig, 'EXECUTE')) THEN
    RAISE EXCEPTION 'an internal helper is callable by a client or service role';
  END IF;
  FOREACH v_table IN ARRAY ARRAY['interview_sessions', 'interview_probe_verdicts', 'interview_transcripts',
      'interview_transcript_turns', 'interview_unsaved_rollup', 'ai_audit_context_blocks',
      'interview_session_audit_ids', 'interview_session_tombstones', 'interview_session_starts'] LOOP
    IF NOT (SELECT c.relrowsecurity AND c.relforcerowsecurity FROM pg_catalog.pg_class AS c
             WHERE c.oid = ('public.' || v_table)::regclass) THEN
      RAISE EXCEPTION '% is not under forced RLS', v_table;
    END IF;
  END LOOP;
  -- D6-05: the context-block table is owned and registered; the session-start counter too.
  IF (SELECT count(*) FROM public.erasure_registry AS r
       WHERE (r.table_name, r.owner_column, r.class, COALESCE(r.delete_order, 0)) IN (
         ('interview_sessions', 'owner_id', 'client_erasable', 31),
         ('interview_transcript_turns', 'user_id', 'client_erasable', 28),
         ('interview_transcripts', 'user_id', 'client_erasable', 29),
         ('ai_audit_context_blocks', 'user_id', 'client_erasable', 32),
         ('interview_session_starts', 'owner_id', 'retained', 0))) <> 5 THEN
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
  v_bad record;
  v_audit uuid;
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
  v_status := public.record_interview_probe_verdict(v_one, pg_temp.aid('d2'), v_s1, 'school', 'ko',
    2, 3, 32, 'fact', 'drill', 'pass', NULL, 'credited', true, 'r0', 'openai', false, 0, 3, NULL);
  IF v_status IS DISTINCT FROM 'interview_verdict_invalid'
     OR NOT pg_temp.hashes_erased(ARRAY['d2'])
     OR EXISTS (SELECT 1 FROM public.interview_probe_verdicts WHERE session_id=v_s1 AND turn_no=32) THEN
    RAISE EXCEPTION 'D6R3-52 / D6-59: invalid credited call was recorded or kept hashes: %', v_status;
  END IF;
  BEGIN
    INSERT INTO public.interview_probe_verdicts (session_id, audit_id, scene_seq, turn_seq, turn_no, asked_layer,
      probe_kind, local_gate, model_layer, verdict, final_credit, source, vendor)
    VALUES (v_s1, gen_random_uuid(), 2, 3, 33, 'fact', 'drill', 'pass', NULL, 'credited', true, 'proxy', 'openai');
    RAISE EXCEPTION 'D6-59: the table stored a credited verdict with no model layer';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  -- The rule set is locked to r0 during the baseline, and r0's final credit is credited AND pass.
  -- D6R3-52: every validation branch returns a status and clears its own verified audit.
  -- Use real audit rows so ownership validation cannot hide a missing input check.
  FOR v_bad IN SELECT * FROM (VALUES
    (v_s1, 'school', 2, 'pass', 'fact', 'r1', 'interview_rule_set_locked'),
    (v_s1, 'school', 2, 'short', 'fact', 'r0', 'interview_final_credit_mismatch'),
    (v_s1, 'school', 2, 'pass', 'feeling', 'r0', 'interview_verdict_invalid'),
    (v_s1, 'school', 0, 'pass', 'fact', 'r0', 'interview_verdict_invalid'),
    (v_s1, 'invalid', 2, 'pass', 'fact', 'r0', 'interview_verdict_invalid'),
    (NULL::uuid, 'school', 2, 'pass', 'fact', 'r0', 'interview_verdict_invalid')
  ) AS t(session_id, period, scene, gate, layer, rule_set, expected) LOOP
    v_audit := gen_random_uuid();
    INSERT INTO public.ai_audit_log(id,user_id,prompt_hash,output_hash,model_used,vertex_backend,
      safety_zone,latency_ms,purpose,event_source)
    VALUES(v_audit,v_one,'prompt','output','test-model',false,'green',1,'interview_probe','server_verified');
    v_status := public.record_interview_probe_verdict(v_one,v_audit,v_bad.session_id,v_bad.period,'ko',
      v_bad.scene,3,32,'fact','drill',v_bad.gate,v_bad.layer,'credited',true,v_bad.rule_set,'openai',false,0,3,NULL);
    IF v_status IS DISTINCT FROM v_bad.expected
       OR NOT EXISTS (SELECT 1 FROM public.ai_audit_log WHERE id=v_audit AND prompt_hash='' AND output_hash='')
       OR EXISTS (SELECT 1 FROM public.interview_probe_verdicts WHERE audit_id=v_audit)
       OR EXISTS (SELECT 1 FROM public.interview_session_audit_ids WHERE audit_id=v_audit) THEN
      RAISE EXCEPTION 'D6R3-52: invalid call retained hashes or wrote a verdict: %, %',v_bad.expected,v_status;
    END IF;
  END LOOP;

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

-- 5. Response block ids: ids only, against a real audit row (T-09 contract).
DO $blocks$
DECLARE
  v_audit constant uuid := '25000000-0000-4000-8000-0000000000c8';
  v_status text;
BEGIN
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  BEGIN
    PERFORM public.record_context_blocks(v_audit, 'secondb_chat', 'r1', ARRAY['wiki:abc'], NULL);
    RAISE EXCEPTION 'an authenticated caller recorded block ids';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  IF public.record_context_blocks(v_audit, 'secondb_chat', 'r1', ARRAY['wiki:abc', 'wiki:page-1'], ARRAY['wiki:page-1']) <> 'recorded'
     OR public.record_context_blocks(v_audit, 'secondb_chat', 'r1', ARRAY['wiki:abc'], NULL) <> 'duplicate'
     OR public.record_context_blocks(gen_random_uuid(), 'secondb_chat', 'r1', ARRAY['wiki:abc'], NULL) <> 'no_audit'
     OR public.record_context_blocks(v_audit, 'secondb_chat', 'r1', ARRAY['the user said hello'], NULL) <> 'rejected' THEN
    RAISE EXCEPTION 'record_context_blocks did not keep to ids only';
  END IF;
  IF (SELECT cited_ids FROM public.ai_audit_context_blocks WHERE audit_id = v_audit) <> ARRAY['wiki:page-1'] THEN
    RAISE EXCEPTION 'cited ids were not kept';
  END IF;
  -- D6-05: the row carries the audit row's user; an audit row whose user is gone writes nothing.
  IF (SELECT user_id FROM public.ai_audit_context_blocks WHERE audit_id = v_audit)
       IS DISTINCT FROM '25000000-0000-4000-8000-000000000001'::uuid
     OR public.record_context_blocks(pg_temp.aid('c9'), 'secondb_chat', 'r1', ARRAY['wiki:abc'], NULL) <> 'no_account'
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

-- 5b. D6-04: both service writers take the 0192 shared lock and stop at the deletion tombstone.
-- User three has
-- touched nothing in this transaction, so each lock is observed fresh (and dropped with its subtransaction).
DO $fence$
DECLARE
  v_three constant uuid := '25000000-0000-4000-8000-000000000003';
  v_fence bigint := pg_catalog.hashtextextended('25000000-0000-4000-8000-000000000003', 260913);
  v_rec constant uuid := '25000000-0000-4000-8000-0000000000e9';
  v_writer text;
  v_held boolean;
  v_result text;
BEGIN
  INSERT INTO public.records (id, user_id, kind, body, audit_period, system_tags, client_request_id)
  VALUES (v_rec, v_three, 'audit_response', E'질문: q\n\n답변: a', 'now', ARRAY['interview'],
          'interview:25000000-0000-4000-8000-0000000000a9');
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  FOREACH v_writer IN ARRAY ARRAY['verdict', 'blocks'] LOOP
    IF pg_temp.holds_advisory(v_fence, 'ShareLock') THEN
      RAISE EXCEPTION 'D6-04 setup: the fence lock is already held before %', v_writer;
    END IF;
    BEGIN
      CASE v_writer
        WHEN 'verdict' THEN
          PERFORM public.record_interview_probe_verdict(v_three, pg_temp.aid('cb'), gen_random_uuid(), 'now', 'ko',
            1, 1, 2, 'fact', 'seed', 'pass', 'fact', 'credited', true, 'r0', 'openai', false, 0, 3, NULL);
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

  -- With the tombstone in place, both refuse and write nothing.
  INSERT INTO public.account_deletion_tombstones (user_id, session_id) VALUES (v_three, gen_random_uuid());
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  v_result := public.record_interview_probe_verdict(v_three, pg_temp.aid('cb'), '25000000-0000-4000-8000-0000000000a9',
    'now', 'ko', 1, 1, 2, 'fact', 'seed', 'pass', 'fact', 'credited', true, 'r0', 'openai', false, 0, 3, NULL);
  IF v_result <> 'no_account' THEN RAISE EXCEPTION 'D6-04: the verdict writer ignored the tombstone: %', v_result; END IF;
  v_result := public.record_context_blocks(pg_temp.aid('ca'), 'secondb_chat', 'r1', ARRAY['wiki:x'], NULL);
  IF v_result <> 'no_account' THEN RAISE EXCEPTION 'D6-04: the context writer ignored the tombstone: %', v_result; END IF;
  IF EXISTS (SELECT 1 FROM public.interview_sessions WHERE owner_id = v_three)
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
DO $erase_order$
DECLARE
  v_one constant uuid := '25000000-0000-4000-8000-000000000001';
  v_s5 constant uuid := '25000000-0000-4000-8000-0000000000a5';
  v_r5 constant uuid := '25000000-0000-4000-8000-0000000000e3';
  v_turns jsonb := pg_temp.four_turns('운동장이 넓었어요', '신났어요');
  v_status text;
  v_result jsonb;
BEGIN
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
  PERFORM set_config('request.jwt.claims', '', true);
END
$erase_order$;

-- 6. Deleting the saved record folds the session, erases its audit hashes (D5).
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

-- 8. Retention: rollup at 730 days, block ids at 90, session tombstones at 7.
DO $prune$
DECLARE
  v_result jsonb;
BEGIN
  UPDATE public.ai_audit_context_blocks SET created_at = now() - INTERVAL '91 days'
   WHERE audit_id = '25000000-0000-4000-8000-0000000000c8';
  UPDATE public.interview_session_tombstones SET created_at = now() - INTERVAL '8 days'
   WHERE session_id = '25000000-0000-4000-8000-0000000000a2';
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  v_result := public.prune_interview_ledgers();
  IF (v_result ->> 'blocks_deleted')::integer <> 1
     OR (v_result ->> 'tombstones_deleted')::integer <> 1
     OR EXISTS (SELECT 1 FROM public.interview_session_tombstones WHERE session_id = '25000000-0000-4000-8000-0000000000a2') THEN
    RAISE EXCEPTION 'prune did not remove the aged rows: %', v_result;
  END IF;
  PERFORM set_config('request.jwt.claim.role', '', true);
END
$prune$;

-- Gate round 2. These helpers keep audit ownership and the fixed r0 payload explicit.
CREATE FUNCTION pg_temp.r2_audit(p_user uuid, p_purpose text DEFAULT 'interview_probe') RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE v_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.ai_audit_log(id,user_id,prompt_hash,output_hash,model_used,vertex_backend,safety_zone,
    latency_ms,purpose,event_source)
  VALUES(v_id,p_user,'prompt','output','test-model',false,'green',1,p_purpose,'server_verified');
  RETURN v_id;
END $$;
CREATE FUNCTION pg_temp.r2_probe(p_user uuid,p_audit uuid,p_session uuid,p_turn integer DEFAULT 2) RETURNS text
LANGUAGE sql AS $$
  SELECT public.record_interview_probe_verdict(p_user,p_audit,p_session,'now','ko',1,1,p_turn,
    'fact','seed','pass','fact','credited',true,'r0','openai',false,0,3,NULL)
$$;
CREATE FUNCTION pg_temp.r2_role(p_user uuid DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', COALESCE(p_user::text,''), true);
  PERFORM set_config('request.jwt.claim.role', CASE WHEN p_user IS NULL THEN 'service_role' ELSE 'authenticated' END, true);
END $$;

-- R2 D6-01/52/05: all first writers use the same session key, including discard before a row exists.
DO $r2_session_lifecycle$
DECLARE
  v_user uuid := '25000000-0000-4000-8000-000000000001';
  v_s uuid; v_r uuid; v_a uuid; v_mode integer; v_starts bigint; v_cells bigint;
  v_turns jsonb := pg_temp.four_turns('기억 하나','기억 둘');
  v_result jsonb;
BEGIN
  FOR v_mode IN 1..3 LOOP
    v_s := gen_random_uuid(); v_r := gen_random_uuid();
    IF v_mode > 1 THEN
      PERFORM pg_temp.r2_role();
      v_a := pg_temp.r2_audit(v_user);
      IF pg_temp.r2_probe(v_user,v_a,v_s) <> 'recorded'
         OR NOT pg_temp.holds_advisory(hashtextextended('interview_session:' || v_s::text,0),'ExclusiveLock') THEN
        RAISE EXCEPTION 'R2 D6-01: first verdict omitted the session key lock';
      END IF;
    END IF;
    INSERT INTO public.records(id,user_id,kind,body,audit_period,system_tags,client_request_id)
    VALUES(v_r,v_user,'audit_response',public.interview_transcript_body('ko',v_turns),'now',ARRAY['interview'],'interview:'||v_s::text);
    PERFORM pg_temp.r2_role(v_user);
    IF v_mode = 3 THEN
      v_result := public.commit_interview_session(v_s,v_r,v_turns);
      IF v_result->>'status' <> 'committed' THEN RAISE EXCEPTION 'R2 D6-01 setup: %',v_result; END IF;
      IF public.discard_interview_session(v_s) <> 'already_committed' THEN
        RAISE EXCEPTION 'R2 D6-01: discard removed a committed session';
      END IF;
      DELETE FROM public.records WHERE id=v_r;
      -- Even a replacement record with the old request key cannot resurrect its erased session.
      v_r := gen_random_uuid();
      INSERT INTO public.records(id,user_id,kind,body,audit_period,system_tags,client_request_id)
      VALUES(v_r,v_user,'audit_response',public.interview_transcript_body('ko',v_turns),'now',ARRAY['interview'],'interview:'||v_s::text);
    ELSE
      IF public.discard_interview_session(v_s) <> 'discarded' THEN RAISE EXCEPTION 'R2 D6-52: discard failed'; END IF;
    END IF;
    IF NOT EXISTS(SELECT 1 FROM public.interview_session_tombstones WHERE session_id=v_s)
       OR NOT pg_temp.holds_advisory(hashtextextended('interview_session:'||v_s::text,0),'ExclusiveLock') THEN
      RAISE EXCEPTION 'R2 D6-52: discard before first writer did not tombstone under the session key';
    END IF;
    SELECT COALESCE(sum(created),0) INTO v_starts FROM public.interview_session_starts WHERE owner_id=v_user;
    SELECT COALESCE(sum(answers),0) INTO v_cells FROM public.interview_coverage WHERE user_id=v_user;
    v_result := public.commit_interview_session(v_s,v_r,v_turns);
    IF v_result->>'status' <> 'session_closed' THEN RAISE EXCEPTION 'R2 D6-01: commit revived a folded session: %',v_result; END IF;
    PERFORM pg_temp.r2_role();
    v_a := pg_temp.r2_audit(v_user);
    IF pg_temp.r2_probe(v_user,v_a,v_s) <> 'session_closed' THEN RAISE EXCEPTION 'R2 D6-52: late first verdict revived discard'; END IF;
    IF EXISTS(SELECT 1 FROM public.interview_sessions WHERE id=v_s)
       OR EXISTS(SELECT 1 FROM public.interview_transcripts WHERE session_id=v_s)
       OR EXISTS(SELECT 1 FROM public.interview_probe_verdicts WHERE session_id=v_s)
       OR (SELECT sum(created) FROM public.interview_session_starts WHERE owner_id=v_user) IS DISTINCT FROM v_starts
       OR (SELECT sum(answers) FROM public.interview_coverage WHERE user_id=v_user) IS DISTINCT FROM v_cells
       OR NOT EXISTS(SELECT 1 FROM public.ai_audit_log WHERE id=v_a AND prompt_hash='' AND output_hash='') THEN
      RAISE EXCEPTION 'R2 D6-01/52: a folded id regained rows, cells, starts or audit hashes';
    END IF;
  END LOOP;
  PERFORM pg_temp.r2_role(NULL);
  PERFORM set_config('request.jwt.claim.role','',true);
END $r2_session_lifecycle$;

-- R2 D6-03/09: a closed session cannot acquire a new turn; an audit id cannot migrate to another session.
DO $r2_closed_and_audit$
DECLARE
  v_user uuid := '25000000-0000-4000-8000-000000000001';
  v_s uuid := gen_random_uuid(); v_other uuid := gen_random_uuid();
  v_a uuid := pg_temp.r2_audit(v_user); v_late uuid := pg_temp.r2_audit(v_user);
  v_status text;
BEGIN
  PERFORM pg_temp.r2_role();
  IF pg_temp.r2_probe(v_user,v_a,v_s) <> 'recorded' THEN RAISE EXCEPTION 'R2 setup: first probe'; END IF;
  IF pg_temp.r2_probe(v_user,v_a,v_s) <> 'duplicate' THEN RAISE EXCEPTION 'R2 D6-09: same-session retry lost idempotence'; END IF;
  IF pg_temp.r2_probe(v_user,v_a,v_other) <> 'audit_mismatch'
     OR EXISTS(SELECT 1 FROM public.interview_sessions WHERE id=v_other) THEN
    RAISE EXCEPTION 'R2 D6-09: bound audit id reused in a different session';
  END IF;
  PERFORM pg_temp.r2_role(v_user);
  PERFORM public.close_interview_session(v_s,'now','ko','user_end',0,0);
  PERFORM pg_temp.r2_role();
  v_status := pg_temp.r2_probe(v_user,v_late,v_s,4);
  IF v_status <> 'session_closed'
     OR EXISTS(SELECT 1 FROM public.interview_probe_verdicts WHERE session_id=v_s AND turn_no=4)
     OR NOT EXISTS(SELECT 1 FROM public.interview_session_audit_ids WHERE session_id=v_s AND audit_id=v_late) THEN
    RAISE EXCEPTION 'R2 D6-03: unseen turn appended after session close';
  END IF;
  PERFORM pg_temp.r2_role(v_user);
  PERFORM public.discard_interview_session(v_s);
  PERFORM pg_temp.r2_role();
  IF pg_temp.r2_probe(v_user,v_a,v_other) <> 'audit_mismatch'
     OR pg_temp.r2_probe(v_user,v_late,v_other) <> 'audit_mismatch'
     OR EXISTS(SELECT 1 FROM public.interview_sessions WHERE id=v_other) THEN
    RAISE EXCEPTION 'R2 D6-09: erased audit id was recycled';
  END IF;
  PERFORM set_config('request.jwt.claim.role','',true);
END $r2_closed_and_audit$;

-- R2 D6-02/51: check both selection and snapshot, with one eligible record and both kinds of hold.
DO $r2_polaris_hold$
DECLARE
  v_user uuid := '25000000-0000-4000-8000-000000000001';
  v_r uuid := gen_random_uuid(); v_result jsonb; v_evidence jsonb; v_hold uuid;
BEGIN
  INSERT INTO public.records(id,user_id,kind,body,audit_period,system_tags,created_at)
  VALUES(v_r,v_user,'audit_response','허용할 근거','now',ARRAY['interview'],now()+INTERVAL '1 second');
  PERFORM pg_temp.r2_role(v_user);
  BEGIN
    UPDATE public.polaris_generation_config SET enabled=true;
    v_result := public.reserve_polaris_generation(v_user,'r2-hold-selection');
    SELECT evidence INTO v_evidence FROM public.polaris_generations WHERE id=(v_result->>'generation_id')::uuid;
    IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_evidence) AS e WHERE e->>'id'=v_r::text)
       OR EXISTS(SELECT 1 FROM jsonb_array_elements(v_evidence) AS e
                   JOIN public.interview_transcripts t ON t.record_id::text=e->>'id' WHERE t.ai_hold) THEN
      RAISE EXCEPTION 'R2 D6-02: reserve selected hold evidence or lost eligible evidence';
    END IF;
    IF jsonb_array_length(public.polaris_evidence_snapshot(v_user,v_evidence)) <> jsonb_array_length(v_evidence) THEN
      RAISE EXCEPTION 'R2 D6-51: eligible snapshot changed';
    END IF;
    RAISE EXCEPTION 'r2-polaris-probe-done';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'r2-polaris-probe-done' THEN RAISE; END IF;
  END;
  FOR v_hold IN SELECT record_id FROM public.interview_transcripts WHERE user_id=v_user AND ai_hold LOOP
    SELECT jsonb_build_array(jsonb_build_object('id',r.id,'domain',r.audit_period,
      'body_hash',encode(sha256(convert_to(r.body,'UTF8')),'hex'))) INTO v_evidence FROM public.records r WHERE r.id=v_hold;
    BEGIN
      PERFORM public.polaris_evidence_snapshot(v_user,v_evidence);
      RAISE EXCEPTION 'R2 D6-51: snapshot returned hold evidence';
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM <> 'polaris_evidence_changed' THEN RAISE; END IF;
    END;
  END LOOP;
  IF (SELECT count(*) FROM public.interview_transcripts WHERE user_id=v_user AND ai_hold) <> 2 THEN
    RAISE EXCEPTION 'R2 D6-51 setup: both server and screen hold fixtures required';
  END IF;
  IF has_function_privilege('anon','public.reserve_polaris_generation(uuid,text)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.reserve_polaris_generation(uuid,text)','EXECUTE')
     OR has_function_privilege('service_role','public.polaris_evidence_snapshot(uuid,jsonb)','EXECUTE')
     OR has_function_privilege('authenticated','public.polaris_evidence_snapshot(uuid,jsonb)','EXECUTE')
     OR has_function_privilege('anon','public.polaris_evidence_snapshot(uuid,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'R2 D6-02: Polaris grants drifted from 0195';
  END IF;
  PERFORM pg_temp.r2_role();
  PERFORM set_config('request.jwt.claim.role','',true);
END $r2_polaris_hold$;

-- R2 D6-53: missing/foreign references and a writer arriving after DELETE are rejected atomically.
DO $r2_context_erasure$
DECLARE
  v_user uuid := '25000000-0000-4000-8000-000000000001';
  v_r uuid := gen_random_uuid(); v_foreign uuid := gen_random_uuid();
  v_a uuid := pg_temp.r2_audit(v_user,'secondb_chat'); v_b uuid := pg_temp.r2_audit(v_user,'secondb_chat');
BEGIN
  INSERT INTO public.records(id,user_id,kind,body) VALUES
    (v_r,v_user,'note','record for context'),
    (v_foreign,'25000000-0000-4000-8000-000000000002','note','other owner');
  PERFORM pg_temp.r2_role();
  IF public.record_context_blocks(v_a,'secondb_chat','r1',ARRAY['record:'||v_r::text||'#t2'],NULL) <> 'recorded' THEN
    RAISE EXCEPTION 'R2 D6-53: an owned existing record was rejected';
  END IF;
  IF public.record_context_blocks(v_b,'secondb_chat','r1',ARRAY['record:'||v_r::text,'record:'||v_foreign::text],NULL) <> 'record_mismatch'
     OR EXISTS(SELECT 1 FROM public.ai_audit_context_blocks WHERE audit_id=v_b) THEN
    RAISE EXCEPTION 'R2 D6-53: a foreign record reference was stored';
  END IF;
  DELETE FROM public.records WHERE id=v_r;
  IF EXISTS(SELECT 1 FROM public.ai_audit_context_blocks WHERE audit_id=v_a)
     OR public.record_context_blocks(v_a,'secondb_chat','r1',ARRAY['record:'||v_r::text],NULL) <> 'record_mismatch'
     OR public.record_context_blocks(v_b,'secondb_chat','r1',ARRAY['wiki:ok','record:'||v_r::text||'#t2'],NULL) <> 'record_mismatch'
     OR EXISTS(SELECT 1 FROM public.ai_audit_context_blocks WHERE audit_id IN(v_a,v_b)) THEN
    RAISE EXCEPTION 'R2 D6-53: late context writer restored a deleted record id';
  END IF;
  PERFORM set_config('request.jwt.claim.role','',true);
END $r2_context_erasure$;

-- R2 D6-56: the oldest overlapping 10-minute bucket counts, the preceding one does not.
DO $r2_bucket_boundary$
DECLARE
  v_user uuid := '25000000-0000-4000-8000-000000000002';
  v_s uuid := gen_random_uuid();
  v_boundary timestamptz := date_bin(INTERVAL '10 minutes',now()-INTERVAL '1 hour',TIMESTAMPTZ '2000-01-01 00:00:00+00');
BEGIN
  INSERT INTO public.interview_session_starts(owner_id,bucket_start,created) VALUES(v_user,v_boundary,30);
  PERFORM pg_temp.r2_role(v_user);
  IF public.close_interview_session(v_s,'now','ko','left',0,0) <> 'rate_limited'
     OR EXISTS(SELECT 1 FROM public.interview_sessions WHERE id=v_s) THEN
    RAISE EXCEPTION 'R2 D6-56: overlapping boundary bucket escaped the hourly cap';
  END IF;
  UPDATE public.interview_session_starts SET bucket_start=v_boundary-INTERVAL '10 minutes'
   WHERE owner_id=v_user AND bucket_start=v_boundary;
  IF public.close_interview_session(v_s,'now','ko','left',0,0) <> 'closed' THEN
    RAISE EXCEPTION 'R2 D6-56: a non-overlapping bucket consumed the hourly cap';
  END IF;
  PERFORM public.discard_interview_session(v_s);
  PERFORM pg_temp.r2_role();
  PERFORM set_config('request.jwt.claim.role','',true);
END $r2_bucket_boundary$;

-- R2 D6-06/07/10: actual scheduling contract and registry receipt categories.
DO $r2_contracts$
DECLARE v_n integer;
BEGIN
  IF to_regprocedure('cron.schedule(text,text,text)') IS NULL THEN
    IF current_setting('app.allow_missing_pg_cron',true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'R2 D6-06: missing cron without explicit local opt-out';
    END IF;
  ELSE
    EXECUTE 'SELECT count(*) FROM cron.job WHERE active AND username=current_user AND database=current_database()
      AND (jobname,schedule,command) IN (
      (''sweep-interview-sessions'',''23 * * * *'',''SELECT public.sweep_interview_sessions();''),
      (''prune-interview-ledgers'',''41 18 * * *'',''SELECT public.prune_interview_ledgers();''))' INTO v_n;
    IF v_n <> 2 THEN RAISE EXCEPTION 'R2 D6-06: cleanup job contract mismatch'; END IF;
  END IF;
  IF (SELECT count(*) FROM public.erasure_registry) <> 78 THEN RAISE EXCEPTION 'R2 D6-10: registry count differs from CI'; END IF;
  IF (SELECT count(*) FROM public.erasure_registry WHERE table_name IN('interview_sessions','ai_audit_context_blocks')
        AND class='client_erasable' AND cascades_from IS NULL) <> 2 THEN
    RAISE EXCEPTION 'R2 D6-07: content-erased rows would be reported as kept';
  END IF;
  IF to_regclass('public.period_card_proposals') IS NOT NULL
     OR to_regprocedure('public.decide_period_card(uuid,text,text,text,boolean)') IS NOT NULL THEN
    RAISE EXCEPTION 'RD-261007-13: phase-two period cards remain in phase one';
  END IF;
END $r2_contracts$;

-- R2 D6-07: direct owner deletion also clears refused-call hashes and blocks late writers.
DO $r2_owner_delete$
DECLARE
  v_user uuid := '25000000-0000-4000-8000-000000000001';
  v_s uuid := gen_random_uuid(); v_a uuid := pg_temp.r2_audit(v_user);
BEGIN
  PERFORM pg_temp.r2_role();
  PERFORM pg_temp.r2_probe(v_user,v_a,v_s);
  PERFORM pg_temp.r2_role(v_user);
  SET LOCAL ROLE authenticated;
  DELETE FROM public.interview_sessions WHERE id=v_s;
  RESET ROLE;
  IF EXISTS(SELECT 1 FROM public.interview_sessions WHERE id=v_s)
     OR NOT EXISTS(SELECT 1 FROM public.ai_audit_log WHERE id=v_a AND prompt_hash='' AND output_hash='')
     OR NOT EXISTS(SELECT 1 FROM public.interview_session_tombstones WHERE session_id=v_s) THEN
    RAISE EXCEPTION 'R2 D6-07: owner session deletion left hashes or no tombstone';
  END IF;
  PERFORM pg_temp.r2_role();
  PERFORM set_config('request.jwt.claim.role','',true);
END $r2_owner_delete$;

-- D6R3-51: direct parent deletion and ordinary client tag writes cannot release a record hold.
-- Vanilla scratch databases lack Supabase's records grants; exercise the real owner write surface.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.records TO authenticated;
DO $r3_record_hold$
DECLARE
  v_user uuid := '25000000-0000-4000-8000-000000000001';
  v_s uuid; v_r uuid; v_path integer; v_result jsonb; v_evidence jsonb;
  v_turns jsonb := pg_temp.four_turns('보관할 답 하나','보관할 답 둘');
  v_body text := public.interview_transcript_body('ko',v_turns);
BEGIN
  FOR v_path IN 1..2 LOOP
    v_s := gen_random_uuid(); v_r := gen_random_uuid();
    PERFORM pg_temp.r2_role(v_user);
    SET LOCAL ROLE authenticated;
    -- All 16 tag slots can already be occupied; hold must still commit without rewriting them.
    INSERT INTO public.records(id,user_id,kind,body,audit_period,system_tags,client_request_id)
    VALUES(v_r,v_user,'audit_response',v_body,
      'now',ARRAY['interview'] || ARRAY(SELECT 'slot' || n FROM generate_series(1,15) n),'interview:'||v_s::text);
    v_result := public.commit_interview_session(v_s,v_r,v_turns,true);
    IF v_result->>'status' IS DISTINCT FROM 'committed' OR v_result->>'ai_hold' IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'D6R3-51: hold commit failed with 16 system tags: %',v_result;
    END IF;
    IF v_path=1 THEN DELETE FROM public.interview_transcripts WHERE record_id=v_r;
    ELSE DELETE FROM public.interview_sessions WHERE id=v_s; END IF;
    UPDATE public.records SET system_tags=ARRAY['interview','recall'] WHERE id=v_r;
    BEGIN
      UPDATE public.records SET interview_ai_hold=false WHERE id=v_r;
      RAISE EXCEPTION 'D6R3-51: client cleared record hold';
    EXCEPTION WHEN insufficient_privilege THEN
      IF SQLERRM <> 'interview_record_hold_server_only' THEN RAISE; END IF;
    END;
    BEGIN
      INSERT INTO public.records(user_id,kind,body,interview_ai_hold) VALUES(v_user,'note','forged',true);
      RAISE EXCEPTION 'D6R3-51: client set server-owned hold';
    EXCEPTION WHEN insufficient_privilege THEN
      IF SQLERRM <> 'interview_record_hold_server_only' THEN RAISE; END IF;
    END;
    RESET ROLE;
    IF NOT EXISTS (SELECT 1 FROM public.records WHERE id=v_r AND interview_ai_hold)
       OR EXISTS (SELECT 1 FROM public.interview_transcripts WHERE record_id=v_r) THEN
      RAISE EXCEPTION 'D6R3-51: record hold did not survive parent deletion';
    END IF;
    SELECT jsonb_build_array(jsonb_build_object('id',id,'domain',audit_period,
      'body_hash',encode(sha256(convert_to(body,'UTF8')),'hex'))) INTO v_evidence FROM public.records WHERE id=v_r;
    BEGIN
      PERFORM public.polaris_evidence_snapshot(v_user,v_evidence);
      RAISE EXCEPTION 'D6R3-51: snapshot accepted hold after parent deletion';
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM <> 'polaris_evidence_changed' THEN RAISE; END IF;
    END;
    BEGIN
      UPDATE public.polaris_generation_config SET enabled=true;
      v_result := public.reserve_polaris_generation(v_user,'r3-hold-selection-'||v_path);
      IF EXISTS (SELECT 1 FROM public.polaris_generations g, jsonb_array_elements(g.evidence) e
                  WHERE g.id=(v_result->>'generation_id')::uuid AND e->>'id'=v_r::text) THEN
        RAISE EXCEPTION 'D6R3-51: reserve accepted hold after parent deletion';
      END IF;
      RAISE EXCEPTION 'r3-reserve-done';
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM <> 'r3-reserve-done' THEN RAISE; END IF;
    END;
  END LOOP;
  PERFORM pg_temp.r2_role();
  PERFORM set_config('request.jwt.claim.role','',true);
END $r3_record_hold$;

-- D6R3-54: an account deletion fence remains authoritative even after its lock was released.
DO $r3_sweep_deleted_account$
DECLARE
  v_user uuid := '25000000-0000-4000-8000-000000000001';
  v_s uuid := gen_random_uuid(); v_a uuid := pg_temp.r2_audit(v_user);
BEGIN
  PERFORM pg_temp.r2_role();
  PERFORM pg_temp.r2_probe(v_user,v_a,v_s);
  UPDATE public.interview_sessions SET last_seen_at=now()-INTERVAL '7 hours' WHERE id=v_s;
  INSERT INTO public.account_deletion_tombstones(user_id,session_id) VALUES(v_user,gen_random_uuid());
  PERFORM public.sweep_interview_sessions();
  IF NOT EXISTS (SELECT 1 FROM public.interview_sessions WHERE id=v_s)
     OR NOT EXISTS (SELECT 1 FROM public.ai_audit_log WHERE id=v_a AND prompt_hash<>'' AND output_hash<>'') THEN
    RAISE EXCEPTION 'D6R3-54: sweep entered a deleting account';
  END IF;
  DELETE FROM public.account_deletion_tombstones WHERE user_id=v_user;
  PERFORM public.sweep_interview_sessions();
  IF EXISTS (SELECT 1 FROM public.interview_sessions WHERE id=v_s)
     OR NOT EXISTS (SELECT 1 FROM public.ai_audit_log WHERE id=v_a AND prompt_hash='' AND output_hash='') THEN
    RAISE EXCEPTION 'D6R3-54: sweep failed to clean an active account';
  END IF;
  PERFORM set_config('request.jwt.claim.role','',true);
END $r3_sweep_deleted_account$;

-- R2 D6-04: both FK cascade entry points erase hashes before audit.user_id becomes NULL.
DO $r2_account_cascade$
DECLARE
  v_user uuid; v_s uuid; v_a uuid; v_refused uuid; v_path integer;
BEGIN
  FOR v_path IN REVERSE 2..1 LOOP
    v_user:=gen_random_uuid(); v_s:=gen_random_uuid();
    SET LOCAL session_replication_role=replica;
    INSERT INTO auth.users(id,email) VALUES(v_user,'d6-cascade-'||v_path||'@example.com');
    SET LOCAL session_replication_role=origin;
    INSERT INTO public.users(id,email,birth_date,locale) VALUES(v_user,'d6-cascade-'||v_path||'@example.com',DATE '1990-01-01','ko');
    v_a:=pg_temp.r2_audit(v_user); v_refused:=pg_temp.r2_audit(v_user);
    PERFORM pg_temp.r2_role();
    PERFORM pg_temp.r2_probe(v_user,v_a,v_s);
    PERFORM pg_temp.r2_role(v_user);
    PERFORM public.close_interview_session(v_s,'now','ko','left',0,0);
    PERFORM pg_temp.r2_role();
    IF pg_temp.r2_probe(v_user,v_refused,v_s,4) <> 'session_closed' THEN RAISE EXCEPTION 'R2 cascade setup'; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.ai_audit_log WHERE id=v_a AND prompt_hash<>'') THEN RAISE EXCEPTION 'R2 cascade setup: live hash required'; END IF;
    PERFORM set_config('request.jwt.claim.role','',true);
    IF v_path=1 THEN DELETE FROM auth.users WHERE id=v_user;
    ELSE DELETE FROM public.users WHERE id=v_user; END IF;
    IF (SELECT count(*) FROM public.ai_audit_log WHERE id IN(v_a,v_refused)
         AND user_id IS NULL AND prompt_hash='' AND output_hash='') <> 2 THEN
      RAISE EXCEPTION 'R2 D6-04: account cascade kept verdict/refused audit hashes (path %)',v_path;
    END IF;
  END LOOP;
END $r2_account_cascade$;

-- 9. Account deletion takes every owned interview row; the owner-less rollup stays.
DELETE FROM auth.users WHERE id = '25000000-0000-4000-8000-000000000001';
DO $cascade$
BEGIN
  IF EXISTS (SELECT 1 FROM public.interview_sessions WHERE owner_id = '25000000-0000-4000-8000-000000000001')
     OR EXISTS (SELECT 1 FROM public.interview_transcripts WHERE user_id = '25000000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'account deletion left owned interview rows behind';
  END IF;
  IF NOT pg_temp.hashes_erased(ARRAY['df','d8']) THEN
    RAISE EXCEPTION 'R2 D6-04: saved-session account cascade kept audit hashes';
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
