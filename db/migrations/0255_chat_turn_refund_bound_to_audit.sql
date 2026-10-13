-- 0255: 대화 횟수 환불을 "그 턴"에 묶는다 (0252 의 후속 · Z46).
--
-- 근거: Simon 2026-10-13 10:36 KST 「Q-34·Q-35 둘 다 추천대로 진행해」(원문은 여기까지다). 환불을 서버가
--   확인해 되돌린다는 것이 그 추천안이고(13:17 Q-34 「차감하지 않는다(서버에서 확인해 되돌림)」), 0252 가 그
--   함수를 만들었다. 이 파일의 구체안은 구현한 창(2ndb-e7)과 화면을 맡은 창(2ndb-79)이 정했다.
-- 사실: 0252 의 함수는 "그 사용자의 10분 안 · 안 쓴 근거 줄 가운데 가장 새 것"을 고른다. 그래서 화면이 본
--   턴과 함수가 쓰는 근거가 같은 턴이라는 보장이 없다. 지금 턴의 근거가 없거나 늦으면 앞선 턴의 근거를 쓰고,
--   자정 앞뒤에는 어제 턴의 근거로 오늘 횟수를 내릴 수 있다(화면 쪽 PR #2425 의 독립 검토 2회차가 막은 지적).
--   이 파일의 첫 판은 "넘겨받은 근거 줄 하나 + 화면이 넘긴 날짜"였는데, 독립 검토 1회차가 막았다: 자정 뒤
--   10분 안에 생긴 줄은 오늘도 어제도 받으므로 서버가 그 턴이 세어진 날을 모른다. 그래서 날짜를 화면에서 받지
--   않고, 횟수를 올릴 때 서버가 만든 턴 번호로 "센 날"과 "답이 바뀐 줄"을 직접 잇는다.
--
-- 하는 일
--   1. bump_chat_usage_for_turn(p_user_id, p_day): 지금의 올리기(bump_chat_usage_if_under_cap)를 그대로 부르고,
--      서버가 만든 턴 번호를 그날의 chat_usage 줄(새 칸 refundable_turns)에 적은 뒤 { count, turnId } 를 돌려준다.
--      한도와 날짜를 다루는 방식은 지금의 올리기와 같다(그 함수가 한다). 옛 올리기는 그대로 둔다(옛 설치본이
--      부른다 · 그 턴에는 번호가 없으므로 환불도 없다).
--   2. 감사 줄의 새 칸 chat_turn_id: 프록시가 대화 호출에 실려 온 턴 번호를 적는다. 번호 하나는 감사 줄 하나에만
--      붙는다(유일 인덱스). 그래서 번호 하나로 모델을 두 번 부르고 둘째의 근거로 돌려받는 길이 없다.
--   3. refund_chat_turn_after_output_swap(p_audit_id): 넘겨받은 근거 줄 하나만 본다. 본인 것 · server_verified ·
--      secondb_chat · red · 10분 안 · 아직 안 쓴 것 · 턴 번호가 붙은 것이어야 한다. 그 번호가 적힌 본인의
--      chat_usage 줄을 찾아 **그 줄의 날짜**를 1 내리고 번호를 지운다. 날짜 인자는 없다. 맞지 않으면 NULL 이고
--      아무것도 바꾸지 않는다. 한 번만 쓰이게 하는 방법(원장의 기본 키) · 부르는 쪽의 약속(40001 이면 다시 ·
--      끝에 남은 횟수를 다시 읽기)은 0252 와 같다.
--   4. 인자가 날짜 하나인 refund_chat_turn_after_output_swap(p_day) 는 없앤다. 부르는 앱이 없고(화면 쪽은 아직
--      머지 전이다), 남겨 두면 턴에 묶이지 않은 길이 하나 더 열려 있게 된다.
--   5. 감사 표의 표시를 지키는 트리거를 최종 상태까지 보게 한다(0252 4회차 Z46D-01): 지금의 BEFORE 트리거는
--      event_source 를 적은 UPDATE 에만 돈다. 다른 BEFORE 트리거가 표시를 바꾸거나, 이미 server_verified 인
--      줄의 근거 칸(id · user_id · event_source · purpose · safety_zone · created_at · chat_turn_id)을 로그인한
--      요청이 바꾸는 경우를 AFTER 트리거가 최종 값으로 보고 거절한다. 프록시(service_role)와 역할 없는 세션은 그대로다.
--      예외 하나: 주인만 비워지는 수정(user_id → NULL · 다른 근거 칸은 그대로)은 어느 역할이든 둔다. 계정이 지워질 때
--      외래 키(0011: ON DELETE SET NULL)가 하는 수정이고, 주인 없는 줄은 누구의 근거도 못 된다(함수는 본인 줄만 본다).
--      지금 계정 삭제는 관리자 API 로 돌아 이 트리거에 걸리지 않지만, 삭제가 로그인한 요청으로 도는 날에도 막히면 안 된다.
--   6. 요청의 역할을 읽는 곳 셋(role 설정 · request.jwt.claim.role · request.jwt.claims 의 role)을 각각 따로 보고,
--      하나라도 로그인했거나 익명이면 거절한다(1회차 R2438-03). JWT claims 가 JSON 으로 읽히지 않으면 그 한 곳만
--      "주장 없음"으로 본다(Z46D-03: 전에는 서버 쪽 감사 쓰기까지 22P02 로 끝났다).
--   7. 원장 표의 기본 키가 미룰 수 있는(DEFERRABLE) 꼴이면 멈춘다(Z46D-02). 미뤄진 기본 키는 충돌을 커밋 때
--      내므로 "한 번만"을 함수 안에서 잡지 못한다.
--
-- 하지 않는 일
--   - 사용자 글이 걸려 모델을 부르지 않은 턴은 여전히 다루지 않는다(Q-261013-67 · 따로 한다). 프록시가 입력을 막을
--     때 근거 줄을 쓰지 않으므로 그 턴에는 근거가 없다.
--   - 표(chat_turn_refunds)와 이미 쓴 줄은 건드리지 않는다. 있는 chat_usage · ai_audit_log 줄의 값도 그대로다
--     (칸 둘이 빈 채로 늘어날 뿐이다).
--   - 올리기에 넘기는 날짜(p_day)는 지금처럼 화면이 정한다. 이 파일이 바꾸는 것은 "돌려줄 때의 날짜"다.
-- 남용: 0252 와 같다. 하루 한도는 클라이언트가 호출 전에 RPC 를 부르는 것으로만 걸린다. 이 파일이 지키는 것은
--   "돌려주는 횟수는 번호를 받은 올리기 하나에 하나, 그 올리기가 센 날에만, 프록시가 쓴 red 줄이 있을 때만"이다.
-- 권한: 새 함수 둘은 authenticated 만 EXECUTE. 트리거 함수는 누구도 직접 부를 수 없다.
-- 되돌리기: rollback/0255_down.sql 이 새 함수 · AFTER 트리거 · 새 칸 둘과 인덱스를 걷고 0252 의 함수 둘을 그대로
--   되돌린다. 프록시가 새 칸에 쓰고 있으면 먼저 프록시를 되돌린다.

-- 7. The ledger's primary key must raise at the INSERT, not at commit.
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

-- 1 and 2. Where a counted turn is written down, and which audit row answers it.
ALTER TABLE public.chat_usage
  ADD COLUMN IF NOT EXISTS refundable_turns uuid[] NOT NULL DEFAULT '{}'::uuid[];
COMMENT ON COLUMN public.chat_usage.refundable_turns IS
  'Turn ids made by bump_chat_usage_for_turn for this day and not given back yet (0255). Random ids, no content.';

ALTER TABLE public.ai_audit_log
  ADD COLUMN IF NOT EXISTS chat_turn_id uuid;
COMMENT ON COLUMN public.ai_audit_log.chat_turn_id IS
  'The chat turn this call answered, as sent by the app and written by the proxy (0255). At most one row per turn.';

CREATE UNIQUE INDEX IF NOT EXISTS ai_audit_log_chat_turn_id_key
  ON public.ai_audit_log (chat_turn_id)
  WHERE chat_turn_id IS NOT NULL;

-- The two columns and the index may have been there already (IF NOT EXISTS does not look at them).
-- "One turn, one audit row" stands on that index, so check what is actually there.
DO $link0255$
DECLARE
  v_turns smallint;
  v_turn  smallint;
BEGIN
  SELECT a.attnum INTO v_turns FROM pg_catalog.pg_attribute AS a
   WHERE a.attrelid = 'public.chat_usage'::regclass AND a.attname = 'refundable_turns' AND NOT a.attisdropped
     AND a.atttypid = 'uuid[]'::regtype AND a.attnotnull;
  SELECT a.attnum INTO v_turn FROM pg_catalog.pg_attribute AS a
   WHERE a.attrelid = 'public.ai_audit_log'::regclass AND a.attname = 'chat_turn_id' AND NOT a.attisdropped
     AND a.atttypid = 'uuid'::regtype AND NOT a.attnotnull;
  IF v_turns IS NULL OR v_turn IS NULL THEN
    RAISE EXCEPTION '0255: chat_usage.refundable_turns or ai_audit_log.chat_turn_id has another type'
      USING ERRCODE = '55000';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_index AS i
                   JOIN pg_catalog.pg_class AS c ON c.oid = i.indexrelid
                  WHERE i.indrelid = 'public.ai_audit_log'::regclass
                    AND c.relname = 'ai_audit_log_chat_turn_id_key'
                    AND i.indisunique AND i.indisvalid AND i.indisready AND i.indimmediate
                    AND i.indnatts = 1 AND i.indkey[0] = v_turn
                    AND i.indexprs IS NULL
                    AND pg_catalog.pg_get_expr(i.indpred, i.indrelid) = '(chat_turn_id IS NOT NULL)') THEN
    RAISE EXCEPTION '0255: ai_audit_log_chat_turn_id_key is not the unique index on chat_turn_id alone'
      USING ERRCODE = '55000';
  END IF;
