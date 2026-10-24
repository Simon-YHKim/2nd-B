-- T10 slice 1. UNNUMBERED, never auto-applied. No provider/record-body read path.
-- The empty contract is intentional: no approved five-line original or document
-- version has been supplied. Q-261018-45 postpones T65 and forbids its claims.
-- Number -> Relay -> real-model QA -> flag,
-- with approved copy/DPIA/privacy policy and T71 checks BEFORE activation.
-- Reuse the retained consent ledger: no new user table or deletion/export class.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE public.consent_records
  ADD COLUMN record_body_order bigint GENERATED ALWAYS AS IDENTITY,
  ADD COLUMN record_body_trusted boolean NOT NULL DEFAULT false;
REVOKE ALL ON SEQUENCE public.consent_records_record_body_order_seq FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX consent_records_record_body_latest ON public.consent_records(user_id,record_body_order DESC)
  WHERE record_body_trusted;

-- A reviewed future migration must supply the exact approved document tuple.
-- There is no env/client/GUC override and no guessed consent version.
CREATE FUNCTION public.record_body_consent_contract()
RETURNS TABLE(consent_version text,policy_version text,terms_version text)
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT NULL::text,NULL::text,NULL::text WHERE false
$$;
REVOKE ALL ON FUNCTION public.record_body_consent_contract() FROM PUBLIC,anon,authenticated,service_role;

-- This purpose has its own provenance. Do not add it to llm_consent_receipts:
-- that ledger's latest row represents mandatory SERVICE consent, not this choice.
CREATE FUNCTION public.capture_record_body_consent() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE owner_name name;
BEGIN
  IF NEW.purposes ? 'llm_record_body' OR NEW.record_body_trusted THEN
    SELECT pg_catalog.pg_get_userbyid(relowner) INTO owner_name FROM pg_catalog.pg_class
      WHERE oid='public.consent_records'::regclass;
    IF current_user IS DISTINCT FROM owner_name THEN
      RAISE EXCEPTION 'record_body_trusted_writer_required' USING ERRCODE='42501';
    END IF;
    IF NEW.purposes IS DISTINCT FROM '["llm_record_body"]'::jsonb
      OR pg_catalog.jsonb_typeof(NEW.optional_consents->'llm_record_body') IS DISTINCT FROM 'boolean' THEN
      RAISE EXCEPTION 'record_body_invalid_receipt';
    END IF;
    NEW.record_body_trusted := true;
  ELSE
    NEW.record_body_trusted := false;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.capture_record_body_consent() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER capture_record_body_consent BEFORE INSERT ON public.consent_records
  FOR EACH ROW EXECUTE FUNCTION public.capture_record_body_consent();

CREATE FUNCTION public.record_body_adult(p_birth_date date,p_minor_tier text,p_status text)
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT COALESCE(p_minor_tier='adult' AND p_status='active' AND p_birth_date IS NOT NULL
    AND p_birth_date <= (CURRENT_DATE - interval '18 years')::date,false)
