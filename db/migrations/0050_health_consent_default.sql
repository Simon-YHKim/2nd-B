-- 0050_health_consent_default.sql
-- Phase B Slice 1: extend the minor high-privacy seed so the new health_import
-- preference is seeded OFF for 14-17 self-consent minors on sign-up (and on a
-- DOB correction into the minor range) — same posture as the other
-- outward/sensitive keys.
--
-- health_import gates the health/activity ingest (PIPA 민감정보). It is OFF by
-- default for EVERYONE (the app resolves missing keys to false via
-- src/lib/privacy/prefs.ts), and for minors it is additionally seeded OFF here
-- AND kept non-promotable in the prefs contract (not in MINOR_PROMOTABLE_KEYS),
-- so a minor can never ingest health data. Adults opt in later.
--
-- This is a CREATE OR REPLACE of enforce_user_age_tier that MIRRORS THE CURRENT
-- prod body — the search_path = '' pin and the run-on-every-write (not
-- INSERT-only) minor clamp are preserved verbatim; the ONLY change is adding
-- 'health_import', false to the minor seed (0033 predates the key, so this
-- forward migration lands it). 0038 did NOT touch enforce_user_age_tier, so the
-- 0033-derived body is still current and this replacement only adds the key.
-- It ALSO CREATE OR REPLACEs the companion clamp_minor_privacy_prefs() to add
-- 'health_import', false. CRITICAL: that clamp was hardened in 0038 to key off
-- COALESCE(OLD.minor_tier, NEW.minor_tier) (the row's unforgeable tier) — this
-- migration PRESERVES that 0038 hardening and must NOT revert to NEW.minor_tier,
-- or a 14-17 minor could forge minor_tier='adult' on UPDATE and skip the clamp.
-- FORWARD-ONLY: the already-applied 0033/0038 are left untouched (a migration
-- runner never re-runs them), and CREATE OR REPLACE FUNCTION keeps the existing
-- 0030/0033 trigger bindings intact (no trigger is recreated here).

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

  -- Normalize minor privacy on every write the age gate sees (INSERT and a
  -- birth_date UPDATE into the 14-17 range). Force every locked key false;
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

-- Companion server-side clamp: on ANY write to a minor_self row, force the
-- locked keys false (defends against a tampered client that PATCHes
-- privacy_prefs directly). Forward-only re-definition of the 0038 function that
-- adds 'health_import' to the locked set; the trigger binding from 0033 stays
-- and picks up this replaced body. Mirrors the 0038 clamp verbatim otherwise —
-- in particular the COALESCE(OLD.minor_tier, NEW.minor_tier) tier check below is
-- the 0038 hardening and MUST stay (reverting to NEW.minor_tier re-opens the
-- minor_tier-forge-on-UPDATE escape that 0038 closed).
CREATE OR REPLACE FUNCTION clamp_minor_privacy_prefs() RETURNS trigger AS $$
BEGIN
  -- On UPDATE, OLD.minor_tier is the row's real (unforgeable) tier; on INSERT OLD
  -- is NULL so fall back to the age-gate-derived NEW.minor_tier (mirrors 0038).
  IF COALESCE(OLD.minor_tier, NEW.minor_tier) = 'minor_self' THEN
    NEW.privacy_prefs := COALESCE(NEW.privacy_prefs, '{}'::jsonb) || jsonb_build_object(
      'ads', false,
      'sharing', false,
      'recommendations', false,
      'external_analytics', false,
      'llm_training', false,
      'persona_export', false,
      'persona_share', false,
      'health_import', false
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = '';
