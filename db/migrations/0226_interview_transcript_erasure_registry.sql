-- 0226_interview_transcript_erasure_registry.sql
-- Registry-only addition after 0225 provisions the interview transcript ledger.
-- interview_sessions (account_delete_only), interview_transcript_turns (28) and
-- interview_transcripts (29) and period_card_proposals (49) (client_erasable).
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
    ('interview_sessions', 'owner_id', 'account_delete_only', NULL, NULL, '인터뷰 세션 행(0225). 숫자 · 열거값만 담고 원문이 없다. 클라이언트 권한 · 정책이 없어 소유자에게 직접 삭제 경로가 없다. 저장하지 않은 세션은 화면을 떠날 때(discard) 또는 마지막 활동 6시간 뒤(sweep) fold 가 소유자 없는 주 단위 집계로 접고 지운다. 담은 세션은 그 레코드를 지우면 레코드 삭제 트리거가 같은 식으로 접고 지운다. 계정 삭제 때는 auth.users 연쇄로 지워진다. 판정 행(interview_probe_verdicts)은 소유자 열이 없고 세션을 따라 지워진다.'),
    ('interview_transcript_turns', 'user_id', 'client_erasable', 28, NULL, '저장한 인터뷰 대화록의 턴 원문(0225). 본인이 SELECT · DELETE 정책으로 읽고 지울 수 있다. 머리(interview_transcripts)보다 먼저 지운다. 턴을 지우면 그 턴의 판정 행도 FK 연쇄로 지워진다.'),
    ('interview_transcripts', 'user_id', 'client_erasable', 29, NULL, '저장한 인터뷰 대화록 머리(0225). 본인 DELETE 정책이 있다. 레코드(records, 30)보다 먼저 지운다 - 레코드를 지우면 FK 연쇄로도 지워진다.'),
    ('period_card_proposals', 'user_id', 'client_erasable', 49, NULL, '시기 카드 제안 · 결정 원장(0225). 승인한 그때의 나 문장이 여기 있다. 본인 DELETE 정책이 있다. star_tier_history(50)보다 먼저 지운다.')
)
INSERT INTO public.erasure_registry AS r (table_name,owner_column,class,delete_order,cascades_from,reason)
SELECT i.table_name,i.owner_column,i.class,i.delete_order::int,i.cascades_from,i.reason FROM incoming i
ON CONFLICT (table_name) DO UPDATE SET owner_column=EXCLUDED.owner_column,class=EXCLUDED.class,
  delete_order=EXCLUDED.delete_order,cascades_from=EXCLUDED.cascades_from,reason=EXCLUDED.reason;
-- <<< /erasure-registry:additions >>>