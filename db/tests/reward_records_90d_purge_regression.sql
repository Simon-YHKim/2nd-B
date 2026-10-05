\set ON_ERROR_STOP on

-- 초안(Hadrianus 2026-10-04). CI 스크래치 DB 에서 numbered 0211 적용 뒤에 실행한다(PR-7a). P10 과 P9 의 콜백 검사는
-- 0213(PR-7b)이 들어온 뒤에만 돈다(함수가 없으면 건너뜀).
-- v2(19:32 KST): 기준 89일, 사유 코드 2종, D4 승인자 인수, 감시 함수(P12), 89일 경계(P13).
-- 모양은 promo_lot_account_erasure_regression.sql 을 따른다. 로컬 스텁 스모크
-- (local-smoke/10_scenarios.sql)는 통과했지만, 이 파일은 실제 함수 체인
-- (grant_reward_credits_ssv → credit_ledger 트리거 → mirror → expire_credit_lots)으로
-- 같은 계약을 고정한다. 코딩 LLM 이 CI 에서 다듬을 것(TODO 표시).
--
-- 고정하는 계약
--   P1 89일 지난 ad_reward 로트는 로트 전체가 지워지고, 고아 행·잔액 드리프트가 없다.
--   P2 89일 지난 rewarded_ssv_txns · reward_ssv_issue_rate_limits 는 지워진다.
--   P3 usage_counters 는 행이 남고 보상 칸만 0. reasoning_used 는 그대로.
--   P4 chat_usage 는 행이 남고 ad_bonus 만 0. count 는 그대로.
--   P5 최근 기록·구매 로트는 건드리지 않는다.
--   P6 활성 분쟁 보류 거래(와 그 달·날 카운터)는 남고, 해제하면 다음 실행에서 지워진다.
--   P7 활성 보류가 있어도 계정 삭제는 성공하고 보류·거래 행이 함께 사라진다.
--      감사 기록은 transaction_id 만 NULL 로 남는다.
--   P8 authenticated 는 purge · place · release · health 를 부를 수 없다. 'other' 사유와
--      자기 승인(approved_by = actor)은 거부된다.
--   P9 R2 불변식: 정리 89일 > 티켓 재시도 창 1일 > 0 (prosrc 확인).
--   P10 0213: 1일 넘은/미래/티켓 발급 전 timestamp 는 v3 에서 지급되지 않는다.
--   P11 cron.job 에 purge-reward-records-90d '37 19 * * *' 가 active (pg_cron 있을 때만).
--   P12 reward_retention_health(): 정리 뒤 overdue 건수가 모두 0(보류 거래는 세지 않음).
--       0196 계약보다 하루 넘게 남은 티켓도 센다(BL-07 · DB2-03). pg_cron 이 없는 서버에서는
--       ok = false(DB-03 · BL-06).
--   P13 89일 경계: 89일 + 1시간 전 거래는 지워지고 88일 23시간 전 거래는 남는다.
--   P14 S4 재검토: 걸 때 next_review_at = 90일 뒤, review 가 다시 90일 뒤로 미루고 'reviewed' 를 남긴다.
--       자기 승인은 거부. 기한이 지나면 health 의 overdue_hold_reviews 가 센다.
--   P15 S1 감사 기록 3년: 분쟁이 끝난 날부터 정확히 3년 지난 사건의 감사 행만 정리가 지운다
--       (3년 + 1시간은 지우고 3년 − 1시간은 남긴다, DB-02). 활성 보류 행이 해제 없이 지워질 때만
--       'source_deleted' 가 남는다(계정 삭제). 한 사건에 보류가 여럿이면 가장 늦게 끝난 것이
--       종료일이다(BL-04).
-- v3(20:43 KST): S1~S4 확정 반영(P14·P15 추가, P7 감사 행 수 4).
-- r1 게이트(2026-10-05): P7 감사 행 수 3(해제 뒤 정리는 source_deleted 를 남기지 않는다), P15 경계 ·
--   여러 보류 사건 추가, P12 티켓 · cron 없는 ok. 보류와 정리의 경합(DB-01)은 두 세션이 필요해
--   이 파일이 아니라 supabase-dry-run.yml 의 "Race a dispute hold against the 89-day purge" 단계가 본다.
BEGIN;

