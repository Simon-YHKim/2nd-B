-- 0213_reward_ssv_callback_freshness.sql
-- 초안(Hadrianus, 2026-10-04). 통합 후보일 뿐이다: push 직전에 번호를 다시 확인한다.
-- v2(19:32 KST): 0212 를 PR-7a 의 registry 사유 수정(W6)에 내주고 0213 으로 옮겼다(옛 0212).
-- v3(2026-10-04 21:08 KST): Simon ADMOB-TS 결정 ②(21:06 KST). timestamp 단위를 자릿수로 판단한다:
--   10자리 = 초(×1000), 13자리 = 밀리초, 16자리 = 마이크로초(÷1000). 그 밖의 자릿수는 거부.
--   인수 이름을 p_callback_ts_ms → p_callback_ts 로 바꿨다(받은 값을 그대로 넘긴다. 단위 변환은 DB 가 한다).
--   받은 자릿수는 Edge(W4)가 로그에 남긴다(자릿수만). DB 는 로그를 쓰지 않는다: RAISE LOG 는 서버 로그에
--   STATEMENT 줄(호출 SQL 전문, 값 포함 가능)을 함께 남기므로 "값을 남기지 않는다"를 지킬 수 없다(로컬 실측).
--   GO-5 스모크에서 실제 자릿수를 잰 뒤 후속 마이그레이션(GO-5b)으로 허용 자릿수를 하나로 좁힌다.
--
-- 90일이 지난 SSV 콜백 재전송을 DB 에서도 거부한다 (Gaius v5 §1-3-2 의 3번, PR-7).
--
-- 지금(0196)의 막는 장치는 서버 발급 티켓 하나다: 티켓은 20분 뒤 만료되고, 소비된 티켓은
-- 1일 뒤 지워지므로 90일 뒤 같은 콜백은 claim 단계에서 403 이 난다. rewarded_ssv_txns
-- (거래 ID 중복 제거)는 1일 창 안의 재시도만 막는다. 0211 이 89일 뒤 rewarded_ssv_txns 를
-- 지우면, 티켓 장치 하나가 깨졌을 때(예: 티켓 보관을 늘리거나 티켓 없는 옛 경로를 되살림)
-- 지워진 거래 ID 를 다시 쓸 수 있게 된다. 그래서 두 번째 장치를 둔다:
--
--   AdMob 콜백의 timestamp(서명 범위 안. 자릿수로 단위를 판단해 밀리초로 바꾼 값)가
--     - 지금보다 1일 넘게 오래됐거나(> c_max_age),
--     - 지금보다 5분 넘게 미래이거나,
--     - 그 티켓의 issued_at 보다 5분 넘게 이르면
--   지급하지 않는다(행 0개를 돌려준다. Edge 는 지금처럼 403 invalid_or_expired_ticket).
--
-- 1일은 89일보다 훨씬 짧다. 따라서 "정리된(89일 지난) 거래 ID 로 다시 지급" 은 서명된
-- 신선한 timestamp 가 필요하고, 서명은 Google 키로만 만들 수 있으므로 불가능하다.
-- 거래 ID 자체를 해시로 오래 남기는 묘비 표(tombstone)는 두지 않는다(방침의 90일 파기와
-- 부딪힌다. 필요하면 Legal 확인 뒤 별도 마이그레이션).
--
-- 배포 순서(온라인 호환): 이 파일은 v3 를 "추가"만 한다. v2 는 그대로 둔다.
--   1) 0213 적용 → 2) rewarded-ssv Edge 가 v3 를 부르도록 배포·스모크 →
--   3) 후속 마이그레이션(0214 초안, PLAN.md)으로 v2 의 service_role EXECUTE 를 걷는다.
--
-- 최상위 BEGIN/COMMIT 을 두지 않는다(Supabase CLI 트랜잭션).

SET LOCAL lock_timeout = '10s';

DO $preconditions$
BEGIN
  IF to_regprocedure('public.settle_reward_ssv_ticket_v2(text,text,text,integer,text)') IS NULL
     OR to_regclass('public.reward_ssv_tickets') IS NULL THEN
    RAISE EXCEPTION '0213 requires 0196 (settle_reward_ssv_ticket_v2) to be applied first';
  END IF;
END
$preconditions$;

