-- 0086_raise_age_floor_16.sql
-- Gate W4-B (2026-07-11): raise the self-consent floor from 14 (KR PIPA value)
-- to a conservative 16 GLOBAL floor (the GDPR Art.8 ceiling). With no reliable
-- country signal, a single 16 floor is valid in every market we ship to
-- (KR/US/EU) and unblocks the global launch; KR 14-15 and US 13-15 minors are
-- blocked rather than admitted under a jurisdiction we cannot yet detect.
-- Client mirror: MIN_SELF_CONSENT_AGE = digitalConsentAge() (16) in
-- src/lib/supabase/auth.ts.
--
-- This CREATE OR REPLACE-s enforce_user_age_tier() carrying forward the LATEST
-- body (0050): the SET search_path = '' hardening (0033) and the minor-privacy
-- prefs seeding (0050) are preserved verbatim. ONLY the floor changes: 14 -> 16.
-- The trigger (trg_enforce_user_age_tier, BEFORE INSERT OR UPDATE OF birth_date)
-- from 0030 is unchanged and keeps pointing at this function. minor_tier stays
-- derived as < 18 -> minor_self, so the self-consent minor band is now 16-17.
-- Existing rows are not retroactively removed (the trigger only fires on INSERT
-- / UPDATE OF birth_date); the new floor applies to new sign-ups and birth_date
-- changes.

CREATE OR REPLACE FUNCTION enforce_user_age_tier() RETURNS trigger AS $$
DECLARE
  age_years int;
BEGIN
  IF NEW.birth_date IS NULL THEN
    RAISE EXCEPTION 'C10: birth_date is required';
  END IF;

  age_years := date_part('year', age(current_date, NEW.birth_date))::int;

  IF age_years < 16 THEN
    RAISE EXCEPTION 'C10: registration requires age >= 16 (got %)', age_years
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.minor_tier := CASE WHEN age_years < 18 THEN 'minor_self' ELSE 'adult' END;
  NEW.account_status := 'active';

  -- Normalize minor privacy on every write the age gate sees (INSERT and a
  -- birth_date UPDATE into the 16-17 range). Force every locked key false;
  -- preserve the promotable long_term_memory value. health_import joins the
  -- locked set (Phase B Slice 1).
  IF NEW.minor_tier = 'minor_self' THEN
    NEW.privacy_prefs := jsonb_build_object(
      'ads', false,
      'sharing', false,
      'recommendations', false,
      'external_analytics', false,
      'llm_training', false,
      'persona_export', false,
      'persona_share', false,
      'health_import', false,
      'long_term_memory', COALESCE((NEW.privacy_prefs ->> 'long_term_memory')::boolean, false)
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = '';
