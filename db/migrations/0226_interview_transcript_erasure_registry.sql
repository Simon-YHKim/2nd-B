-- 0226: registry-only additions after 0225 (RD-261007-13: period cards deferred).
-- Content erasure removes sessions (31) and context blocks (32); session-start counters are retained.
-- <<< erasure-registry:additions from db/erasure-registry.json >>>
-- Generated additions only. Existing registry rows and user data remain untouched.
DO $erasure_additions$
DECLARE target record;
BEGIN
  IF to_regclass('public.erasure_registry') IS NULL OR to_regprocedure('public.erase_my_data(text)') IS NULL THEN
    RAISE EXCEPTION 'erasure_additions_prerequisites_missing';
  END IF;
  IF has_function_privilege('authenticated','public.erase_my_data(text)','EXECUTE')
     OR has_function_privilege('anon','public.erase_my_data(text)','EXECUTE') THEN
    RAISE EXCEPTION 'erasure_additions_rpc_must_remain_locked';
  END IF;
  FOR target IN SELECT * FROM (VALUES
    ('ai_audit_context_blocks', 'user_id'),
    ('interview_session_starts', 'owner_id'),
    ('interview_sessions', 'owner_id'),
    ('interview_transcript_turns', 'user_id'),
    ('interview_transcripts', 'user_id')
  ) AS additions(table_name,owner_column) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid
      WHERE n.nspname='public' AND c.relname=target.table_name AND c.relkind IN ('r','p')
        AND a.attname=target.owner_column AND a.attnum>0 AND NOT a.attisdropped
        AND a.atttypid='uuid'::regtype) THEN
      RAISE EXCEPTION 'erasure_additions_owner_table_missing';
    END IF;
  END LOOP;
END $erasure_additions$;
WITH incoming (table_name,owner_column,class,delete_order,cascades_from,reason) AS (
  VALUES
    ('ai_audit_context_blocks', 'user_id', 'client_erasable', 32, NULL, '세컨비 응답의 문맥 블록 id(0225). 본인 SELECT · DELETE 정책으로 내용 삭제(32)에 포함한다. 레코드 삭제 트리거는 그 레코드를 담은 행을 먼저 지운다. 남은 행도 내용 삭제로 지워져 영수증에 보관으로 세지 않는다. 계정 삭제는 auth.users 연쇄로 지우고 90일 뒤 prune도 정리한다.'),
    ('interview_session_starts', 'owner_id', 'retained', NULL, NULL, '인터뷰 세션 생성 횟수(0225, 10분 칸 숫자만). 시간당 새 세션 상한이 버리기로 되감기지 않게 하는 카운터라 콘텐츠 삭제가 초기화하면 안 된다. 두 시간이 지난 칸은 sweep 이 매시 지운다. 계정 삭제 때는 auth.users 연쇄로 지워진다.'),
    ('interview_sessions', 'owner_id', 'client_erasable', 31, NULL, '인터뷰 세션(0225). 본인 SELECT · DELETE 정책이 있다. 내용 삭제는 턴(28), 머리(29), 레코드(30) 뒤 남은 세션(31)을 지운다. 세션 삭제 트리거가 모든 연결 감사 해시를 비우고 tombstone을 남긴다. 담은 세션은 레코드 삭제 트리거가 먼저 집계로 접는다. 미저장 세션은 discard 또는 6시간 뒤 sweep으로 접힌다. 계정 삭제 전 감사 해시를 비우고 auth.users 연쇄로 지운다.'),
    ('interview_transcript_turns', 'user_id', 'client_erasable', 28, NULL, '저장한 인터뷰 대화록의 턴 원문(0225). 본인이 SELECT · DELETE 정책으로 읽고 지울 수 있다. 머리(interview_transcripts)보다 먼저 지운다. 턴을 지우면 그 턴의 판정 행도 FK 연쇄로 지워지고, 판정 행 삭제 트리거가 그 감사 해시를 먼저 비운다. 세션이 거절한 호출의 해시는 레코드(30)를 지울 때 세션과 함께 비워진다.'),
    ('interview_transcripts', 'user_id', 'client_erasable', 29, NULL, '저장한 인터뷰 대화록 머리(0225). 본인 DELETE 정책이 있다. 레코드(records, 30)보다 먼저 지운다 - 레코드를 지우면 FK 연쇄로도 지워진다.')
)
INSERT INTO public.erasure_registry AS r (table_name,owner_column,class,delete_order,cascades_from,reason)
SELECT i.table_name,i.owner_column,i.class,i.delete_order::int,i.cascades_from,i.reason FROM incoming i
ON CONFLICT (table_name) DO UPDATE SET owner_column=EXCLUDED.owner_column,class=EXCLUDED.class,
  delete_order=EXCLUDED.delete_order,cascades_from=EXCLUDED.cascades_from,reason=EXCLUDED.reason;
-- <<< /erasure-registry:additions >>>