SET LOCAL session_replication_role = replica;
INSERT INTO auth.users (id, email) VALUES
  ('30000000-0000-0000-0000-000000000211', 'purge90-one@example.com'),
  ('30000000-0000-0000-0000-000000000212', 'purge90-two@example.com');
SET LOCAL session_replication_role = origin;
INSERT INTO public.users (id, email, birth_date, locale) VALUES
  ('30000000-0000-0000-0000-000000000211', 'purge90-one@example.com', DATE '1990-01-01', 'en'),
  ('30000000-0000-0000-0000-000000000212', 'purge90-two@example.com', DATE '1990-01-01', 'en');
UPDATE public.users
   SET privacy_prefs = privacy_prefs || '{"ads": "true"}'::jsonb
 WHERE id IN ('30000000-0000-0000-0000-000000000211', '30000000-0000-0000-0000-000000000212');

SET LOCAL request.jwt.claim.role = 'service_role';
DO $seed$
DECLARE
  v_one constant uuid := '30000000-0000-0000-0000-000000000211';
  v_two constant uuid := '30000000-0000-0000-0000-000000000212';
  v_month constant text := pg_catalog.to_char(pg_catalog.now() AT TIME ZONE 'Asia/Seoul', 'YYYY-MM');
  v_shift constant interval := make_interval(days => 130);
BEGIN
  -- 사용자 1: 거래 둘(하나는 보류할 것). 사용자 2: 최근 거래 하나.
  PERFORM public.grant_reward_credits_ssv(v_one, v_month, 2, 'txn-p90-old-1');
  PERFORM public.grant_reward_credits_ssv(v_one, v_month, 2, 'txn-p90-old-held');
  PERFORM public.grant_reward_credits_ssv(v_two, v_month, 2, 'txn-p90-new');
  PERFORM public.grant_reward_credits_ssv(v_two, v_month, 2, 'txn-p90-edge-plus');
  PERFORM public.grant_reward_credits_ssv(v_two, v_month, 2, 'txn-p90-edge-minus');
  -- P5 구매 로트: promo_lot_account_erasure_regression.sql 과 같은 직접 INSERT. 아래에서
  -- 130일 전으로 밀어도(ad_reward 와 같은 나이) 정리 대상이 아니어야 한다.
  INSERT INTO public.credit_ledger (id, user_id, kind, units, lot_id, provider, amount_cents, currency, sku, memo)
  VALUES ('30000000-0000-0000-0000-0000000002f5', v_one, 'purchase', 5, '30000000-0000-0000-0000-0000000002f5',
          'manual', 990, 'KRW', 'fixture_sku', 'purge90 purchase fixture');

  -- 사용자 1 의 기록을 130일 전으로 민다(트리거는 INSERT 전용이라 UPDATE 로 옮길 수 있다).
  UPDATE public.credit_ledger
     SET created_at = created_at - v_shift,
         lot_opened_at = lot_opened_at - v_shift,
         lot_expires_at = lot_expires_at - v_shift
   WHERE user_id = v_one AND kind = 'ad_reward';
  UPDATE public.credit_ledger
     SET created_at = created_at - v_shift,
         lot_opened_at = lot_opened_at - v_shift
   WHERE id = '30000000-0000-0000-0000-0000000002f5';
  UPDATE public.rewarded_ssv_txns SET granted_at = granted_at - v_shift WHERE user_id = v_one;
  -- P13 경계: 거래 행만 민다(로트는 이번 달 것이라 만료 전이므로 남는 것이 맞다).
  UPDATE public.rewarded_ssv_txns SET granted_at = pg_catalog.now() - interval '89 days 1 hour'
   WHERE transaction_id = 'txn-p90-edge-plus';
  UPDATE public.rewarded_ssv_txns SET granted_at = pg_catalog.now() - interval '88 days 23 hours'
   WHERE transaction_id = 'txn-p90-edge-minus';
  -- 만료 행 기록(합계 0 으로 만든다).
  PERFORM public.expire_credit_lots(pg_catalog.now(), 500);

  -- 옛 달 카운터·옛 날 보너스(보상 칸 쓰기는 mirror 플래그가 있어야 한다).
  PERFORM pg_catalog.set_config('app.credit_mirror', '1', true);
  INSERT INTO public.usage_counters (user_id, month_bucket, reasoning_used, reward_credits, reward_consumed, chat_ad_credits)
  VALUES (v_one, pg_catalog.to_char((pg_catalog.now() - v_shift) AT TIME ZONE 'Asia/Seoul', 'YYYY-MM'), 7, 4, 4, 2)
  ON CONFLICT (user_id, month_bucket) DO UPDATE
     SET reasoning_used = 7, reward_credits = 4, reward_consumed = 4, chat_ad_credits = 2;
  PERFORM pg_catalog.set_config('app.credit_mirror', '', true);
  INSERT INTO public.chat_usage (user_id, day, count, ad_bonus)
  VALUES (v_one, ((pg_catalog.now() - v_shift) AT TIME ZONE 'Asia/Seoul')::date, 3, 2)
  ON CONFLICT (user_id, day) DO UPDATE SET count = 3, ad_bonus = 2;
  INSERT INTO public.reward_ssv_issue_rate_limits (user_id, claimed_at, updated_at)
  VALUES (v_one, '{}', pg_catalog.now() - v_shift)
  ON CONFLICT (user_id) DO UPDATE SET updated_at = pg_catalog.now() - v_shift;
