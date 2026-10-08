\set ON_ERROR_STOP on

-- rollback/0225_down.sql -- 0225(인터뷰 대화록 · 판정 원장)의 기능을 끈다. 손으로, 사고 중에만 돌린다.
--
-- 번호 순서 적용에 들어가지 않는다(db/migrations/*.sql 은 하위 폴더를 읽지 않는다).
-- ⚠ 단독 실행 전용. 첫 문장이 표 잠금이라 트랜잭션 밖에서 돌리면 그 자리에서 멈춘다. 이렇게만 돌린다:
--       psql -X -v ON_ERROR_STOP=1 --single-transaction -f db/migrations/rollback/0225_down.sql
--   원장 행(supabase_migrations)은 지우지 않는다. 되돌린 사실은 HANDOFF 와 사건 기록에 남긴다.
--   db/tests/interview_transcript_ledger_rollback.sql 이 이 파일을 트랜잭션 안에서 돌려 보고 되감는다.
--
-- 무엇을 하나 (설계 docs/design/d6-verdict-ledger-261007.md 5.3, 데이터 보존 롤백).
--   0. 새 표 아홉 개를 잠근다. 아래가 끝날 때까지 다른 쓰기가 끼어들지 못한다.
--   1. 저장하지 않은 세션을 지금 전부 접는다(outcome left). 기록 함수가 사라지면 그 세션은 더 자라지
--      않으므로 6시간을 기다릴 이유가 없다. 접으면서 그 세션 이름으로 온 감사 id 전부의 해시를 비우고
--      tombstone 을 남긴다(D2 흔적 0, 게이트 1회차 D6-06 · D6-61).
--   2. 진입점을 지운다: 프록시 writer 둘(판정 · 응답 블록 id), 화면 함수 셋(닫기 · 버리기 ·
--      담기), 본인 판정 내보내기, 뷰 둘, 그리고 진입점만 쓰던 도우미 둘(본문 렌더러 · 계정
--      울타리)과 세션 생성 셈 트리거. interview_coverage 감소 금지 트리거도 내린다 - 옛 화면의 절대값
--      칸 쓰기(클라이언트 경로)가 돌아오기 때문이다. 화면 · 프록시는 함수가 없으면 쓰기를 건너뛰고 옛
--      경로(클라이언트 칸 쓰기 · recordSevenTiers)로 돌아간다.
--   3. 남긴 표의 수명주기 장치는 **남긴다**(D6-06): 저장한 세션 · 대화록 · 블록 id 가 표에 남아
--      있는 동안, 콘텐츠 삭제 · 보관 만료 · 계정 삭제가 그 행과 감사 해시를 계속 정리해야 한다.
--        fold_interview_session · erase_audit_hashes · interview_int_array_add (접기),
--        sweep_interview_sessions · prune_interview_ledgers 와 그 pg_cron 예약 (보관 만료),
--        interview_record_erasure · ai_context_block_record_erasure (레코드 삭제),
--        interview_verdict_erasure (판정 행 삭제 = 감사 해시 비우기),
--        interview_session_erasure · interview_account_erasure (세션 · 계정 삭제 전 감사 해시 비우기).
--        records.interview_ai_hold · guard_interview_record_hold (원문 수명 동안 hold 유지).
--   4. 표 아홉 개와 그 행은 **남긴다.** 대화록은 사용자 데이터다.
--      표를 지우는 것은 별도 파괴 단계이고, 그 전에 내보내야 한다. 0226 의 등록부 행도 그대로 둔다
--      (표가 남아 있으므로 계정 삭제 · 데이터 삭제가 계속 지운다).
--   5. 사후 조건: 진입점 0 · 수명주기 장치 그대로 · 저장 안 한 세션 0 · 접은 세션의 감사 해시 0 ·
--      저장한 세션 · 대화록 · 턴 · 블록 id 행 수 그대로.
--   6. Polaris 근거 두 함수는 0218 본문 + 레코드 hold 제외와 0195 권한으로 남긴다(D6R3-53).
--
-- 다시 적용: 0225 는 IF NOT EXISTS · OR REPLACE 로 쓰여 있어 이 롤백 뒤에 그대로 다시 적용된다.
-- 순서: 0225 를 먼저 내리고 0218 을 내린다(0218_down 이 표식을 tags 로 되돌리면 담기의 확인이 실패한다).

LOCK TABLE public.interview_sessions, public.interview_probe_verdicts, public.interview_transcripts,
  public.interview_transcript_turns, public.interview_unsaved_rollup,
  public.ai_audit_context_blocks, public.interview_session_audit_ids, public.interview_session_tombstones,
  public.interview_session_starts IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE rollback_0225_counts ON COMMIT DROP AS
SELECT 'interview_sessions' AS t, count(*) AS n FROM public.interview_sessions WHERE committed_at IS NOT NULL
UNION ALL SELECT 'interview_transcripts', count(*) FROM public.interview_transcripts
UNION ALL SELECT 'interview_transcript_turns', count(*) FROM public.interview_transcript_turns
UNION ALL SELECT 'ai_audit_context_blocks', count(*) FROM public.ai_audit_context_blocks;

-- 접을 세션의 감사 id(판정 행의 현재 · 앞선 호출, 거절한 호출). 사후 조건이 해시가 비었는지 본다.
CREATE TEMP TABLE rollback_0225_unsaved_audit ON COMMIT DROP AS
SELECT i.audit_id
  FROM public.interview_session_audit_ids AS i
  JOIN public.interview_sessions AS s ON s.id = i.session_id
 WHERE s.committed_at IS NULL
UNION
SELECT v.audit_id
  FROM public.interview_probe_verdicts AS v
  JOIN public.interview_sessions AS s ON s.id = v.session_id
 WHERE s.committed_at IS NULL AND v.audit_id IS NOT NULL
UNION
SELECT pg_catalog.unnest(v.prior_audit_ids)
  FROM public.interview_probe_verdicts AS v
  JOIN public.interview_sessions AS s ON s.id = v.session_id
 WHERE s.committed_at IS NULL;

DO $fold_unsaved$
DECLARE
  v_id uuid;
BEGIN
  FOR v_id IN SELECT s.id FROM public.interview_sessions AS s WHERE s.committed_at IS NULL ORDER BY s.id LOOP
    PERFORM public.fold_interview_session(v_id, 'left');
  END LOOP;
END
$fold_unsaved$;

DROP TRIGGER IF EXISTS trg_interview_coverage_no_decrease ON public.interview_coverage;
DROP TRIGGER IF EXISTS interview_session_count_start ON public.interview_sessions;

DROP VIEW IF EXISTS public.record_layer_inferences;
DROP VIEW IF EXISTS public.interview_scene_metrics;

DROP FUNCTION IF EXISTS public.record_interview_probe_verdict(uuid, uuid, uuid, text, text, integer, integer, integer, text, text, text, text, text, boolean, text, text, boolean, integer, integer, text);
DROP FUNCTION IF EXISTS public.close_interview_session(uuid, text, text, text, integer, integer);
DROP FUNCTION IF EXISTS public.discard_interview_session(uuid);
DROP FUNCTION IF EXISTS public.commit_interview_session(uuid, uuid, jsonb, boolean);
DROP FUNCTION IF EXISTS public.record_context_blocks(uuid, text, text, text[], text[]);
DROP FUNCTION IF EXISTS public.export_my_interview_judgements(timestamptz);
DROP FUNCTION IF EXISTS public.interview_coverage_no_decrease();
DROP FUNCTION IF EXISTS public.interview_session_count_start();
DROP FUNCTION IF EXISTS public.interview_account_writable(uuid);
DROP FUNCTION IF EXISTS public.interview_transcript_body(text, jsonb);

DO $postcondition$
DECLARE
  v_row record;
  v_now bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS p JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.proname IN (
                'record_interview_probe_verdict', 'close_interview_session', 'discard_interview_session',
                'commit_interview_session',
                'record_context_blocks', 'export_my_interview_judgements', 'interview_coverage_no_decrease',
                'interview_session_count_start', 'interview_account_writable', 'interview_transcript_body'))
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_trigger
                 WHERE tgname IN ('trg_interview_coverage_no_decrease', 'interview_session_count_start')
                   AND NOT tgisinternal)
     OR to_regclass('public.interview_scene_metrics') IS NOT NULL
     OR to_regclass('public.record_layer_inferences') IS NOT NULL THEN
    RAISE EXCEPTION 'rollback 0225: an entry point, trigger or view is still present';
  END IF;

  IF to_regprocedure('public.fold_interview_session(uuid,text)') IS NULL
     OR to_regprocedure('public.erase_audit_hashes(uuid,uuid[],text)') IS NULL
     OR to_regprocedure('public.interview_int_array_add(integer[],integer[])') IS NULL
     OR to_regprocedure('public.sweep_interview_sessions(integer)') IS NULL
     OR to_regprocedure('public.prune_interview_ledgers()') IS NULL
     OR (SELECT pg_catalog.count(*) FROM pg_catalog.pg_trigger AS g
          WHERE NOT g.tgisinternal
            AND (g.tgrelid, g.tgname) IN (
              ('public.records'::regclass, 'guard_interview_record_hold'),
              ('public.records'::regclass, 'interview_record_erasure'),
              ('public.records'::regclass, 'ai_context_block_record_erasure'),
              ('public.interview_probe_verdicts'::regclass, 'interview_verdict_erasure'),
              ('public.interview_sessions'::regclass, 'interview_session_erasure'),
              ('auth.users'::regclass, 'interview_account_erasure'),
              ('public.users'::regclass, 'interview_account_erasure'))) <> 7 THEN
    RAISE EXCEPTION 'rollback 0225: a lifecycle function or trigger for the kept tables is missing';
  END IF;

  IF EXISTS (SELECT 1 FROM public.interview_sessions WHERE committed_at IS NULL) THEN
    RAISE EXCEPTION 'rollback 0225: an unsaved session was not folded';
  END IF;
  IF EXISTS (SELECT 1 FROM public.ai_audit_log AS a
               JOIN pg_temp.rollback_0225_unsaved_audit AS u ON u.audit_id = a.id
              WHERE a.prompt_hash <> '' OR a.output_hash <> '') THEN
    RAISE EXCEPTION 'rollback 0225: a folded session kept an audit hash';
  END IF;

  FOR v_row IN SELECT * FROM pg_temp.rollback_0225_counts LOOP
    IF v_row.t = 'interview_sessions' THEN
      SELECT count(*) INTO v_now FROM public.interview_sessions WHERE committed_at IS NOT NULL;
    ELSE
      EXECUTE pg_catalog.format('SELECT count(*) FROM public.%I', v_row.t) INTO v_now;
    END IF;
    IF v_now <> v_row.n THEN
      RAISE EXCEPTION 'rollback 0225: % changed from % to % rows', v_row.t, v_row.n, v_now;
    END IF;
  END LOOP;
END
$postcondition$;

-- Keep 0218's Polaris definitions plus the record hold fence and 0195 privileges.
CREATE OR REPLACE FUNCTION public.reserve_polaris_generation(p_user_id uuid, p_key text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_row public.polaris_generations%ROWTYPE;
  v_week text := to_char(now() AT TIME ZONE 'Asia/Seoul', 'IYYY-"W"IW');
  v_month text := to_char(now() AT TIME ZONE 'Asia/Seoul', 'YYYY-MM');
  v_spend text; v_tier text; v_cap int; v_count int; v_id uuid; v_evidence jsonb;
  v_credit jsonb; v_entry_ids uuid[] := '{}';
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'owner_required' USING ERRCODE='42501';
  END IF;
  PERFORM public.assert_polaris_account_active(p_user_id);
  IF NOT COALESCE((SELECT enabled FROM public.polaris_generation_config),false) THEN
    RAISE EXCEPTION 'polaris_unavailable';
  END IF;
  IF p_key IS NULL OR length(p_key) NOT BETWEEN 8 AND 120 THEN RAISE EXCEPTION 'invalid_key'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('polaris:' || p_user_id::text));
  -- Serialize with the existing reasoning reserve path as well.
  PERFORM pg_advisory_xact_lock(hashtext('reasoning_run:' || p_user_id::text));
  -- Recovery refunds the ORIGINAL bucket. Late provider settlement is rejected
  -- by its status check, so it can neither save nor charge after recovery.
  FOR v_row IN SELECT * FROM public.polaris_generations WHERE user_id=p_user_id
    AND status IN ('reserved','running') AND created_at < now() - interval '15 minutes' FOR UPDATE
  LOOP
    IF v_row.spend IN ('base','credit') THEN
      PERFORM public.refund_polaris_spend(p_user_id,v_row.id);
    END IF;
    UPDATE public.polaris_generations SET status='failed' WHERE id=v_row.id;
  END LOOP;
  SELECT * INTO v_row FROM public.polaris_generations WHERE user_id=p_user_id AND request_key=p_key;
  IF FOUND THEN RETURN jsonb_build_object('generation_id',v_row.id,'status',v_row.status); END IF;
  IF EXISTS (SELECT 1 FROM public.polaris_generations WHERE user_id=p_user_id AND status IN ('reserved','running')) THEN
    RAISE EXCEPTION 'polaris_generation_active';
  END IF;
  -- Store content hashes, never a second permanent copy of interview text.
  -- Every selected record is included in the bounded server-built prompt.
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',r.id,'domain',r.audit_period,
      'body_hash',encode(sha256(convert_to(r.body,'UTF8')),'hex'))
      ORDER BY r.created_at DESC,r.id), '[]'::jsonb)
    INTO v_evidence FROM (SELECT id,audit_period,body,created_at,
      row_number() OVER (PARTITION BY audit_period ORDER BY created_at DESC,id) AS domain_rank
      FROM public.records WHERE user_id=p_user_id
      AND kind='audit_response' AND system_tags @> ARRAY['interview']::text[] AND length(trim(body))>0
      AND NOT interview_ai_hold
      AND audit_period IN ('infancy','school','twenties','later','work','now')) r
    WHERE r.domain_rank <= 3;
  IF jsonb_array_length(v_evidence)=0 THEN RAISE EXCEPTION 'polaris_no_evidence'; END IF;
  IF (SELECT count(*) FROM public.polaris_generations WHERE user_id=p_user_id AND spend='intro'
      AND status IN ('reserved','running','completed')) < 2 THEN
    v_spend := 'intro';
  ELSE
    v_tier := public.effective_subscription_tier(p_user_id);
    v_cap := CASE COALESCE(v_tier,'free') WHEN 'brain' THEN NULL WHEN 'cortex' THEN 7 WHEN 'soma' THEN 7 ELSE 2 END;
    IF v_cap IS NULL THEN v_spend := 'none';
    ELSE
      INSERT INTO public.usage_counters AS uc(user_id,month_bucket,reasoning_used) VALUES(p_user_id,v_week,1)
      ON CONFLICT(user_id,month_bucket) DO UPDATE SET reasoning_used=uc.reasoning_used+1,updated_at=now()
        WHERE uc.reasoning_used<v_cap RETURNING reasoning_used INTO v_count;
      IF v_count IS NOT NULL THEN v_spend := 'base';
      ELSE
        BEGIN
          v_credit := public.spend_credits(p_user_id,1,'reasoning','polaris:'||p_key);
        EXCEPTION WHEN sqlstate 'X0001' OR sqlstate '23503' THEN
          RAISE EXCEPTION 'polaris_limit_exceeded';
        END;
        SELECT ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(v_credit->'entry_ids')) INTO v_entry_ids;
        INSERT INTO public.usage_counters AS uc(user_id,month_bucket,reasoning_used) VALUES(p_user_id,v_week,1)
        ON CONFLICT(user_id,month_bucket) DO UPDATE SET reasoning_used=uc.reasoning_used+1,updated_at=now();
        v_spend := 'credit';
      END IF;
    END IF;
  END IF;
  INSERT INTO public.polaris_generations(user_id,request_key,status,spend,week_bucket,month_bucket,evidence,credit_entry_ids)
    VALUES(p_user_id,p_key,'reserved',v_spend,v_week,v_month,v_evidence,v_entry_ids) RETURNING id INTO v_id;
  RETURN jsonb_build_object('generation_id',v_id,'status','reserved');
END $$;

CREATE OR REPLACE FUNCTION public.polaris_evidence_snapshot(p_user_id uuid,p_evidence jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_record record; v_result jsonb := '[]'; v_text text;
BEGIN
  IF jsonb_typeof(p_evidence) IS DISTINCT FROM 'array' OR jsonb_array_length(p_evidence) NOT BETWEEN 1 AND 18 THEN
    RAISE EXCEPTION 'polaris_evidence_changed';
  END IF;
  FOR v_record IN
    SELECT r.id,r.audit_period,r.body FROM jsonb_array_elements(p_evidence) WITH ORDINALITY e(item,position)
    JOIN public.records r ON r.id::text=e.item->>'id' AND r.user_id=p_user_id
      AND r.audit_period=e.item->>'domain' AND r.kind='audit_response'
      AND r.system_tags @> ARRAY['interview']::text[]
      AND NOT r.interview_ai_hold
      AND encode(sha256(convert_to(r.body,'UTF8')),'hex')=e.item->>'body_hash'
    ORDER BY e.position FOR SHARE OF r
  LOOP
    v_text := trim(v_record.body);
    IF length(v_text)>290 THEN
      v_text := left(v_text,94)||' … '||substring(v_text FROM greatest(length(v_text)/2-47,1) FOR 94)||' … '||right(v_text,94);
    END IF;
    v_result := v_result||jsonb_build_array(jsonb_build_object('id',v_record.id,'domain',v_record.audit_period,'excerpt',v_text));
  END LOOP;
  IF jsonb_array_length(v_result)<>jsonb_array_length(p_evidence) THEN RAISE EXCEPTION 'polaris_evidence_changed'; END IF;
  RETURN v_result;
END $$;

REVOKE ALL ON FUNCTION public.reserve_polaris_generation(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_polaris_generation(uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.polaris_evidence_snapshot(uuid,jsonb) FROM PUBLIC, anon, authenticated, service_role;
