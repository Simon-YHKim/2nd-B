-- Empty rehearsal only. Never erase used replay keys, receipt facts or fences.
BEGIN;
LOCK TABLE public.interview_content_authority,public.interview_content_wipes,
 public.interview_work_contracts IN ACCESS EXCLUSIVE MODE;
DO $guard$
BEGIN
 IF EXISTS(SELECT 1 FROM public.interview_content_authority)
 OR EXISTS(SELECT 1 FROM public.interview_content_wipes)
 OR EXISTS(SELECT 1 FROM public.interview_work_contracts) THEN
  RAISE EXCEPTION 'interview_finalize_used_rollback_forbidden' USING ERRCODE='55000';
 END IF;
END;
$guard$;
DROP TRIGGER authority_legacy_record_write ON public.records;
DROP TRIGGER authority_legacy_coverage_write ON public.interview_coverage;
DROP TRIGGER authority_work_identity ON public.interview_work_contracts;
DROP TRIGGER authority_protocol_guard ON public.interview_content_authority;
DROP TRIGGER authority_content_erasure ON public.records;
DROP TRIGGER authority_content_erasure ON public.interview_transcripts;
DROP TRIGGER authority_content_erasure ON public.interview_transcript_turns;
DROP TRIGGER authority_content_erasure ON public.interview_sessions;
DROP TRIGGER authority_account_erasure ON public.users;
DROP TRIGGER authority_account_erasure ON auth.users;

