-- 0042_esm_responses.sql
-- ESM (Experience Sampling) layer — D-10, 4-AI consensus = A (staged).
-- Lightweight, in-context check-ins capture momentary signals so the persona's
-- accuracy comes from accumulated in-the-moment observations (SOKA behavioral
-- trace), not one-shot self-report. Staged rollout per AG+Codex guardrails:
-- in-screen, user-opened check-ins FIRST; opt-in notifications come later.

CREATE TABLE IF NOT EXISTS esm_responses (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  prompt_kind   text NOT NULL,                 -- prompt template id, e.g. 'energy' | 'context' | 'mood'
  scale_value   int,                           -- optional scalar/Likert answer; null for tag-only check-ins
  context_tags  text[] NOT NULL DEFAULT '{}',  -- momentary context (who/where/activity); KR uses indirect context over direct rating
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS esm_responses_user_created_idx ON esm_responses (user_id, created_at DESC);

-- RLS: owner reads/writes own only (mirrors records_owner_all, 0009).
ALTER TABLE esm_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY esm_owner_all ON esm_responses
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
