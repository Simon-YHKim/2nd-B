-- rollback/0220_down.sql
--
-- NOT part of the numbered apply sequence. `db/migrations/*.sql` is a
-- non-recursive glob, so this file in a subdirectory is never picked up.
-- Run it BY HAND and only deliberately (psql -1 로 한 트랜잭션에).
--
-- 0220(인터뷰 판정 원장)과 0229(그 등록부 행)를 함께 되돌린다.
--
-- ⚠ 순서를 지킬 것. 이 파일은 마지막 단계다.
--   1. openai-proxy 를 원장을 쓰지 않는 판으로 되돌려 배포한다. 그대로 두어도 응답은 막히지
--      않지만(쓰기 실패는 fail-soft) 판정 호출마다 실패 로그가 남는다.
--   2. 앱은 그대로 둬도 된다. 함수가 없으면 '담기' 가 예전 클라이언트 경로(addCoverage)로
--      돌아가고(src/lib/interview/session-ledger.ts), 세션 닫기는 조용히 건너뛴다.
--   3. 그다음에 이 파일을 돌린다.
--
-- 무엇을 잃나: 판정 원장 · 세션 행(숫자 · 열거값, 원문 없음). 밝기의 재료인
-- interview_coverage(0143)의 칸은 그대로 남으므로 별 밝기는 바뀌지 않는다. 트리거만 빠져서
-- 칸을 줄이는 UPDATE 가 다시 가능해진다(0220 이전 상태).
--
-- 등록부: interview_sessions 행을 지운다. 표가 없는데 등록부 행이 남으면 콘텐츠 삭제 영수증의
-- '남긴 것' 묶음이 없는 표 하나를 더 세고, 0189 의 적용 시점 검사(등록부가 실재하는 열을
-- 가리키는가)를 다시 돌릴 때 멈춘다. 운영 원장(supabase_migrations.schema_migrations)의
-- 'interview_verdict_ledger' · 'interview_sessions_erasure_registry' 두 행은 이 파일이 지우지
-- 않는다 -- 다시 올리려면 운영자가 두 행을 지운 뒤 push 한다(지우지 않으면 다음 push 가 둘 다
-- 건너뛴다. rollback/0189_down.sql 머리말의 같은 함정).

SET LOCAL lock_timeout = '10s';

DO $unschedule$
DECLARE
  v_job_id bigint;
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    FOR v_job_id IN EXECUTE
      'SELECT jobid FROM cron.job WHERE jobname = $1' USING 'anonymize-interview-sessions'
    LOOP
      EXECUTE 'SELECT cron.unschedule($1)' USING v_job_id;
    END LOOP;
  END IF;
END
$unschedule$;

DO $registry$
BEGIN
  IF to_regclass('public.erasure_registry') IS NOT NULL THEN
    DELETE FROM public.erasure_registry WHERE table_name = 'interview_sessions';
  END IF;
END
$registry$;

DROP TRIGGER IF EXISTS trg_interview_coverage_no_decrease ON public.interview_coverage;
DROP FUNCTION IF EXISTS public.interview_coverage_no_decrease();

DROP VIEW IF EXISTS public.interview_scene_metrics;
DROP FUNCTION IF EXISTS public.anonymize_interview_sessions(integer);
DROP FUNCTION IF EXISTS public.commit_interview_session(uuid);
DROP FUNCTION IF EXISTS public.close_interview_session(uuid, text, text, text, integer, integer);
DROP FUNCTION IF EXISTS public.record_interview_probe_verdict(uuid, uuid, uuid, text, text, integer, integer, text, text, text, text, text, boolean, integer);

DROP TABLE IF EXISTS public.interview_probe_verdicts;
DROP TABLE IF EXISTS public.interview_sessions;

DO $check$
DECLARE
  v_left boolean := false;
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM cron.job WHERE jobname = $1)'
      INTO v_left USING 'anonymize-interview-sessions';
  END IF;
  IF v_left
     OR to_regclass('public.interview_sessions') IS NOT NULL
     OR to_regclass('public.interview_probe_verdicts') IS NOT NULL
     OR to_regprocedure('public.commit_interview_session(uuid)') IS NOT NULL
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_trigger
                 WHERE tgname = 'trg_interview_coverage_no_decrease')
     OR (to_regclass('public.erasure_registry') IS NOT NULL
         AND EXISTS (SELECT 1 FROM public.erasure_registry WHERE table_name = 'interview_sessions')) THEN
    RAISE EXCEPTION '0220_down: rollback postcondition failed';
  END IF;
END
$check$;