CREATE OR REPLACE FUNCTION public.reward_ssv_callback_is_fresh(
  p_token_hash text,
  p_callback_ts bigint
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c_max_age  constant interval := make_interval(days => 1);    -- 0211 의 89일보다 반드시 짧게(D3: 1일 확정)
  c_skew     constant interval := make_interval(mins => 5);
  -- ADMOB-TS ②: 허용 자릿수. GO-5 실측 뒤 후속 마이그레이션(GO-5b)에서 하나만 남긴다.
  c_allowed_digits constant integer[] := ARRAY[10, 13, 16];
  v_now      timestamptz := now();
  v_digits   integer;
  v_ms       bigint;
  v_cb       timestamptz;
  v_issued   timestamptz;
BEGIN
  -- AdMob 문서는 "epoch 밀리초"라고 하지만 예시 값은 16자리라서 자릿수로 단위를 정한다(ADMOB-TS ②).
  -- 같은 검사가 Edge reward-contract.ts 에도 있다(이중 방어).
  IF p_callback_ts IS NULL OR p_callback_ts <= 0 THEN
    RETURN false;
  END IF;
  v_digits := pg_catalog.length(p_callback_ts::text);
  IF NOT (v_digits = ANY (c_allowed_digits)) THEN
    RETURN false;
  END IF;
  v_ms := CASE v_digits
            WHEN 10 THEN p_callback_ts * 1000     -- 초
            WHEN 13 THEN p_callback_ts            -- 밀리초
            WHEN 16 THEN p_callback_ts / 1000     -- 마이크로초(정수 나눗셈, 1ms 미만 버림)
          END;
  v_cb := pg_catalog.to_timestamp(v_ms::numeric / 1000);

  IF v_cb > v_now + c_skew OR v_cb < v_now - c_max_age THEN
    RETURN false;
  END IF;

  SELECT t.issued_at INTO v_issued
    FROM public.reward_ssv_tickets AS t
   WHERE t.token_hash = p_token_hash;
  IF NOT FOUND OR v_cb < v_issued - c_skew THEN
    RETURN false;
  END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.settle_reward_ssv_ticket_v3(
  p_token_hash text,
  p_txn_id text,
  p_ad_unit_id text,
  p_reward_amount integer,
  p_reward_item text,
  p_callback_ts bigint
)
RETURNS TABLE(reward_kind text, reward_total integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF public.billing_request_role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role only' USING ERRCODE = '42501';
  END IF;
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$'
     OR NOT public.reward_ssv_callback_is_fresh(p_token_hash, p_callback_ts) THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT s.reward_kind, s.reward_total
      FROM public.settle_reward_ssv_ticket_v2(
             p_token_hash, p_txn_id, p_ad_unit_id, p_reward_amount, p_reward_item) AS s;
END;
$$;

REVOKE ALL ON FUNCTION public.reward_ssv_callback_is_fresh(text, bigint)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.settle_reward_ssv_ticket_v3(text, text, text, integer, text, bigint)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.settle_reward_ssv_ticket_v3(text, text, text, integer, text, bigint)
  TO service_role;

COMMENT ON FUNCTION public.settle_reward_ssv_ticket_v3(text, text, text, integer, text, bigint) IS
  '0213: v2 앞에 콜백 timestamp 신선도 검사(자릿수로 단위 판단: 10=초, 13=밀리초, 16=마이크로초, 그 밖은 거부. 1일 이내, 미래 5분 이내, 티켓 발급 5분 전 이후)를 둔다. 0211 이 89일 뒤 rewarded_ssv_txns 를 지워도 지워진 거래 ID 로 다시 지급할 수 없게 하는 두 번째 장치. 불변식: c_max_age(1일) < 89일 정리 기간(D3 1일 확정).';

DO $postcondition$
BEGIN
  IF (SELECT p.prosrc FROM pg_catalog.pg_proc AS p
       WHERE p.oid = 'public.reward_ssv_callback_is_fresh(text,bigint)'::regprocedure)
       !~ 'make_interval\(days => 1\)'
     OR (SELECT p.prosrc FROM pg_catalog.pg_proc AS p
          WHERE p.oid = 'public.reward_ssv_callback_is_fresh(text,bigint)'::regprocedure)
          !~ 'ARRAY\[10, 13, 16\]'
     OR has_function_privilege('anon', 'public.settle_reward_ssv_ticket_v3(text,text,text,integer,text,bigint)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.settle_reward_ssv_ticket_v3(text,text,text,integer,text,bigint)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.settle_reward_ssv_ticket_v3(text,text,text,integer,text,bigint)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.reward_ssv_callback_is_fresh(text,bigint)', 'EXECUTE') THEN
    RAISE EXCEPTION '0213: callback freshness postcondition failed';
  END IF;
END
$postcondition$;
