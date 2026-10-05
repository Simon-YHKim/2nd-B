-- 0217_account_deletion_receipts.sql
--
-- 계정 삭제 영수증을 서버에 남긴다 (Simon 결정 Q-261004-42 = A, DECISIONS.md 26.10.05 19:53).
--
-- 왜. 지금까지 삭제 영수증은 앱 화면이 메모리에 들고 다음 화면까지 건네줬다
-- (src/lib/account/deletion-completion.ts 의 알림 저장소). 그 인계를 지키려는 수정이
-- 다섯 회차 동안 수렴하지 않았고, 마지막에는 계정 전환 때 A 의 영수증이 B 의 로그인
-- 화면에 보이는 경로를 만들었다(PR #2054 게이트 DEL-N1-01 · DEL-N2-01). 결정은 "앱 화면이
-- 영수증 전달을 책임지지 않게" 다. 그래서 영수증을 서버가 기록하고, 앱은 그 번호만 받는다.
--
-- 무엇을 남기나. 영수증 번호(무작위 uuid) · 삭제 시각(초 단위) · 보관 만료 시각 ·
-- 서버가 관측한 정리 결과(참/거짓/무응답 플래그 여섯 개). **계정을 가리키는 값은 없다** -
-- user_id · 세션 · 이메일 · 해시 모두 넣지 않는다. 해시도 넣지 않은 이유: uuid 를 아는
-- 사람(0192 의 account_deletion_tombstones 가 user_id 를 그대로 보존한다)은 해시를 다시
-- 계산해 이을 수 있으므로 해시는 "되돌릴 수 없는 식별자" 가 아니라 가명이다. 영수증이
-- 사용자에게 주는 쓸모(내 삭제가 끝났는지 확인)에 계정 식별자는 필요 없다.
--
-- 소유자 열이 없으므로 삭제 등록부(db/erasure-registry.json, check:erasure-registry)의
-- 범위 밖이다. 등록부 G1 은 "소유자 열을 가진 public 표" 만 다룬다. 이 표에 user_id ·
-- owner_id 같은 열을 더하는 순간 G1 이 이 표를 요구하고, 그때는 등록부 행과 forward
-- 마이그레이션이 함께 필요하다 - 그래서 소유자 열을 더하지 말 것.
--
-- 어떻게 원자적으로 남기나. delete-account Edge 가 Auth 삭제 직전에 영수증 번호를 0192 의
-- 삭제 표식(account_deletion_tombstones.pending_receipt_ids)에 걸어 둔다. Auth 삭제가
-- public.users 로 연쇄되는 바로 그 트랜잭션 안에서 BEFORE DELETE 트리거가 그 번호들로
-- 영수증 행을 만들고, 표식의 번호를 비운다. 그래서 영수증은 "프로필 행이 실제로 지워진
-- 트랜잭션이 커밋됐다" 와 정확히 같은 사실이다 - Edge 가 Auth 삭제 뒤에 죽어도 영수증은
-- 남고, Auth 삭제가 롤백되면 영수증도 같이 없다.
--
-- 번호는 요청마다 하나씩, 덮어쓰지 않고 쌓는다(최근 8개, 게이트 D2A-02). 두 기기가 같은
-- 계정을 동시에 지우거나, 답을 잃은 요청 뒤에 다시 요청하면 표식에 번호가 둘 이상 걸린다.
-- 한 칸을 덮어쓰면 먼저 건 요청의 번호는 영영 영수증이 되지 못해 그 기기가 결과를
-- 찾을 길이 없었다. 이제 삭제가 커밋될 때 걸려 있던 번호 하나하나가 같은 삭제의 영수증이 된다.
--
-- 요청한 번호가 이미 영수증이거나 다른 계정의 표식에 걸려 있으면 조용히 다른 번호로 바꾸지
-- 않고 거절한다(account_deletion_receipt_id_taken, 게이트 D2A-01). 바꿔 주면 서버가 쓴 번호와
-- 앱이 나중에 조회하는 번호가 달라져, 앱이 남의 영수증을 자기 삭제의 증거로 읽을 수 있었다.
-- Edge 는 이 거절을 받으면 Auth 를 지우기 전에 멈춘다.
--
-- 번호를 거는 함수는 프로필 행을 먼저 잠근다(begin_account_deletion 과 같은 순서, 게이트
-- D2A-R2-04). 다른 요청의 삭제 트랜잭션이 그 행을 지우는 중이면 끝날 때까지 기다리고, 이미
-- 지워졌으면 아무것도 걸지 않는다 - 삭제 뒤 보존되는 표식에 번호를 다시 쓰지 않는다.
--
-- 트리거는 번호를 먼저 비우고, 비우기가 성공했을 때만 영수증을 만든다(게이트 DEL2-R1-07).
-- 둘을 한 EXCEPTION 블록에 두면 발급이 실패할 때 비우기까지 롤백돼, 보존되는 표식에
-- user_id 와 번호가 함께 남았다. 이제 "영수증이 있으면 표식의 번호는 비어 있다" 가 늘 참이다
-- - 비우기가 실패하면 영수증을 만들지 않는다(연결이 남는 영수증보다 영수증 없음이 낫다).
--
-- 트리거는 영수증을 못 만들어도 계정 삭제를 막지 않는다(EXCEPTION 으로 삼키고 WARNING).
-- 삭제권이 영수증보다 우선이다. 그 경우 Edge 는 영수증 번호 없이 deleted:true 를 돌려준다.
--
-- 앱이 영수증을 다시 보는 길. 이 파일의 get_account_deletion_receipt 는 service_role 전용이고
-- (scripts/check-definer-grants.ts 규칙 A: anon 에게 함수를 열지 않는다), 로그인 없이 보는
-- 길은 account-deletion-receipt Edge 함수가 번호로 이 RPC 를 대신 부른다.
--
-- 보관. 365일 뒤 만료된다. 만료된 행은 조회에서 즉시 빠지고, pg_cron 이 있으면 매일
-- 지운다(0067 과 같은 모양 - CI 의 순정 PostgreSQL 에는 pg_cron 이 없어 NOTICE 로 건너뛴다).
-- pg_cron 이 설치돼 있으면 적용 끝에 그 작업이 실제로 있는지 확인한다. 호스팅된 Supabase
-- (supabase_admin 역할이 있는 곳)에서 pg_cron 을 쓸 수 없으면 적용 자체를 실패시킨다 -
-- 운영에서는 매일 정리가 선택이 아니라 사후조건이다(게이트 DEL2-R1-09 · D2A-R2-02).
-- pg_cron 이 없는 곳(CI · 로컬 재생)을 위해 두 번째 정리 길도 둔다: 번호를 걸 때마다(attach)
-- 만료 행을 조금씩 지운다(0180 과 같은 모양). 법무 문서의 "1년 뒤 자동으로 지운다" 는 운영의
-- 매일 작업이 받친다.
--
-- 의존. 0192(account_deletion_tombstones · begin_account_deletion)가 먼저 있어야 한다.
-- 운영 적용 순서: 0192 -> 0217 -> delete-account 배포 -> account-deletion-receipt 배포 ->
-- 웹 게시. ⚠ 운영 적용과 배포는 Simon GO 뒤에만 한다.
--
-- 최상위 BEGIN/COMMIT 을 두지 않는다. Supabase CLI 가 이 파일을 자기 트랜잭션으로 감싼다.

SET LOCAL lock_timeout = '10s';

DO $require_0192$
BEGIN
  IF pg_catalog.to_regclass('public.account_deletion_tombstones') IS NULL
     OR pg_catalog.to_regprocedure('public.begin_account_deletion(uuid,uuid,timestamptz)') IS NULL THEN
    RAISE EXCEPTION '0217 requires 0192 (account_deletion_tombstones, begin_account_deletion)';
  END IF;
END;
$require_0192$;

----------------------------------------------------------------------
-- 영수증 표. 계정 식별자 없음. 클라이언트 역할은 아무 권한도 없다.
----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.account_deletion_receipts (
  id uuid PRIMARY KEY,
  erased_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  sweeps jsonb NOT NULL DEFAULT '{}'::jsonb,
  sweeps_reported_at timestamptz,
  CONSTRAINT account_deletion_receipts_expiry_after_erasure CHECK (expires_at > erased_at),
  CONSTRAINT account_deletion_receipts_sweeps_object CHECK (pg_catalog.jsonb_typeof(sweeps) = 'object')
);

ALTER TABLE public.account_deletion_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_deletion_receipts FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.account_deletion_receipts
  FROM PUBLIC, anon, authenticated, service_role;

CREATE INDEX IF NOT EXISTS account_deletion_receipts_expires_at_idx
  ON public.account_deletion_receipts (expires_at);

COMMENT ON TABLE public.account_deletion_receipts IS
  '계정 삭제 영수증 (0217). 계정 식별자 없음: 번호 · 삭제 시각 · 만료 · 서버가 관측한 정리 플래그만. 프로필 행 삭제 트랜잭션 안에서 트리거가 만든다. 365일 보관.';

----------------------------------------------------------------------
-- 삭제 표식에 걸어 두는 영수증 번호들. 요청마다 하나씩 쌓이고(최근 8개) 트리거가 비운다.
----------------------------------------------------------------------

ALTER TABLE public.account_deletion_tombstones
  ADD COLUMN IF NOT EXISTS pending_receipt_ids uuid[];

-- 다른 계정의 표식에 이미 걸린 번호인지 찾는 색인. 트리거가 비우면(NULL) 색인에서도 빠진다.
CREATE INDEX IF NOT EXISTS account_deletion_tombstones_pending_receipts_idx
  ON public.account_deletion_tombstones USING gin (pending_receipt_ids)
  WHERE pending_receipt_ids IS NOT NULL;

COMMENT ON COLUMN public.account_deletion_tombstones.pending_receipt_ids IS
  '0217: delete-account 가 Auth 삭제 직전에 거는 영수증 번호들(요청마다 하나, 최근 8개). public.users 삭제 트리거가 번호마다 영수증을 만들고 이 칸을 비운다.';

----------------------------------------------------------------------
-- 1. Auth 삭제 직전에 영수증 번호를 건다 (service_role 전용).
--    프로필 행을 먼저 잠근다. 이미 지워졌거나 표식 행이 없으면 NULL.
--    요청 번호가 이미 영수증으로 쓰였거나 다른 계정의 표식에 걸려 있으면 바꿔 주지 않고
--    account_deletion_receipt_id_taken (SQLSTATE X0217) 으로 거절한다 (Edge 가 Auth 삭제 전에 멈춘다).
----------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.attach_account_deletion_receipt(
  p_user_id uuid,
  p_receipt_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_claims jsonb := nullif(
    pg_catalog.current_setting('request.jwt.claims', true),
    ''
  )::jsonb;
  v_role text := COALESCE(
    nullif(pg_catalog.current_setting('request.jwt.claim.role', true), ''),
    v_claims ->> 'role'
  );
  v_receipt uuid := COALESCE(p_receipt_id, pg_catalog.gen_random_uuid());
  v_locked_user uuid;
BEGIN
  IF v_role IS DISTINCT FROM 'service_role' OR p_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- pg_cron 이 없는 곳의 두 번째 정리 길. 실패해도 번호 걸기는 계속된다.
  BEGIN
    DELETE FROM public.account_deletion_receipts AS r
     WHERE r.id IN (
       SELECT e.id
         FROM public.account_deletion_receipts AS e
        WHERE e.expires_at <= pg_catalog.now()
        ORDER BY e.expires_at
        LIMIT 100
        FOR UPDATE SKIP LOCKED
     );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'account_deletion_receipt_prune_skipped';
  END;

  -- 프로필 행을 begin_account_deletion 과 같은 순서로 잠근다 (게이트 D2A-R2-04).
  -- 다른 요청의 삭제가 이 행을 지우는 중이면 그 커밋까지 기다리고, 지워졌으면 행이 없다.
  -- 그때 번호를 걸면 삭제 뒤 보존되는 표식에 user_id 와 번호가 다시 이어진다.
  SELECT u.id
    INTO v_locked_user
    FROM public.users AS u
   WHERE u.id = p_user_id
     FOR UPDATE;

  IF v_locked_user IS NULL THEN
    RETURN NULL;
  END IF;

  -- 남의 영수증이거나 다른 계정에 걸린 번호는 바꿔 주지 않고 거절한다 (게이트 D2A-01).
  IF EXISTS (
       SELECT 1 FROM public.account_deletion_receipts AS r WHERE r.id = v_receipt
     )
     OR EXISTS (
       SELECT 1
       FROM public.account_deletion_tombstones AS t
       WHERE t.pending_receipt_ids @> ARRAY[v_receipt]
         AND t.user_id <> p_user_id
     ) THEN
    RAISE EXCEPTION 'account_deletion_receipt_id_taken' USING ERRCODE = 'X0217';
  END IF;

  -- 덮어쓰지 않고 쌓는다 (게이트 D2A-02). 같은 번호는 한 번만, 최근 8개만 남긴다.
  UPDATE public.account_deletion_tombstones AS t
     SET pending_receipt_ids = CASE
           WHEN v_receipt = ANY (COALESCE(t.pending_receipt_ids, '{}'::uuid[]))
             THEN t.pending_receipt_ids
           ELSE (COALESCE(t.pending_receipt_ids, '{}'::uuid[]) || v_receipt)[
                  GREATEST(1, pg_catalog.cardinality(COALESCE(t.pending_receipt_ids, '{}'::uuid[])) - 6):]
         END
   WHERE t.user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN v_receipt;
END;
$$;

REVOKE ALL ON FUNCTION public.attach_account_deletion_receipt(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.attach_account_deletion_receipt(uuid, uuid)
  TO service_role;

----------------------------------------------------------------------
-- 2. 프로필 행이 지워지는 트랜잭션 안에서 영수증을 만든다 (트리거 전용).
--    번호들을 먼저 비우고, 비우기가 성공했을 때만 번호마다 발급한다. 실패해도 삭제를 막지 않는다.
----------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.issue_account_deletion_receipt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_receipts uuid[];
  v_erased_at timestamptz;
BEGIN
  -- (1) 번호들을 읽고 비운다. 이 블록이 실패하면 번호가 표식에 남을 수 있으므로
  --     영수증을 만들지 않는다 (PL/pgSQL 변수는 롤백되지 않아 직접 NULL 로 되돌린다).
  BEGIN
    SELECT t.pending_receipt_ids
      INTO v_receipts
      FROM public.account_deletion_tombstones AS t
     WHERE t.user_id = OLD.id
       FOR UPDATE;

    IF v_receipts IS NOT NULL THEN
      UPDATE public.account_deletion_tombstones AS t
         SET pending_receipt_ids = NULL
       WHERE t.user_id = OLD.id;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_receipts := NULL;
    RAISE WARNING 'account_deletion_receipt_not_cleared';
  END;

  -- (2) 비우기가 끝난 번호로만 영수증을 만든다. 걸려 있던 요청마다 하나씩, 같은 삭제
  --     시각으로 (게이트 D2A-02). 실패해도 번호는 이미 비어 있다.
  IF v_receipts IS NOT NULL THEN
    BEGIN
      v_erased_at := pg_catalog.date_trunc('second', pg_catalog.clock_timestamp());
      INSERT INTO public.account_deletion_receipts (id, erased_at, expires_at)
      SELECT DISTINCT pending.id, v_erased_at, v_erased_at + interval '365 days'
        FROM pg_catalog.unnest(v_receipts) AS pending(id)
       WHERE pending.id IS NOT NULL
      ON CONFLICT (id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      -- 삭제권이 영수증보다 우선이다. 영수증을 못 만들어도 계정 삭제는 계속된다.
      RAISE WARNING 'account_deletion_receipt_not_issued';
    END;
  END IF;
  RETURN OLD;
END;
$$;

-- 트리거 함수다. 누가 직접 부를 일이 없다 (0202 와 같은 이유로 넷 다 걷는다).
REVOKE ALL ON FUNCTION public.issue_account_deletion_receipt()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_users_issue_account_deletion_receipt ON public.users;
CREATE TRIGGER trg_users_issue_account_deletion_receipt
  BEFORE DELETE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.issue_account_deletion_receipt();

----------------------------------------------------------------------
-- 3. Auth 삭제 뒤 Edge 가 관측한 정리 결과를 한 번만 적는다 (service_role 전용).
--    허용 키 여섯 개 · 값은 참/거짓/null 만. 영수증이 실제로 있으면 true.
----------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_account_deletion_receipt_sweeps(
  p_receipt_id uuid,
  p_sweeps jsonb
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_claims jsonb := nullif(
    pg_catalog.current_setting('request.jwt.claims', true),
    ''
  )::jsonb;
  v_role text := COALESCE(
    nullif(pg_catalog.current_setting('request.jwt.claim.role', true), ''),
    v_claims ->> 'role'
  );
BEGIN
  IF v_role IS DISTINCT FROM 'service_role'
     OR p_receipt_id IS NULL
     OR p_sweeps IS NULL
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

  UPDATE public.account_deletion_receipts AS r
     SET sweeps = p_sweeps,
         sweeps_reported_at = pg_catalog.date_trunc('second', pg_catalog.clock_timestamp())
   WHERE r.id = p_receipt_id
     AND r.sweeps_reported_at IS NULL
     AND r.expires_at > pg_catalog.now();

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.record_account_deletion_receipt_sweeps(uuid, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_account_deletion_receipt_sweeps(uuid, jsonb)
  TO service_role;

----------------------------------------------------------------------
-- 4. 번호로 영수증을 읽는다 (service_role 전용 - account-deletion-receipt Edge 가 부른다).
--    만료됐거나 없으면 NULL. 계정 식별자는 애초에 없으므로 돌려줄 수도 없다.
----------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_account_deletion_receipt(
  p_receipt_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_claims jsonb := nullif(
    pg_catalog.current_setting('request.jwt.claims', true),
    ''
  )::jsonb;
  v_role text := COALESCE(
    nullif(pg_catalog.current_setting('request.jwt.claim.role', true), ''),
    v_claims ->> 'role'
  );
  v_receipt jsonb;
BEGIN
  IF v_role IS DISTINCT FROM 'service_role' OR p_receipt_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT pg_catalog.jsonb_build_object(
           'id', r.id,
           'erased_at', r.erased_at,
           'expires_at', r.expires_at,
           'sweeps', r.sweeps,
           'sweeps_reported', r.sweeps_reported_at IS NOT NULL
         )
    INTO v_receipt
    FROM public.account_deletion_receipts AS r
   WHERE r.id = p_receipt_id
     AND r.expires_at > pg_catalog.now();

  RETURN v_receipt;
END;
$$;

REVOKE ALL ON FUNCTION public.get_account_deletion_receipt(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_account_deletion_receipt(uuid)
  TO service_role;

----------------------------------------------------------------------
-- 5. 만료된 영수증을 지운다 (service_role 전용 · pg_cron 이 매일 부른다).
----------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.purge_expired_account_deletion_receipts()
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.account_deletion_receipts AS r
   WHERE r.expires_at <= pg_catalog.now();
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_expired_account_deletion_receipts()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.purge_expired_account_deletion_receipts()
  TO service_role;

DO $schedule_receipt_purge$
DECLARE
  j record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_available_extensions WHERE name = 'pg_cron') THEN
    -- 호스팅된 Supabase 에서는 매일 정리가 사후조건이다 (게이트 DEL2-R1-09 · D2A-R2-02).
    -- 법무 문서의 "1년 뒤 자동으로 지운다" 를 attach 때의 기회적 정리에 맡기지 않는다.
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'supabase_admin') THEN
      RAISE EXCEPTION '0217: pg_cron is required on a hosted Supabase project for the yearly receipt purge';
    END IF;
    RAISE NOTICE '0217: pg_cron not available (CI dry-run); skipping receipt purge schedule';
    RETURN;
  END IF;

  EXECUTE 'CREATE EXTENSION IF NOT EXISTS pg_cron';

  FOR j IN SELECT jobid FROM cron.job WHERE jobname = 'purge-expired-account-deletion-receipts' LOOP
    PERFORM cron.unschedule(j.jobid);
  END LOOP;

  PERFORM cron.schedule(
    'purge-expired-account-deletion-receipts',
    '7 4 * * *',
    'SELECT public.purge_expired_account_deletion_receipts();'
  );
END;
$schedule_receipt_purge$;

----------------------------------------------------------------------
-- 끝 상태를 적용 시점에 확인한다 (0202 와 같은 모양).
----------------------------------------------------------------------

DO $account_deletion_receipts_check$
DECLARE
  v_fn text;
  v_jobs bigint;
BEGIN
  -- pg_cron 이 설치된 곳에서는 매일 정리 작업이 정확히 하나 있어야 한다 (게이트 DEL2-R1-09).
  -- 동적 SQL 이라 cron 스키마가 없는 순정 PostgreSQL 에서도 이 블록이 해석된다.
  IF pg_catalog.to_regclass('cron.job') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM cron.job WHERE jobname = $1 AND command = $2'
      INTO v_jobs
      USING 'purge-expired-account-deletion-receipts',
            'SELECT public.purge_expired_account_deletion_receipts();';
    IF v_jobs IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION '0217: receipt purge cron job missing (found %)', v_jobs;
    END IF;
  END IF;

  IF NOT EXISTS (
       SELECT 1
         FROM pg_catalog.pg_trigger AS t
        WHERE t.tgrelid = 'public.users'::regclass
          AND t.tgname = 'trg_users_issue_account_deletion_receipt'
          AND t.tgenabled = 'O'
          AND t.tgfoid = 'public.issue_account_deletion_receipt()'::regprocedure
     )
     OR NOT (
       SELECT c.relrowsecurity AND c.relforcerowsecurity
         FROM pg_catalog.pg_class AS c
        WHERE c.oid = 'public.account_deletion_receipts'::regclass
     )
     OR EXISTS (
       SELECT 1
         FROM pg_catalog.pg_attribute AS a
        WHERE a.attrelid = 'public.account_deletion_receipts'::regclass
          AND a.attnum > 0
          AND NOT a.attisdropped
          AND a.attname NOT IN ('id', 'erased_at', 'expires_at', 'sweeps', 'sweeps_reported_at')
     ) THEN
    RAISE EXCEPTION '0217: account deletion receipt table/trigger postcondition failed';
  END IF;

  FOREACH v_fn IN ARRAY ARRAY[
    'public.attach_account_deletion_receipt(uuid,uuid)',
    'public.issue_account_deletion_receipt()',
    'public.record_account_deletion_receipt_sweeps(uuid,jsonb)',
    'public.get_account_deletion_receipt(uuid)',
    'public.purge_expired_account_deletion_receipts()'
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

  IF pg_catalog.has_function_privilege('service_role', 'public.issue_account_deletion_receipt()', 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('service_role', 'public.attach_account_deletion_receipt(uuid,uuid)', 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('service_role', 'public.record_account_deletion_receipt_sweeps(uuid,jsonb)', 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('service_role', 'public.get_account_deletion_receipt(uuid)', 'EXECUTE')
     OR pg_catalog.has_table_privilege('anon', 'public.account_deletion_receipts', 'SELECT')
     OR pg_catalog.has_table_privilege('authenticated', 'public.account_deletion_receipts', 'SELECT')
     OR pg_catalog.has_table_privilege('service_role', 'public.account_deletion_receipts', 'SELECT') THEN
    RAISE EXCEPTION '0217: account deletion receipt grant postcondition failed';
  END IF;
END;
$account_deletion_receipts_check$;
