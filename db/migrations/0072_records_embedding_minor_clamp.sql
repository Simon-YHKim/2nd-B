-- 0072: extend the minor privacy clamp to the D5 records_embedding key.
--
-- records_embedding (D5, 2026-07-06) is a non-promotable, locked privacy pref:
-- consent to build a semantic embedding index over the user's records (journal
-- text = the most sensitive corpus). Exactly as 0050 did for health_import,
-- forward-extend clamp_minor_privacy_prefs to force it false for a minor_self
-- row. 0033/0050 stay as shipped; CREATE OR REPLACE only updates the function
-- body, so the existing BEFORE INSERT/UPDATE trigger binding is unchanged.
--
-- No data backfill is needed: records_embedding is a brand-new key, so no
-- existing row carries an opted-in value (resolvePrivacyPrefs already defaults a
-- missing key to false). This migration guarantees FUTURE minor updates can
-- never set it true.

CREATE OR REPLACE FUNCTION clamp_minor_privacy_prefs() RETURNS trigger AS $$
BEGIN
  -- On UPDATE, OLD.minor_tier is the row's real (unforgeable) tier; on INSERT
  -- OLD is NULL so fall back to the age-gate-derived NEW.minor_tier (mirrors 0038/0050).
  IF COALESCE(OLD.minor_tier, NEW.minor_tier) = 'minor_self' THEN
    NEW.privacy_prefs := COALESCE(NEW.privacy_prefs, '{}'::jsonb) || jsonb_build_object(
      'ads', false,
      'sharing', false,
      'recommendations', false,
      'external_analytics', false,
      'llm_training', false,
      'persona_export', false,
      'persona_share', false,
      'health_import', false,
      'records_embedding', false
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = '';
