-- W1 draft. Allocate a migration number at review, apply before enabling Edge.
-- No cron, model-policy replacement, or production activation in this draft.
CREATE TABLE public.dashboard_generation_settings (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  timezone text NOT NULL, locale text NOT NULL CHECK(locale IN ('en','ko','es','pt','id')),
  last_active_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.dashboard_generation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK(purpose IN ('daily_note','day_summary','inbox_triage')),
  request_key text NOT NULL, source_hash text NOT NULL, consent_token text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','dispatched','ready','failed')),
  output jsonb, created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
  UNIQUE(user_id,purpose,request_key),
  CHECK(output IS NULL OR (jsonb_typeof(output)='object' AND octet_length(output::text)<=32768))
);
CREATE INDEX dashboard_runs_owner_time ON public.dashboard_generation_runs(user_id,created_at);
ALTER TABLE public.dashboard_generation_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_generation_settings FORCE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_generation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_generation_runs FORCE ROW LEVEL SECURITY;
-- Cache reads also go through the current consent, source and age checks.
REVOKE ALL ON public.dashboard_generation_settings,public.dashboard_generation_runs FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.dashboard_generation_guard(p_user_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=off AS $$
DECLARE c jsonb;
BEGIN
  IF coalesce(nullif(current_setting('request.jwt.claim.role',true),''),
    nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'dashboard_forbidden' USING ERRCODE='42501';
  END IF;
  -- Same deletion-fence ordering as 0194; all mutations below retain these locks.
  PERFORM pg_advisory_xact_lock_shared(hashtextextended(p_user_id::text,260913));
  PERFORM 1 FROM auth.users WHERE id=p_user_id AND deleted_at IS NULL AND email_confirmed_at IS NOT NULL FOR SHARE;
  IF NOT FOUND OR EXISTS(SELECT 1 FROM public.account_deletion_tombstones WHERE user_id=p_user_id) THEN RETURN NULL; END IF;
  PERFORM 1 FROM public.users WHERE id=p_user_id AND account_status='active'
    AND minor_tier='adult' AND birth_date <= (current_date-interval '18 years')::date
    AND privacy_prefs->'recommendations'='true'::jsonb FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  c := public.effective_llm_consent_snapshot_v2(p_user_id,false);
  IF c->'allowed' IS DISTINCT FROM 'true'::jsonb OR coalesce(c->>'token','') !~ '^[a-f0-9]{64}$' THEN RETURN NULL; END IF;
  RETURN c;
END $$;

-- W1 source reader: only user-created routine labels and app completion state.
-- No record originals (Q13 consent not yet shipped), device data, numeric ledgers,
-- routine reasons/checklists, health-derived samples or other owners' log rows.
CREATE FUNCTION public.dashboard_generation_source(p_user_id uuid,p_purpose text,p_day date) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' SET row_security=off AS $$
  WITH rows AS (
    SELECT r.id,r.title,EXISTS(SELECT 1 FROM public.ops_routine_logs l
      WHERE l.user_id=p_user_id AND l.routine_id=r.id AND l.completed_on=p_day) AS done
    FROM public.ops_routines r WHERE r.user_id=p_user_id AND r.active
      AND (r.recurrence='daily' OR (r.recurrence='weekly' AND r.weekday=extract(dow FROM p_day)))
      AND char_length(btrim(r.title)) BETWEEN 1 AND 200
      -- Conservative boundary for numeric values embedded in labels. This is
      -- deliberately wider than a currency regexp; no claim of semantic DLP.
      AND r.title !~ '[0-9０-９$€£¥₩]'
    ORDER BY r.created_at,r.id LIMIT 20
  ) SELECT CASE WHEN p_purpose='inbox_triage' THEN
    jsonb_build_object('inboxCandidates',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id',id,'source','app','sender',NULL,'title',title) ORDER BY id) FROM (SELECT * FROM rows WHERE NOT done ORDER BY id LIMIT 5) t),'[]'::jsonb))
  ELSE jsonb_build_object('reminders',coalesce((SELECT jsonb_agg(jsonb_build_object(
    'id',id,'kind','routine','title',title,'at',NULL,'state',CASE WHEN done THEN 'done' ELSE 'open' END) ORDER BY id) FROM rows),'[]'::jsonb)) END
$$;

CREATE FUNCTION public.dashboard_generation_request(p_user_id uuid,p_action text,p_timezone text DEFAULT NULL,p_locale text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=off AS $$
DECLARE c jsonb; s public.dashboard_generation_settings%ROWTYPE; r public.dashboard_generation_runs%ROWTYPE;
  wall timestamp; slot text; slot_day date; v_purpose text; key text; source jsonb; v_source_hash text; expiry timestamptz;
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
  key := CASE v_purpose WHEN 'daily_note' THEN slot_day::text||':'||slot
    WHEN 'day_summary' THEN floor(extract(epoch FROM now())/1800)::text
    ELSE wall::date::text||':'||v_source_hash END;
  expiry := CASE WHEN v_purpose='day_summary' THEN now()+interval '30 minutes' ELSE now()+interval '24 hours' END;
  IF v_purpose='day_summary' THEN
    SELECT * INTO r FROM public.dashboard_generation_runs g WHERE g.user_id=p_user_id AND g.purpose=v_purpose
      AND g.status='ready' AND g.expires_at>now() AND g.consent_token=c->>'token' AND g.source_hash=v_source_hash
      ORDER BY g.created_at DESC LIMIT 1;
    IF FOUND THEN RETURN jsonb_build_object('kind','ready','purpose',v_purpose,'slot',slot,'value',r.output,'source',source); END IF;
  END IF;
  SELECT * INTO r FROM public.dashboard_generation_runs g WHERE g.user_id=p_user_id AND g.purpose=v_purpose AND g.request_key=key;
  IF FOUND THEN
    IF r.status='ready' AND r.expires_at>now() AND r.consent_token=c->>'token' AND r.source_hash=v_source_hash THEN
      RETURN jsonb_build_object('kind','ready','purpose',v_purpose,'slot',slot,'value',r.output,'source',source);
    END IF;
    RETURN jsonb_build_object('kind','busy');
  END IF;
  -- Count attempts, not only successful calls. A timeout is never automatically retried.
  -- Current local day plus a fixed UTC-day backstop prevents timezone reset abuse
  -- without blocking tomorrow's 06:00 because yesterday's tick was a little late.
  IF (SELECT count(*) FROM public.dashboard_generation_runs g WHERE g.user_id=p_user_id AND g.purpose=v_purpose
      AND ((g.created_at AT TIME ZONE s.timezone)::date=wall::date OR
        (g.created_at AT TIME ZONE 'UTC')::date=(now() AT TIME ZONE 'UTC')::date)) >= (CASE WHEN v_purpose='daily_note' THEN 3 ELSE 48 END) THEN
    RETURN jsonb_build_object('kind','limited');
  END IF;
  IF jsonb_array_length(coalesce(source->'reminders',source->'inboxCandidates'))=0 THEN RETURN jsonb_build_object('kind','empty'); END IF;
  INSERT INTO public.dashboard_generation_runs(user_id,purpose,request_key,source_hash,consent_token,expires_at)
    VALUES(p_user_id,v_purpose,key,v_source_hash,c->>'token',expiry) RETURNING * INTO r;
  RETURN jsonb_build_object('kind','claimed','id',r.id,'purpose',v_purpose,'slot',slot,'locale',s.locale,
    'source',source,'consent_token',c->>'token');
END $$;

CREATE FUNCTION public.dashboard_generation_dispatch(p_user_id uuid,p_run_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=off AS $$
DECLARE c jsonb; r public.dashboard_generation_runs%ROWTYPE; zone text;
BEGIN
  c := public.dashboard_generation_guard(p_user_id);
  IF c IS NULL THEN RETURN false; END IF;
  SELECT * INTO r FROM public.dashboard_generation_runs WHERE id=p_run_id AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND OR r.status<>'pending' OR r.created_at<=now()-interval '3 minutes' OR r.consent_token<>c->>'token' THEN RETURN false; END IF;
  SELECT timezone INTO zone FROM public.dashboard_generation_settings WHERE user_id=p_user_id;
  IF r.source_hash<>md5(public.dashboard_generation_source(p_user_id,r.purpose,(now() AT TIME ZONE zone)::date)::text) THEN RETURN false; END IF;
  UPDATE public.dashboard_generation_runs SET status='dispatched' WHERE id=r.id;
  RETURN true;
END $$;

CREATE FUNCTION public.dashboard_generation_finish(p_user_id uuid,p_run_id uuid,p_output jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=off AS $$
DECLARE c jsonb; r public.dashboard_generation_runs%ROWTYPE; zone text; source jsonb; valid boolean;
BEGIN
  c := public.dashboard_generation_guard(p_user_id);
  IF c IS NULL THEN RETURN false; END IF;
  SELECT * INTO r FROM public.dashboard_generation_runs WHERE id=p_run_id AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND OR r.status NOT IN ('pending','dispatched') THEN RETURN false; END IF;
  SELECT timezone INTO zone FROM public.dashboard_generation_settings WHERE user_id=p_user_id;
  source := public.dashboard_generation_source(p_user_id,r.purpose,(now() AT TIME ZONE zone)::date);
  valid := r.status='dispatched' AND p_output IS NOT NULL AND jsonb_typeof(p_output)='object' AND octet_length(p_output::text)<=32768
    AND r.created_at>now()-interval '3 minutes' AND r.consent_token=c->>'token' AND r.source_hash=md5(source::text);
  UPDATE public.dashboard_generation_runs SET status=CASE WHEN valid THEN 'ready' ELSE 'failed' END,
    output=CASE WHEN valid THEN p_output ELSE NULL END WHERE id=r.id;
  RETURN coalesce(valid,false);
END $$;

CREATE FUNCTION public.dashboard_generation_due(p_after uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=off AS $$
BEGIN
  IF coalesce(nullif(current_setting('request.jwt.claim.role',true),''),
    nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'dashboard_forbidden' USING ERRCODE='42501';
  END IF;
  RETURN (SELECT coalesce(jsonb_agg(user_id ORDER BY user_id),'[]'::jsonb) FROM (
    SELECT user_id FROM public.dashboard_generation_settings
    WHERE (p_after IS NULL OR user_id>p_after) AND last_active_at>now()-interval '7 days'
      AND extract(hour FROM now() AT TIME ZONE timezone) IN (6,13,20)
    ORDER BY user_id LIMIT 10) t);
END $$;

CREATE FUNCTION public.purge_dashboard_generation() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path='' SET row_security=off AS $$
  -- Keep attempt rows at least 48h so midnight/travel cannot reopen a quota.
  UPDATE public.dashboard_generation_runs SET output=NULL,status='failed' WHERE expires_at<=now() AND output IS NOT NULL;
  DELETE FROM public.dashboard_generation_runs WHERE created_at<now()-interval '48 hours';
$$;

REVOKE ALL ON FUNCTION public.dashboard_generation_guard(uuid),public.dashboard_generation_source(uuid,text,date),
  public.dashboard_generation_request(uuid,text,text,text),public.dashboard_generation_finish(uuid,uuid,jsonb),
  public.dashboard_generation_dispatch(uuid,uuid),
  public.dashboard_generation_due(uuid),public.purge_dashboard_generation() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.dashboard_generation_request(uuid,text,text,text),public.dashboard_generation_finish(uuid,uuid,jsonb),
  public.dashboard_generation_dispatch(uuid,uuid),
  public.dashboard_generation_due(uuid),public.purge_dashboard_generation() TO service_role;

-- Content deletion invalidates all generated output too. Cascade deletes the run
-- ledger only at account deletion; there is no independent client write surface.
CREATE FUNCTION public.invalidate_dashboard_generation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=off AS $$
BEGIN
  UPDATE public.dashboard_generation_runs SET output=NULL,status='failed' WHERE user_id=OLD.user_id AND output IS NOT NULL;
  RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION public.invalidate_dashboard_generation() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER dashboard_routine_deleted AFTER DELETE ON public.ops_routines FOR EACH ROW EXECUTE FUNCTION public.invalidate_dashboard_generation();
-- Registry entries are applied with the numbered migration, before activation.
INSERT INTO public.erasure_registry(table_name,owner_column,class,reason,delete_order)
  VALUES('dashboard_generation_settings','user_id','account_delete_only','Server scheduling preference; removed on account deletion.',NULL),
        ('dashboard_generation_runs','user_id','account_delete_only','48h attempt ledger; cached text expires in 24h or less and is invalidated on source deletion.',NULL);
