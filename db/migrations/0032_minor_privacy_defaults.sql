-- 0032_minor_privacy_defaults.sql
-- C10 (PR-7 / task D): 14-17 self-consent minors default to HIGH privacy.
-- Adds users.privacy_prefs and extends the age-gate function (0030) to seed
-- conservative defaults for minor_self on INSERT — everything that shares,
-- profiles, or sends data outward is OFF, and long-term memory must be
-- explicitly promoted. The toggle UI is delegated to the design pass; this
-- migration sets the server-side defaults so a minor is protected from first
-- sign-up regardless of whether the UI exists yet.
--
-- Adults default to the same privacy-by-design baseline ('{}' -> the app
-- resolves missing keys to false via src/lib/privacy/prefs.ts) and opt in later.

ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy_prefs jsonb NOT NULL DEFAULT '{}'::jsonb;  -- C10

-- Replaces the 0030 function wholesale (CREATE OR REPLACE) — keep the full
-- age-gate logic and ADD the minor privacy-default seeding. The trigger binding
-- from 0030 (BEFORE INSERT OR UPDATE OF birth_date) is unchanged.
CREATE OR REPLACE FUNCTION enforce_user_age_tier() RETURNS trigger AS $$
DECLARE
  age_years int;
BEGIN
  IF NEW.birth_date IS NULL THEN
    RAISE EXCEPTION 'C10: birth_date is required';
  END IF;

  age_years := date_part('year', age(current_date, NEW.birth_date))::int;

  -- Hard floor: no self-service registration under 14 (guardian flow not built).
  IF age_years < 14 THEN
    RAISE EXCEPTION 'C10: registration requires age >= 14 (got %)', age_years
      USING ERRCODE = 'check_violation';
  END IF;

  -- Server-derived tier + status — never trust client input for these.
  NEW.minor_tier := CASE WHEN age_years < 18 THEN 'minor_self' ELSE 'adult' END;
  NEW.account_status := 'active';

  -- task D: seed high-privacy defaults for minors on first insert. Only seed
  -- when the client hasn't already supplied prefs (so a future minor-aware UI
  -- can still set them explicitly). Keys mirror src/lib/privacy/prefs.ts.
  IF TG_OP = 'INSERT' AND NEW.minor_tier = 'minor_self'
     AND (NEW.privacy_prefs IS NULL OR NEW.privacy_prefs = '{}'::jsonb) THEN
    NEW.privacy_prefs := jsonb_build_object(
      'ads', false,
      'sharing', false,
      'recommendations', false,
      'external_analytics', false,
      'llm_training', false,
      'persona_export', false,
      'persona_share', false,
      'long_term_memory', false
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
