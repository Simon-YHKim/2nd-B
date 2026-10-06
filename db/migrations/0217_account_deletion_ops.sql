-- 0217_account_deletion_ops.sql
--
-- 계정 삭제 작업 원장 + 영수증 (Simon 결정 Q-261004-42 = A, 설계 채택 DECISIONS.md 26.10.06 22:33 ①).
-- 설계서: docs/design/deletion-receipt-server-261006.md 3절 · 7절 · 10절 Q4 · Q6.
--
-- 왜. 지금까지 삭제 영수증은 앱 화면이 메모리에 들고 다음 화면까지 건넸고, 서버에는 "요청이
-- 어디까지 갔나" 를 적는 칸이 없었다. 그래서 영수증이 없을 때 "삭제 안 됨" 과 "기록 실패" 를
-- 가를 수 없었다(설계서 1.2 S3 · S6). 이 파일은 서버가 먼저 기억하게 한다(불변식 I1):
-- 파괴 작업 전에 작업 행이 커밋되고, 상태(접수 → 실행 → 완료 · 실패 · 포기)를 서버가 쓴다.
-- 영수증은 그 행의 완료 상태다.
--
-- 표 하나 = 작업 하나. 작업 번호(id)는 기기가 무작위로 만들고 서버는 처음 보는 번호만 받는다
-- (I2). 같은 계정의 두 기기는 각자 행을 갖고, 프로필 삭제 트랜잭션의 트리거가 그 계정의 진행 중
-- 작업을 모두 완료로 바꾼다(I3). 기기는 서버가 HMAC 으로 서명한 작업 증표만 들고, 서버는 그
-- 증표의 sha256 만 저장한다(I4). 증표 원문과 서명 비밀값(pepper)은 이 DB 에 없다.
--
-- 개인정보 최소. owner_id 는 진행 중에만 계정 id 를 갖고, 완료 트랜잭션(public.users BEFORE
-- DELETE)에서 NULL 이 된다. 완료 행에 남는 것은 번호 · 시각 · 정리 결과 플래그 · 만료 시각뿐이다.
-- 실패 · 포기 행은 계정이 살아 있어서 owner_id 를 유지하고 30일 뒤 지워진다. 그 계정이 나중에
-- 삭제되면 트리거가 그 행들의 owner_id 도 비운다.
--
-- 옛 앱(본문 {}) 요청도 행을 갖는다. 설계서 3.3 은 "옛 본문은 작업 행 없이" 라고 적었지만,
-- 그러면 Q6(아래)의 해제가 "지금 진행 중인 삭제가 없다" 를 확인할 수 없다. 그래서 새 Edge 는
-- 옛 요청에도 서버가 번호를 만들어 행을 남긴다(token_hash NULL - 증표가 없으니 기기 복구 조회는
-- 열리지 않는다). 이 차이는 PR 본문에 적었다.
--
-- Q6 (Simon 채택: 실패한 작업의 tombstone 은 같은 계정 advisory lock 아래 failed 확정 뒤 해제).
-- 0192 의 account_deletion_tombstones 는 지워지는 경로가 없어서, Auth 삭제 전에 실패한 계정은
-- 업로드 · 동의 변경 · 북극성 생성이 영구히 거절됐다(설계서 1.4 F5). 이제 작업이 failed 로
-- 확정되면 0192 와 같은 advisory lock(hashtextextended(user_id, 260913), 배타)과 users 행 잠금
-- 아래에서, (a) 그 계정에 실행 중 작업이 하나도 없고 (b) tombstone 을 마지막으로 건드린 요청 뒤에
-- 끝난 실패 작업이 있을 때만 tombstone 을 지운다. begin_account_deletion 도 같은 잠금을 잡으므로
-- 해제와 새 삭제는 줄을 선다. 0192 의 표 · 함수는 고치지 않는다. 등록부 사유 문장은 0229 가 바꾼다.
-- ⚠ 남는 틈(받아들인 것): 0217 적용 뒤 · 새 delete-account 배포 전, 옛 Edge 가 처리하던 요청이
-- 배포 순간에 걸쳐 진행 중이면 그 요청은 행이 없어 (a) 가 보지 못한다. 같은 계정의 다른 기기
-- 삭제가 그 몇 초 안에 실패해야 생기는 경우다.
--
-- 보관 (Q4 = 365일). 완료 행은 finished_at + 365일 뒤 조회에서 빠지고 정리 작업이 지운다.
-- 정리 작업(pg_cron 'account-deletion-ops-maintenance', 매시 17분)은 오래된 접수(10분) · 실행(15분)
-- 행의 확정, 실패 뒤 tombstone 해제, 만료 영수증 · 30일 지난 실패/포기 행 · 지난 조회 한도 창 삭제를
-- 한다. 설계서 7절은 하루 1회였지만, 실패 뒤 업로드 차단이 하루까지 이어지지 않게 매시로 돌린다.
-- 호스팅된 Supabase(supabase_admin 역할이 있는 곳)에서 pg_cron 이 없으면 적용을 실패시킨다 -
-- 법무 문서의 "1년 뒤 자동 삭제" 는 선택이 아니라 사후조건이다. CI 의 순정 PostgreSQL 은 NOTICE.
--
-- 로그인 없는 영수증 조회. 조회는 account-deletion-receipt Edge 가 service_role 로 부른다.
-- 무계정 호출 상한(0216 과 같은 모양)은 DB 조회 전에 소비한다: 네트워크 키당 시간당 30회,
-- 전체 하루 3000회.
--
-- 의존. 0192(account_deletion_tombstones · begin_account_deletion)가 먼저 있어야 한다. 운영에는
-- 0192 가 적용돼 있다(원장 20260929143410). 운영 적용 순서: 0217 → 0228 · 0229 → 비밀값 두 개
-- (ACCOUNT_DELETION_OP_TOKEN_PEPPER_V1 · ACCOUNT_DELETION_LOOKUP_PEPPER_V1) → delete-account 배포
-- → account-deletion-receipt 배포 → 웹 게시. ⚠ 운영 적용과 배포는 Simon GO 뒤에만 한다.
--
-- 최상위 BEGIN/COMMIT 을 두지 않는다. Supabase CLI 가 이 파일을 자기 트랜잭션으로 감싼다.

SET LOCAL lock_timeout = '10s';

