-- 0127: display_name on users (Simon 2026-08-16, L4).
--
-- Why this column did not exist until now: nothing ever asked for a name. The
-- IDEN export says so in its own code -- "no profile-name source exists yet" --
-- and falls back to "나" / "You" for every user. Onboarding collected a birth
-- date and consent, nothing else.
--
-- It exists now because the seventh home star becomes `profile`, and a star
-- needs something to be made of. This is one of the three fixed slots the
-- profile star counts (name / birth date / goal). Onboarding alone should light
-- it to L2, so a new account never sees a dead star on its own home screen.
--
-- What is NOT here, on purpose: a `goal` column. The goal is the 북극성 문장,
-- and that already lives in `records` under the northstar_sentence tag, where
-- the newest tagged row IS the current sentence and every revision is kept.
-- Adding users.goal would create a second answer to "what is this person aiming
-- at", and the two would drift the first time someone edits one of them.
--
-- Nullable and unconstrained beyond length: a name is what someone wants to be
-- called, so validating its shape would only reject real people. RLS is already
-- on users; this column inherits the existing owner-scoped policies.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS display_name text;

-- Length only, and generous. This guards against a paste of an entire document
-- landing in a header, not against unusual names.
ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_display_name_len;
ALTER TABLE users
  ADD CONSTRAINT users_display_name_len
  CHECK (display_name IS NULL OR char_length(display_name) <= 40);

COMMENT ON COLUMN users.display_name IS
  'What the user wants to be called. Optional. Feeds the profile home star (one of its three fixed slots) and replaces the hardcoded 나/You fallback in the IDEN export. The goal deliberately lives in records(northstar_sentence), not here.';
