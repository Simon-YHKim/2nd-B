-- 0230: 프로필 항목 정리 + 대화명 (Simon 결정 Q-261007-01 · 02 · 06, 2026-10-07).
--
-- ① 뺀 네 칸의 저장 값을 지운다. 하루 리듬(dailyRhythm) · 일하는 시간대(workHours) ·
--    일하는 요일(workDays) · 가장 바쁜 시기(busiestSeason)는 0132 이후 받아 왔지만 읽는
--    기능이 한 곳도 없었다(독자는 입력 화면 · 별 요약 · 별 밝기뿐). 목적이 끝난 개인정보는
--    파기한다(PIPA 제21조). 이 삭제는 되돌릴 수 없다 - rollback 은 칸을 되살리지 않는다.
--
-- ② users.chat_name: 대화명. 닉네임(display_name, 나와 AI 만 보는 이름)과 따로 두는, 남에게
--    보일 이름이다(커뮤니티). 남에게 보이는 이름만 겹치면 안 되므로 고유 규칙은 여기에만
--    건다(상충 판정 ①, DECISIONS 26.10.07 01:12). 맞춘 값(NFKC · 소문자 · 앞뒤 공백)으로
--    비교해 '별빛' 과 ' 별빛 ' 과 전각 문자를 같은 이름으로 본다. 길이는 커뮤니티 별 가명과
--    같은 2..24 자. 커뮤니티 방 이름에 쓰는 것은 다음 단계다(지금 방은 자동 별 가명).
--
-- ③ chat_name_available(p_name): 로그인한 사람만 부른다. 예/아니오만 돌려주고 누가 쓰는지는
--    알려 주지 않는다. 자기 이름은 '쓸 수 있음' 으로 본다(다시 저장해도 막히지 않게).
--    저장 경쟁은 고유 색인이 마지막으로 막는다(23505).

SET LOCAL lock_timeout = '10s';

-- ① 뺀 네 칸
UPDATE public.users
   SET profile_details = profile_details - 'dailyRhythm' - 'workHours' - 'workDays' - 'busiestSeason'
 WHERE profile_details ?| ARRAY['dailyRhythm', 'workHours', 'workDays', 'busiestSeason'];

COMMENT ON COLUMN public.users.profile_details IS
  'Optional self-reported profile details. The key set lives in '
  'src/lib/persona/profile-details.ts; readers narrow it with '
  'resolveProfileDetails. 0230 removed dailyRhythm, workHours, workDays and '
  'busiestSeason (nothing read them) and erased their stored values. NEVER '
  'store PIPA art.23 sensitive categories here (health, beliefs, politics, sex '
  'life, genetics, criminal record) -- health has its own separate consent '
  '(privacy_prefs.health_import) and path, and 14-17 minors fill in this same '
  'form.';

-- ② 대화명
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS chat_name text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.users'::regclass
      AND conname = 'users_chat_name_length'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_chat_name_length
      CHECK (chat_name IS NULL OR char_length(btrim(chat_name)) BETWEEN 2 AND 24);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS users_chat_name_unique
  ON public.users (lower(normalize(btrim(chat_name), NFKC)))
  WHERE chat_name IS NOT NULL;

COMMENT ON COLUMN public.users.chat_name IS
  'Optional chat name (adults, shown in the UI to adults only): the name other '
  'people may see in the community, separate from display_name (which only the '
  'user and the AI see). Unique after NFKC + lower + trim. Not yet used in '
  'community rooms, which still assign per-room star aliases.';

-- 0140 removed table-wide UPDATE. users_self_update still enforces id = auth.uid().
GRANT UPDATE (chat_name) ON public.users TO authenticated;

-- ③ 쓸 수 있나
CREATE OR REPLACE FUNCTION public.chat_name_available(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN false
    WHEN p_name IS NULL OR char_length(btrim(p_name)) NOT BETWEEN 2 AND 24 THEN false
    ELSE NOT EXISTS (
      SELECT 1
        FROM public.users u
       WHERE u.chat_name IS NOT NULL
         AND u.id <> auth.uid()
         AND lower(normalize(btrim(u.chat_name), NFKC)) = lower(normalize(btrim(p_name), NFKC))
    )
  END;
$$;

REVOKE ALL ON FUNCTION public.chat_name_available(text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.chat_name_available(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.chat_name_available(text)
  TO authenticated;

COMMENT ON FUNCTION public.chat_name_available(text) IS
  'Signed-in only. True when no other account uses this chat name (NFKC + lower '
  '+ trim). Answers yes/no only; never says who holds a name.';