DO $require_0192$
BEGIN
  IF pg_catalog.to_regclass('public.account_deletion_tombstones') IS NULL
     OR pg_catalog.to_regprocedure('public.begin_account_deletion(uuid,uuid,timestamptz)') IS NULL
     OR pg_catalog.to_regprocedure('public.billing_request_role()') IS NULL THEN
    RAISE EXCEPTION '0217 requires 0192 (account_deletion_tombstones, begin_account_deletion) and 0118 (billing_request_role)';
  END IF;
END;
$require_0192$;

----------------------------------------------------------------------
-- 1. 삭제 작업 원장. 클라이언트 역할은 아무 권한도 없다 (RLS FORCE, 정책 없음).
----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.account_deletion_ops (
  id uuid PRIMARY KEY,
  -- 작업 증표의 sha256. NULL = 옛 앱 요청에 서버가 만든 행(증표가 없어 기기 복구 조회 불가).
  token_hash bytea
    CONSTRAINT account_deletion_ops_token_hash_check
      CHECK (token_hash IS NULL OR pg_catalog.octet_length(token_hash) = 32),
  -- 증표 HMAC 의 입력에 들어간 접수 시각(ms). 같은 번호의 재접수 · 조회 때 증표를 다시 계산한다.
  token_issued_ms bigint
    CONSTRAINT account_deletion_ops_token_issued_ms_check
      CHECK (token_issued_ms IS NULL OR token_issued_ms > 0),
  owner_id uuid,
  status text NOT NULL
    CONSTRAINT account_deletion_ops_status_check
      CHECK (status IN ('accepted', 'executing', 'completed', 'failed', 'abandoned')),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  execute_started_at timestamptz,
  last_attempt_at timestamptz,
  finished_at timestamptz,
  sweeps jsonb NOT NULL DEFAULT '{}'::jsonb
    CONSTRAINT account_deletion_ops_sweeps_object
      CHECK (pg_catalog.jsonb_typeof(sweeps) = 'object'),
  sweeps_reported_at timestamptz,
  failure_code text
    CONSTRAINT account_deletion_ops_failure_code_check
      CHECK (failure_code IS NULL OR failure_code ~ '^[a-z][a-z0-9_]{0,47}$'),
  receipt_expires_at timestamptz,
  CONSTRAINT account_deletion_ops_token_pair
    CHECK ((token_hash IS NULL) = (token_issued_ms IS NULL)),
  CONSTRAINT account_deletion_ops_state_shape CHECK (
    (status = 'accepted' AND owner_id IS NOT NULL AND execute_started_at IS NULL
       AND finished_at IS NULL AND receipt_expires_at IS NULL)
    OR (status = 'executing' AND owner_id IS NOT NULL AND execute_started_at IS NOT NULL
       AND last_attempt_at IS NOT NULL AND finished_at IS NULL AND receipt_expires_at IS NULL)
    OR (status = 'completed' AND owner_id IS NULL AND finished_at IS NOT NULL
       AND receipt_expires_at > finished_at)
    OR (status = 'failed' AND finished_at IS NOT NULL AND receipt_expires_at IS NULL)
    OR (status = 'abandoned' AND execute_started_at IS NULL AND finished_at IS NOT NULL
       AND receipt_expires_at IS NULL)
  )
);

ALTER TABLE public.account_deletion_ops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_deletion_ops FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.account_deletion_ops
  FROM PUBLIC, anon, authenticated, service_role;

CREATE INDEX IF NOT EXISTS account_deletion_ops_owner_idx
  ON public.account_deletion_ops (owner_id, status)
  WHERE owner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS account_deletion_ops_active_idx
  ON public.account_deletion_ops (created_at)
  WHERE status IN ('accepted', 'executing');
CREATE INDEX IF NOT EXISTS account_deletion_ops_receipt_expiry_idx
  ON public.account_deletion_ops (receipt_expires_at)
  WHERE status = 'completed';
CREATE INDEX IF NOT EXISTS account_deletion_ops_closed_idx
  ON public.account_deletion_ops (finished_at)
  WHERE status IN ('failed', 'abandoned');

COMMENT ON TABLE public.account_deletion_ops IS
  '계정 삭제 작업 원장 = 영수증 (0217). 작업 1건 = 행 1개. 파괴 작업 전에 접수 행이 커밋되고 상태는 서버가 쓴다. owner_id 는 진행 중에만 차고 public.users 삭제 트랜잭션에서 NULL. 완료 행은 365일, 실패/포기 행은 30일 보관.';

----------------------------------------------------------------------
-- 2. 로그인 없는 영수증 조회의 호출 상한 (0216 과 같은 모양). 키 = Edge 가 비밀값으로 만든
--    네트워크 지문 HMAC. 원문 IP 는 이 표에 들어오지 않는다.
----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.account_deletion_receipt_lookup_limits (
  dimension text NOT NULL
    CONSTRAINT account_deletion_receipt_lookup_limits_dimension_check
      CHECK (dimension IN ('global', 'key')),
  key_hash text NOT NULL
    CONSTRAINT account_deletion_receipt_lookup_limits_key_hash_check
      CHECK (key_hash ~ '^[0-9a-f]{64}$'),
  window_start timestamptz NOT NULL,
  request_count integer NOT NULL
    CONSTRAINT account_deletion_receipt_lookup_limits_count_check
      CHECK (request_count BETWEEN 1 AND 1000000),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT account_deletion_receipt_lookup_limits_pkey PRIMARY KEY (dimension, key_hash)
);

ALTER TABLE public.account_deletion_receipt_lookup_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_deletion_receipt_lookup_limits FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.account_deletion_receipt_lookup_limits
  FROM PUBLIC, anon, authenticated, service_role;

CREATE INDEX IF NOT EXISTS account_deletion_receipt_lookup_limits_stale_idx
  ON public.account_deletion_receipt_lookup_limits (updated_at)
  WHERE dimension = 'key';

COMMENT ON TABLE public.account_deletion_receipt_lookup_limits IS
  '0217: 로그인 없는 삭제 영수증 조회의 호출 상한. 네트워크 키(HMAC) 시간당 30회 + 전체 하루 3000회. 계정과 무관.';

----------------------------------------------------------------------
-- 3. 내부 도우미 (권한 없음 - 아래 서비스 함수만 부른다).
--    둘 다 호출자가 이미 같은 계정의 advisory lock 과 users 행 잠금을 쥐고 있다고 가정한다.
----------------------------------------------------------------------

