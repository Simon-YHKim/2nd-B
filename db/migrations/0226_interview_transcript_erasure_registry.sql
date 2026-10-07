-- 0226_interview_transcript_erasure_registry.sql
-- Registry-only addition after 0225 provisions the interview transcript ledger.
-- interview_sessions and ai_audit_context_blocks (account_delete_only), interview_transcript_turns (28),
-- interview_transcripts (29) and period_card_proposals (49) (client_erasable), and
-- interview_session_starts (retained: the hourly session cap must not reset on content erasure).
-- Kept separate from 0225 so the 0189 rollback can replay this file alone (G7).
-- Note: 0227 and 0228 (account-deletion receipts) and 0229 live on other branches
-- and are not on main when this file is written; this file depends only on 0225.
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
    ('interview_transcripts', 'user_id'),
    ('period_card_proposals', 'user_id')
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
    ('ai_audit_context_blocks', 'user_id', 'account_delete_only', NULL, NULL, '세컨비 응답이 문맥에 실은 블록 id(0225). 내용 없이 id 만 있다. 클라이언트 권한 · 정책이 없다. 부모 감사 행(ai_audit_log)은 계정 삭제 뒤에도 남으므로, 감사 행에서 확인한 사용자를 따로 적어 auth.users 연쇄로 지운다. 레코드를 지우면 그 레코드 id 를 실은 행을 records 삭제 트리거가 지운다. 나머지는 90일 뒤 prune 이 지운다.'),
    ('interview_session_starts', 'owner_id', 'retained', NULL, NULL, '인터뷰 세션 생성 횟수(0225, 10분 칸 숫자만). 시간당 새 세션 상한이 버리기로 되감기지 않게 하는 카운터라 콘텐츠 삭제가 초기화하면 안 된다. 두 시간이 지난 칸은 sweep 이 매시 지운다. 계정 삭제 때는 auth.users 연쇄로 지워진다.'),
    ('interview_sessions', 'owner_id', 'account_delete_only', NULL, NULL, '인터뷰 세션 행(0225). 숫자 · 열거값만 담고 원문이 없다. 클라이언트 권한 · 정책이 없어 소유자에게 직접 삭제 경로가 없다. 저장하지 않은 세션은 화면을 떠날 때(discard) 또는 마지막 활동 6시간 뒤(sweep) fold 가 소유자 없는 주 단위 집계로 접고 지운다. 담은 세션은 그 레코드를 지우면 레코드 삭제 트리거가 같은 식으로 접고 지운다. 계정 삭제 때는 auth.users 연쇄로 지워진다. 판정 행(interview_probe_verdicts)과 세션의 감사 id 행(interview_session_audit_ids)은 소유자 열이 없고 세션을 따라 지워진다. 세션을 접을 때 그 감사 id 전부의 해시를 비운다.'),
    ('interview_transcript_turns', 'user_id', 'client_erasable', 28, NULL, '저장한 인터뷰 대화록의 턴 원문(0225). 본인이 SELECT · DELETE 정책으로 읽고 지울 수 있다. 머리(interview_transcripts)보다 먼저 지운다. 턴을 지우면 그 턴의 판정 행도 FK 연쇄로 지워지고, 판정 행 삭제 트리거가 그 감사 해시를 먼저 비운다. 세션이 거절한 호출의 해시는 레코드(30)를 지울 때 세션과 함께 비워진다.'),
    ('interview_transcripts', 'user_id', 'client_erasable', 29, NULL, '저장한 인터뷰 대화록 머리(0225). 본인 DELETE 정책이 있다. 레코드(records, 30)보다 먼저 지운다 - 레코드를 지우면 FK 연쇄로도 지워진다.'),
    ('period_card_proposals', 'user_id', 'client_erasable', 49, NULL, '시기 카드 제안 · 결정 원장(0225). 승인한 그때의 나 문장이 여기 있고, 빗나간 곳 행에는 사용자가 쓴 miss_text 가 있다. 본인 DELETE 정책이 있다. 다만 승인 행은 체인 · L5 행이 걸려 있어 클라이언트 역할의 직접 DELETE 를 트리거가 막고 delete_period_card 로 지운다(정의자 함수인 erase_my_data 는 막히지 않는다). 레코드(30)를 먼저 지우면 그 레코드를 인용한 승인 카드는 레코드 삭제 트리거가 지운다. star_tier_history(50)보다 먼저 지운다.')
)
INSERT INTO public.erasure_registry AS r (table_name,owner_column,class,delete_order,cascades_from,reason)
SELECT i.table_name,i.owner_column,i.class,i.delete_order::int,i.cascades_from,i.reason FROM incoming i
ON CONFLICT (table_name) DO UPDATE SET owner_column=EXCLUDED.owner_column,class=EXCLUDED.class,
  delete_order=EXCLUDED.delete_order,cascades_from=EXCLUDED.cascades_from,reason=EXCLUDED.reason;
-- <<< /erasure-registry:additions >>>