END
$seed$;

-- P8
DO $p8$
BEGIN
  IF has_function_privilege('authenticated', 'public.purge_reward_records(integer,integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.place_reward_dispute_hold(text,text,text,text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.release_reward_dispute_hold(text,text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.reward_retention_health()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.review_reward_dispute_hold(text,text,text)', 'EXECUTE')
     OR has_table_privilege('authenticated', 'public.reward_dispute_holds', 'SELECT') THEN
    RAISE EXCEPTION 'P8: authenticated can reach the purge or hold surface';
  END IF;
  BEGIN
    PERFORM public.place_reward_dispute_hold('txn-p90-old-1', 'other', 'CASE-T-009', 'ci', 'ci-approver');
    RAISE EXCEPTION 'P8: reason other accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    PERFORM public.place_reward_dispute_hold('txn-p90-old-1', 'user_dispute', 'CASE-T-009', 'ci', 'ci');
    RAISE EXCEPTION 'P8: self approval accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END
$p8$;

SELECT public.place_reward_dispute_hold('txn-p90-old-held', 'user_dispute', 'CASE-T-001', 'ci', 'ci-approver') AS placed;

-- P14
DO $p14$
BEGIN
  IF (SELECT next_review_at FROM public.reward_dispute_holds WHERE transaction_id = 'txn-p90-old-held')
     NOT BETWEEN now() + interval '89 days' AND now() + interval '91 days' THEN
    RAISE EXCEPTION 'P14: next_review_at default'; END IF;
  UPDATE public.reward_dispute_holds SET next_review_at = now() - interval '1 day'
   WHERE transaction_id = 'txn-p90-old-held';   -- 테스트 전용(표 권한은 postgres 만)
  IF (public.reward_retention_health() ->> 'overdue_hold_reviews')::int <> 1 THEN
    RAISE EXCEPTION 'P14: overdue review not reported'; END IF;
  BEGIN
    PERFORM public.review_reward_dispute_hold('txn-p90-old-held', 'ci', 'ci');
    RAISE EXCEPTION 'P14: self-approved review accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  IF NOT public.review_reward_dispute_hold('txn-p90-old-held', 'ci', 'ci-approver') THEN
    RAISE EXCEPTION 'P14: review failed'; END IF;
  IF (public.reward_retention_health() ->> 'overdue_hold_reviews')::int <> 0 THEN
    RAISE EXCEPTION 'P14: review did not reset next_review_at'; END IF;
