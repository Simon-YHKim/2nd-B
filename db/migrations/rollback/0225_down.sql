-- rollback/0225_down.sql -- 0225(인터뷰 대화록 · 판정 원장)을 되돌린다. 손으로, 사고 중에만 돌린다.
--
-- 번호 순서 적용에 들어가지 않는다(db/migrations/*.sql 은 하위 폴더를 읽지 않는다).
-- ⚠ 단독 실행 전용. 첫 문장이 표 잠금이라 트랜잭션 밖에서 돌리면 그 자리에서 멈춘다. 이렇게만 돌린다:
--       psql -X -v ON_ERROR_STOP=1 --single-transaction -f db/migrations/rollback/0225_down.sql
--   원장 행(supabase_migrations)은 지우지 않는다. 되돌린 사실은 HANDOFF 와 사건 기록에 남긴다.
--
-- 무엇을 하나 (설계 docs/design/d6-verdict-ledger-261007.md 5.3, 데이터 보존 롤백).
--   0. 새 표 일곱 개를 잠근다. 아래가 끝날 때까지 다른 쓰기가 끼어들지 못한다.
--   1. 예약(sweep-interview-sessions · prune-interview-ledgers)을 내린다(pg_cron 이 있을 때).
--   2. 트리거 둘(records 삭제 · interview_coverage 감소 금지)을 내린다. 레코드를 지워도 더는 접지 않는다.
--   3. 0225 의 함수 열여섯 개 · 뷰 둘을 지운다. 화면 · 프록시는 함수가 없으면 쓰기를 건너뛰고
--      옛 경로(클라이언트 칸 쓰기 · recordSevenTiers)로 돌아간다.
--   4. 표 일곱 개와 그 행은 **남긴다.** 승인된 시기 카드(그때의 나 문장)와 대화록은 사용자 데이터다.
--      표를 지우는 것은 별도 파괴 단계이고, 그 전에 내보내야 한다. 0226 의 등록부 행도 그대로 둔다
--      (표가 남아 있으므로 계정 삭제 · 데이터 삭제가 계속 지운다).
--   5. 사후 조건: 함수 · 트리거 · 뷰 0, 표의 행 수는 그대로.
--
-- 다시 적용: 0225 는 IF NOT EXISTS · OR REPLACE 로 쓰여 있어 이 롤백 뒤에 그대로 다시 적용된다.
-- 순서: 0225 를 먼저 내리고 0218 을 내린다(0218_down 이 표식을 tags 로 되돌리면 담기의 확인이 실패한다).

LOCK TABLE public.interview_sessions, public.interview_probe_verdicts, public.interview_transcripts,
  public.interview_transcript_turns, public.period_card_proposals, public.interview_unsaved_rollup,
  public.ai_audit_context_blocks IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE rollback_0225_counts ON COMMIT DROP AS
SELECT 'interview_sessions' AS t, count(*) AS n FROM public.interview_sessions
UNION ALL SELECT 'interview_probe_verdicts', count(*) FROM public.interview_probe_verdicts
UNION ALL SELECT 'interview_transcripts', count(*) FROM public.interview_transcripts
UNION ALL SELECT 'interview_transcript_turns', count(*) FROM public.interview_transcript_turns
UNION ALL SELECT 'period_card_proposals', count(*) FROM public.period_card_proposals
UNION ALL SELECT 'interview_unsaved_rollup', count(*) FROM public.interview_unsaved_rollup
UNION ALL SELECT 'ai_audit_context_blocks', count(*) FROM public.ai_audit_context_blocks;

DO $unschedule$
DECLARE
  v_job_id bigint;
  v_name text;
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    FOREACH v_name IN ARRAY ARRAY['sweep-interview-sessions', 'prune-interview-ledgers'] LOOP
      FOR v_job_id IN EXECUTE 'SELECT jobid FROM cron.job WHERE jobname = $1' USING v_name LOOP
        EXECUTE 'SELECT cron.unschedule($1)' USING v_job_id;
      END LOOP;
    END LOOP;
  END IF;
END
$unschedule$;

DROP TRIGGER IF EXISTS interview_record_erasure ON public.records;
DROP TRIGGER IF EXISTS trg_interview_coverage_no_decrease ON public.interview_coverage;

DROP VIEW IF EXISTS public.record_layer_inferences;
DROP VIEW IF EXISTS public.interview_scene_metrics;

DROP FUNCTION IF EXISTS public.record_interview_probe_verdict(uuid, uuid, uuid, text, text, integer, integer, integer, text, text, text, text, text, boolean, text, text, boolean, integer, integer, text);
DROP FUNCTION IF EXISTS public.close_interview_session(uuid, text, text, text, integer, integer);
DROP FUNCTION IF EXISTS public.discard_interview_session(uuid);
DROP FUNCTION IF EXISTS public.commit_interview_session(uuid, uuid, jsonb, boolean);
DROP FUNCTION IF EXISTS public.sweep_interview_sessions(integer);
DROP FUNCTION IF EXISTS public.record_period_card_proposal(uuid, uuid, text, text, text, text, text, jsonb, text[], integer);
DROP FUNCTION IF EXISTS public.decide_period_card(uuid, text, text, text, boolean);
DROP FUNCTION IF EXISTS public.record_context_blocks(uuid, text, text, text[], text[]);
DROP FUNCTION IF EXISTS public.export_my_interview_judgements(timestamptz);
DROP FUNCTION IF EXISTS public.prune_interview_ledgers();
DROP FUNCTION IF EXISTS public.interview_record_erasure();
DROP FUNCTION IF EXISTS public.interview_coverage_no_decrease();
DROP FUNCTION IF EXISTS public.fold_interview_session(uuid, text);
DROP FUNCTION IF EXISTS public.erase_audit_hashes(uuid[], text);
DROP FUNCTION IF EXISTS public.interview_transcript_body(text, jsonb);
DROP FUNCTION IF EXISTS public.interview_int_array_add(integer[], integer[]);

DO $postcondition$
DECLARE
  v_row record;
  v_now bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS p JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.proname IN (
                'record_interview_probe_verdict', 'close_interview_session', 'discard_interview_session',
                'commit_interview_session', 'sweep_interview_sessions', 'record_period_card_proposal',
                'decide_period_card', 'record_context_blocks', 'export_my_interview_judgements',
                'prune_interview_ledgers', 'interview_record_erasure', 'interview_coverage_no_decrease',
                'fold_interview_session', 'erase_audit_hashes', 'interview_transcript_body', 'interview_int_array_add'))
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_trigger
                 WHERE tgname IN ('interview_record_erasure', 'trg_interview_coverage_no_decrease') AND NOT tgisinternal)
     OR to_regclass('public.interview_scene_metrics') IS NOT NULL
     OR to_regclass('public.record_layer_inferences') IS NOT NULL THEN
    RAISE EXCEPTION 'rollback 0225: a function, trigger or view is still present';
  END IF;
  FOR v_row IN SELECT * FROM pg_temp.rollback_0225_counts LOOP
    EXECUTE pg_catalog.format('SELECT count(*) FROM public.%I', v_row.t) INTO v_now;
    IF v_now <> v_row.n THEN
      RAISE EXCEPTION 'rollback 0225: % changed from % to % rows', v_row.t, v_row.n, v_now;
    END IF;
  END LOOP;
END
$postcondition$;
