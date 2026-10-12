-- G2-06 / Q-261011-16: port the reviewed lease design from 8b74c3ea.
-- Apply only after deployed 0236/0238/0244/0245/0247 and 0248 (PR #2283).
-- Operations: separate approval + backup, apply this whole file atomically,
-- verify old Edge + new DB, then merge, schema gate, deploy new Edge, canary.
-- No existing migration is replaced. 0247 routine triggers stay installed.
-- Rollback is forward repair or previous Edge; retain leases and audit lineage.



CREATE FUNCTION public.dashboard_generation_eligibility(p_user_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=off AS $$
DECLARE c jsonb;
BEGIN
  IF coalesce(nullif(current_setting('request.jwt.claim.role',true),''),
    nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'dashboard_forbidden' USING ERRCODE='42501';
  END IF;
  -- Same deletion-fence ordering as 0194; all mutations below retain these locks.
  PERFORM pg_advisory_xact_lock_shared(hashtextextended(p_user_id::text,260913));
  PERFORM 1 FROM auth.users WHERE id=p_user_id FOR SHARE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  PERFORM 1 FROM public.users WHERE id=p_user_id FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_user_id
    AND deleted_at IS NULL AND email_confirmed_at IS NOT NULL)
    OR EXISTS(SELECT 1 FROM public.account_deletion_tombstones WHERE user_id=p_user_id)
    OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=p_user_id AND account_status='active'
    AND minor_tier='adult' AND birth_date <= (current_date-interval '18 years')::date
    AND privacy_prefs->'recommendations'='true'::jsonb) THEN RETURN NULL; END IF;
  c := public.effective_llm_consent_snapshot_v2(p_user_id,false);
  IF c->'allowed' IS DISTINCT FROM 'true'::jsonb OR coalesce(c->>'token','') !~ '^[a-f0-9]{64}$' THEN RETURN NULL; END IF;
  RETURN c;
END $$;

-- Conservative legacy defaults: absence of a token never authorizes recovery.
ALTER TABLE public.dashboard_generation_runs
  ADD COLUMN lease_token uuid,
  ADD COLUMN leased_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN dispatched_at timestamptz DEFAULT now();
ALTER TABLE public.dashboard_generation_runs DROP CONSTRAINT dashboard_generation_runs_status_check;
ALTER TABLE public.dashboard_generation_runs ADD CONSTRAINT dashboard_generation_runs_status_check
  CHECK(status IN ('pending','dispatched','ready','failed','pre_dispatch_failed','pre_dispatch_blocked'));


CREATE OR REPLACE FUNCTION public.purge_dashboard_generation() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path='' SET row_security=off AS $$
  -- Keep attempt rows at least 48h so midnight/travel cannot reopen a quota.
  UPDATE public.dashboard_generation_runs SET output=NULL,status='failed' WHERE expires_at<=now() AND output IS NOT NULL;
  DELETE FROM public.dashboard_generation_runs WHERE created_at<now()-interval '48 hours'
    AND (lease_token IS NULL OR leased_at<now()-interval '48 hours');
  INSERT INTO public.dashboard_generation_retention(singleton,last_purged_at) VALUES(true,clock_timestamp())
    ON CONFLICT(singleton) DO UPDATE SET last_purged_at=EXCLUDED.last_purged_at;
$$;

CREATE FUNCTION public.dashboard_generation_attempt_count(p_user_id uuid,p_purpose text,p_timezone text) RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' SET row_security=off AS $$
  -- Keep the bigint/threshold contract from the draft. For daily_note the
  -- effective count is max(local service-day count, UTC count - 1): >= 3 iff
  -- local >= 3 OR UTC >= 4. Other seats still count the calendar/UTC union.
  SELECT CASE WHEN p_purpose='daily_note' THEN greatest(
    count(*) FILTER (WHERE ((created_at AT TIME ZONE p_timezone)-interval '6 hours')::date
      =((now() AT TIME ZONE p_timezone)-interval '6 hours')::date),
    count(*) FILTER (WHERE (created_at AT TIME ZONE 'UTC')::date=(now() AT TIME ZONE 'UTC')::date)-1)
  ELSE count(*) FILTER (WHERE (created_at AT TIME ZONE p_timezone)::date=(now() AT TIME ZONE p_timezone)::date
    OR (created_at AT TIME ZONE 'UTC')::date=(now() AT TIME ZONE 'UTC')::date) END FROM (
    SELECT a.created_at FROM public.ai_audit_log a
      WHERE a.user_id=p_user_id AND a.purpose=p_purpose AND a.event_source='server_verified'
        AND a.outbox_event_id ~ ('^dashboard:[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}:'||a.id::text||'$')
    UNION ALL
    SELECT g.created_at FROM public.dashboard_generation_runs g
      WHERE g.user_id=p_user_id AND g.purpose=p_purpose AND g.lease_token IS NULL
  ) attempts;
$$;

CREATE OR REPLACE FUNCTION public.dashboard_generation_request(p_user_id uuid,p_action text,p_timezone text DEFAULT NULL,p_locale text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=off AS $$
DECLARE c jsonb; s public.dashboard_generation_settings%ROWTYPE; r public.dashboard_generation_runs%ROWTYPE;
  wall timestamp; slot text; slot_day date; v_purpose text; key text; source jsonb; v_source_hash text; expiry timestamptz; previous_note jsonb;
BEGIN
  IF p_action IS NULL OR p_action NOT IN ('open','summary','triage','hourly') THEN RAISE EXCEPTION 'dashboard_action' USING ERRCODE='22023'; END IF;
  c := public.dashboard_generation_guard(p_user_id);
  IF c IS NULL THEN RETURN jsonb_build_object('kind','denied'); END IF;
  IF NOT public.dashboard_generation_retention_ready() THEN RETURN jsonb_build_object('kind','denied'); END IF;
  -- Guard's owner row lock serializes quota and idempotency, including timezone edits.
  SELECT * INTO s FROM public.dashboard_generation_settings WHERE user_id=p_user_id;
  IF p_action <> 'hourly' THEN
    IF p_timezone IS NOT NULL AND NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=p_timezone) THEN
      RAISE EXCEPTION 'dashboard_timezone' USING ERRCODE='22023';
    END IF;
    IF p_locale IS NOT NULL AND p_locale NOT IN ('en','ko','es','pt','id') THEN RAISE EXCEPTION 'dashboard_locale' USING ERRCODE='22023'; END IF;
    IF s.user_id IS NULL AND p_timezone IS NULL THEN RETURN jsonb_build_object('kind','denied'); END IF;
    INSERT INTO public.dashboard_generation_settings(user_id,timezone,locale,last_active_at)
      VALUES(p_user_id,coalesce(p_timezone,s.timezone),coalesce(p_locale,s.locale,'en'),now())
      ON CONFLICT(user_id) DO UPDATE SET timezone=EXCLUDED.timezone,locale=EXCLUDED.locale,last_active_at=EXCLUDED.last_active_at
      RETURNING * INTO s;
  END IF;
  IF s.user_id IS NULL THEN RETURN jsonb_build_object('kind','denied'); END IF;
  wall := now() AT TIME ZONE s.timezone;
  slot := CASE WHEN extract(hour FROM wall)>=20 OR extract(hour FROM wall)<6 THEN 'evening'
    WHEN extract(hour FROM wall)>=13 THEN 'midday' ELSE 'morning' END;
  slot_day := wall::date - CASE WHEN extract(hour FROM wall)<6 THEN 1 ELSE 0 END;
  IF p_action='hourly' AND (extract(hour FROM wall) NOT IN (6,13,20) OR s.last_active_at<=now()-interval '7 days') THEN
    RETURN jsonb_build_object('kind','empty');
  END IF;
  v_purpose := CASE p_action WHEN 'summary' THEN 'day_summary' WHEN 'triage' THEN 'inbox_triage' ELSE 'daily_note' END;
  source := public.dashboard_generation_source(p_user_id,v_purpose,wall::date);
  v_source_hash := md5(source::text);
  -- Empty input wins over old attempts; keep the attempt ledger intact.
  IF jsonb_array_length(coalesce(source->'reminders',source->'inboxCandidates'))=0 THEN RETURN jsonb_build_object('kind','empty'); END IF;
  -- Only the read action may use a previous note. Its current consent and every
  -- evidence reference must survive; completed routines remain valid evidence.
  IF p_action='open' THEN
    SELECT jsonb_build_object('kind','ready','purpose','daily_note','slot',g.output->>'slot',
      'value',g.output,'source',source,'generatedAt',g.created_at,'previous',true)
    INTO previous_note FROM public.dashboard_generation_runs g
    WHERE g.user_id=p_user_id AND g.purpose='daily_note' AND g.status='ready'
      AND g.output IS NOT NULL AND g.expires_at>now() AND g.consent_token=c->>'token'
      AND jsonb_array_length(CASE WHEN jsonb_typeof(g.output->'basis_refs')='array'
        THEN g.output->'basis_refs' ELSE '[]'::jsonb END)>0
      AND jsonb_typeof(g.output->'reminder_suggestions')='array'
      AND NOT EXISTS (
        SELECT 1 FROM (
          SELECT value AS ref FROM jsonb_array_elements(CASE WHEN jsonb_typeof(g.output->'basis_refs')='array'
            THEN g.output->'basis_refs' ELSE '[]'::jsonb END)
          UNION ALL
          SELECT value->'source_ref' FROM jsonb_array_elements(CASE WHEN jsonb_typeof(g.output->'reminder_suggestions')='array'
            THEN g.output->'reminder_suggestions' ELSE '[]'::jsonb END)
        ) evidence WHERE NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(source->'reminders') candidate
          WHERE candidate->>'id'=evidence.ref->>'id'
            AND CASE WHEN candidate->>'kind'='routine' THEN 'routine' ELSE 'reminder' END=evidence.ref->>'kind'
        )
      )
    ORDER BY g.created_at DESC LIMIT 1 FOR SHARE OF g;
  END IF;
  key := CASE v_purpose WHEN 'daily_note' THEN slot_day::text||':'||slot
    WHEN 'day_summary' THEN floor(extract(epoch FROM now())/1800)::text
    ELSE wall::date::text||':'||v_source_hash END;
  expiry := CASE WHEN v_purpose='day_summary' THEN now()+interval '30 minutes' ELSE now()+interval '24 hours' END;
  IF v_purpose='day_summary' THEN
    SELECT * INTO r FROM public.dashboard_generation_runs g WHERE g.user_id=p_user_id AND g.purpose=v_purpose
      AND g.status='ready' AND g.expires_at>now() AND g.consent_token=c->>'token' AND g.source_hash=v_source_hash
      ORDER BY g.created_at DESC LIMIT 1;
    IF FOUND THEN RETURN jsonb_build_object('kind','ready','purpose',v_purpose,'slot',slot,'value',r.output,'source',source,'generatedAt',r.created_at,'previous',false); END IF;
  END IF;
  SELECT * INTO r FROM public.dashboard_generation_runs g WHERE g.user_id=p_user_id AND g.purpose=v_purpose AND g.request_key=key;
  IF FOUND THEN
    IF r.status='ready' AND r.expires_at>now() AND r.consent_token=c->>'token' AND r.source_hash=v_source_hash THEN
      -- A newer candidate can belong to another timezone's slot. Check this
      -- exact row too, so a valid current note keeps previous=false.
      IF p_action<>'open' OR (
        jsonb_array_length(CASE WHEN jsonb_typeof(r.output->'basis_refs')='array'
          THEN r.output->'basis_refs' ELSE '[]'::jsonb END)>0
        AND jsonb_typeof(r.output->'reminder_suggestions')='array'
        AND NOT EXISTS (
          SELECT 1 FROM (
            SELECT value AS ref FROM jsonb_array_elements(CASE WHEN jsonb_typeof(r.output->'basis_refs')='array'
              THEN r.output->'basis_refs' ELSE '[]'::jsonb END)
            UNION ALL
            SELECT value->'source_ref' FROM jsonb_array_elements(CASE WHEN jsonb_typeof(r.output->'reminder_suggestions')='array'
              THEN r.output->'reminder_suggestions' ELSE '[]'::jsonb END)
          ) evidence WHERE NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements(source->'reminders') candidate
            WHERE candidate->>'id'=evidence.ref->>'id'
              AND CASE WHEN candidate->>'kind'='routine' THEN 'routine' ELSE 'reminder' END=evidence.ref->>'kind'
          )
        )
      ) THEN
        RETURN jsonb_build_object('kind','ready','purpose',v_purpose,'slot',slot,'value',r.output,'source',source,'generatedAt',r.created_at,'previous',false);
      END IF;
    END IF;
    IF previous_note IS NOT NULL THEN RETURN previous_note; END IF;
    -- Only an in-flight lease is busy. Terminal or stale attempts wait for
    -- the next allowed key; they are never retried automatically.
    RETURN jsonb_build_object('kind',CASE WHEN r.status IN ('pending','dispatched')
      AND r.created_at>now()-interval '3 minutes' THEN 'busy' ELSE 'waiting' END);
  END IF;
  -- Legacy and v2 reservations share the same 0248 allowance.
  IF public.dashboard_generation_attempt_count(p_user_id,v_purpose,s.timezone) >= (CASE WHEN v_purpose='daily_note' THEN 3 ELSE 48 END) THEN
    IF previous_note IS NOT NULL THEN RETURN previous_note; END IF;
    RETURN jsonb_build_object('kind','limited');
  END IF;
  INSERT INTO public.dashboard_generation_runs(user_id,purpose,request_key,source_hash,consent_token,expires_at)
    VALUES(p_user_id,v_purpose,key,v_source_hash,c->>'token',expiry) RETURNING * INTO r;
  RETURN jsonb_build_object('kind','claimed','id',r.id,'purpose',v_purpose,'slot',slot,'locale',s.locale,
    'source',source,'consent_token',c->>'token');
