-- DRAFT ONLY. Console owns numbering/application and Edge deployment.
-- Order: apply draft with enabled=false; deploy OpenAI's snapshot/settlement
-- wrapper and the shared unsupported-vendor guard in ALL four proxy bundles;
-- run reserve/race/refund/ratify canaries; then enable the singleton. Only
-- OpenAI supports Polaris. The other three proxies fail closed before spend
-- or provider dispatch. The client pins this purpose to OpenAI without failover.
-- Claim now returns hash-checked bounded excerpts; old ID-only claims must fail
-- closed. Deploy ratify_polaris_role_card before exposing card approval UI.
-- Prerequisites: 0189 + 0190 (erase_my_data stays locked), and the promoted
-- account_deletion_completion_fence draft. Reuse its owner lock/tombstone.
-- On numbering, add polaris_generations=retained to the canonical erasure
-- registry and forward-render/gate contract; do not rewrite historical 0189.
-- Two lifetime successful introductions, then the EXISTING shared reasoning
-- weekly allowance (tier-map.ts: free 2, soma/cortex 7, brain unlimited).
CREATE TABLE public.polaris_generation_config (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enabled boolean NOT NULL DEFAULT false
);
INSERT INTO public.polaris_generation_config VALUES (true, false);
REVOKE ALL ON public.polaris_generation_config FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.polaris_generation_config TO service_role;
ALTER TABLE public.polaris_generation_config ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.polaris_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_key text NOT NULL CHECK (length(request_key) BETWEEN 8 AND 120),
  status text NOT NULL CHECK (status IN ('reserved','running','completed','failed')),
  spend text NOT NULL CHECK (spend IN ('intro','base','credit','none')),
  week_bucket text NOT NULL,
  month_bucket text NOT NULL,
  evidence jsonb NOT NULL,
  credit_entry_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, request_key)
);
CREATE UNIQUE INDEX polaris_one_active ON public.polaris_generations(user_id)
  WHERE status IN ('reserved','running');
ALTER TABLE public.polaris_generations ENABLE ROW LEVEL SECURITY;
CREATE POLICY polaris_owner_read ON public.polaris_generations FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
REVOKE ALL ON public.polaris_generations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.polaris_generations TO authenticated;
GRANT ALL ON public.polaris_generations TO service_role;

DO $$ BEGIN
  IF to_regclass('public.account_deletion_tombstones') IS NULL
     OR to_regclass('public.erasure_registry') IS NULL
     OR to_regprocedure('public.erase_my_data(text)') IS NULL THEN
    RAISE EXCEPTION 'polaris_erasure_prerequisites_missing';
  END IF;
  IF has_function_privilege('authenticated','public.erase_my_data(text)','EXECUTE') THEN
    RAISE EXCEPTION 'polaris_erasure_rpc_must_remain_locked';
  END IF;
END $$;
-- Lifetime quota/idempotency facts survive a content wipe, like reasoning
-- allowances. The record-delete trigger below removes all source hashes and
-- derived Polaris cards. Terminal account deletion cascades this ledger.
INSERT INTO public.erasure_registry(table_name,owner_column,class,reason)
VALUES('polaris_generations','user_id','retained',
  'Polaris lifetime allowance and request replay ledger. Content deletion clears evidence hashes and derived cards, fails and refunds active requests; terminal account deletion cascades the ledger.')
ON CONFLICT(table_name) DO UPDATE SET owner_column=EXCLUDED.owner_column,class=EXCLUDED.class,
  reason=EXCLUDED.reason,delete_order=NULL,cascades_from=NULL;

CREATE FUNCTION public.assert_polaris_account_active(p_user_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- Same shared side of begin_account_deletion's existing exclusive lock.
  PERFORM pg_advisory_xact_lock_shared(hashtextextended(p_user_id::text,260913));
  IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=p_user_id)
    OR EXISTS(SELECT 1 FROM public.account_deletion_tombstones WHERE user_id=p_user_id) THEN
    RAISE EXCEPTION 'account_deletion_in_progress' USING ERRCODE='42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.assert_polaris_account_active(uuid) FROM PUBLIC,anon,authenticated,service_role;

