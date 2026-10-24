-- D4 / T28 AI readers. REVIEW DRAFT ONLY: no number, no deployment.
-- Requires 0270. Preserve signatures, model filters, RLS, ownership and locks.
-- The app also rechecks search results through the 0270 views while this
-- draft awaits independent review, numbering and server application.
-- After this PR merges: number this draft -> Relay applies it -> write-wiring slice.
-- No top-level transaction wrapper: the migration runner owns the transaction.
-- For isolated replay use psql --single-transaction (or include inside BEGIN).
-- 0270_down drops only the views. These four functions retain their inline
-- hold predicates and keep working, but app AI view readers fail closed.
-- Keep 0270's columns/triggers and this draft's filters; never restore 0142/0225
-- as a rollback. Stop the affected AI feature and roll forward instead.
SET LOCAL lock_timeout = '10s';


CREATE OR REPLACE FUNCTION public.match_wiki_pages(
  p_user_id uuid,
  query_embedding vector(768),
  match_count int DEFAULT 8,
  exclude_id uuid DEFAULT NULL,
  p_embedding_model text DEFAULT NULL
)
RETURNS TABLE (id uuid, slug text, title text, kind text, similarity real)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT w.id, w.slug, w.title, w.kind,
         (1 - (w.embedding <=> query_embedding))::real AS similarity
  FROM public.wiki_pages w
  WHERE w.user_id = p_user_id
    AND NOT w.ai_hold
    AND (w.source_id IS NULL OR EXISTS (
      SELECT 1 FROM public.sources s
      WHERE s.id = w.source_id AND s.user_id = w.user_id AND NOT s.ai_hold
    ))
    AND w.embedding IS NOT NULL
    AND (exclude_id IS NULL OR w.id <> exclude_id)
    -- NULL = no filter = pre-0142 behaviour, for clients that predate it.
    AND (p_embedding_model IS NULL OR w.embedding_model IS NOT DISTINCT FROM p_embedding_model)
  ORDER BY w.embedding <=> query_embedding
  LIMIT match_count;
$$;

CREATE OR REPLACE FUNCTION public.match_records(
  p_user_id uuid,
  query_embedding vector(768),
  match_count int DEFAULT 8,
  exclude_id uuid DEFAULT NULL,
  p_embedding_model text DEFAULT NULL
)
RETURNS TABLE (id uuid, kind text, topic text, summary text, similarity real)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT r.id, r.kind::text, r.topic, r.summary,
         (1 - (r.embedding <=> query_embedding))::real AS similarity
  FROM public.records r
  WHERE r.user_id = p_user_id
    AND NOT r.ai_hold AND NOT r.interview_ai_hold
    AND r.embedding IS NOT NULL
    AND (exclude_id IS NULL OR r.id <> exclude_id)
    AND (p_embedding_model IS NULL OR r.embedding_model IS NOT DISTINCT FROM p_embedding_model)
  ORDER BY r.embedding <=> query_embedding
  LIMIT match_count;
$$;

