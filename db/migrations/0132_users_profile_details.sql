-- 0132_users_profile_details.sql
-- 프로필 상세 (기본 신상 + 생활 맥락). Simon 결정 2026-08-18 (D2).
--
-- 왜: 가입 때 받는 것은 표시이름과 생년월일뿐이다(연령 게이트 최소치). 그래서
-- 비서가 무엇을 제안하든 **만인 공통**이 될 수밖에 없었다 - 일하는 시간대를
-- 모르면 "오전 9시" 말고 할 말이 없다. 일곱 번째 별을 프로필로 확정하면서
-- (Simon D2) 그 별이 "채운 만큼 밝아지는" 별이 됐는데, 채울 칸이 둘뿐이면
-- 눈금이 성립하지 않는다.
--
-- 왜 컬럼이 아니라 jsonb 인가: 항목이 앞으로 늘고 줄 자리다. 컬럼으로 두면
-- 항목 하나에 마이그레이션 하나가 붙는다. `privacy_prefs`·`reasoning_prefs` 가
-- 같은 이유로 이미 jsonb 다. 키 집합의 정본은 코드에 있고
-- (`src/lib/persona/profile-details.ts` PROFILE_DETAIL_KEYS), 읽는 쪽이
-- resolveProfileDetails 로 좁힌다 - 모르는 키·틀린 타입·선택지 밖의 값은 버린다.
--
-- ⚠ 민감정보는 여기 넣지 않는다. PIPA 제23조 항목(건강·사상·신념·정치·성생활·
-- 유전·범죄경력)은 이 폼에 없고 앞으로도 넣지 않는다. 건강은 별도 동의
-- (privacy_prefs.health_import)와 별도 경로가 이미 있고, 그 분리를 프로필이
-- 흐리면 안 된다. 미성년(14-17)도 같은 폼을 쓰기 때문에 더 그렇다.
-- 사는 곳도 시/도 수준만 받는다 - 번지수는 제안에 쓸모가 없고 유출 피해만 크다.
--
-- RLS: users 는 이미 본인 행만 읽고 쓰는 정책이 걸려 있다. 컬럼 추가라 새 정책이
-- 필요하지 않다.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS profile_details jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.users.profile_details IS
  'Optional self-reported living conditions the assistant needs to make a '
  'suggestion specific instead of generic (occupation, region at province '
  'level, household, daily rhythm, work hours/days, busiest season). Key set '
  'lives in src/lib/persona/profile-details.ts; readers narrow it with '
  'resolveProfileDetails. NEVER store PIPA art.23 sensitive categories here '
  '(health, beliefs, politics, sex life, genetics, criminal record) -- health '
  'has its own separate consent (privacy_prefs.health_import) and path, and '
  '14-17 minors fill in this same form.';

-- 기존 행은 '{}' 로 채워진다(DEFAULT + NOT NULL). 비어 있는 것과 거절한 것을
-- 구분할 필요가 없는 항목이라 NULL 을 쓰지 않았다 - 0130 의 safety_notice_ack
-- 과 달리 여기서는 "아직 안 적음" 하나면 충분하다.
