-- 0255: 대화 횟수 환불을 "그 턴의 근거 줄"에 묶는다 (0252 의 후속 · Z46).
--
-- 근거: Simon 2026-10-13 10:36 KST 「Q-34·Q-35 둘 다 추천대로 진행해」(원문은 여기까지다). 환불을 서버가
--   확인해 되돌린다는 것이 그 추천안이고(13:17 Q-34 「차감하지 않는다(서버에서 확인해 되돌림)」), 0252 가 그
--   함수를 만들었다. 이 파일의 구체안은 구현한 창(2ndb-e7)과 화면을 맡은 창(2ndb-79)이 정했다.
-- 사실: 0252 의 함수는 "그 사용자의 10분 안 · 안 쓴 근거 줄 가운데 가장 새 것"을 고른다. 그래서 화면이 본
--   턴과 함수가 쓰는 근거가 같은 턴이라는 보장이 없다. 지금 턴의 근거가 없거나 늦으면 앞선 턴의 근거를 쓰고,
--   자정 앞뒤에는 어제 턴의 근거로 오늘 횟수를 내릴 수 있다(화면 쪽 PR #2425 의 독립 검토 2회차가 막은 지적).
--   0252 의 독립 검토 4회차가 잔여로 남긴 우려 셋도 이 표와 이 함수에 관한 것이다.
--
-- 하는 일
--   1. refund_chat_turn_after_output_swap(p_day, p_audit_id): 프록시가 응답에 실어 준 근거 줄의 id 를 받아
--      **그 줄 하나만** 본다. 본인 것 · server_verified · secondb_chat · red · 10분 안 · 아직 안 쓴 것이어야
--      하고, p_day 는 그 줄의 KST 날짜여야 한다. 예외 하나: 자정을 넘겨 답이 온 턴은 횟수를 전날에 셌으므로,
--      그 줄이 KST 0시 10분 전에 생겼으면 전날도 받는다. 맞지 않으면 NULL 이고 아무것도 바꾸지 않는다.
--      돌려주는 값 · 한 번만 쓰이게 하는 방법(원장의 기본 키) · 부르는 쪽의 약속(40001 이면 다시 · 끝에 남은
--      횟수를 다시 읽기)은 0252 와 같다.
--   2. 인자 하나짜리 refund_chat_turn_after_output_swap(p_day) 는 없앤다. 부르는 앱이 없고(화면 쪽은 아직
--      머지 전이다), 남겨 두면 턴에 묶이지 않은 길이 하나 더 열려 있게 된다.
--   3. 감사 표의 표시를 지키는 트리거를 최종 상태까지 보게 한다(4회차 Z46D-01): 지금의 BEFORE 트리거는
--      event_source 를 적은 UPDATE 에만 돈다. 다른 BEFORE 트리거가 표시를 바꾸거나, 이미 server_verified 인
--      줄의 근거 칸(id · user_id · event_source · purpose · safety_zone · created_at)을 로그인한 요청이
--      바꾸는 경우를 AFTER 트리거가 최종 값으로 보고 거절한다. 프록시(service_role)와 역할 없는 세션은 그대로다.
--      예외 하나: 주인만 비워지는 수정(user_id → NULL · 다른 근거 칸은 그대로)은 어느 역할이든 둔다. 계정이 지워질 때
--      외래 키(0011: ON DELETE SET NULL)가 하는 수정이고, 주인 없는 줄은 누구의 근거도 못 된다(함수는 본인 줄만 본다).
--      지금 계정 삭제는 관리자 API 로 돌아 이 트리거에 걸리지 않지만, 삭제가 로그인한 요청으로 도는 날에도 막히면 안 된다.
--   4. 요청의 역할을 읽는 순서를 바꾼다(Z46D-03): 먼저 role 설정을 보고, JWT claims 는 JSON 으로 읽히지 않으면
--      "주장 없음"으로 본다. 전에는 JSON 이 아닌 글자가 들어 있으면 서버 쪽 감사 쓰기까지 22P02 로 끝났다.
--   5. 원장 표의 기본 키가 미룰 수 있는(DEFERRABLE) 꼴이면 멈춘다(Z46D-02). 미뤄진 기본 키는 충돌을 커밋 때
--      내므로 "한 번만"을 함수 안에서 잡지 못한다.
--
-- 하지 않는 일
--   - 사용자 글이 걸려 모델을 부르지 않은 턴은 여전히 다루지 않는다(Q-261013-67 · 따로 한다). 프록시가 입력을 막을
--     때 근거 줄을 쓰려면 서버가 정하는 상한이 같이 있어야 한다(상한 없이 쓰면 걸리는 글을 보내는 만큼 근거가
--     생긴다). 그 상한은 이 파일에 없다. 같은 PR 의 프록시 변경은 답이 나온 턴의 응답에 그 턴의 근거 줄 id 를
--     싣는 것 하나다(supabase/functions 의 프록시 넷 · 줄이 실제로 쓰였을 때만).
--   - 표(chat_turn_refunds)와 이미 쓴 줄은 건드리지 않는다.
-- 권한: 새 함수는 authenticated 만 EXECUTE. 트리거 함수는 누구도 직접 부를 수 없다.
-- 되돌리기: rollback/0255_down.sql 이 새 함수와 AFTER 트리거를 걷고 0252 의 함수 둘을 그대로 되돌린다.

-- 5. The ledger's primary key must raise at the INSERT, not at commit.
DO $shape0255$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint AS c
                  WHERE c.conrelid = 'public.chat_turn_refunds'::regclass
                    AND c.contype = 'p' AND NOT c.condeferrable AND NOT c.condeferred) THEN
    RAISE EXCEPTION '0255: chat_turn_refunds must have a primary key that is not deferrable'
      USING ERRCODE = '55000';
  END IF;