END
$p14$;
SELECT public.purge_reward_records() AS run1;

DO $p1_p6$
DECLARE
  v_one constant uuid := '30000000-0000-0000-0000-000000000211';
BEGIN
  IF EXISTS (SELECT 1 FROM public.rewarded_ssv_txns WHERE transaction_id = 'txn-p90-old-1') THEN
    RAISE EXCEPTION 'P2: old txn kept'; END IF;
  IF EXISTS (SELECT 1 FROM public.credit_ledger WHERE memo = 'rewarded SSV txn-p90-old-1') THEN
    RAISE EXCEPTION 'P1: old lot kept'; END IF;
  IF EXISTS (SELECT 1 FROM public.credit_ledger AS l
              WHERE NOT EXISTS (SELECT 1 FROM public.credit_ledger AS o WHERE o.id = l.lot_id)) THEN
    RAISE EXCEPTION 'P1: orphan ledger rows'; END IF;
  IF EXISTS (SELECT 1 FROM public.credit_balance_drift) THEN
    RAISE EXCEPTION 'P1: credit_balance_drift not empty'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.rewarded_ssv_txns WHERE transaction_id = 'txn-p90-old-held')
     OR NOT EXISTS (SELECT 1 FROM public.credit_ledger WHERE memo = 'rewarded SSV txn-p90-old-held') THEN
    RAISE EXCEPTION 'P6: held records purged'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.rewarded_ssv_txns WHERE transaction_id = 'txn-p90-new') THEN
    RAISE EXCEPTION 'P5: recent txn purged'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.credit_ledger
                  WHERE id = '30000000-0000-0000-0000-0000000002f5' AND kind = 'purchase' AND user_id = v_one
                    AND lot_opened_at < pg_catalog.now() - interval '120 days') THEN
    RAISE EXCEPTION 'P5: 130-day-old purchase lot purged or not aged by the fixture'; END IF;
  -- 보류 거래와 같은 달·날이므로 P3·P4 카운터는 이번에는 남아야 한다(P6).
  IF NOT EXISTS (SELECT 1 FROM public.usage_counters WHERE user_id = v_one AND reward_credits = 4) THEN
    RAISE EXCEPTION 'P6: held month counter zeroed'; END IF;
  IF EXISTS (SELECT 1 FROM public.reward_ssv_issue_rate_limits WHERE user_id = v_one) THEN
    RAISE EXCEPTION 'P2: stale issue rate limit kept'; END IF;
  IF EXISTS (SELECT 1 FROM public.rewarded_ssv_txns WHERE transaction_id = 'txn-p90-edge-plus')
     OR NOT EXISTS (SELECT 1 FROM public.rewarded_ssv_txns WHERE transaction_id = 'txn-p90-edge-minus') THEN
    RAISE EXCEPTION 'P13: 89-day boundary wrong'; END IF;
  -- P12: 정리 뒤 감시 건수 0 (보류 거래는 세지 않는다)
  IF (public.reward_retention_health() ->> 'overdue_rewarded_ssv_txns')::int <> 0
     OR (public.reward_retention_health() ->> 'overdue_ad_reward_lots')::int <> 0
     OR (public.reward_retention_health() ->> 'overdue_reward_ssv_tickets')::int <> 0 THEN
    RAISE EXCEPTION 'P12: health still reports overdue records: %', public.reward_retention_health(); END IF;
  -- pg_cron 이 없으면 정리가 아예 돌지 않는다. 그 상태를 ok 로 보고하면 안 된다(DB-03 · BL-06).
  IF NOT (public.reward_retention_health() ->> 'cron_available')::boolean
     AND (public.reward_retention_health() ->> 'ok')::boolean THEN
    RAISE EXCEPTION 'P12: ok without pg_cron: %', public.reward_retention_health(); END IF;
END
$p1_p6$;

