-- rollback/0225_down.sql -- 0225(인터뷰 대화록 · 판정 원장)의 기능을 끈다. 손으로, 사고 중에만 돌린다.
--
-- 번호 순서 적용에 들어가지 않는다(db/migrations/*.sql 은 하위 폴더를 읽지 않는다).
-- ⚠ 단독 실행 전용. 첫 문장이 표 잠금이라 트랜잭션 밖에서 돌리면 그 자리에서 멈춘다. 이렇게만 돌린다:
--       psql -X -v ON_ERROR_STOP=1 --single-transaction -f db/migrations/rollback/0225_down.sql
--   원장 행(supabase_migrations)은 지우지 않는다. 되돌린 사실은 HANDOFF 와 사건 기록에 남긴다.
--   db/tests/interview_transcript_ledger_rollback.sql 이 이 파일을 트랜잭션 안에서 돌려 보고 되감는다.
--
-- 무엇을 하나 (설계 docs/design/d6-verdict-ledger-261007.md 5.3, 데이터 보존 롤백).
--   0. 새 표 열 개를 잠근다. 아래가 끝날 때까지 다른 쓰기가 끼어들지 못한다.
--   1. 저장하지 않은 세션을 지금 전부 접는다(outcome left). 기록 함수가 사라지면 그 세션은 더 자라지
--      않으므로 6시간을 기다릴 이유가 없다. 접으면서 그 세션 이름으로 온 감사 id 전부의 해시를 비우고
--      tombstone 을 남긴다(D2 흔적 0, 게이트 1회차 D6-06 · D6-61).
--   2. 진입점을 지운다: 프록시 writer 셋(판정 · 카드 제안 · 응답 블록 id), 화면 함수 넷(닫기 · 버리기 ·
--      담기 · 카드 결정), 본인 판정 내보내기, 뷰 둘, 그리고 진입점만 쓰던 도우미 둘(본문 렌더러 · 계정
--      울타리)과 세션 생성 셈 트리거. interview_coverage 감소 금지 트리거도 내린다 - 옛 화면의 절대값
--      칸 쓰기(클라이언트 경로)가 돌아오기 때문이다. 화면 · 프록시는 함수가 없으면 쓰기를 건너뛰고 옛
--      경로(클라이언트 칸 쓰기 · recordSevenTiers)로 돌아간다.
--   3. 남긴 표의 수명주기 장치는 **남긴다**(D6-06): 저장한 세션 · 대화록 · 카드 · 블록 id 가 표에 남아
--      있는 동안, 콘텐츠 삭제 · 보관 만료 · 계정 삭제가 그 행과 감사 해시를 계속 정리해야 한다.
--        fold_interview_session · erase_audit_hashes · interview_int_array_add (접기),
--        sweep_interview_sessions · prune_interview_ledgers 와 그 pg_cron 예약 (보관 만료),
--        interview_record_erasure · ai_context_block_record_erasure (레코드 삭제),
--        interview_verdict_erasure (판정 행 삭제 = 감사 해시 비우기),
--        period_card_remove · delete_period_card · period_card_delete_guard (승인 카드 지우기).
--      delete_period_card 는 authenticated 가 부를 수 있는 채로 남는다 - 자기 카드를 지우는 길이다.
--   4. 표 열 개와 그 행은 **남긴다.** 승인된 시기 카드(그때의 나 문장)와 대화록은 사용자 데이터다.
--      표를 지우는 것은 별도 파괴 단계이고, 그 전에 내보내야 한다. 0226 의 등록부 행도 그대로 둔다
--      (표가 남아 있으므로 계정 삭제 · 데이터 삭제가 계속 지운다).
--   5. 사후 조건: 진입점 0 · 수명주기 장치 그대로 · 저장 안 한 세션 0 · 접은 세션의 감사 해시 0 ·
--      저장한 세션 · 대화록 · 턴 · 카드 · 블록 id 행 수 그대로.
--
-- 다시 적용: 0225 는 IF NOT EXISTS · OR REPLACE 로 쓰여 있어 이 롤백 뒤에 그대로 다시 적용된다.
-- 순서: 0225 를 먼저 내리고 0218 을 내린다(0218_down 이 표식을 tags 로 되돌리면 담기의 확인이 실패한다).

LOCK TABLE public.interview_sessions, public.interview_probe_verdicts, public.interview_transcripts,
  public.interview_transcript_turns, public.period_card_proposals, public.interview_unsaved_rollup,
  public.ai_audit_context_blocks, public.interview_session_audit_ids, public.interview_session_tombstones,
  public.interview_session_starts IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE rollback_0225_counts ON COMMIT DROP AS
SELECT 'interview_sessions' AS t, count(*) AS n FROM public.interview_sessions WHERE committed_at IS NOT NULL
UNION ALL SELECT 'interview_transcripts', count(*) FROM public.interview_transcripts
UNION ALL SELECT 'interview_transcript_turns', count(*) FROM public.interview_transcript_turns
UNION ALL SELECT 'period_card_proposals', count(*) FROM public.period_card_proposals
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
DROP FUNCTION IF EXISTS public.record_period_card_proposal(uuid, uuid, text, text, text, text, text, jsonb, text[], integer);
DROP FUNCTION IF EXISTS public.decide_period_card(uuid, text, text, text, boolean);
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
                'commit_interview_session', 'record_period_card_proposal', 'decide_period_card',
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
     OR to_regprocedure('public.period_card_remove(uuid,uuid[])') IS NULL
     OR to_regprocedure('public.delete_period_card(uuid)') IS NULL
     OR (SELECT pg_catalog.count(*) FROM pg_catalog.pg_trigger AS g
          WHERE NOT g.tgisinternal
            AND (g.tgrelid, g.tgname) IN (
              ('public.records'::regclass, 'interview_record_erasure'),
              ('public.records'::regclass, 'ai_context_block_record_erasure'),
              ('public.interview_probe_verdicts'::regclass, 'interview_verdict_erasure'),
              ('public.period_card_proposals'::regclass, 'period_card_delete_guard'))) <> 4 THEN
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
