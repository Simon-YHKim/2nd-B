-- 0211_reward_records_90d_purge.sql
-- 초안(Hadrianus, 2026-10-04). 통합 후보일 뿐이다: push 직전에 원격·로컬 번호를
-- 다시 확인하고, 0211 이 이미 쓰였으면 번호를 바꾼다(0210 은 #1902 몫, 0197 은 보류).
--
-- 광고 보상 기록을 적립 시각부터 89일이 지나면 지운다(방침 "최대 90일" − 실행 주기 1일).
-- (Simon 결정 2026-10-04 18:32 KST, 결정 4/4 "가": 광고 ON 전에 90일 정리 작업을 넣고
--  방침에 90일을 명시. 마이그레이션·운영 DB 쓰기·머지는 별도 GO).
-- v2(2026-10-04 19:32 KST): Gaius 답변 ④ 에 따라 기준을 90일 → 89일로 당겼다. 매일 한 번
--   도는 작업이라 기준이 90일이면 90일을 최대 하루 넘겨 남는다. 89일이면 하루 늦게 돌아도
--   90일 안에 지워진다. 같은 답변 ③ 에 따라 보류 사유 코드를 2종으로 줄였다(S2 확정).
--   감시용 public.reward_retention_health() 를 더했다(§6). D4(Simon 2026-10-04 19:2x KST):
--   보류 설정·해제는 Simon 승인 뒤 Hadrianus(Dev Infra 봇)가 실행한다. 그래서 place/release 에
--   승인자 p_approved_by 를 받고 감사 기록에 남긴다(실행자 p_actor 와 같을 수 없다).
-- v3(2026-10-04 20:43 KST): Simon S1~S4 확정(20:30~20:31 KST) 반영.
--   S1 감사 기록은 분쟁이 끝난 날부터 3년 보관 뒤 정리(정리 함수 3-6 단계, 방침 문장 A).
--   S2 사유 코드 2종 확정('잠정' 표시 삭제). S3 백업 문장 B 채택(복원 뒤 다시 적용은 운영 문서).
--   S4 보류는 자동 상한 없이 90일마다 재검토: next_review_at 칸, review_reward_dispute_hold(),
--   재검토 지연은 reward_retention_health() 가 알린다. 담당은 D4(Simon 승인, Hadrianus 실행).
-- 파일 이름과 cron 이름의 "90d" 는 방침 기간(최대 90일)을 가리킨다. 실제 기준은 89일.
-- 보안 게이트 r1(2026-10-05, daybreak · astra) 반영:
--   보류 설정과 정리를 같은 advisory lock 으로 줄 세운다(보류가 성공했는데 로트가 지워지는 경합).
--   감사 기록은 정확히 3년(S1 은 '3년 보관 뒤 파기' 라 하루 당기면 보관 약속을 어긴다).
--   source_deleted 는 활성 보류가 지워질 때만 남기고, 사건 종료일은 마지막 해제와 그것 중
--   늦은 쪽으로 잡는다(한 사건에 보류가 여럿일 때 일찍 지우던 것). 감시는 pg_cron 이 없으면
--   ok = false 이고, 0196 계약(소비 1일 · 만료 즉시)보다 하루 넘게 남은 티켓도 센다.
--   감사 시각은 clock_timestamp() 다(트랜잭션 시작 시각이면 종료일 계산이 거꾸로 될 수 있다).
--
-- 방침 문장(Gaius v4 수정안 6 · v5 §1-3-2):
--   "보상 거래 기록(광고 거래 ID, 계정 ID, 적립 시각)과 계정별 발급 제한 정보는 ...
--    적립 시각부터 최대 90일 동안 보관한 뒤 파기하며, 그 전에 계정을 삭제하면 계정과
--    함께 삭제합니다. 다만 90일이 지났더라도 보상 지급과 관련한 분쟁이 진행 중이면
--    해당 기록만 분쟁이 끝날 때까지 보관합니다."
--
-- 무엇을 지우나 (대상 목록은 Gaius v5 §1-3-2 의 1번과 같다):
--   1. credit_ledger 의 ad_reward 로트 전체 (여는 행 + lot_id 로 그 행을 가리키는
--      spend · spend_refund · expire · adjust 행). 0202 와 같은 모양이다. 여는 행만 지우면
--      짝 잃은 소비 행이 남는다. 조건: 여는 행이 89일보다 오래됨, 로트가 만료됨(KST 월말),
--      로트 합계가 0 (expire-credit-lots 가 만료 행을 이미 씀). 합계가 0 인 로트를 통째로
--      지우면 credit_balance.balance_available 과 원장 합계의 차이가 그대로라
--      credit_balance_drift 가 비어 있는 상태가 유지된다. user_id 가 NULL 인 옛 로트는
--      잔액 캐시가 없으므로 합계와 상관없이 지운다(운영 0행).
--   2. rewarded_ssv_txns: granted_at 이 89일보다 오래된 행.
--   3. usage_counters 의 보상 칸(reward_credits · reward_consumed · chat_ad_credits):
--      행은 지우지 않는다(같은 행에 유료 사용량 reasoning_used 가 있다). 그 달의 KST 첫날이
--      89일보다 오래되면 0 으로 만든다. 달 단위 합계라 개별 적립 시각이 없으므로, 그 달의
--      가장 이른 적립도 90일을 넘지 않게 달 시작 기준으로 잡는다("최대 90일").
--      지난 달 칸만 바뀐다(이번 KST 달의 첫날은 길어야 31일 전). 이 칸을 읽는 곳은 모두
--      이번 달 행만 고른다: 앱 usage.ts:107-122 · dds-plans-screen.tsx:142-159 의 monthRow,
--      issue 함수의 chat 한도(month_bucket = v_month), grant_chat_ad_bonus(_ssv)(0172:92,125),
--      미러(0135:336), credit_ad_earned_this_month(0135:299, 원장 이번 달). 그래서 영향 없음.
--      0135 의 trg_usage_counters_freeze_credits 는 app.credit_mirror = '1' 일 때만 이 칸의
--      변경을 허락하므로, 이 단계에서만 트랜잭션 지역으로 켜고 바로 끈다.
--   4. chat_usage.ad_bonus: 그 날의 KST 0시가 89일보다 오래되면 0 으로 만든다(행은 남김).
--   5. reward_ssv_issue_rate_limits: updated_at 이 89일보다 오래된 행.
--   (reward_ssv_tickets 는 0196 의 purge-reward-ssv-tickets 가 1일 뒤에 이미 지운다.)
--
-- 분쟁 보류: reward_dispute_holds 에 released_at IS NULL 로 올라간 거래는 건너뛴다.
--   - 그 거래의 rewarded_ssv_txns 행, memo = 'rewarded SSV ' || transaction_id 인
--     ad_reward 로트(0172 grant_reward_credits_ssv 가 쓰는 모양), 그리고 그 거래가 속한
--     사용자·KST 달의 usage_counters 보상 칸, 사용자·KST 날의 chat_usage.ad_bonus.
--   - "해당 기록만": 같은 사용자의 다른 거래는 89일에 지운다.
--   - 보류는 계정 삭제를 막지 않는다(v4 540행 판단). 보류 행은 rewarded_ssv_txns 를
--     ON DELETE CASCADE 로 물어서, 계정 삭제 → rewarded_ssv_txns CASCADE → 보류 행 삭제.
--   - 감사 기록 reward_dispute_hold_events 는 보류 행을 ON DELETE SET NULL 로 문다.
--     원 거래가 지워지면 transaction_id 만 NULL 이 되고 사건 번호·동작·시각·담당은 남는다.
--   - 보류 표에도 감사 표에도 user_id 칸을 두지 않는다(계정 ID 를 원 기록보다 오래
--     남기지 않으려고). check:erasure-registry 는 소유자 칸 이름으로 범위를 정하므로 G1
--     대상이 아닐 것으로 보지만 CI 에서 확인할 것.
--
-- 재전송(replay) 불변식: 정리 기간(89일) > 티켓 재시도 창(1일). 89일 정리 뒤 같은 콜백은
--   티켓이 이미 없어서 막힌다(Hadrianus 2026-09-27 점검). 콜백 시각 신선도 검사는 0213.
--
-- 왜 상수 89일인가. 기간을 인수로 받으면 누군가 짧게/길게 부를 수 있다. 방침이
--   "최대 90일" 이고 분쟁 예외는 보류 표로만 표현하므로 기간은 상수로 둔다.
--   89 = 방침 최대 90일 − 실행 주기 1일(Gaius 답변 ④).
--
-- credit_balance.lifetime_* 는 이 정리에서 건드리지 않는다(Gaius 답변 ⑧: 계정 삭제 때만
--   지운다). 로트 합계가 0 일 때만 지우므로 balance_available 도 바뀌지 않는다.
--
-- 예약: pg_cron 'purge-reward-records-90d' '37 19 * * *' (운영 cron.timezone = GMT 이므로
--   매일 04:37 KST). 기존 작업과 분이 겹치지 않는다: */5 · */10 (5 의 배수 분),
--   23 * * * *, 0~17 4 * * * 묶음(=13:00~13:17 KST). GitHub Actions db-backup 03:30 KST,
--   model-refresh 04:00 KST, billing-tripwires 05:20 KST 와도 떨어져 있다.
--
-- 최상위 BEGIN/COMMIT 을 두지 않는다. Supabase CLI 가 이 파일을 자기 트랜잭션으로
-- 감싸므로 여기서 또 열면 중첩된다(supabase-dry-run.yml 이 0147 이상에 대해 막는다).
-- 표가 비어 있으므로(2026-10-04 운영 0행) CREATE INDEX 는 CONCURRENTLY 없이 둔다.

SET LOCAL lock_timeout = '10s';

DO $preconditions$
BEGIN
  IF to_regclass('public.rewarded_ssv_txns') IS NULL
     OR to_regclass('public.credit_ledger') IS NULL
     OR to_regclass('public.usage_counters') IS NULL
     OR to_regclass('public.chat_usage') IS NULL
     OR to_regclass('public.reward_ssv_issue_rate_limits') IS NULL
     OR to_regprocedure('public.prune_reward_ssv_tickets()') IS NULL
     OR to_regprocedure('public.erase_ad_reward_ledger_on_account_delete()') IS NULL
     OR to_regprocedure('public.billing_request_role()') IS NULL THEN
    RAISE EXCEPTION '0211 requires 0079/0134/0135/0196/0202 to be applied first';
  END IF;
END
$preconditions$;

----------------------------------------------------------------------
-- 1. 분쟁 보류 표와 감사 기록
----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.reward_dispute_holds (
  transaction_id text PRIMARY KEY
    REFERENCES public.rewarded_ssv_txns (transaction_id) ON DELETE CASCADE,
  -- S2 확정(Simon 2026-10-04 20:31 KST, Gaius 답변 ③). 코드를 늘리려면 방침 문장과 새 마이그레이션이 먼저다.
  reason_code    text NOT NULL CHECK (reason_code IN (
                   'user_dispute',      -- 이용자가 특정 보상 거래에 이의를 제기함
                   'store_dispute'      -- 특정 보상 거래의 지급 적정성에 관한 분쟁
                                        -- (스토어·광고 제공자 쪽에서 제기된 것 포함)
                 )),
  -- 내부 사건 번호만. 이용자 식별값(이메일·전화·이름·user_id·광고 ID) 금지.
  -- 형식 검사가 이름·이메일·자유 서술을 막고, 나머지는 운영 문서 §4 규칙으로 지킨다.
  case_ref       text NOT NULL CHECK (case_ref ~ '^[A-Za-z0-9_-]{1,64}$'),
  placed_by      text NOT NULL CHECK (placed_by ~ '^[a-z0-9_.-]{1,64}$'),
  placed_at      timestamptz NOT NULL DEFAULT now(),
  released_by    text CHECK (released_by IS NULL OR released_by ~ '^[a-z0-9_.-]{1,64}$'),
  released_at    timestamptz,
  -- S4: 자동 해제 상한은 두지 않는다. 걸 때·다시 걸 때·재검토할 때 90일 뒤로 잡는다.
  next_review_at timestamptz NOT NULL DEFAULT (now() + make_interval(days => 90)),
  CONSTRAINT reward_dispute_holds_release_pair CHECK (
    (released_at IS NULL AND released_by IS NULL)
    OR (released_at IS NOT NULL AND released_by IS NOT NULL AND released_at >= placed_at)
  )
);

COMMENT ON TABLE public.reward_dispute_holds IS
  '0211: 보상 지급 분쟁 보류. released_at IS NULL 인 거래는 purge_reward_records() 가 89일 정리에서 건너뛴다(그 거래의 rewarded_ssv_txns 행, memo 로 연결된 ad_reward 로트, 그 사용자·KST 달/날의 보상 카운터). 계정 삭제는 막지 않는다: rewarded_ssv_txns 를 ON DELETE CASCADE 로 문다. user_id 칸을 두지 않는다. 자동 해제 상한 없이 next_review_at(90일마다)에 재검토한다(S4). 쓰기는 place/review/release 함수로만.';

CREATE TABLE IF NOT EXISTS public.reward_dispute_hold_events (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  transaction_id text REFERENCES public.reward_dispute_holds (transaction_id) ON DELETE SET NULL,
  case_ref       text NOT NULL CHECK (case_ref ~ '^[A-Za-z0-9_-]{1,64}$'),
  -- source_deleted: 활성 보류 행이 지워짐(계정 삭제 CASCADE). 시스템이 쓴다. 해제된 보류 행이
  -- 89일 정리로 지워질 때는 남기지 않는다(사건 종료일은 이미 released 가 말한다).
  action         text NOT NULL CHECK (action IN ('placed', 'reopened', 'reviewed', 'released', 'source_deleted')),
  reason_code    text NOT NULL CHECK (reason_code IN ('user_dispute', 'store_dispute')),
  actor          text NOT NULL CHECK (actor ~ '^[a-z0-9_.-]{1,64}$'),
  -- D4: 승인자(지금 규칙으로는 'simon'). 실행자와 달라야 한다. 시스템 기록(source_deleted)만 비운다.
  approved_by    text CHECK (approved_by IS NULL OR approved_by ~ '^[a-z0-9_.-]{1,64}$'),
  actor_role     text NOT NULL CHECK (actor_role IN ('service_role', 'operator', 'system')),
  -- 실제로 일어난 시각. now() 는 트랜잭션 시작 시각이라, 먼저 시작한 계정 삭제가 나중에 걸린
  -- 보류를 지우면 source_deleted 가 placed 보다 이르게 찍혀 사건이 영영 안 끝난 것으로 보였다
  -- (보안 게이트 r2 BL2-01).
  at             timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT reward_dispute_hold_events_four_eyes CHECK (
    (action = 'source_deleted' AND approved_by IS NULL AND actor = 'system' AND actor_role = 'system')
    OR (action <> 'source_deleted' AND approved_by IS NOT NULL AND approved_by <> actor AND actor_role <> 'system')
  )
);

CREATE INDEX IF NOT EXISTS reward_dispute_hold_events_txn_idx
  ON public.reward_dispute_hold_events (transaction_id);
CREATE INDEX IF NOT EXISTS reward_dispute_hold_events_case_idx
  ON public.reward_dispute_hold_events (case_ref, at);

COMMENT ON TABLE public.reward_dispute_hold_events IS
  '0211: 분쟁 보류 설정·해제 감사 기록(덧붙이기 전용). 원 거래가 지워지면 transaction_id 만 NULL 이 되고 사건 번호·동작·담당·시각은 남는다. S1 확정(2026-10-04 20:30 KST): 분쟁이 끝난 날(그 사건의 마지막 해제, 해제 없이 원 거래가 지워졌으면 그 시각)부터 3년 보관 뒤 purge_reward_records() 3-6 단계가 사건 단위로 지운다(방침 문장 A).';

-- 덧붙이기 전용. 예외는 둘: FK 의 ON DELETE SET NULL 이 transaction_id 를 비우는 UPDATE, 그리고
-- purge_reward_records() 의 3년 정리(S1)가 트랜잭션 지역 app.reward_hold_audit_purge = '1' 을 켠
-- 동안의 DELETE. API 역할은 표 권한이 없어 이 플래그를 켜도 지울 수 없다.
CREATE OR REPLACE FUNCTION public.reward_dispute_hold_events_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE'
     AND pg_catalog.current_setting('app.reward_hold_audit_purge', true) = '1' THEN
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.transaction_id IS NULL
     AND OLD.transaction_id IS NOT NULL
     AND (NEW.id, NEW.case_ref, NEW.action, NEW.reason_code, NEW.actor, NEW.approved_by, NEW.actor_role, NEW.at)
         IS NOT DISTINCT FROM
         (OLD.id, OLD.case_ref, OLD.action, OLD.reason_code, OLD.actor, OLD.approved_by, OLD.actor_role, OLD.at) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'reward_dispute_hold_events is append-only' USING ERRCODE = '55006';
END;
$$;
REVOKE ALL ON FUNCTION public.reward_dispute_hold_events_append_only()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_reward_dispute_hold_events_append_only ON public.reward_dispute_hold_events;
CREATE TRIGGER trg_reward_dispute_hold_events_append_only
  BEFORE UPDATE OR DELETE ON public.reward_dispute_hold_events
  FOR EACH ROW EXECUTE FUNCTION public.reward_dispute_hold_events_append_only();

-- 활성 보류 행이 해제 없이 지워지면(계정 삭제 CASCADE) 그 시각을 남긴다. 그 사건의 "분쟁이 끝난
-- 날" 을 3년 정리가 알 수 있게 하려는 것이다. 해제된 보류 행이 89일 정리로 지워질 때는 남기지
-- 않는다: 그 사건은 released 에서 이미 끝났고, 여기서 남기면 3년 정리가 정리 시각을 종료일로
-- 읽어 보관을 늘린다(보안 게이트 r1 BL-04).
-- transaction_id 는 비운다(지워지는 중인 행을 FK 로 물 수 없고, 거래 ID 를 남기지 않으려고).
CREATE OR REPLACE FUNCTION public.reward_dispute_holds_log_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.released_at IS NULL THEN
    INSERT INTO public.reward_dispute_hold_events
      (transaction_id, case_ref, action, reason_code, actor, approved_by, actor_role)
    VALUES (NULL, OLD.case_ref, 'source_deleted', OLD.reason_code, 'system', NULL, 'system');
  END IF;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.reward_dispute_holds_log_delete()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_reward_dispute_holds_log_delete ON public.reward_dispute_holds;
CREATE TRIGGER trg_reward_dispute_holds_log_delete
  BEFORE DELETE ON public.reward_dispute_holds
  FOR EACH ROW EXECUTE FUNCTION public.reward_dispute_holds_log_delete();

ALTER TABLE public.reward_dispute_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_dispute_holds FORCE ROW LEVEL SECURITY;
ALTER TABLE public.reward_dispute_hold_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_dispute_hold_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.reward_dispute_holds FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.reward_dispute_hold_events FROM PUBLIC, anon, authenticated, service_role;

-- 누가 보류를 걸고 풀 수 있나: service_role(운영 도구) 또는 JWT 없는 운영자 SQL 세션
-- (postgres). anon · authenticated 는 EXECUTE 가 없고, 있더라도 아래 역할 검사가 막는다.
CREATE OR REPLACE FUNCTION public.reward_hold_caller_role()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role text := public.billing_request_role();
BEGIN
  IF v_role IS NULL THEN
    RETURN 'operator';
  ELSIF v_role = 'service_role' THEN
    RETURN 'service_role';
  END IF;
  RAISE EXCEPTION 'service_role or operator only' USING ERRCODE = '42501';
END;
$$;
REVOKE ALL ON FUNCTION public.reward_hold_caller_role() FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.place_reward_dispute_hold(
  p_transaction_id text,
  p_reason_code text,
  p_case_ref text,
  p_actor text,
  p_approved_by text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role text := public.reward_hold_caller_role();
  v_hold public.reward_dispute_holds%ROWTYPE;
BEGIN
  -- D4: 승인자 없이, 또는 실행자 스스로 승인해서는 걸 수 없다.
  IF p_approved_by IS NULL OR p_actor IS NULL OR p_approved_by = p_actor THEN
    RAISE EXCEPTION 'approval by someone other than the actor is required' USING ERRCODE = '22023';
  END IF;
  IF p_transaction_id IS NULL OR length(p_transaction_id) NOT BETWEEN 1 AND 256 THEN
    RAISE EXCEPTION 'invalid transaction_id' USING ERRCODE = '22023';
  END IF;

  -- purge_reward_records() 와 줄을 선다(같은 키). 정리 3-1 단계는 원장만 잠그므로, 이 잠금이
  -- 없으면 아직 커밋되지 않은 보류를 못 본 정리가 로트를 지우고, 거래 행만 SKIP LOCKED 로 남아
  -- "활성 보류 + 지워진 원장" 이 된다(보안 게이트 r1 DB-01 · BL-01). 정리가 먼저 잡으면 여기서
  -- 기다렸다가 아래에서 거래 행이 없음을 보고 false 를 돌려준다.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('public.purge_reward_records', 0));

  -- 거래 행이 없으면(이미 89일 정리됐거나 계정 삭제) 보류할 대상이 없다.
  PERFORM 1 FROM public.rewarded_ssv_txns AS t
    WHERE t.transaction_id = p_transaction_id
    FOR KEY SHARE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  SELECT * INTO v_hold FROM public.reward_dispute_holds AS h
   WHERE h.transaction_id = p_transaction_id
   FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.reward_dispute_holds (transaction_id, reason_code, case_ref, placed_by)
    VALUES (p_transaction_id, p_reason_code, p_case_ref, p_actor);
    INSERT INTO public.reward_dispute_hold_events
      (transaction_id, case_ref, action, reason_code, actor, approved_by, actor_role)
    VALUES (p_transaction_id, p_case_ref, 'placed', p_reason_code, p_actor, p_approved_by, v_role);
    RETURN true;
  ELSIF v_hold.released_at IS NOT NULL THEN
    UPDATE public.reward_dispute_holds AS h
       SET reason_code = p_reason_code, case_ref = p_case_ref,
           placed_by = p_actor, placed_at = now(),
           released_by = NULL, released_at = NULL,
           next_review_at = now() + make_interval(days => 90)
     WHERE h.transaction_id = p_transaction_id;
    INSERT INTO public.reward_dispute_hold_events
      (transaction_id, case_ref, action, reason_code, actor, approved_by, actor_role)
    VALUES (p_transaction_id, p_case_ref, 'reopened', p_reason_code, p_actor, p_approved_by, v_role);
    RETURN true;
  END IF;
  RETURN false;  -- 이미 활성 보류
END;
$$;

CREATE OR REPLACE FUNCTION public.release_reward_dispute_hold(
  p_transaction_id text,
  p_actor text,
  p_approved_by text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role text := public.reward_hold_caller_role();
  v_hold public.reward_dispute_holds%ROWTYPE;
BEGIN
  IF p_approved_by IS NULL OR p_actor IS NULL OR p_approved_by = p_actor THEN
    RAISE EXCEPTION 'approval by someone other than the actor is required' USING ERRCODE = '22023';
  END IF;
  UPDATE public.reward_dispute_holds AS h
     SET released_at = now(), released_by = p_actor
   WHERE h.transaction_id = p_transaction_id
     AND h.released_at IS NULL
  RETURNING h.* INTO v_hold;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  INSERT INTO public.reward_dispute_hold_events
    (transaction_id, case_ref, action, reason_code, actor, approved_by, actor_role)
  VALUES (p_transaction_id, v_hold.case_ref, 'released', v_hold.reason_code, p_actor, p_approved_by, v_role);
  RETURN true;
END;
$$;

-- S4: 90일마다 재검토. 분쟁이 계속되면 이 함수로 다음 재검토를 90일 뒤로 미루고,
-- 끝났으면 release 를 부른다. 담당은 D4(Simon 승인 → Hadrianus 실행).
CREATE OR REPLACE FUNCTION public.review_reward_dispute_hold(
  p_transaction_id text,
  p_actor text,
  p_approved_by text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role text := public.reward_hold_caller_role();
  v_hold public.reward_dispute_holds%ROWTYPE;
BEGIN
  IF p_approved_by IS NULL OR p_actor IS NULL OR p_approved_by = p_actor THEN
    RAISE EXCEPTION 'approval by someone other than the actor is required' USING ERRCODE = '22023';
  END IF;
  UPDATE public.reward_dispute_holds AS h
     SET next_review_at = now() + make_interval(days => 90)
   WHERE h.transaction_id = p_transaction_id
     AND h.released_at IS NULL
  RETURNING h.* INTO v_hold;
  IF NOT FOUND THEN
    RETURN false;  -- 활성 보류 없음
  END IF;
  INSERT INTO public.reward_dispute_hold_events
    (transaction_id, case_ref, action, reason_code, actor, approved_by, actor_role)
  VALUES (p_transaction_id, v_hold.case_ref, 'reviewed', v_hold.reason_code, p_actor, p_approved_by, v_role);
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.review_reward_dispute_hold(text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.review_reward_dispute_hold(text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.place_reward_dispute_hold(text, text, text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.release_reward_dispute_hold(text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.place_reward_dispute_hold(text, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_reward_dispute_hold(text, text, text) TO service_role;

----------------------------------------------------------------------
-- 2. 정리 대상을 찾는 인덱스 (지금은 전부 0행)
----------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS rewarded_ssv_txns_granted_at_idx
  ON public.rewarded_ssv_txns (granted_at, transaction_id);

CREATE INDEX IF NOT EXISTS credit_ledger_ad_reward_opened_idx
  ON public.credit_ledger (created_at, id)
  WHERE kind = 'ad_reward';

CREATE INDEX IF NOT EXISTS usage_counters_reward_nonzero_idx
  ON public.usage_counters (month_bucket, user_id)
  WHERE reward_credits <> 0 OR reward_consumed <> 0 OR chat_ad_credits <> 0;

CREATE INDEX IF NOT EXISTS chat_usage_ad_bonus_nonzero_idx
  ON public.chat_usage (day, user_id)
  WHERE ad_bonus <> 0;

CREATE INDEX IF NOT EXISTS reward_ssv_issue_rate_limits_updated_idx
  ON public.reward_ssv_issue_rate_limits (updated_at, user_id);

----------------------------------------------------------------------
-- 3. 정리 함수
----------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.purge_reward_records(
  p_batch integer DEFAULT 1000,
  p_max_rounds integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '120s'
AS $$
DECLARE
  -- 방침 최대 90일 − 실행 주기 1일. 바꾸지 말 것(사후 조건과 회귀 테스트 P9 가 막는다).
  c_retention constant interval := make_interval(days => 89);
  -- S1: 감사 기록은 분쟁이 끝난 날부터 3년 "보관 뒤 파기". 89일과 달리 이것은 최소 보관 약속이라
  -- 당기지 않는다. 매일 돌므로 실제 삭제는 3년을 채운 뒤 첫 실행(최대 하루 늦게)이다.
  c_audit_retention constant interval := make_interval(years => 3);
  v_role   text := public.billing_request_role();
  v_now    timestamptz := clock_timestamp();
  v_cutoff timestamptz := v_now - c_retention;
  v_batch  integer := LEAST(GREATEST(COALESCE(p_batch, 1000), 1), 10000);
  v_rounds integer := LEAST(GREATEST(COALESCE(p_max_rounds, 20), 1), 200);
  v_i      integer;
  v_n      integer;
  v_m      integer;
  v_lots   integer := 0;
  v_ledger integer := 0;
  v_txns   integer := 0;
  v_uc     integer := 0;
  v_chat   integer := 0;
  v_rl     integer := 0;
  v_audit  integer := 0;
BEGIN
  -- pg_cron(JWT 없음) 과 service_role 만. authenticated · anon 은 EXECUTE 도 없다.
  IF v_role IS NOT NULL AND v_role <> 'service_role' THEN
    RAISE EXCEPTION 'service_role only' USING ERRCODE = '42501';
  END IF;

  -- place_reward_dispute_hold() 와 같은 키로 줄을 선다. 진행 중인 보류 설정이 커밋된 뒤에
  -- 시작하므로 아래 모든 단계가 그 보류를 본다(보안 게이트 r1 DB-01 · BL-01).
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('public.purge_reward_records', 0));

  -- 3-1. ad_reward 로트 전체 (v_n = 지운 로트 수, v_m = 지운 원장 행 수)
  FOR v_i IN 1..v_rounds LOOP
    WITH victims AS (
      SELECT o.id AS lot_id
        FROM public.credit_ledger AS o
       WHERE o.kind = 'ad_reward'
         AND o.created_at < v_cutoff
         AND o.lot_expires_at IS NOT NULL
         AND o.lot_expires_at <= v_now
         AND (
           o.user_id IS NULL
           OR (SELECT COALESCE(SUM(l.units), 0)
                 FROM public.credit_ledger AS l
                WHERE l.lot_id = o.id) = 0
         )
         AND NOT EXISTS (
           SELECT 1 FROM public.reward_dispute_holds AS h
            WHERE h.released_at IS NULL
              AND o.memo = 'rewarded SSV ' || h.transaction_id
         )
       ORDER BY o.created_at, o.id
       LIMIT v_batch
       FOR UPDATE OF o SKIP LOCKED
    ), gone AS (
      DELETE FROM public.credit_ledger AS t
       USING victims AS v
       WHERE t.lot_id = v.lot_id
      RETURNING (t.id = t.lot_id) AS is_opening
    )
    SELECT count(*) FILTER (WHERE is_opening), count(*) INTO v_n, v_m
      FROM gone;
    v_lots := v_lots + v_n;
    v_ledger := v_ledger + v_m;
    EXIT WHEN v_n < v_batch;
  END LOOP;

  -- 3-2. rewarded_ssv_txns (해제된 보류 행은 FK CASCADE 로 함께 사라지고, 감사 기록은 SET NULL)
  FOR v_i IN 1..v_rounds LOOP
    WITH victims AS (
      SELECT t.transaction_id
        FROM public.rewarded_ssv_txns AS t
       WHERE t.granted_at < v_cutoff
         AND NOT EXISTS (
           SELECT 1 FROM public.reward_dispute_holds AS h
            WHERE h.transaction_id = t.transaction_id
              AND h.released_at IS NULL
         )
       ORDER BY t.granted_at, t.transaction_id
       LIMIT v_batch
       FOR UPDATE OF t SKIP LOCKED
    )
    DELETE FROM public.rewarded_ssv_txns AS t
     USING victims AS v
     WHERE t.transaction_id = v.transaction_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_txns := v_txns + v_n;
    EXIT WHEN v_n < v_batch;
  END LOOP;

  -- 3-3. usage_counters 보상 칸 (달 단위 'YYYY-MM' 행만. 주 단위 'YYYY-Www' 행은 보상 칸을 쓰지 않는다)
  PERFORM pg_catalog.set_config('app.credit_mirror', '1', true);
  FOR v_i IN 1..v_rounds LOOP
    WITH victims AS (
      SELECT uc.user_id, uc.month_bucket
        FROM public.usage_counters AS uc
       WHERE (uc.reward_credits <> 0 OR uc.reward_consumed <> 0 OR uc.chat_ad_credits <> 0)
         AND uc.month_bucket ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
         AND (pg_catalog.to_date(uc.month_bucket, 'YYYY-MM')::timestamp
              AT TIME ZONE 'Asia/Seoul') < v_cutoff
         AND NOT EXISTS (
           SELECT 1
             FROM public.reward_dispute_holds AS h
             JOIN public.rewarded_ssv_txns AS t ON t.transaction_id = h.transaction_id
            WHERE h.released_at IS NULL
              AND t.user_id = uc.user_id
              AND pg_catalog.to_char(t.granted_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM') = uc.month_bucket
         )
       ORDER BY uc.month_bucket, uc.user_id
       LIMIT v_batch
       FOR UPDATE OF uc SKIP LOCKED
    )
    UPDATE public.usage_counters AS uc
       SET reward_credits = 0, reward_consumed = 0, chat_ad_credits = 0
      FROM victims AS v
     WHERE uc.user_id = v.user_id AND uc.month_bucket = v.month_bucket;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_uc := v_uc + v_n;
    EXIT WHEN v_n < v_batch;
  END LOOP;
  PERFORM pg_catalog.set_config('app.credit_mirror', '', true);

  -- 3-4. chat_usage.ad_bonus
  FOR v_i IN 1..v_rounds LOOP
    WITH victims AS (
      SELECT cu.user_id, cu.day
        FROM public.chat_usage AS cu
       WHERE cu.ad_bonus <> 0
         AND (cu.day::timestamp AT TIME ZONE 'Asia/Seoul') < v_cutoff
         AND NOT EXISTS (
           SELECT 1
             FROM public.reward_dispute_holds AS h
             JOIN public.rewarded_ssv_txns AS t ON t.transaction_id = h.transaction_id
            WHERE h.released_at IS NULL
              AND t.user_id = cu.user_id
              AND (t.granted_at AT TIME ZONE 'Asia/Seoul')::date = cu.day
         )
       ORDER BY cu.day, cu.user_id
       LIMIT v_batch
       FOR UPDATE OF cu SKIP LOCKED
    )
    UPDATE public.chat_usage AS cu
       SET ad_bonus = 0
      FROM victims AS v
     WHERE cu.user_id = v.user_id AND cu.day = v.day;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_chat := v_chat + v_n;
    EXIT WHEN v_n < v_batch;
  END LOOP;

  -- 3-5. 발급 제한 정보
  FOR v_i IN 1..v_rounds LOOP
    WITH victims AS (
      SELECT r.user_id
        FROM public.reward_ssv_issue_rate_limits AS r
       WHERE r.updated_at < v_cutoff
       ORDER BY r.updated_at, r.user_id
       LIMIT v_batch
       FOR UPDATE OF r SKIP LOCKED
    )
    DELETE FROM public.reward_ssv_issue_rate_limits AS r
     USING victims AS v
     WHERE r.user_id = v.user_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_rl := v_rl + v_n;
    EXIT WHEN v_n < v_batch;
  END LOOP;

  -- 3-6. 분쟁 보류 감사 기록 3년 정리(S1). 사건(case_ref) 단위로 본다.
  --   분쟁이 끝난 날 = 그 사건의 마지막 released 와 마지막 source_deleted(활성 보류가 해제 없이
  --   지워진 시각) 중 늦은 쪽. 한 사건에 보류가 여럿이면 가장 늦게 끝난 것이 종료일이다.
  --   마지막 placed/reopened 보다 이르면(다시 열린 사건) 끝나지 않은 것이다.
  --   같은 사건 번호에 활성 보류가 하나라도 있으면 지우지 않는다.
  PERFORM pg_catalog.set_config('app.reward_hold_audit_purge', '1', true);
  WITH cases AS (
    SELECT e.case_ref,
           max(e.at) FILTER (WHERE e.action IN ('placed', 'reopened')) AS last_open,
           max(e.at) FILTER (WHERE e.action = 'released') AS last_release,
           max(e.at) FILTER (WHERE e.action = 'source_deleted') AS last_gone
      FROM public.reward_dispute_hold_events AS e
     GROUP BY e.case_ref
  ), ended AS (
    SELECT c.case_ref,
           CASE WHEN GREATEST(c.last_release, c.last_gone) >= c.last_open
                THEN GREATEST(c.last_release, c.last_gone)
           END AS ended_at
      FROM cases AS c
  ), gone AS (
    DELETE FROM public.reward_dispute_hold_events AS e
     USING ended AS d
     WHERE e.case_ref = d.case_ref
       AND d.ended_at IS NOT NULL
       AND d.ended_at < v_now - c_audit_retention
       AND NOT EXISTS (SELECT 1 FROM public.reward_dispute_holds AS h
                        WHERE h.case_ref = d.case_ref AND h.released_at IS NULL)
    RETURNING 1
  )
  SELECT count(*) INTO v_audit FROM gone;
  PERFORM pg_catalog.set_config('app.reward_hold_audit_purge', '', true);

  -- cron.job_run_details.return_message 에 남는 요약(건수만, 개인 식별 정보 없음).
  RETURN jsonb_build_object(
    'cutoff', v_cutoff,
    'ad_reward_lots', v_lots,
    'ledger_rows', v_ledger,
    'rewarded_ssv_txns', v_txns,
    'usage_counters_zeroed', v_uc,
    'chat_usage_zeroed', v_chat,
    'issue_rate_limits', v_rl,
    'hold_audit_rows', v_audit
  );
END;
$$;

REVOKE ALL ON FUNCTION public.purge_reward_records(integer, integer)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.purge_reward_records(integer, integer) TO service_role;

COMMENT ON FUNCTION public.purge_reward_records(integer, integer) IS
  '0211: 광고 보상 기록 89일 정리(상수 89일 = 방침 최대 90일 − 실행 주기 1일). ad_reward 로트 전체(만료·합계 0), rewarded_ssv_txns, usage_counters 보상 칸(KST 달 시작 기준), chat_usage.ad_bonus(KST 날 시작 기준), reward_ssv_issue_rate_limits. reward_dispute_holds 의 활성 보류 거래는 건너뛴다. 불변식: 89일 > 티켓 재시도 창 1일(0196). credit_balance.lifetime_* 는 건드리지 않음. 분쟁 보류 감사 기록은 분쟁 종료 3년 뒤 사건 단위로 지운다(S1). 보류 설정과 같은 advisory lock 으로 줄을 선다. 매일 04:37 KST pg_cron purge-reward-records-90d.';

----------------------------------------------------------------------
-- 4. 예약 (0196 과 같은 모양: 있으면 지우고 다시 건다)
----------------------------------------------------------------------

DO $schedule$
DECLARE
  v_job_id bigint;
BEGIN
  IF to_regprocedure('cron.schedule(text,text,text)') IS NOT NULL THEN
    FOR v_job_id IN EXECUTE
      'SELECT jobid FROM cron.job WHERE jobname = $1'
      USING 'purge-reward-records-90d'
    LOOP
      EXECUTE 'SELECT cron.unschedule($1)' USING v_job_id;
    END LOOP;
    EXECUTE 'SELECT cron.schedule($1, $2, $3)'
      INTO v_job_id
      USING
        'purge-reward-records-90d',
        '37 19 * * *',   -- GMT 19:37 = 04:37 KST
        'SELECT public.purge_reward_records();';
  ELSE
    RAISE NOTICE '0211: pg_cron unavailable; purge_reward_records() is not scheduled';
  END IF;
END
$schedule$;

----------------------------------------------------------------------
-- 6. 감시 (Gaius 답변 ④: 실행 실패·하루 넘게 미실행, 91일 넘은 비보류 기록)
----------------------------------------------------------------------
-- 건수와 시각만 돌려준다(개인 식별 정보 없음). billing-tripwires.yml(매일 05:20 KST, psql 로
-- SUPABASE_DB_URL 접속 = JWT 없는 운영자 세션)가 이 함수를 읽어 ok = false 면 ops 이슈를 연다.
-- 91일 = 방침 최대 90일 + 하루 여유. 89일 기준으로 매일 돌면 이 값은 늘 0 이어야 한다.
-- 26시간 = 하루 + 실행 시간·cron 지연 여유 2시간.

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
  v_overdue  timestamptz := now() - make_interval(days => 91);
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
  v_stale    boolean;
BEGIN
  IF v_role IS NOT NULL AND v_role <> 'service_role' THEN
    RAISE EXCEPTION 'service_role only' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_txns FROM public.rewarded_ssv_txns AS t
   WHERE t.granted_at < v_overdue
     AND NOT EXISTS (SELECT 1 FROM public.reward_dispute_holds AS h
                      WHERE h.transaction_id = t.transaction_id AND h.released_at IS NULL);

  -- 합계와 상관없이 센다: 91일 넘게 남은 로트는 정리가 못 지웠거나 만료가 안 된 것이다.
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

  v_stale := v_cron AND (v_last_ok IS NULL OR v_last_ok < v_now - interval '26 hours');

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
  '0211: 89일 정리 감시. 91일 넘은 비보류 보상 기록 수, 재검토 기한(90일)이 지난 활성 보류 수(S4), 분쟁 종료 3년 넘게 남은 감사 사건 수(S1), 0196 계약보다 하루 넘게 남은 티켓 수(소비 2일 · 만료 1일 초과), purge-reward-records-90d 의 마지막 성공 시각·7일 실패 수·26시간 미실행 여부. pg_cron 이 없으면 ok=false. 건수와 시각만. billing-tripwires.yml 이 ok=false 면 이슈를 연다.';

----------------------------------------------------------------------
-- 5. 끝 상태 확인 (0172~0205 와 같은 모양)
----------------------------------------------------------------------

DO $postcondition$
DECLARE
  v_ok boolean;
BEGIN
  -- R2: 정리 기간 89일 > 티켓 재시도 창 1일. 둘 중 하나가 바뀌면 여기서 멈춘다.
  IF (SELECT p.prosrc FROM pg_catalog.pg_proc AS p
       WHERE p.oid = 'public.purge_reward_records(integer,integer)'::regprocedure)
       !~ 'make_interval\(days => 89\)'
     OR (SELECT p.prosrc FROM pg_catalog.pg_proc AS p
          WHERE p.oid = 'public.purge_reward_records(integer,integer)'::regprocedure)
       !~ 'make_interval\(years => 3\)'
     OR (SELECT p.prosrc FROM pg_catalog.pg_proc AS p
          WHERE p.oid = 'public.prune_reward_ssv_tickets()'::regprocedure)
       !~ 'make_interval\(days => 1\)'
     OR NOT (SELECT c.relrowsecurity AND c.relforcerowsecurity
               FROM pg_catalog.pg_class AS c
              WHERE c.oid = 'public.reward_dispute_holds'::regclass)
     OR has_table_privilege('authenticated', 'public.reward_dispute_holds', 'SELECT,INSERT,UPDATE,DELETE')
     OR has_table_privilege('service_role', 'public.reward_dispute_holds', 'SELECT,INSERT,UPDATE,DELETE')
     OR has_table_privilege('authenticated', 'public.reward_dispute_hold_events', 'SELECT,INSERT,UPDATE,DELETE')
     OR has_function_privilege('anon', 'public.purge_reward_records(integer,integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.purge_reward_records(integer,integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.place_reward_dispute_hold(text,text,text,text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.release_reward_dispute_hold(text,text,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.place_reward_dispute_hold(text,text,text,text,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.reward_retention_health()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.reward_retention_health()', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.reward_retention_health()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.review_reward_dispute_hold(text,text,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.review_reward_dispute_hold(text,text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.reward_dispute_holds_log_delete()', 'EXECUTE')
     OR has_table_privilege('service_role', 'public.reward_dispute_hold_events', 'SELECT,INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION '0211: reward 89-day purge postcondition failed';
  END IF;
  -- cron.job 은 pg_cron 이 있을 때만 존재한다. 정적 참조는 계획 단계에서 실패하므로 동적으로 묻는다.
  IF to_regclass('cron.job') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM cron.job WHERE jobname = $1 AND schedule = $2 AND active)'
      INTO v_ok USING 'purge-reward-records-90d', '37 19 * * *';
    IF NOT v_ok THEN
      RAISE EXCEPTION '0211: purge-reward-records-90d is not scheduled as expected';
    END IF;
  END IF;
END
$postcondition$;
