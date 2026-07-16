-- 0086_require_email_confirmation.sql
-- Replace the Sprint-0 email auto-confirm bypass with a real confirmation
-- boundary. Custom SMTP MUST be configured before this migration is applied
-- to production; Supabase's built-in sender is not a production mail service.
--
-- The app collects DOB + consent before auth.signUp() and places only those
-- explicit values in auth user metadata. On the first email-confirmed
-- transition, this trigger atomically creates public.users and the immutable
-- consent record. Invalid, incomplete, or direct-API metadata is ignored: the
-- confirmed account then follows the existing /complete-profile fallback.

DROP TRIGGER IF EXISTS trg_auth_autoconfirm_email ON auth.users;
DROP FUNCTION IF EXISTS public.auth_autoconfirm_email();

CREATE OR REPLACE FUNCTION public.complete_verified_email_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  -- to_jsonb keeps the migration compatible with the CI auth.users stub,
  -- which intentionally models only the columns older migrations require.
  signup_meta jsonb := COALESCE(to_jsonb(NEW) -> 'raw_user_meta_data', '{}'::jsonb);
  signup_birth_date date;
  signup_locale text;
  signup_age int;
  service_ack boolean;
  llm_ack boolean;
  overseas_ack boolean;
  sensitive_ack boolean;
  marketing_ack boolean;
  signup_tier text;
BEGIN
  -- Only the first unconfirmed -> confirmed transition can provision a row.
  IF OLD.email_confirmed_at IS NOT NULL OR NEW.email_confirmed_at IS NULL THEN
    RETURN NEW;
  END IF;

  IF signup_meta ->> 'signup_flow' IS DISTINCT FROM 'email-v1' THEN
    RETURN NEW;
  END IF;

  BEGIN
    signup_birth_date := (signup_meta ->> 'signup_birth_date')::date;
    service_ack := COALESCE((signup_meta ->> 'signup_consent_service')::boolean, false);
    llm_ack := COALESCE((signup_meta ->> 'signup_consent_llm_processing')::boolean, false);
    overseas_ack := COALESCE((signup_meta ->> 'signup_consent_overseas_transfer')::boolean, false);
    sensitive_ack := COALESCE((signup_meta ->> 'signup_consent_sensitive_data')::boolean, false);
    marketing_ack := COALESCE((signup_meta ->> 'signup_consent_marketing')::boolean, false);
  EXCEPTION
    WHEN invalid_text_representation OR datetime_field_overflow THEN
      RETURN NEW;
  END;

  -- Never infer a required acknowledgement. Incomplete metadata falls back to
  -- /complete-profile, which collects the values again from the user.
  IF NOT (service_ack AND llm_ack AND overseas_ack AND sensitive_ack) THEN
    RETURN NEW;
  END IF;

  -- Malformed or incomplete metadata must never roll back the auth.users
  -- confirmation UPDATE. Leave the confirmed account profile-less so the
  -- existing /complete-profile route can collect a valid value instead.
  IF NEW.email IS NULL
     OR btrim(NEW.email) = ''
     OR signup_birth_date IS NULL
     OR signup_birth_date <= DATE '1900-01-01'
     OR signup_birth_date > current_date THEN
    RETURN NEW;
  END IF;

  signup_age := date_part('year', age(current_date, signup_birth_date))::int;
  IF signup_age < 14 THEN
    RETURN NEW;
  END IF;

  signup_locale := CASE
    WHEN signup_meta ->> 'signup_locale' = 'ko' THEN 'ko'
    ELSE 'en'
  END;
  signup_tier := CASE WHEN signup_age < 18 THEN 'minor_self' ELSE 'adult' END;

  INSERT INTO public.users (id, email, birth_date, judge_mode, locale)
  VALUES (NEW.id, NEW.email, signup_birth_date, false, signup_locale)
  -- A stale profile row can collide on either id or the unique email. Email
  -- confirmation must still succeed; the signed-in fallback can resolve the
  -- profile instead of stranding the auth account in an unconfirmed state.
  ON CONFLICT DO NOTHING;

  INSERT INTO public.consent_records (
    user_id,
    age_band,
    minor_tier,
    consent_version,
    policy_version,
    terms_version,
    purposes,
    required_ack,
    optional_consents,
    llm_processing_ack,
    overseas_transfer_ack,
    sensitive_data_ack,
    locale
  )
  SELECT
    NEW.id,
    signup_tier,
    signup_tier,
    '2026-06-02',
    '2026-06-02',
    '2026-06-02',
    CASE
      WHEN marketing_ack THEN '["service", "marketing"]'::jsonb
      ELSE '["service"]'::jsonb
    END,
    service_ack,
    jsonb_build_object('marketing', marketing_ack),
    llm_ack,
    overseas_ack,
    sensitive_ack,
    signup_locale
  WHERE EXISTS (SELECT 1 FROM public.users WHERE id = NEW.id)
    AND NOT EXISTS (
      SELECT 1
      FROM public.consent_records
      WHERE user_id = NEW.id
        AND consent_version = '2026-06-02'
        AND required_ack = true
    );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_verified_email_signup() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_complete_verified_email_signup ON auth.users;
CREATE TRIGGER trg_complete_verified_email_signup
  AFTER UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.complete_verified_email_signup();
