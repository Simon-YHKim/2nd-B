-- 0148_verified_email_signup_consent_ledger.sql
--
-- 0086 moved email sign-up provisioning behind the verified-email boundary,
-- but its consent insert froze all three document versions at 2026-06-02.
-- The client writer has since moved forward and 0130 added the separately
-- collected safety-notice acknowledgement, while the trigger still ignored it.
-- New confirmed-email accounts therefore received an incomplete, stale ledger
-- row even though auth metadata carried the acknowledgement the user selected.
--
-- Replace only the trigger function body. The existing trigger remains bound to
-- this same signature, so there is no gap where a confirmation can bypass it.
-- Versions stay server-authoritative constants: auth user metadata is supplied
-- by the signing-up client and must never choose which published documents the
-- server says were shown. The email-v2 revision identifies the exact consent
-- shape and document tuple bundled with that client. Older email-v1 clients
-- fail closed to /complete-profile instead of receiving a newer policy stamp.
-- A repository test pins these constants to src/lib/supabase/consent.ts and
-- forces a new client revision plus forward migration when they move.
--
-- Existing consent rows remain immutable. In particular, do not backfill old
-- safety_notice_ack NULL values: 0130 defines NULL as "never asked", which is
-- materially different from false. This repair applies only to confirmations
-- whose first unconfirmed -> confirmed transition happens after 0148 is live.

BEGIN;

CREATE OR REPLACE FUNCTION public.complete_verified_email_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  -- These constants describe the documents currently rendered by the client.
  -- They are not read from raw_user_meta_data because that object is controlled
  -- by the signing-up client.
  ledger_consent_version constant text := '2026-08-16';
  ledger_policy_version  constant text := '2026-08-30';
  ledger_terms_version   constant text := '2026-08-16';
  ledger_signup_revision constant text := 'email-v2';

  -- to_jsonb keeps the function compatible with the CI auth.users stub and
  -- Supabase auth schema revisions that add columns independently of this repo.
  signup_meta jsonb := COALESCE(to_jsonb(NEW) -> 'raw_user_meta_data', '{}'::jsonb);
  signup_birth_date date;
  signup_locale text;
  signup_age int;
  service_ack boolean;
  llm_ack boolean;
  overseas_ack boolean;
  sensitive_ack boolean;
  safety_ack boolean;
  marketing_ack boolean;
  signup_tier text;
BEGIN
  -- Only the first unconfirmed -> confirmed transition can provision a row.
  IF OLD.email_confirmed_at IS NOT NULL OR NEW.email_confirmed_at IS NULL THEN
    RETURN NEW;
  END IF;

  IF signup_meta ->> 'signup_flow' IS DISTINCT FROM ledger_signup_revision THEN
    RETURN NEW;
  END IF;

  IF jsonb_typeof(signup_meta -> 'signup_birth_date') IS DISTINCT FROM 'string'
     OR signup_meta ->> 'signup_birth_date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
    RETURN NEW;
  END IF;

  BEGIN
    signup_birth_date := (signup_meta ->> 'signup_birth_date')::date;
    -- Accept only JSON boolean literals. PostgreSQL text-to-boolean casts also
    -- accept values such as "yes", "on", and "1", which are not acknowledgements
    -- emitted by the app and must not be normalized into consent.
    service_ack := COALESCE((signup_meta -> 'signup_consent_service') = 'true'::jsonb, false);
    llm_ack := COALESCE((signup_meta -> 'signup_consent_llm_processing') = 'true'::jsonb, false);
    overseas_ack := COALESCE((signup_meta -> 'signup_consent_overseas_transfer') = 'true'::jsonb, false);
    sensitive_ack := COALESCE((signup_meta -> 'signup_consent_sensitive_data') = 'true'::jsonb, false);
    safety_ack := COALESCE((signup_meta -> 'signup_consent_safety_notice') = 'true'::jsonb, false);
    marketing_ack := COALESCE((signup_meta -> 'signup_consent_marketing') = 'true'::jsonb, false);
  EXCEPTION
    WHEN invalid_text_representation OR datetime_field_overflow THEN
      RETURN NEW;
  END;

  -- Never infer a required acknowledgement. Missing safety metadata is most
  -- important for sign-ups created before 0130: leave those accounts profile-
  -- less so the existing /complete-profile fallback can ask honestly.
  IF NOT (service_ack AND llm_ack AND overseas_ack AND sensitive_ack AND safety_ack) THEN
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

  -- The users primary key is the atomic provisioning claim. A stale profile
  -- may collide on id or unique email, but it must not gain a consent event
  -- from this confirmation. Only an INSERT that returns NEW.id can write the
  -- paired ledger row.
  WITH inserted_user AS (
    INSERT INTO public.users (id, email, birth_date, judge_mode, locale)
    VALUES (NEW.id, NEW.email, signup_birth_date, false, signup_locale)
    ON CONFLICT DO NOTHING
    RETURNING id
  )
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
    safety_notice_ack,
    locale
  )
  SELECT
    NEW.id,
    signup_tier,
    signup_tier,
    ledger_consent_version,
    ledger_policy_version,
    ledger_terms_version,
    CASE
      WHEN marketing_ack THEN '["service", "marketing"]'::jsonb
      ELSE '["service"]'::jsonb
    END,
    service_ack,
    jsonb_build_object('marketing', marketing_ack),
    llm_ack,
    overseas_ack,
    sensitive_ack,
    safety_ack,
    signup_locale
  FROM inserted_user
  WHERE id = NEW.id
    AND NOT EXISTS (
      SELECT 1
      FROM public.consent_records
      WHERE user_id = NEW.id
        AND consent_version = ledger_consent_version
        AND policy_version = ledger_policy_version
        AND terms_version = ledger_terms_version
        AND required_ack = true
        AND safety_notice_ack = true
    );

  RETURN NEW;
END;
$$;

-- CREATE OR REPLACE retains the old ACL, but restate the deny-list so this
-- forward migration independently satisfies the DEFINER grant guard.
REVOKE ALL ON FUNCTION public.complete_verified_email_signup() FROM PUBLIC, anon, authenticated;

COMMIT;
