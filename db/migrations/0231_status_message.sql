-- 0231: 대화명 → 상태 메시지 (Simon 정정, 2026-10-07 02:2x).
--
-- Simon: "대화명 이라는건, 카카오톡에서 사용하는 상태 메시지를 의미하는거야. 근데 작성하다 보니
-- 내가 오해를 할수 있게 줬네. 내 본래 의도는 상태 메시지 였어."
--
-- 0230 은 대화명을 커뮤니티에서 남에게 보일 고유 이름으로 읽었다 - 고유 색인 · 2~24 자 ·
-- 성인 전용 · '쓸 수 있나' RPC. 상태 메시지는 겹쳐도 되는 짧은 한 줄이라 그 장치가 하나도
-- 필요 없다. 그래서 칸 이름을 status_message 로 바꾸고, 고유 색인 · 길이 검사 · RPC 를 걷고,
-- 카카오톡과 같은 60 자 상한만 둔다. 운영에 저장된 대화명은 0건이었다(02:2x 실측) - 이름을
-- 바꿔도 잃는 값이 없다.

SET LOCAL lock_timeout = '10s';

DROP FUNCTION IF EXISTS public.chat_name_available(text);
DROP INDEX IF EXISTS public.users_chat_name_unique;
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_chat_name_length;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'chat_name'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'status_message'
  ) THEN
    ALTER TABLE public.users RENAME COLUMN chat_name TO status_message;
  END IF;
END $$;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS status_message text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.users'::regclass
      AND conname = 'users_status_message_length'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_status_message_length
      CHECK (status_message IS NULL OR char_length(status_message) <= 60);
  END IF;
END $$;

COMMENT ON COLUMN public.users.status_message IS
  'Optional status message: one short line (60 chars max), like a KakaoTalk '
  'status message. Not unique. Read by SecondB as chat context with the filled '
  'profile items (privacy policy section 5). Renamed from chat_name in 0231.';

-- 0140 removed table-wide UPDATE. A rename keeps the column grant; restate it so
-- the grant census reads it from this file. users_self_update still enforces id = auth.uid().
GRANT UPDATE (status_message) ON public.users TO authenticated;