CREATE OR REPLACE FUNCTION public.reserve_polaris_generation(p_user_id uuid, p_key text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_row public.polaris_generations%ROWTYPE;
  v_week text := to_char(now() AT TIME ZONE 'Asia/Seoul', 'IYYY-"W"IW');
  v_month text := to_char(now() AT TIME ZONE 'Asia/Seoul', 'YYYY-MM');
  v_spend text; v_tier text; v_cap int; v_count int; v_id uuid; v_evidence jsonb;
  v_credit jsonb; v_entry_ids uuid[] := '{}';
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'owner_required' USING ERRCODE='42501';
  END IF;
  PERFORM public.assert_polaris_account_active(p_user_id);
  IF NOT COALESCE((SELECT enabled FROM public.polaris_generation_config),false) THEN
    RAISE EXCEPTION 'polaris_unavailable';
  END IF;
  IF p_key IS NULL OR length(p_key) NOT BETWEEN 8 AND 120 THEN RAISE EXCEPTION 'invalid_key'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('polaris:' || p_user_id::text));
  -- Serialize with the existing reasoning reserve path as well.
  PERFORM pg_advisory_xact_lock(hashtext('reasoning_run:' || p_user_id::text));
  -- Recovery refunds the ORIGINAL bucket. Late provider settlement is rejected
  -- by its status check, so it can neither save nor charge after recovery.
  FOR v_row IN SELECT * FROM public.polaris_generations WHERE user_id=p_user_id
    AND status IN ('reserved','running') AND created_at < now() - interval '15 minutes' FOR UPDATE
  LOOP
    IF v_row.spend IN ('base','credit') THEN
      PERFORM public.refund_polaris_spend(p_user_id,v_row.id);
    END IF;
    UPDATE public.polaris_generations SET status='failed' WHERE id=v_row.id;
  END LOOP;
  SELECT * INTO v_row FROM public.polaris_generations WHERE user_id=p_user_id AND request_key=p_key;
  IF FOUND THEN RETURN jsonb_build_object('generation_id',v_row.id,'status',v_row.status); END IF;
  IF EXISTS (SELECT 1 FROM public.polaris_generations WHERE user_id=p_user_id AND status IN ('reserved','running')) THEN
    RAISE EXCEPTION 'polaris_generation_active';
  END IF;
  -- Store content hashes, never a second permanent copy of interview text.
  -- Every selected record is included in the bounded server-built prompt.
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',r.id,'domain',r.audit_period,
      'body_hash',encode(sha256(convert_to(r.body,'UTF8')),'hex'))
      ORDER BY r.created_at DESC,r.id), '[]'::jsonb)
    INTO v_evidence FROM (SELECT id,audit_period,body,created_at,
      row_number() OVER (PARTITION BY audit_period ORDER BY created_at DESC,id) AS domain_rank
      FROM public.records WHERE user_id=p_user_id
      AND kind='audit_response' AND system_tags @> ARRAY['interview']::text[] AND length(trim(body))>0
      AND NOT interview_ai_hold AND NOT ai_hold
      AND audit_period IN ('infancy','school','twenties','later','work','now')) r
    WHERE r.domain_rank <= 3;
  IF jsonb_array_length(v_evidence)=0 THEN RAISE EXCEPTION 'polaris_no_evidence'; END IF;
  IF (SELECT count(*) FROM public.polaris_generations WHERE user_id=p_user_id AND spend='intro'
      AND status IN ('reserved','running','completed')) < 2 THEN
    v_spend := 'intro';
  ELSE
    v_tier := public.effective_subscription_tier(p_user_id);
    v_cap := CASE COALESCE(v_tier,'free') WHEN 'brain' THEN NULL WHEN 'cortex' THEN 7 WHEN 'soma' THEN 7 ELSE 2 END;
    IF v_cap IS NULL THEN v_spend := 'none';
    ELSE
      INSERT INTO public.usage_counters AS uc(user_id,month_bucket,reasoning_used) VALUES(p_user_id,v_week,1)
      ON CONFLICT(user_id,month_bucket) DO UPDATE SET reasoning_used=uc.reasoning_used+1,updated_at=now()
        WHERE uc.reasoning_used<v_cap RETURNING reasoning_used INTO v_count;
      IF v_count IS NOT NULL THEN v_spend := 'base';
      ELSE
        BEGIN
          v_credit := public.spend_credits(p_user_id,1,'reasoning','polaris:'||p_key);
        EXCEPTION WHEN sqlstate 'X0001' OR sqlstate '23503' THEN
          RAISE EXCEPTION 'polaris_limit_exceeded';
        END;
        SELECT ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(v_credit->'entry_ids')) INTO v_entry_ids;
        INSERT INTO public.usage_counters AS uc(user_id,month_bucket,reasoning_used) VALUES(p_user_id,v_week,1)
        ON CONFLICT(user_id,month_bucket) DO UPDATE SET reasoning_used=uc.reasoning_used+1,updated_at=now();
        v_spend := 'credit';
      END IF;
    END IF;
  END IF;
  INSERT INTO public.polaris_generations(user_id,request_key,status,spend,week_bucket,month_bucket,evidence,credit_entry_ids)
    VALUES(p_user_id,p_key,'reserved',v_spend,v_week,v_month,v_evidence,v_entry_ids) RETURNING id INTO v_id;
  RETURN jsonb_build_object('generation_id',v_id,'status','reserved');
END $$;

CREATE OR REPLACE FUNCTION public.polaris_evidence_snapshot(p_user_id uuid,p_evidence jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_record record; v_result jsonb := '[]'; v_text text;
BEGIN
  IF jsonb_typeof(p_evidence) IS DISTINCT FROM 'array' OR jsonb_array_length(p_evidence) NOT BETWEEN 1 AND 18 THEN
    RAISE EXCEPTION 'polaris_evidence_changed';
  END IF;
  FOR v_record IN
    SELECT r.id,r.audit_period,r.body FROM jsonb_array_elements(p_evidence) WITH ORDINALITY e(item,position)
    JOIN public.records r ON r.id::text=e.item->>'id' AND r.user_id=p_user_id
      AND r.audit_period=e.item->>'domain' AND r.kind='audit_response'
      AND r.system_tags @> ARRAY['interview']::text[]
      AND NOT r.interview_ai_hold AND NOT r.ai_hold
      AND encode(sha256(convert_to(r.body,'UTF8')),'hex')=e.item->>'body_hash'
    ORDER BY e.position FOR SHARE OF r
  LOOP
    v_text := trim(v_record.body);
    IF length(v_text)>290 THEN
      v_text := left(v_text,94)||' … '||substring(v_text FROM greatest(length(v_text)/2-47,1) FOR 94)||' … '||right(v_text,94);
    END IF;
    v_result := v_result||jsonb_build_array(jsonb_build_object('id',v_record.id,'domain',v_record.audit_period,'excerpt',v_text));
  END LOOP;
  IF jsonb_array_length(v_result)<>jsonb_array_length(p_evidence) THEN RAISE EXCEPTION 'polaris_evidence_changed'; END IF;
  RETURN v_result;
END $$;

-- CREATE OR REPLACE retains existing ACLs; repeat the established contract.
REVOKE ALL ON FUNCTION public.match_wiki_pages(uuid, vector, int, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_wiki_pages(uuid, vector, int, uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.match_records(uuid, vector, int, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_records(uuid, vector, int, uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.reserve_polaris_generation(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_polaris_generation(uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.polaris_evidence_snapshot(uuid,jsonb) FROM PUBLIC, anon, authenticated, service_role;