CREATE OR REPLACE FUNCTION public.commit_interview_session(
  p_session_id uuid,
  p_record_id uuid,
  p_turns jsonb,
  p_crisis_hold boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_session public.interview_sessions%ROWTYPE;
  v_record_body text;
  v_record_period text;
  v_record_hold boolean;
  v_count integer;
  v_turn jsonb;
  v_i integer;
  v_role text;
  v_state text;
  v_text text;
  v_locale text;
  v_transcript uuid;
  v_existing public.interview_probe_verdicts%ROWTYPE;
  v_digest text;
  v_prev_ask text;
  v_scene integer;
  v_last_scene integer := 0;
  v_turn_seq integer := 0;
  v_user_turns integer := 0;
  v_rows integer;
  v_proxy integer;
  v_mismatch integer;
  v_orphans integer;
  v_cells integer := 0;
  v_created boolean := false;
  v_hold boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_session_id IS NULL OR p_record_id IS NULL OR p_crisis_hold IS NULL
     OR p_turns IS NULL OR pg_catalog.jsonb_typeof(p_turns) <> 'array' THEN
    RAISE EXCEPTION 'interview_session_commit_invalid' USING ERRCODE = '22023';
  END IF;
  v_count := pg_catalog.jsonb_array_length(p_turns);
  IF v_count NOT BETWEEN 1 AND 4000 THEN
    RAISE EXCEPTION 'interview_session_commit_invalid' USING ERRCODE = '22023';
  END IF;
  PERFORM public.assert_polaris_account_active(v_uid);

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('interview_session:' || p_session_id::text, 0));
  IF EXISTS (SELECT 1 FROM public.interview_session_tombstones AS t WHERE t.session_id = p_session_id) THEN
    RETURN pg_catalog.jsonb_build_object('status', 'session_closed');
  END IF;

  SELECT * INTO v_session
    FROM public.interview_sessions AS s
   WHERE s.id = p_session_id
   FOR UPDATE;
  IF FOUND THEN
    IF v_session.owner_id IS DISTINCT FROM v_uid THEN
      RETURN pg_catalog.jsonb_build_object('status', 'not_found');
    END IF;
    IF v_session.committed_at IS NOT NULL THEN
      RETURN pg_catalog.jsonb_build_object('status', 'already_committed', 'record_id', v_session.record_id);
    END IF;
  END IF;

  -- A DELETE already owns its record row before the row trigger can take our session key.
  -- Do not wait in the opposite direction: abort for retry, releasing all transaction locks.
  BEGIN
  SELECT r.body, r.audit_period, r.interview_ai_hold INTO v_record_body, v_record_period, v_record_hold
    FROM public.records AS r
   WHERE r.id = p_record_id
     AND r.user_id = v_uid
     AND r.kind::text = 'audit_response'
     AND r.system_tags @> ARRAY['interview']::text[]
     AND r.client_request_id = 'interview:' || p_session_id::text
   FOR UPDATE NOWAIT;
  EXCEPTION WHEN lock_not_available THEN
    RAISE EXCEPTION 'interview_record_busy_retry' USING ERRCODE = '40001';
  END;
  IF NOT FOUND
     OR v_record_period IS NULL
     OR v_record_period NOT IN ('infancy', 'school', 'twenties', 'later', 'work', 'now')
     OR (v_session.id IS NOT NULL AND v_record_period <> v_session.period) THEN
    RETURN pg_catalog.jsonb_build_object('status', 'record_mismatch');
  END IF;

  -- 턴 검사. 어긋나면 아무것도 쓰지 않는다.
  FOR v_i IN 0 .. v_count - 1 LOOP
    v_turn := p_turns -> v_i;
    IF pg_catalog.jsonb_typeof(v_turn) <> 'object'
       OR pg_catalog.jsonb_typeof(v_turn -> 'n') <> 'number'
       OR (v_turn ->> 'n') !~ '^[0-9]{1,4}$' OR (v_turn ->> 'n')::integer <> v_i + 1
       OR pg_catalog.jsonb_typeof(v_turn -> 'scene') <> 'number'
       OR (v_turn ->> 'scene') !~ '^[0-9]{1,5}$' OR (v_turn ->> 'scene')::integer NOT BETWEEN 1 AND 10000
       OR pg_catalog.jsonb_typeof(v_turn -> 'text') <> 'string'
       OR pg_catalog.char_length(v_turn ->> 'text') NOT BETWEEN 1 AND 8000
       OR (v_turn ? 'layer' AND pg_catalog.jsonb_typeof(v_turn -> 'layer') <> 'null'
           AND (v_turn ->> 'layer') NOT IN ('fact', 'feeling', 'meaning', 'belief', 'echo'))
       OR (v_turn ? 'ask_kind' AND pg_catalog.jsonb_typeof(v_turn -> 'ask_kind') <> 'null'
           AND (v_turn ->> 'ask_kind') NOT IN ('seed', 'drill', 'scaffold', 'confirm', 'loop_check', 'switch_offer', 'fallback')) THEN
      RETURN pg_catalog.jsonb_build_object('status', 'turns_invalid', 'at', v_i + 1);
    END IF;
    v_role := v_turn ->> 'role';
    IF v_role = 'interviewer' THEN
      IF (v_turn ->> 'origin') IS NULL OR (v_turn ->> 'origin') NOT IN ('model', 'fixed')
         OR (v_turn ? 'opener_unedited' AND pg_catalog.jsonb_typeof(v_turn -> 'opener_unedited') <> 'null')
         OR (v_turn ? 'state' AND pg_catalog.jsonb_typeof(v_turn -> 'state') <> 'null') THEN
        RETURN pg_catalog.jsonb_build_object('status', 'turns_invalid', 'at', v_i + 1);
      END IF;
    ELSIF v_role = 'user' THEN
      IF (v_turn ->> 'origin') IS DISTINCT FROM 'user'
         OR (v_turn ->> 'state') IS NULL
         OR (v_turn ->> 'state') NOT IN ('judged', 'unsettled', 'local_block', 'control')
         OR (v_turn ? 'opener_unedited' AND pg_catalog.jsonb_typeof(v_turn -> 'opener_unedited') NOT IN ('boolean', 'null'))
         OR (v_turn ? 'ask_kind' AND pg_catalog.jsonb_typeof(v_turn -> 'ask_kind') <> 'null') THEN
        RETURN pg_catalog.jsonb_build_object('status', 'turns_invalid', 'at', v_i + 1);
      END IF;
    ELSE
      RETURN pg_catalog.jsonb_build_object('status', 'turns_invalid', 'at', v_i + 1);
    END IF;
  END LOOP;

  -- 원문 두 벌 대조: 렌더링한 본문이 레코드 본문과 같은 바이트여야 한다.
  IF v_record_body = public.interview_transcript_body('ko', p_turns) THEN
    v_locale := 'ko';
  ELSIF v_record_body = public.interview_transcript_body('en', p_turns) THEN
    v_locale := 'en';
  END IF;
  IF v_locale IS NULL OR (v_session.id IS NOT NULL AND v_locale <> v_session.locale) THEN
    RETURN pg_catalog.jsonb_build_object('status', 'transcript_mismatch');
  END IF;

  IF v_session.id IS NULL THEN
    -- 처음 보는 세션. 동시에 온 다른 담기가 먼저 만들었을 수 있으므로 충돌을 받아 넘기고,
    -- 그 잠금 뒤에서 소유자 · 담기 여부 · 시기 · 언어를 다시 본다(D6-57).
    INSERT INTO public.interview_sessions AS s (id, owner_id, period, locale)
    VALUES (p_session_id, v_uid, v_record_period, v_locale)
    ON CONFLICT (id) DO NOTHING;
    v_created := FOUND;
    SELECT * INTO v_session FROM public.interview_sessions AS s WHERE s.id = p_session_id FOR UPDATE;
    IF NOT FOUND OR v_session.owner_id IS DISTINCT FROM v_uid THEN
      RETURN pg_catalog.jsonb_build_object('status', 'not_found');
    END IF;
    IF v_session.committed_at IS NOT NULL THEN
      RETURN pg_catalog.jsonb_build_object('status', 'already_committed', 'record_id', v_session.record_id);
    END IF;
    IF v_session.period <> v_record_period THEN
      RETURN pg_catalog.jsonb_build_object('status', 'record_mismatch');
    END IF;
    IF v_session.locale <> v_locale THEN
      RETURN pg_catalog.jsonb_build_object('status', 'transcript_mismatch');
    END IF;
  END IF;

  v_hold := p_crisis_hold OR v_record_hold
    OR EXISTS (SELECT 1
                 FROM public.interview_session_audit_ids AS i
                 JOIN public.ai_audit_log AS a ON a.id = i.audit_id
                WHERE i.session_id = p_session_id AND a.user_id = v_uid AND a.safety_zone = 'red');

  IF v_hold THEN
    UPDATE public.records SET interview_ai_hold = true WHERE id = p_record_id;
  END IF;

  INSERT INTO public.interview_transcripts AS t (user_id, session_id, record_id, period, locale, turn_count, ai_hold)
  VALUES (v_uid, p_session_id, p_record_id, v_session.period, v_locale, v_count, v_hold)
  RETURNING t.id INTO v_transcript;

  INSERT INTO public.interview_transcript_turns AS tt (
    transcript_id, user_id, turn_no, role, scene_seq, asked_layer, origin, ask_kind, opener_unedited, text, ai_hold)
  SELECT v_transcript, v_uid, (e.value ->> 'n')::integer, e.value ->> 'role', (e.value ->> 'scene')::integer,
         e.value ->> 'layer', e.value ->> 'origin', e.value ->> 'ask_kind',
         CASE WHEN e.value ->> 'role' = 'user' THEN (e.value ->> 'opener_unedited')::boolean END,
         e.value ->> 'text', v_hold
    FROM pg_catalog.jsonb_array_elements(p_turns) AS e(value);

  -- 판정 행 맞추기: 답 턴마다 정확히 한 행.
  FOR v_turn IN
    SELECT e.value FROM pg_catalog.jsonb_array_elements(p_turns) AS e(value)
     ORDER BY (e.value ->> 'n')::integer
  LOOP
    v_role := v_turn ->> 'role';
    IF v_role = 'interviewer' THEN
      v_prev_ask := v_turn ->> 'ask_kind';
      CONTINUE;
    END IF;
    v_user_turns := v_user_turns + 1;
    v_scene := (v_turn ->> 'scene')::integer;
    IF v_scene <> v_last_scene THEN
      v_turn_seq := 0;
      v_last_scene := v_scene;
    END IF;
    v_turn_seq := v_turn_seq + 1;
    v_state := v_turn ->> 'state';
    v_text := v_turn ->> 'text';

    SELECT * INTO v_existing
      FROM public.interview_probe_verdicts AS v
     WHERE v.session_id = p_session_id AND v.turn_no = (v_turn ->> 'n')::integer
     FOR UPDATE;
    IF FOUND THEN
      v_digest := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
        p_session_id::text || ':' || (v_turn ->> 'n') || ':' || v_text, 'UTF8')), 'hex');
      UPDATE public.interview_probe_verdicts AS v
         SET transcript_id = v_transcript,
             answer_digest = NULL,
             link_state = CASE
               WHEN v_state = 'unsettled' THEN 'undelivered'
               WHEN v_existing.answer_digest IS NOT NULL AND v_existing.answer_digest = v_digest THEN 'linked'
               ELSE 'text_mismatch' END
       WHERE v.id = v_existing.id;
    ELSE
      INSERT INTO public.interview_probe_verdicts AS v (
        session_id, scene_seq, turn_seq, turn_no, transcript_id, asked_layer, probe_kind,
        verdict, final_credit, rule_set, source, link_state, opener_unedited)
      VALUES (
        p_session_id, v_scene, LEAST(v_turn_seq, 10000), (v_turn ->> 'n')::integer, v_transcript,
        v_turn ->> 'layer', v_prev_ask,
        CASE v_state WHEN 'local_block' THEN 'local_block' WHEN 'control' THEN 'control'
                     WHEN 'unsettled' THEN 'error' ELSE 'unrecorded' END,
        false, 'r0', 'client', 'linked', (v_turn ->> 'opener_unedited')::boolean);
    END IF;
  END LOOP;

  -- 대화록에 붙지 않은 프록시 행(화면이 버린 늦은 응답, 질문 턴을 가리킨 행)은 orphan.
  UPDATE public.interview_probe_verdicts AS v
     SET link_state = 'orphan', answer_digest = NULL
   WHERE v.session_id = p_session_id AND v.transcript_id IS NULL;
  GET DIAGNOSTICS v_orphans = ROW_COUNT;

  SELECT pg_catalog.count(*)::integer,
         pg_catalog.count(*) FILTER (WHERE v.source = 'proxy')::integer,
         pg_catalog.count(*) FILTER (WHERE v.link_state = 'text_mismatch')::integer
    INTO v_rows, v_proxy, v_mismatch
    FROM public.interview_probe_verdicts AS v
   WHERE v.transcript_id = v_transcript;
  IF v_rows <> v_user_turns THEN
    RAISE EXCEPTION 'interview_ledger_turn_count % <> %', v_rows, v_user_turns USING ERRCODE = 'P0001';
  END IF;

  IF NOT v_hold THEN
    WITH credited AS (
      SELECT v.asked_layer AS layer, pg_catalog.count(DISTINCT v.scene_seq)::integer AS scenes
        FROM public.interview_probe_verdicts AS v
       WHERE v.transcript_id = v_transcript
         AND v.final_credit
         AND v.link_state = 'linked'
         AND v.asked_layer IS NOT NULL
         -- D6R3-55: the session lock and closed-session write fence define the cutoff.
         -- Transaction start timestamps can run in the opposite order to those locks.
       GROUP BY v.asked_layer
    ), added AS (
      INSERT INTO public.interview_coverage AS c (user_id, period, layer, answers, updated_at)
      SELECT v_uid, v_session.period, credited.layer, credited.scenes, pg_catalog.now()
        FROM credited
      ON CONFLICT (user_id, period, layer) DO UPDATE
        SET answers = c.answers + EXCLUDED.answers,
            updated_at = EXCLUDED.updated_at
      RETURNING 1
    )
    SELECT COALESCE((SELECT pg_catalog.sum(credited.scenes) FROM credited), 0)::integer
      INTO v_cells
      FROM (SELECT pg_catalog.count(*) FROM added) AS done;
  END IF;

  UPDATE public.interview_sessions AS s
     SET committed_at = pg_catalog.now(),
         record_id = p_record_id,
         last_seen_at = pg_catalog.now()
   WHERE s.id = p_session_id;

  RETURN pg_catalog.jsonb_build_object(
    'status', 'committed',
    'session_created', v_created,
    'ai_hold', v_hold,
    'user_turns', v_user_turns,
    'ledger_rows', v_rows,
    'proxy_rows', v_proxy,
    'cells_added', v_cells,
    'mismatches', v_mismatch,
    'orphans', v_orphans);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_interview_probe_verdict(
  p_user_id uuid,
  p_audit_id uuid,
  p_session_id uuid,
  p_period text,
  p_locale text,
  p_scene_seq integer,
  p_turn_seq integer,
  p_turn_no integer,
  p_asked_layer text,
  p_probe_kind text,
  p_local_gate text,
  p_model_layer text,
  p_verdict text,
  p_final_credit boolean,
  p_rule_set text,
  p_vendor text,
  p_opener_unedited boolean,
  p_openers_offered integer,
  p_answer_len_bucket integer,
  p_answer_digest text
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  -- 한 세션의 원장 상한. 하루 판정 몫이 먼저 끊으므로 정상 대화는 닿지 않는다.
  c_max_rows constant integer := 2000;
  v_session public.interview_sessions%ROWTYPE;
  v_existing public.interview_probe_verdicts%ROWTYPE;
  v_max_scene integer;
  v_rows integer;
  v_invalid text;
BEGIN
  IF public.billing_request_role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role only' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL OR p_audit_id IS NULL OR p_session_id IS NULL
     OR p_period IS NULL OR p_period NOT IN ('infancy', 'school', 'twenties', 'later', 'work', 'now')
     OR p_locale IS NULL OR p_locale NOT IN ('ko', 'en')
     OR p_scene_seq IS NULL OR p_scene_seq NOT BETWEEN 1 AND 10000
     OR p_turn_seq IS NULL OR p_turn_seq NOT BETWEEN 1 AND 10000
     OR p_turn_no IS NULL OR p_turn_no NOT BETWEEN 1 AND 4000
     OR (p_asked_layer IS NOT NULL AND p_asked_layer NOT IN ('fact', 'feeling', 'meaning', 'belief', 'echo'))
     OR p_probe_kind IS NULL
     OR p_probe_kind NOT IN ('seed', 'drill', 'scaffold', 'confirm', 'loop_check', 'switch_offer', 'fallback')
     OR p_local_gate IS NULL OR p_local_gate NOT IN ('pass', 'short', 'non_answer', 'mismatch', 'unverified')
     OR (p_model_layer IS NOT NULL AND p_model_layer NOT IN ('fact', 'feeling', 'meaning', 'belief', 'echo'))
     OR p_verdict IS NULL OR p_verdict NOT IN ('credited', 'none', 'other_layer', 'no_verdict', 'unasked', 'error')
     OR p_final_credit IS NULL
     OR p_rule_set IS NULL
     OR p_vendor IS NULL OR p_vendor NOT IN ('openai', 'claude')
     OR p_opener_unedited IS NULL
     OR (p_openers_offered IS NOT NULL AND p_openers_offered NOT BETWEEN 0 AND 2)
     OR (p_answer_len_bucket IS NOT NULL AND p_answer_len_bucket NOT BETWEEN 0 AND 3)
     OR (p_answer_digest IS NOT NULL AND p_answer_digest !~ '^[0-9a-f]{64}$') THEN
    v_invalid := 'interview_verdict_invalid';
  END IF;
  -- 기준선 동안 규칙 판은 r0 하나다(설계 T-11). r0 의 최종 인정 = credited AND pass(continuity.ts).
  IF v_invalid IS NULL AND p_rule_set <> 'r0' THEN
    v_invalid := 'interview_rule_set_locked';
  END IF;
  IF v_invalid IS NULL AND p_final_credit IS DISTINCT FROM (p_verdict = 'credited' AND p_local_gate = 'pass') THEN
    v_invalid := 'interview_final_credit_mismatch';
  END IF;
  -- 인정은 모델이 질문 층을 말했을 때만이다. NULL 층의 credited 는 CHECK 에 닿기 전에 거절한다(D6-59).
  IF v_invalid IS NULL AND p_verdict = 'credited'
     AND (p_asked_layer IS NULL OR p_model_layer IS NULL OR p_model_layer <> p_asked_layer) THEN
    v_invalid := 'interview_verdict_invalid';
  END IF;
  -- 계정이 지워지는 중이거나 지워졌으면 아무것도 만들지 않는다(D6-04).
  IF NOT public.interview_account_writable(p_user_id) THEN
    RETURN 'no_account';
  END IF;
  -- Lock the audit id across sessions, then the session key even before its first row exists.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('interview_audit:' || p_audit_id::text, 0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('interview_session:' || p_session_id::text, 0));
  -- 감사 행 결속(D6-01). 남의 감사 행이면 적지도 비우지도 않는다.
  IF NOT EXISTS (SELECT 1 FROM public.ai_audit_log AS a
                  WHERE a.id = p_audit_id AND a.user_id = p_user_id
                    AND a.purpose = 'interview_probe' AND a.event_source = 'server_verified'
                    AND a.prompt_hash <> '' AND a.output_hash <> '') THEN
    RETURN 'audit_mismatch';
  END IF;
  -- 같은 감사 행으로 두 번 온 호출(프록시 재시도). 첫 결과만 남긴다.
  IF EXISTS (SELECT 1 FROM public.interview_session_audit_ids AS i WHERE i.audit_id = p_audit_id) THEN
    IF EXISTS (SELECT 1 FROM public.interview_session_audit_ids AS i
                WHERE i.audit_id = p_audit_id AND i.session_id <> p_session_id) THEN
      RETURN 'audit_mismatch';
    END IF;
    RETURN 'duplicate';
  END IF;

  PERFORM public.hold_interview_record_for_red(p_user_id, p_session_id, p_audit_id);

  -- D6R3-52: a bad payload cannot roll back its own cleanup. Verify ownership and
  -- audit reuse first, then erase this unbound call immediately and return a status.
  -- Even a NULL session id or invalid period must not leave an uncollectable hash.
  IF v_invalid IS NOT NULL THEN
    -- Keep only the verified audit id/safety label for a provably owned session;
    -- hashes are still erased immediately. A later commit must see this red.
    INSERT INTO public.interview_session_audit_ids (audit_id, session_id)
      SELECT p_audit_id, s.id FROM public.interview_sessions AS s
       WHERE s.id = p_session_id AND s.owner_id = p_user_id
         AND EXISTS (SELECT 1 FROM public.ai_audit_log AS a WHERE a.id = p_audit_id AND a.safety_zone = 'red')
      ON CONFLICT (audit_id) DO NOTHING;
    PERFORM public.erase_audit_hashes(p_user_id, ARRAY[p_audit_id], 'interview_probe');
    RETURN v_invalid;
  END IF;

  SELECT * INTO v_session
    FROM public.interview_sessions AS s
   WHERE s.id = p_session_id
   FOR UPDATE;
  IF NOT FOUND THEN
    -- 이미 접힌 세션(버리기 · 유휴 정리 · 레코드 삭제)에 늦게 온 호출. 다시 만들지 않는다(D6-55).
    IF EXISTS (SELECT 1 FROM public.interview_session_tombstones AS t WHERE t.session_id = p_session_id) THEN
      PERFORM public.erase_audit_hashes(p_user_id, ARRAY[p_audit_id], 'interview_probe');
      RETURN 'session_closed';
    END IF;
    INSERT INTO public.interview_sessions AS s (id, owner_id, period, locale, vendor)
    VALUES (p_session_id, p_user_id, p_period, p_locale, p_vendor)
    ON CONFLICT (id) DO NOTHING;
    SELECT * INTO v_session
      FROM public.interview_sessions AS s
     WHERE s.id = p_session_id
     FOR UPDATE;
  END IF;
  IF v_session.owner_id IS DISTINCT FROM p_user_id THEN
    PERFORM public.erase_audit_hashes(p_user_id, ARRAY[p_audit_id], 'interview_probe');
    RETURN 'session_not_owned';
  END IF;

  -- 여기부터 이 감사 id 는 이 세션의 것이다. 아래에서 거절해도 세션을 접을 때 함께 비운다(D6-54).
  INSERT INTO public.interview_session_audit_ids AS i (audit_id, session_id)
  VALUES (p_audit_id, p_session_id)
  ON CONFLICT (audit_id) DO NOTHING;
  IF NOT FOUND THEN
    RETURN 'duplicate';
  END IF;
  IF v_session.committed_at IS NOT NULL THEN
    RETURN 'session_committed';
  END IF;
  IF v_session.period <> p_period OR v_session.locale <> p_locale THEN
    RETURN 'session_mismatch';
  END IF;

  -- 같은 턴의 재호출은 장면이 거꾸로 간 것이 아니다. 먼저 찾아 바꾼다(장면 번호는 바뀌지 않는다).
  SELECT * INTO v_existing
    FROM public.interview_probe_verdicts AS v
   WHERE v.session_id = p_session_id AND v.turn_no = p_turn_no
   FOR UPDATE;
  IF FOUND THEN
    IF v_existing.source <> 'proxy' THEN
      RETURN 'session_committed';
    END IF;
    IF v_existing.scene_seq <> p_scene_seq THEN
      RETURN 'scene_regressed';
    END IF;
    -- 닫힌 뒤의 재시도는 호출 수만 센다. 화면이 닫을 때 본 판정과 그 시각이 칸을 정한다(D6-56).
    IF v_session.ended_at IS NOT NULL THEN
      UPDATE public.interview_probe_verdicts AS v
         SET call_count = LEAST(v.call_count + 1, 50)
       WHERE v.id = v_existing.id;
      RETURN 'session_closed';
    END IF;
    UPDATE public.interview_probe_verdicts AS v
       SET prior_audit_ids = CASE WHEN v.audit_id IS NULL THEN v.prior_audit_ids
                                  ELSE v.prior_audit_ids || v.audit_id END,
           audit_id = p_audit_id,
           scene_seq = p_scene_seq,
           turn_seq = p_turn_seq,
           asked_layer = p_asked_layer,
           probe_kind = p_probe_kind,
           local_gate = p_local_gate,
           model_layer = p_model_layer,
           verdict = p_verdict,
           final_credit = p_final_credit,
           rule_set = p_rule_set,
           vendor = p_vendor,
           opener_unedited = p_opener_unedited,
           openers_offered = p_openers_offered,
           answer_len_bucket = p_answer_len_bucket,
           answer_digest = p_answer_digest,
           call_count = LEAST(v.call_count + 1, 50),
           created_at = pg_catalog.now()
     WHERE v.id = v_existing.id;
    UPDATE public.interview_sessions AS s SET last_seen_at = pg_catalog.now() WHERE s.id = p_session_id;
    RETURN 'replaced';
  END IF;

  -- R2 D6-03: an unseen turn after close cannot extend the ledger.
  IF v_session.ended_at IS NOT NULL THEN
    RETURN 'session_closed';
  END IF;

  SELECT pg_catalog.max(v.scene_seq), pg_catalog.count(*)::integer
    INTO v_max_scene, v_rows
    FROM public.interview_probe_verdicts AS v
   WHERE v.session_id = p_session_id;
  IF v_max_scene IS NOT NULL AND p_scene_seq < v_max_scene THEN
    RETURN 'scene_regressed';
  END IF;
  IF v_rows >= c_max_rows THEN
    RETURN 'session_full';
  END IF;

  INSERT INTO public.interview_probe_verdicts AS v (
    session_id, audit_id, scene_seq, turn_seq, turn_no, asked_layer, probe_kind, local_gate,
    model_layer, verdict, final_credit, rule_set, source, vendor, opener_unedited,
    openers_offered, answer_len_bucket, answer_digest
  ) VALUES (
    p_session_id, p_audit_id, p_scene_seq, p_turn_seq, p_turn_no, p_asked_layer, p_probe_kind, p_local_gate,
    p_model_layer, p_verdict, p_final_credit, p_rule_set, 'proxy', p_vendor, p_opener_unedited,
    p_openers_offered, p_answer_len_bucket, p_answer_digest
  );

  UPDATE public.interview_sessions AS s
     SET last_seen_at = pg_catalog.now(),
         vendor = COALESCE(s.vendor, p_vendor)
   WHERE s.id = p_session_id;
  RETURN 'recorded';
END;
$$;

CREATE OR REPLACE FUNCTION public.fold_interview_session(p_session_id uuid, p_outcome text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  c_layers constant text[] := ARRAY['fact', 'feeling', 'meaning', 'belief', 'echo'];
  v_s public.interview_sessions%ROWTYPE;
  v_week date;
  v_rule text;
  v_scenes integer;
  v_scenes_hist integer[] := ARRAY[0, 0, 0, 0, 0, 0];
  v_depth_hist integer[] := ARRAY[0, 0, 0, 0, 0, 0];
  v_lj integer[] := ARRAY[0, 0, 0, 0, 0];
  v_lo integer[] := ARRAY[0, 0, 0, 0, 0];
  v_ln integer[] := ARRAY[0, 0, 0, 0, 0];
  v_lc integer[] := ARRAY[0, 0, 0, 0, 0];
  v_scene record;
  v_agg record;
  v_i integer;
  v_ids uuid[];
BEGIN
  IF p_outcome IS NULL OR p_outcome NOT IN ('left', 'discarded', 'deleted_after_save') THEN
    RAISE EXCEPTION 'interview_fold_outcome_invalid' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('interview_session:' || p_session_id::text, 0));
  SELECT * INTO v_s FROM public.interview_sessions AS s WHERE s.id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_week := pg_catalog.date_trunc('week', v_s.started_at AT TIME ZONE 'Asia/Seoul')::date;
  SELECT COALESCE(pg_catalog.max(v.rule_set), 'r0') INTO v_rule
    FROM public.interview_probe_verdicts AS v WHERE v.session_id = p_session_id;
  SELECT pg_catalog.count(DISTINCT v.scene_seq)::integer INTO v_scenes
    FROM public.interview_probe_verdicts AS v WHERE v.session_id = p_session_id;
  IF v_scenes > 0 THEN
    v_scenes_hist[LEAST(v_scenes, 6)] := 1;
  END IF;
  FOR v_scene IN
    SELECT COALESCE(pg_catalog.max(CASE WHEN v.final_credit
             THEN pg_catalog.array_position(c_layers, v.asked_layer) END), 0) AS depth
      FROM public.interview_probe_verdicts AS v
     WHERE v.session_id = p_session_id
     GROUP BY v.scene_seq
  LOOP
    v_depth_hist[v_scene.depth + 1] := v_depth_hist[v_scene.depth + 1] + 1;
  END LOOP;
  FOR v_i IN 1..5 LOOP
    SELECT pg_catalog.count(*) FILTER (WHERE v.source = 'proxy')::integer AS judged,
           pg_catalog.count(*) FILTER (WHERE v.verdict = 'other_layer')::integer AS other_layer,
           pg_catalog.count(*) FILTER (WHERE v.verdict = 'no_verdict')::integer AS no_verdict,
           pg_catalog.count(*) FILTER (WHERE v.final_credit)::integer AS credited
      INTO v_agg
      FROM public.interview_probe_verdicts AS v
     WHERE v.session_id = p_session_id AND v.asked_layer = c_layers[v_i];
    v_lj[v_i] := v_agg.judged;
    v_lo[v_i] := v_agg.other_layer;
    v_ln[v_i] := v_agg.no_verdict;
    v_lc[v_i] := v_agg.credited;
  END LOOP;
  SELECT pg_catalog.count(*) FILTER (WHERE v.source = 'proxy')::integer AS judged,
         pg_catalog.count(*) FILTER (WHERE v.verdict = 'credited')::integer AS credited,
         pg_catalog.count(*) FILTER (WHERE v.verdict = 'none')::integer AS none_,
         pg_catalog.count(*) FILTER (WHERE v.verdict = 'other_layer')::integer AS other_layer,
         pg_catalog.count(*) FILTER (WHERE v.verdict = 'no_verdict')::integer AS no_verdict,
         pg_catalog.count(*) FILTER (WHERE v.verdict = 'unasked')::integer AS unasked,
         pg_catalog.count(*) FILTER (WHERE v.verdict = 'error')::integer AS error_,
         pg_catalog.count(*) FILTER (WHERE v.final_credit)::integer AS final_credit,
         pg_catalog.count(*) FILTER (WHERE v.local_gate = 'short')::integer AS gate_short,
         pg_catalog.count(*) FILTER (WHERE v.local_gate IN ('mismatch', 'unverified'))::integer AS gate_untrusted,
         pg_catalog.count(*) FILTER (WHERE v.probe_kind = 'scaffold')::integer AS scaffold_answers,
         pg_catalog.count(*) FILTER (WHERE v.probe_kind = 'scaffold' AND v.final_credit)::integer AS scaffold_recovered,
         pg_catalog.count(*) FILTER (WHERE v.opener_unedited)::integer AS opener_unedited,
         COALESCE(pg_catalog.sum(v.openers_offered), 0)::integer AS openers_offered
    INTO v_agg
    FROM public.interview_probe_verdicts AS v
   WHERE v.session_id = p_session_id;

  INSERT INTO public.interview_unsaved_rollup AS u (
    week_kst, period, locale, vendor, rule_set, outcome, end_reason,
    sessions, scenes, scenes_hist, depth_hist, judged,
    v_credited, v_none, v_other_layer, v_no_verdict, v_unasked, v_error, final_credit,
    gate_short, gate_untrusted, local_blocks, scaffold_answers, scaffold_recovered,
    opener_unedited, openers_offered, layer_judged, layer_other, layer_no_verdict, layer_credited
  ) VALUES (
    v_week, v_s.period, v_s.locale, COALESCE(v_s.vendor, 'none'), v_rule, p_outcome,
    COALESCE(v_s.end_reason, 'left'),
    1, v_scenes, v_scenes_hist, v_depth_hist, v_agg.judged,
    v_agg.credited, v_agg.none_, v_agg.other_layer, v_agg.no_verdict, v_agg.unasked, v_agg.error_,
    v_agg.final_credit, v_agg.gate_short, v_agg.gate_untrusted, COALESCE(v_s.local_blocks, 0),
    v_agg.scaffold_answers, v_agg.scaffold_recovered, v_agg.opener_unedited, v_agg.openers_offered,
    v_lj, v_lo, v_ln, v_lc
  )
  ON CONFLICT (week_kst, period, locale, vendor, rule_set, outcome, end_reason) DO UPDATE SET
    sessions = u.sessions + EXCLUDED.sessions,
    scenes = u.scenes + EXCLUDED.scenes,
    scenes_hist = public.interview_int_array_add(u.scenes_hist, EXCLUDED.scenes_hist),
    depth_hist = public.interview_int_array_add(u.depth_hist, EXCLUDED.depth_hist),
    judged = u.judged + EXCLUDED.judged,
    v_credited = u.v_credited + EXCLUDED.v_credited,
    v_none = u.v_none + EXCLUDED.v_none,
    v_other_layer = u.v_other_layer + EXCLUDED.v_other_layer,
    v_no_verdict = u.v_no_verdict + EXCLUDED.v_no_verdict,
    v_unasked = u.v_unasked + EXCLUDED.v_unasked,
    v_error = u.v_error + EXCLUDED.v_error,
    final_credit = u.final_credit + EXCLUDED.final_credit,
    gate_short = u.gate_short + EXCLUDED.gate_short,
    gate_untrusted = u.gate_untrusted + EXCLUDED.gate_untrusted,
    local_blocks = u.local_blocks + EXCLUDED.local_blocks,
    scaffold_answers = u.scaffold_answers + EXCLUDED.scaffold_answers,
    scaffold_recovered = u.scaffold_recovered + EXCLUDED.scaffold_recovered,
    opener_unedited = u.opener_unedited + EXCLUDED.opener_unedited,
    openers_offered = u.openers_offered + EXCLUDED.openers_offered,
    layer_judged = public.interview_int_array_add(u.layer_judged, EXCLUDED.layer_judged),
    layer_other = public.interview_int_array_add(u.layer_other, EXCLUDED.layer_other),
    layer_no_verdict = public.interview_int_array_add(u.layer_no_verdict, EXCLUDED.layer_no_verdict),
    layer_credited = public.interview_int_array_add(u.layer_credited, EXCLUDED.layer_credited);

  SELECT pg_catalog.array_agg(DISTINCT ids.id) INTO v_ids
    FROM (SELECT v.audit_id AS id FROM public.interview_probe_verdicts AS v
           WHERE v.session_id = p_session_id AND v.audit_id IS NOT NULL
          UNION ALL
          SELECT pg_catalog.unnest(v.prior_audit_ids) FROM public.interview_probe_verdicts AS v
           WHERE v.session_id = p_session_id
          UNION ALL
          SELECT i.audit_id FROM public.interview_session_audit_ids AS i
           WHERE i.session_id = p_session_id) AS ids;
  PERFORM public.erase_audit_hashes(v_s.owner_id, v_ids, 'interview_probe');

  INSERT INTO public.interview_session_tombstones AS t (session_id) VALUES (p_session_id)
  ON CONFLICT (session_id) DO UPDATE SET created_at = pg_catalog.now();

  DELETE FROM public.interview_probe_verdicts AS v WHERE v.session_id = p_session_id;
  DELETE FROM public.interview_sessions AS s WHERE s.id = p_session_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.close_interview_session(
  p_session_id uuid,
  p_period text,
  p_locale text,
  p_end_reason text,
  p_local_blocks integer,
  p_scaffolds integer
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  c_new_sessions_per_hour constant integer := 30;
  v_uid uuid := auth.uid();
  v_session public.interview_sessions%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_session_id IS NULL
     OR p_period IS NULL OR p_period NOT IN ('infancy', 'school', 'twenties', 'later', 'work', 'now')
     OR p_locale IS NULL OR p_locale NOT IN ('ko', 'en')
     OR p_end_reason IS NULL OR p_end_reason NOT IN (
       'complete', 'user_end', 'user_stop', 'skip_exhausted', 'scaffold_exhausted',
       'verdict_exhausted', 'switch_declined', 'no_question', 'day_limit', 'crisis', 'error', 'left')
     OR p_local_blocks IS NULL OR p_local_blocks NOT BETWEEN 0 AND 10000
     OR p_scaffolds IS NULL OR p_scaffolds NOT BETWEEN 0 AND 10000 THEN
    RAISE EXCEPTION 'interview_session_close_invalid' USING ERRCODE = '22023';
  END IF;
  PERFORM public.assert_polaris_account_active(v_uid);

  -- 같은 사용자의 새 세션 만들기를 줄 세운다(셈과 삽입 사이의 경합).
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('interview_session_close:' || v_uid::text, 0));

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('interview_session:' || p_session_id::text, 0));

  IF NOT EXISTS (SELECT 1 FROM public.interview_sessions AS s WHERE s.id = p_session_id) THEN
    IF EXISTS (SELECT 1 FROM public.interview_session_tombstones AS t WHERE t.session_id = p_session_id) THEN
      RETURN 'not_found';
    END IF;
    IF (SELECT COALESCE(pg_catalog.sum(c.created), 0) FROM public.interview_session_starts AS c
         WHERE c.owner_id = v_uid
           AND c.bucket_start >= pg_catalog.date_bin(INTERVAL '10 minutes',
             pg_catalog.now() - INTERVAL '1 hour', TIMESTAMPTZ '2000-01-01 00:00:00+00')) >= c_new_sessions_per_hour THEN
      RETURN 'rate_limited';
    END IF;
    INSERT INTO public.interview_sessions AS s (id, owner_id, period, locale)
    VALUES (p_session_id, v_uid, p_period, p_locale)
    ON CONFLICT (id) DO NOTHING;
  END IF;

  SELECT * INTO v_session
    FROM public.interview_sessions AS s
   WHERE s.id = p_session_id
   FOR UPDATE;
  -- 남의 세션은 없는 것과 같게 답한다.
  IF NOT FOUND OR v_session.owner_id IS DISTINCT FROM v_uid THEN
    RETURN 'not_found';
  END IF;
  IF v_session.ended_at IS NOT NULL THEN
    RETURN 'already_closed';
  END IF;

  UPDATE public.interview_sessions AS s
     SET ended_at = pg_catalog.now(),
         end_reason = p_end_reason,
         local_blocks = p_local_blocks,
         scaffolds = p_scaffolds,
         last_seen_at = pg_catalog.now()
   WHERE s.id = p_session_id;
  RETURN 'closed';
