-- INACTIVE S1 DRAFT. No number, rollout, finalizer, wipe executor or client.
-- Keep interview_authority_private outside the Data API exposed schemas.
-- Shipped writers serialize on the owner key. Administrator DML/DDL is not
-- supported concurrent traffic; no global relation lock is introduced here.
CREATE SCHEMA IF NOT EXISTS interview_authority_private;
REVOKE ALL ON SCHEMA interview_authority_private FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA interview_authority_private TO service_role;

CREATE TABLE IF NOT EXISTS public.interview_content_authority (
  owner_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  generation uuid NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
  phase text NOT NULL DEFAULT 'ready' CHECK (phase IN ('ready', 'wipe_pending')),
  current_wipe_id uuid,
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  write_protocol text NOT NULL DEFAULT 'legacy' CHECK (write_protocol IN ('legacy', 'v2-required')),
  CHECK ((phase = 'ready') = (current_wipe_id IS NULL))
);
CREATE TABLE IF NOT EXISTS public.interview_content_wipes (
  operation_id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  old_generation uuid NOT NULL,
  new_generation uuid NOT NULL,
  scope_version text NOT NULL CHECK (scope_version ~ '^[a-z][a-z0-9-]{0,63}$'),
  phase text NOT NULL DEFAULT 'barrier_committed' CHECK (phase = 'barrier_committed'),
  observation text NOT NULL DEFAULT 'not_executed' CHECK (observation = 'not_executed'),
  created_at timestamptz NOT NULL,
  UNIQUE (owner_id, request_id),
  CHECK (old_generation <> new_generation)
);
CREATE TABLE IF NOT EXISTS public.interview_work_contracts (
  session_id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  new_work_key uuid NOT NULL,
  draft_id uuid NOT NULL,
  generation uuid NOT NULL,
  rule_set text NOT NULL DEFAULT 'r0' CHECK (rule_set = 'r0'),
  period text NOT NULL CHECK (period IN ('infancy', 'school', 'twenties', 'later', 'work', 'now')),
  conversation_locale text NOT NULL CHECK (conversation_locale IN ('ko', 'en')),
  ui_language text NOT NULL CHECK (ui_language IN ('ko', 'en', 'es', 'pt', 'id')),
  growth_origin boolean NOT NULL,
  CHECK (conversation_locale = CASE WHEN ui_language='ko' THEN 'ko' ELSE 'en' END),
  created_at timestamptz NOT NULL,
  session_state text NOT NULL DEFAULT 'open'
    CHECK (session_state IN ('open', 'ended', 'folded', 'discarded', 'erased')),
  save_state text NOT NULL DEFAULT 'none' CHECK (save_state IN ('none', 'reserved')),
  save_request_id uuid,
  draft_revision bigint CHECK (draft_revision BETWEEN 0 AND 9007199254740991),
  snapshot_digest bytea CHECK (pg_catalog.octet_length(snapshot_digest) = 32),
  UNIQUE (owner_id, new_work_key),
  CHECK ((save_state = 'none' AND save_request_id IS NULL AND draft_revision IS NULL AND snapshot_digest IS NULL)
    OR (save_state = 'reserved' AND save_request_id IS NOT NULL AND draft_revision IS NOT NULL
      AND (snapshot_digest IS NOT NULL OR session_state = 'erased')))
);
-- Deliberately no session FK: old keys survive session folding/deletion/pruning.
-- S2 adds committed receipts/record FK/erasure hooks as one reviewed transaction
-- contract. S1 cannot label a record committed or a wipe completed.
ALTER TABLE public.interview_content_authority ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interview_content_authority FORCE ROW LEVEL SECURITY;
ALTER TABLE public.interview_content_wipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interview_content_wipes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.interview_work_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interview_work_contracts FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.interview_content_authority, public.interview_content_wipes,
  public.interview_work_contracts FROM PUBLIC, anon, authenticated, service_role;