$$;
REVOKE ALL ON FUNCTION public.record_body_adult(date,text,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.record_body_consent_decision(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT COALESCE((SELECT public.record_body_adult(u.birth_date,u.minor_tier,u.account_status)
    AND u.privacy_prefs->'llm_record_body'='true'::jsonb
    AND c.optional_consents->'llm_record_body'='true'::jsonb
    AND c.sensitive_data_ack AND c.llm_processing_ack AND c.overseas_transfer_ack
    AND EXISTS(SELECT 1 FROM public.record_body_consent_contract() contract
      WHERE (contract.consent_version,contract.policy_version,contract.terms_version)=
        (c.consent_version,c.policy_version,c.terms_version))
    AND (SELECT allowed FROM public.llm_consent_current_decision(p_user_id))
    FROM public.users u JOIN LATERAL (SELECT * FROM public.consent_records r
      WHERE r.user_id=u.id AND r.record_body_trusted ORDER BY r.record_body_order DESC LIMIT 1) c ON true
    WHERE u.id=p_user_id),false)
$$;
REVOKE ALL ON FUNCTION public.record_body_consent_decision(uuid) FROM PUBLIC,anon,authenticated,service_role;

-- Enforce age even against direct/service-role preference writes. No enable from
-- a plain settings save; only a trusted, current grant can introduce this value.
CREATE FUNCTION public.clamp_record_body_preference() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE granted boolean;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed'
    AND (NEW.privacy_prefs->'llm_record_body'='true'::jsonb
      OR (TG_OP='UPDATE' AND OLD.privacy_prefs->'llm_record_body'='true'::jsonb)) THEN
    RAISE EXCEPTION 'record_body_requires_read_committed';
  END IF;
  SELECT c.optional_consents->'llm_record_body'='true'::jsonb
    AND EXISTS(SELECT 1 FROM public.record_body_consent_contract() v
      WHERE (v.consent_version,v.policy_version,v.terms_version)=(c.consent_version,c.policy_version,c.terms_version))
    INTO granted FROM public.consent_records c WHERE c.user_id=NEW.id AND c.record_body_trusted
    ORDER BY c.record_body_order DESC LIMIT 1;
  IF NOT public.record_body_adult(NEW.birth_date,NEW.minor_tier,NEW.account_status)
    OR granted IS NOT TRUE THEN
    NEW.privacy_prefs := COALESCE(NEW.privacy_prefs,'{}'::jsonb)||'{"llm_record_body":false}'::jsonb;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.clamp_record_body_preference() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER zzzz_record_body_preference BEFORE INSERT OR UPDATE OF privacy_prefs,birth_date,minor_tier,account_status
  ON public.users FOR EACH ROW EXECUTE FUNCTION public.clamp_record_body_preference();

CREATE FUNCTION public.invalidate_record_body_consent() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE subject uuid; prior public.consent_records%ROWTYPE;
BEGIN
  IF TG_TABLE_NAME='users' THEN
    IF OLD.privacy_prefs->'llm_record_body' IS NOT DISTINCT FROM NEW.privacy_prefs->'llm_record_body'
      AND OLD.birth_date IS NOT DISTINCT FROM NEW.birth_date
      AND OLD.minor_tier IS NOT DISTINCT FROM NEW.minor_tier
      AND OLD.account_status IS NOT DISTINCT FROM NEW.account_status THEN RETURN NEW; END IF;
    subject := NEW.id;
    IF OLD.privacy_prefs->'llm_record_body'='true'::jsonb
      AND NEW.privacy_prefs->'llm_record_body' IS DISTINCT FROM 'true'::jsonb THEN
      SELECT * INTO prior FROM public.consent_records WHERE user_id=subject AND record_body_trusted
        ORDER BY record_body_order DESC LIMIT 1;
      IF prior.optional_consents->'llm_record_body'='true'::jsonb THEN
        INSERT INTO public.consent_records(user_id,age_band,minor_tier,consent_version,policy_version,terms_version,
          purposes,optional_consents,locale)
        VALUES(subject,CASE WHEN NEW.minor_tier='adult' THEN 'adult' ELSE 'minor_self' END,NEW.minor_tier,
          prior.consent_version,prior.policy_version,prior.terms_version,'["llm_record_body"]',
          '{"llm_record_body":false}',prior.locale);
      END IF;
    END IF;
  ELSE
    IF NOT NEW.record_body_trusted THEN RETURN NEW; END IF;
    subject := NEW.user_id;
    PERFORM 1 FROM public.users WHERE id=subject FOR UPDATE;
  END IF;
  -- Separate purpose must invalidate an in-flight service snapshot even when
  -- the original service receipt did not list this optional key (0193 does not).
  UPDATE public.llm_consent_receipts SET state_revision=state_revision+1
    WHERE consent_record_id=(SELECT consent_record_id FROM public.llm_consent_receipts
      WHERE user_id=subject ORDER BY receipt_order DESC LIMIT 1);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.invalidate_record_body_consent() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER invalidate_record_body_user AFTER UPDATE OF privacy_prefs,birth_date,minor_tier,account_status ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.invalidate_record_body_consent();
CREATE TRIGGER invalidate_record_body_event AFTER INSERT ON public.consent_records
  FOR EACH ROW EXECUTE FUNCTION public.invalidate_record_body_consent();

CREATE FUNCTION public.set_record_body_consent(p_grant boolean,p_expected_receipt uuid,p_version text,p_sensitive_ack boolean,p_locale text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE subject uuid := auth.uid(); u public.users%ROWTYPE; prior public.consent_records%ROWTYPE;
  contract record; receipt uuid;
BEGIN
  IF subject IS NULL OR public.billing_request_role() IS DISTINCT FROM 'authenticated' THEN
    RAISE EXCEPTION 'record_body_auth_required' USING ERRCODE='42501';
  END IF;
  IF current_setting('transaction_isolation') <> 'read committed' THEN RAISE EXCEPTION 'record_body_requires_read_committed'; END IF;
  SELECT * INTO u FROM public.users WHERE id=subject FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'record_body_auth_required'; END IF;
  SELECT * INTO prior FROM public.consent_records WHERE user_id=subject AND record_body_trusted
    ORDER BY record_body_order DESC LIMIT 1;
  IF prior.id IS DISTINCT FROM p_expected_receipt THEN RAISE EXCEPTION 'record_body_consent_conflict'; END IF;
  IF p_grant IS NULL OR p_locale IS NULL OR p_locale NOT IN ('ko','en','es','pt','id') THEN
    RAISE EXCEPTION 'record_body_invalid_choice';
  END IF;
  IF p_grant THEN
    IF NOT public.record_body_adult(u.birth_date,u.minor_tier,u.account_status) THEN RAISE EXCEPTION 'record_body_adult_required'; END IF;
    SELECT * INTO contract FROM public.record_body_consent_contract();
    IF NOT FOUND THEN RAISE EXCEPTION 'record_body_not_available'; END IF;
    IF p_version IS DISTINCT FROM contract.consent_version OR p_sensitive_ack IS NOT TRUE THEN RAISE EXCEPTION 'record_body_ack_required'; END IF;
    IF (SELECT allowed FROM public.llm_consent_current_decision(subject)) IS NOT TRUE THEN RAISE EXCEPTION 'record_body_service_consent_required'; END IF;
  ELSE
    IF prior.id IS NULL THEN
      UPDATE public.users SET privacy_prefs=COALESCE(privacy_prefs,'{}')||'{"llm_record_body":false}' WHERE id=subject;
      RETURN NULL;
    END IF;
    SELECT prior.consent_version,prior.policy_version,prior.terms_version INTO contract;
  END IF;
  INSERT INTO public.consent_records(user_id,age_band,minor_tier,consent_version,policy_version,terms_version,
    purposes,optional_consents,llm_processing_ack,overseas_transfer_ack,sensitive_data_ack,locale)
  VALUES(subject,CASE WHEN u.minor_tier='adult' THEN 'adult' ELSE 'minor_self' END,u.minor_tier,
    contract.consent_version,contract.policy_version,contract.terms_version,'["llm_record_body"]',
    jsonb_build_object('llm_record_body',p_grant),p_grant,p_grant,p_grant,p_locale)
  RETURNING id INTO receipt;
  UPDATE public.users SET privacy_prefs=COALESCE(privacy_prefs,'{}')||jsonb_build_object('llm_record_body',p_grant) WHERE id=subject;
  RETURN receipt;
END $$;
REVOKE ALL ON FUNCTION public.set_record_body_consent(boolean,uuid,text,boolean,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.set_record_body_consent(boolean,uuid,text,boolean,text) TO authenticated;

CREATE FUNCTION public.record_body_consent_snapshot(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE permitted boolean; service_token text; receipt uuid;
BEGIN
  IF public.billing_request_role() IS DISTINCT FROM 'service_role' THEN RETURN '{"allowed":false,"token":null}'::jsonb; END IF;
  IF current_setting('transaction_isolation') <> 'read committed' THEN RAISE EXCEPTION 'record_body_requires_read_committed'; END IF;
  PERFORM 1 FROM public.users WHERE id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN '{"allowed":false,"token":null}'::jsonb; END IF;
  permitted := public.record_body_consent_decision(p_user_id);
  IF NOT permitted THEN RETURN '{"allowed":false,"token":null}'::jsonb; END IF;
  SELECT token INTO service_token FROM public.llm_consent_current_decision(p_user_id);
  SELECT id INTO receipt FROM public.consent_records WHERE user_id=p_user_id AND record_body_trusted ORDER BY record_body_order DESC LIMIT 1;
  RETURN jsonb_build_object('allowed',true,'token',encode(sha256(convert_to(receipt::text||':'||service_token,'UTF8')),'hex'));
END $$;
REVOKE ALL ON FUNCTION public.record_body_consent_snapshot(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.record_body_consent_snapshot(uuid) TO service_role;