END;
$$;

CREATE OR REPLACE FUNCTION public.discard_interview_session(p_session_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_session public.interview_sessions%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_session_id IS NULL THEN
    RAISE EXCEPTION 'interview_session_discard_invalid' USING ERRCODE = '22023';
  END IF;
  PERFORM public.assert_polaris_account_active(v_uid);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('interview_session:' || p_session_id::text, 0));
  SELECT * INTO v_session
    FROM public.interview_sessions AS s
   WHERE s.id = p_session_id
   FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.interview_session_tombstones(session_id) VALUES (p_session_id) ON CONFLICT DO NOTHING;
    RETURN 'discarded';
  END IF;
  IF v_session.owner_id IS DISTINCT FROM v_uid THEN
    RETURN 'not_found';
  END IF;
  IF v_session.committed_at IS NOT NULL THEN
    RETURN 'already_committed';
  END IF;
  PERFORM public.fold_interview_session(p_session_id, 'discarded');
  RETURN 'discarded';
END;
$$;

CREATE OR REPLACE FUNCTION public.sweep_interview_sessions(p_batch integer DEFAULT 5000)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  c_idle constant interval := INTERVAL '6 hours';
  v_role text := public.billing_request_role();
  v_batch integer := LEAST(GREATEST(COALESCE(p_batch, 5000), 1), 50000);
  v_id uuid;
  v_owner uuid;
  v_n integer := 0;
