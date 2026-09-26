-- rollback/0189_down.sql
--
-- NOT part of the numbered apply sequence. The dry-run and the prod apply both
-- iterate `db/migrations/*.sql`, a non-recursive glob, so this file in a
-- subdirectory is never picked up. Run it BY HAND and only deliberately.
--
-- One place does run it, by explicit path and never against the job's own
-- database: supabase-dry-run.yml, "Exercise the 0189 rollback round trip", feeds
-- it to psql on a throwaway CLONE and then pushes again, to prove that a
-- rollback followed by a push brings erase_my_data back LOCKED. So a change here
-- is exercised by CI. See "두 행은 한 벌이다" below for what that step caught.
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
--     (b) 검사가 여기를 볼 수 없다. supabase-dry-run.yml 의 "Apply staged
--         migrations" 단계가 도는 `for f in db/migrations/*.sql` 은 하위
--         디렉터리로 내려가지 않는 glob 이고, 같은 단계의 금지 검사
--         (transaction_re)는 그 배열만 돈다. 그래서 0135·0136·0137 이 BEGIN 을
--         달고도 CI 가 초록이다. (줄 번호로 적지 않는다: 161 · 179 라고 적혀
--         있었는데 r49 가 그 위에 바닥 44줄을 넣으면서 둘 다 틀린 줄이 됐다.)
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
--   (supabase-dry-run.yml, "Four-digit 0147+ versions are a CI-scratch convention
--   only") 운영 번들은 단조 증가 timestamp version 을 따로 받는다. 파일 이름의 첫
--   밑줄 뒤 - 즉 `erasure_registry` - 는 번호를 갈아도 그대로다. CLI 가 ledger 의
--   name 칸에 넣는 값이 바로 그것이다.
--   확인한 근거 둘 (2026-09-20): CLI 2.116.0 의 pkg/migration/file.go 가 파일 이름을
--   `^([0-9]+)_(.*)\.sql$` 로 갈라 둘째 묶음을 Name 으로 쓰고, supabase-dry-run.yml 의
--   push 단계가 매번 ledger 의 name 을 `${base#*_}` 에서 `.sql` 을 뗀 값과 대조한다.
--   그래서 0190 의 name 은 `lock_erase_my_data_authenticated` 다.
--
-- 이력을 지우면 같은 마이그레이션이 다음 push 에서 **다시 적용된다.** 그게
-- 의도다. 다시 적용되면 안 되는 상황(전환을 아예 접은 경우)이라면 이 파일을
-- 돌리기 전에 저장소에서 마이그레이션 파일 자체를 빼야 한다. 이력만 남겨
-- 재적용을 막는 방법은 쓰지 않는다 - DB 상태와 이력이 어긋난 채로 굳는다.
--
-- ─────────────────────── 두 행은 한 벌이다 (0189 + 0190) ───────────────────────
--
-- 이 파일은 ledger 에서 **두 행**을 지운다: `erasure_registry`(0189) 와
-- `lock_erase_my_data_authenticated`(0190). 2026-09-20 까지는 자기 행 하나만
-- 지웠고, 그게 구멍이었다 (r49 게이트 둘이 각자 재현했다: B-K01 · B-EX-01).
--
-- 왜 한 벌인가. 0189 는 함수를 만들고 PUBLIC · anon 만 회수한다. Supabase 는
-- public 의 새 함수마다 authenticated 에게 EXECUTE 를 **이름으로** 주므로 0189
-- 만으로는 함수가 열려 있고, 잠금을 완성하는 것은 0190 의 REVOKE 다. 그런데 0190 이
-- 잠근 것은 **그 함수 객체**다. 아래 DROP FUNCTION 이 객체를 지우면 0190 의 효과
-- (ACL · COMMENT)도 함께 사라지고, 다시 만들어진 함수는 플랫폼 기본값
-- (authenticated=X)을 새로 받는다. 그러니 0189 를 되돌린다는 것은 0190 도
-- 되돌린다는 뜻이고, ledger 도 그렇게 말해야 한다. 0190 행만 남으면 "잠금은
-- 적용됨" 이라는 기록이 잠글 대상 없이 남는다.
--
-- 하나만 지우면 무슨 일이 나는가. 실측 2026-09-20 22:26 KST - 임시 PostgreSQL
-- 18.3 · 함수 default privilege 바닥 있음 · **실물 Supabase CLI 2.116.0**
-- (supabase-dry-run.yml 이 고정한 버전. B-K01 은 자기 재현이 CLI 없이 ledger 대로
-- 0189 만 psql 로 다시 적용한 것이라고 한정해 뒀다. 아래는 CLI 로 돌린 것이다):
--   1) 되돌린 뒤 ledger 에는 0190:lock_erase_my_data_authenticated 만 남는다.
--   2) 옵션 없는 `supabase db push` 는 **실패한다** (rc=1): "Found local migration
--      files to be inserted before the last migration on remote database."
--      그리고 CLI 가 스스로 권한다: "Rerun the command with --include-all flag".
--   3) 그 권고대로 `--include-all` 을 붙이면 (이 저장소의 CI 가 쓰는 명령이기도
--      하다) **0189 만** 다시 적용되고 0190 은 적용된 것으로 보고 건너뛴다.
--   4) 끝 상태: proacl {postgres=X,authenticated=X,service_role=X} ·
--      has_function_privilege('authenticated', ...) = true. 그런데 ledger 에는 두
--      행이 다 있어서 **멀쩡해 보인다.** 0190 이 닫은 F-02 가 기록에 흔적 없이
--      되살아난다 - 사고 대응 중에 CLI 의 안내를 그대로 따른 결과로.
-- 두 행을 함께 지우면 2) 의 실패부터 없다. 둘 다 remote 의 마지막 version 뒤에
-- 오는 평범한 pending 이 되어, 옵션 없는 `db push` 가 0189 → 0190 순서로 다시
-- 적용한다 (같은 조건에서 실측).
--
-- 같은 트랜잭션에서 지운다. DROP 과 두 DELETE 사이 어디서 끊겨도 위 1) 의 상태
-- ("함수는 없는데 0190 은 적용됨")가 남지 않아야 하기 때문이다.
--
-- 옛 파일을 이미 돌린 DB 도 이 파일로 고친다 (같은 조건에서 실측). DDL 이 전부
-- IF EXISTS 라 다시 돌려도 되고, 0190 행만 남아 있으면 그 행을 지운다. 이미 3) 까지
-- 가서 함수가 열린 채 되살아난 DB 라면 함수와 두 행을 다 걷어내므로 다음 push 가
-- 잠긴 채로 다시 세운다.
--
-- ⚠ 0190 의 머리말(66-72행)은 이 함정을 "후속으로 남겼다" 고 적고 있다. 이 절이
--   그 후속이다. 0190 은 머지된 마이그레이션이라 그 문장은 고치지 않는다.
--
-- ⚠ 아래 목록은 "0189 가 만든 두 객체에 **기대는** 마이그레이션 전부" 이고 현재는
--   0190 과 0198 이다. 나중에 erase_my_data 를 다시 정의하거나 GRANT 하는 마이그레이션,
--   erasure_registry 에 행을 넣는 마이그레이션이 생기면 그 효과도 아래 DROP 과 함께
--   사라진다. 그 행이 ledger 에 남으면 같은 구멍이 다른 모양으로 난다 (예: 삭제
--   울타리를 넣은 새 함수 본문이 조용히 0189 의 옛 본문으로 돌아간다). 그런
--   마이그레이션은 **같은 PR 에서** 이 파일을 함께 고친다 - 대개는 목록에 name 을
--   더하는 것이지만, 통째로 다시 적용해도 되는 파일인지 먼저 볼 것.
--
--   ───────── 이 목록을 누가 지키는가 (r57, 2026-09-21: 주장을 줄였다) ─────────
--
--   이 문단은 세 번 고쳐 썼고 세 번 다 실제보다 크게 말했다. "CI 가 빨강이다" 한
--   줄이던 때 그 대조는 사실 여섯 개만 읽었고 (r50 B-NEW-01), "두 군데서 빨강이다"
--   로 고친 뒤에는 한쪽이 옳게 한 작성자를 떨어뜨렸고 (r52 B-R52-N01), 그 자리를
--   메운 "이름 옆 주석에 파일 번호와 이유를 적어야 목록에 든다" 는 아무것도 막지
--   못했다 (r55 게이트 둘, 아래). 그래서 이번에는 **실제로 하는 일만** 적는다.
--
--   심판은 하나다: supabase-dry-run.yml "Exercise the 0189 rollback round trip".
--   실제 DB 에서, 이 파일을 돌리고 다시 민 뒤에 두 가지를 본다.
--     충분   두 객체에 매달린 것 (소유자 · ACL · 함수 정의 · 등록부 행 · 열 · 제약 ·
--            인덱스 · 정책 · 트리거 · 소유 시퀀스의 매개변수/ACL/현재 위치 · 규칙 ·
--            통계 객체 · COMMENT · 그 밖에 pg_depend 가 매단 것) 가 되돌리기 전과
--            같은가. 빠뜨린 행이 있으면 여기서 빨강이다. 그 대조가 각 종류를 실제로
--            **보는지** 도 같은 단계가 매번 증명한다 (못 보면 BLIND = 빨강).
--     필요   이 파일이 지운 ledger 행을 **하나씩 되돌려 놓고** 다시 밀어 본다. 그
--            행을 남겨도 전부 복원되면 그 항목은 목록에 있을 이유를 이 DB 가 보여
--            주지 못하는 것이고, 그래도 사고 대응 중에 한 번 더 적용된다: 빨강.
--   둘 다 **그 단계의 owned_state 가 읽는 범위 안에서만** 참이다. 읽지 않는 것은 그
--   단계 머리말의 "NOT COLLECTED" 에 적혀 있다.
--
--   ⚠ 이름 옆의 `-- <파일 번호>: <무엇을 매다는가>` 는 **설명이지 증거가 아니다.**
--     이 파일을 손으로 돌리는 사람이 "들어 본 적 없는 행이 왜 지워지나" 를 알도록
--     적는 관례이고, 아무 검사도 읽지 않는다. 읽던 때가 있었다: 파일 번호가 맞고
--     공백을 뺀 이유가 10자 이상이면 통과였다. r55 게이트 둘이 그 값어치를 재 보였다
--     - 두 객체를 건드리지 않는 마이그레이션이 'xxxxxxxxxx' 한 줄로 목록에 들어 양쪽
--     검사를 통과했고, 되돌린 뒤 다시 적용되어 **다른 표의 값이 1 에서 2 가 됐는데
--     지문은 같았다** (B-R55-N01 · 생성물 발견 2).
--
--   ⚠ 그리고 "필요" 가 말해 주지 않는 것: **다시 적용해도 무해한가.** 목록에 든
--     마이그레이션은 되돌린 뒤 **통째로** 다시 적용된다. 그 파일이 두 객체 밖에서
--     하는 일 (다른 표의 DML · backfill · 카운터) 은 두 번 일어나고, 왕복 단계는 그걸
--     보지 않는다. 이 문단은 "그것을 실제로 보여 주는 것이 2) 다" 라고 적고 있었고
--     그 말은 틀렸다. 그러니 이 목록에 이름을 더하는 PR 은 **그 마이그레이션의 SQL 을
--     직접 읽고** 두 번 돌아도 되는지를 리뷰에서 확인한다. 안 되면 두 객체에 매다는
--     부분만 따로 떼어 낸 파일을 목록에 올린다.
--
--   DB 없이 `npm run verify` 에서 도는 쪽
--   (src/lib/privacy/__tests__/erasure-registry-migration.test.ts) 은 **심판이 아니라
--   조기 경보다.** 0189 부터의 마이그레이션에서 실행되는 SQL 을 읽어 (주석 · 문자열 ·
--   실행되지 않는 달러 본문은 가리고, 실행 시점에 조립하는 SQL 은 상수일 때만
--   복원한다) 두 객체 이름이 나오는 파일과 복원하지 못한 SQL 이 든 파일을 짚고,
--   그 파일을 **사람이 처리했는지** 만 본다: 여기 c_names 에 있거나, 그 테스트의
--   "보았고 ledger 행을 남겨도 된다" 목록에 있거나. 어느 답이 맞는지는 증명하지
--   않는다. 이름이 나오지 않는 문장은 아예 짚지 못한다 - 두 객체에 매달린 것은
--   제 이름을 따로 갖기 때문이다 (r55 B-R55-N02: `GRANT USAGE ON SEQUENCE
--   public.generation_counter_seq` 는 도우미 함수도 변수도 없는 평문인데 조용했다).

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

