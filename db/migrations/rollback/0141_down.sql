-- rollback/0141_down.sql
--
-- NOT part of the numbered apply sequence. The dry-run and the prod apply both
-- iterate `db/migrations/*.sql`, a non-recursive glob, so this file in a
-- subdirectory is never picked up. Run it BY HAND and only deliberately.
--
-- ⚠ 읽고 나서 실행할 것. **이걸 되돌리면 로그인이 다시 500 이 된다.**
--
-- 0141 은 기능을 추가하지 않았다. 0139 가 의도했지만 운영에 적용되지 않은 권한을
-- 복구한 것뿐이다. 되돌린다는 것은 곧 `supabase_auth_admin` 에게서
-- `public.user_roles` SELECT 를 빼앗는 것이고, 그러면 auth hook 이 다시 실패한다:
--
--   POST /auth/v1/token  ->  500 "Error running hook URI: ... custom_access_token_hook"
--
-- 즉 **전체 사용자 로그인 중단**이다. 2026-08-23 에 실제로 그 상태였다.
--
-- 되돌릴 이유가 있다면 그건 "0141 이 틀렸다" 가 아니라 "auth hook 자체를 끈다" 일
-- 가능성이 높다. 그 경우 순서는 반대다 -- **먼저 Supabase 대시보드에서 Auth Hook 을
-- 끄고**, 그다음에 이 파일을 돌린다. 순서를 지키지 않으면 그 사이 로그인이 죽는다.

-- 훅이 읽지 못하게 된다. 위 경고를 읽었을 때만 실행할 것.
REVOKE SELECT ON TABLE public.user_roles FROM supabase_auth_admin;

-- 0139 가 의도했던 좁힘을 푼다(자동 부여 상태로 되돌리지는 않는다 -- 그건 애초에
-- 의도가 아니었고, 되살릴 이유도 없다).
GRANT INSERT, UPDATE, DELETE ON TABLE public.user_roles TO authenticated;

GRANT EXECUTE ON FUNCTION public.has_app_role(text) TO anon;
GRANT EXECUTE ON FUNCTION public.has_app_role_now(text) TO anon;
