-- 0021_self_contexts.sql
-- "Multiple selves" skeleton (Lv6 feature). This migration lands the table and
-- the records.self_context_id link so the Lv6 gate + free-tier per-context
-- usage counting work now; the context capture UI + sub-persona is Phase 2.

CREATE TABLE IF NOT EXISTS self_contexts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  context_kind text NOT NULL
    CHECK (context_kind IN ('work', 'parents', 'friends', 'partner', 'custom')),
  label        text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS self_contexts_user_idx ON self_contexts (user_id, created_at);

ALTER TABLE records
  ADD COLUMN IF NOT EXISTS self_context_id uuid REFERENCES self_contexts(id) ON DELETE SET NULL;

ALTER TABLE self_contexts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS self_contexts_owner_all ON self_contexts;
CREATE POLICY self_contexts_owner_all ON self_contexts
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
