-- rollback/0211_down.sql  (초안)
-- 0211 을 되돌린다. 주의:
--   * 이미 지운 보상 기록은 되살리지 않는다. 백업(db-backup.yml 아티팩트 14일)은 장애 복구에만 쓰고,
--     복원했다면 지운 정보를 다시 지운다(S3 방침 문장 B 채택, 운영 문서 §7).
--   * 감사 기록(reward_dispute_hold_events)은 S1 에 따라 분쟁 종료 3년까지 남겨야 한다. 되돌리면 표째
--     사라지므로, 감사 행이 하나라도 있으면 멈춘다(아래 가드). 필요하면 먼저 사건 파일로 옮긴다.
--   * 활성 분쟁 보류가 있으면 멈춘다(보류 정보를 잃지 않도록). 정말 지우려면 먼저
--     release_reward_dispute_hold 로 풀거나, 아래 가드를 운영자가 의식적으로 지운다.
--   * 되돌린 뒤에는 방침의 90일 문장이 거짓이 되므로 광고 ON 상태라면 같은 날 Gaius 에게 알린다.
--   * 0212(registry 사유)를 함께 되돌리려면 rollback/0189_down.sql 왕복을 따른다(0212 는 c_names 에 있다).
--     0211 만 되돌리면 등록부 사유가 사실과 달라지므로 같은 PR 에서 0212 사유도 되돌릴 것.
--   * billing-tripwires.yml 의 reward_retention_health() 읽기도 함께 빼야 워크플로가 실패하지 않는다.
-- 최상위 BEGIN/COMMIT 없음(CLI/psql -1 로 감쌀 것).

SET LOCAL lock_timeout = '10s';

DO $guard$
BEGIN
  IF to_regclass('public.reward_dispute_holds') IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.reward_dispute_holds WHERE released_at IS NULL) THEN
    RAISE EXCEPTION '0211_down: active reward dispute holds exist; release them first';
  END IF;
  IF to_regclass('public.reward_dispute_hold_events') IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.reward_dispute_hold_events) THEN
    RAISE EXCEPTION '0211_down: dispute hold audit rows must be kept 3 years (S1); export them first';
  END IF;
END
$guard$;

DO $unschedule$
DECLARE
  v_job_id bigint;
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    FOR v_job_id IN EXECUTE
      'SELECT jobid FROM cron.job WHERE jobname = $1' USING 'purge-reward-records-90d'
    LOOP
      EXECUTE 'SELECT cron.unschedule($1)' USING v_job_id;
    END LOOP;
  END IF;
END
$unschedule$;

DROP FUNCTION IF EXISTS public.purge_reward_records(integer, integer);
DROP FUNCTION IF EXISTS public.reward_retention_health();
DROP FUNCTION IF EXISTS public.place_reward_dispute_hold(text, text, text, text, text);
DROP FUNCTION IF EXISTS public.release_reward_dispute_hold(text, text, text);
DROP FUNCTION IF EXISTS public.review_reward_dispute_hold(text, text, text);
DROP FUNCTION IF EXISTS public.reward_hold_caller_role();

DROP TABLE IF EXISTS public.reward_dispute_hold_events;   -- 트리거도 함께 사라진다
DROP FUNCTION IF EXISTS public.reward_dispute_hold_events_append_only();
DROP TABLE IF EXISTS public.reward_dispute_holds;            -- trg_reward_dispute_holds_log_delete 도 함께
DROP FUNCTION IF EXISTS public.reward_dispute_holds_log_delete();

DROP INDEX IF EXISTS public.rewarded_ssv_txns_granted_at_idx;
DROP INDEX IF EXISTS public.credit_ledger_ad_reward_opened_idx;
DROP INDEX IF EXISTS public.usage_counters_reward_nonzero_idx;
DROP INDEX IF EXISTS public.chat_usage_ad_bonus_nonzero_idx;
DROP INDEX IF EXISTS public.reward_ssv_issue_rate_limits_updated_idx;

DO $check$
DECLARE
  v_left boolean := false;
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM cron.job WHERE jobname = $1)'
      INTO v_left USING 'purge-reward-records-90d';
  END IF;
  IF v_left
     OR to_regprocedure('public.purge_reward_records(integer,integer)') IS NOT NULL
     OR to_regprocedure('public.reward_retention_health()') IS NOT NULL
     OR to_regprocedure('public.review_reward_dispute_hold(text,text,text)') IS NOT NULL
     OR to_regclass('public.reward_dispute_holds') IS NOT NULL THEN
    RAISE EXCEPTION '0211_down: rollback postcondition failed';
  END IF;
END
$check$;