-- 오래된 진행 중 행을 확정한다(게으른 확정). 계정 행이 살아 있을 때만 부른다.
--   접수(accepted) 10분 안에 실행 요청이 없으면 → abandoned
--   실행(executing) 마지막 시도 15분 뒤 → failed (Edge 의 벽시계 상한보다 길다)
CREATE OR REPLACE FUNCTION public.account_deletion_ops_settle_live_owner(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  -- 초 단위로 자르지 않는다: Q6 해제가 finished_at 을 tombstone 의 last_requested_at(마이크로초)과
  -- 비교하므로, 같은 초 안의 실패가 "마지막 요청보다 먼저 끝났다" 로 읽히면 안 된다.
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_a integer;
  v_f integer;
BEGIN
  UPDATE public.account_deletion_ops AS o
     SET status = 'abandoned',
         finished_at = v_now
   WHERE o.owner_id = p_user_id
     AND o.status = 'accepted'
     AND o.created_at <= v_now - interval '10 minutes';
  GET DIAGNOSTICS v_a = ROW_COUNT;

  UPDATE public.account_deletion_ops AS o
     SET status = 'failed',
         finished_at = v_now,
         failure_code = COALESCE(o.failure_code, 'stale_execution')
   WHERE o.owner_id = p_user_id
     AND o.status = 'executing'
     AND o.last_attempt_at <= v_now - interval '15 minutes';
  GET DIAGNOSTICS v_f = ROW_COUNT;

  RETURN v_a + v_f;
END;
$$;

REVOKE ALL ON FUNCTION public.account_deletion_ops_settle_live_owner(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- Q6: 실패가 확정된 계정의 tombstone 을 푼다. 두 조건이 모두 참일 때만:
--   (a) 그 계정에 실행 중(executing) 작업이 없다 - 진행 중인 삭제가 그 울타리에 기대고 있지 않다.
--   (b) tombstone 을 마지막으로 건드린 요청(last_requested_at) 뒤에 끝난 실패 작업이 있다 -
--       마지막 요청이 실패로 끝났다. 0217 이전의 옛 tombstone 은 실패 작업이 없으니 그대로다.
CREATE OR REPLACE FUNCTION public.account_deletion_ops_release_failed_fence(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
BEGIN
  IF EXISTS (
       SELECT 1 FROM public.account_deletion_ops AS o
        WHERE o.owner_id = p_user_id AND o.status = 'executing'
     ) THEN
    RETURN false;
  END IF;

  DELETE FROM public.account_deletion_tombstones AS t
   WHERE t.user_id = p_user_id
     AND EXISTS (
       SELECT 1 FROM public.account_deletion_ops AS o
        WHERE o.owner_id = p_user_id
          AND o.status = 'failed'
          AND o.finished_at >= t.last_requested_at
     );
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.account_deletion_ops_release_failed_fence(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

----------------------------------------------------------------------
-- 4. 접수 (begin). service_role 전용. users 행을 0192 와 같은 순서로 먼저 잠그고, 행이 없으면
--    아무것도 쓰지 않는다(삭제 뒤 user↔번호 연결이 다시 생기지 않게, 게이트 D2A-R2-04).
--    결과: accepted | replayed | op_taken | account_gone | too_many | invalid
----------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.begin_account_deletion_op(
  p_op_id uuid,
  p_user_id uuid,
  p_token_issued_ms bigint,
  p_token_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
SET lock_timeout = '5s'
AS $$
DECLARE
  v_now_ms bigint;
  v_locked uuid;
  v_op public.account_deletion_ops%ROWTYPE;
  v_active integer;
BEGIN
  IF public.billing_request_role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role only' USING ERRCODE = '42501';
  END IF;
  v_now_ms := pg_catalog.floor(EXTRACT(EPOCH FROM pg_catalog.clock_timestamp()) * 1000)::bigint;
  IF p_op_id IS NULL OR p_user_id IS NULL OR p_token_issued_ms IS NULL
     OR p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$'
     OR p_token_issued_ms < v_now_ms - 300000 OR p_token_issued_ms > v_now_ms + 300000 THEN
    RETURN pg_catalog.jsonb_build_object('result', 'invalid');
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 260913));
  SELECT u.id INTO v_locked FROM public.users AS u WHERE u.id = p_user_id FOR UPDATE;
  IF v_locked IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('result', 'account_gone');
  END IF;

  PERFORM public.account_deletion_ops_settle_live_owner(p_user_id);

  SELECT * INTO v_op FROM public.account_deletion_ops AS o WHERE o.id = p_op_id FOR UPDATE;
  IF FOUND THEN
    -- 같은 계정 · 아직 접수 상태(10분 안)일 때만 같은 작업을 이어 준다. Edge 가 저장된 접수 시각으로
    -- 증표를 다시 계산하므로 기기는 같은 증표를 받는다. 그 밖은 번호를 바꿔 주지 않고 거절한다(I2).
    IF v_op.owner_id = p_user_id AND v_op.status = 'accepted' AND v_op.token_hash IS NOT NULL THEN
      RETURN pg_catalog.jsonb_build_object('result', 'replayed', 'token_issued_ms', v_op.token_issued_ms);
    END IF;
    RETURN pg_catalog.jsonb_build_object('result', 'op_taken');
  END IF;

  SELECT pg_catalog.count(*)::integer INTO v_active
    FROM public.account_deletion_ops AS o
   WHERE o.owner_id = p_user_id AND o.status IN ('accepted', 'executing');
  IF v_active >= 20 THEN
    RETURN pg_catalog.jsonb_build_object('result', 'too_many');
  END IF;

  INSERT INTO public.account_deletion_ops (id, token_hash, token_issued_ms, owner_id, status, created_at)
  VALUES (p_op_id, pg_catalog.decode(p_token_hash, 'hex'), p_token_issued_ms, p_user_id, 'accepted',
          pg_catalog.date_trunc('second', pg_catalog.clock_timestamp()));

  RETURN pg_catalog.jsonb_build_object('result', 'accepted', 'token_issued_ms', p_token_issued_ms);
END;
$$;

REVOKE ALL ON FUNCTION public.begin_account_deletion_op(uuid, uuid, bigint, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.begin_account_deletion_op(uuid, uuid, bigint, text)
  TO service_role;

----------------------------------------------------------------------
-- 5. 실행 시작 (execute). service_role 전용. 증표 해시 · 소유자가 맞는 접수 행을 실행 상태로
--    바꾼 뒤에만 Edge 가 tombstone(0192) → Storage → Auth 삭제로 간다.
--    같은 번호의 재시도(Storage 진척 409 등)는 'continued'. 계정이 이미 지워졌고 그 작업이
--    완료돼 있으면 'completed' 로 영수증만 돌려준다(파괴 작업 없음).
--    결과: started | continued | completed | failed | abandoned | rejected
----------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.start_account_deletion_op(
  p_op_id uuid,
  p_user_id uuid,
  p_token_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
SET lock_timeout = '5s'
AS $$
DECLARE
  v_now timestamptz := pg_catalog.date_trunc('second', pg_catalog.clock_timestamp());
  v_hash bytea;
  v_locked uuid;
  v_op public.account_deletion_ops%ROWTYPE;
BEGIN
  IF public.billing_request_role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role only' USING ERRCODE = '42501';
  END IF;
  IF p_op_id IS NULL OR p_user_id IS NULL OR p_token_hash IS NULL
     OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN pg_catalog.jsonb_build_object('result', 'rejected');
  END IF;
  v_hash := pg_catalog.decode(p_token_hash, 'hex');

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 260913));
  SELECT u.id INTO v_locked FROM public.users AS u WHERE u.id = p_user_id FOR UPDATE;

  IF v_locked IS NULL THEN
    SELECT * INTO v_op FROM public.account_deletion_ops AS o
     WHERE o.id = p_op_id AND o.token_hash = v_hash;
    IF FOUND AND v_op.status = 'completed' AND v_op.receipt_expires_at > pg_catalog.now() THEN
      RETURN pg_catalog.jsonb_build_object(
        'result', 'completed',
        'finished_at', v_op.finished_at,
        'receipt_expires_at', v_op.receipt_expires_at,
        'sweeps', v_op.sweeps,
        'sweeps_reported', v_op.sweeps_reported_at IS NOT NULL);
    END IF;
    RETURN pg_catalog.jsonb_build_object('result', 'rejected');
  END IF;

  PERFORM public.account_deletion_ops_settle_live_owner(p_user_id);

  SELECT * INTO v_op FROM public.account_deletion_ops AS o WHERE o.id = p_op_id FOR UPDATE;
  IF NOT FOUND OR v_op.token_hash IS DISTINCT FROM v_hash OR v_op.owner_id IS DISTINCT FROM p_user_id THEN
    RETURN pg_catalog.jsonb_build_object('result', 'rejected');
  END IF;

  IF v_op.status = 'accepted' THEN
    UPDATE public.account_deletion_ops AS o
       SET status = 'executing', execute_started_at = v_now, last_attempt_at = v_now
     WHERE o.id = p_op_id;
    RETURN pg_catalog.jsonb_build_object('result', 'started');
  ELSIF v_op.status = 'executing' THEN
    UPDATE public.account_deletion_ops AS o
       SET last_attempt_at = v_now
     WHERE o.id = p_op_id;
    RETURN pg_catalog.jsonb_build_object('result', 'continued');
  END IF;
  -- 살아 있는 계정의 작업이 끝나 있으면 failed 또는 abandoned 다.
  RETURN pg_catalog.jsonb_build_object('result', v_op.status);
END;
$$;

REVOKE ALL ON FUNCTION public.start_account_deletion_op(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.start_account_deletion_op(uuid, uuid, text)
  TO service_role;

----------------------------------------------------------------------
-- 6. 옛 앱(본문 {})의 요청에도 행을 남긴다. 서버가 번호를 만들고 증표는 없다.
--    같은 계정의 증표 없는 실행 중 행이 있으면 그것을 이어 간다(옛 앱의 409 재시도).
--    결과: started | continued | account_gone (+ op_id)
----------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.start_legacy_account_deletion_op(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
SET lock_timeout = '5s'
AS $$
DECLARE
  v_now timestamptz := pg_catalog.date_trunc('second', pg_catalog.clock_timestamp());
  v_locked uuid;
  v_op_id uuid;
BEGIN
  IF public.billing_request_role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role only' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('result', 'account_gone');
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 260913));
  SELECT u.id INTO v_locked FROM public.users AS u WHERE u.id = p_user_id FOR UPDATE;
  IF v_locked IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('result', 'account_gone');
  END IF;

  PERFORM public.account_deletion_ops_settle_live_owner(p_user_id);

  SELECT o.id INTO v_op_id
    FROM public.account_deletion_ops AS o
   WHERE o.owner_id = p_user_id AND o.status = 'executing' AND o.token_hash IS NULL
   ORDER BY o.last_attempt_at DESC
   LIMIT 1
     FOR UPDATE;
  IF v_op_id IS NOT NULL THEN
    UPDATE public.account_deletion_ops AS o SET last_attempt_at = v_now WHERE o.id = v_op_id;
    RETURN pg_catalog.jsonb_build_object('result', 'continued', 'op_id', v_op_id);
  END IF;

  v_op_id := pg_catalog.gen_random_uuid();
  INSERT INTO public.account_deletion_ops (id, owner_id, status, created_at, execute_started_at, last_attempt_at)
  VALUES (v_op_id, p_user_id, 'executing', v_now, v_now, v_now);
  RETURN pg_catalog.jsonb_build_object('result', 'started', 'op_id', v_op_id);
END;
$$;

REVOKE ALL ON FUNCTION public.start_legacy_account_deletion_op(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.start_legacy_account_deletion_op(uuid)
  TO service_role;

----------------------------------------------------------------------
-- 7. Auth 삭제 전에 실패한 작업을 failed 로 확정한다 (service_role 전용). 계정 행이 살아 있을
--    때만 - 행이 없으면 삭제가 이미 커밋됐다는 뜻이고 트리거가 완료로 바꿨다. 확정 뒤 같은 잠금
--    아래에서 Q6 해제를 시도한다.
--    결과: { status, fence_released }
----------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fail_account_deletion_op(
  p_op_id uuid,
  p_user_id uuid,
  p_code text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
SET lock_timeout = '5s'
AS $$
DECLARE
  v_now timestamptz := pg_catalog.clock_timestamp();  -- 자르지 않는다(위 settle 과 같은 이유)
  v_locked uuid;
  v_status text;
  v_released boolean := false;
BEGIN
  IF public.billing_request_role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role only' USING ERRCODE = '42501';
  END IF;
  IF p_op_id IS NULL OR p_user_id IS NULL
     OR p_code IS NULL OR p_code !~ '^[a-z][a-z0-9_]{0,47}$' THEN
    RETURN pg_catalog.jsonb_build_object('status', NULL, 'fence_released', false);
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 260913));
  SELECT u.id INTO v_locked FROM public.users AS u WHERE u.id = p_user_id FOR UPDATE;
  IF v_locked IS NULL THEN
    SELECT o.status INTO v_status FROM public.account_deletion_ops AS o WHERE o.id = p_op_id;
    RETURN pg_catalog.jsonb_build_object('status', v_status, 'fence_released', false);
  END IF;

  UPDATE public.account_deletion_ops AS o
     SET status = 'failed', finished_at = v_now, failure_code = p_code
   WHERE o.id = p_op_id AND o.owner_id = p_user_id AND o.status = 'executing';

  PERFORM public.account_deletion_ops_settle_live_owner(p_user_id);
  v_released := public.account_deletion_ops_release_failed_fence(p_user_id);

  SELECT o.status INTO v_status
    FROM public.account_deletion_ops AS o
   WHERE o.id = p_op_id AND o.owner_id = p_user_id;
  RETURN pg_catalog.jsonb_build_object('status', v_status, 'fence_released', v_released);
END;
$$;

REVOKE ALL ON FUNCTION public.fail_account_deletion_op(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fail_account_deletion_op(uuid, uuid, text)
  TO service_role;

----------------------------------------------------------------------
-- 8. Auth 삭제 뒤 Edge 가 관측한 정리 결과를 한 번만 적는다 (service_role 전용).
--    허용 키 여섯 개 · 값은 참/거짓/null. 완료 행에만.
----------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_account_deletion_op_sweeps(
  p_op_id uuid,
  p_sweeps jsonb
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
BEGIN
  IF public.billing_request_role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role only' USING ERRCODE = '42501';
  END IF;
  IF p_op_id IS NULL OR p_sweeps IS NULL
     OR pg_catalog.jsonb_typeof(p_sweeps) IS DISTINCT FROM 'object' THEN
    RETURN false;
  END IF;
  IF EXISTS (
    SELECT 1
      FROM pg_catalog.jsonb_each(p_sweeps) AS entry(key, value)
     WHERE entry.key NOT IN (
             'profile_erased',
             'deletion_fenced',
             'raw_clippings_erased',
             'raw_clippings_empty_at_check',
             'record_photos_erased',
             'record_photos_empty_at_check'
           )
        OR pg_catalog.jsonb_typeof(entry.value) NOT IN ('boolean', 'null')
  ) THEN
    RETURN false;
  END IF;

  UPDATE public.account_deletion_ops AS o
     SET sweeps = p_sweeps,
         sweeps_reported_at = pg_catalog.date_trunc('second', pg_catalog.clock_timestamp())
   WHERE o.id = p_op_id
     AND o.status = 'completed'
     AND o.sweeps_reported_at IS NULL
     AND o.receipt_expires_at > pg_catalog.now();
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.record_account_deletion_op_sweeps(uuid, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_account_deletion_op_sweeps(uuid, jsonb)
  TO service_role;

----------------------------------------------------------------------
-- 9. 조회 (service_role 전용 - account-deletion-receipt Edge 가 부른다).
--    p_token_hash NULL  = 영수증 보기(①): 완료 · 미만료 행의 날짜 · 만료 · 정리 결과만.
--    p_token_hash 있음  = 기기 복구(②): 증표 해시가 맞는 행의 상태 + 증표 발급 시각.
--                         Edge 가 그 시각과 기기가 내민 소유자 id 로 HMAC 을 다시 계산해
--                         맞을 때만 기기에 답한다(서버는 완료 뒤 소유자 id 를 갖고 있지 않다).
--    계정이 살아 있는 진행 중 행은 여기서 게으르게 확정한다. 진행 중인데 계정 행이 없으면
--    (트리거가 실패를 삼켰을 때) 삭제는 사실이므로 completed + unrecorded 로 확정한다.
--    없거나 만료됐거나 해시가 다르면 NULL.
----------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_account_deletion_op(
  p_op_id uuid,
  p_token_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
SET lock_timeout = '5s'
AS $$
DECLARE
  v_now timestamptz := pg_catalog.date_trunc('second', pg_catalog.clock_timestamp());
  v_op public.account_deletion_ops%ROWTYPE;
  v_locked uuid;
BEGIN
  IF public.billing_request_role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role only' USING ERRCODE = '42501';
  END IF;
  IF p_op_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF p_token_hash IS NULL THEN
    SELECT * INTO v_op FROM public.account_deletion_ops AS o
     WHERE o.id = p_op_id AND o.status = 'completed' AND o.receipt_expires_at > pg_catalog.now();
    IF NOT FOUND THEN
      RETURN NULL;
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'op_id', v_op.id,
      'status', 'completed',
      'finished_at', v_op.finished_at,
      'receipt_expires_at', v_op.receipt_expires_at,
      'sweeps', v_op.sweeps,
      'sweeps_reported', v_op.sweeps_reported_at IS NOT NULL);
  END IF;

  IF p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_op FROM public.account_deletion_ops AS o
   WHERE o.id = p_op_id AND o.token_hash = pg_catalog.decode(p_token_hash, 'hex');
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_op.status IN ('accepted', 'executing') AND v_op.owner_id IS NOT NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_op.owner_id::text, 260913));
    SELECT u.id INTO v_locked FROM public.users AS u WHERE u.id = v_op.owner_id FOR UPDATE;
    IF v_locked IS NULL THEN
      UPDATE public.account_deletion_ops AS o
         SET status = 'completed',
             owner_id = NULL,
             finished_at = v_now,
             receipt_expires_at = v_now + interval '365 days',
             sweeps = o.sweeps || '{"unrecorded": true}'::jsonb
       WHERE o.owner_id = v_op.owner_id AND o.status IN ('accepted', 'executing');
      UPDATE public.account_deletion_ops AS o SET owner_id = NULL WHERE o.owner_id = v_op.owner_id;
    ELSE
      PERFORM public.account_deletion_ops_settle_live_owner(v_op.owner_id);
      PERFORM public.account_deletion_ops_release_failed_fence(v_op.owner_id);
    END IF;
    SELECT * INTO v_op FROM public.account_deletion_ops AS o WHERE o.id = p_op_id;
  END IF;

  IF v_op.status = 'completed' AND v_op.receipt_expires_at <= pg_catalog.now() THEN
    RETURN NULL;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'op_id', v_op.id,
    'status', v_op.status,
    'token_issued_ms', v_op.token_issued_ms,
    'finished_at', v_op.finished_at,
    'receipt_expires_at', v_op.receipt_expires_at,
    'sweeps', CASE WHEN v_op.status = 'completed' THEN v_op.sweeps ELSE '{}'::jsonb END,
    'sweeps_reported', v_op.sweeps_reported_at IS NOT NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.get_account_deletion_op(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_account_deletion_op(uuid, text)
  TO service_role;

----------------------------------------------------------------------
-- 10. 로그인 없는 조회의 호출 상한 (service_role 전용). DB 조회 전에 Edge 가 먼저 부른다.
--     네트워크 키 시간당 30회, 전체 하루 3000회. 전체 잠금을 키 잠금보다 먼저 잡는다(0216).
----------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.consume_account_deletion_receipt_lookup(p_key_hash text)
RETURNS TABLE (allowed boolean, retry_after_seconds integer)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
AS $$
DECLARE
  c_global_key constant text := pg_catalog.repeat('0', 64);
  c_global_cap constant integer := 3000;
  c_key_cap constant integer := 30;
  v_now timestamptz;
  v_hour timestamptz;
  v_day timestamptz;
  v_global integer;
  v_key integer;
BEGIN
  IF public.billing_request_role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role only' USING ERRCODE = '42501';
  END IF;
  IF p_key_hash IS NULL OR p_key_hash !~ '^[0-9a-f]{64}$' OR p_key_hash = c_global_key THEN
    RAISE EXCEPTION 'account_deletion_receipt_lookup_key_invalid' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('account_deletion_receipt_lookup:global', 0));
  v_now := pg_catalog.clock_timestamp();
  v_hour := pg_catalog.date_trunc('hour', v_now);
  v_day := pg_catalog.date_trunc('day', v_now);

  SELECT CASE WHEN l.window_start = v_day THEN l.request_count ELSE 0 END
    INTO v_global
    FROM public.account_deletion_receipt_lookup_limits AS l
   WHERE l.dimension = 'global' AND l.key_hash = c_global_key;
  v_global := COALESCE(v_global, 0);
  IF v_global >= c_global_cap THEN
    RETURN QUERY SELECT false,
      GREATEST(1, LEAST(86400, pg_catalog.ceil(EXTRACT(EPOCH FROM (v_day + interval '1 day' - v_now)))::integer));
    RETURN;
  END IF;

  -- 공격자가 부를 수 있는 길이라 한 번에 지우는 양을 묶는다(0216).
  DELETE FROM public.account_deletion_receipt_lookup_limits AS l
  USING (
    SELECT s.key_hash
      FROM public.account_deletion_receipt_lookup_limits AS s
     WHERE s.dimension = 'key' AND s.updated_at < v_now - interval '2 hours'
     ORDER BY s.updated_at, s.key_hash
     LIMIT 32
  ) AS stale
  WHERE l.dimension = 'key' AND l.key_hash = stale.key_hash;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('account_deletion_receipt_lookup:key:' || p_key_hash, 0));

  INSERT INTO public.account_deletion_receipt_lookup_limits AS l
    (dimension, key_hash, window_start, request_count, updated_at)
  VALUES ('key', p_key_hash, v_hour, 1, v_now)
  ON CONFLICT (dimension, key_hash) DO UPDATE SET
    window_start = EXCLUDED.window_start,
    request_count = CASE WHEN l.window_start = EXCLUDED.window_start
                         THEN LEAST(l.request_count + 1, c_key_cap + 1) ELSE 1 END,
    updated_at = EXCLUDED.updated_at
  RETURNING l.request_count INTO v_key;

  IF v_key > c_key_cap THEN
    RETURN QUERY SELECT false,
      GREATEST(1, LEAST(3600, pg_catalog.ceil(EXTRACT(EPOCH FROM (v_hour + interval '1 hour' - v_now)))::integer));
    RETURN;
  END IF;

  INSERT INTO public.account_deletion_receipt_lookup_limits AS l
    (dimension, key_hash, window_start, request_count, updated_at)
  VALUES ('global', c_global_key, v_day, 1, v_now)
  ON CONFLICT (dimension, key_hash) DO UPDATE SET
    window_start = EXCLUDED.window_start,
    request_count = CASE WHEN l.window_start = EXCLUDED.window_start
                         THEN LEAST(l.request_count + 1, c_global_cap) ELSE 1 END,
    updated_at = EXCLUDED.updated_at;

  RETURN QUERY SELECT true, 0;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_account_deletion_receipt_lookup(text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.consume_account_deletion_receipt_lookup(text)
  TO service_role;

----------------------------------------------------------------------
-- 11. 완료 트리거. 프로필 행이 지워지는 바로 그 트랜잭션에서, 그 계정의 접수 · 실행 중 작업을
--     전부 완료로 바꾸고 owner_id 를 비운다(I3). 실패 · 포기 행의 owner_id 도 비운다.
--     advisory lock 은 잡지 않는다: 삭제가 이미 users 행을 쥐고 있어, 잡으면 서비스 함수들의
--     (advisory → users) 순서와 거꾸로 돼 교착이 생길 수 있다. users 행 잠금이 둘을 줄 세운다.
--     실패해도 계정 삭제를 막지 않는다(삭제권이 영수증보다 우선 - 경고만). 그 경우 조회가
--     completed + unrecorded 로 확정한다(9).
----------------------------------------------------------------------

-- 트리거 전용이다. 누가 직접 부를 일이 없다 (0202 와 같은 이유로 넷 다 걷는다).
CREATE OR REPLACE FUNCTION public.complete_account_deletion_ops()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_now timestamptz;
BEGIN
  BEGIN
    v_now := pg_catalog.date_trunc('second', pg_catalog.clock_timestamp());
    UPDATE public.account_deletion_ops AS o
       SET status = 'completed',
           owner_id = NULL,
           finished_at = v_now,
           receipt_expires_at = v_now + interval '365 days'
     WHERE o.owner_id = OLD.id AND o.status IN ('accepted', 'executing');
    UPDATE public.account_deletion_ops AS o
       SET owner_id = NULL
     WHERE o.owner_id = OLD.id;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'account_deletion_ops_not_completed';
  END;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_account_deletion_ops()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_users_complete_account_deletion_ops ON public.users;
CREATE TRIGGER trg_users_complete_account_deletion_ops
  BEFORE DELETE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.complete_account_deletion_ops();

----------------------------------------------------------------------
-- 12. 정리 (pg_cron 과 service_role 만). 매시 17분.
--     ① 오래된 진행 중 행 확정 + Q6 해제 (계정마다 그 계정의 잠금 아래에서)
--     ② 만료 영수증 · 30일 지난 실패/포기 행 · 2시간 지난 조회 한도 창 삭제
----------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.purge_account_deletion_ops()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
SET lock_timeout = '5s'
SET statement_timeout = '120s'
AS $$
DECLARE
  v_role text := public.billing_request_role();
  v_owner uuid;
  v_locked uuid;
  v_settled integer := 0;
  v_released integer := 0;
  v_receipts integer := 0;
  v_closed integer := 0;
  v_limits integer := 0;
  v_n integer;
BEGIN
  -- pg_cron(JWT 없음) 과 service_role 만. authenticated · anon 은 EXECUTE 도 없다.
  IF v_role IS NOT NULL AND v_role <> 'service_role' THEN
    RAISE EXCEPTION 'service_role only' USING ERRCODE = '42501';
  END IF;

  FOR v_owner IN
    SELECT DISTINCT o.owner_id
      FROM public.account_deletion_ops AS o
     WHERE o.owner_id IS NOT NULL
       AND (
         (o.status = 'accepted' AND o.created_at <= pg_catalog.now() - interval '10 minutes')
         OR (o.status = 'executing' AND o.last_attempt_at <= pg_catalog.now() - interval '15 minutes')
         OR (o.status = 'failed' AND EXISTS (
               SELECT 1 FROM public.account_deletion_tombstones AS t WHERE t.user_id = o.owner_id))
       )
     -- 저장소 업로드 트리거(0192)가 여러 소유자를 정렬된 순서로 잠그므로 같은 순서로 돈다.
     ORDER BY o.owner_id
     LIMIT 500
  LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text, 260913));
    v_locked := NULL;
    SELECT u.id INTO v_locked FROM public.users AS u WHERE u.id = v_owner FOR UPDATE;
    IF v_locked IS NULL THEN
      -- 트리거가 실패를 삼킨 경우: 계정은 이미 없다. 삭제는 사실이므로 완료로 확정한다.
      UPDATE public.account_deletion_ops AS o
         SET status = 'completed',
             owner_id = NULL,
             finished_at = pg_catalog.date_trunc('second', pg_catalog.clock_timestamp()),
             receipt_expires_at = pg_catalog.date_trunc('second', pg_catalog.clock_timestamp()) + interval '365 days',
             sweeps = o.sweeps || '{"unrecorded": true}'::jsonb
       WHERE o.owner_id = v_owner AND o.status IN ('accepted', 'executing');
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_settled := v_settled + v_n;
      UPDATE public.account_deletion_ops AS o SET owner_id = NULL WHERE o.owner_id = v_owner;
    ELSE
      v_settled := v_settled + public.account_deletion_ops_settle_live_owner(v_owner);
      IF public.account_deletion_ops_release_failed_fence(v_owner) THEN
        v_released := v_released + 1;
      END IF;
    END IF;
  END LOOP;

  DELETE FROM public.account_deletion_ops AS o
   WHERE o.status = 'completed' AND o.receipt_expires_at <= pg_catalog.now();
  GET DIAGNOSTICS v_receipts = ROW_COUNT;

  DELETE FROM public.account_deletion_ops AS o
   WHERE o.status IN ('failed', 'abandoned') AND o.finished_at <= pg_catalog.now() - interval '30 days';
  GET DIAGNOSTICS v_closed = ROW_COUNT;

  DELETE FROM public.account_deletion_receipt_lookup_limits AS l
   WHERE (l.dimension = 'key' AND l.updated_at < pg_catalog.now() - interval '2 hours')
      OR (l.dimension = 'global' AND l.window_start < pg_catalog.date_trunc('day', pg_catalog.now()) - interval '1 day');
  GET DIAGNOSTICS v_limits = ROW_COUNT;

  -- cron.job_run_details.return_message 에 남는 요약(건수만, 식별 정보 없음).
  RETURN pg_catalog.jsonb_build_object(
    'settled', v_settled,
    'fences_released', v_released,
    'receipts_expired', v_receipts,
    'closed_purged', v_closed,
    'lookup_windows_purged', v_limits);
END;
$$;

REVOKE ALL ON FUNCTION public.purge_account_deletion_ops()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.purge_account_deletion_ops()
  TO service_role;

COMMENT ON FUNCTION public.purge_account_deletion_ops() IS
  '0217: 계정 삭제 작업 원장 정리. 오래된 접수(10분)→abandoned · 실행(15분)→failed 확정, 실패 확정 계정의 tombstone 해제(Q6, 같은 advisory lock), 만료 영수증(365일) · 30일 지난 실패/포기 행 · 지난 조회 한도 창 삭제. 매시 17분 pg_cron account-deletion-ops-maintenance.';

DO $schedule$
DECLARE
  v_job_id bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_available_extensions WHERE name = 'pg_cron') THEN
    -- 호스팅된 Supabase 에서는 정리 예약이 사후조건이다 (게이트 DEL2-R1-09 · D2A-R2-02).
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'supabase_admin') THEN
      RAISE EXCEPTION '0217: pg_cron is required on a hosted Supabase project for the receipt expiry';
    END IF;
    RAISE NOTICE '0217: pg_cron not available (CI dry-run); skipping account-deletion-ops-maintenance';
    RETURN;
  END IF;

  EXECUTE 'CREATE EXTENSION IF NOT EXISTS pg_cron';

  FOR v_job_id IN EXECUTE 'SELECT jobid FROM cron.job WHERE jobname = $1'
    USING 'account-deletion-ops-maintenance'
  LOOP
    EXECUTE 'SELECT cron.unschedule($1)' USING v_job_id;
  END LOOP;
  EXECUTE 'SELECT cron.schedule($1, $2, $3)'
    INTO v_job_id
    USING 'account-deletion-ops-maintenance', '17 * * * *', 'SELECT public.purge_account_deletion_ops();';
