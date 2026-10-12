-- 0250 되돌리기: 0139 의 정책 두 개와 인덱스 없는 상태로 복귀한다. 행은 바꾸지 않는다.
DROP INDEX IF EXISTS public.user_roles_granted_by_idx;

DROP POLICY IF EXISTS user_roles_select_admin ON public.user_roles;
CREATE POLICY user_roles_select_admin ON public.user_roles
  FOR SELECT TO authenticated
  USING (public.has_app_role_now('admin'));

ALTER POLICY user_roles_select_self ON public.user_roles
  USING (user_id = auth.uid());