-- Internal validation is not granted even to service_role. The granted request
-- helper invokes it itself, including when that helper is called directly.
CREATE OR REPLACE FUNCTION interview_authority_private.recheck_access(
  p_owner uuid, p_auth_session uuid, p_expires_at timestamptz
) RETURNS timestamptz LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = '' SET row_security = off AS $body$
DECLARE v_now timestamptz := pg_catalog.clock_timestamp();
BEGIN
  IF p_expires_at IS NULL OR NOT pg_catalog.isfinite(p_expires_at) OR p_expires_at <= v_now
    OR NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id=p_owner AND u.deleted_at IS NULL)
    OR NOT EXISTS (SELECT 1 FROM auth.sessions s WHERE s.id=p_auth_session AND s.user_id=p_owner)
    OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id=p_owner) THEN
    RAISE EXCEPTION 'interview_authority_live_session_required' USING ERRCODE='42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.account_deletion_tombstones t WHERE t.user_id=p_owner) THEN
    RAISE EXCEPTION 'interview_authority_account_closed' USING ERRCODE='42501';
  END IF;
  RETURN v_now;
END;
$body$;

CREATE OR REPLACE FUNCTION interview_authority_private.acquire_access(
  p_owner uuid, p_auth_session uuid, p_expires_at timestamptz, p_exclusive boolean
) RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = '' SET row_security = off AS $body$
DECLARE v_role text; v_direct text; v_claims jsonb;
BEGIN
  BEGIN
    v_direct := NULLIF(pg_catalog.current_setting('request.jwt.claim.role',true),'');
    v_claims := NULLIF(pg_catalog.current_setting('request.jwt.claims',true),'')::jsonb;
    v_role := COALESCE(v_direct,v_claims->>'role');
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'interview_authority_service_required' USING ERRCODE='42501';
  END;
  IF v_role IS DISTINCT FROM 'service_role'
    OR (v_claims IS NOT NULL AND pg_catalog.jsonb_typeof(v_claims)<>'object')
    OR (v_direct IS NOT NULL AND v_claims ? 'role' AND v_direct IS DISTINCT FROM v_claims->>'role') THEN
    RAISE EXCEPTION 'interview_authority_service_required' USING ERRCODE='42501';
  END IF;
  IF p_owner IS NULL OR p_auth_session IS NULL OR p_expires_at IS NULL OR p_exclusive IS NULL THEN
    RAISE EXCEPTION 'interview_authority_invalid_input' USING ERRCODE='22023';
  END IF;
  IF p_exclusive THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner::text,260913));
    PERFORM 1 FROM public.users u WHERE u.id=p_owner FOR UPDATE;
  ELSE
    PERFORM pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(p_owner::text,260913));
    PERFORM 1 FROM public.users u WHERE u.id=p_owner FOR KEY SHARE;
  END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'interview_authority_live_session_required' USING ERRCODE='42501';
  END IF;
  -- Pre-acquire every Auth FK target BEFORE admission time. This can wait; the
  -- final check is below and again after metadata/session/counter row locks.
  PERFORM 1 FROM auth.users u WHERE u.id=p_owner FOR KEY SHARE;
  PERFORM 1 FROM auth.sessions s WHERE s.id=p_auth_session AND s.user_id=p_owner FOR KEY SHARE;
  PERFORM interview_authority_private.recheck_access(p_owner,p_auth_session,p_expires_at);
END;
$body$;

