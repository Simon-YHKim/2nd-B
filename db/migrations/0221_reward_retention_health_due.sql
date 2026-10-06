-- 0221_reward_retention_health_due.sql
-- 보안 게이트 4회차(2026-10-06) 후속. 0211 의 감시 함수 reward_retention_health() 만 고친다.
-- 0211 · 0213 은 이미 운영에 적용돼 있어(2026-10-06 01:25 KST) 고쳐 쓰지 않고 새 번호로 바꾼다.
-- 번호: 0216~0220 은 다른 세션 예약, 0214 는 PR-7c(v2 권한 회수) 예약이라 0221 을 쓴다.
--
-- 바뀌는 것 둘:
--   DB4-01  "넘은 기록" 기준 90 → 89일. 정리(88일)가 한 번에 표당 최대 2만 건(1000 × 20회)만
--           지우고 잔량을 알리지 않아, 88~90일 잔량은 90일을 넘긴 뒤에야 보였다. 89일이면 매일 제때
--           돈 경우의 최대 나이(88일 + 하루 미만)를 넘는 것만 세므로 평소에는 0 이고, 잔량이나 건너뛴
--           실행은 방침 상한 하루 전에 보인다.
--   BL4-01  미실행 판단을 "26시간 넘게 성공 없음" 에서 "가장 최근 예정 실행 뒤 성공 없음" 으로.
--           예정 = 매일 04:37 KST(cron 37 19 * * * GMT), 실행 · 지연 유예 30분. 예약이 기록 없이
--           멈추면 그날 05:20 KST 점검(billing-tripwires)이 바로 알린다(전에는 이튿날).
--           예정 시각 계산은 reward_purge_last_due() 하나에 두고 회귀 P16 이 시각 사례로 지킨다.
--           cron 예약 시각이 바뀌면 아래 끝 상태 확인이 멈춘다(둘을 함께 바꿀 것).
--
-- 지우는 것 · 지우는 시점 · 권한은 그대로다. 정리 함수와 예약은 손대지 않는다.
-- 최상위 BEGIN/COMMIT 을 두지 않는다(Supabase CLI 트랜잭션).

SET LOCAL lock_timeout = '10s';

DO $preconditions$
BEGIN
  IF to_regprocedure('public.reward_retention_health()') IS NULL
     OR to_regprocedure('public.purge_reward_records(integer,integer)') IS NULL THEN
    RAISE EXCEPTION '0221 requires 0211 (reward_retention_health) to be applied first';
  END IF;
END
$preconditions$;

-- 가장 최근의 정리 예정 시각(04:37 KST). 그 시각 + 30분 유예가 지나기 전이면 전날 04:37 이다.
-- 한국은 서머타임이 없어 하루는 늘 24시간이다.
CREATE OR REPLACE FUNCTION public.reward_purge_last_due(p_now timestamptz)
RETURNS timestamptz
LANGUAGE sql
STABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT CASE WHEN p_now >= d.today + interval '30 minutes' THEN d.today
              ELSE d.today - interval '1 day' END
    FROM (SELECT ((pg_catalog.date_trunc('day', p_now AT TIME ZONE 'Asia/Seoul')
                   + interval '4 hours 37 minutes') AT TIME ZONE 'Asia/Seoul') AS today) AS d
$$;

REVOKE ALL ON FUNCTION public.reward_purge_last_due(timestamptz) FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.reward_purge_last_due(timestamptz) IS
  '0221: 가장 최근의 purge-reward-records-90d 예정 시각(매일 04:37 KST, 30분 유예). reward_retention_health() 의 cron_stale 기준. 예약 시각과 함께 바꿀 것.';

CREATE OR REPLACE FUNCTION public.reward_retention_health()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role     text := public.billing_request_role();
  v_now      timestamptz := now();
  -- 0221(보안 게이트 r4 DB4-01): 90 → 89일. 정리가 88일이라 매일 제때 돌면 가장 오래 남는 기록은
  -- 88일 + 하루 미만이다. 89일 넘은 것은 정리가 놓친 것(한 번에 표당 2만 건을 넘는 잔량 · 건너뛴 실행)
  -- 이고, 방침 상한 90일까지 하루가 남았을 때 알린다. 90일 기준은 이미 넘긴 뒤에야 알렸다.
  v_overdue  timestamptz := now() - make_interval(days => 89);
  v_txns     bigint;
  v_lots     bigint;
  v_uc       bigint;
  v_chat     bigint;
  v_rl       bigint;
  v_tickets  bigint;
  v_reviews  bigint;
  v_audit    bigint;
  v_active   boolean := NULL;
  v_last_ok  timestamptz := NULL;
  v_fail_7d  bigint := NULL;
  v_cron     boolean := to_regclass('cron.job') IS NOT NULL
                        AND to_regclass('cron.job_run_details') IS NOT NULL;
  v_due      timestamptz := public.reward_purge_last_due(now());
  v_stale    boolean;
