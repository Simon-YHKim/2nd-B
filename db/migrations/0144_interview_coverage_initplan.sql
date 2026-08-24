-- 0144: interview_coverage RLS 정책 3개의 auth.uid() 를 (select auth.uid()) 로.
--
-- 어드바이저 실측(2026-08-25 01:40 콘솔 + 2026-08-25 재확인): 0143 이 만든 정책
-- 3개(select_own / insert_own / update_own)가 auth_rls_initplan WARN — auth.uid()
-- 를 바로 쓰면 행마다 재평가돼 규모에서 느려진다. (select auth.uid()) 로 감싸면
-- initplan 에서 한 번만 평가된다. 의미는 동일하다 — 같은 사용자 자기 행 조건.
--
-- ALTER POLICY 로 식(qual/with_check)만 바꾼다. DROP/CREATE 를 안 쓰는 이유:
-- 정책이 잠깐이라도 사라지는 창을 만들지 않기 위해서다 (RLS 테이블에서 정책
-- 부재 = 전면 차단이라 사고는 아니지만, 굳이 창을 열 이유가 없다).
--
-- 참고: user_roles_select_self 도 같은 WARN 이지만 여기서 건드리지 않는다 —
-- 그 테이블은 auth hook 이 읽는 로그인 경로(0139 전면 장애 전례)라, 변경은
-- 별도 결정으로 다룬다.

ALTER POLICY interview_coverage_select_own ON public.interview_coverage
  USING (user_id = (select auth.uid()));

ALTER POLICY interview_coverage_insert_own ON public.interview_coverage
  WITH CHECK (user_id = (select auth.uid()));

ALTER POLICY interview_coverage_update_own ON public.interview_coverage
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));