CREATE OR REPLACE FUNCTION interview_authority_private.request(
  p_action text, p_owner uuid, p_auth_session uuid, p_expires_at timestamptz, p_input jsonb
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = '' SET row_security = off AS $body$
DECLARE
  v_authority public.interview_content_authority%ROWTYPE;
  v_work public.interview_work_contracts%ROWTYPE;
  v_session public.interview_sessions%ROWTYPE;
  v_wipe public.interview_content_wipes%ROWTYPE;
  v_allowed text[];
  v_key uuid; v_draft uuid; v_generation uuid; v_session_id uuid; v_request uuid;
  v_revision bigint; v_digest bytea; v_now timestamptz; v_count bigint;
  v_state text; v_period text; v_locale text; v_ui text; v_growth boolean;
BEGIN
  -- No caller-supplied role, owner claim, session claim or JWT is installed.
  PERFORM interview_authority_private.acquire_access(p_owner,p_auth_session,p_expires_at,
    p_action IN ('open','begin_wipe'));
  v_allowed := CASE p_action
    WHEN 'open' THEN ARRAY['newWorkKey','draftId','period','conversationLocale','uiLanguage','growthOrigin']
    WHEN 'inspect' THEN ARRAY['workId']
    WHEN 'begin_wipe' THEN ARRAY['requestId','generation','scopeVersion']
    WHEN 'inspect_wipe' THEN ARRAY['requestId']
    WHEN 'reserve' THEN ARRAY['workId','generation','requestId','draftRevision','snapshotDigest',
      'draftId','period','conversationLocale','uiLanguage','growthOrigin']
    WHEN 'lookup' THEN ARRAY['workId','requestId'] ELSE NULL END;
  IF v_allowed IS NULL OR p_input IS NULL OR pg_catalog.jsonb_typeof(p_input)<>'object'
    OR EXISTS (SELECT 1 FROM pg_catalog.jsonb_object_keys(p_input) k WHERE NOT k=ANY(v_allowed))
    OR EXISTS (SELECT 1 FROM pg_catalog.unnest(v_allowed) k WHERE NOT p_input ? k) THEN
    RAISE EXCEPTION 'interview_authority_invalid_input' USING ERRCODE='22023';
  END IF;
  IF p_action IN ('open','reserve') THEN
    v_draft := (p_input->>'draftId')::uuid;
    v_period := p_input->>'period'; v_locale := p_input->>'conversationLocale';
    v_ui := p_input->>'uiLanguage';
    IF v_draft IS NULL OR v_period IS NULL OR v_period NOT IN ('infancy','school','twenties','later','work','now')
      OR v_locale IS NULL OR v_locale NOT IN ('ko','en') OR v_ui IS NULL OR v_ui NOT IN ('ko','en','es','pt','id')
      OR v_locale<>(CASE WHEN v_ui='ko' THEN 'ko' ELSE 'en' END)
      OR pg_catalog.jsonb_typeof(p_input->'growthOrigin') IS DISTINCT FROM 'boolean' THEN
      RAISE EXCEPTION 'interview_authority_invalid_identity' USING ERRCODE='22023';
    END IF;
    v_growth := (p_input->>'growthOrigin')::boolean;
  END IF;
  SELECT * INTO v_authority FROM public.interview_content_authority a WHERE a.owner_id=p_owner;

  IF p_action='open' THEN
    v_key := (p_input->>'newWorkKey')::uuid;
    IF v_key IS NULL THEN RAISE EXCEPTION 'interview_authority_invalid_input' USING ERRCODE='22023'; END IF;
    SELECT * INTO v_work FROM public.interview_work_contracts w
      WHERE w.owner_id=p_owner AND w.new_work_key=v_key FOR UPDATE;
    IF FOUND THEN
      IF (v_work.draft_id,v_work.period,v_work.conversation_locale,v_work.ui_language,v_work.growth_origin)
        IS DISTINCT FROM (v_draft,v_period,v_locale,v_ui,v_growth) THEN
        RAISE EXCEPTION 'interview_work_binding_conflict' USING ERRCODE='22023';
      END IF;
      -- Replay before cap/phase/generation checks. It never rewrites timestamps.
    ELSE
      IF v_authority.owner_id IS NOT NULL AND v_authority.phase<>'ready' THEN
        RETURN pg_catalog.jsonb_build_object('state','wipe_pending');
      END IF;
      v_session_id := pg_catalog.gen_random_uuid();
      IF NOT pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('interview_session:'||v_session_id::text,0)) THEN
        RAISE EXCEPTION 'interview_authority_busy_retry' USING ERRCODE='40001';
      END IF;
      IF EXISTS (SELECT 1 FROM public.interview_sessions s WHERE s.id=v_session_id)
        OR EXISTS (SELECT 1 FROM public.interview_session_tombstones t WHERE t.session_id=v_session_id)
        OR EXISTS (SELECT 1 FROM public.interview_work_contracts w WHERE w.session_id=v_session_id) THEN
        RAISE EXCEPTION 'interview_authority_id_collision_retry' USING ERRCODE='40001';
      END IF;
      -- All shipped INSERTs already hold this owner's SHARED key; our EXCLUSIVE
      -- key excludes invisible same-owner bucket INSERTs. Sweep can delete old
      -- rows without that key, so pre-lock every existing owner bucket NOWAIT.
      BEGIN
        PERFORM 1 FROM public.interview_session_starts c WHERE c.owner_id=p_owner
          ORDER BY c.bucket_start FOR UPDATE NOWAIT;
      EXCEPTION WHEN lock_not_available THEN
        RAISE EXCEPTION 'interview_authority_busy_retry' USING ERRCODE='40001';
      END;
      v_now := interview_authority_private.recheck_access(p_owner,p_auth_session,p_expires_at);
      SELECT COALESCE(pg_catalog.sum(c.created),0) INTO v_count FROM public.interview_session_starts c
        WHERE c.owner_id=p_owner AND c.bucket_start>=pg_catalog.date_bin(interval '10 minutes',
          v_now-interval '1 hour',timestamptz '2000-01-01 00:00:00+00');
      IF v_count>=30 THEN RETURN pg_catalog.jsonb_build_object('state','rate_limited'); END IF;
      IF v_authority.owner_id IS NULL THEN
        INSERT INTO public.interview_content_authority(owner_id) VALUES(p_owner) RETURNING * INTO v_authority;
      END IF;
      INSERT INTO public.interview_work_contracts(session_id,owner_id,new_work_key,draft_id,generation,
        period,conversation_locale,ui_language,growth_origin,created_at)
      VALUES(v_session_id,p_owner,v_key,v_draft,v_authority.generation,v_period,v_locale,v_ui,v_growth,v_now)
      RETURNING * INTO v_work;
      INSERT INTO public.interview_sessions(id,owner_id,period,locale,started_at,last_seen_at)
        VALUES(v_session_id,p_owner,v_period,v_locale,v_now,v_now);
      -- Existing AFTER INSERT trigger is the only starts increment. No upsert,
      -- exception swallowing or second session creation is permitted here.
      PERFORM interview_authority_private.recheck_access(p_owner,p_auth_session,p_expires_at);
    END IF;
  ELSIF p_action IN ('begin_wipe','inspect_wipe') THEN
    v_request := (p_input->>'requestId')::uuid;
    IF v_request IS NULL THEN RAISE EXCEPTION 'interview_authority_invalid_input' USING ERRCODE='22023'; END IF;
    SELECT * INTO v_wipe FROM public.interview_content_wipes w WHERE w.owner_id=p_owner AND w.request_id=v_request;
    IF p_action='begin_wipe' THEN
      v_generation := (p_input->>'generation')::uuid;
      IF v_generation IS NULL OR (p_input->>'scopeVersion') IS NULL
        OR (p_input->>'scopeVersion') !~ '^[a-z][a-z0-9-]{0,63}$' THEN
        RAISE EXCEPTION 'interview_authority_invalid_input' USING ERRCODE='22023';
      END IF;
      IF v_wipe.operation_id IS NOT NULL THEN
        IF v_wipe.old_generation<>v_generation OR v_wipe.scope_version<>p_input->>'scopeVersion' THEN
          RAISE EXCEPTION 'interview_wipe_binding_conflict' USING ERRCODE='22023';
        END IF;
      ELSE
        IF v_authority.owner_id IS NULL THEN RETURN pg_catalog.jsonb_build_object('state','unconfirmed'); END IF;
        IF v_authority.phase<>'ready' THEN RETURN pg_catalog.jsonb_build_object('state','wipe_pending'); END IF;
        IF v_authority.generation<>v_generation THEN
          RAISE EXCEPTION 'interview_generation_conflict' USING ERRCODE='22023';
        END IF;
        v_now := interview_authority_private.recheck_access(p_owner,p_auth_session,p_expires_at);
        INSERT INTO public.interview_content_wipes(owner_id,request_id,old_generation,new_generation,scope_version,created_at)
          VALUES(p_owner,v_request,v_generation,pg_catalog.gen_random_uuid(),p_input->>'scopeVersion',v_now)
          RETURNING * INTO v_wipe;
        UPDATE public.interview_content_authority SET generation=v_wipe.new_generation,phase='wipe_pending',
          current_wipe_id=v_wipe.operation_id,revision=revision+1 WHERE owner_id=p_owner;
        PERFORM interview_authority_private.recheck_access(p_owner,p_auth_session,p_expires_at);
      END IF;
    END IF;
    PERFORM interview_authority_private.recheck_access(p_owner,p_auth_session,p_expires_at);
    IF v_wipe.operation_id IS NULL THEN RETURN pg_catalog.jsonb_build_object('state','not_found'); END IF;
    RETURN pg_catalog.jsonb_build_object('state',v_wipe.phase,'operationId',v_wipe.operation_id,
      'requestId',v_wipe.request_id,'oldGeneration',v_wipe.old_generation,'generation',v_wipe.new_generation,
      'scopeVersion',v_wipe.scope_version,'observation',v_wipe.observation,'createdAt',v_wipe.created_at);
  ELSE
    v_session_id := (p_input->>'workId')::uuid;
    IF v_session_id IS NULL AND p_action<>'inspect' THEN
      RAISE EXCEPTION 'interview_authority_invalid_input' USING ERRCODE='22023';
    END IF;
    IF v_session_id IS NULL THEN
      PERFORM interview_authority_private.recheck_access(p_owner,p_auth_session,p_expires_at);
      IF v_authority.owner_id IS NULL THEN RETURN pg_catalog.jsonb_build_object('state','unconfirmed'); END IF;
      RETURN pg_catalog.jsonb_build_object('state',v_authority.phase,'generation',v_authority.generation,
        'revision',v_authority.revision,'writeProtocol',v_authority.write_protocol);
    END IF;
    IF p_action='reserve' THEN
      SELECT * INTO v_work FROM public.interview_work_contracts w
        WHERE w.owner_id=p_owner AND w.session_id=v_session_id FOR UPDATE;
    ELSE
      SELECT * INTO v_work FROM public.interview_work_contracts w WHERE w.owner_id=p_owner AND w.session_id=v_session_id;
    END IF;
    IF v_work.session_id IS NULL THEN RETURN pg_catalog.jsonb_build_object('state','not_found'); END IF;
  END IF;

  IF p_action='reserve' THEN
    v_generation := (p_input->>'generation')::uuid; v_request := (p_input->>'requestId')::uuid;
    IF v_generation IS NULL OR v_request IS NULL
      OR pg_catalog.jsonb_typeof(p_input->'draftRevision') IS DISTINCT FROM 'number'
      OR (p_input->>'draftRevision') !~ '^(0|[1-9][0-9]{0,15})$'
      OR (p_input->>'snapshotDigest') IS NULL OR (p_input->>'snapshotDigest') !~ '^[0-9a-f]{64}$' THEN
      RAISE EXCEPTION 'interview_authority_invalid_input' USING ERRCODE='22023';
    END IF;
    v_revision := (p_input->>'draftRevision')::bigint;
    IF v_revision>9007199254740991 THEN RAISE EXCEPTION 'interview_authority_invalid_input' USING ERRCODE='22023'; END IF;
    v_digest := pg_catalog.decode(p_input->>'snapshotDigest','hex');
    IF (v_work.generation,v_work.draft_id,v_work.period,v_work.conversation_locale,v_work.ui_language,v_work.growth_origin)
      IS DISTINCT FROM (v_generation,v_draft,v_period,v_locale,v_ui,v_growth) THEN
      RAISE EXCEPTION 'interview_work_binding_conflict' USING ERRCODE='22023';
    END IF;
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('interview_session:'||v_work.session_id::text,0));
    -- Direct DELETE holds the session row before it tries the session key. The
    -- legacy hook uses try-lock and retries, so this row wait has no cycle.
    SELECT * INTO v_session FROM public.interview_sessions s WHERE s.id=v_work.session_id FOR UPDATE;
  ELSE
    SELECT * INTO v_session FROM public.interview_sessions s WHERE s.id=v_work.session_id;
  END IF;
  v_now := interview_authority_private.recheck_access(p_owner,p_auth_session,p_expires_at);
  v_state := CASE WHEN v_work.session_state='erased' THEN 'erased'
    WHEN v_work.session_state IN ('folded','discarded') OR v_session.id IS NULL
      OR v_session.owner_id<>p_owner OR v_session.last_seen_at<=v_now-interval '6 hours'
      OR v_authority.owner_id IS NULL OR v_authority.generation<>v_work.generation THEN 'closed'
    WHEN v_authority.phase<>'ready' THEN 'wipe_pending'
    WHEN v_session.ended_at IS NOT NULL OR v_work.session_state='ended' THEN 'ended' ELSE 'ready' END;
  IF p_action='lookup' THEN
    v_request := (p_input->>'requestId')::uuid;
    IF v_request IS NULL THEN RAISE EXCEPTION 'interview_authority_invalid_input' USING ERRCODE='22023'; END IF;
    IF v_work.save_request_id IS DISTINCT FROM v_request THEN RETURN pg_catalog.jsonb_build_object('state','not_found'); END IF;
  ELSIF p_action='reserve' AND v_state IN ('ready','ended') THEN
    IF v_work.save_state='reserved' THEN
      IF (v_work.save_request_id,v_work.draft_revision,v_work.snapshot_digest)
        IS DISTINCT FROM (v_request,v_revision,v_digest) THEN
        RAISE EXCEPTION 'interview_save_binding_conflict' USING ERRCODE='22023';
      END IF;
    ELSE
      UPDATE public.interview_work_contracts SET save_state='reserved',save_request_id=v_request,
        draft_revision=v_revision,snapshot_digest=v_digest WHERE session_id=v_work.session_id RETURNING * INTO v_work;
    END IF;
    PERFORM interview_authority_private.recheck_access(p_owner,p_auth_session,p_expires_at);
  END IF;
  RETURN pg_catalog.jsonb_build_object('state',CASE WHEN p_action IN ('reserve','lookup')
      AND v_state IN ('ready','ended') AND v_work.save_state='reserved' THEN 'reserved' ELSE v_state END,
    'workState',v_state,'workId',v_work.session_id,'newWorkKey',v_work.new_work_key,
    'draftId',v_work.draft_id,'generation',v_work.generation,'ruleSet',v_work.rule_set,'period',v_work.period,
    'conversationLocale',v_work.conversation_locale,'uiLanguage',v_work.ui_language,'growthOrigin',v_work.growth_origin,
    'createdAt',v_work.created_at,'saveState',v_work.save_state,'saveRequestId',v_work.save_request_id,
    'draftRevision',v_work.draft_revision,'writeProtocol',v_authority.write_protocol);
