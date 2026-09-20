-- rollback/0189_down.sql
--
-- NOT part of the numbered apply sequence. The dry-run and the prod apply both
-- iterate `db/migrations/*.sql`, a non-recursive glob, so this file in a
-- subdirectory is never picked up. Run it BY HAND and only deliberately.
--
-- ─────────────────────── 되돌리면 무엇이 되살아나는가 ───────────────────────
--
-- 0189 는 기능을 켜지 않았다. 표 하나와 함수 하나를 놓았을 뿐이고, 이 커밋 시점에
-- **클라이언트는 erase_my_data 를 부르지 않는다.** 그래서 지금 되돌리는 것은
-- 사용자에게 보이는 동작을 바꾸지 않는다. 안전한 쪽이다.
--
-- ⚠ 그러나 그 전제는 시간이 지나면 깨진다. `src/lib/records/delete-bulk.ts` 가
--   `erase_my_data` 를 부르도록 전환된 뒤에 이 파일을 돌리면, **전체 삭제가
--   함수 없음으로 실패한다.** 사용자는 "데이터를 지웠다" 는 확인을 받지 못하고,
--   더 나쁘게는 호출부가 실패를 삼키도록 짜여 있으면 아무것도 안 지운 삭제가
--   성공으로 보인다 - 그게 이 작업이 애초에 고치려던 F1 그 자체다.
--
--   그러므로 순서를 지킨다:
--     1) 먼저 클라이언트를 손 목록 방식으로 되돌리고 배포한다.
--     2) 그 배포가 사용자에게 도달한 것을 확인한다.
--     3) 그다음에 이 파일을 돌린다.
--   반대로 하면 그 사이에 삭제를 시도한 사용자가 조용히 실패한다.
--
-- 되돌려도 **사용자 데이터는 복원되지 않는다.** erase_my_data 가 이미 지운 행은
-- 그대로 사라진 상태다. 이 파일은 삭제 경로를 걷어낼 뿐 되살리지 않는다.
--
-- 그리고 되살아나는 결함이 하나 있다: 등록부가 사라지면 "어느 표가 사용자
-- 소유인가" 를 DB 가 더는 들고 있지 않다. 정적 가드
-- (scripts/check-erasure-registry.ts + db/erasure-registry.json)는 저장소에
-- 남으므로 분류 자체는 살아 있지만, 적용 시점에 카탈로그와 대조하던 DO 블록은
-- 없어진다. 즉 F4(새 표가 분류되지 않은 채 들어오는 것)를 막는 그물 두 겹 중
-- 하나가 풀린다.
--
-- ─────────────────────── 한 트랜잭션인 이유 ───────────────────────
--
-- 이 파일은 원래 세 문장을 autocommit 으로 돌렸다. 중간에 잠금·권한·타임아웃
-- 오류가 나면 **함수만 사라지고 등록부 표는 남는 반쪽 상태**가 됐다 (r39 생성물
-- 게이트 발견 3). 전환 뒤라면 그 반쪽 상태가 곧 전체 삭제 중단이다.
--
-- 그래서 BEGIN/COMMIT 으로 묶는다. 이웃 파일들과 같은 모양이다 -
-- 0135_down(35/138) · 0136_down(36/370) · 0137_down(30/48) 이 전부 이렇게 하고,
-- 셋 다 lock_timeout 을 함께 건다.
--
-- ⚠ 0189 본체에는 "최상위 BEGIN/COMMIT 금지" 가 적혀 있다. 그 금지는 여기에
--   적용되지 않고, 적용될 수도 없다. 근거 둘:
--     (a) 이유가 다르다. 금지의 이유는 "Supabase CLI 가 마이그레이션을 자기
--         트랜잭션으로 감싸므로 또 열면 중첩된다" 이다. 이 파일은 CLI 가 돌리지
--         않는다. 손으로 psql 에 먹이므로 감싸 줄 사람이 없고, 감싸지 않으면
--         위의 반쪽 상태가 그대로 남는다. 금지의 목적은 "한 번만 감싸라" 이지
--         "감싸지 마라" 가 아니다.
--     (b) 검사가 여기를 볼 수 없다. supabase-dry-run.yml:161 의
--         `for f in db/migrations/*.sql` 은 하위 디렉터리로 내려가지 않는
--         glob 이고, :179 의 금지 검사는 그 배열만 돈다. 그래서 0135·0136·0137
--         이 BEGIN 을 달고도 CI 가 초록이다.
--
-- ─────────────────────── 마이그레이션 이력 ───────────────────────
--
-- DDL 만 되돌리면 `supabase_migrations.schema_migrations` 에는 0189 가 적용된
-- 것으로 남는다. Supabase CLI 는 이미 적용된 version 을 다음 `db push` 에서
-- 건너뛰므로, **rollback 뒤 정상 배포가 기능을 자동으로 되돌려 놓지 못한다.**
-- 그 상태는 사고 대응 중에 제일 나쁜 종류다: 고쳤다고 믿는데 아무 일도 안 난다.
--
-- ⚠ 이건 이 저장소의 다른 _down.sql 들이 하지 않는 일이다 (0135·0136·0137·0141
--   전부 이력에 손대지 않는다). 그 관행이 곧 위 결함이므로 여기서는 따르지 않고,
--   대신 조건부로 처리하고 무엇을 지웠는지 NOTICE 로 남긴다.
--
-- ⚠ version 이 아니라 **name 으로 지운다.** 네 자리 0189 는 CI 스크래치 규약이고
--   (supabase-dry-run.yml:187-190) 운영 번들은 단조 증가 timestamp version 을
--   따로 받는다. 파일 이름의 첫 밑줄 뒤 - 즉 `erasure_registry` - 는 번호를
--   갈아도 그대로다. CLI 가 ledger 의 name 칸에 넣는 값이 바로 그것이다.
--
-- 이력을 지우면 같은 마이그레이션이 다음 push 에서 **다시 적용된다.** 그게
-- 의도다. 다시 적용되면 안 되는 상황(전환을 아예 접은 경우)이라면 이 파일을
-- 돌리기 전에 저장소에서 마이그레이션 파일 자체를 빼야 한다. 이력만 남겨
-- 재적용을 막는 방법은 쓰지 않는다 - DB 상태와 이력이 어긋난 채로 굳는다.