END $$;

CREATE OR REPLACE FUNCTION public.dashboard_generation_request_v2(p_user_id uuid,p_action text,p_timezone text DEFAULT NULL,p_locale text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=off AS $$
DECLARE c jsonb; s public.dashboard_generation_settings%ROWTYPE; r public.dashboard_generation_runs%ROWTYPE;
  wall timestamp; slot text; slot_day date; v_purpose text; key text; source jsonb; v_source_hash text; expiry timestamptz; previous_note jsonb;
BEGIN
  IF p_action IS NULL OR p_action NOT IN ('open','summary','triage','hourly') THEN RAISE EXCEPTION 'dashboard_action' USING ERRCODE='22023'; END IF;
  c := public.dashboard_generation_guard(p_user_id);
  IF c IS NULL THEN RETURN jsonb_build_object('kind','denied'); END IF;
  IF NOT public.dashboard_generation_retention_ready() THEN RETURN jsonb_build_object('kind','denied'); END IF;
  -- Guard's owner row lock serializes quota and idempotency, including timezone edits.
  SELECT * INTO s FROM public.dashboard_generation_settings WHERE user_id=p_user_id;
  IF p_action <> 'hourly' THEN
    IF p_timezone IS NOT NULL AND NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=p_timezone) THEN
      RAISE EXCEPTION 'dashboard_timezone' USING ERRCODE='22023';
    END IF;
    IF p_locale IS NOT NULL AND p_locale NOT IN ('en','ko','es','pt','id') THEN RAISE EXCEPTION 'dashboard_locale' USING ERRCODE='22023'; END IF;
    IF s.user_id IS NULL AND p_timezone IS NULL THEN RETURN jsonb_build_object('kind','denied'); END IF;
    INSERT INTO public.dashboard_generation_settings(user_id,timezone,locale,last_active_at)
      VALUES(p_user_id,coalesce(p_timezone,s.timezone),coalesce(p_locale,s.locale,'en'),now())
      ON CONFLICT(user_id) DO UPDATE SET timezone=EXCLUDED.timezone,locale=EXCLUDED.locale,last_active_at=EXCLUDED.last_active_at
      RETURNING * INTO s;
  END IF;
  IF s.user_id IS NULL THEN RETURN jsonb_build_object('kind','denied'); END IF;
  wall := now() AT TIME ZONE s.timezone;
  slot := CASE WHEN extract(hour FROM wall)>=20 OR extract(hour FROM wall)<6 THEN 'evening'
    WHEN extract(hour FROM wall)>=13 THEN 'midday' ELSE 'morning' END;
  slot_day := wall::date - CASE WHEN extract(hour FROM wall)<6 THEN 1 ELSE 0 END;
  IF p_action='hourly' AND (extract(hour FROM wall) NOT IN (6,13,20) OR s.last_active_at<=now()-interval '7 days') THEN
    RETURN jsonb_build_object('kind','empty');
  END IF;
  v_purpose := CASE p_action WHEN 'summary' THEN 'day_summary' WHEN 'triage' THEN 'inbox_triage' ELSE 'daily_note' END;
  source := public.dashboard_generation_source(p_user_id,v_purpose,wall::date);
  v_source_hash := md5(source::text);
  -- Empty input wins over old attempts; keep the attempt ledger intact.
  IF jsonb_array_length(coalesce(source->'reminders',source->'inboxCandidates'))=0 THEN RETURN jsonb_build_object('kind','empty'); END IF;
  -- Only the read action may use a previous note. Its current consent and every
  -- evidence reference must survive; completed routines remain valid evidence.
  IF p_action='open' THEN
    SELECT jsonb_build_object('kind','ready','purpose','daily_note','slot',g.output->>'slot',
      'value',g.output,'source',source,'generatedAt',g.created_at,'previous',true)
    INTO previous_note FROM public.dashboard_generation_runs g
    WHERE g.user_id=p_user_id AND g.purpose='daily_note' AND g.status='ready'
      AND g.output IS NOT NULL AND g.expires_at>now() AND g.consent_token=c->>'token'
      AND jsonb_array_length(CASE WHEN jsonb_typeof(g.output->'basis_refs')='array'
        THEN g.output->'basis_refs' ELSE '[]'::jsonb END)>0
      AND jsonb_typeof(g.output->'reminder_suggestions')='array'
      AND NOT EXISTS (
        SELECT 1 FROM (
          SELECT value AS ref FROM jsonb_array_elements(CASE WHEN jsonb_typeof(g.output->'basis_refs')='array'
            THEN g.output->'basis_refs' ELSE '[]'::jsonb END)
          UNION ALL
          SELECT value->'source_ref' FROM jsonb_array_elements(CASE WHEN jsonb_typeof(g.output->'reminder_suggestions')='array'
            THEN g.output->'reminder_suggestions' ELSE '[]'::jsonb END)
        ) evidence WHERE NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(source->'reminders') candidate
          WHERE candidate->>'id'=evidence.ref->>'id'
            AND CASE WHEN candidate->>'kind'='routine' THEN 'routine' ELSE 'reminder' END=evidence.ref->>'kind'
        )
      )
    ORDER BY g.created_at DESC LIMIT 1 FOR SHARE OF g;
  END IF;
  key := CASE v_purpose WHEN 'daily_note' THEN slot_day::text||':'||slot
    WHEN 'day_summary' THEN floor(extract(epoch FROM now())/1800)::text
    ELSE wall::date::text||':'||v_source_hash END;
  expiry := CASE WHEN v_purpose='day_summary' THEN now()+interval '30 minutes' ELSE now()+interval '24 hours' END;
  IF v_purpose='day_summary' THEN
    SELECT * INTO r FROM public.dashboard_generation_runs g WHERE g.user_id=p_user_id AND g.purpose=v_purpose
      AND g.status='ready' AND g.expires_at>now() AND g.consent_token=c->>'token' AND g.source_hash=v_source_hash
      ORDER BY g.created_at DESC LIMIT 1;
    IF FOUND THEN RETURN jsonb_build_object('kind','ready','purpose',v_purpose,'slot',slot,'value',r.output,'source',source,'generatedAt',r.created_at,'previous',false); END IF;
  END IF;
  SELECT * INTO r FROM public.dashboard_generation_runs g WHERE g.user_id=p_user_id AND g.purpose=v_purpose AND g.request_key=key FOR UPDATE;
  IF FOUND THEN
    IF r.status='ready' AND r.expires_at>now() AND r.consent_token=c->>'token' AND r.source_hash=v_source_hash THEN
      -- A newer candidate can belong to another timezone's slot. Check this
      -- exact row too, so a valid current note keeps previous=false.
      IF p_action<>'open' OR (
        jsonb_array_length(CASE WHEN jsonb_typeof(r.output->'basis_refs')='array'
          THEN r.output->'basis_refs' ELSE '[]'::jsonb END)>0
        AND jsonb_typeof(r.output->'reminder_suggestions')='array'
        AND NOT EXISTS (
          SELECT 1 FROM (
            SELECT value AS ref FROM jsonb_array_elements(CASE WHEN jsonb_typeof(r.output->'basis_refs')='array'
              THEN r.output->'basis_refs' ELSE '[]'::jsonb END)
            UNION ALL
            SELECT value->'source_ref' FROM jsonb_array_elements(CASE WHEN jsonb_typeof(r.output->'reminder_suggestions')='array'
              THEN r.output->'reminder_suggestions' ELSE '[]'::jsonb END)
          ) evidence WHERE NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements(source->'reminders') candidate
            WHERE candidate->>'id'=evidence.ref->>'id'
              AND CASE WHEN candidate->>'kind'='routine' THEN 'routine' ELSE 'reminder' END=evidence.ref->>'kind'
          )
        )
      ) THEN
        RETURN jsonb_build_object('kind','ready','purpose',v_purpose,'slot',slot,'value',r.output,'source',source,'generatedAt',r.created_at,'previous',false);
      END IF;
    END IF;
    -- The guard owns the user lock; this row lock also fences old workers.
    -- Legacy/ambiguous dispatches and consent invalidation are terminal.
    IF r.lease_token IS NOT NULL AND r.dispatched_at IS NULL
      AND r.consent_token=c->>'token'
      AND (r.status='pre_dispatch_failed' OR
        (r.status='pending' AND r.leased_at<=clock_timestamp()-interval '3 minutes'
          AND EXISTS(SELECT 1 FROM public.ai_audit_log WHERE id=r.lease_token AND user_id=p_user_id
            AND outbox_event_id='dashboard:'||r.id||':'||r.lease_token AND model_used='dashboard+attempt'))) THEN
      IF public.dashboard_generation_attempt_count(p_user_id,v_purpose,s.timezone) >= (CASE WHEN v_purpose='daily_note' THEN 3 ELSE 48 END) THEN
        IF previous_note IS NOT NULL THEN RETURN previous_note; END IF;
        RETURN jsonb_build_object('kind','limited');
      END IF;
      UPDATE public.ai_audit_log SET model_used=split_part(model_used,'+',1)||'+pre_dispatch_failed'
        WHERE id=r.lease_token AND user_id=p_user_id AND model_used LIKE '%+attempt';
      UPDATE public.dashboard_generation_runs SET status='pending',output=NULL,
        lease_token=gen_random_uuid(),leased_at=clock_timestamp(),source_hash=v_source_hash,
        expires_at=expiry WHERE id=r.id RETURNING * INTO r;
    ELSE
      IF previous_note IS NOT NULL THEN RETURN previous_note; END IF;
      RETURN jsonb_build_object('kind',CASE WHEN r.status IN ('pending','dispatched')
        AND r.leased_at>clock_timestamp()-interval '3 minutes' THEN 'busy' ELSE 'waiting' END);
    END IF;
  ELSE
    IF public.dashboard_generation_attempt_count(p_user_id,v_purpose,s.timezone) >= (CASE WHEN v_purpose='daily_note' THEN 3 ELSE 48 END) THEN
      IF previous_note IS NOT NULL THEN RETURN previous_note; END IF;
      RETURN jsonb_build_object('kind','limited');
    END IF;
    INSERT INTO public.dashboard_generation_runs(user_id,purpose,request_key,source_hash,consent_token,expires_at,lease_token,dispatched_at)
      VALUES(p_user_id,v_purpose,key,v_source_hash,c->>'token',expiry,gen_random_uuid(),NULL) RETURNING * INTO r;
  END IF;
  -- Reserve the audit row in the same transaction as the lease. Even a worker
  -- that dies immediately after claim has exactly one content-free attempt.
  INSERT INTO public.ai_audit_log(id,user_id,purpose,prompt_hash,output_hash,model_used,
    vertex_backend,safety_zone,latency_ms,event_source,reasoning_vendor,outbox_event_id)
  VALUES(r.lease_token,p_user_id,r.purpose,'','','dashboard+attempt',false,'green',0,
    'server_verified','claude','dashboard:'||r.id||':'||r.lease_token);
  RETURN jsonb_build_object('kind','claimed','id',r.id,'lease_token',r.lease_token,'purpose',v_purpose,'slot',slot,'locale',s.locale,
    'source',source,'consent_token',c->>'token');