-- Current credit contract (0135+): reward counters are derived/frozen.
-- The ledger's internal refund helper is also used by reasoning refunds.
CREATE FUNCTION public.refund_polaris_spend(p_user_id uuid,p_generation_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_row public.polaris_generations%ROWTYPE; v_entry uuid;
BEGIN
  SELECT * INTO v_row FROM public.polaris_generations WHERE id=p_generation_id AND user_id=p_user_id;
  IF NOT FOUND OR v_row.spend NOT IN ('base','credit') THEN RETURN; END IF;
  UPDATE public.usage_counters SET reasoning_used=GREATEST(reasoning_used-1,0),updated_at=now()
    WHERE user_id=p_user_id AND month_bucket=v_row.week_bucket;
  FOREACH v_entry IN ARRAY v_row.credit_entry_ids LOOP
    PERFORM public.credit_refund_spend_internal(v_entry,'Polaris generation refunded');
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.refund_polaris_spend(uuid,uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.polaris_generation_status(p_user_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'owner_required' USING ERRCODE='42501';
  END IF;
  PERFORM public.assert_polaris_account_active(p_user_id);
  RETURN jsonb_build_object('available', COALESCE((SELECT enabled FROM public.polaris_generation_config),false),
    'intro_remaining', GREATEST(0, 2 - (SELECT count(*) FROM public.polaris_generations
      WHERE user_id=p_user_id AND spend='intro' AND status IN ('reserved','running','completed'))),
    'tier', public.effective_subscription_tier(p_user_id));
END $$;

CREATE FUNCTION public.reserve_polaris_generation(p_user_id uuid, p_key text) RETURNS jsonb
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
      AND kind='audit_response' AND tags @> ARRAY['interview']::text[] AND length(trim(body))>0
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

-- Internal content fence. Record locks last until claim/settlement commits.
-- Returns only the bounded excerpts used by the provider, not whole records.
CREATE FUNCTION public.polaris_evidence_snapshot(p_user_id uuid,p_evidence jsonb) RETURNS jsonb
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
      AND r.tags @> ARRAY['interview']::text[]
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
REVOKE ALL ON FUNCTION public.polaris_evidence_snapshot(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;

-- Service-only claim is single use. A replay cannot dispatch a second LLM call.
CREATE FUNCTION public.claim_polaris_generation(p_user_id uuid,p_generation_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_evidence jsonb; v_snapshot jsonb;
BEGIN
  PERFORM public.assert_polaris_account_active(p_user_id);
  PERFORM pg_advisory_xact_lock(hashtext('polaris:'||p_user_id::text));
  IF NOT COALESCE((SELECT enabled FROM public.polaris_generation_config),false) THEN RAISE EXCEPTION 'polaris_unavailable'; END IF;
  UPDATE public.polaris_generations SET status='running' WHERE id=p_generation_id AND user_id=p_user_id
    AND status='reserved' AND created_at>now()-interval '15 minutes' RETURNING evidence INTO v_evidence;
  IF NOT FOUND THEN RAISE EXCEPTION 'polaris_reservation_required'; END IF;
  v_snapshot := public.polaris_evidence_snapshot(p_user_id,v_evidence);
  RETURN v_snapshot;
END $$;

CREATE FUNCTION public.settle_polaris_generation(p_user_id uuid,p_generation_id uuid,p_cards jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_row public.polaris_generations%ROWTYPE; v_old jsonb; v_next jsonb; v_card jsonb;
BEGIN
  -- Failure/refund remains possible after the deletion fence. New content does not.
  IF p_cards IS NOT NULL THEN PERFORM public.assert_polaris_account_active(p_user_id); END IF;
  PERFORM pg_advisory_xact_lock(hashtext('polaris:' || p_user_id::text));
  SELECT * INTO v_row FROM public.polaris_generations WHERE id=p_generation_id AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'polaris_reservation_required'; END IF;
  IF v_row.status='completed' THEN RETURN true; END IF;
  IF v_row.status NOT IN ('reserved','running') THEN RETURN false; END IF;
  IF p_cards IS NOT NULL AND v_row.status='running' AND jsonb_typeof(p_cards)='array'
      AND jsonb_array_length(p_cards) BETWEEN 1 AND 3 THEN
    PERFORM public.polaris_evidence_snapshot(p_user_id,v_row.evidence);
    FOR v_card IN SELECT value FROM jsonb_array_elements(p_cards) LOOP
      IF v_card->>'status' IS DISTINCT FROM 'proposed' OR jsonb_array_length(v_card->'evidenceRefs')=0 THEN
        RAISE EXCEPTION 'invalid_polaris_draft';
      END IF;
      IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_card->'evidenceRefs') ref
        WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_row.evidence) e WHERE 'record:'||(e->>'id')=ref)) THEN
        RAISE EXCEPTION 'polaris_evidence_changed';
      END IF;
    END LOOP;
    INSERT INTO public.personas(user_id,version,traits,values,patterns,markdown_export)
      VALUES(p_user_id,1,'{"openness":0.5,"conscientiousness":0.5,"extraversion":0.5,"agreeableness":0.5,"neuroticism":0.5}',
        '[]','{}','') ON CONFLICT(user_id,version) DO NOTHING;
    SELECT CASE WHEN jsonb_typeof(patterns->'role_cards_v1')='string'
      THEN (patterns->>'role_cards_v1')::jsonb ELSE '[]'::jsonb END INTO v_old
      FROM public.personas WHERE user_id=p_user_id AND version=1 FOR UPDATE;
    -- Keep every approved card intact. New drafts may fill remaining slots.
    SELECT COALESCE(jsonb_agg(c ORDER BY priority,position),'[]'::jsonb) INTO v_next FROM (
      SELECT value c,0 priority,position FROM jsonb_array_elements(v_old) WITH ORDINALITY approved(value,position) WHERE value->>'status'='ratified'
      UNION ALL SELECT draft.value c,1 priority,draft.position FROM jsonb_array_elements(p_cards) WITH ORDINALITY draft(value,position) WHERE NOT EXISTS
        (SELECT 1 FROM jsonb_array_elements(v_old) old WHERE old->>'status'='ratified' AND old->>'id'=draft.value->>'id')
      ORDER BY priority,position
      LIMIT 3) merged;
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_next) WHERE value->>'status'='proposed') THEN
      -- A full approved deck has no room for a new result: do not charge.
      p_cards := NULL;
    ELSE
      UPDATE public.personas SET patterns=COALESCE(patterns,'{}'::jsonb)||jsonb_build_object('role_cards_v1',v_next::text)
        WHERE user_id=p_user_id AND version=1;
      UPDATE public.polaris_generations SET status='completed' WHERE id=p_generation_id;
      RETURN true;
    END IF;
  END IF;
  IF v_row.spend IN ('base','credit') THEN
    PERFORM public.refund_polaris_spend(p_user_id,v_row.id);
  END IF;
  UPDATE public.polaris_generations SET status='failed' WHERE id=p_generation_id;
  RETURN false;