END
$shape0255$;

-- 4 (and the BEFORE half of 3). Same rule as 0252, with the role read first and the claims read safely.
CREATE OR REPLACE FUNCTION public.guard_ai_audit_server_verified()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_role  text;
  v_claim text;
BEGIN
  IF NEW.event_source IS DISTINCT FROM 'server_verified' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.event_source IS NOT DISTINCT FROM 'server_verified' THEN
    RETURN NEW;
  END IF;
  -- The role the request came in with. SECURITY DEFINER changes current_user, not this setting, and
  -- a function running with its owner's rights cannot change it.
  v_role := pg_catalog.current_setting('role', true);
  IF v_role IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'ai_audit_log: a signed-in request cannot write a server_verified row'
      USING ERRCODE = '42501';
  END IF;
  -- The JWT's own role claim (0112: the claims live in request.jwt.claims on the current stack).
  -- Text that is not JSON carries no claim; it must not fail a server-side write.
  v_claim := NULLIF(pg_catalog.current_setting('request.jwt.claim.role', true), '');
  IF v_claim IS NULL THEN
    BEGIN
      v_claim := NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
    EXCEPTION WHEN invalid_text_representation THEN
      v_claim := NULL;
    END;
  END IF;
  IF v_claim IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'ai_audit_log: a signed-in request cannot write a server_verified row'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_ai_audit_server_verified() FROM PUBLIC, anon, authenticated, service_role;