-- 이력 정리. 여기까지 왔으면 DB 에는 0189·0190·0198 의 대상 객체가 없다. 0190 은
-- 위에서 지운 함수의 ACL·COMMENT 를, 0198 은 지운 등록부의 네 행을 만들었다. ledger 에만 남아 있으면
-- 다음 db push 가 그 마이그레이션을 건너뛴다. 0189·0190 의 결합 이유는 머리말
-- "두 행은 한 벌이다" 에 있고, 0198 은 삭제된 등록부 행의 재생에 필요하다.
DO $rollback_ledger$
DECLARE
  -- 한 줄에 하나, 이름 옆에 `-- <파일 번호>: <두 객체에 무엇을 매다는가>`. 손으로 돌리는
  -- 사람을 위한 설명이고 **아무 검사도 읽지 않는다** (머리말 "이 목록을 누가 지키는가").
  -- 항목이 목록에 있어도 되는지는 CI 의 왕복 단계가 실제 DB 에서 판정한다.
  c_names constant text[] := ARRAY[
    'erasure_registry',                  -- 0189: 두 객체(erase_my_data · erasure_registry)를 만든다
    'lock_erase_my_data_authenticated',  -- 0190: 0189 가 만든 함수의 잠금을 완성한다 (REVOKE · COMMENT)
    'service_contract_erasure_registry'  -- 0198: 0189 등록부에 새 서비스 계약 표 네 행을 더한다
  ];
  v_found   text;
  v_absent  text;
  v_removed bigint;