END;
$schedule$;

----------------------------------------------------------------------
-- 13. 끝 상태를 적용 시점에 확인한다 (0202 · 0216 과 같은 모양).
----------------------------------------------------------------------

DO $account_deletion_ops_check$
DECLARE
  v_fn text;
  v_jobs bigint;
BEGIN
  -- pg_cron 이 있는 곳에서는 정리 예약이 정확히 하나여야 한다. 동적 SQL 이라 순정 PG 에서도 해석된다.
  IF pg_catalog.to_regclass('cron.job') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM cron.job WHERE jobname = $1 AND command = $2'
      INTO v_jobs
      USING 'account-deletion-ops-maintenance', 'SELECT public.purge_account_deletion_ops();';
    IF v_jobs IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION '0217: account-deletion-ops-maintenance cron job missing (found %)', v_jobs;
    END IF;
  END IF;

  IF NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_trigger AS t
        WHERE t.tgrelid = 'public.users'::regclass
          AND t.tgname = 'trg_users_complete_account_deletion_ops'
          AND t.tgenabled = 'O'
          AND t.tgfoid = 'public.complete_account_deletion_ops()'::regprocedure
     )
     OR NOT (SELECT c.relrowsecurity AND c.relforcerowsecurity FROM pg_catalog.pg_class AS c
              WHERE c.oid = 'public.account_deletion_ops'::regclass)
     OR NOT (SELECT c.relrowsecurity AND c.relforcerowsecurity FROM pg_catalog.pg_class AS c
              WHERE c.oid = 'public.account_deletion_receipt_lookup_limits'::regclass)
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_policy AS p
                 WHERE p.polrelid IN ('public.account_deletion_ops'::regclass,
                                      'public.account_deletion_receipt_lookup_limits'::regclass))
     OR EXISTS (
       SELECT 1 FROM pg_catalog.pg_attribute AS a
        WHERE a.attrelid = 'public.account_deletion_ops'::regclass
          AND a.attnum > 0 AND NOT a.attisdropped
          AND a.attname NOT IN ('id', 'token_hash', 'token_issued_ms', 'owner_id', 'status', 'created_at',
                                'execute_started_at', 'last_attempt_at', 'finished_at', 'sweeps',
                                'sweeps_reported_at', 'failure_code', 'receipt_expires_at')
     ) THEN
    RAISE EXCEPTION '0217: account deletion ops table/trigger postcondition failed';
  END IF;

  FOREACH v_fn IN ARRAY ARRAY[
    'public.account_deletion_ops_settle_live_owner(uuid)',
    'public.account_deletion_ops_release_failed_fence(uuid)',
    'public.begin_account_deletion_op(uuid,uuid,bigint,text)',
    'public.start_account_deletion_op(uuid,uuid,text)',
    'public.start_legacy_account_deletion_op(uuid)',
    'public.fail_account_deletion_op(uuid,uuid,text)',
    'public.record_account_deletion_op_sweeps(uuid,jsonb)',
    'public.get_account_deletion_op(uuid,text)',
    'public.consume_account_deletion_receipt_lookup(text)',
    'public.complete_account_deletion_ops()',
    'public.purge_account_deletion_ops()'
  ] LOOP
    IF NOT (
         SELECT p.prosecdef
                AND COALESCE(p.proconfig @> ARRAY['search_path=""']::text[], false)
           FROM pg_catalog.pg_proc AS p
          WHERE p.oid = v_fn::regprocedure
       )
       OR pg_catalog.has_function_privilege('public', v_fn, 'EXECUTE')
       OR pg_catalog.has_function_privilege('anon', v_fn, 'EXECUTE')
       OR pg_catalog.has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION '0217: % must be a search_path-pinned definer closed to client roles', v_fn;
    END IF;
  END LOOP;

  FOREACH v_fn IN ARRAY ARRAY[
    'public.account_deletion_ops_settle_live_owner(uuid)',
    'public.account_deletion_ops_release_failed_fence(uuid)',
    'public.complete_account_deletion_ops()'
  ] LOOP
    IF pg_catalog.has_function_privilege('service_role', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION '0217: % is internal and must stay closed to service_role', v_fn;
    END IF;
  END LOOP;

  FOREACH v_fn IN ARRAY ARRAY[
    'public.begin_account_deletion_op(uuid,uuid,bigint,text)',
    'public.start_account_deletion_op(uuid,uuid,text)',
    'public.start_legacy_account_deletion_op(uuid)',
    'public.fail_account_deletion_op(uuid,uuid,text)',
    'public.record_account_deletion_op_sweeps(uuid,jsonb)',
    'public.get_account_deletion_op(uuid,text)',
    'public.consume_account_deletion_receipt_lookup(text)',
    'public.purge_account_deletion_ops()'
  ] LOOP
    IF NOT pg_catalog.has_function_privilege('service_role', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION '0217: service_role must be able to call %', v_fn;
    END IF;
  END LOOP;

  IF pg_catalog.has_table_privilege('anon', 'public.account_deletion_ops', 'SELECT,INSERT,UPDATE,DELETE')
     OR pg_catalog.has_table_privilege('authenticated', 'public.account_deletion_ops', 'SELECT,INSERT,UPDATE,DELETE')
     OR pg_catalog.has_table_privilege('service_role', 'public.account_deletion_ops', 'SELECT,INSERT,UPDATE,DELETE')
     OR pg_catalog.has_table_privilege('anon', 'public.account_deletion_receipt_lookup_limits', 'SELECT,INSERT,UPDATE,DELETE')
     OR pg_catalog.has_table_privilege('authenticated', 'public.account_deletion_receipt_lookup_limits', 'SELECT,INSERT,UPDATE,DELETE')
     OR pg_catalog.has_table_privilege('service_role', 'public.account_deletion_receipt_lookup_limits', 'SELECT,INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION '0217: account deletion ops table grant postcondition failed';
  END IF;
END;
$account_deletion_ops_check$;