BEGIN
  IF v_role IS NOT NULL AND v_role <> 'service_role' THEN
    RAISE EXCEPTION 'service_role only' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_txns FROM public.rewarded_ssv_txns AS t
   WHERE t.granted_at < v_overdue
     AND NOT EXISTS (SELECT 1 FROM public.reward_dispute_holds AS h
                      WHERE h.transaction_id = t.transaction_id AND h.released_at IS NULL);

  -- 합계와 상관없이 센다: 89일 넘게 남은 로트는 정리가 못 지웠거나 만료가 안 된 것이다.
  SELECT count(*) INTO v_lots FROM public.credit_ledger AS o
   WHERE o.kind = 'ad_reward' AND o.id = o.lot_id AND o.created_at < v_overdue
     AND NOT EXISTS (SELECT 1 FROM public.reward_dispute_holds AS h
                      WHERE h.released_at IS NULL AND o.memo = 'rewarded SSV ' || h.transaction_id);

  SELECT count(*) INTO v_uc FROM public.usage_counters AS uc
   WHERE (uc.reward_credits <> 0 OR uc.reward_consumed <> 0 OR uc.chat_ad_credits <> 0)
     AND uc.month_bucket ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
     AND (pg_catalog.to_date(uc.month_bucket, 'YYYY-MM')::timestamp AT TIME ZONE 'Asia/Seoul') < v_overdue
     AND NOT EXISTS (
       SELECT 1 FROM public.reward_dispute_holds AS h
         JOIN public.rewarded_ssv_txns AS t ON t.transaction_id = h.transaction_id
        WHERE h.released_at IS NULL AND t.user_id = uc.user_id
          AND pg_catalog.to_char(t.granted_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM') = uc.month_bucket);

  SELECT count(*) INTO v_chat FROM public.chat_usage AS cu
   WHERE cu.ad_bonus <> 0
     AND (cu.day::timestamp AT TIME ZONE 'Asia/Seoul') < v_overdue
     AND NOT EXISTS (
       SELECT 1 FROM public.reward_dispute_holds AS h
         JOIN public.rewarded_ssv_txns AS t ON t.transaction_id = h.transaction_id
        WHERE h.released_at IS NULL AND t.user_id = cu.user_id
          AND (t.granted_at AT TIME ZONE 'Asia/Seoul')::date = cu.day);

  SELECT count(*) INTO v_rl FROM public.reward_ssv_issue_rate_limits AS r
   WHERE r.updated_at < v_overdue;

  -- 티켓은 0211 이 아니라 0196 의 purge-reward-ssv-tickets(5분마다)와 발급 때 정리 트리거가
  -- 지운다. 그 계약은 소비 1일 뒤, 미소비는 만료(발급 20분 뒤) 즉시다. 하루 여유를 두고 그보다
  -- 오래 남은 티켓을 센다: 소비 2일 초과, 또는 미소비로 만료 1일 초과. 91일 기준이면 정리가 멈춘
  -- 뒤 거의 석 달을 놓친다(보안 게이트 r1 BL-07, r2 DB2-03). 티켓에도 거래 ID 와 계정 ID 가 있다.
  SELECT count(*) INTO v_tickets FROM public.reward_ssv_tickets AS k
   WHERE k.consumed_at < v_now - make_interval(days => 2)
      OR (k.consumed_at IS NULL AND k.expires_at < v_now - make_interval(days => 1));

  -- S4: 재검토 기한이 지난 활성 보류(Gaius ② "재검토가 밀리면 알림").
  SELECT count(*) INTO v_reviews FROM public.reward_dispute_holds AS h
   WHERE h.released_at IS NULL AND h.next_review_at < v_now;

  -- S1: 분쟁 종료 3년 + 하루 넘게 남은 감사 사건 수(정리가 돌면 늘 0). 종료일은 정리 3-6 단계와
  -- 같은 식이다(마지막 released 와 마지막 source_deleted 중 늦은 쪽).
  SELECT count(*) INTO v_audit FROM (
    SELECT e.case_ref,
           max(e.at) FILTER (WHERE e.action IN ('placed', 'reopened')) AS last_open,
           max(e.at) FILTER (WHERE e.action = 'released') AS last_release,
           max(e.at) FILTER (WHERE e.action = 'source_deleted') AS last_gone
      FROM public.reward_dispute_hold_events AS e
     GROUP BY e.case_ref
  ) AS c
   WHERE CASE WHEN GREATEST(c.last_release, c.last_gone) >= c.last_open
              THEN GREATEST(c.last_release, c.last_gone) END
         < v_now - make_interval(years => 3) - make_interval(days => 1)
     AND NOT EXISTS (SELECT 1 FROM public.reward_dispute_holds AS h
                      WHERE h.case_ref = c.case_ref AND h.released_at IS NULL);

  -- cron 스키마는 pg_cron 이 있을 때만 있다. 정적 참조는 계획 단계에서 실패하므로 동적으로 묻는다.
  IF v_cron THEN
    EXECUTE 'SELECT bool_or(j.active) FROM cron.job AS j WHERE j.jobname = $1'
      INTO v_active USING 'purge-reward-records-90d';
    EXECUTE 'SELECT max(d.end_time) FILTER (WHERE d.status = ''succeeded''),
                    count(*) FILTER (WHERE d.status = ''failed'' AND d.start_time > $2)
               FROM cron.job_run_details AS d
               JOIN cron.job AS j ON j.jobid = d.jobid
              WHERE j.jobname = $1'
      INTO v_last_ok, v_fail_7d USING 'purge-reward-records-90d', v_now - interval '7 days';
  END IF;

  -- 0221(보안 게이트 r4 BL4-01): "26시간 넘게 성공 없음" 대신 "가장 최근 예정 실행(04:37 KST,
  -- 30분 유예) 뒤 성공 없음". 26시간 기준은 05:20 점검에서 24시간 43분밖에 안 지나 하루 늦게 알렸고,
  -- 그 사이 일부 기록이 90일을 넘었다. 이제 예약이 기록 없이 멈추면 그날 05:20 점검이 바로 알린다.
  v_stale := v_cron AND (v_last_ok IS NULL OR v_last_ok < v_due);

  RETURN jsonb_build_object(
    'checked_at', v_now,
    'overdue_rewarded_ssv_txns', v_txns,
    'overdue_ad_reward_lots', v_lots,
    'overdue_usage_counters', v_uc,
    'overdue_chat_usage', v_chat,
    'overdue_issue_rate_limits', v_rl,
    'overdue_reward_ssv_tickets', v_tickets,
    'overdue_hold_reviews', v_reviews,
    'overdue_hold_audit_cases', v_audit,
    'cron_available', v_cron,
    'cron_active', v_active,
    'cron_last_success', v_last_ok,
    'cron_failures_7d', v_fail_7d,
    'cron_due', v_due,
    'cron_stale', v_stale,
    -- pg_cron 이 없으면 정리가 아예 돌지 않으므로 ok 일 수 없다(보안 게이트 r1 DB-03 · BL-06).
    -- 예약 없는 CI 서버에서는 ok = false 가 맞고, CI 는 ok 가 아니라 건수를 본다.
    'ok', (v_txns + v_lots + v_uc + v_chat + v_rl + v_tickets + v_reviews + v_audit) = 0
          AND v_cron AND COALESCE(v_active, false) AND NOT v_stale AND COALESCE(v_fail_7d, 0) = 0
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reward_retention_health() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reward_retention_health() TO service_role;

COMMENT ON FUNCTION public.reward_retention_health() IS
  '0211 · 0221: 88일 정리 감시. 89일 넘은 비보류 보상 기록 수(방침 90일 하루 전 경보, 0221), 재검토 기한(90일)이 지난 활성 보류 수(S4), 분쟁 종료 3년 넘게 남은 감사 사건 수(S1), 0196 계약보다 하루 넘게 남은 티켓 수(소비 2일 · 만료 1일 초과), purge-reward-records-90d 의 활성 여부 · 마지막 성공 시각 · 7일 실패 수 · 가장 최근 예정 실행(04:37 KST + 30분, cron_due) 뒤 성공이 없는지(cron_stale, 0221). pg_cron 이 없으면 ok=false. 건수와 시각만. billing-tripwires.yml 이 ok=false 면 이슈를 연다.';

----------------------------------------------------------------------
-- 끝 상태 확인
----------------------------------------------------------------------

DO $postcondition$
DECLARE
  v_src text := (SELECT p.prosrc FROM pg_catalog.pg_proc AS p
                  WHERE p.oid = 'public.reward_retention_health()'::regprocedure);
  v_ok  boolean;
BEGIN
  IF v_src !~ 'make_interval\(days => 89\)'
     OR v_src ~ 'make_interval\(days => 90\)'
     OR v_src !~ 'reward_purge_last_due'
     OR v_src ~ '26 hours'
     OR public.reward_purge_last_due('2026-10-06 05:20+09') <> '2026-10-06 04:37+09'::timestamptz
     OR public.reward_purge_last_due('2026-10-06 05:00+09') <> '2026-10-05 04:37+09'::timestamptz
     OR has_function_privilege('anon', 'public.reward_retention_health()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.reward_retention_health()', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.reward_retention_health()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.reward_purge_last_due(timestamptz)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.reward_purge_last_due(timestamptz)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.reward_purge_last_due(timestamptz)', 'EXECUTE') THEN
    RAISE EXCEPTION '0221: reward retention health postcondition failed';
  END IF;
  -- 예정 시각 계산(04:37 KST)과 실제 예약이 같아야 한다. pg_cron 이 있을 때만 볼 수 있다.
  IF to_regclass('cron.job') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM cron.job WHERE jobname = $1 AND schedule = $2 AND active)'
      INTO v_ok USING 'purge-reward-records-90d', '37 19 * * *';
    IF NOT v_ok THEN
      RAISE EXCEPTION '0221: purge-reward-records-90d is not at 37 19 * * * (04:37 KST) as reward_purge_last_due assumes';
    END IF;
  END IF;
END
$postcondition$;