BEGIN
  -- pg_cron(JWT 없음)과 service_role 만. authenticated · anon 은 EXECUTE 도 없다.
  IF v_role IS NOT NULL AND v_role <> 'service_role' THEN
    RAISE EXCEPTION 'service_role only' USING ERRCODE = '42501';
  END IF;
  FOR v_id, v_owner IN
    SELECT s.id, s.owner_id
      FROM public.interview_sessions AS s
     WHERE s.committed_at IS NULL
       AND s.last_seen_at < pg_catalog.now() - c_idle
     ORDER BY s.last_seen_at
     LIMIT v_batch
  LOOP
    -- D6R3-54: account fence (0192), recheck, session key, then rows/audit hashes.
    -- A deleting account owns the exclusive key; skip it without taking any row lock.
    IF NOT pg_catalog.pg_try_advisory_xact_lock_shared(pg_catalog.hashtextextended(v_owner::text, 260913)) THEN
      CONTINUE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.users AS u WHERE u.id = v_owner)
       OR EXISTS (SELECT 1 FROM public.account_deletion_tombstones AS t WHERE t.user_id = v_owner) THEN
      CONTINUE;
    END IF;
    IF NOT pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('interview_session:' || v_id::text, 0)) THEN
      CONTINUE;
    END IF;
    -- Read in a separate statement: the snapshot must be taken after acquiring the key.
    IF EXISTS (SELECT 1 FROM public.interview_sessions AS s
                WHERE s.id = v_id AND s.committed_at IS NULL AND s.last_seen_at < pg_catalog.now() - c_idle) THEN
      PERFORM public.fold_interview_session(v_id, 'left');
      v_n := v_n + 1;
    END IF;
  END LOOP;
  DELETE FROM public.interview_session_starts AS c
   WHERE c.bucket_start < pg_catalog.now() - INTERVAL '2 hours';
  RETURN v_n;
