-- 0033_minor_privacy_enforcement.sql
-- C10 hardening (follow-up to 0030/0032), prompted by get_advisors after the
-- 0028-0032 apply that opened 14-17 self-consent registration.
--
-- 1. enforce_user_age_tier ran with a role-mutable search_path
--    (advisor 0011_function_search_path_mutable). Recreate it with
--    SET search_path = '' so it can't be hijacked. The body is otherwise
--    identical to 0032 (age floor + tier derivation + minor high-privacy seed
--    on insert). It only references pg_catalog built-ins (date_part, age,
--    jsonb_build_object, current_date) and the NEW row, so the empty path is
--    safe — pg_catalog is always implicitly searched.
--
-- 2. The 14-17 high-privacy lock was UX-only (src/lib/privacy/prefs.ts
--    isPrivacyPrefEditable): a direct API call or tampered client could UPDATE
--    users.privacy_prefs to switch a locked key on for a minor. Add a dedicated
--    BEFORE INSERT OR UPDATE OF privacy_prefs trigger that clamps every
--    outward-sharing / profiling / external-processing key back to false for
--    minor_self rows. Only long_term_memory stays user-controllable, matching
--    MINOR_PROMOTABLE_KEYS in src/lib/privacy/prefs.ts.

-- 1. search_path-hardened age gate (logic identical to 0032).
CREATE OR REPLACE FUNCTION enforce_user_age_tier() RETURNS trigger AS $$
DECLARE
  age_years int;
BEGIN
  IF NEW.birth_date IS NULL THEN
    RAISE EXCEPTION 'C10: birth_date is required';
  END IF;

  age_years := date_part('year', age(current_date, NEW.birth_date))::int;

  IF age_years < 14 THEN
    RAISE EXCEPTION 'C10: registration requires age >= 14 (got %)', age_years
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.minor_tier := CASE WHEN age_years < 18 THEN 'minor_self' ELSE 'adult' END;
  NEW.account_status := 'active';

  -- Normalize minor privacy on every write the age gate sees: INSERT *and* a
  -- birth_date UPDATE that turns an adult (with opt-ins) into a 14-17 minor.
  -- Force every locked key false; preserve the promotable long_term_memory
  -- value (default false). Gating this only on INSERT left a hole: a DOB
  -- correction into the minor range would change minor_tier here but leave the
  -- adult's sharing/profiling keys true until they next touched privacy.
  IF NEW.minor_tier = 'minor_self' THEN
    NEW.privacy_prefs := jsonb_build_object(
      'ads', false,
      'sharing', false,
      'recommendations', false,
      'external_analytics', false,
      'llm_training', false,
      'persona_export', false,
      'persona_share', false,
      'long_term_memory', COALESCE((NEW.privacy_prefs ->> 'long_term_memory')::boolean, false)
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = '';

-- 2. Server-side enforcement of the minor high-privacy lock. For minor_self
--    rows, every locked key is forced to false on any write to privacy_prefs;
--    long_term_memory is the only key a minor may promote, so it is NOT clamped.
CREATE OR REPLACE FUNCTION clamp_minor_privacy_prefs() RETURNS trigger AS $$
BEGIN
  IF NEW.minor_tier = 'minor_self' THEN
    NEW.privacy_prefs := COALESCE(NEW.privacy_prefs, '{}'::jsonb) || jsonb_build_object(
      'ads', false,
      'sharing', false,
      'recommendations', false,
      'external_analytics', false,
      'llm_training', false,
      'persona_export', false,
      'persona_share', false
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = '';

-- Named to sort AFTER trg_enforce_user_age_tier so that on INSERT the age gate
-- has already derived minor_tier before this clamp reads it.
DROP TRIGGER IF EXISTS trg_minor_privacy_clamp ON users;
CREATE TRIGGER trg_minor_privacy_clamp
  BEFORE INSERT OR UPDATE OF privacy_prefs ON users
  FOR EACH ROW EXECUTE FUNCTION clamp_minor_privacy_prefs();
