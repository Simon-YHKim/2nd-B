-- INACTIVE FORWARD DRAFT. Reserve the next remote migration number immediately
-- before promotion. Requires 0191, 0193, 0194 and their prerequisites.
-- Server contract and dual-version service-consent Edge must be deployed and
-- canaried before publishing the PolaScope client. Existing email-v4 and
-- service-v1 clients retain their exact historical document tuple and writer.
-- Existing v4 LLM grants remain valid; no receipt is rewritten or backfilled.
-- This does not enable LLM, advertisements, or optional consent.
SET LOCAL lock_timeout = '10s';

DO $preflight$
BEGIN
  IF to_regprocedure('public.llm_service_consent_status(uuid)') IS NULL
    OR to_regprocedure('public.write_llm_service_consent(uuid,text,text,text,jsonb,text)') IS NULL
    OR to_regprocedure('public.llm_consent_current_decision(uuid)') IS NULL
    OR to_regprocedure('public.capture_llm_consent_provenance()') IS NULL
    OR NOT EXISTS(
      SELECT 1 FROM public.signup_consent_contract('email-v4') c
      WHERE c.consent_version='2026-09-07' AND c.policy_version='2026-09-26'
        AND c.terms_version='2026-08-16' AND c.confirmation_eligible
    )
    OR NOT EXISTS(
      SELECT 1 FROM pg_catalog.pg_constraint
      WHERE conrelid='public.llm_consent_receipts'::regclass
        AND conname='llm_consent_receipts_contract_revision_check'
    ) THEN
    RAISE EXCEPTION 'polascope_consent_prerequisite_not_ready' USING ERRCODE='55000';
  END IF;
END
$preflight$;

CREATE OR REPLACE FUNCTION public.signup_consent_contract(p_revision text)
RETURNS TABLE (
  consent_version text,
  policy_version text,
  terms_version text,
  confirmation_eligible boolean
)
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $contract$
  SELECT contract.consent_version, contract.policy_version,
         contract.terms_version, contract.confirmation_eligible
  FROM (VALUES
    ('email-v2'::text, '2026-08-16'::text, '2026-08-30'::text, '2026-08-16'::text, true),
    ('complete-profile-v1'::text, '2026-08-16'::text, '2026-08-30'::text, '2026-08-16'::text, false),
    ('email-v3'::text, '2026-09-07'::text, '2026-09-07'::text, '2026-08-16'::text, true),
    ('email-v4'::text, '2026-09-07'::text, '2026-09-26'::text, '2026-08-16'::text, true),
    ('email-v5'::text, '2026-10-05'::text, '2026-10-05'::text, '2026-10-05'::text, true)
  ) AS contract(signup_revision, consent_version, policy_version, terms_version, confirmation_eligible)
  WHERE contract.signup_revision = p_revision
$contract$;