END;
$$;

CREATE OR REPLACE VIEW public.interview_scene_metrics
WITH (security_invoker = true) AS
SELECT
  s.id AS session_id,
  s.owner_id,
  s.period,
  s.locale,
  s.vendor,
  s.end_reason,
  (s.committed_at IS NOT NULL) AS committed,
  pg_catalog.date_trunc('day', s.started_at) AS started_day,
  v.scene_seq,
  pg_catalog.count(*) FILTER (WHERE v.source = 'proxy')::integer AS judged_calls,
  COALESCE(pg_catalog.max(
    CASE WHEN v.final_credit THEN
      CASE v.asked_layer
        WHEN 'fact' THEN 1 WHEN 'feeling' THEN 2 WHEN 'meaning' THEN 3
        WHEN 'belief' THEN 4 WHEN 'echo' THEN 5 END
    END), 0) AS depth,
  pg_catalog.count(*) FILTER (WHERE v.verdict = 'credited')::integer AS verdict_credited,
  pg_catalog.count(*) FILTER (WHERE v.verdict = 'none')::integer AS verdict_none,
  pg_catalog.count(*) FILTER (WHERE v.verdict = 'other_layer')::integer AS verdict_other_layer,
  pg_catalog.count(*) FILTER (WHERE v.verdict = 'no_verdict')::integer AS verdict_missing,
  pg_catalog.count(*) FILTER (WHERE v.final_credit)::integer AS final_credit,
  pg_catalog.count(*) FILTER (WHERE v.local_gate = 'short')::integer AS gate_short,
  pg_catalog.count(*) FILTER (WHERE v.local_gate IN ('mismatch', 'unverified'))::integer AS gate_untrusted,
  pg_catalog.count(*) FILTER (WHERE v.verdict = 'local_block')::integer AS local_blocks_logged,
  pg_catalog.count(*) FILTER (WHERE v.probe_kind = 'scaffold')::integer AS scaffold_answers,
  pg_catalog.count(*) FILTER (WHERE v.probe_kind = 'scaffold' AND v.final_credit)::integer AS scaffold_recovered,
  pg_catalog.count(*) FILTER (WHERE v.opener_unedited)::integer AS opener_unedited,
  COALESCE(pg_catalog.sum(v.openers_offered), 0)::integer AS openers_offered,
  pg_catalog.max(v.rule_set) AS rule_set