-- P12 티켓(BL-07 · DB2-03): 티켓은 0196 의 정리 작업이 소비 1일 뒤 · 만료 즉시 지운다. 그 작업이
-- 멈춰 하루 넘게 더 남은 티켓을 감시가 세야 한다(소비 3일 · 만료 92일 지난 것은 세고, 소비 12시간은
-- 세지 않는다). 정리 함수는 티켓을 지우지 않으므로 직접 넣고 센 뒤 치운다.
DO $p12_tickets$
BEGIN
  INSERT INTO public.reward_ssv_tickets
    (token_hash, user_id, reward_kind, expected_ad_unit_id, expected_reward_amount, expected_reward_item,
     issued_at, expires_at, consumed_transaction_id, consumed_at)
  VALUES
    (repeat('ab', 32), '30000000-0000-0000-0000-000000000211', 'reasoning', 'ca-app-pub-test/1', 1, 'credit',
     now() - interval '92 days', now() - interval '92 days' + interval '20 minutes', NULL, NULL),
    (repeat('ac', 32), '30000000-0000-0000-0000-000000000211', 'reasoning', 'ca-app-pub-test/1', 1, 'credit',
     now() - interval '3 days 1 hour', now() - interval '3 days 40 minutes', 'txn-p12-consumed-3d', now() - interval '3 days'),
    (repeat('ad', 32), '30000000-0000-0000-0000-000000000211', 'reasoning', 'ca-app-pub-test/1', 1, 'credit',
     now() - interval '13 hours', now() - interval '12 hours 40 minutes', 'txn-p12-consumed-12h', now() - interval '12 hours');
  IF (public.reward_retention_health() ->> 'overdue_reward_ssv_tickets')::int <> 2
     OR (public.reward_retention_health() ->> 'ok')::boolean THEN
    RAISE EXCEPTION 'P12: overdue tickets not reported as the 0196 contract says: %', public.reward_retention_health(); END IF;
  DELETE FROM public.reward_ssv_tickets WHERE token_hash IN (repeat('ab', 32), repeat('ac', 32), repeat('ad', 32));
END
$p12_tickets$;

SELECT public.release_reward_dispute_hold('txn-p90-old-held', 'ci', 'ci-approver') AS released;
SELECT public.purge_reward_records() AS run2;

DO $p3_p4$
DECLARE
  v_one constant uuid := '30000000-0000-0000-0000-000000000211';
BEGIN
  IF EXISTS (SELECT 1 FROM public.rewarded_ssv_txns WHERE transaction_id = 'txn-p90-old-held') THEN
    RAISE EXCEPTION 'P6: released txn kept'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.usage_counters
                  WHERE user_id = v_one AND reasoning_used = 7
                    AND reward_credits = 0 AND reward_consumed = 0 AND chat_ad_credits = 0) THEN
    RAISE EXCEPTION 'P3: usage_counters reward columns not zeroed or paid usage touched'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.chat_usage WHERE user_id = v_one AND count = 3 AND ad_bonus = 0) THEN
    RAISE EXCEPTION 'P4: chat_usage bonus not zeroed or count touched'; END IF;
  -- placed · reviewed · released. 해제된 보류 행이 정리로 지워질 때는 source_deleted 를 남기지
  -- 않는다(그 사건은 released 에서 끝났다, BL-04).
  IF (SELECT count(*) FROM public.reward_dispute_hold_events
       WHERE case_ref = 'CASE-T-001' AND transaction_id IS NULL) <> 3
     OR EXISTS (SELECT 1 FROM public.reward_dispute_hold_events
                 WHERE case_ref = 'CASE-T-001' AND action = 'source_deleted') THEN
    RAISE EXCEPTION 'P7: audit rows missing or still carry the transaction id'; END IF;
END
$p3_p4$;