END
$link0255$;

-- 6 (and the BEFORE half of 5). Same rule as 0252. Each of the three places a request's role can be
-- read from is looked at on its own: one that says signed-in is enough to refuse.
CREATE OR REPLACE FUNCTION public.guard_ai_audit_server_verified()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_role   text;
  v_claim  text;
  v_claims text;
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
  -- The JWT's own role claim, old place and new (0112: the claims live in request.jwt.claims on the
  -- current stack). Text that is not JSON carries no claim; it must not fail a server-side write.
  v_claim := NULLIF(pg_catalog.current_setting('request.jwt.claim.role', true), '');
  BEGIN
    v_claims := NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
  EXCEPTION WHEN invalid_text_representation THEN
    v_claims := NULL;
  END;
  IF COALESCE(v_role IN ('authenticated', 'anon'), false)
     OR COALESCE(v_claim IN ('authenticated', 'anon'), false)
     OR COALESCE(v_claims IN ('authenticated', 'anon'), false) THEN
    RAISE EXCEPTION 'ai_audit_log: a signed-in request cannot write a server_verified row'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_ai_audit_server_verified() FROM PUBLIC, anon, authenticated, service_role;

-- 5. The final row. A BEFORE trigger that runs later than the guard, or an UPDATE that does not name
-- event_source, can still end with a server_verified row the guard never saw. This one reads what
-- was actually stored: a signed-in or anonymous request may not end an INSERT or UPDATE with a
-- server_verified row it created or promoted, nor change the evidence columns of one that exists.
CREATE OR REPLACE FUNCTION public.guard_ai_audit_server_verified_final()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_role   text;
  v_claim  text;
  v_claims text;
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
       AND NEW.id           IS NOT DISTINCT FROM OLD.id
       AND (NEW.user_id     IS NOT DISTINCT FROM OLD.user_id OR NEW.user_id IS NULL)
       AND NEW.purpose      IS NOT DISTINCT FROM OLD.purpose
       AND NEW.safety_zone  IS NOT DISTINCT FROM OLD.safety_zone
       AND NEW.created_at   IS NOT DISTINCT FROM OLD.created_at
       AND NEW.chat_turn_id IS NOT DISTINCT FROM OLD.chat_turn_id THEN
      RETURN NULL;
    END IF;
  END IF;
  v_role := pg_catalog.current_setting('role', true);
  v_claim := NULLIF(pg_catalog.current_setting('request.jwt.claim.role', true), '');
  BEGIN
    v_claims := NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
  EXCEPTION WHEN invalid_text_representation THEN
    v_claims := NULL;
  END;
  IF COALESCE(v_role IN ('authenticated', 'anon'), false)
     OR COALESCE(v_claim IN ('authenticated', 'anon'), false)
     OR COALESCE(v_claims IN ('authenticated', 'anon'), false) THEN
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

