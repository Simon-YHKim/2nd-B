-- DRAFT: console owner numbers/applies after regression checks. Not applied by this PR.
-- Keep the last valid daily note while waiting. Never extend its 24-hour retention.
-- No retries, new paid calls, purpose merging or client table access.
-- Forward-only correction: truthful empty and waiting states.
-- Preserves source guards, service-only ACLs, quotas and every prior attempt.
CREATE OR REPLACE FUNCTION public.dashboard_generation_request(p_user_id uuid,p_action text,p_timezone text DEFAULT NULL,p_locale text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=off AS $$
DECLARE c jsonb; s public.dashboard_generation_settings%ROWTYPE; r public.dashboard_generation_runs%ROWTYPE;
  wall timestamp; slot text; slot_day date; v_purpose text; key text; source jsonb; v_source_hash text; expiry timestamptz; previous_note jsonb;
BEGIN
  IF p_action IS NULL OR p_action NOT IN ('open','summary','triage','hourly') THEN RAISE EXCEPTION 'dashboard_action' USING ERRCODE='22023'; END IF;
  c := public.dashboard_generation_guard(p_user_id);
  IF c IS NULL THEN RETURN jsonb_build_object('kind','denied'); END IF;
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
      AND jsonb_array_length(g.output->'basis_refs')>0
      AND NOT EXISTS (
        SELECT 1 FROM (
          SELECT value AS ref FROM jsonb_array_elements(g.output->'basis_refs')
          UNION ALL
          SELECT value->'source_ref' FROM jsonb_array_elements(g.output->'reminder_suggestions')
        ) evidence WHERE NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(source->'reminders') candidate
          WHERE candidate->>'id'=evidence.ref->>'id'
            AND CASE WHEN candidate->>'kind'='routine' THEN 'routine' ELSE 'reminder' END=evidence.ref->>'kind'
        )
      )
    ORDER BY g.created_at DESC LIMIT 1;
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
      RETURN jsonb_build_object('kind','ready','purpose',v_purpose,'slot',slot,'value',r.output,'source',source,'generatedAt',r.created_at,'previous',false);
    END IF;
    IF previous_note IS NOT NULL THEN RETURN previous_note; END IF;
    -- Only an in-flight lease is busy. Terminal or stale attempts wait for
    -- the next allowed key; they are never retried automatically.
    RETURN jsonb_build_object('kind',CASE WHEN r.status IN ('pending','dispatched')
      AND r.created_at>now()-interval '3 minutes' THEN 'busy' ELSE 'waiting' END);
  END IF;
  -- Count attempts, not only successful calls. A timeout is never automatically retried.
  -- Current local day plus a fixed UTC-day backstop prevents timezone reset abuse
  -- without blocking tomorrow's 06:00 because yesterday's tick was a little late.
  IF (SELECT count(*) FROM public.dashboard_generation_runs g WHERE g.user_id=p_user_id AND g.purpose=v_purpose
      AND ((g.created_at AT TIME ZONE s.timezone)::date=wall::date OR
        (g.created_at AT TIME ZONE 'UTC')::date=(now() AT TIME ZONE 'UTC')::date)) >= (CASE WHEN v_purpose='daily_note' THEN 3 ELSE 48 END) THEN
    IF previous_note IS NOT NULL THEN RETURN previous_note; END IF;
    RETURN jsonb_build_object('kind','limited');
  END IF;
  INSERT INTO public.dashboard_generation_runs(user_id,purpose,request_key,source_hash,consent_token,expires_at)
    VALUES(p_user_id,v_purpose,key,v_source_hash,c->>'token',expiry) RETURNING * INTO r;
  RETURN jsonb_build_object('kind','claimed','id',r.id,'purpose',v_purpose,'slot',slot,'locale',s.locale,
    'source',source,'consent_token',c->>'token');
END $$;

REVOKE ALL ON FUNCTION public.dashboard_generation_request(uuid,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.dashboard_generation_request(uuid,text,text,text) TO service_role;