FROM public.interview_sessions AS s
JOIN public.interview_probe_verdicts AS v ON v.session_id = s.id
GROUP BY s.id, v.scene_seq;

CREATE OR REPLACE FUNCTION interview_authority_private.request(
  p_action text, p_owner uuid, p_auth_session uuid, p_expires_at timestamptz, p_input jsonb
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = '' SET row_security = off AS $body$
DECLARE
  v_authority public.interview_content_authority%ROWTYPE;
  v_work public.interview_work_contracts%ROWTYPE;
  v_session public.interview_sessions%ROWTYPE;
  v_wipe public.interview_content_wipes%ROWTYPE;
  v_allowed text[];
  v_key uuid; v_draft uuid; v_generation uuid; v_session_id uuid; v_request uuid;
  v_revision bigint; v_digest bytea; v_now timestamptz; v_count bigint;
  v_state text; v_period text; v_locale text; v_ui text; v_growth boolean;
BEGIN
  -- No caller-supplied role, owner claim, session claim or JWT is installed.
  PERFORM interview_authority_private.acquire_access(p_owner,p_auth_session,p_expires_at,
    p_action IN ('open','begin_wipe'));
  v_allowed := CASE p_action
    WHEN 'open' THEN ARRAY['newWorkKey','draftId','period','conversationLocale','uiLanguage','growthOrigin']
    WHEN 'inspect' THEN ARRAY['workId']
    WHEN 'begin_wipe' THEN ARRAY['requestId','generation','scopeVersion']
    WHEN 'inspect_wipe' THEN ARRAY['requestId']
    WHEN 'reserve' THEN ARRAY['workId','generation','requestId','draftRevision','snapshotDigest',
      'draftId','period','conversationLocale','uiLanguage','growthOrigin']
    WHEN 'lookup' THEN ARRAY['workId','requestId'] ELSE NULL END;
  IF v_allowed IS NULL OR p_input IS NULL OR pg_catalog.jsonb_typeof(p_input)<>'object'
    OR EXISTS (SELECT 1 FROM pg_catalog.jsonb_object_keys(p_input) k WHERE NOT k=ANY(v_allowed))
    OR EXISTS (SELECT 1 FROM pg_catalog.unnest(v_allowed) k WHERE NOT p_input ? k) THEN
    RAISE EXCEPTION 'interview_authority_invalid_input' USING ERRCODE='22023';
  END IF;
  IF p_action IN ('open','reserve') THEN
    v_draft := (p_input->>'draftId')::uuid;
    v_period := p_input->>'period'; v_locale := p_input->>'conversationLocale';
    v_ui := p_input->>'uiLanguage';
    IF v_draft IS NULL OR v_period IS NULL OR v_period NOT IN ('infancy','school','twenties','later','work','now')
      OR v_locale IS NULL OR v_locale NOT IN ('ko','en') OR v_ui IS NULL OR v_ui NOT IN ('ko','en','es','pt','id')
      OR v_locale<>(CASE WHEN v_ui='ko' THEN 'ko' ELSE 'en' END)
      OR pg_catalog.jsonb_typeof(p_input->'growthOrigin') IS DISTINCT FROM 'boolean' THEN
      RAISE EXCEPTION 'interview_authority_invalid_identity' USING ERRCODE='22023';
    END IF;
    v_growth := (p_input->>'growthOrigin')::boolean;
  END IF;
  SELECT * INTO v_authority FROM public.interview_content_authority a WHERE a.owner_id=p_owner;

  IF p_action='open' THEN
    v_key := (p_input->>'newWorkKey')::uuid;
    IF v_key IS NULL THEN RAISE EXCEPTION 'interview_authority_invalid_input' USING ERRCODE='22023'; END IF;
    SELECT * INTO v_work FROM public.interview_work_contracts w
      WHERE w.owner_id=p_owner AND w.new_work_key=v_key FOR UPDATE;
    IF FOUND THEN
      IF (v_work.draft_id,v_work.period,v_work.conversation_locale,v_work.ui_language,v_work.growth_origin)
        IS DISTINCT FROM (v_draft,v_period,v_locale,v_ui,v_growth) THEN
        RAISE EXCEPTION 'interview_work_binding_conflict' USING ERRCODE='22023';
      END IF;
      -- Replay before cap/phase/generation checks. It never rewrites timestamps.
    ELSE
      IF v_authority.owner_id IS NOT NULL AND v_authority.phase<>'ready' THEN
        RETURN pg_catalog.jsonb_build_object('state','wipe_pending');
      END IF;
      v_session_id := pg_catalog.gen_random_uuid();
      IF NOT pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('interview_session:'||v_session_id::text,0)) THEN
        RAISE EXCEPTION 'interview_authority_busy_retry' USING ERRCODE='40001';
      END IF;
      IF EXISTS (SELECT 1 FROM public.interview_sessions s WHERE s.id=v_session_id)
        OR EXISTS (SELECT 1 FROM public.interview_session_tombstones t WHERE t.session_id=v_session_id)
        OR EXISTS (SELECT 1 FROM public.interview_work_contracts w WHERE w.session_id=v_session_id) THEN
        RAISE EXCEPTION 'interview_authority_id_collision_retry' USING ERRCODE='40001';
      END IF;
      -- All shipped INSERTs already hold this owner's SHARED key; our EXCLUSIVE
      -- key excludes invisible same-owner bucket INSERTs. Sweep can delete old
      -- rows without that key, so pre-lock every existing owner bucket NOWAIT.
      BEGIN
        PERFORM 1 FROM public.interview_session_starts c WHERE c.owner_id=p_owner
          ORDER BY c.bucket_start FOR UPDATE NOWAIT;
      EXCEPTION WHEN lock_not_available THEN
        RAISE EXCEPTION 'interview_authority_busy_retry' USING ERRCODE='40001';
      END;
      v_now := interview_authority_private.recheck_access(p_owner,p_auth_session,p_expires_at);
      SELECT COALESCE(pg_catalog.sum(c.created),0) INTO v_count FROM public.interview_session_starts c
        WHERE c.owner_id=p_owner AND c.bucket_start>=pg_catalog.date_bin(interval '10 minutes',
          v_now-interval '1 hour',timestamptz '2000-01-01 00:00:00+00');
      IF v_count>=30 THEN RETURN pg_catalog.jsonb_build_object('state','rate_limited'); END IF;
      IF v_authority.owner_id IS NULL THEN
        INSERT INTO public.interview_content_authority(owner_id) VALUES(p_owner) RETURNING * INTO v_authority;
      END IF;
      INSERT INTO public.interview_work_contracts(session_id,owner_id,new_work_key,draft_id,generation,
        period,conversation_locale,ui_language,growth_origin,created_at)
      VALUES(v_session_id,p_owner,v_key,v_draft,v_authority.generation,v_period,v_locale,v_ui,v_growth,v_now)
      RETURNING * INTO v_work;
      INSERT INTO public.interview_sessions(id,owner_id,period,locale,started_at,last_seen_at)
        VALUES(v_session_id,p_owner,v_period,v_locale,v_now,v_now);
      -- Existing AFTER INSERT trigger is the only starts increment. No upsert,
      -- exception swallowing or second session creation is permitted here.
      PERFORM interview_authority_private.recheck_access(p_owner,p_auth_session,p_expires_at);
    END IF;
  ELSIF p_action IN ('begin_wipe','inspect_wipe') THEN
    v_request := (p_input->>'requestId')::uuid;
    IF v_request IS NULL THEN RAISE EXCEPTION 'interview_authority_invalid_input' USING ERRCODE='22023'; END IF;
    SELECT * INTO v_wipe FROM public.interview_content_wipes w WHERE w.owner_id=p_owner AND w.request_id=v_request;
    IF p_action='begin_wipe' THEN
      v_generation := (p_input->>'generation')::uuid;
      IF v_generation IS NULL OR (p_input->>'scopeVersion') IS NULL
        OR (p_input->>'scopeVersion') !~ '^[a-z][a-z0-9-]{0,63}$' THEN
        RAISE EXCEPTION 'interview_authority_invalid_input' USING ERRCODE='22023';
      END IF;
      IF v_wipe.operation_id IS NOT NULL THEN
        IF v_wipe.old_generation<>v_generation OR v_wipe.scope_version<>p_input->>'scopeVersion' THEN
          RAISE EXCEPTION 'interview_wipe_binding_conflict' USING ERRCODE='22023';
        END IF;
      ELSE
        IF v_authority.owner_id IS NULL THEN RETURN pg_catalog.jsonb_build_object('state','unconfirmed'); END IF;
        IF v_authority.phase<>'ready' THEN RETURN pg_catalog.jsonb_build_object('state','wipe_pending'); END IF;
        IF v_authority.generation<>v_generation THEN
          RAISE EXCEPTION 'interview_generation_conflict' USING ERRCODE='22023';
        END IF;
        v_now := interview_authority_private.recheck_access(p_owner,p_auth_session,p_expires_at);
        INSERT INTO public.interview_content_wipes(owner_id,request_id,old_generation,new_generation,scope_version,created_at)
          VALUES(p_owner,v_request,v_generation,pg_catalog.gen_random_uuid(),p_input->>'scopeVersion',v_now)
          RETURNING * INTO v_wipe;
        UPDATE public.interview_content_authority SET generation=v_wipe.new_generation,phase='wipe_pending',
          current_wipe_id=v_wipe.operation_id,revision=revision+1 WHERE owner_id=p_owner;
        PERFORM interview_authority_private.recheck_access(p_owner,p_auth_session,p_expires_at);
      END IF;
    END IF;
    PERFORM interview_authority_private.recheck_access(p_owner,p_auth_session,p_expires_at);
    IF v_wipe.operation_id IS NULL THEN RETURN pg_catalog.jsonb_build_object('state','not_found'); END IF;
    RETURN pg_catalog.jsonb_build_object('state',v_wipe.phase,'operationId',v_wipe.operation_id,
      'requestId',v_wipe.request_id,'oldGeneration',v_wipe.old_generation,'generation',v_wipe.new_generation,
      'scopeVersion',v_wipe.scope_version,'observation',v_wipe.observation,'createdAt',v_wipe.created_at);
  ELSE
    v_session_id := (p_input->>'workId')::uuid;
    IF v_session_id IS NULL AND p_action<>'inspect' THEN
      RAISE EXCEPTION 'interview_authority_invalid_input' USING ERRCODE='22023';
    END IF;
    IF v_session_id IS NULL THEN
      PERFORM interview_authority_private.recheck_access(p_owner,p_auth_session,p_expires_at);
      IF v_authority.owner_id IS NULL THEN RETURN pg_catalog.jsonb_build_object('state','unconfirmed'); END IF;
      RETURN pg_catalog.jsonb_build_object('state',v_authority.phase,'generation',v_authority.generation,
        'revision',v_authority.revision,'writeProtocol',v_authority.write_protocol);
    END IF;
    IF p_action='reserve' THEN
      SELECT * INTO v_work FROM public.interview_work_contracts w
        WHERE w.owner_id=p_owner AND w.session_id=v_session_id FOR UPDATE;
    ELSE
      SELECT * INTO v_work FROM public.interview_work_contracts w WHERE w.owner_id=p_owner AND w.session_id=v_session_id;
    END IF;
    IF v_work.session_id IS NULL THEN RETURN pg_catalog.jsonb_build_object('state','not_found'); END IF;
  END IF;

  IF p_action='reserve' THEN
    v_generation := (p_input->>'generation')::uuid; v_request := (p_input->>'requestId')::uuid;
    IF v_generation IS NULL OR v_request IS NULL
      OR pg_catalog.jsonb_typeof(p_input->'draftRevision') IS DISTINCT FROM 'number'
      OR (p_input->>'draftRevision') !~ '^(0|[1-9][0-9]{0,15})$'
      OR (p_input->>'snapshotDigest') IS NULL OR (p_input->>'snapshotDigest') !~ '^[0-9a-f]{64}$' THEN
      RAISE EXCEPTION 'interview_authority_invalid_input' USING ERRCODE='22023';
    END IF;
    v_revision := (p_input->>'draftRevision')::bigint;
    IF v_revision>9007199254740991 THEN RAISE EXCEPTION 'interview_authority_invalid_input' USING ERRCODE='22023'; END IF;
    v_digest := pg_catalog.decode(p_input->>'snapshotDigest','hex');
    IF (v_work.generation,v_work.draft_id,v_work.period,v_work.conversation_locale,v_work.ui_language,v_work.growth_origin)
      IS DISTINCT FROM (v_generation,v_draft,v_period,v_locale,v_ui,v_growth) THEN
      RAISE EXCEPTION 'interview_work_binding_conflict' USING ERRCODE='22023';
    END IF;
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('interview_session:'||v_work.session_id::text,0));
    -- Direct DELETE holds the session row before it tries the session key. The
    -- legacy hook uses try-lock and retries, so this row wait has no cycle.
    SELECT * INTO v_session FROM public.interview_sessions s WHERE s.id=v_work.session_id FOR UPDATE;
  ELSE
    SELECT * INTO v_session FROM public.interview_sessions s WHERE s.id=v_work.session_id;
  END IF;
  v_now := interview_authority_private.recheck_access(p_owner,p_auth_session,p_expires_at);
  v_state := CASE WHEN v_work.session_state='erased' THEN 'erased'
    WHEN v_work.session_state IN ('folded','discarded') OR v_session.id IS NULL
      OR v_session.owner_id<>p_owner OR v_session.last_seen_at<=v_now-interval '6 hours'
      OR v_authority.owner_id IS NULL OR v_authority.generation<>v_work.generation THEN 'closed'
    WHEN v_authority.phase<>'ready' THEN 'wipe_pending'
    WHEN v_session.ended_at IS NOT NULL OR v_work.session_state='ended' THEN 'ended' ELSE 'ready' END;
  IF p_action='lookup' THEN
    v_request := (p_input->>'requestId')::uuid;
    IF v_request IS NULL THEN RAISE EXCEPTION 'interview_authority_invalid_input' USING ERRCODE='22023'; END IF;
    IF v_work.save_request_id IS DISTINCT FROM v_request THEN RETURN pg_catalog.jsonb_build_object('state','not_found'); END IF;
  ELSIF p_action='reserve' AND v_state IN ('ready','ended') THEN
    IF v_work.save_state='reserved' THEN
      IF (v_work.save_request_id,v_work.draft_revision,v_work.snapshot_digest)
        IS DISTINCT FROM (v_request,v_revision,v_digest) THEN
        RAISE EXCEPTION 'interview_save_binding_conflict' USING ERRCODE='22023';
      END IF;
    ELSE
      UPDATE public.interview_work_contracts SET save_state='reserved',save_request_id=v_request,
        draft_revision=v_revision,snapshot_digest=v_digest WHERE session_id=v_work.session_id RETURNING * INTO v_work;
    END IF;
    PERFORM interview_authority_private.recheck_access(p_owner,p_auth_session,p_expires_at);
  END IF;
  RETURN pg_catalog.jsonb_build_object('state',CASE WHEN p_action IN ('reserve','lookup')
      AND v_state IN ('ready','ended') AND v_work.save_state='reserved' THEN 'reserved' ELSE v_state END,
    'workState',v_state,'workId',v_work.session_id,'newWorkKey',v_work.new_work_key,
    'draftId',v_work.draft_id,'generation',v_work.generation,'ruleSet',v_work.rule_set,'period',v_work.period,
    'conversationLocale',v_work.conversation_locale,'uiLanguage',v_work.ui_language,'growthOrigin',v_work.growth_origin,
    'createdAt',v_work.created_at,'saveState',v_work.save_state,'saveRequestId',v_work.save_request_id,
    'draftRevision',v_work.draft_revision,'writeProtocol',v_authority.write_protocol);