BEGIN;

-- 잠금을 무한정 기다리다 사고 대응을 붙잡지 않는다. 걸리면 실패하고, 실패하면
-- 이 트랜잭션이 통째로 롤백되므로 반쪽 상태가 남지 않는다.
SET LOCAL lock_timeout = '10s';

DROP FUNCTION IF EXISTS public.erase_my_data(text);

-- 표를 지우기 전에 잠시 멈춘다. 이 표에는 사용자 데이터가 없고 전부
-- db/erasure-registry.json 에서 다시 만들 수 있으므로 데이터 손실은 없다.
-- 그 사실을 확인하고 지운다 - 0135/0136 의 데이터 가드와 같은 자리지만,
-- 여기서는 지킬 데이터가 없다는 것이 확인 대상이다.
DO $rollback_guard$
DECLARE
  v_rows bigint;
BEGIN
  IF to_regclass('public.erasure_registry') IS NULL THEN
    RAISE NOTICE '0189 rollback: public.erasure_registry 가 이미 없다 - 건너뛴다';
    RETURN;
  END IF;

  SELECT pg_catalog.count(*) INTO v_rows FROM public.erasure_registry;
  RAISE NOTICE '0189 rollback: 등록부 % 행을 버린다 (원본은 db/erasure-registry.json 에 남는다)', v_rows;
END;
$rollback_guard$;

DROP TABLE IF EXISTS public.erasure_registry;

-- 이력 정리. 여기까지 왔으면 DB 에는 0189 의 흔적이 없다. ledger 에만 남아
-- 있으면 다음 db push 가 이 마이그레이션을 건너뛴다.
DO $rollback_ledger$
DECLARE
  v_versions text;
  v_removed  bigint;
BEGIN
  IF to_regclass('supabase_migrations.schema_migrations') IS NULL THEN
    RAISE NOTICE '0189 rollback: supabase_migrations.schema_migrations 가 없다 (CLI 가 적용하지 않은 DB) - 이력 정리 없음';
    RETURN;
  END IF;

  SELECT pg_catalog.string_agg(m.version, ', ' ORDER BY m.version)
    INTO v_versions
  FROM supabase_migrations.schema_migrations AS m
  WHERE m.name = 'erasure_registry';

  IF v_versions IS NULL THEN
    RAISE NOTICE '0189 rollback: ledger 에 erasure_registry 행이 없다 - 정리할 이력 없음';
    RETURN;
  END IF;

  DELETE FROM supabase_migrations.schema_migrations AS m
  WHERE m.name = 'erasure_registry';
  GET DIAGNOSTICS v_removed = ROW_COUNT;

  RAISE NOTICE '0189 rollback: ledger 에서 erasure_registry % 행을 지웠다 (version %). 다음 db push 가 이 마이그레이션을 다시 적용한다.',
    v_removed, v_versions;
END;
$rollback_ledger$;

COMMIT;

-- 돌린 뒤 확인할 것 (셋 다 손으로):
--   1) SELECT to_regprocedure('public.erase_my_data(text)');            -> NULL
--   2) SELECT to_regclass('public.erasure_registry');                   -> NULL
--   3) SELECT version, name FROM supabase_migrations.schema_migrations
--        WHERE name = 'erasure_registry';                               -> 0 행
-- 셋 중 하나라도 어긋나면 COMMIT 이 나지 않은 것이다. 트랜잭션이라 중간 상태는
-- 없으므로, 오류 메시지를 보고 같은 파일을 다시 돌리면 된다.
