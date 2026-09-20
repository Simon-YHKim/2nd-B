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