END $$;

CREATE OR REPLACE FUNCTION public.dashboard_generation_dispatch(p_user_id uuid,p_run_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=off AS $$
DECLARE c jsonb; r public.dashboard_generation_runs%ROWTYPE; zone text;
BEGIN
  c := public.dashboard_generation_guard(p_user_id);
  IF c IS NULL THEN RETURN false; END IF;
  IF NOT public.dashboard_generation_retention_ready() THEN RETURN false; END IF;
  SELECT * INTO r FROM public.dashboard_generation_runs WHERE id=p_run_id AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND OR r.lease_token IS NOT NULL OR r.status<>'pending' OR r.created_at<=now()-interval '3 minutes' OR r.consent_token<>c->>'token' THEN RETURN false; END IF;
  SELECT timezone INTO zone FROM public.dashboard_generation_settings WHERE user_id=p_user_id;
  IF r.source_hash<>md5(public.dashboard_generation_source(p_user_id,r.purpose,(now() AT TIME ZONE zone)::date)::text) THEN RETURN false; END IF;
  UPDATE public.dashboard_generation_runs SET status='dispatched' WHERE id=r.id;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.dashboard_generation_finish(p_user_id uuid,p_run_id uuid,p_output jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=off AS $$
DECLARE c jsonb; r public.dashboard_generation_runs%ROWTYPE; zone text; source jsonb; valid boolean;
BEGIN
  c := public.dashboard_generation_guard(p_user_id);
  IF c IS NULL THEN RETURN false; END IF;
  SELECT * INTO r FROM public.dashboard_generation_runs WHERE id=p_run_id AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND OR r.lease_token IS NOT NULL OR r.status NOT IN ('pending','dispatched') THEN RETURN false; END IF;
  SELECT timezone INTO zone FROM public.dashboard_generation_settings WHERE user_id=p_user_id;
  source := public.dashboard_generation_source(p_user_id,r.purpose,(now() AT TIME ZONE zone)::date);
  valid := r.status='dispatched' AND p_output IS NOT NULL AND jsonb_typeof(p_output)='object' AND octet_length(p_output::text)<=32768
    AND r.created_at>now()-interval '3 minutes' AND r.consent_token=c->>'token' AND r.source_hash=md5(source::text);
  UPDATE public.dashboard_generation_runs SET status=CASE WHEN valid THEN 'ready' ELSE 'failed' END,
    output=CASE WHEN valid THEN p_output ELSE NULL END WHERE id=r.id;
  RETURN coalesce(valid,false);
END $$;

CREATE OR REPLACE FUNCTION public.dashboard_generation_audit_attempt(
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
  IF NOT FOUND OR r.lease_token IS NOT NULL OR r.status<>'pending' OR r.created_at<=now()-interval '3 minutes'
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

CREATE FUNCTION public.dashboard_generation_begin_classification_v2(p_user_id uuid,p_run_id uuid,p_lease_token uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=off AS $$
DECLARE r public.dashboard_generation_runs%ROWTYPE; c jsonb;
BEGIN
  c := public.dashboard_generation_eligibility(p_user_id);
  IF c IS NULL THEN RETURN false; END IF;
  SELECT * INTO r FROM public.dashboard_generation_runs WHERE id=p_run_id AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND OR p_lease_token IS NULL OR r.lease_token IS DISTINCT FROM p_lease_token
    OR r.consent_token IS DISTINCT FROM c->>'token'
    OR r.dispatched_at IS NOT NULL OR r.status<>'pending'
    OR r.leased_at<=clock_timestamp()-interval '3 minutes' THEN RETURN false; END IF;
  UPDATE public.ai_audit_log SET model_used='dashboard+classifying'
    WHERE id=r.lease_token AND user_id=p_user_id AND event_source='server_verified'
      AND outbox_event_id='dashboard:'||r.id||':'||r.lease_token AND model_used='dashboard+attempt';
  RETURN FOUND;
END $$;

CREATE FUNCTION public.dashboard_generation_block_v2(p_user_id uuid,p_run_id uuid,p_lease_token uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=off AS $$
DECLARE r public.dashboard_generation_runs%ROWTYPE;
BEGIN
  -- Intentional: role and locks still apply; a started red must close after withdrawal.
  PERFORM public.dashboard_generation_eligibility(p_user_id);
  SELECT * INTO r FROM public.dashboard_generation_runs WHERE id=p_run_id AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND OR p_lease_token IS NULL OR r.lease_token IS DISTINCT FROM p_lease_token
    OR r.dispatched_at IS NOT NULL OR r.status NOT IN ('pending','failed','pre_dispatch_blocked') THEN RETURN false; END IF;
  UPDATE public.ai_audit_log SET model_used=split_part(model_used,'+',1)||'+crisis',
    safety_zone='red',reasoning_effort=NULL,key_combo=NULL
    WHERE id=r.lease_token AND user_id=p_user_id AND event_source='server_verified'
      AND outbox_event_id='dashboard:'||r.id||':'||r.lease_token
      AND (model_used='dashboard+classifying' OR model_used LIKE '%+crisis');
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE public.dashboard_generation_runs SET
    status=CASE WHEN r.status='failed' THEN 'failed' ELSE 'pre_dispatch_blocked' END,output=NULL WHERE id=r.id;
  RETURN true;
END $$;

CREATE FUNCTION public.dashboard_generation_audit_attempt_v2(
  p_user_id uuid,p_run_id uuid,p_model text,p_effort text,p_prompt_hash text,p_crisis boolean,p_lease_token uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=off AS $$
DECLARE r public.dashboard_generation_runs%ROWTYPE; c jsonb; zone text;
BEGIN
  c := public.dashboard_generation_guard(p_user_id);
  -- Ending a red lease makes no paid call and must remain possible when the
  -- heartbeat expires after claim. The guard still enforces service role.
  IF NOT p_crisis AND (c IS NULL OR NOT public.dashboard_generation_retention_ready()) THEN RETURN false; END IF;
  IF p_model IS NULL OR p_model !~ '^claude-sonnet-[a-z0-9-]{1,80}$'
    OR p_effort IS NULL OR p_effort NOT IN ('low','medium','high','xhigh','max')
    OR p_prompt_hash IS NULL OR p_prompt_hash !~ '^[0-9a-f]{1,8}$'
    OR p_crisis IS NULL THEN RAISE EXCEPTION 'dashboard_audit_input' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock_shared(hashtextextended(p_user_id::text,260913));
  PERFORM 1 FROM public.users WHERE id=p_user_id FOR UPDATE;
  SELECT * INTO r FROM public.dashboard_generation_runs WHERE id=p_run_id AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND OR p_lease_token IS NULL OR r.lease_token IS DISTINCT FROM p_lease_token
    OR r.dispatched_at IS NOT NULL OR r.status<>'pending' THEN RETURN false; END IF;
  IF NOT p_crisis THEN
    IF r.leased_at<=clock_timestamp()-interval '3 minutes' OR r.consent_token<>c->>'token' THEN RETURN false; END IF;
    SELECT timezone INTO zone FROM public.dashboard_generation_settings WHERE user_id=p_user_id;
    IF r.source_hash<>md5(public.dashboard_generation_source(p_user_id,r.purpose,(now() AT TIME ZONE zone)::date)::text) THEN RETURN false; END IF;
  END IF;
  -- The already-reserved audit row and dispatch marker commit together.
  UPDATE public.ai_audit_log SET prompt_hash=p_prompt_hash,
    model_used=p_model||CASE WHEN p_crisis THEN '+crisis' ELSE '+attempt' END,
    safety_zone=CASE WHEN p_crisis THEN 'red' ELSE 'green' END::public.safety_zone,
    reasoning_effort=CASE WHEN NOT p_crisis THEN p_effort END,
    key_combo=CASE WHEN NOT p_crisis THEN 'ANTHROPIC_API_KEY' END
  WHERE id=r.lease_token AND user_id=p_user_id
    AND outbox_event_id='dashboard:'||r.id||':'||r.lease_token
    AND (model_used='dashboard+classifying' OR (NOT p_crisis AND model_used='dashboard+attempt'));
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE public.dashboard_generation_runs SET
    status=CASE WHEN p_crisis THEN 'pre_dispatch_blocked' ELSE 'dispatched' END,
    dispatched_at=CASE WHEN NOT p_crisis THEN clock_timestamp() END,output=NULL WHERE id=r.id;
  RETURN true;
END $$;

CREATE FUNCTION public.dashboard_generation_audit_result_v2(
  p_user_id uuid,p_run_id uuid,p_output_hash text,p_outcome text,
  p_latency_ms integer,p_safety_zone text,p_total_tokens integer,p_lease_token uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=off AS $$
DECLARE a public.ai_audit_log%ROWTYPE; r public.dashboard_generation_runs%ROWTYPE; model text;
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
  -- Result evidence survives withdrawal, but never a lease replacement.
  PERFORM pg_advisory_xact_lock_shared(hashtextextended(p_user_id::text,260913));
  PERFORM 1 FROM public.users WHERE id=p_user_id FOR UPDATE;
  SELECT * INTO r FROM public.dashboard_generation_runs WHERE id=p_run_id AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND OR p_lease_token IS NULL OR r.lease_token IS DISTINCT FROM p_lease_token
    OR r.dispatched_at IS NULL THEN RETURN false; END IF;
  SELECT * INTO a FROM public.ai_audit_log WHERE id=p_lease_token AND user_id=p_user_id
    AND event_source='server_verified' AND outbox_event_id='dashboard:'||p_run_id||':'||p_lease_token FOR UPDATE;
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

CREATE FUNCTION public.dashboard_generation_finish_v2(p_user_id uuid,p_run_id uuid,p_output jsonb,p_lease_token uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=off AS $$
DECLARE c jsonb; r public.dashboard_generation_runs%ROWTYPE; zone text; source jsonb; valid boolean;
BEGIN
  c := public.dashboard_generation_eligibility(p_user_id);
  -- Eligibility and current consent are read under the shared guard's locks.
  -- Also lock any remaining run when eligibility denied a missing account.
  PERFORM pg_advisory_xact_lock_shared(hashtextextended(p_user_id::text,260913));
  PERFORM 1 FROM public.users WHERE id=p_user_id FOR UPDATE;
  SELECT * INTO r FROM public.dashboard_generation_runs WHERE id=p_run_id AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND OR p_lease_token IS NULL OR r.lease_token IS DISTINCT FROM p_lease_token THEN RETURN false; END IF;
  IF r.dispatched_at IS NULL THEN
    IF p_output IS NOT NULL THEN RETURN false; END IF;
    -- Invalidation's failed and the classifier's blocked stay terminal even
    -- after a later grant. Only an un-dispatched pending lease is recoverable.
    UPDATE public.ai_audit_log SET model_used=split_part(model_used,'+',1)||'+pre_dispatch_failed'
      WHERE id=r.lease_token AND user_id=p_user_id
        AND (model_used LIKE '%+attempt' OR model_used='dashboard+classifying');
    IF r.status='pending' THEN
      UPDATE public.dashboard_generation_runs SET output=NULL,status=CASE
        WHEN c IS NOT NULL AND r.consent_token=c->>'token' THEN 'pre_dispatch_failed'
        ELSE 'failed' END WHERE id=r.id;
    END IF;
    RETURN false;
  END IF;
  -- Retention gates new dispatch, never completion of an already-paid lease.
  IF c IS NULL OR r.status NOT IN ('pending','dispatched') THEN RETURN false; END IF;
  SELECT timezone INTO zone FROM public.dashboard_generation_settings WHERE user_id=p_user_id;
  source := public.dashboard_generation_source(p_user_id,r.purpose,(now() AT TIME ZONE zone)::date);
  valid := r.status='dispatched' AND p_output IS NOT NULL AND jsonb_typeof(p_output)='object' AND octet_length(p_output::text)<=32768
    AND r.leased_at>clock_timestamp()-interval '3 minutes' AND r.consent_token=c->>'token' AND r.source_hash=md5(source::text);
  UPDATE public.dashboard_generation_runs SET status=CASE WHEN valid THEN 'ready' ELSE 'failed' END,
    output=CASE WHEN valid THEN p_output ELSE NULL END WHERE id=r.id;
  RETURN coalesce(valid,false);
END $$;

REVOKE ALL ON FUNCTION public.dashboard_generation_eligibility(uuid),
  public.dashboard_generation_guard(uuid),public.dashboard_generation_attempt_count(uuid,text,text)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.dashboard_generation_request(uuid,text,text,text),public.purge_dashboard_generation()
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.dashboard_generation_request(uuid,text,text,text),public.purge_dashboard_generation() TO service_role;


REVOKE ALL ON FUNCTION public.dashboard_generation_request_v2(uuid,text,text,text),
  public.dashboard_generation_begin_classification_v2(uuid,uuid,uuid),
  public.dashboard_generation_block_v2(uuid,uuid,uuid),
  public.dashboard_generation_audit_attempt_v2(uuid,uuid,text,text,text,boolean,uuid),
  public.dashboard_generation_audit_result_v2(uuid,uuid,text,text,integer,text,integer,uuid),
  public.dashboard_generation_finish_v2(uuid,uuid,jsonb,uuid),
  public.dashboard_generation_dispatch(uuid,uuid),
  public.dashboard_generation_finish(uuid,uuid,jsonb),
  public.dashboard_generation_audit_attempt(uuid,uuid,text,text,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.dashboard_generation_request_v2(uuid,text,text,text),
  public.dashboard_generation_begin_classification_v2(uuid,uuid,uuid),
  public.dashboard_generation_block_v2(uuid,uuid,uuid),
  public.dashboard_generation_audit_attempt_v2(uuid,uuid,text,text,text,boolean,uuid),
  public.dashboard_generation_audit_result_v2(uuid,uuid,text,text,integer,text,integer,uuid),
  public.dashboard_generation_finish_v2(uuid,uuid,jsonb,uuid),
  public.dashboard_generation_dispatch(uuid,uuid),
  public.dashboard_generation_finish(uuid,uuid,jsonb),
  public.dashboard_generation_audit_attempt(uuid,uuid,text,text,text,boolean) TO service_role;
