-- 0250: user_roles 성능 어드바이저 WARN 2건 + INFO 1건 정리.
--
-- 근거: prod(zoacryukmdeivmolvyhj) get_advisors(performance) 2026-10-10 관측,
-- 정책·인덱스 정의는 2026-10-12 pg_policies/pg_indexes SELECT로 대조.
--   1. auth_rls_initplan      user_roles_select_self 의 auth.uid() 가 행마다 재평가
--   2. multiple_permissive    authenticated SELECT 에 permissive 정책 2개
--                              (user_roles_select_admin, user_roles_select_self)
--   3. unindexed_foreign_keys user_roles_granted_by_fkey(granted_by)
--
-- 의미 보존: permissive 정책끼리는 OR 로 결합된다. 그래서 두 정책을
--   USING ( user_id = auth.uid()  OR  has_app_role_now('admin') )
-- 하나로 합쳐도 보이는 행 집합은 정확히 같다. (select ...) 로 감싸는 것은
-- 행과 무관한 STABLE 식을 initplan 으로 한 번만 평가하게 할 뿐 값은 같다.
-- 대상 역할(authenticated)·명령(SELECT)·permissive 여부는 그대로다.
--
-- 로그인 경로: auth hook 은 supabase_auth_admin 으로 user_roles_select_auth_admin
-- (USING true)를 쓴다. 이 정책은 건드리지 않는다(0139 전면 장애 전례, 0144 참고).
--
-- 정책이 사라지는 창을 만들지 않도록 select_self 는 ALTER POLICY 로 식만 바꾸고,
-- 같은 트랜잭션 안에서 select_admin 을 지운다.
--
-- bump_reasoning_usage_if_under_cap(uuid,text,integer) EXECUTE 회수는 넣지 않는다:
-- 클라이언트 src/lib/entitlements/usage.ts 가 3인자(p_user_id,p_month,p_cap)로
-- authenticated 세션에서 호출한다. 회수하면 추론 사용량 차감이 실패한다.

ALTER POLICY user_roles_select_self ON public.user_roles
  USING (
    user_id = (select auth.uid())
    OR (select public.has_app_role_now('admin'))
  );

DROP POLICY IF EXISTS user_roles_select_admin ON public.user_roles;

CREATE INDEX IF NOT EXISTS user_roles_granted_by_idx
  ON public.user_roles (granted_by);