-- P7: 활성 보류가 있어도 계정 삭제는 막히지 않는다.
SELECT public.place_reward_dispute_hold('txn-p90-new', 'store_dispute', 'CASE-T-002', 'ci', 'ci-approver') AS placed_two;
RESET request.jwt.claim.role;
-- 다른 계정 삭제 회귀 테스트(ad_reward · promo)와 같은 경로다. 0192 완료 펜스는 이 직접 DELETE 를
-- 막지 않는다(로컬 CI 재생 2026-10-04 실측).
DELETE FROM public.users WHERE id = '30000000-0000-0000-0000-000000000212';
DO $p7$
BEGIN
  IF EXISTS (SELECT 1 FROM public.reward_dispute_holds WHERE transaction_id = 'txn-p90-new')
     OR EXISTS (SELECT 1 FROM public.rewarded_ssv_txns WHERE transaction_id = 'txn-p90-new')
     OR EXISTS (SELECT 1 FROM public.reward_dispute_hold_events WHERE transaction_id IS NOT NULL) THEN
    RAISE EXCEPTION 'P7: hold blocked or outlived account deletion'; END IF;
  -- r2 BL2-01: 감사 시각은 실제로 일어난 시각이다. 이 파일은 한 트랜잭션이라 now() 였다면 두 시각이
  -- 같다. 계정 삭제의 source_deleted 가 placed 보다 늦어야 사건 종료일이 거꾸로 되지 않는다.
  IF NOT (SELECT max(at) FILTER (WHERE action = 'source_deleted') > max(at) FILTER (WHERE action = 'placed')
            FROM public.reward_dispute_hold_events WHERE case_ref = 'CASE-T-002') THEN
    RAISE EXCEPTION 'P7: audit time is the transaction start, not the event time'; END IF;
END
$p7$;

-- P15: S1 감사 기록 3년. CASE-T-001 은 해제(+정리) 뒤, CASE-T-002 는 계정 삭제 뒤 끝났다.
--   시각을 과거로 미는 데 session_replication_role 을 쓴다(덧붙이기 전용 트리거를 끄려고).
--   CI 는 이 파일을 postgres 슈퍼유저로 돌리고, 맨 위 auth.users 시드도 같은 설정을 쓴다.
SET LOCAL session_replication_role = replica;
UPDATE public.reward_dispute_hold_events SET at = at - interval '3 years 2 days' WHERE case_ref = 'CASE-T-001';
UPDATE public.reward_dispute_hold_events SET at = at - interval '3 years' + interval '2 days' WHERE case_ref = 'CASE-T-002';
-- 경계(DB-02): CASE-T-003 은 3년 + 1시간 전에 끝나 지워지고, CASE-T-004 는 3년 − 1시간 전에 끝나
-- 남는다. 여러 보류(BL-04): CASE-T-005 는 보류 A 를 3년 8일 전에 풀었지만 보류 B 가 3년 − 5일 전에
-- 해제 없이 지워졌다. 종료일은 B 쪽이므로 남는다(옛 식은 A 의 해제일을 골라 지웠다).
INSERT INTO public.reward_dispute_hold_events (case_ref, action, reason_code, actor, approved_by, actor_role, at) VALUES
  ('CASE-T-003', 'placed',         'user_dispute', 'ci',     'ci-approver', 'operator', now() - interval '3 years 10 days'),
  ('CASE-T-003', 'released',       'user_dispute', 'ci',     'ci-approver', 'operator', now() - interval '3 years 1 hour'),
  ('CASE-T-004', 'placed',         'user_dispute', 'ci',     'ci-approver', 'operator', now() - interval '3 years 10 days'),
  ('CASE-T-004', 'released',       'user_dispute', 'ci',     'ci-approver', 'operator', now() - interval '3 years' + interval '1 hour'),
  ('CASE-T-005', 'placed',         'user_dispute', 'ci',     'ci-approver', 'operator', now() - interval '3 years 10 days'),
  ('CASE-T-005', 'placed',         'user_dispute', 'ci',     'ci-approver', 'operator', now() - interval '3 years 9 days'),
  ('CASE-T-005', 'released',       'user_dispute', 'ci',     'ci-approver', 'operator', now() - interval '3 years 8 days'),
  ('CASE-T-005', 'source_deleted', 'user_dispute', 'system', NULL,          'system',   now() - interval '3 years' + interval '5 days');