END $$;

CREATE FUNCTION public.cancel_polaris_generation(p_user_id uuid,p_generation_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id OR auth.uid() IS NULL THEN RAISE EXCEPTION 'owner_required' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('polaris:' || p_user_id::text));
  PERFORM 1 FROM public.polaris_generations WHERE id=p_generation_id AND user_id=p_user_id AND status='reserved' FOR UPDATE;
  IF FOUND THEN PERFORM public.settle_polaris_generation(p_user_id,p_generation_id,NULL); END IF;
END $$;

-- Card-specific compare-and-set: serialize with generation settlement and
-- preserve sibling approvals, freshly generated drafts, and other patterns.
CREATE FUNCTION public.ratify_polaris_role_card(p_user_id uuid,p_card jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_old jsonb; v_current jsonb; v_next jsonb;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id OR auth.uid() IS NULL THEN RAISE EXCEPTION 'owner_required' USING ERRCODE='42501'; END IF;
  PERFORM public.assert_polaris_account_active(p_user_id);
  IF jsonb_typeof(p_card) IS DISTINCT FROM 'object' OR coalesce(p_card->>'id','')='' THEN RAISE EXCEPTION 'invalid_polaris_card'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('polaris:' || p_user_id::text));
  SELECT CASE WHEN jsonb_typeof(patterns->'role_cards_v1')='string'
    THEN (patterns->>'role_cards_v1')::jsonb ELSE '[]'::jsonb END INTO v_old
    FROM public.personas WHERE user_id=p_user_id AND version=1 FOR UPDATE;
  SELECT value INTO v_current FROM jsonb_array_elements(v_old) WHERE value->>'id'=p_card->>'id';
  IF v_current IS NULL OR (v_current-'status') IS DISTINCT FROM (p_card-'status') THEN
    RAISE EXCEPTION 'polaris_card_changed';
  END IF;
  IF v_current->>'status'='ratified' THEN RETURN; END IF;
  IF v_current->>'status' IS DISTINCT FROM 'proposed' THEN RAISE EXCEPTION 'invalid_polaris_card'; END IF;
  SELECT jsonb_agg(CASE WHEN value->>'id'=p_card->>'id' THEN value||'{"status":"ratified"}'::jsonb ELSE value END ORDER BY position)
    INTO v_next FROM jsonb_array_elements(v_old) WITH ORDINALITY c(value,position);
  UPDATE public.personas SET patterns=patterns||jsonb_build_object('role_cards_v1',v_next::text)
    WHERE user_id=p_user_id AND version=1;
