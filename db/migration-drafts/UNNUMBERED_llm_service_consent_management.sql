-- INACTIVE DRAFT. Requires the signup AdMob contract, provenance/snapshot v2,
-- and account-deletion fence drafts. Reserve a migration number only after
-- approval and checking the remote catalog. This is a fresh draft dependency,
-- not a forward replacement for already-deployed overloads.
--
-- Only the service-consent Edge may call these service-role RPCs. It verifies
-- the bearer identity and supplies that user's UUID; no caller-chosen subject,
-- metadata, age or document versions reach this writer. Before any RPC it must
-- check the same off/collect/enforce mode used by every provider proxy. Off
-- rejects management requests without a DB call. Collect enforces every new
-- trusted receipt but temporarily permits never-covered accounts. Enforce has
-- no legacy fallback. Direct authenticated calls cannot bypass the Edge mode.
--
-- No optional preferences or optional event history are changed. No historical
-- rows are backfilled. Revocation changes only the LLM-processing ACK and never
-- creates positive ACKs for an uncovered account. CAS requires a fresh displayed
-- contract/status; each explicit submission appends an immutable canonical row.
SET LOCAL lock_timeout = '10s';

DO $$ BEGIN
  IF to_regclass('public.account_deletion_tombstones') IS NULL
    OR to_regprocedure('public.effective_llm_consent_snapshot_v2(uuid,boolean)') IS NULL
    OR NOT EXISTS(SELECT 1 FROM public.signup_consent_contract('email-v4') c
      WHERE c.consent_version='2026-09-07' AND c.policy_version='2026-09-26'
        AND c.terms_version='2026-08-16' AND c.confirmation_eligible) THEN
    RAISE EXCEPTION 'llm_service_consent_contract_changed' USING ERRCODE='22023';
  END IF;
END $$;

-- The private marker separates an explicit withdrawal from another invalid
-- receipt for coverage reporting. It is not exposed as a general client flag.
ALTER TABLE public.llm_consent_receipts ADD COLUMN service_action text
  CHECK (service_action IN ('grant','revoke'));

CREATE FUNCTION public.llm_service_consent_status(p_user_id uuid)
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
  change_token := encode(sha256(convert_to(jsonb_build_array('service-v1',p_user_id,
    prior.consent_record_id,prior.state_revision,profile.birth_date,profile.minor_tier,
    profile.account_status,'2026-09-07','2026-09-26','2026-08-16')::text,'UTF8')),'hex');
  RETURN jsonb_build_object('contract_revision','service-v1','consent_version','2026-09-07',
    'policy_version','2026-09-26','terms_version','2026-08-16','state',state,
    'change_token',change_token,'can_grant',eligible);
END $$;
REVOKE ALL ON FUNCTION public.llm_service_consent_status(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.llm_service_consent_status(uuid) TO service_role;

CREATE FUNCTION public.write_llm_service_consent(
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
  current_status := public.llm_service_consent_status(p_user_id);
  IF p_contract_revision IS DISTINCT FROM 'service-v1'
    OR NOT EXISTS(SELECT 1 FROM public.signup_consent_contract('email-v4') c
      WHERE c.consent_version='2026-09-07' AND c.policy_version='2026-09-26'
        AND c.terms_version='2026-08-16' AND c.confirmation_eligible) THEN
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
  VALUES(p_user_id,record_age_band,record_minor_tier,'2026-09-07','2026-09-26','2026-08-16','["service"]',
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
  RETURN public.llm_service_consent_status(p_user_id)||jsonb_build_object('created',true);
END $$;
REVOKE ALL ON FUNCTION public.write_llm_service_consent(uuid,text,text,text,jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.write_llm_service_consent(uuid,text,text,text,jsonb,text) TO service_role;

-- Read-only aggregate over the full active cohort, never a caller-selected
-- empty list. Intentionally withdrawn accounts are distinct from uncovered or
-- invalid receipts. No identifiers, receipt contents or tokens are returned.
CREATE FUNCTION public.llm_service_consent_coverage()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb;
BEGIN
  IF public.billing_request_role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'llm_service_consent_forbidden' USING ERRCODE='42501';
  END IF;
  WITH cohort AS (
    SELECT u.id FROM public.users u JOIN auth.users a ON a.id=u.id
    WHERE u.account_status='active' AND a.deleted_at IS NULL
      AND NOT EXISTS(SELECT 1 FROM public.account_deletion_tombstones t WHERE t.user_id=u.id)
  ), states AS (
    SELECT CASE WHEN p.consent_record_id IS NULL THEN 'uncovered'
      WHEN p.service_action='revoke' AND c.llm_processing_ack IS FALSE THEN 'revoked'
      WHEN d.allowed THEN 'granted' ELSE 'blocked' END AS state
    FROM cohort u LEFT JOIN LATERAL (SELECT * FROM public.llm_consent_receipts r
      WHERE r.user_id=u.id ORDER BY r.receipt_order DESC LIMIT 1) p ON true
    LEFT JOIN public.consent_records c ON c.id=p.consent_record_id
    LEFT JOIN LATERAL public.llm_consent_current_decision(u.id) d ON true
  )
  SELECT jsonb_build_object('active_accounts',count(*),
    'granted_accounts',count(*) FILTER(WHERE state='granted'),
    'intentionally_revoked_accounts',count(*) FILTER(WHERE state='revoked'),
    'uncovered_accounts',count(*) FILTER(WHERE state='uncovered'),
    'blocked_accounts',count(*) FILTER(WHERE state='blocked'),
    'ready_for_enforce',count(*) FILTER(WHERE state IN ('uncovered','blocked'))=0) INTO result FROM states;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.llm_service_consent_coverage() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.llm_service_consent_coverage() TO service_role;

DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_proc f WHERE f.oid IN (
      'public.llm_service_consent_status(uuid)'::regprocedure,
      'public.write_llm_service_consent(uuid,text,text,text,jsonb,text)'::regprocedure,
      'public.llm_service_consent_coverage()'::regprocedure)
    AND (has_function_privilege('anon',f.oid,'EXECUTE') OR has_function_privilege('authenticated',f.oid,'EXECUTE')
      OR NOT has_function_privilege('service_role',f.oid,'EXECUTE')
      OR f.proowner<>(SELECT relowner FROM pg_class WHERE oid='public.consent_records'::regclass))) THEN
    RAISE EXCEPTION 'llm_service_consent_acl_failed' USING ERRCODE='42501';
  END IF;
END $$;
