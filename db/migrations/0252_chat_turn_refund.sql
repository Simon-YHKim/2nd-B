-- 0252: 답이 위기 안내로 바뀐 대화 턴의 횟수를 돌려준다 (Z46).
--
-- 근거: Device Lab Z46(평범한 질문의 답이 위기 안내로 바뀌었는데 하루 대화 횟수도 깎임) ·
--   Simon 답 Q-261013-34 의 셋째 축 "안내로 바뀐 턴의 횟수: 차감하지 않기"
--   (2026-10-13 10:36 KST 「Q-34·Q-35 둘 다 추천대로 진행해」).
-- 사실: 대화는 모델을 부르기 전에 bump_chat_usage_if_under_cap 으로 횟수를 올린다(경합을 닫으려고).
--   답이 바뀌는지는 호출 뒤에야 알 수 있어, 깎인 횟수를 되돌리는 길이 없었다
--   (src/lib/chat/conversation.ts 의 주석 "A future PR can add a refund RPC if it matters").
--
-- 하는 일
--   refund_chat_turn_after_output_swap(p_day): 로그인한 사용자의 그날 횟수를 1 내리고 새 횟수를 돌려준다.
--   근거가 있을 때만 내린다. 근거 = 프록시가 쓴 감사 줄 하나:
--     ai_audit_log 에서 그 사용자의 event_source = 'server_verified' · purpose = 'secondb_chat' ·
--     safety_zone = 'red' · 만든 지 10분 안 · 아직 환불에 쓰지 않은 줄.
--   server_verified 줄은 클라이언트가 쓸 수 없다(0181: authenticated 는 표에 직접 쓰지 못하고,
--   클라이언트용 RPC 는 client_unverified 로만 적는다). 그래서 화면이 "답이 바뀌었다"고 말하는 것만으로는
--   횟수가 돌아오지 않는다.
--   한 줄은 한 번만 쓴다: 쓴 줄의 id 를 chat_turn_refunds 에 넣고 그 id 가 기본 키다. 두 호출이 같은 줄을
--   고르면 둘째의 INSERT 가 기본 키에 걸린다. 호출한 쪽의 격리 수준이 무엇이든 같다(읽은 스냅샷이 아니라
--   제약이 막는다). 같은 사용자의 호출은 advisory 잠금으로 한 줄씩 처리해, 뒤의 호출이 앞의 것을 본 뒤
--   다른 안 쓴 줄을 고를 수 있게 한다.
--   돌려줄 것이 없으면 NULL 을 돌려주고 아무것도 바꾸지 않는다(근거 없음 · 그날 횟수 0 · p_day 가
--   KST 오늘이나 어제가 아님). 그날 횟수가 0 이라 못 돌려준 경우에는 근거도 쓰지 않은 채로 남긴다.
--
-- chat_turn_refunds 에 소유자 칸이 없는 이유: 누구의 것인지는 감사 줄이 안다(audit_id 가 그 줄을
--   가리키고, 감사 줄이 지워지면 같이 지워진다). 이 표는 "이 감사 줄은 이미 썼다"는 표시만 담는다.
--
-- 하지 않는 일
--   - 입력이 걸려 모델을 부르지 않은 턴은 여기서 다루지 않는다(서버 근거가 없다 · 화면 쪽 일).
--   - ad_bonus 와 월 한도는 건드리지 않는다.
--   - 프록시의 답 쪽 판정(hasCrisisTerm)과 화면의 교체 판정이 다르면 "바뀌었는데 근거 없음"이 날 수 있다.
--     그 어긋남은 이 파일이 맞추지 않는다.
--
-- 남용: 하루 한도는 클라이언트가 호출 전에 RPC 를 부르는 것으로만 걸리고 프록시는 chat_usage 를 보지
--   않는다. 그래서 이 함수는 한도를 새로 뚫지 않는다(비용의 상한은 프록시의 지출 · 용량 가드다).
-- 권한: SECURITY DEFINER · authenticated 만 EXECUTE. chat_turn_refunds 는 정책 없는 RLS 이고 API 역할의
--   표 권한을 모두 회수한다(이 함수만 읽고 쓴다). ai_audit_log 는 FORCE RLS 이므로 소유자 역할이 행 보안을
--   건너뛸 때만 근거가 보인다(운영 postgres = BYPASSRLS). 안 보이면 NULL 로 끝난다(닫힌 쪽).
-- 시각: 10분 창과 KST 날짜는 함수가 불린 순간의 시계로 잰다(트랜잭션이 시작된 시각이 아니다).
-- 되돌리기: rollback/0252_down.sql 은 함수만 걷고 표는 남긴다. 표를 같이 걷으면 방금 쓴 근거가
--   다시 적용한 뒤 한 번 더 쓰인다.

CREATE TABLE IF NOT EXISTS public.chat_turn_refunds (
  audit_id    uuid PRIMARY KEY REFERENCES public.ai_audit_log (id) ON DELETE CASCADE,
  day         date NOT NULL,
  refunded_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.chat_turn_refunds IS
  'ai_audit_log rows already used to give a chat turn back (0252). One row is used once; the primary key enforces it.';

ALTER TABLE public.chat_turn_refunds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.chat_turn_refunds FROM PUBLIC, anon, authenticated, service_role;

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
      RETURN NULL;
    WHEN SQLSTATE 'ZC252' THEN
      RETURN NULL;
  END;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.refund_chat_turn_after_output_swap(date) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.refund_chat_turn_after_output_swap(date) TO authenticated;
