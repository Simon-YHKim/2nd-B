-- 0149_atomic_complete_profile_signup_consent.sql
--
-- complete-profile currently creates public.users and then appends the signup
-- consent receipt in a second client request. A timeout or rejected second
-- request can therefore leave a permanent profile with no receipt; retries see
-- the profile and skip the receipt forever. This migration adds one
-- authenticated, server-owned transaction for both writes.
--
-- Server-owned means the caller cannot choose user id, email, age tier, judge
-- mode, or document versions. The RPC takes only what the visible screen
-- actually collected. Existing profiles are never rewritten: the only repair
-- allowed is an explicit complete-profile submission for a profile whose
-- consent ledger is completely empty. Any other history fails closed so this
-- signup repair cannot become a hidden policy-reconsent path.
--
-- Existing authenticated clients can still append their own purpose-scoped
-- consent_records, including the legacy signup shape. An exact row therefore
-- proves the current ledger shape, not a private writer provenance. This
-- migration does not widen that existing trust boundary. After every supported
-- client uses this RPC, a separate migration must reject direct canonical
-- service-signup inserts without breaking health/import/recommendation receipts.
--
-- This forward migration also extracts the frozen signup revision contract and
-- forward-replaces 0148's email-confirmation trigger to consume it. The full
-- trigger body remains in this file, so 0149 has no runtime dependency on a
-- function body hidden in an earlier migration; migration order still remains
-- 0148 -> 0149.
--
-- Rollback is deliberately procedural, not a copied *_down.sql. First stop any
-- client that calls complete_profile_signup_consent, then drop that RPC, reapply
-- 0148_verified_email_signup_consent_ledger.sql to remove the trigger's helper
-- dependency, and only then drop signup_consent_contract. Copying 0148's full
-- trigger into a rollback file would silently drift whenever the active draft
-- changes.

BEGIN;

SET LOCAL lock_timeout = '10s';

-- Frozen, append-only mapping from a client surface revision to the exact
-- documents rendered by that surface. email-v2 may provision from the auth
-- confirmation trigger. complete-profile-v1 may only be used by the explicit
-- authenticated RPC below.
CREATE OR REPLACE FUNCTION public.signup_consent_contract(p_revision text)
RETURNS TABLE (
  consent_version text,
  policy_version text,
  terms_version text,
  confirmation_eligible boolean
)
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $contract$
  SELECT
    contract.consent_version,
    contract.policy_version,
    contract.terms_version,
    contract.confirmation_eligible
  FROM (
    VALUES
      ('email-v2'::text, '2026-08-16'::text, '2026-08-30'::text, '2026-08-16'::text, true),
      ('complete-profile-v1'::text, '2026-08-16'::text, '2026-08-30'::text, '2026-08-16'::text, false)
  ) AS contract(
    signup_revision,
    consent_version,
    policy_version,
    terms_version,
    confirmation_eligible
  )
  WHERE contract.signup_revision = p_revision
$contract$;

-- Forward replacement of 0148. Keep the confirmation-only semantics, strict
-- JSON booleans, age floor, and inserted-profile ownership claim intact while
-- moving revision/version lookup to the shared frozen contract.
CREATE OR REPLACE FUNCTION public.complete_verified_email_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  ledger_consent_version text;
  ledger_policy_version text;
  ledger_terms_version text;
  ledger_confirmation_eligible boolean;

  -- to_jsonb keeps this compatible with both Supabase auth schema revisions and
  -- the deliberately smaller CI auth.users stub.
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
  expected_purposes jsonb;
  expected_optional_consents jsonb;
