-- 0255 를 되돌린다: 턴에 묶인 환불 함수 · 프록시가 부르는 확인 함수 · 예약을 주는 올리기 · 최종 값을 보는 트리거 ·
-- 예약 표를 걷고, 0252 의 함수 둘을 그대로 되돌린다. 표 chat_turn_refunds 와 이미 쓴 줄, 원장은 건드리지 않는다.
-- 아래 두 함수 본문은 0252 의 파일에서 글자 그대로 가져온 것이다(정적 테스트가 같은지 본다).
-- 되돌린 뒤에는 날짜 하나를 받는 환불 함수가 다시 열린다(턴에 묶이지 않은 길). 순서: 화면을 먼저 되돌리고(새 올리기와
-- 새 환불을 부르는 호출은 "함수 없음"으로 실패한다), 프록시를 되돌린 뒤(확인 호출은 실패해도 답을 그대로 보낸다) 이 파일을
-- 실행할 것. 삭제 등록부의 줄(0258)은 rollback/0258_down.sql 이 먼저 걷는다.
-- 걷는 표에 든 것은 예약 번호 · 날짜 · 시각뿐이다(글 · 내용 없음). 걷으면 아직 돌려받지 않은 턴은 돌려받을 수 없게 된다.

DROP TRIGGER IF EXISTS guard_ai_audit_server_verified_final ON public.ai_audit_log;
DROP FUNCTION IF EXISTS public.guard_ai_audit_server_verified_final();
DROP FUNCTION IF EXISTS public.refund_chat_turn_after_output_swap(uuid);
DROP FUNCTION IF EXISTS public.claim_chat_turn_for_audit(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.bump_chat_usage_for_turn(uuid, date);
DROP TABLE IF EXISTS public.chat_turn_reservations;

CREATE OR REPLACE FUNCTION public.guard_ai_audit_server_verified()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_role text;
BEGIN
  IF NEW.event_source IS DISTINCT FROM 'server_verified' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.event_source IS NOT DISTINCT FROM 'server_verified' THEN
    RETURN NEW;
  END IF;
  -- The role the request came in with. SECURITY DEFINER changes current_user, not this setting, and
  -- a function running with its owner's rights cannot change it. The JWT's own role claim is read
  -- as well (0112: the claims live in request.jwt.claims on the current stack).
  v_role := pg_catalog.current_setting('role', true);
  IF v_role IN ('authenticated', 'anon')
     OR COALESCE(
          NULLIF(pg_catalog.current_setting('request.jwt.claim.role', true), ''),
          NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
        ) IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'ai_audit_log: a signed-in request cannot write a server_verified row'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_ai_audit_server_verified() FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.refund_chat_turn_after_output_swap(p_day date)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user  uuid := auth.uid();
  v_now   timestamptz := pg_catalog.clock_timestamp();
  v_today date := (v_now AT TIME ZONE 'Asia/Seoul')::date;
  v_audit uuid;
  v_count int;
  v_hit   text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not signed in' USING ERRCODE = '42501';
  END IF;
  -- The client bumps with its KST date. A turn sent just before midnight is answered just after.
  IF p_day IS NULL OR p_day NOT IN (v_today, v_today - 1) THEN
    RETURN NULL;
  END IF;

  -- One refund decision at a time per user: the later call waits, then sees what the earlier one used.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('chat_turn_refund:' || v_user::text, 0));

  SELECT a.id
    INTO v_audit
    FROM public.ai_audit_log AS a
   WHERE a.user_id = v_user
     AND a.event_source = 'server_verified'
     AND a.purpose = 'secondb_chat'
     AND a.safety_zone = 'red'
     AND a.created_at >= v_now - interval '10 minutes'
     AND a.created_at <= v_now
     AND NOT EXISTS (SELECT 1 FROM public.chat_turn_refunds AS used WHERE used.audit_id = a.id)
   ORDER BY a.created_at DESC, a.id
   LIMIT 1;

  IF v_audit IS NULL THEN
    RETURN NULL;
  END IF;

  BEGIN
    -- The primary key is what lets one audit row count once, whatever snapshot this call read.
    INSERT INTO public.chat_turn_refunds (audit_id, day) VALUES (v_audit, p_day);

    UPDATE public.chat_usage AS cu
       SET count = cu.count - 1
     WHERE cu.user_id = v_user
       AND cu.day = p_day
       AND cu.count > 0
    RETURNING cu.count INTO v_count;

    IF v_count IS NULL THEN
      -- Nothing to give back on that day: undo the mark so the row stays usable for the right day.
      RAISE EXCEPTION 'no turn to give back' USING ERRCODE = 'ZC252';
    END IF;
  EXCEPTION
    WHEN unique_violation THEN
      -- Only the ledger's own primary key means "this row was used already".
      GET STACKED DIAGNOSTICS v_hit = CONSTRAINT_NAME;
      IF v_hit IS NOT DISTINCT FROM (SELECT c.conname FROM pg_catalog.pg_constraint AS c
                                      WHERE c.conrelid = 'public.chat_turn_refunds'::regclass AND c.contype = 'p') THEN
        RETURN NULL;
      END IF;
      RAISE;
    WHEN SQLSTATE 'ZC252' THEN
      RETURN NULL;
  END;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.refund_chat_turn_after_output_swap(date) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.refund_chat_turn_after_output_swap(date) TO authenticated;