END;
$body$;

-- Typed INVOKER facades. Both these and request() are service-only; service_role
-- can call request() directly but cannot bypass its claim/Auth/input checks.
CREATE OR REPLACE FUNCTION public.open_interview_work(p_owner uuid,p_auth_session uuid,p_expires_at timestamptz,
  p_new_work_key uuid,p_draft_id uuid,p_period text,p_conversation_locale text,p_ui_language text,p_growth_origin boolean)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $body$
  SELECT interview_authority_private.request('open',p_owner,p_auth_session,p_expires_at,
    pg_catalog.jsonb_build_object('newWorkKey',p_new_work_key,'draftId',p_draft_id,'period',p_period,
      'conversationLocale',p_conversation_locale,'uiLanguage',p_ui_language,'growthOrigin',p_growth_origin));
$body$;
CREATE OR REPLACE FUNCTION public.inspect_interview_authority(p_owner uuid,p_auth_session uuid,p_expires_at timestamptz,p_work_id uuid)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $body$
  SELECT interview_authority_private.request('inspect',p_owner,p_auth_session,p_expires_at,pg_catalog.jsonb_build_object('workId',p_work_id));
$body$;
CREATE OR REPLACE FUNCTION public.begin_interview_content_wipe(p_owner uuid,p_auth_session uuid,p_expires_at timestamptz,
  p_request_id uuid,p_generation uuid,p_scope_version text)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $body$
  SELECT interview_authority_private.request('begin_wipe',p_owner,p_auth_session,p_expires_at,
    pg_catalog.jsonb_build_object('requestId',p_request_id,'generation',p_generation,'scopeVersion',p_scope_version));
