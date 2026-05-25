-- 0019_xp_and_levels.sql
-- Quest/XP foundation. Adds the experience-point ledger and the columns the
-- progression system reads. The current LEVEL is never stored: it is derived
-- from total_xp via the curve (see level_for_xp below + src/lib/progression).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS total_xp int NOT NULL DEFAULT 0 CHECK (total_xp >= 0);
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS onboarding_quest_completed_at timestamptz;
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS coachmarks_seen jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Server-side XP values. The client never decides how much XP an action is
-- worth -- it only names the action. Tunable post-beta by editing this table.
CREATE TABLE IF NOT EXISTS xp_rules (
  action     text PRIMARY KEY,
  xp_value   int  NOT NULL CHECK (xp_value > 0),
  once_only  boolean NOT NULL DEFAULT false
);

INSERT INTO xp_rules (action, xp_value, once_only) VALUES
  ('audit_answer',        10, false),
  ('ai_followup_answer',   8, false),
  ('journal',             15, false),
  ('note',                 6, false),
  ('self_context_entry',  20, false),
  ('persona_created',     50, true),
  ('rag_export_first',    40, true)
ON CONFLICT (action) DO UPDATE
  SET xp_value = EXCLUDED.xp_value, once_only = EXCLUDED.once_only;

-- XP ledger: one row per award. Source of truth for "how XP was earned".
CREATE TABLE IF NOT EXISTS xp_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action      text NOT NULL,
  xp_delta    int  NOT NULL,
  total_after int  NOT NULL,
  level_after int  NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS xp_events_user_idx ON xp_events (user_id, created_at DESC);

-- Level curve in SQL (mirrors src/lib/progression/levels.ts LEVEL_THRESHOLDS).
-- 20 audit answers x 10 XP = 200 XP = exactly Lv3 (onboarding quest complete).
CREATE OR REPLACE FUNCTION public.level_for_xp(xp int)
RETURNS int LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE
    WHEN xp >= 3000 THEN 10
    WHEN xp >= 2200 THEN 9
    WHEN xp >= 1600 THEN 8
    WHEN xp >= 1150 THEN 7
    WHEN xp >= 800  THEN 6
    WHEN xp >= 550  THEN 5
    WHEN xp >= 350  THEN 4
    WHEN xp >= 200  THEN 3
    WHEN xp >= 100  THEN 2
    ELSE 1
  END
$$;

-- award_xp: the ONLY way XP is granted. SECURITY DEFINER + auth.uid() means a
-- user can only award XP to themselves; the amount comes from xp_rules, not
-- the caller; once_only actions are de-duplicated; the whole thing is atomic.
CREATE OR REPLACE FUNCTION public.award_xp(p_action text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_rule  public.xp_rules%ROWTYPE;
  v_total int;
  v_level int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'award_xp: not authenticated';
  END IF;
  SELECT * INTO v_rule FROM public.xp_rules WHERE action = p_action;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'award_xp: unknown action %', p_action;
  END IF;
  IF v_rule.once_only AND EXISTS (
    SELECT 1 FROM public.xp_events WHERE user_id = v_uid AND action = p_action
  ) THEN
    SELECT total_xp INTO v_total FROM public.users WHERE id = v_uid;
    RETURN jsonb_build_object('awarded', 0, 'total_xp', v_total,
      'level', public.level_for_xp(v_total), 'duplicate', true);
  END IF;
  UPDATE public.users SET total_xp = total_xp + v_rule.xp_value
    WHERE id = v_uid RETURNING total_xp INTO v_total;
  IF v_total IS NULL THEN
    RAISE EXCEPTION 'award_xp: no users row for %', v_uid;
  END IF;
  v_level := public.level_for_xp(v_total);
  INSERT INTO public.xp_events (user_id, action, xp_delta, total_after, level_after)
    VALUES (v_uid, p_action, v_rule.xp_value, v_total, v_level);
  RETURN jsonb_build_object('awarded', v_rule.xp_value, 'total_xp', v_total,
    'level', v_level, 'duplicate', false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.award_xp(text) TO authenticated;

-- RLS
ALTER TABLE xp_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS xp_events_owner_select ON xp_events;
CREATE POLICY xp_events_owner_select ON xp_events
  FOR SELECT TO authenticated USING (user_id = auth.uid());

ALTER TABLE xp_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS xp_rules_read_all ON xp_rules;
CREATE POLICY xp_rules_read_all ON xp_rules
  FOR SELECT TO authenticated USING (true);