REVOKE ALL ON FUNCTION public.signup_consent_contract(text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.complete_verified_email_signup() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.complete_profile_signup_consent(
  text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean
) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.signup_consent_contract_status()
RETURNS TABLE (
  signup_revision text,
  consent_version text,
  policy_version text,
  terms_version text,
  confirmation_eligible boolean,
  confirmation_ready boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $status$
  SELECT revision.id, contract.consent_version, contract.policy_version,
         contract.terms_version, contract.confirmation_eligible,
         EXISTS (
           SELECT 1 FROM pg_catalog.pg_proc AS routine
           JOIN pg_catalog.pg_trigger AS hook ON hook.tgfoid = routine.oid
           WHERE routine.oid = 'public.complete_verified_email_signup()'::regprocedure
             AND routine.prosecdef
             AND position('public.signup_consent_contract' in routine.prosrc) > 0
             AND position('contract.confirmation_eligible IS TRUE' in routine.prosrc) > 0
             AND hook.tgrelid = 'auth.users'::regclass
             AND hook.tgname = 'trg_complete_verified_email_signup'
             AND hook.tgenabled IN ('O', 'A') AND hook.tgtype = 17
             AND NOT hook.tgisinternal
             AND NOT pg_catalog.has_function_privilege('anon', routine.oid, 'EXECUTE')
             AND NOT pg_catalog.has_function_privilege('authenticated', routine.oid, 'EXECUTE')
             AND NOT pg_catalog.has_function_privilege('service_role', routine.oid, 'EXECUTE')
         )
  FROM (VALUES ('email-v2'), ('complete-profile-v1'), ('email-v3'), ('email-v4'), ('email-v5')) AS revision(id)
  CROSS JOIN LATERAL public.signup_consent_contract(revision.id) AS contract
$status$;

REVOKE ALL ON FUNCTION public.signup_consent_contract_status() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.signup_consent_contract_status() TO anon,authenticated;

ALTER TABLE public.llm_consent_receipts
  DROP CONSTRAINT llm_consent_receipts_contract_revision_check;
ALTER TABLE public.llm_consent_receipts
  ADD CONSTRAINT llm_consent_receipts_contract_revision_check
  CHECK (contract_revision IN ('email-v2','complete-profile-v1','email-v3','email-v4','email-v5'));

CREATE OR REPLACE FUNCTION public.capture_llm_consent_provenance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  consent_records_owner name;
  matched_revision text;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(relation.relowner)
    INTO consent_records_owner
    FROM pg_catalog.pg_class relation
   WHERE relation.oid = 'public.consent_records'::pg_catalog.regclass;

  IF consent_records_owner IS NULL
     OR current_user IS DISTINCT FROM consent_records_owner THEN
    RETURN NEW;
  END IF;

  SELECT candidate.revision
    INTO matched_revision
    FROM (
      VALUES
        ('email-v5'::text, 1),
        ('email-v4'::text, 2),
        ('email-v3'::text, 3),
        ('email-v2'::text, 4),
        ('complete-profile-v1'::text, 5)
    ) AS candidate(revision, priority)
    CROSS JOIN LATERAL public.signup_consent_contract(candidate.revision) AS contract
   -- Provenance identifies the server writer, not a positive decision. A
   -- trusted negative event must supersede its older positive receipt too.
   WHERE NEW.consent_version = contract.consent_version
     AND NEW.policy_version = contract.policy_version
     AND NEW.terms_version = contract.terms_version
     AND pg_catalog.jsonb_typeof(NEW.purposes) = 'array'
     AND NEW.purposes @> '["service"]'::jsonb
   ORDER BY candidate.priority
   LIMIT 1;

  IF matched_revision IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.llm_consent_receipts (
    consent_record_id,
    user_id,
    contract_revision
  ) VALUES (
    NEW.id,
    NEW.user_id,
    matched_revision
  )
  ON CONFLICT (consent_record_id) DO NOTHING;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.capture_llm_consent_provenance() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.llm_consent_current_decision(p_user_id uuid)
RETURNS TABLE(allowed boolean,token text) LANGUAGE sql STABLE SET search_path = '' AS $$
    WITH latest_service AS (
      SELECT c.id, provenance.state_revision, provenance.contract_revision,
             COALESCE(provenance.optional_consents_since,c.created_at) AS optional_since,
             c.user_id,
             c.required_ack,
             c.llm_processing_ack,
             c.overseas_transfer_ack,
             c.sensitive_data_ack,
             c.safety_notice_ack,
             c.consent_version,
             c.terms_version,
             c.policy_version,
             c.optional_consents,
             c.created_at
        FROM public.consent_records c
        JOIN public.llm_consent_receipts provenance
          ON provenance.consent_record_id = c.id
         AND provenance.user_id = c.user_id
       WHERE c.user_id = p_user_id
         AND pg_catalog.jsonb_typeof(c.purposes) = 'array'
         AND c.purposes @> '["service"]'::jsonb
       ORDER BY provenance.receipt_order DESC
       LIMIT 1
    ),
    current_contract AS (
      SELECT revision.id AS contract_revision, contract.consent_version,
             contract.policy_version,
             contract.terms_version
        FROM (VALUES ('email-v4'::text), ('email-v5'::text)) AS revision(id)
        CROSS JOIN LATERAL public.signup_consent_contract(revision.id) AS contract
       WHERE contract.confirmation_eligible IS TRUE
    ),
    relevant_prefs AS (
      SELECT k.pref_key FROM latest_service c
      CROSS JOIN LATERAL public.llm_consent_relevant_prefs(c.optional_consents) k
    )
    SELECT c.required_ack IS TRUE
       AND c.llm_processing_ack IS TRUE
       AND c.overseas_transfer_ack IS TRUE
       AND c.sensitive_data_ack IS TRUE
       AND c.safety_notice_ack IS TRUE
       AND c.consent_version = contract.consent_version
       AND c.policy_version = contract.policy_version
       AND c.terms_version = contract.terms_version
       AND pg_catalog.jsonb_typeof(c.optional_consents) = 'object'
       AND u.account_status IS NOT DISTINCT FROM 'active'
       AND pg_catalog.jsonb_typeof(u.privacy_prefs) = 'object'
       AND NOT EXISTS (
         SELECT 1
           FROM relevant_prefs r
          WHERE u.privacy_prefs -> r.pref_key IS DISTINCT FROM 'true'::jsonb
             OR COALESCE((
               SELECT cc.event_type IS NOT DISTINCT FROM 'revoke'
                 FROM public.consent_changes cc
                WHERE cc.user_id = c.user_id
                  AND cc.pref_key = r.pref_key
                  AND cc.created_at >= c.optional_since
                ORDER BY cc.created_at DESC, cc.id DESC
                LIMIT 1
             ), false)
       )
      , encode(sha256(convert_to(c.id::text||':'||c.state_revision::text,'UTF8')),'hex')

      FROM latest_service c
      JOIN public.users u ON u.id = c.user_id
      JOIN current_contract contract ON contract.contract_revision = c.contract_revision
  ;
$$;
REVOKE ALL ON FUNCTION public.llm_consent_current_decision(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.llm_service_consent_status_v2(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  profile public.users%ROWTYPE;
  prior record;
  eligible boolean;
  profile_age int;
  expected_tier text;
  decision jsonb;
  state text;
  change_token text;
BEGIN
  IF p_user_id IS NULL OR public.billing_request_role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'llm_service_consent_forbidden' USING ERRCODE='42501';
  END IF;
  -- Deletion's exclusive owner fence comes first. Auth -> public profile is
  -- also the signup writer's lock order; receipt locks always follow profile.
  PERFORM pg_advisory_xact_lock_shared(hashtextextended(p_user_id::text,260913));
  PERFORM 1 FROM auth.users u WHERE u.id=p_user_id AND u.deleted_at IS NULL
    AND u.email_confirmed_at IS NOT NULL FOR SHARE;
  IF NOT FOUND OR EXISTS(SELECT 1 FROM public.account_deletion_tombstones WHERE user_id=p_user_id) THEN
    RAISE EXCEPTION 'llm_service_consent_account_unavailable' USING ERRCODE='42501';
  END IF;
  SELECT * INTO profile FROM public.users WHERE id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'llm_service_consent_profile_unavailable' USING ERRCODE='42501'; END IF;
  profile_age := extract(year FROM age(current_date,profile.birth_date));
  expected_tier := CASE WHEN profile_age>=18 THEN 'adult' WHEN profile_age>=14 THEN 'minor_self' END;
  eligible := COALESCE(profile.account_status='active' AND profile.birth_date>=date '1900-01-01'
    AND profile.birth_date<=current_date AND expected_tier IS NOT NULL
    AND profile.minor_tier=expected_tier,false);
  SELECT p.consent_record_id,p.state_revision,p.service_action,c.llm_processing_ack
    INTO prior FROM public.llm_consent_receipts p JOIN public.consent_records c ON c.id=p.consent_record_id
    WHERE p.user_id=p_user_id ORDER BY p.receipt_order DESC LIMIT 1 FOR SHARE OF p,c;
  decision := public.effective_llm_consent_snapshot_v2(p_user_id,false);
  state := CASE WHEN prior.consent_record_id IS NULL THEN 'uncovered'
    WHEN prior.service_action='revoke' AND prior.llm_processing_ack IS FALSE THEN 'revoked'
    WHEN (decision->>'allowed')::boolean THEN 'granted' ELSE 'blocked' END;
  change_token := encode(sha256(convert_to(jsonb_build_array('service-v2',p_user_id,
    prior.consent_record_id,prior.state_revision,profile.birth_date,profile.minor_tier,
    profile.account_status,'2026-10-05','2026-10-05','2026-10-05')::text,'UTF8')),'hex');
  RETURN jsonb_build_object('contract_revision','service-v2','consent_version','2026-10-05',
    'policy_version','2026-10-05','terms_version','2026-10-05','state',state,
    'change_token',change_token,'can_grant',eligible);
END $$;
REVOKE ALL ON FUNCTION public.llm_service_consent_status_v2(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.llm_service_consent_status_v2(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.write_llm_service_consent(
  p_user_id uuid,p_contract_revision text,p_expected_change_token text,
  p_action text,p_required_acks jsonb,p_locale text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  current_status jsonb;
  prior public.consent_records%ROWTYPE;
  prior_optional_since timestamptz;
  profile public.users%ROWTYPE;
  new_id uuid;
  record_age_band text;
  record_minor_tier text;
BEGIN
  -- status performs the role, confirmed identity, deletion and row-lock checks.
  -- The legacy status call checks role, owner, deletion fence and row locks.
  current_status := public.llm_service_consent_status(p_user_id);
  IF p_contract_revision = 'service-v2' THEN
    current_status := public.llm_service_consent_status_v2(p_user_id);
  ELSIF p_contract_revision IS DISTINCT FROM 'service-v1' THEN
    RAISE EXCEPTION 'llm_service_consent_contract_changed' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.signup_consent_contract(
      CASE WHEN p_contract_revision='service-v2' THEN 'email-v5' ELSE 'email-v4' END
    ) c
    WHERE c.consent_version=current_status->>'consent_version'
      AND c.policy_version=current_status->>'policy_version'
      AND c.terms_version=current_status->>'terms_version'
      AND c.confirmation_eligible
  ) THEN
    RAISE EXCEPTION 'llm_service_consent_contract_changed' USING ERRCODE='22023';
  END IF;
  IF p_expected_change_token IS NULL OR p_expected_change_token !~ '^[0-9a-f]{64}$'
    OR p_expected_change_token IS DISTINCT FROM current_status->>'change_token' THEN
    RAISE EXCEPTION 'llm_service_consent_changed' USING ERRCODE='40001';
  END IF;
  IF p_action IS NULL OR p_action NOT IN ('grant','revoke')
    OR p_locale IS NULL OR p_locale NOT IN ('en','ko','es','pt','id')
    OR p_required_acks IS NULL
    OR (p_action='grant' AND p_required_acks IS DISTINCT FROM
      '{"service":true,"llmProcessing":true,"overseasTransfer":true,"sensitiveData":true,"safetyNotice":true}'::jsonb)
    OR (p_action='revoke' AND p_required_acks IS DISTINCT FROM '{}'::jsonb) THEN
    RAISE EXCEPTION 'llm_service_consent_invalid_input' USING ERRCODE='22023';
  END IF;
  SELECT * INTO profile FROM public.users WHERE id=p_user_id;
  SELECT c.* INTO prior FROM public.consent_records c JOIN public.llm_consent_receipts p ON p.consent_record_id=c.id
    WHERE p.user_id=p_user_id ORDER BY p.receipt_order DESC LIMIT 1;
  SELECT COALESCE(p.optional_consents_since,prior.created_at) INTO prior_optional_since
    FROM public.llm_consent_receipts p WHERE p.consent_record_id=prior.id;
  IF (p_action='grant' OR prior.id IS NULL) AND (current_status->>'can_grant')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'llm_service_consent_ineligible' USING ERRCODE='42501';
  END IF;
  record_age_band := CASE WHEN p_action='revoke' AND prior.id IS NOT NULL THEN prior.age_band ELSE profile.minor_tier END;
  record_minor_tier := CASE WHEN p_action='revoke' AND prior.id IS NOT NULL THEN prior.minor_tier ELSE profile.minor_tier END;
  INSERT INTO public.consent_records(user_id,age_band,minor_tier,consent_version,policy_version,terms_version,
    purposes,required_ack,optional_consents,llm_processing_ack,overseas_transfer_ack,sensitive_data_ack,safety_notice_ack,locale)
  VALUES(p_user_id,record_age_band,record_minor_tier,
    current_status->>'consent_version',current_status->>'policy_version',current_status->>'terms_version','["service"]',
    CASE WHEN p_action='grant' THEN true ELSE COALESCE(prior.required_ack,false) END,
    COALESCE(prior.optional_consents,'{}'::jsonb),p_action='grant',
    CASE WHEN p_action='grant' THEN true ELSE COALESCE(prior.overseas_transfer_ack,false) END,
    CASE WHEN p_action='grant' THEN true ELSE COALESCE(prior.sensitive_data_ack,false) END,
    CASE WHEN p_action='grant' THEN true ELSE COALESCE(prior.safety_notice_ack,false) END,p_locale)
  RETURNING id INTO new_id;
  UPDATE public.llm_consent_receipts SET service_action=p_action,optional_consents_since=prior_optional_since
    WHERE consent_record_id=new_id AND user_id=p_user_id;
  IF NOT FOUND THEN
    -- A disabled/misowned provenance trigger must roll the entire event back.
    RAISE EXCEPTION 'llm_service_consent_provenance_missing' USING ERRCODE='55000';
  END IF;
  RETURN (CASE WHEN p_contract_revision='service-v2'
    THEN public.llm_service_consent_status_v2(p_user_id)
    ELSE public.llm_service_consent_status(p_user_id) END)||jsonb_build_object('created',true);
END $$;
REVOKE ALL ON FUNCTION public.write_llm_service_consent(uuid,text,text,text,jsonb,text)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.write_llm_service_consent(uuid,text,text,text,jsonb,text) TO service_role;

DO $verify$
BEGIN
  IF (SELECT count(*) FROM public.signup_consent_contract_status()) <> 5
    OR NOT EXISTS(
      SELECT 1 FROM public.signup_consent_contract_status()
      WHERE signup_revision='email-v5' AND consent_version='2026-10-05'
        AND policy_version='2026-10-05' AND terms_version='2026-10-05'
        AND confirmation_eligible AND confirmation_ready
    )
    OR NOT EXISTS(
      SELECT 1 FROM public.signup_consent_contract('email-v4') c
      WHERE c.consent_version='2026-09-07' AND c.policy_version='2026-09-26'
        AND c.terms_version='2026-08-16' AND c.confirmation_eligible
    )
    OR has_function_privilege('anon','public.llm_service_consent_status_v2(uuid)','EXECUTE')
    OR has_function_privilege('authenticated','public.llm_service_consent_status_v2(uuid)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.llm_service_consent_status_v2(uuid)','EXECUTE')
    OR has_function_privilege('anon','public.write_llm_service_consent(uuid,text,text,text,jsonb,text)','EXECUTE')
    OR has_function_privilege('authenticated','public.write_llm_service_consent(uuid,text,text,text,jsonb,text)','EXECUTE')
  THEN
    RAISE EXCEPTION 'polascope_consent_contract_not_ready' USING ERRCODE='55000';
  END IF;
END
$verify$;
NOTIFY pgrst, 'reload schema';