$body$;
CREATE OR REPLACE FUNCTION public.inspect_interview_content_wipe(p_owner uuid,p_auth_session uuid,p_expires_at timestamptz,p_request_id uuid)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $body$
  SELECT interview_authority_private.request('inspect_wipe',p_owner,p_auth_session,p_expires_at,pg_catalog.jsonb_build_object('requestId',p_request_id));
$body$;
CREATE OR REPLACE FUNCTION public.reserve_interview_save(p_owner uuid,p_auth_session uuid,p_expires_at timestamptz,
  p_work_id uuid,p_generation uuid,p_request_id uuid,p_draft_revision bigint,p_snapshot_digest bytea,
  p_draft_id uuid,p_period text,p_conversation_locale text,p_ui_language text,p_growth_origin boolean)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $body$
  SELECT interview_authority_private.request('reserve',p_owner,p_auth_session,p_expires_at,
    pg_catalog.jsonb_build_object('workId',p_work_id,'generation',p_generation,'requestId',p_request_id,
      'draftRevision',p_draft_revision,'snapshotDigest',pg_catalog.encode(p_snapshot_digest,'hex'),
      'draftId',p_draft_id,'period',p_period,'conversationLocale',p_conversation_locale,'uiLanguage',p_ui_language,'growthOrigin',p_growth_origin));