SET LOCAL session_replication_role = origin;
SET LOCAL request.jwt.claim.role = 'service_role';
DO $p15$
DECLARE r jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.reward_dispute_hold_events WHERE case_ref = 'CASE-T-002' AND action = 'source_deleted') THEN
    RAISE EXCEPTION 'P15: account deletion end not logged'; END IF;
  r := public.purge_reward_records();
  -- CASE-T-001 세 행 + CASE-T-003 두 행.
  IF (r ->> 'hold_audit_rows')::int <> 5
     OR EXISTS (SELECT 1 FROM public.reward_dispute_hold_events WHERE case_ref IN ('CASE-T-001', 'CASE-T-003'))
     OR NOT EXISTS (SELECT 1 FROM public.reward_dispute_hold_events WHERE case_ref = 'CASE-T-002')
     OR NOT EXISTS (SELECT 1 FROM public.reward_dispute_hold_events WHERE case_ref = 'CASE-T-004')
     OR (SELECT count(*) FROM public.reward_dispute_hold_events WHERE case_ref = 'CASE-T-005') <> 4 THEN
    RAISE EXCEPTION 'P15: 3-year audit purge wrong: %', r; END IF;
  IF (public.reward_retention_health() ->> 'overdue_hold_audit_cases')::int <> 0 THEN
    RAISE EXCEPTION 'P15: health counts a case the purge keeps: %', public.reward_retention_health(); END IF;
END
$p15$;
RESET request.jwt.claim.role;

-- P9 · P11
DO $p9$
DECLARE v_ok boolean;
BEGIN
  IF (SELECT prosrc FROM pg_proc WHERE oid = 'public.purge_reward_records(integer,integer)'::regprocedure) !~ 'make_interval\(days => 89\)'
     OR (SELECT prosrc FROM pg_proc WHERE oid = 'public.purge_reward_records(integer,integer)'::regprocedure) !~ 'make_interval\(years => 3\)'
     OR (SELECT prosrc FROM pg_proc WHERE oid = 'public.prune_reward_ssv_tickets()'::regprocedure) !~ 'make_interval\(days => 1\)'
     -- 0213(PR-7b) 뒤에만. '…'::regprocedure 는 짧게 끊겨도 계획 단계에서 평가돼 함수가 없으면
     -- 실패하므로 to_regprocedure 로 찾는다(없으면 NULL 이라 이 줄은 참이 되지 않는다).
     OR (to_regprocedure('public.reward_ssv_callback_is_fresh(text,bigint)') IS NOT NULL
         AND (SELECT prosrc FROM pg_proc WHERE oid = to_regprocedure('public.reward_ssv_callback_is_fresh(text,bigint)')) !~ 'make_interval\(days => 1\)') THEN
    RAISE EXCEPTION 'P9: retention / replay window invariant changed'; END IF;
  IF to_regclass('cron.job') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM cron.job WHERE jobname = $1 AND schedule = $2 AND active)'
      INTO v_ok USING 'purge-reward-records-90d', '37 19 * * *';
    IF NOT v_ok THEN RAISE EXCEPTION 'P11: cron job missing'; END IF;
  END IF;
END
$p9$;

-- P10 (PR-7b, 0213): 콜백 timestamp 신선도. 자릿수로 단위를 정한다(ADMOB-TS ②: 10 = 초,
--   13 = 밀리초, 16 = 마이크로초, 그 밖은 거부). 0213 이 없으면(PR-7a 단독) 건너뛴다.
--   같은 사례가 scripts/check-reward-ssv-db.sh 끝 절과 local-smoke/10_scenarios.sql $fresh$ 에 있다.
--   주의: 지금 발급한 티켓으로는 2일 전 값이 "발급 5분 전보다 이르다" 검사에 먼저 걸려서 1일 창이
--   맞는지 보이지 않는다. 그래서 1일 창은 티켓 발급 시각을 3일 전으로 돌려 따로 본다
--   (그 창을 100일로 바꾼 변이로 확인했다).
SET LOCAL request.jwt.claim.role = 'service_role';
DO $p10$
DECLARE
  v_one constant uuid := '30000000-0000-0000-0000-000000000211';
  c_ticket constant text := pg_catalog.repeat('a1', 32);
  now_ms constant bigint := (extract(epoch FROM pg_catalog.now()) * 1000)::bigint;
  day_ms constant bigint := 86400000;
  n integer;