-- 3. The final row. A BEFORE trigger that runs later than the guard, or an UPDATE that does not name
-- event_source, can still end with a server_verified row the guard never saw. This one reads what
-- was actually stored: a signed-in or anonymous request may not end an INSERT or UPDATE with a
-- server_verified row it created or promoted, nor change the evidence columns of one that exists.
CREATE OR REPLACE FUNCTION public.guard_ai_audit_server_verified_final()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_role  text;
  v_claim text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.event_source IS DISTINCT FROM 'server_verified' THEN
      RETURN NULL;
    END IF;
  ELSE
    IF NEW.event_source IS DISTINCT FROM 'server_verified'
       AND OLD.event_source IS DISTINCT FROM 'server_verified' THEN
      RETURN NULL;
    END IF;
    -- A server row that keeps every evidence column is not this trigger's business. Nor is one that
    -- only loses its owner: deleting an account clears user_id through the foreign key (0011: ON
    -- DELETE SET NULL), in whatever role that deletion runs, and a row without an owner is nobody's
    -- evidence (the refund reads the caller's own row).
    IF OLD.event_source IS NOT DISTINCT FROM 'server_verified'
       AND NEW.event_source IS NOT DISTINCT FROM OLD.event_source
       AND NEW.id          IS NOT DISTINCT FROM OLD.id
       AND (NEW.user_id    IS NOT DISTINCT FROM OLD.user_id OR NEW.user_id IS NULL)
       AND NEW.purpose     IS NOT DISTINCT FROM OLD.purpose
       AND NEW.safety_zone IS NOT DISTINCT FROM OLD.safety_zone
       AND NEW.created_at  IS NOT DISTINCT FROM OLD.created_at THEN
      RETURN NULL;
    END IF;
  END IF;
  v_role := pg_catalog.current_setting('role', true);
  IF v_role IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'ai_audit_log: a signed-in request cannot write or change a server_verified row'
      USING ERRCODE = '42501';
  END IF;
  v_claim := NULLIF(pg_catalog.current_setting('request.jwt.claim.role', true), '');
  IF v_claim IS NULL THEN
    BEGIN
      v_claim := NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
    EXCEPTION WHEN invalid_text_representation THEN
      v_claim := NULL;
    END;
  END IF;
  IF v_claim IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'ai_audit_log: a signed-in request cannot write or change a server_verified row'
      USING ERRCODE = '42501';
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_ai_audit_server_verified_final() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS guard_ai_audit_server_verified_final ON public.ai_audit_log;
CREATE TRIGGER guard_ai_audit_server_verified_final
  AFTER INSERT OR UPDATE ON public.ai_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.guard_ai_audit_server_verified_final();

-- The day rule on its own, so a test can ask it about any moment without waiting for midnight.
-- p_made is the audit row's creation time on the KST clock. The day a turn was counted on is that
-- row's day. A turn sent just before midnight is answered just after: its row is made in the first
-- minutes of the next day, so the day before is accepted for a row made before 00:10 and for no other.
CREATE OR REPLACE FUNCTION public.chat_turn_refund_day_matches(p_day date, p_made timestamp)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT p_day IS NOT NULL AND p_made IS NOT NULL
     AND (p_day = p_made::date
          OR (p_day = p_made::date - 1 AND p_made::time < time '00:10'))
$$;

REVOKE ALL ON FUNCTION public.chat_turn_refund_day_matches(date, timestamp) FROM PUBLIC, anon, authenticated, service_role;

-- 1. The refund, bound to the audit row of its own turn.
CREATE OR REPLACE FUNCTION public.refund_chat_turn_after_output_swap(p_day date, p_audit_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user    uuid := auth.uid();
  v_now     timestamptz := pg_catalog.clock_timestamp();
  v_today   date := (v_now AT TIME ZONE 'Asia/Seoul')::date;
  v_audit   uuid;
  v_made    timestamp;  -- the audit row's creation time on the KST clock
  v_count   int;
  v_hit     text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not signed in' USING ERRCODE = '42501';
  END IF;
  IF p_audit_id IS NULL OR p_day IS NULL OR p_day NOT IN (v_today, v_today - 1) THEN
    RETURN NULL;
  END IF;

  -- One refund decision at a time per user: the later call waits, then sees what the earlier one used.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('chat_turn_refund:' || v_user::text, 0));

  -- That row and no other: the caller's own, written by a proxy, for chat, red, recent, not used yet.
  SELECT a.id, (a.created_at AT TIME ZONE 'Asia/Seoul')
    INTO v_audit, v_made
    FROM public.ai_audit_log AS a
   WHERE a.id = p_audit_id
     AND a.user_id = v_user
     AND a.event_source = 'server_verified'
     AND a.purpose = 'secondb_chat'
     AND a.safety_zone = 'red'
     AND a.created_at >= v_now - interval '10 minutes'
     AND a.created_at <= v_now
     AND NOT EXISTS (SELECT 1 FROM public.chat_turn_refunds AS used WHERE used.audit_id = a.id);

  IF v_audit IS NULL THEN
    RETURN NULL;
  END IF;

  -- The day asked for must be the day that row's turn was counted on.
  IF NOT public.chat_turn_refund_day_matches(p_day, v_made) THEN
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

REVOKE ALL ON FUNCTION public.refund_chat_turn_after_output_swap(date, uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.refund_chat_turn_after_output_swap(date, uuid) TO authenticated;

-- 2. The call that was not bound to a turn. No application calls it.
DROP FUNCTION IF EXISTS public.refund_chat_turn_after_output_swap(date);
