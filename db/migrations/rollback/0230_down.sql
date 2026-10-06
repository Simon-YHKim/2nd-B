-- Rollback for 0230_profile_fields_chat_name.sql.
--
-- ⚠ This does NOT bring back the four erased profile_details keys (dailyRhythm,
-- workHours, workDays, busiestSeason). Their values were deleted on purpose
-- (PIPA art.21, Simon Q-261007-01) and no copy was kept.
--
-- It removes the chat name: the function, the grant, the unique index, the length
-- check and the column (any saved chat names are lost), and restores the 0132
-- column comment on profile_details.

SET LOCAL lock_timeout = '10s';

DROP FUNCTION IF EXISTS public.chat_name_available(text);

REVOKE UPDATE (chat_name) ON public.users FROM authenticated;

DROP INDEX IF EXISTS public.users_chat_name_unique;

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_chat_name_length;

ALTER TABLE public.users DROP COLUMN IF EXISTS chat_name;

COMMENT ON COLUMN public.users.profile_details IS
  'Optional self-reported living conditions the assistant needs to make a '
  'suggestion specific instead of generic (occupation, region at province '
  'level, household, daily rhythm, work hours/days, busiest season). Key set '
  'lives in src/lib/persona/profile-details.ts; readers narrow it with '
  'resolveProfileDetails. NEVER store PIPA art.23 sensitive categories here '
  '(health, beliefs, politics, sex life, genetics, criminal record) -- health '
  'has its own separate consent (privacy_prefs.health_import) and path, and '
  '14-17 minors fill in this same form.';