END;
$body$;

DROP FUNCTION interview_authority_private.packet_fields(jsonb,text[]),
 interview_authority_private.packet_integer(jsonb,bigint),
 interview_authority_private.packet_uuid(jsonb),
 interview_authority_private.packet_frame(jsonb),
 interview_authority_private.packet_compact(jsonb),
 interview_authority_private.finalize_packet(uuid,jsonb),
 interview_authority_private.commit_core(uuid,text,uuid,uuid,jsonb,boolean),
 public.assert_interview_legacy_write(uuid,uuid),
 public.guard_interview_legacy_record_write(),
 public.guard_interview_legacy_coverage_write(),
 interview_authority_private.guard_work_identity(),
 interview_authority_private.guard_protocol(),
 interview_authority_private.save_observation(uuid,uuid,uuid),
 interview_authority_private.finalize(uuid,uuid,timestamptz,jsonb,jsonb),
 public.finalize_interview_save(uuid,uuid,timestamptz,jsonb,jsonb),
 interview_authority_private.verdict_core(boolean,uuid,timestamptz,uuid,uuid,uuid,uuid,text,text,integer,integer,integer,text,text,text,text,text,boolean,text,text,boolean,integer,integer,text),
 interview_authority_private.verdict_request(uuid,uuid,timestamptz,uuid,uuid,uuid,text,text,integer,integer,integer,text,text,text,text,text,boolean,text,text,boolean,integer,integer,text),
 public.record_interview_work_verdict(uuid,uuid,timestamptz,uuid,uuid,uuid,text,text,integer,integer,integer,text,text,text,text,text,boolean,text,text,boolean,integer,integer,text),
 interview_authority_private.erase_work(uuid,uuid,text),
 interview_authority_private.content_erasure(),
 interview_authority_private.account_erasure(),
 public.interview_session_rule_for_metrics(uuid),
 interview_authority_private.lifecycle(uuid,uuid,timestamptz,uuid,uuid,text,text,integer,integer),
 public.close_interview_work(uuid,uuid,timestamptz,uuid,uuid,text,integer,integer),
 public.discard_interview_work(uuid,uuid,timestamptz,uuid,uuid);
ALTER TABLE public.interview_work_contracts DROP CONSTRAINT interview_work_contracts_save_binding;
ALTER TABLE public.interview_work_contracts DROP CONSTRAINT interview_work_contracts_rule_set_check;
ALTER TABLE public.interview_work_contracts ADD CONSTRAINT interview_work_contracts_rule_set_check CHECK(rule_set='r0');
ALTER TABLE public.interview_work_contracts DROP CONSTRAINT interview_work_contracts_save_state_check;
ALTER TABLE public.interview_work_contracts ADD CONSTRAINT interview_work_contracts_save_state_check CHECK(save_state IN ('none','reserved'));
ALTER TABLE public.interview_work_contracts ADD CONSTRAINT interview_work_contracts_check1 CHECK (
 (save_state='none' AND save_request_id IS NULL AND draft_revision IS NULL AND snapshot_digest IS NULL)
 OR (save_state='reserved' AND save_request_id IS NOT NULL AND draft_revision IS NOT NULL
  AND (snapshot_digest IS NOT NULL OR session_state='erased')));
ALTER TABLE public.interview_work_contracts DROP COLUMN record_id,DROP COLUMN commit_receipt,DROP COLUMN erased_at;
COMMIT;