$body$;
CREATE OR REPLACE FUNCTION public.lookup_interview_save(p_owner uuid,p_auth_session uuid,p_expires_at timestamptz,p_work_id uuid,p_request_id uuid)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $body$
  SELECT interview_authority_private.request('lookup',p_owner,p_auth_session,p_expires_at,
    pg_catalog.jsonb_build_object('workId',p_work_id,'requestId',p_request_id));
$body$;

REVOKE ALL ON FUNCTION interview_authority_private.recheck_access(uuid,uuid,timestamptz),
  interview_authority_private.acquire_access(uuid,uuid,timestamptz,boolean)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION interview_authority_private.request(text,uuid,uuid,timestamptz,jsonb),
  public.open_interview_work(uuid,uuid,timestamptz,uuid,uuid,text,text,text,boolean),
  public.inspect_interview_authority(uuid,uuid,timestamptz,uuid),
  public.begin_interview_content_wipe(uuid,uuid,timestamptz,uuid,uuid,text),
  public.inspect_interview_content_wipe(uuid,uuid,timestamptz,uuid),
  public.reserve_interview_save(uuid,uuid,timestamptz,uuid,uuid,uuid,bigint,bytea,uuid,text,text,text,boolean),
  public.lookup_interview_save(uuid,uuid,timestamptz,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION interview_authority_private.request(text,uuid,uuid,timestamptz,jsonb),
  public.open_interview_work(uuid,uuid,timestamptz,uuid,uuid,text,text,text,boolean),
  public.inspect_interview_authority(uuid,uuid,timestamptz,uuid),
  public.begin_interview_content_wipe(uuid,uuid,timestamptz,uuid,uuid,text),
  public.inspect_interview_content_wipe(uuid,uuid,timestamptz,uuid),
  public.reserve_interview_save(uuid,uuid,timestamptz,uuid,uuid,uuid,bigint,bytea,uuid,text,text,text,boolean),
  public.lookup_interview_save(uuid,uuid,timestamptz,uuid,uuid) TO service_role;
