-- 0190_lock_erase_my_data_authenticated.sql
-- Integration candidate only: re-scan remote/local migration numbers immediately
-- before push and renumber if 0190 was taken in the meantime.
--
-- 0189 는 erase_my_data 를 "잠긴 채 배송한다" 고 적었다. 사실이 아니었다.
-- 이 파일이 그 잠금을 실제로 건다. 0189 는 이미 main 에 머지됐으므로 고치지 않고
-- 새 번호로 정정한다.
--
-- 무엇이 틀렸나. 0189:403 은 이렇게 회수한다:
--     REVOKE EXECUTE ON FUNCTION public.erase_my_data(text) FROM PUBLIC, anon;
-- 그런데 Supabase 는 public 스키마의 default privileges 로 새 함수마다 anon ·
-- authenticated · service_role 에게 EXECUTE 를 **이름으로** 준다. 저장소가 이미
-- 한 번 쟀다: 0035:85 가 PUBLIC 만 회수한 뒤 운영의 ACL 은
-- {postgres=X,anon=X,authenticated=X,service_role=X} 였다 (0036:11-13). 0082 와
-- scripts/check-definer-grants.ts:3-8 도 같은 말을 한다. PUBLIC 과 anon 만 걷으면
-- authenticated 의 명시적 부여는 그대로 남는다.
--
-- 코디네이터 실측 (2026-09-20 20:0x KST, 운영, 읽기 전용):
--   - public 함수 291개 중 242개의 proacl 에 authenticated=X 가 명시적으로 있다.
--   - 마이그레이션이 anon 만 회수한 함수 6개(community_is_member · credit_summary_self ·
--     has_app_role · log_ai_audit · match_wiki_pages · t5_seen_aggregate)는 전부
--     has_function_privilege('authenticated', ..., 'EXECUTE') = true, anon 만 false.
--   - 운영에 0189 는 아직 적용되지 않았고 public.erase_my_data 도 없다. 즉 열린 채
--     나간 적은 없다. 0189 와 이 파일은 **반드시 함께** 적용한다.
--
-- 같은 모양이 scratch DB 에서도 재현된다 (2026-09-20, CI 부트스트랩을 로컬
-- PostgreSQL 18.3 에 그대로 재생하고 0001~0189 를 전부 적용. pgvector 만 대역).
-- 그 바닥을 깐 뒤 이 파일 없이 0189 까지만 적용하면 proacl 은
--     {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- 이고 authenticated=true · anon=false 다. 운영에서 본 것과 같은 모양이다.
-- 이 파일까지 적용하면 {postgres=X/postgres,service_role=X/postgres} 가 된다.
--
-- 왜 검사가 못 잡았나. db/tests/erasure_registry_regression.sql 블록 (L) 은
-- has_function_privilege('authenticated', ...) = false 를 단언했지만 CI scratch DB 는
-- role 만 만들고 위 default privileges 를 깔지 않았다. 바닥이 없으니 PUBLIC 만
-- 회수해도 false 가 나왔다 - 어떤 마이그레이션도 만들지 않은 이유로 초록이었다
-- (R48 생성물 게이트 F-02). 같은 PR 이 supabase-dry-run.yml 에 그 바닥을 깔고,
-- 블록 (L) 은 바닥이 없는 DB 에서는 결론을 내리지 않고 빨강이 되게 했다.
--
-- PUBLIC 과 anon 을 다시 적는 이유. 0189 가 이미 걷었으니 여기서는 아무것도 바꾸지
-- 않는다 (갖지 않은 권한의 REVOKE 는 조용한 no-op 이다). 그래도 적는 까닭은 둘이다:
--   (1) 이 파일 하나만 읽어도 배송 ACL 전체가 보인다. 두 파일을 합쳐 읽어야 답이
--       나오는 잠금이 바로 0189 가 틀린 자리였다.
--   (2) 아래 COMMENT 문자열이 나중에 definer 라는 말을 담게 되어 check:definer-grants
--       규칙 B 가 이 파일을 보게 되더라도, 규칙이 요구하는 FROM anon 이 같은 파일에 있다.
--
-- service_role 은 걷지 않는다. 0036 이 "service_role 전용" 의 끝 상태로 기록한
-- {postgres=X,service_role=X} 와 같은 모양이고, 이 함수는 auth.uid() 가 NULL 이면
-- 아무것도 하기 전에 28000 을 던지므로 service_role 호출은 어차피 거절된다.
-- 그래서 여기서 하는 주장은 "아무에게도 없다" 가 아니라 **"클라이언트 역할
-- (PUBLIC · anon · authenticated)에게 없다"** 이다.
--
-- 언제 여나. 0189 5절이 적은 조건 그대로다: 사용자별 삭제 울타리와 세대
-- (docs/S3-SERVER-DELETION.md 의 S3-C · S3-D)가 들어와 모든 owner-data writer 가 그것을
-- 공유하고, 두 세션 회귀가 "이미 지나간 표로의 INSERT 가 거절되거나 호출이
-- 재시도/실패한다" 를 실행으로 보인 뒤. 그때는 **새 번호의 마이그레이션에서**
-- authenticated 에 GRANT 하고, 같은 PR 에서 블록 (L) 과
-- src/lib/privacy/__tests__/erasure-registry-migration.test.ts 의 잠금 단언을 의식적으로
-- 뒤집는다. 그 전에 손으로 GRANT 하지 말 것.
--
-- rollback 짝(rollback/0190_down.sql)은 두지 않는다. 그 규약은 선택이고(173개 중
-- 0135 · 0136 · 0137 · 0141 · 0189 다섯 개) 이 파일의 역은 authenticated 에 대한 GRANT,
-- 즉 F-02 를 다시 여는 스크립트다. 되돌릴 대상은 함수 자체이고 그건
-- rollback/0189_down.sql 이 ACL 과 함께 통째로 지운다.
--
-- ⚠ 그 rollback 과의 순서 함정. 0189_down.sql 은 ledger 에서 **자기 행만**
--   (name = 'erasure_registry') 지운다. 그 뒤의 db push 는 0189 만 다시 적용하고 이
--   파일은 이미 적용된 것으로 보고 건너뛴다. 그러면 함수가 플랫폼 기본값
--   (authenticated=X)을 단 채 되살아난다 - 이 파일이 막은 바로 그 상태다.
--   0189 를 rollback 했다면 같은 자리에서 이 파일의 ledger 행
--   (name = 'lock_erase_my_data_authenticated')도 지워 둘이 함께 다시 적용되게 한다.
--   (0189_down.sql 을 그렇게 고치는 것은 이 PR 의 범위 밖이라 후속으로 남겼다.)
--
-- 최상위 BEGIN/COMMIT 을 두지 않는다. Supabase CLI 가 이 파일을 자기 트랜잭션으로
-- 감싼다 (supabase-dry-run.yml 이 0147 이상에 대해 막는다).

REVOKE EXECUTE ON FUNCTION public.erase_my_data(text) FROM PUBLIC, anon, authenticated;

----------------------------------------------------------------------
-- 끝 상태를 적용 시점에 확인한다 (0172~0185 와 같은 모양).
--
-- 운영에는 default privileges 바닥이 있으므로 이 검사는 거기서 공허하지 않다:
-- 위 REVOKE 에서 authenticated 가 빠지거나, 나중에 누가 이 파일 앞에 GRANT 를
-- 끼워 넣으면 마이그레이션이 끝나지 못한다. has_function_privilege 는 PUBLIC 을
-- 거친 권한도 세므로 세 주체를 다 본다.
----------------------------------------------------------------------

DO $erase_lock_check$
BEGIN
  IF pg_catalog.has_function_privilege('authenticated', 'public.erase_my_data(text)', 'EXECUTE')
     OR pg_catalog.has_function_privilege('anon', 'public.erase_my_data(text)', 'EXECUTE')
     OR pg_catalog.has_function_privilege('public', 'public.erase_my_data(text)', 'EXECUTE') THEN
    RAISE EXCEPTION '0190: erase_my_data is still executable by a client role (PUBLIC, anon or authenticated); it must stay locked until the per-user delete fence exists';
  END IF;
END;
$erase_lock_check$;

COMMENT ON FUNCTION public.erase_my_data(text) IS
  '콘텐츠 삭제(계정 유지). 대상은 public.erasure_registry 의 client_erasable 행이다. 반환은 공개 영수증(receipt_version·scope·executed_at·status·count_semantics·direct_deleted_total·outcomes)이고 표 이름·class·사유는 담지 않는다 - 그 상세는 등록부 표에만 있고 service_role 만 읽는다. direct_deleted_total 은 명시 DELETE 의 행수 합이라 FK 연쇄로 사라진 행은 빠져 있다(count_semantics = direct_only). [잠김] 클라이언트 역할(PUBLIC·anon·authenticated)에게 EXECUTE 가 없다 - PUBLIC·anon 은 0189, authenticated 는 0190 이 걷었다. 실수가 아니라 의도다: 표를 순서대로 지우는 동안 같은 사용자의 다른 세션이 이미 지나간 표에 행을 커밋할 수 있는데, 이 함수는 그것을 모른 채 status=ok 를 돌려준다. 사용자별 삭제 울타리와 세대(docs/S3-SERVER-DELETION.md 의 S3-C·S3-D)가 들어오고 두 세션 회귀가 그 늦은 쓰기의 거절을 실행으로 보인 뒤에 새 마이그레이션으로 연다. 그 전에 authenticated 에 GRANT 하지 말 것. service_role 은 플랫폼 기본 부여를 그대로 갖지만 auth.uid() 가 NULL 이라 28000 으로 거절된다.';
