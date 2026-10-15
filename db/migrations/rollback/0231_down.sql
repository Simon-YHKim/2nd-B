-- Rollback for 0231_status_message.sql: back to the 0230 shape (users.chat_name, unique, 2..24,
-- chat_name_available). Saved status messages longer than 24 characters or duplicated across
-- accounts would block the 0230 checks, so they are cleared first (a rollback is not lossless).

SET LOCAL lock_timeout = '10s';

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_status_message_length;

UPDATE public.users SET status_message = NULL
 WHERE status_message IS NOT NULL
   AND (char_length(btrim(status_message)) NOT BETWEEN 2 AND 24
        OR lower(normalize(btrim(status_message), NFKC)) IN (
          SELECT lower(normalize(btrim(u.status_message), NFKC))
            FROM public.users u
           WHERE u.status_message IS NOT NULL
           GROUP BY 1 HAVING count(*) > 1));

ALTER TABLE public.users RENAME COLUMN status_message TO chat_name;

ALTER TABLE public.users
  ADD CONSTRAINT users_chat_name_length
  CHECK (chat_name IS NULL OR char_length(btrim(chat_name)) BETWEEN 2 AND 24);

CREATE UNIQUE INDEX IF NOT EXISTS users_chat_name_unique
  ON public.users (lower(normalize(btrim(chat_name), NFKC)))
  WHERE chat_name IS NOT NULL;

GRANT UPDATE (chat_name) ON public.users TO authenticated;

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
