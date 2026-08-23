-- 0141_rbac_grants_repair.sql
-- 0139 의 GRANT 블록이 운영에 **통째로 적용되지 않았다.** 그 결과 2026-08-23 에
-- 로그인이 전면 중단돼 있었다. 이 마이그레이션은 그 블록을 멱등하게 다시 적용하고,
-- **끝나기 전에 스스로 검증한다.**
--
-- ── 무슨 일이 있었나 (운영 실측) ────────────────────────────────────────────
--
-- 증상: 모든 로그인이 500.
--
--   POST /auth/v1/token?grant_type=password
--   {"code":500,"error_code":"unexpected_failure",
--    "msg":"Error running hook URI: pg-functions://postgres/public/custom_access_token_hook"}
--
-- 원인: 훅의 유일한 DB 접근이 `SELECT ... FROM public.user_roles` 인데
-- `supabase_auth_admin` 에게 그 테이블 권한이 **하나도 없었다.** RLS 정책
-- (`user_roles_select_auth_admin`)은 있었지만 Postgres 는 테이블 GRANT 와 정책이
-- **둘 다** 있어야 통과시킨다. 정책만 있고 GRANT 가 없으면 permission denied 다.
--
-- 왜 없었나: `supabase_migrations.schema_migrations` 에 저장된 0139 적용본이
-- **5절 끝 COMMENT 다음에 곧바로 COMMIT 으로 건너뛴다.** 6절("Grants", 파일 261~292행)
-- 19줄이 통째로 빠져 있다. 적용본에 실제 GRANT 문은 **0건**이다
-- (`statements[1] ILIKE '%REVOKE %'` 이 참인 것은 5절 COMMENT **문자열 안의**
-- 산문 "the column-level REVOKE cannot cut the table-level GRANT" 때문이지
-- 실행된 REVOKE 가 있어서가 아니다 -- 이 대조에 속지 말 것).
--
-- 그럼 훅 함수의 EXECUTE 권한은 어디서 왔나: **Supabase 대시보드의 Auth Hook 활성화**가
-- 자기 몫을 직접 실행한다(`proacl` 이 `{postgres=X,service_role=X,supabase_auth_admin=X}`
-- 로 PUBLIC 항목 없이 정확히 그 문서 스니펫 모양이다). 그런데 그 스니펫은 훅이 읽을
-- **테이블** 권한까지 주지는 않는다. 그래서 "훅은 켜졌는데 훅이 읽지 못하는" 상태가 됐다.
--
-- ── 이 파일이 하는 일 ──────────────────────────────────────────────────────
--
-- 1. 0139 6절을 멱등하게 다시 적용한다(이미 손으로 복구한 상태와 같은 결과).
-- 2. 0139 가 **의도했지만 달성하지 못한** 것까지 마저 한다 -- Supabase 는 새 테이블·
--    함수에 PUBLIC/anon/authenticated 로 넓은 권한을 자동 부여하고,
--    `REVOKE ... FROM PUBLIC` 은 **역할에 직접 붙은 GRANT 를 못 깎는다.**
--    0139 는 `GRANT SELECT ... TO authenticated` 만 의도했는데 실제로는
--    authenticated 가 INSERT/UPDATE/DELETE/TRUNCATE 까지 들고 있었다. 지금은
--    쓰기 정책이 없어 RLS 가 막지만, 정책이 하나만 잘못 추가돼도 사용자가
--    **자기 역할을 스스로 올릴 수** 있게 된다. RBAC 이 막으라고 있는 바로 그것이다.
-- 3. **끝에서 스스로 검증한다.** 이 블록이 또 잘려나가면 그때는 조용히 넘어가지 않고
--    다음 적용이 예외로 멈춘다.
--
-- ⚠ 이 파일에는 `$$` 함수 본문이 없다. 0139 가 잘린 지점이 하필 `$$` 본문과 작은따옴표
-- 이스케이프(`0138''s`)가 몰려 있는 5절 직후였으므로, 복구 파일만큼은 파서를 시험하지
-- 않는 모양으로 둔다. DO 블록은 검증용 하나뿐이고 맨 끝에 있다.

BEGIN;

----------------------------------------------------------------------
-- 1. user_roles 테이블 권한 (0139 6절에서 빠진 것)
----------------------------------------------------------------------
-- 훅이 읽어야 하는 권한. 이것이 없어서 로그인이 500 이었다.
GRANT SELECT ON TABLE public.user_roles TO supabase_auth_admin;

-- 클라이언트 역할은 읽기만. 아래 REVOKE 가 핵심이다 -- Supabase 자동 부여로
-- authenticated 가 쓰기 권한까지 갖고 있었고 `REVOKE ... FROM PUBLIC` 은 그걸 못 깎는다.
GRANT SELECT ON TABLE public.user_roles TO authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.user_roles FROM authenticated;

REVOKE ALL ON TABLE public.user_roles FROM PUBLIC;
REVOKE ALL ON TABLE public.user_roles FROM anon;

GRANT ALL ON TABLE public.user_roles TO service_role;

----------------------------------------------------------------------
-- 2. 역할 판정 함수 권한 (0139 6절에서 빠진 것)
----------------------------------------------------------------------
-- anon 이 실행해도 클레임이 비어 false 를 받으므로 권한 상승은 아니었다. 다만 0139 의
-- 의도가 "anon 은 못 부른다" 였고, 표면은 좁을수록 낫다.
REVOKE ALL     ON FUNCTION public.has_app_role(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_app_role(text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.has_app_role(text) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.has_app_role(text) TO service_role;

REVOKE ALL     ON FUNCTION public.has_app_role_now(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_app_role_now(text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.has_app_role_now(text) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.has_app_role_now(text) TO service_role;

----------------------------------------------------------------------
-- 3. 훅 함수 권한 (대시보드가 이미 해둔 것 -- 멱등하게 못박는다)
----------------------------------------------------------------------
-- 훅을 껐다 켜거나 다른 프로젝트로 옮길 때 대시보드에 의존하지 않도록 파일에 남긴다.
REVOKE ALL     ON FUNCTION public.custom_access_token_hook(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;

----------------------------------------------------------------------
-- 4. 자기 검증 -- 이 블록이 또 잘리면 다음 적용이 여기서 멈춘다
----------------------------------------------------------------------
DO $verify$
BEGIN
  IF NOT has_table_privilege('supabase_auth_admin', 'public.user_roles', 'SELECT') THEN
    RAISE EXCEPTION '0141: auth hook cannot read user_roles -- sign-in would 500';
  END IF;
  IF has_table_privilege('anon', 'public.user_roles', 'SELECT') THEN
    RAISE EXCEPTION '0141: anon still holds SELECT on user_roles';
  END IF;
  IF has_table_privilege('authenticated', 'public.user_roles', 'INSERT') THEN
    RAISE EXCEPTION '0141: authenticated can still INSERT into user_roles (self-promotion)';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.user_roles', 'SELECT') THEN
    RAISE EXCEPTION '0141: authenticated lost SELECT on user_roles';
  END IF;
  IF has_function_privilege('anon', 'public.custom_access_token_hook(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION '0141: anon can execute the auth hook';
  END IF;
END
$verify$;

COMMIT;