BEGIN
  IF to_regprocedure('public.settle_reward_ssv_ticket_v3(text,text,text,integer,text,bigint)') IS NULL THEN
    RETURN;
  END IF;
  IF NOT public.issue_reward_ssv_ticket(v_one, 'reasoning', c_ticket, 'ci-ad-unit', 2, 'reasoning credit') THEN
    RAISE EXCEPTION 'P10: ticket not issued'; END IF;

  IF NOT public.reward_ssv_callback_is_fresh(c_ticket, now_ms / 1000)
     OR NOT public.reward_ssv_callback_is_fresh(c_ticket, now_ms)
     OR NOT public.reward_ssv_callback_is_fresh(c_ticket, now_ms * 1000 + 123) THEN
    RAISE EXCEPTION 'P10: a fresh 10/13/16-digit timestamp was refused'; END IF;
  IF public.reward_ssv_callback_is_fresh(c_ticket, (now_ms + 3600000) * 1000)
     OR public.reward_ssv_callback_is_fresh(c_ticket, (now_ms - 600000) / 1000)
     OR public.reward_ssv_callback_is_fresh(c_ticket, now_ms / 10)
     OR public.reward_ssv_callback_is_fresh(c_ticket, now_ms / 10000)
     OR public.reward_ssv_callback_is_fresh(c_ticket, now_ms * 10000)
     OR public.reward_ssv_callback_is_fresh(c_ticket, 0)
     OR public.reward_ssv_callback_is_fresh(c_ticket, -now_ms)
     OR public.reward_ssv_callback_is_fresh(c_ticket, NULL) THEN
    RAISE EXCEPTION 'P10: future, pre-ticket, wrong-digit, 0, negative or NULL timestamp accepted'; END IF;

  UPDATE public.reward_ssv_tickets SET issued_at = pg_catalog.now() - interval '3 days'
   WHERE token_hash = c_ticket;
  IF public.reward_ssv_callback_is_fresh(c_ticket, (now_ms - 2 * day_ms) / 1000)
     OR public.reward_ssv_callback_is_fresh(c_ticket, now_ms - 2 * day_ms)
     OR public.reward_ssv_callback_is_fresh(c_ticket, (now_ms - 2 * day_ms) * 1000)
     OR public.reward_ssv_callback_is_fresh(c_ticket, now_ms - 91 * day_ms) THEN
    RAISE EXCEPTION 'P10: a callback older than one day was accepted'; END IF;
  IF NOT public.reward_ssv_callback_is_fresh(c_ticket, now_ms - 3600000) THEN
    RAISE EXCEPTION 'P10: an hour-old callback was refused'; END IF;
  UPDATE public.reward_ssv_tickets SET issued_at = pg_catalog.now() WHERE token_hash = c_ticket;

  SELECT count(*) INTO n FROM public.settle_reward_ssv_ticket_v3(
    c_ticket, 'txn-p90-v3', 'ci-ad-unit', 2, 'reasoning credit', now_ms / 10);
  IF n <> 0 THEN RAISE EXCEPTION 'P10: v3 paid a 12-digit timestamp'; END IF;
  SELECT count(*) INTO n FROM public.settle_reward_ssv_ticket_v3(
    c_ticket, 'txn-p90-v3', 'ci-ad-unit', 2, 'reasoning credit', now_ms - 91 * day_ms);
  IF n <> 0 THEN RAISE EXCEPTION 'P10: v3 paid a 91-day-old timestamp'; END IF;
  SELECT count(*) INTO n FROM public.settle_reward_ssv_ticket_v3(
    c_ticket, 'txn-p90-v3', 'ci-ad-unit', 2, 'reasoning credit', now_ms);
  IF n <> 1 THEN RAISE EXCEPTION 'P10: v3 did not pay a fresh callback'; END IF;
END
$p10$;
RESET request.jwt.claim.role;

ROLLBACK;
