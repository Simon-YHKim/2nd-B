-- G2-02/03/04. Additive rollout: old Edge keeps its 0236 dispatch/finish RPCs.
-- No new ledger/table/state. 0181 client ACLs and 0237 erasure ownership stand.
SET LOCAL lock_timeout = '10s';

CREATE FUNCTION public.dashboard_generation_audit_attempt(
  p_user_id uuid,p_run_id uuid,p_model text,p_effort text,p_prompt_hash text,p_crisis boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=off AS $$
DECLARE r public.dashboard_generation_runs%ROWTYPE; c jsonb;
BEGIN
  c := public.dashboard_generation_guard(p_user_id);
  IF c IS NULL THEN RETURN false; END IF;
  IF p_model IS NULL OR p_model !~ '^claude-sonnet-[a-z0-9-]{1,80}$'
    OR p_effort IS NULL OR p_effort NOT IN ('low','medium','high','xhigh','max')
    OR p_prompt_hash IS NULL OR p_prompt_hash !~ '^[0-9a-f]{1,8}$'
    OR p_crisis IS NULL THEN RAISE EXCEPTION 'dashboard_audit_input' USING ERRCODE='22023'; END IF;
  SELECT * INTO r FROM public.dashboard_generation_runs WHERE id=p_run_id AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND OR r.status<>'pending' OR r.created_at<=now()-interval '3 minutes'
    OR r.consent_token<>c->>'token' THEN RETURN false; END IF;
  IF NOT p_crisis AND NOT public.dashboard_generation_dispatch(p_user_id,p_run_id) THEN RETURN false; END IF;
  -- INSERT failure rolls back dispatch. A lost RPC response never grants a
  -- replay permission: the existing terminal dispatch rule remains unchanged.
  INSERT INTO public.ai_audit_log(id,user_id,purpose,prompt_hash,output_hash,model_used,
    vertex_backend,safety_zone,latency_ms,event_source,reasoning_vendor,reasoning_effort,key_combo,outbox_event_id)
  VALUES(r.id,p_user_id,r.purpose,p_prompt_hash,'',p_model||CASE WHEN p_crisis THEN '+crisis' ELSE '+attempt' END,
    false,CASE WHEN p_crisis THEN 'red' ELSE 'green' END::public.safety_zone,0,'server_verified','claude',
    CASE WHEN NOT p_crisis THEN p_effort END,CASE WHEN NOT p_crisis THEN 'ANTHROPIC_API_KEY' END,'dashboard:'||r.id);
  IF p_crisis THEN
    UPDATE public.dashboard_generation_runs SET status='failed',output=NULL WHERE id=r.id;
  END IF;
  RETURN true;
END $$;

CREATE FUNCTION public.dashboard_generation_audit_result(
  p_user_id uuid,p_run_id uuid,p_output_hash text,p_outcome text,
  p_latency_ms integer,p_safety_zone text,p_total_tokens integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=off AS $$
DECLARE a public.ai_audit_log%ROWTYPE; model text;
BEGIN
  IF coalesce(nullif(current_setting('request.jwt.claim.role',true),''),
    nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'dashboard_forbidden' USING ERRCODE='42501';
  END IF;
  IF p_output_hash IS NULL OR p_output_hash !~ '^[0-9a-f]{1,8}$'
    OR p_outcome IS NULL OR (p_outcome NOT IN ('completed','transport_failed','invalid_response',
      'rejected_output','invalid_json','consent_withheld') AND p_outcome !~ '^http_[1-5][0-9]{2}$')
    OR p_latency_ms IS NULL OR p_latency_ms NOT BETWEEN 0 AND 3600000
    OR p_safety_zone IS NULL OR p_safety_zone NOT IN ('green','red')
    OR p_total_tokens<0 THEN RAISE EXCEPTION 'dashboard_audit_input' USING ERRCODE='22023'; END IF;
  SELECT * INTO a FROM public.ai_audit_log WHERE id=p_run_id AND user_id=p_user_id
    AND event_source='server_verified' AND outbox_event_id='dashboard:'||p_run_id FOR UPDATE;
  IF NOT FOUND OR a.model_used LIKE '%+crisis' THEN RETURN false; END IF;
  model := split_part(a.model_used,'+',1)||CASE WHEN p_outcome='completed' THEN '' ELSE '+'||p_outcome END;
  IF a.model_used NOT LIKE '%+attempt' THEN
    -- Same-row retry, like log_ai_audit_once: identical is a no-op; conflicting
    -- evidence must not overwrite the first result. One attempt stays one row.
    IF a.model_used IS DISTINCT FROM model OR a.output_hash IS DISTINCT FROM p_output_hash
      OR a.latency_ms IS DISTINCT FROM p_latency_ms OR a.safety_zone::text IS DISTINCT FROM p_safety_zone
      OR a.total_tokens IS DISTINCT FROM p_total_tokens THEN
      RAISE EXCEPTION 'dashboard_audit_conflict' USING ERRCODE='22023';
    END IF;
    RETURN true;
  END IF;
  -- Existing server norm: markConsentWithheld updates the same audit row.
  -- Preserve id/owner/prompt/purpose/model identity/effort/creation provenance.
  UPDATE public.ai_audit_log SET model_used=model,output_hash=p_output_hash,latency_ms=p_latency_ms,
    safety_zone=p_safety_zone::public.safety_zone,total_tokens=p_total_tokens WHERE id=a.id;
  RETURN true;
END $$;

-- Close the existing runs under their row locks in the writer's transaction.
-- Do not acquire users/receipt locks from this trigger: snapshot writers take
-- those first. A racing finish either precedes this purge or sees failed.
-- Re-grant never reopens old runs; keys and the 48h quota ledger are retained.
CREATE FUNCTION public.lock_dashboard_consent_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=off AS $$
BEGIN
  -- 0193's AFTER INSERT invalidator acquires users before receipt revisions.
  -- Take that lock before any AFTER hook can lock a run, regardless of names.
  PERFORM 1 FROM public.users WHERE id=NEW.user_id FOR UPDATE;
  RETURN NEW;
END $$;
CREATE TRIGGER dashboard_consent_event_lock BEFORE INSERT ON public.consent_changes
  FOR EACH ROW EXECUTE FUNCTION public.lock_dashboard_consent_event();

CREATE FUNCTION public.invalidate_dashboard_consent() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=off AS $$
DECLARE subjects uuid[];
BEGIN
  IF TG_TABLE_NAME='users' THEN
    subjects := ARRAY[OLD.id,NEW.id];
  ELSIF TG_TABLE_NAME='consent_changes' THEN
    subjects := ARRAY[]::uuid[];
    IF TG_OP<>'INSERT' AND ((OLD.pref_key='recommendations' AND OLD.event_type='revoke') OR EXISTS(
      SELECT 1 FROM public.consent_records c JOIN public.llm_consent_receipts p ON p.consent_record_id=c.id
      WHERE p.user_id=OLD.user_id AND c.optional_consents->OLD.pref_key='true'::jsonb
        AND OLD.pref_key IN (SELECT pref_key FROM public.llm_consent_relevant_prefs(c.optional_consents))
        AND p.consent_record_id=(SELECT consent_record_id FROM public.llm_consent_receipts WHERE user_id=OLD.user_id ORDER BY receipt_order DESC LIMIT 1))) THEN
      subjects := array_append(subjects,OLD.user_id);
    END IF;
    IF TG_OP<>'DELETE' AND ((NEW.pref_key='recommendations' AND NEW.event_type='revoke') OR EXISTS(
      SELECT 1 FROM public.consent_records c JOIN public.llm_consent_receipts p ON p.consent_record_id=c.id
      WHERE p.user_id=NEW.user_id AND c.optional_consents->NEW.pref_key='true'::jsonb
        AND NEW.pref_key IN (SELECT pref_key FROM public.llm_consent_relevant_prefs(c.optional_consents))
        AND p.consent_record_id=(SELECT consent_record_id FROM public.llm_consent_receipts WHERE user_id=NEW.user_id ORDER BY receipt_order DESC LIMIT 1))) THEN
      subjects := array_append(subjects,NEW.user_id);
    END IF;
  ELSE
    IF TG_OP='INSERT' THEN subjects := ARRAY[NEW.user_id];
    ELSIF TG_OP='DELETE' THEN subjects := ARRAY[OLD.user_id];
    ELSE subjects := ARRAY[OLD.user_id,NEW.user_id]; END IF;
  END IF;
  UPDATE public.dashboard_generation_runs SET output=NULL,status='failed'
    WHERE user_id=ANY(subjects) AND (status<>'failed' OR output IS NOT NULL);
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER zz_dashboard_privacy_changed AFTER UPDATE OF privacy_prefs,account_status,birth_date,minor_tier ON public.users
  FOR EACH ROW WHEN ((OLD.privacy_prefs,OLD.account_status,OLD.birth_date,OLD.minor_tier)
    IS DISTINCT FROM (NEW.privacy_prefs,NEW.account_status,NEW.birth_date,NEW.minor_tier)
    AND (NEW.privacy_prefs->'recommendations' IS DISTINCT FROM 'true'::jsonb
      OR NEW.account_status IS DISTINCT FROM 'active' OR NEW.minor_tier IS DISTINCT FROM 'adult'
      OR NEW.birth_date IS NULL OR NEW.birth_date>(current_date-interval '18 years')::date))
  EXECUTE FUNCTION public.invalidate_dashboard_consent();
-- A trusted new grant/revoke gets provenance from capture_llm_consent_provenance.
-- Metadata/state changes include all service-v1..v4 and optional-pref writers.
CREATE TRIGGER dashboard_receipt_changed AFTER INSERT OR UPDATE OF user_id,consent_record_id,
  state_revision,optional_consents_since,service_action,contract_revision OR DELETE ON public.llm_consent_receipts
  FOR EACH ROW EXECUTE FUNCTION public.invalidate_dashboard_consent();
-- Client ledgers are append-only. Cover permitted server repairs too, excluding
-- retention's ip_hash/ua_hash-only scrub (0063), which changes no consent.
CREATE TRIGGER dashboard_consent_record_changed AFTER UPDATE OF user_id,purposes,required_ack,
  llm_processing_ack,overseas_transfer_ack,sensitive_data_ack,safety_notice_ack,optional_consents,
  consent_version,policy_version,terms_version,created_at OR DELETE ON public.consent_records
  FOR EACH ROW EXECUTE FUNCTION public.invalidate_dashboard_consent();
CREATE TRIGGER zz_dashboard_consent_event_changed AFTER INSERT OR UPDATE OF user_id,pref_key,event_type,created_at
  OR DELETE ON public.consent_changes FOR EACH ROW EXECUTE FUNCTION public.invalidate_dashboard_consent();

-- Backfill existing withdrawn/uncovered accounts, without deleting attempts or
-- recreating consent. llm_consent_current_decision is the canonical v2 predicate.
UPDATE public.dashboard_generation_runs g SET output=NULL,status='failed'
WHERE (g.status<>'failed' OR g.output IS NOT NULL) AND NOT EXISTS (
  SELECT 1 FROM public.users u JOIN auth.users a ON a.id=u.id
  CROSS JOIN LATERAL public.llm_consent_current_decision(u.id) c
  WHERE u.id=g.user_id AND u.privacy_prefs->'recommendations'='true'::jsonb
    AND u.account_status='active' AND u.minor_tier='adult'
    AND u.birth_date<=(current_date-interval '18 years')::date
    AND a.deleted_at IS NULL AND a.email_confirmed_at IS NOT NULL AND c.allowed IS TRUE AND c.token=g.consent_token
    AND NOT EXISTS(SELECT 1 FROM public.account_deletion_tombstones t WHERE t.user_id=u.id)
    AND NOT EXISTS(SELECT 1 FROM public.consent_changes cc WHERE cc.user_id=u.id
      AND cc.pref_key='recommendations' AND cc.event_type='revoke' AND cc.created_at>=g.created_at)
);

REVOKE ALL ON FUNCTION public.invalidate_dashboard_consent(),public.lock_dashboard_consent_event() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.dashboard_generation_audit_attempt(uuid,uuid,text,text,text,boolean),
  public.dashboard_generation_audit_result(uuid,uuid,text,text,integer,text,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.dashboard_generation_audit_attempt(uuid,uuid,text,text,text,boolean),
  public.dashboard_generation_audit_result(uuid,uuid,text,text,integer,text,integer) TO service_role;