-- 1. Count a turn and hand out its id. The counting itself is the existing function's: the caller
-- check, the tier's cap, the ad bonus and the limit error all come from there, unchanged.
CREATE OR REPLACE FUNCTION public.bump_chat_usage_for_turn(p_user_id uuid, p_day date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count int;
  v_turn  uuid := pg_catalog.gen_random_uuid();
BEGIN
  -- Raises 42501 for another user's id and P0001 chat_limit_exceeded at the cap. The third argument is ignored there.
  v_count := public.bump_chat_usage_if_under_cap(p_user_id, p_day, 0);

  -- The turn is written on the row it was counted on. That row's day is the day a refund gives back.
  UPDATE public.chat_usage AS cu
     SET refundable_turns = cu.refundable_turns || v_turn
   WHERE cu.user_id = p_user_id
     AND cu.day = p_day;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'chat_usage row missing after the bump' USING ERRCODE = 'XX000';
  END IF;

  RETURN pg_catalog.jsonb_build_object('count', v_count, 'turnId', v_turn);
END;
$$;

REVOKE ALL ON FUNCTION public.bump_chat_usage_for_turn(uuid, date) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.bump_chat_usage_for_turn(uuid, date) TO authenticated;

-- 3. The refund, bound to the audit row of its own turn and to the day that turn was counted on.
CREATE OR REPLACE FUNCTION public.refund_chat_turn_after_output_swap(p_audit_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user    uuid := auth.uid();
  v_now     timestamptz := pg_catalog.clock_timestamp();
  v_audit   uuid;
  v_turn    uuid;
  v_day     date;
  v_count   int;
  v_hit     text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not signed in' USING ERRCODE = '42501';
  END IF;
  IF p_audit_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- One refund decision at a time per user: the later call waits, then sees what the earlier one used.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('chat_turn_refund:' || v_user::text, 0));

  -- That row and no other: the caller's own, written by a proxy, for chat, red, recent, not used yet,
  -- and carrying the turn it answered.
  SELECT a.id, a.chat_turn_id
    INTO v_audit, v_turn
    FROM public.ai_audit_log AS a
   WHERE a.id = p_audit_id
     AND a.user_id = v_user
     AND a.event_source = 'server_verified'
     AND a.purpose = 'secondb_chat'
     AND a.safety_zone = 'red'
     AND a.created_at >= v_now - interval '10 minutes'
     AND a.created_at <= v_now
     AND a.chat_turn_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.chat_turn_refunds AS used WHERE used.audit_id = a.id);

  IF v_audit IS NULL THEN
    RETURN NULL;
  END IF;

  -- The day is the server's own record: the caller's row on which that turn was counted and is still
  -- waiting. No day comes from the caller. A turn id is made once and written on one row.
  SELECT cu.day
    INTO v_day
    FROM public.chat_usage AS cu
   WHERE cu.user_id = v_user
     AND v_turn = ANY (cu.refundable_turns)
   ORDER BY cu.day DESC
   LIMIT 1
     FOR UPDATE;

  IF v_day IS NULL THEN
    RETURN NULL;
  END IF;

  BEGIN
    -- The primary key is what lets one audit row count once, whatever snapshot this call read.
    INSERT INTO public.chat_turn_refunds (audit_id, day) VALUES (v_audit, v_day);

    -- The count goes down and the turn stops waiting in one statement, on that one row.
    UPDATE public.chat_usage AS cu
       SET count = cu.count - 1,
           refundable_turns = pg_catalog.array_remove(cu.refundable_turns, v_turn)
     WHERE cu.user_id = v_user
       AND cu.day = v_day
       AND v_turn = ANY (cu.refundable_turns)
       AND cu.count > 0
    RETURNING cu.count INTO v_count;

    IF v_count IS NULL THEN
      -- Nothing to give back on that day: undo the mark so the row stays usable.
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

REVOKE ALL ON FUNCTION public.refund_chat_turn_after_output_swap(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.refund_chat_turn_after_output_swap(uuid) TO authenticated;

-- 4. The call that was not bound to a turn. No application calls it.
DROP FUNCTION IF EXISTS public.refund_chat_turn_after_output_swap(date);