BEGIN
  -- Only the first unconfirmed -> confirmed transition may provision a row.
  IF OLD.email_confirmed_at IS NOT NULL OR NEW.email_confirmed_at IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT
    contract.consent_version,
    contract.policy_version,
    contract.terms_version,
    contract.confirmation_eligible
  INTO
    ledger_consent_version,
    ledger_policy_version,
    ledger_terms_version,
    ledger_confirmation_eligible
  FROM public.signup_consent_contract(signup_meta ->> 'signup_flow') AS contract
  WHERE contract.confirmation_eligible IS TRUE;

  IF NOT FOUND OR ledger_confirmation_eligible IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  IF jsonb_typeof(signup_meta -> 'signup_birth_date') IS DISTINCT FROM 'string'
     OR signup_meta ->> 'signup_birth_date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
    RETURN NEW;
  END IF;

  BEGIN
    signup_birth_date := (signup_meta ->> 'signup_birth_date')::date;
    -- PostgreSQL boolean casts accept text such as yes/on/1. Confirmation
    -- metadata must contain the JSON literals emitted by the pinned client.
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

  IF NOT (service_ack AND llm_ack AND overseas_ack AND sensitive_ack AND safety_ack) THEN
    RETURN NEW;
  END IF;

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

  signup_locale := CASE WHEN signup_meta ->> 'signup_locale' = 'ko' THEN 'ko' ELSE 'en' END;
  signup_tier := CASE WHEN signup_age < 18 THEN 'minor_self' ELSE 'adult' END;
  expected_purposes := CASE
    WHEN marketing_ack THEN '["service", "marketing"]'::jsonb
    ELSE '["service"]'::jsonb
  END;
  expected_optional_consents := jsonb_build_object('marketing', marketing_ack);

  -- The RPC below takes the same per-user transaction lock. The auth UPDATE
  -- already owns its row lock; this advisory lock also serializes the trigger
  -- against an explicit complete-profile call without exposing auth schema
  -- details to the caller.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('signup-consent:' || NEW.id::text, 0)
  );

  -- Only a profile inserted by this confirmation may receive its paired
  -- receipt. A pre-existing profile is repaired only by the explicit RPC after
  -- the user has seen and submitted the complete-profile consent screen.
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
    expected_purposes,
    service_ack,
    expected_optional_consents,
    llm_ack,
    overseas_ack,
    sensitive_ack,
    safety_ack,
    signup_locale
  FROM inserted_user
  WHERE id = NEW.id
    AND NOT EXISTS (
      SELECT 1
      FROM public.consent_records AS receipt
      WHERE receipt.user_id = NEW.id
        AND receipt.consent_version = ledger_consent_version
        AND receipt.policy_version = ledger_policy_version
        AND receipt.terms_version = ledger_terms_version
        AND receipt.age_band = signup_tier
        AND receipt.minor_tier = signup_tier
        AND receipt.required_ack IS TRUE
        AND receipt.llm_processing_ack IS TRUE
        AND receipt.overseas_transfer_ack IS TRUE
        AND receipt.sensitive_data_ack IS TRUE
        AND receipt.safety_notice_ack IS TRUE
        AND receipt.purposes = expected_purposes
        AND receipt.optional_consents = expected_optional_consents
    );

  RETURN NEW;
END;
$$;

