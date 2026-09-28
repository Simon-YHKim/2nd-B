-- Apply after UNNUMBERED_avatar_share.sql in the same console-owned rollout.
-- This is a planning draft. When assigning migration numbers, add these four
-- rows to db/erasure-registry.json, declare that numbered forward in its
-- forwardAdditions, and regenerate this SQL with
-- `npx tsx scripts/generate-erasure-registry.ts --sql`.
-- Do not edit historical 0189 or run this without the four owner tables.

SET LOCAL lock_timeout = '10s';

DO $prerequisite$
BEGIN
  IF to_regclass('public.erasure_registry') IS NULL
    OR to_regclass('public.avatar_share_assets') IS NULL
    OR to_regclass('public.avatar_share_reports') IS NULL
    OR to_regclass('public.avatar_share_blocks') IS NULL
    OR to_regclass('public.avatar_share_submission_limits') IS NULL THEN
    RAISE EXCEPTION 'avatar_share_erasure_prerequisites_missing';
  END IF;
  IF has_function_privilege('authenticated','public.erase_my_data(text)','EXECUTE')
    OR has_function_privilege('anon','public.erase_my_data(text)','EXECUTE') THEN
    RAISE EXCEPTION 'erasure_rpc_must_remain_locked';
  END IF;
END $prerequisite$;

INSERT INTO public.erasure_registry
  (table_name, owner_column, class, delete_order, cascades_from, reason)
VALUES
  ('avatar_share_blocks', 'blocker_id', 'client_erasable', 72, NULL,
   'Avatar Share 작성자 차단은 내 설정이며 직접 삭제할 수 있다.'),
  ('avatar_share_assets', 'owner_id', 'client_erasable', 73, NULL,
   '내가 그려 제출한 에셋이다. 콘텐츠 삭제가 지우며 다른 사용자의 참조는 기본 에셋으로 돌아간다.'),
  ('avatar_share_reports', 'reporter_id', 'account_delete_only', NULL, 'avatar_share_assets',
   '신고 원장은 신고자가 직접 지우지 않는다. 단 신고 대상 에셋을 작성자가 지우면 FK CASCADE로 함께 사라진다.'),
  ('avatar_share_submission_limits', 'user_id', 'retained', NULL, NULL,
   '제출 횟수 원장이다. 콘텐츠 삭제나 에셋 삭제로 한도를 초기화하지 않으며 계정 삭제 때만 연쇄 삭제한다.')
ON CONFLICT (table_name) DO UPDATE
SET owner_column = EXCLUDED.owner_column,
    class = EXCLUDED.class,
    delete_order = EXCLUDED.delete_order,
    cascades_from = EXCLUDED.cascades_from,
    reason = EXCLUDED.reason;
