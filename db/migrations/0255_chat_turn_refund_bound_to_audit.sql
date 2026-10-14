-- 0255: 대화 횟수 환불을 "그 턴"에 묶는다 (0252 의 후속 · Z46).
--
-- 근거: Simon 2026-10-13 10:36 KST 「Q-34·Q-35 둘 다 추천대로 진행해」 · 13:17 Q-34 「차감하지 않는다(서버에서 확인해
--   되돌림)」 · 2026-10-14 10:36 「두 번 막힌 PR #2438: 검토가 요구한 대로 끝까지(턴 예약 표 + 대화마다 서버 확인)」
--   (원문은 여기까지다). 표의 열 · 확인하는 조건 · 5분과 60초와 이틀이라는 값은 구현한 창(2ndb-e7)이 정했고
--   화면을 맡은 창(2ndb-79)이 읽고 동의했다.
-- 사실: 0252 의 함수는 "그 사용자의 10분 안 · 안 쓴 근거 줄 가운데 가장 새 것"을 고른다. 화면이 본 턴과 함수가 쓰는
--   근거가 같은 턴이라는 보장이 없다(화면 쪽 PR #2425 의 독립 검토가 막은 지적). 이 파일의 앞선 두 판도 막혔다:
--   첫 판은 날짜를 화면에서 받았고(자정 뒤 10분은 어제도 받음), 둘째 판은 서버가 만든 턴 번호를 앱이 프록시에 실어
--   보내면 프록시가 그대로 감사 줄에 적었다(앱이 자기의 옛 턴 번호를 고를 수 있음 · 남의 번호를 먼저 쓸 수 있음).
--
-- 하는 일
--   1. 표 chat_turn_reservations: 횟수를 올릴 때마다 서버가 만드는 예약 줄. 주인 · 센 날 · 만든 때 · 상태 ·
--      묶인 답의 감사 줄 id. 앱의 어떤 역할도 이 표를 직접 읽거나 쓰지 못한다(행 보안을 켜고 정책을 두지 않는다 ·
--      권한도 주지 않는다). 아래 함수 셋만 건드린다.
--   2. bump_chat_usage_for_turn(p_user_id, p_day): 지금의 올리기(bump_chat_usage_if_under_cap)를 그대로 부르고
--      예약 줄 하나를 만든 뒤 { count, turnId } 를 돌려준다. 한도와 날짜를 다루는 방식은 지금의 올리기와 같다.
--      새 예약을 만들기 전에 그 사용자의 앞선 답 없는 예약을 닫는다(지운다): 답을 묶을 수 있는 것은 언제나 그 사용자의
--      가장 최근 예약 하나다(4회차 · 대표님 2026-10-14 14:12:02 「4회차: 앞선 답 없는 예약을 닫아 가장 최근 하나만
--      묶이게 + 우려 넷 손질 → 4회차 검토」). 올리기는 사용자마다 한 줄로 선다(트랜잭션 잠금). 이틀 지난 예약 줄도
--      여기서 지운다. 옛 올리기는 그대로 둔다(옛 설치본이 부른다 · 그 턴에는 예약이 없으므로 환불도 없다).
--   3. 시도와 묶기(6회차 · 대표님 2026-10-14 21:30:04 「6회차: 모델 호출 전에 서버가 시도 번호를 매기게 · 받은 답
--      뒤 다시 묻기의 환불은 받아들임 → 6회차 검토」 · Q-261014-20 「잃은 답은 횟수 없이 한 번 다시 묻기」).
--      begin_chat_turn_attempt(p_user_id, p_audit_id, p_turn_id): 프록시(service_role)만 부른다. 모델을 부르기 **전에**
--      이 호출을 그 턴의 시도로 적는다: 이 호출의 감사 줄이 가질 id 를 **서버에 닿은 순서대로** 첫째 또는 둘째 칸에 ·
--      적은 때. 첫 시도는 아직 시도가 없는 답 없는 예약에, 둘째 시도(다시 묻기)는 그 사용자의 **가장 최근** 예약이
--      아직 돌려주지 않았을 때만 된다. 셋째는 없다. 올리기와 같은 사용자별 잠금을 잡은 뒤 적는다. 순서는 서버가 본
--      도착 순서뿐이고 프록시의 시계는 쓰지 않는다(8회차 · 대표님 2026-10-14 23:59:58 「8회차: 시계 없이 서버가 시도가
--      닿은 순서로 번호를 매김 → 8회차 검토. 막히면 더 고치지 않고 7회차 판을 머지(남는 것은 기록)」). 프록시가 1.5초를
--      넘겨 포기한 호출이 뒤늦게 닿으면 그 호출도 시도로 적히지만, 그 프록시는 묶기를 부르지 않으므로 자리 하나만 쓴다.
--      claim_chat_turn_for_audit(p_user_id, p_audit_id, p_turn_id): 프록시(service_role)만 부른다. 답의 감사 줄을 쓴
--      직후에 부르고, 모두 맞을 때만 예약 줄에 그 감사 줄을 묶는다: 예약의 주인이 그 사용자다 · 그 감사 줄이 그 예약에
--      **적힌 시도**의 것이다 · 마지막 시도를 적은 지 5분 안이다 · 아직 답이 없다(어느 시도의 답이든), 또는 묶인 답이
--      **첫째** 시도의 것이고 이 답이 **둘째** 시도의 것이다(다시 물은 답이 앞 답의 자리를 차지 · 앞 답의 감사 줄은
--      어디에도 묶이지 않게 된다) · 감사 줄이 그 사용자의 것이고 프록시가 쓴 대화 줄이며 60초 안에 생겼다. 그 반대
--      (첫째 시도의 답이 둘째의 자리를 차지)는 없다: 늦게 끝난 앞 시도는 뒤 시도의 답을 덮지 못한다.
--      감사 줄 하나는 예약 하나에만 묶인다(고유).
--   4. refund_chat_turn_after_output_swap(p_audit_id): 넘겨받은 감사 줄 하나만 본다. 본인 것 · server_verified ·
--      secondb_chat · red · 10분 안 · 아직 안 쓴 것이어야 하고, 그 줄이 묶인 본인의 예약이 있어야 한다. **그 예약에
--      적힌 날**의 횟수를 1 내리고 예약을 refunded 로 바꾼다. 날짜 인자는 없다. 맞지 않으면 NULL 이고 아무것도 바꾸지
--      않는다. 한 번만 쓰이게 하는 방법(원장의 기본 키) · 부르는 쪽의 약속(40001 이면 다시 · 끝에 남은 횟수를 다시
--      읽기)은 0252 와 같다.
--   5. 인자가 날짜 하나인 refund_chat_turn_after_output_swap(p_day) 는 없앤다. 부르는 앱이 없고(화면 쪽은 아직
--      머지 전이다), 남겨 두면 턴에 묶이지 않은 길이 하나 더 열려 있게 된다.
--   6. 감사 표의 표시를 지키는 트리거를 최종 상태까지 보게 한다(0252 4회차 Z46D-01): 지금의 BEFORE 트리거는
--      event_source 를 적은 UPDATE 에만 돈다. 다른 BEFORE 트리거가 표시를 바꾸거나, 이미 server_verified 인
--      줄의 근거 칸(id · user_id · event_source · purpose · safety_zone · created_at)을 로그인한 요청이 바꾸는
--      경우를 AFTER 트리거가 최종 값으로 보고 거절한다. 프록시(service_role)와 역할 없는 세션은 그대로다.
--      예외 하나: 주인만 비워지는 수정(user_id → NULL · 다른 근거 칸은 그대로)은 어느 역할이든 둔다. 계정이 지워질 때
--      외래 키(0011: ON DELETE SET NULL)가 하는 수정이고, 주인 없는 줄은 누구의 근거도 못 된다(함수는 본인 줄만 본다).
--   7. 요청의 역할을 읽는 곳 셋(role 설정 · request.jwt.claim.role · request.jwt.claims 의 role)을 각각 따로 보고,
--      하나라도 로그인했거나 익명이면 거절한다. JWT claims 가 JSON 으로 읽히지 않으면 그 한 곳만 "주장 없음"으로 본다
--      (Z46D-03: 전에는 서버 쪽 감사 쓰기까지 22P02 로 끝났다).
--   8. 이미 있는 것의 모양을 본다: 원장 표의 기본 키가 audit_id 하나이고 미룰 수 없는 꼴인지(Z46D-02 · 미뤄진 기본
--      키는 충돌을 커밋 때 내므로 "한 번만"을 함수 안에서 잡지 못한다), 예약 표가 이미 있으면 이 파일이 만드는 그
--      표인지(열과 기본값 · 기본 키 · 고유 · 외래 키 · 검사 둘 · 행 보안 · 영구 표). 다르면 아무것도 바꾸지 않고 멈춘다.
--
-- 감사 기록 표(ai_audit_log)에는 칸도 색인도 더하지 않는다. 둘째 판의 chat_usage.refundable_turns 와
--   ai_audit_log.chat_turn_id 는 이 판에 없다(그 판은 운영에 올라간 적이 없다).
--
-- 하지 않는 일
--   - 사용자 글이 걸려 모델을 부르지 않은 턴은 여기서 다루지 않는다. 그 턴은 화면이 처음부터 세지 않게 한다
--     (Simon 2026-10-14 10:36 · 화면 쪽 PR).
--   - 표(chat_turn_refunds)와 이미 쓴 줄은 건드리지 않는다. 있는 chat_usage · ai_audit_log 줄의 값도 그대로다.
--   - 올리기에 넘기는 날짜(p_day)는 지금처럼 화면이 정한다. 이 파일이 바꾸는 것은 "돌려줄 때의 날짜"다.
--   - 올리기만 하고 끝내 답을 못 받은 턴을 돌려주지 않는다(하루 한도의 뜻이 바뀌는 일이라 따로 정한다).
-- 남용: 0252 와 같다. 하루 한도는 클라이언트가 호출 전에 RPC 를 부르는 것으로만 걸린다. 이 파일이 지키는 것은
--   "돌려주는 횟수는 예약 하나에 하나, 그 예약이 센 날에만, 프록시가 쓴 red 줄이 그 예약에 묶였을 때만"이다.
--   변조한 앱이 고를 것은 없다: 묶일 수 있는 예약은 그 사용자의 가장 최근 예약 하나뿐이다(앞선 것은 다음 올리기가 닫는다).
--   다시 묻기: 서버는 응답이 사라진 다시 묻기와 일부러 한 번 더 묻기를 가리지 못한다. 그래서 받은 답 뒤에 같은 번호로
--   다시 물어 빨강 답을 받으면 그 턴의 사용량 줄과 원장이 바뀐다(그 턴이 돌려받아진다). 이 길은 대표님이 받아들였다
--   (2026-10-14 21:30:04 「받은 답 뒤 다시 묻기의 환불은 받아들임」). 다시 묻기는 그 사용자의 가장 최근 턴에 한 번뿐이고,
--   돌려주는 횟수는 그대로 예약 하나에 하나 · 그 예약이 센 날이다.
-- 권한: bump… 과 refund… 는 authenticated 만, begin… 과 claim… 은 service_role 만 EXECUTE. 트리거 함수는 누구도 직접 부를 수 없다.
-- 삭제: 예약 줄은 계정을 지우면 따라 지워진다(users 를 따라). 내용 삭제(erase_my_data)는 건드리지 않는다. 삭제
--   등록부에는 0258 이 올린다.
-- 되돌리기: rollback/0255_down.sql 이 새 함수 넷 · AFTER 트리거 · 예약 표를 걷고 0252 의 함수 둘을 그대로 되돌린다.
--   프록시가 claim… 을 부르고 있으면 먼저 프록시를 되돌린다(부르는 쪽은 실패해도 답을 그대로 보낸다).

-- 8. The ledger's primary key must be on audit_id alone and must raise at the INSERT, not at commit.
DO $shape0255$
BEGIN
  IF NOT EXISTS (SELECT 1
                   FROM pg_catalog.pg_constraint AS c
                   JOIN pg_catalog.pg_attribute AS a
                     ON a.attrelid = c.conrelid AND a.attname = 'audit_id' AND NOT a.attisdropped
                  WHERE c.conrelid = 'public.chat_turn_refunds'::regclass
                    AND c.contype = 'p' AND NOT c.condeferrable AND NOT c.condeferred
                    AND c.conkey = ARRAY[a.attnum]) THEN
    RAISE EXCEPTION '0255: chat_turn_refunds must have a primary key on audit_id alone that is not deferrable'
      USING ERRCODE = '55000';
  END IF;
END
$shape0255$;

-- 1. One row per counted turn. The server makes the id, and only the three functions below touch the table.
CREATE TABLE IF NOT EXISTS public.chat_turn_reservations (
  turn_id     uuid        NOT NULL DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL,
  counted_day date        NOT NULL,
  issued_at   timestamptz NOT NULL DEFAULT now(),
  state       text        NOT NULL DEFAULT 'counted',
  audit_id    uuid,
  answered_at timestamptz,
  refunded_at timestamptz,
  attempts    smallint    NOT NULL DEFAULT 0,
  attempt1_audit_id uuid,
  attempt2_audit_id uuid,
  attempted_at timestamptz,
  CONSTRAINT chat_turn_reservations_pkey PRIMARY KEY (turn_id),
  CONSTRAINT chat_turn_reservations_audit_id_key UNIQUE (audit_id),
  CONSTRAINT chat_turn_reservations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users (id) ON DELETE CASCADE,
  CONSTRAINT chat_turn_reservations_state_check CHECK (state IN ('counted', 'answered', 'refunded')),
  CONSTRAINT chat_turn_reservations_answer_check CHECK ((state = 'counted') = (audit_id IS NULL))
);
COMMENT ON TABLE public.chat_turn_reservations IS
  'One row per counted chat turn (0255): who, the day it was counted on, the proxy audit row that answered it, and its attempts (how many were started, the audit ids they will write in the order they reached the server, when the latest was recorded). Ids, days, times and a count only, no content. Rows older than two days are removed by the next bump.';

CREATE INDEX IF NOT EXISTS chat_turn_reservations_user_issued_idx
  ON public.chat_turn_reservations (user_id, issued_at);

ALTER TABLE public.chat_turn_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.chat_turn_reservations FROM PUBLIC, anon, authenticated, service_role;

-- The table may have been there already (IF NOT EXISTS does not look at it). Everything below stands on
-- its columns and constraints, so check what is actually there.
DO $table0255$
DECLARE
  v_rel   constant regclass := 'public.chat_turn_reservations'::regclass;
  v_cols  text;
  v_want  constant text :=
    'turn_id:uuid:t:gen_random_uuid()|user_id:uuid:t:-|counted_day:date:t:-|issued_at:timestamp with time zone:t:now()'
    || '|state:text:t:''counted''::text|audit_id:uuid:f:-|answered_at:timestamp with time zone:f:-'
    || '|refunded_at:timestamp with time zone:f:-|attempts:smallint:t:0|attempt1_audit_id:uuid:f:-'
    || '|attempt2_audit_id:uuid:f:-|attempted_at:timestamp with time zone:f:-';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class AS c
                  WHERE c.oid = v_rel AND c.relkind = 'r' AND c.relpersistence = 'p' AND c.relrowsecurity
                    AND NOT c.relispartition)
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_inherits AS i WHERE i.inhrelid = v_rel OR i.inhparent = v_rel) THEN
    RAISE EXCEPTION '0255: chat_turn_reservations is not a permanent table with row security on'
      USING ERRCODE = '55000';
  END IF;
  -- Every column with its type, NOT NULL and default. A generated or identity column is another column:
  -- the functions below write state and audit_id themselves.
  SELECT pg_catalog.string_agg(
           a.attname || ':' || pg_catalog.format_type(a.atttypid, a.atttypmod) || ':'
           || CASE WHEN a.attnotnull THEN 't' ELSE 'f' END || ':'
           || COALESCE(pg_catalog.pg_get_expr(d.adbin, d.adrelid), '-')
           || CASE WHEN a.attgenerated <> '' OR a.attidentity <> '' THEN ':generated' ELSE '' END,
           '|' ORDER BY a.attnum)
    INTO v_cols
    FROM pg_catalog.pg_attribute AS a
    LEFT JOIN pg_catalog.pg_attrdef AS d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
   WHERE a.attrelid = v_rel AND a.attnum > 0 AND NOT a.attisdropped;
  IF v_cols IS DISTINCT FROM v_want THEN
    RAISE EXCEPTION '0255: chat_turn_reservations has other columns: %', v_cols USING ERRCODE = '55000';
  END IF;
  -- The primary key on turn_id and the unique on audit_id, both raising at the statement.
  IF (SELECT pg_catalog.count(*)
        FROM pg_catalog.pg_constraint AS c
        JOIN pg_catalog.pg_attribute AS a ON a.attrelid = c.conrelid AND NOT a.attisdropped
       WHERE c.conrelid = v_rel AND NOT c.condeferrable AND NOT c.condeferred
         AND c.conkey = ARRAY[a.attnum]
         AND ((c.contype = 'p' AND a.attname = 'turn_id') OR (c.contype = 'u' AND a.attname = 'audit_id'))) <> 2 THEN
    RAISE EXCEPTION '0255: chat_turn_reservations lacks its primary key on turn_id or its unique on audit_id'
      USING ERRCODE = '55000';
  END IF;
  -- The owner goes with the account.
  IF NOT EXISTS (SELECT 1
                   FROM pg_catalog.pg_constraint AS c
                   JOIN pg_catalog.pg_attribute AS a
                     ON a.attrelid = c.conrelid AND a.attname = 'user_id' AND NOT a.attisdropped
                   JOIN pg_catalog.pg_attribute AS p
                     ON p.attrelid = c.confrelid AND p.attname = 'id' AND NOT p.attisdropped
                  WHERE c.conrelid = v_rel AND c.contype = 'f' AND c.confrelid = 'public.users'::regclass
                    AND c.conkey = ARRAY[a.attnum] AND c.confkey = ARRAY[p.attnum]
                    AND c.confdeltype = 'c' AND c.convalidated AND NOT c.condeferrable
                    AND pg_catalog.to_jsonb(c) ->> 'conenforced' IS DISTINCT FROM 'false') THEN
    RAISE EXCEPTION '0255: chat_turn_reservations.user_id does not follow public.users(id) with ON DELETE CASCADE'
      USING ERRCODE = '55000';
  END IF;
  -- The two checks, by name and by what they say: which states exist, and that an answer is there exactly
  -- when the state says so. A check of another meaning under the same name does not count.
  IF (SELECT pg_catalog.count(*) FROM pg_catalog.pg_constraint AS c
       WHERE c.conrelid = v_rel AND c.contype = 'c' AND c.convalidated
         AND pg_catalog.to_jsonb(c) ->> 'conenforced' IS DISTINCT FROM 'false'
         AND (c.conname::text, pg_catalog.pg_get_constraintdef(c.oid)) IN (
               ('chat_turn_reservations_state_check',
                'CHECK ((state = ANY (ARRAY[''counted''::text, ''answered''::text, ''refunded''::text])))'),
               ('chat_turn_reservations_answer_check',
                'CHECK (((state = ''counted''::text) = (audit_id IS NULL)))'))) <> 2 THEN
    RAISE EXCEPTION '0255: chat_turn_reservations lacks its state checks' USING ERRCODE = '55000';
  END IF;
  -- Nothing else may change what a write to the table means: the five constraints above, their two
  -- indexes and the lookup index on (user_id, issued_at), no trigger and no rule.
  IF (SELECT pg_catalog.count(*) FROM pg_catalog.pg_constraint AS c
       WHERE c.conrelid = v_rel AND c.contype IN ('p', 'f', 'u', 'x', 'c', 't')) <> 5
     OR (SELECT pg_catalog.count(*) FROM pg_catalog.pg_index AS i WHERE i.indrelid = v_rel) <> 3
     OR NOT EXISTS (SELECT 1
                      FROM pg_catalog.pg_index AS i
                      JOIN pg_catalog.pg_class AS ic ON ic.oid = i.indexrelid
                      JOIN pg_catalog.pg_attribute AS u
                        ON u.attrelid = i.indrelid AND u.attname = 'user_id' AND NOT u.attisdropped
                      JOIN pg_catalog.pg_attribute AS t
                        ON t.attrelid = i.indrelid AND t.attname = 'issued_at' AND NOT t.attisdropped
                     WHERE i.indrelid = v_rel AND ic.relname = 'chat_turn_reservations_user_issued_idx'
                       AND NOT i.indisunique AND i.indisvalid AND i.indisready
                       AND i.indpred IS NULL AND i.indexprs IS NULL
                       AND i.indnatts = 2 AND i.indnkeyatts = 2 AND i.indkey[0] = u.attnum AND i.indkey[1] = t.attnum
                       AND ic.relam = (SELECT am.oid FROM pg_catalog.pg_am AS am WHERE am.amname = 'btree'))
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_trigger AS t WHERE t.tgrelid = v_rel AND NOT t.tgisinternal)
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_rewrite AS r WHERE r.ev_class = v_rel) THEN
    RAISE EXCEPTION '0255: chat_turn_reservations carries a constraint, index, trigger or rule this migration does not create'
      USING ERRCODE = '55000';
  END IF;
  -- No role of the application may read or write it directly.
  IF pg_catalog.has_table_privilege('anon', v_rel, 'SELECT, INSERT, UPDATE, DELETE')
     OR pg_catalog.has_table_privilege('authenticated', v_rel, 'SELECT, INSERT, UPDATE, DELETE')
     OR pg_catalog.has_table_privilege('service_role', v_rel, 'SELECT, INSERT, UPDATE, DELETE')
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_policy AS pol WHERE pol.polrelid = v_rel) THEN
    RAISE EXCEPTION '0255: chat_turn_reservations is open to an application role' USING ERRCODE = '55000';
  END IF;
