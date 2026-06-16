-- 0045_star_tier_history.sql
-- D9 tier-history (memo §10): persist each self-understanding star's value-ladder
-- tier over time so the assistant can detect when a tendency has shifted
-- ("경향성이 바뀌면 점검") and propose a re-check. Append-only; one row per
-- (star, observation). Mirrors esm_responses (0042) shape + owner RLS.

CREATE TABLE IF NOT EXISTS star_tier_history (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  star_id     text NOT NULL,                          -- StarId: now|recall|seen|rhythm|relational|possible|values
  level       int  NOT NULL CHECK (level BETWEEN 1 AND 5),  -- L1..L5 ladder tier at this observation
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS star_tier_history_user_star_idx ON star_tier_history (user_id, star_id, recorded_at DESC);

-- RLS: owner reads/writes own only (mirrors esm_owner_all, 0042).
ALTER TABLE star_tier_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY star_tier_history_owner_all ON star_tier_history
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
