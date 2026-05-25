-- 0023_chat_usage.sql
-- Jarvis chatbot daily usage counter. Per-user, per-day row that bumps on
-- each chat turn; tier limits live in the application layer
-- (src/lib/chat/limits.ts). Resets at KST midnight via the `day` column —
-- callers compute today's KST date and pass it.
--
-- Limits per handoff v3 §4.B: free 5 · Soma 30 · Cortex 80 · Brain 250.

CREATE TABLE IF NOT EXISTS chat_usage (
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day         date NOT NULL,
  count       int NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day),
  CONSTRAINT chat_usage_count_nonneg CHECK (count >= 0)
);

CREATE INDEX IF NOT EXISTS chat_usage_user_day_idx ON chat_usage (user_id, day DESC);

ALTER TABLE chat_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_usage_owner_all ON chat_usage;
CREATE POLICY chat_usage_owner_all ON chat_usage
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- updated_at maintainer (re-uses set_updated_at from 0010_triggers.sql).
DROP TRIGGER IF EXISTS trg_chat_usage_updated_at ON chat_usage;
CREATE TRIGGER trg_chat_usage_updated_at
  BEFORE UPDATE ON chat_usage
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Atomic increment RPC so the client can bump the count in a single round-trip.
-- Returns the new count. Inserts on conflict (user_id, day) → SUM via the
-- excluded value. SECURITY INVOKER (default) so RLS still applies per caller.
CREATE OR REPLACE FUNCTION public.bump_chat_usage(p_user_id uuid, p_day date)
RETURNS int
LANGUAGE sql
SET search_path = ''
AS $$
  INSERT INTO public.chat_usage AS cu (user_id, day, count)
  VALUES (p_user_id, p_day, 1)
  ON CONFLICT (user_id, day)
  DO UPDATE SET count = cu.count + 1
  RETURNING count;
$$;