END
$table0255$;

-- 7 (and the BEFORE half of 6). Same rule as 0252. Each of the three places a request's role can be
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

-- 6. The final row. A BEFORE trigger that runs later than the guard, or an UPDATE that does not name
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
    -- evidence (the claim and the refund both read the caller's own row).
    IF OLD.event_source IS NOT DISTINCT FROM 'server_verified'
       AND NEW.event_source IS NOT DISTINCT FROM OLD.event_source
       AND NEW.id           IS NOT DISTINCT FROM OLD.id
       AND (NEW.user_id     IS NOT DISTINCT FROM OLD.user_id OR NEW.user_id IS NULL)
       AND NEW.purpose      IS NOT DISTINCT FROM OLD.purpose
       AND NEW.safety_zone  IS NOT DISTINCT FROM OLD.safety_zone
       AND NEW.created_at   IS NOT DISTINCT FROM OLD.created_at THEN
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

-- 2. Count a turn and hand out its reservation. The counting itself is the existing function's: the
-- caller check, the tier's cap, the ad bonus and the limit error all come from there, unchanged.
CREATE OR REPLACE FUNCTION public.bump_chat_usage_for_turn(p_user_id uuid, p_day date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count int;
  v_turn  uuid;
BEGIN
  -- One decision about this user's turns at a time, and this lock first, before any row: the bump, the attempt
  -- and the refund all take it before they touch chat_usage or a reservation, so none of them waits for a row
  -- another holds while holding one it wants (round 7). The next statements see every reservation an earlier
  -- bump made.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('chat_turn_bump:' || p_user_id::text, 0));

  -- Raises 42501 for another user's id and P0001 chat_limit_exceeded at the cap. The third argument is ignored there.
  v_count := public.bump_chat_usage_if_under_cap(p_user_id, p_day, 0);

  -- This turn closes the turns before it that never got an answer: an answer can only ever be bound to the
  -- user's latest counted turn. A refund is only possible within minutes of the answer, so the user's
  -- reservations older than two days go here too.
  DELETE FROM public.chat_turn_reservations AS r
   WHERE r.user_id = p_user_id
     AND (r.state = 'counted'
          OR r.issued_at < pg_catalog.clock_timestamp() - interval '2 days');

  -- The reservation carries the day the turn was counted on. That day is the day a refund gives back.
  -- Stamped with the clock, so that "the user's latest turn" (see the attempt below) reads the same here.
  INSERT INTO public.chat_turn_reservations (user_id, counted_day, issued_at)
  VALUES (p_user_id, p_day, pg_catalog.clock_timestamp())
  RETURNING turn_id INTO v_turn;

  RETURN pg_catalog.jsonb_build_object('count', v_count, 'turnId', v_turn);
END;
$$;

REVOKE ALL ON FUNCTION public.bump_chat_usage_for_turn(uuid, date) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.bump_chat_usage_for_turn(uuid, date) TO authenticated;

-- 3a. Before the model is asked, the proxy records this call as an attempt of the turn the app named, under the id
-- its audit row will carry. The first attempt of a turn not attempted yet; the second (the one re-ask) only on the
-- user's latest turn, while it has not been given back. In line with the bump, so "latest" cannot move under it.
-- The attempts are numbered in the order they reach the server, under that lock; no clock of a proxy is read.
CREATE OR REPLACE FUNCTION public.begin_chat_turn_attempt(p_user_id uuid, p_audit_id uuid, p_turn_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now  timestamptz;
  v_done uuid;
BEGIN
  IF p_user_id IS NULL OR p_audit_id IS NULL OR p_turn_id IS NULL THEN
    RETURN false;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('chat_turn_bump:' || p_user_id::text, 0));

  -- The clock after the lock, so the attempt is stamped when it is recorded.
  v_now := pg_catalog.clock_timestamp();

  UPDATE public.chat_turn_reservations AS r
     SET attempts = r.attempts + 1,
         attempt1_audit_id = CASE WHEN r.attempts = 0 THEN p_audit_id ELSE r.attempt1_audit_id END,
         attempt2_audit_id = CASE WHEN r.attempts = 1 THEN p_audit_id ELSE r.attempt2_audit_id END,
         attempted_at = v_now
   WHERE r.turn_id = p_turn_id
     AND r.user_id = p_user_id
     AND r.issued_at <= v_now
     AND ((r.attempts = 0 AND r.state = 'counted')
          OR (r.attempts = 1 AND r.state IN ('counted', 'answered')
              AND r.attempt1_audit_id IS DISTINCT FROM p_audit_id
              AND NOT EXISTS (SELECT 1
                                FROM public.chat_turn_reservations AS n
                               WHERE n.user_id = r.user_id
                                 AND n.turn_id <> r.turn_id
                                 AND n.issued_at >= r.issued_at)))
  RETURNING r.turn_id INTO v_done;

  RETURN v_done IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.begin_chat_turn_attempt(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_chat_turn_attempt(uuid, uuid, uuid) TO service_role;

-- 3. The proxy asks the server whether this answer belongs to that reservation. The turn id came from
-- the app, so nothing about it is taken on trust: owner, state and age are read from the server's own row.
CREATE OR REPLACE FUNCTION public.claim_chat_turn_for_audit(p_user_id uuid, p_audit_id uuid, p_turn_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now  timestamptz := pg_catalog.clock_timestamp();
  v_done uuid;
BEGIN
  IF p_user_id IS NULL OR p_audit_id IS NULL OR p_turn_id IS NULL THEN
    RETURN false;
  END IF;

  -- The answer: this user's row, written by a proxy for chat, just now.
  IF NOT EXISTS (SELECT 1
                   FROM public.ai_audit_log AS a
                  WHERE a.id = p_audit_id
                    AND a.user_id = p_user_id
                    AND a.event_source = 'server_verified'
                    AND a.purpose = 'secondb_chat'
                    AND a.created_at >= v_now - interval '60 seconds'
                    AND a.created_at <= v_now) THEN
    RETURN false;
  END IF;

  BEGIN
    -- The reservation: this user's, and this row is one of its recorded attempts, the latest recorded in the last
    -- five minutes. Not answered yet (either attempt's row), or answered by the first attempt's row while this is
    -- the second's: the one re-ask (Q-261014-20), whose answer takes the place of the first, whose row is then
    -- bound to nothing. Never the other way round, so an earlier attempt that ends late cannot take the place of
    -- the one after it. One statement, so answers arriving at once for one reservation leave exactly one bound.
    UPDATE public.chat_turn_reservations AS r
       SET state = 'answered',
           audit_id = p_audit_id,
           answered_at = v_now
     WHERE r.turn_id = p_turn_id
       AND r.user_id = p_user_id
       AND (r.attempt1_audit_id = p_audit_id OR r.attempt2_audit_id = p_audit_id)
       AND r.attempted_at >= v_now - interval '5 minutes'
       AND r.attempted_at <= v_now
       AND ((r.state = 'counted' AND r.audit_id IS NULL)
            OR (r.state = 'answered' AND r.audit_id = r.attempt1_audit_id AND r.attempt2_audit_id = p_audit_id))
    RETURNING r.turn_id INTO v_done;
  EXCEPTION
    WHEN unique_violation THEN
      -- That audit row already answers another reservation.
      RETURN false;
  END;

  RETURN v_done IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_chat_turn_for_audit(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_chat_turn_for_audit(uuid, uuid, uuid) TO service_role;

-- 4. The refund, bound to the audit row of its own turn and to the day that turn was counted on.
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

  -- One decision about this user's turns at a time, under the bump's and the attempt's lock and before any row
  -- (round 7): the later call waits, then sees what the earlier one used, and a bump cannot hold chat_usage
  -- while this call holds the reservation it wants.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('chat_turn_bump:' || v_user::text, 0));

  -- That row and no other: the caller's own, written by a proxy, for chat, red, recent, not used yet.
  SELECT a.id
    INTO v_audit
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

  -- The day is the server's own record: the caller's reservation that this answer was bound to. No day
  -- and no turn id come from the caller.
  SELECT r.turn_id, r.counted_day
    INTO v_turn, v_day
    FROM public.chat_turn_reservations AS r
   WHERE r.audit_id = v_audit
     AND r.user_id = v_user
     AND r.state = 'answered'
     FOR UPDATE;

  IF v_turn IS NULL THEN
    RETURN NULL;
  END IF;

  BEGIN
    -- The primary key is what lets one audit row count once, whatever snapshot this call read.
    INSERT INTO public.chat_turn_refunds (audit_id, day) VALUES (v_audit, v_day);

    UPDATE public.chat_usage AS cu
       SET count = cu.count - 1
     WHERE cu.user_id = v_user
       AND cu.day = v_day
       AND cu.count > 0
    RETURNING cu.count INTO v_count;

    IF v_count IS NULL THEN
      -- Nothing to give back on that day: undo the mark so the row stays usable.
      RAISE EXCEPTION 'no turn to give back' USING ERRCODE = 'ZC252';
    END IF;

    UPDATE public.chat_turn_reservations AS r
       SET state = 'refunded',
           refunded_at = v_now
     WHERE r.turn_id = v_turn
       AND r.state = 'answered';
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

-- 5. The call that was not bound to a turn. No application calls it.
DROP FUNCTION IF EXISTS public.refund_chat_turn_after_output_swap(date);