END $$;
REVOKE ALL ON FUNCTION public.ratify_polaris_role_card(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.ratify_polaris_role_card(uuid,jsonb) TO authenticated;

-- All existing record deletion paths (single/bulk/content/account cascade)
-- remove source fingerprints and affected role cards in the same transaction.
-- Preserve successful allowance facts so wiping content cannot mint new free runs.
CREATE FUNCTION public.erase_polaris_record_evidence() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_generation public.polaris_generations%ROWTYPE; v_patterns jsonb; v_cards jsonb; v_next jsonb; v_owner uuid;
BEGIN
  IF TG_LEVEL='STATEMENT' THEN
    -- Owner/RLS deletions take the same lock order BEFORE record row locks,
    -- avoiding a generation-row/record-row inversion with settlement.
    -- Terminal service deletion is already fenced by begin_account_deletion.
    v_owner := auth.uid();
    IF v_owner IS NOT NULL THEN
      PERFORM pg_advisory_xact_lock_shared(hashtextextended(v_owner::text,260913));
      PERFORM pg_advisory_xact_lock(hashtext('polaris:'||v_owner::text));
    END IF;
    RETURN NULL;
  END IF;
  FOR v_generation IN SELECT * FROM public.polaris_generations
    WHERE user_id=OLD.user_id AND evidence @> jsonb_build_array(jsonb_build_object('id',OLD.id)) FOR UPDATE
  LOOP
    IF v_generation.status IN ('reserved','running') AND EXISTS(SELECT 1 FROM auth.users WHERE id=OLD.user_id) THEN
      PERFORM public.refund_polaris_spend(OLD.user_id,v_generation.id);
    END IF;
    UPDATE public.polaris_generations SET evidence='[]'::jsonb,
      status=CASE WHEN status IN ('reserved','running') THEN 'failed' ELSE status END
      WHERE id=v_generation.id;
  END LOOP;
  SELECT patterns INTO v_patterns FROM public.personas WHERE user_id=OLD.user_id AND version=1 FOR UPDATE;
  IF jsonb_typeof(v_patterns->'role_cards_v1')='string' THEN
    BEGIN v_cards := (v_patterns->>'role_cards_v1')::jsonb;
    EXCEPTION WHEN invalid_text_representation THEN v_cards := '[]'::jsonb; END;
    IF jsonb_typeof(v_cards)='array' THEN
      SELECT coalesce(jsonb_agg(value ORDER BY position),'[]'::jsonb) INTO v_next
        FROM jsonb_array_elements(v_cards) WITH ORDINALITY c(value,position)
        WHERE NOT coalesce(value->'evidenceRefs' @> jsonb_build_array('record:'||OLD.id::text),false);
      IF v_next IS DISTINCT FROM v_cards THEN
        UPDATE public.personas SET patterns=v_patterns||jsonb_build_object('role_cards_v1',v_next::text)
          WHERE user_id=OLD.user_id AND version=1;
      END IF;
    END IF;
  END IF;
  RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION public.erase_polaris_record_evidence() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER lock_polaris_record_erasure BEFORE DELETE ON public.records
  FOR EACH STATEMENT EXECUTE FUNCTION public.erase_polaris_record_evidence();
CREATE TRIGGER erase_polaris_record_evidence AFTER DELETE ON public.records
  FOR EACH ROW EXECUTE FUNCTION public.erase_polaris_record_evidence();

REVOKE ALL ON FUNCTION public.polaris_generation_status(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.reserve_polaris_generation(uuid,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.cancel_polaris_generation(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.polaris_generation_status(uuid),public.reserve_polaris_generation(uuid,text),public.cancel_polaris_generation(uuid,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.claim_polaris_generation(uuid,uuid),public.settle_polaris_generation(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_polaris_generation(uuid,uuid),public.settle_polaris_generation(uuid,uuid,jsonb) TO service_role;
