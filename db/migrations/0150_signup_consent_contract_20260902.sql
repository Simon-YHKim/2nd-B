-- 0150_signup_consent_contract_20260902.sql
--
-- ⚠ 파일명의 20260902 는 더 이상 이 파일이 선언하는 날짜가 아니다. 2026-09-07 에
-- 09-02 개정안과 09-04 사실 정정을 하나로 합치면서 email-v3 튜플이 09-07 로
-- 옮겨졌다. 이름을 안 바꾼 이유는 둘이다 — 검사가 이 파일명을 하드코딩하고
-- (atomic-complete-profile-consent-migration.test.ts), 번호 재예약은 브랜치
-- 전용 마이그레이션 배치 정리와 함께 결정할 일이다. 이름이 아니라 아래 행을 믿을 것.
-- Append the 2026-09-07 verified-email surface without rewriting either
-- historical contract. The optional marketing choice remains the user's
-- literal auth-metadata value; this mapping owns only document versions and
-- whether the auth confirmation trigger may consume the revision.
--
-- The complete-profile RPC has no shipped caller yet. Keep its v1 contract for
-- historical reproducibility, but close authenticated execution until a future
-- client revision and its re-grant can ship atomically.

-- ⚠ 최상위 BEGIN/COMMIT 을 두지 않는다. Supabase CLI 가 이 파일을 자기
-- 트랜잭션으로 감싸므로 여기서 또 열면 중첩된다(supabase-dry-run.yml 이
-- 0147 이상에 대해 이걸 막는다). 아래 SET LOCAL 은 그 CLI 트랜잭션 안에서
-- 그대로 유효하다.

SET LOCAL lock_timeout = '10s';

CREATE OR REPLACE FUNCTION public.signup_consent_contract(p_revision text)
RETURNS TABLE (
  consent_version text,
  policy_version text,
  terms_version text,
  confirmation_eligible boolean
)
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $contract$
  SELECT
    contract.consent_version,
    contract.policy_version,
    contract.terms_version,
    contract.confirmation_eligible
  FROM (
    VALUES
      ('email-v2'::text, '2026-08-16'::text, '2026-08-30'::text, '2026-08-16'::text, true),
      ('complete-profile-v1'::text, '2026-08-16'::text, '2026-08-30'::text, '2026-08-16'::text, false),
      ('email-v3'::text, '2026-09-07'::text, '2026-09-07'::text, '2026-08-16'::text, true)
  ) AS contract(
    signup_revision,
    consent_version,
    policy_version,
    terms_version,
    confirmation_eligible
  )
  WHERE contract.signup_revision = p_revision
$contract$;

-- CREATE OR REPLACE preserves ACLs. Reassert every private boundary explicitly;
-- keep the dormant RPC revoke last so the migration's final ACL mutation is
-- the fail-closed production state.
REVOKE ALL ON FUNCTION public.signup_consent_contract(text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.complete_verified_email_signup()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.complete_profile_signup_consent(
  text, text, text, text, boolean, boolean, boolean, boolean, boolean, boolean
) FROM PUBLIC, anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