-- PostgREST may coerce JSON strings such as "yes" into boolean parameters.
-- These acknowledgements remain the authenticated person's assertions; strict
-- JSON-literal enforcement is possible only in the auth-metadata trigger. The
-- identity, document tuple, stored age tier, and judge mode remain server-owned.
CREATE OR REPLACE FUNCTION public.complete_profile_signup_consent(
  p_birth_date text,
  p_locale text,
  p_display_name text,
  p_signup_revision text,
  p_service_ack boolean,
  p_llm_processing_ack boolean,
  p_overseas_transfer_ack boolean,
  p_sensitive_data_ack boolean,
  p_safety_notice_ack boolean,
  p_marketing_ack boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '10s'
AS $$
DECLARE
  caller_id uuid := auth.uid();
  auth_email text;
  auth_email_confirmed_at timestamptz;
  auth_deleted_at timestamptz;
  contract_consent_version text;
  contract_policy_version text;
  contract_terms_version text;
  contract_confirmation_eligible boolean;
  profile public.users%ROWTYPE;
  profile_existed boolean := false;
  profile_created boolean := false;
  consent_created boolean := false;
  repaired boolean := false;
  already_complete boolean := false;
  candidate_birth_date date;
  candidate_display_name text;
  current_age int;
  current_tier text;
  history_count bigint := 0;
  exact_receipt_exists boolean := false;
  marketing_mismatch_exists boolean := false;
  expected_purposes jsonb;
  expected_optional_consents jsonb;
  opposite_purposes jsonb;
  opposite_optional_consents jsonb;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'signup_consent_auth_required';
  END IF;

  -- Match the confirmation trigger's unavoidable lock order: its auth.users
  -- UPDATE owns the row before the AFTER trigger can take the advisory lock.
  -- FOR SHARE also keeps confirmation/deletion state stable for this one-time
  -- transaction instead of reading through a concurrent non-key auth update.
  SELECT auth_user.email, auth_user.email_confirmed_at, auth_user.deleted_at
  INTO auth_email, auth_email_confirmed_at, auth_deleted_at
  FROM auth.users AS auth_user
  WHERE auth_user.id = caller_id
  FOR SHARE;

  IF NOT FOUND OR auth_deleted_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'signup_consent_auth_user_unavailable';
  END IF;
  IF auth_email_confirmed_at IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'signup_consent_email_unconfirmed';
  END IF;
  IF auth_email IS NULL OR btrim(auth_email) = '' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'signup_consent_email_missing';
  END IF;

  -- This covers the no-public.users-row state that a row lock cannot cover and
  -- serializes both server writers after the shared auth-row lock order.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('signup-consent:' || caller_id::text, 0)
  );

  IF p_signup_revision IS DISTINCT FROM 'complete-profile-v1' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'signup_consent_revision_invalid';
  END IF;

  SELECT
    contract.consent_version,
    contract.policy_version,
    contract.terms_version,
    contract.confirmation_eligible
  INTO
    contract_consent_version,
    contract_policy_version,
    contract_terms_version,
    contract_confirmation_eligible
  FROM public.signup_consent_contract(p_signup_revision) AS contract;

  IF NOT FOUND OR contract_confirmation_eligible IS NOT FALSE THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'signup_consent_revision_invalid';
  END IF;

  IF p_locale IS NULL OR p_locale NOT IN ('en', 'ko') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'signup_consent_locale_invalid';
  END IF;
  IF p_service_ack IS NOT TRUE
     OR p_llm_processing_ack IS NOT TRUE
     OR p_overseas_transfer_ack IS NOT TRUE
     OR p_sensitive_data_ack IS NOT TRUE
     OR p_safety_notice_ack IS NOT TRUE THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'signup_consent_required_ack_missing';
  END IF;
  IF p_marketing_ack IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'signup_consent_marketing_ack_missing';
  END IF;

  expected_purposes := CASE
    WHEN p_marketing_ack THEN '["service", "marketing"]'::jsonb
    ELSE '["service"]'::jsonb
  END;
  expected_optional_consents := jsonb_build_object('marketing', p_marketing_ack);
  opposite_purposes := CASE
    WHEN p_marketing_ack THEN '["service"]'::jsonb
    ELSE '["service", "marketing"]'::jsonb
  END;
  opposite_optional_consents := jsonb_build_object('marketing', NOT p_marketing_ack);

  SELECT user_profile.*
  INTO profile
  FROM public.users AS user_profile
  WHERE user_profile.id = caller_id
  FOR UPDATE;
  profile_existed := FOUND;

  IF NOT profile_existed THEN
    IF p_birth_date IS NULL OR p_birth_date !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'signup_consent_birth_date_invalid';
    END IF;

    BEGIN
      candidate_birth_date := p_birth_date::date;
    EXCEPTION
      WHEN invalid_text_representation OR datetime_field_overflow THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'signup_consent_birth_date_invalid';
    END;

    IF candidate_birth_date <= DATE '1900-01-01' OR candidate_birth_date > current_date THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'signup_consent_birth_date_invalid';
    END IF;

    current_age := date_part('year', age(current_date, candidate_birth_date))::int;
    IF current_age < 14 THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'signup_consent_age_below_floor';
    END IF;

    candidate_display_name := NULLIF(btrim(p_display_name), '');
    IF candidate_display_name IS NOT NULL AND char_length(candidate_display_name) > 40 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'signup_consent_display_name_too_long';
    END IF;

    BEGIN
      INSERT INTO public.users (id, email, birth_date, locale, display_name)
      VALUES (caller_id, auth_email, candidate_birth_date, p_locale, candidate_display_name)
      ON CONFLICT (id) DO NOTHING
      RETURNING * INTO profile;
    EXCEPTION
      WHEN unique_violation THEN
        -- Do not leak the conflicting constraint or row through PostgREST.
        RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'signup_consent_email_in_use';
    END;

    IF FOUND THEN
      profile_created := true;
    ELSE
      -- A legacy direct writer may have won the id race without taking our
      -- advisory lock. Re-read its server-stored row and continue under lock.
      SELECT user_profile.*
      INTO profile
      FROM public.users AS user_profile
      WHERE user_profile.id = caller_id
      FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'signup_consent_profile_race_lost';
      END IF;
    END IF;
  END IF;

  -- From here onward only server-stored profile values determine age/tier and
  -- judge mode. p_birth_date and p_display_name are intentionally ignored for
  -- pre-existing profiles, even when they are malformed or different.
  IF profile.birth_date IS NULL
     OR profile.birth_date <= DATE '1900-01-01'
     OR profile.birth_date > current_date THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'signup_consent_profile_birth_date_invalid';
  END IF;

  current_age := date_part('year', age(current_date, profile.birth_date))::int;
  IF current_age < 14 THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'signup_consent_profile_age_below_floor';
  END IF;
  current_tier := CASE WHEN current_age < 18 THEN 'minor_self' ELSE 'adult' END;

  IF profile.account_status IS DISTINCT FROM 'active'
     OR profile.minor_tier IS DISTINCT FROM current_tier THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'signup_consent_age_transition_required';
  END IF;

  SELECT
    count(*),
    COALESCE(bool_or(
      receipt.consent_version = contract_consent_version
      AND receipt.policy_version = contract_policy_version
      AND receipt.terms_version = contract_terms_version
      AND receipt.age_band = current_tier
      AND receipt.minor_tier = current_tier
      AND receipt.required_ack IS TRUE
      AND receipt.llm_processing_ack IS TRUE
      AND receipt.overseas_transfer_ack IS TRUE
      AND receipt.sensitive_data_ack IS TRUE
      AND receipt.safety_notice_ack IS TRUE
      AND receipt.purposes = expected_purposes
      AND receipt.optional_consents = expected_optional_consents
      AND receipt.locale IN ('en', 'ko')
    ), false),
    COALESCE(bool_or(
      receipt.consent_version = contract_consent_version
      AND receipt.policy_version = contract_policy_version
      AND receipt.terms_version = contract_terms_version
      AND receipt.age_band = current_tier
      AND receipt.minor_tier = current_tier
      AND receipt.required_ack IS TRUE
      AND receipt.llm_processing_ack IS TRUE
      AND receipt.overseas_transfer_ack IS TRUE
      AND receipt.sensitive_data_ack IS TRUE
      AND receipt.safety_notice_ack IS TRUE
      AND receipt.purposes = opposite_purposes
      AND receipt.optional_consents = opposite_optional_consents
      AND receipt.locale IN ('en', 'ko')
    ), false)
  INTO history_count, exact_receipt_exists, marketing_mismatch_exists
  FROM public.consent_records AS receipt
  WHERE receipt.user_id = caller_id;

  -- Seeing both optional choices is a consent transition, even when one row is
  -- otherwise an exact retry. Only the dedicated grant/revoke flow may resolve
  -- that history; this profile-completion RPC must not silently pick one side.
  IF marketing_mismatch_exists THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'marketing_change_requires_dedicated_flow';
  END IF;

  IF exact_receipt_exists THEN
    already_complete := true;
    RETURN jsonb_build_object(
      'profile_created', profile_created,
      'consent_created', false,
      'repaired', false,
      'already_complete', already_complete,
      'judge_mode', profile.judge_mode,
      'display_name', profile.display_name
    );
  END IF;

  IF history_count > 0 THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'signup_consent_history_conflict';
  END IF;

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
  ) VALUES (
    caller_id,
    current_tier,
    current_tier,
    contract_consent_version,
    contract_policy_version,
    contract_terms_version,
    expected_purposes,
    p_service_ack,
    expected_optional_consents,
    p_llm_processing_ack,
    p_overseas_transfer_ack,
    p_sensitive_data_ack,
    p_safety_notice_ack,
    p_locale
  );

  consent_created := true;
  repaired := NOT profile_created;

  RETURN jsonb_build_object(
    'profile_created', profile_created,
    'consent_created', consent_created,
    'repaired', repaired,
    'already_complete', already_complete,
    'judge_mode', profile.judge_mode,
    'display_name', profile.display_name
  );
END;
$$;

-- Supabase default function privileges can grant new routines to anon and
-- authenticated. Close every surface explicitly, then reopen only the one RPC
-- for authenticated callers. The trigger continues to run through its binding.
REVOKE ALL ON FUNCTION public.signup_consent_contract(text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.complete_verified_email_signup()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.complete_profile_signup_consent(
  text, text, text, text, boolean, boolean, boolean, boolean, boolean, boolean
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_profile_signup_consent(
  text, text, text, text, boolean, boolean, boolean, boolean, boolean, boolean
) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