BEGIN
  IF to_regclass('supabase_migrations.schema_migrations') IS NULL THEN
    RAISE NOTICE '0189 rollback: supabase_migrations.schema_migrations 가 없다 (CLI 가 적용하지 않은 DB) - 이력 정리 없음';
    RETURN;
  END IF;

  SELECT pg_catalog.string_agg(m.name || ' (version ' || m.version || ')', ', ' ORDER BY m.version)
    INTO v_found
  FROM supabase_migrations.schema_migrations AS m
  WHERE m.name = ANY (c_names);

  IF v_found IS NULL THEN
    RAISE NOTICE '0189 rollback: ledger 에 % 행이 하나도 없다 - 정리할 이력 없음', c_names;
    RETURN;
  END IF;

  SELECT pg_catalog.string_agg(n.name, ', ' ORDER BY n.name)
    INTO v_absent
  FROM pg_catalog.unnest(c_names) AS n(name)
  WHERE NOT EXISTS (
    SELECT 1 FROM supabase_migrations.schema_migrations AS m WHERE m.name = n.name
  );

  DELETE FROM supabase_migrations.schema_migrations AS m
  WHERE m.name = ANY (c_names);
  GET DIAGNOSTICS v_removed = ROW_COUNT;

  RAISE NOTICE '0189 rollback: ledger 에서 % 행을 지웠다: %. 다음 db push 가 함께 다시 적용한다.',
    v_removed, v_found;

  -- 한 벌 중 일부만 있었다. 아직 적용된 적이 없는 것이면 해롭지 않다 (다음 push 가
  -- 적용한다). 위험한 경우는 그 마이그레이션이 **다른 name 으로** 기록돼 있을
  -- 때다: 이 파일은 name 으로 찾으므로 그 행을 못 보고 남기고, 남은 행이 곧
  -- 머리말의 구멍이다. name 과 무관하게 내용으로 찾는 조회를 함께 알려 준다.
  IF v_absent IS NOT NULL THEN
    RAISE WARNING '0189 rollback: ledger 에 이 name 의 행이 없었다: %. 아직 적용되지 않은 것이면 괜찮다. 다른 name 으로 기록돼 있다면 그 행을 손으로 지워야 한다 - 남아 있으면 다음 push 가 그 마이그레이션을 건너뛰고, 0190 의 경우 erase_my_data 가 authenticated=X 로 되살아난다. 내용으로 찾기: SELECT version, name FROM supabase_migrations.schema_migrations WHERE statements::text LIKE ''%%erase_my_data%%'' OR statements::text LIKE ''%%erasure_registry%%'';',
      v_absent;
  END IF;
END;
$rollback_ledger$;

COMMIT;

-- 돌린 뒤 확인할 것 (손으로):
--   1) SELECT to_regprocedure('public.erase_my_data(text)');            -> NULL
--   2) SELECT to_regclass('public.erasure_registry');                   -> NULL
--   3) SELECT version, name FROM supabase_migrations.schema_migrations
--        WHERE name IN ('erasure_registry',
--                       'lock_erase_my_data_authenticated');            -> 0 행
-- 셋 중 하나라도 어긋나면 COMMIT 이 나지 않은 것이다. 트랜잭션이라 중간 상태는
-- 없으므로, 오류 메시지를 보고 같은 파일을 다시 돌리면 된다.
--
-- 그리고 **다시 민 뒤에** 하나 더:
--   4) SELECT has_function_privilege('authenticated',
--               'public.erase_my_data(text)', 'EXECUTE');               -> false
--      true 면 0190 이 건너뛰어진 것이다 (머리말 "두 행은 한 벌이다"). 3) 의 조회를
--      name 대신 위 WARNING 의 내용 조회로 다시 해서 남은 행을 찾는다.
