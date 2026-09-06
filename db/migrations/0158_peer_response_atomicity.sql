-- Serialize anonymous peer-response mutations in the database. The former Edge
-- path performed consent, observation, and invitation writes as independent
-- requests, so a submit that had read "pending" could revive a concurrently
-- withdrawn invitation. One row lock and one transaction now decide the result.

BEGIN;

SET LOCAL lock_timeout = '10s';

-- These tables contain account-owned invitations and third-party response
-- material. Keep their policies authoritative even for a non-BYPASSRLS owner,
-- and remove every direct client privilege from the response tables.
ALTER TABLE public.peer_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.peer_invitations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.informant_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.informant_consents FORCE ROW LEVEL SECURITY;
ALTER TABLE public.peer_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.peer_observations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.informant_consents, public.peer_observations
  FROM PUBLIC, anon, authenticated;

-- Withdrawal is an absorbing state. This also protects the rollout window in
-- which an older Edge isolate may still attempt its final direct status update.
CREATE OR REPLACE FUNCTION public.keep_peer_withdrawal_terminal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.invite_token_hash IS DISTINCT FROM OLD.invite_token_hash
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
    RAISE EXCEPTION 'peer_invitation_identity_is_immutable'
      USING ERRCODE = '23514';
  END IF;
  IF OLD.status = 'withdrawn' AND NEW.status <> 'withdrawn' THEN
    RAISE EXCEPTION 'peer_invitation_withdrawal_is_final'
      USING ERRCODE = '23514';
  END IF;
  IF OLD.status <> NEW.status AND NOT (
    (OLD.status = 'pending' AND NEW.status IN ('accepted', 'declined', 'expired'))
    OR NEW.status = 'withdrawn'
  ) THEN
    RAISE EXCEPTION 'peer_invitation_transition_invalid'
      USING ERRCODE = '23514';
  END IF;
  IF OLD.status <> NEW.status
     AND NEW.status IN ('accepted', 'declined')
     AND public.billing_request_role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'peer_invitation_service_transition_required'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.status = 'withdrawn' AND OLD.status <> 'withdrawn' THEN
    UPDATE public.informant_consents
       SET withdrawn_at = pg_catalog.clock_timestamp()
     WHERE invitation_id = NEW.id
       AND withdrawn_at IS NULL;
    UPDATE public.peer_observations
       SET withdrawn_at = pg_catalog.clock_timestamp()
     WHERE invitation_id = NEW.id
       AND withdrawn_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger invocation does not require callers to hold EXECUTE. Keep this
-- RLS-bypassing cascade off every RPC role, including service_role.
REVOKE ALL ON FUNCTION public.keep_peer_withdrawal_terminal()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS peer_invitation_withdrawal_is_final
  ON public.peer_invitations;
CREATE TRIGGER peer_invitation_withdrawal_is_final
  BEFORE UPDATE ON public.peer_invitations
  FOR EACH ROW
  EXECUTE FUNCTION public.keep_peer_withdrawal_terminal();

-- During a rolling Edge deployment an older isolate can still try its former
-- direct INSERT sequence. Lock the same parent row before accepting any active
-- child row; withdrawal either runs after and cascades it, or wins first and the
-- late insert is rejected. This closes the migration/deploy interleaving too.
CREATE OR REPLACE FUNCTION public.require_pending_invitation_for_active_peer_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_status text;
  v_subject_user_id uuid;
BEGIN
  -- UPDATE already holds the child row. Never acquire the parent after it: the
  -- withdrawal path locks parent then child, so doing so would invert lock order.
  -- Child ownership is immutable and a withdrawn response cannot be reactivated.
  IF TG_OP = 'UPDATE' THEN
    IF OLD.withdrawn_at IS NOT NULL AND NEW.withdrawn_at IS NULL THEN
      RAISE EXCEPTION 'peer_response_reactivation_forbidden'
        USING ERRCODE = '23514';
    END IF;
    IF (pg_catalog.to_jsonb(NEW) - 'withdrawn_at')
       IS DISTINCT FROM (pg_catalog.to_jsonb(OLD) - 'withdrawn_at') THEN
      RAISE EXCEPTION 'peer_response_identity_is_immutable'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  SELECT status, user_id
    INTO v_status, v_subject_user_id
    FROM public.peer_invitations
   WHERE id = NEW.invitation_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'peer_response_invitation_not_found'
      USING ERRCODE = '23503';
  END IF;
  IF NEW.subject_user_id IS DISTINCT FROM v_subject_user_id THEN
    RAISE EXCEPTION 'peer_response_subject_mismatch'
      USING ERRCODE = '23514';
  END IF;

  IF TG_TABLE_NAME = 'peer_observations' THEN
    PERFORM 1
      FROM public.informant_consents AS consent
     WHERE consent.id = NEW.informant_consent_id
       AND consent.invitation_id = NEW.invitation_id
       AND consent.subject_user_id = NEW.subject_user_id
       AND (NEW.withdrawn_at IS NOT NULL OR consent.withdrawn_at IS NULL);
    IF NOT FOUND THEN
      RAISE EXCEPTION 'peer_response_consent_mismatch'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.withdrawn_at IS NULL AND v_status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'active_peer_response_requires_pending_invitation'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger invocation does not require EXECUTE. Do not expose the validator as
-- an RPC surface.
REVOKE ALL ON FUNCTION public.require_pending_invitation_for_active_peer_row()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS informant_consent_requires_pending_invitation
  ON public.informant_consents;
CREATE TRIGGER informant_consent_requires_pending_invitation
  BEFORE INSERT OR UPDATE
  ON public.informant_consents
  FOR EACH ROW
  EXECUTE FUNCTION public.require_pending_invitation_for_active_peer_row();

DROP TRIGGER IF EXISTS peer_observation_requires_pending_invitation
  ON public.peer_observations;
CREATE TRIGGER peer_observation_requires_pending_invitation
  BEFORE INSERT OR UPDATE
  ON public.peer_observations
  FOR EACH ROW
  EXECUTE FUNCTION public.require_pending_invitation_for_active_peer_row();

-- Close any pre-0158 rows left active beneath an already-withdrawn invitation.
UPDATE public.informant_consents AS consent
   SET withdrawn_at = COALESCE(invitation.responded_at, pg_catalog.clock_timestamp())
  FROM public.peer_invitations AS invitation
 WHERE invitation.id = consent.invitation_id
   AND invitation.status = 'withdrawn'
   AND consent.withdrawn_at IS NULL;
UPDATE public.peer_observations AS observation
   SET withdrawn_at = COALESCE(invitation.responded_at, pg_catalog.clock_timestamp())
  FROM public.peer_invitations AS invitation
 WHERE invitation.id = observation.invitation_id
   AND invitation.status = 'withdrawn'
   AND observation.withdrawn_at IS NULL;

CREATE OR REPLACE FUNCTION public.finalize_peer_response(
  p_invite_token_hash text,
  p_action text,
  p_ratings jsonb DEFAULT NULL,
  p_informant_is_minor boolean DEFAULT false,
  p_guardian_consent boolean DEFAULT false,
  p_llm_processing_ack boolean DEFAULT false,
  p_overseas_transfer_ack boolean DEFAULT false,
  p_ip_hash text DEFAULT NULL,
  p_ua_hash text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
AS $$
DECLARE
  v_now timestamptz;
  v_invitation public.peer_invitations%ROWTYPE;
  v_consent_id uuid;
BEGIN
  IF public.billing_request_role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role only' USING ERRCODE = '42501';
  END IF;
  IF p_action IS NULL OR p_action NOT IN ('submit', 'withdraw') THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'error', 'invalid_action');
  END IF;
  IF p_invite_token_hash IS NULL
     OR p_invite_token_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  SELECT *
    INTO v_invitation
    FROM public.peer_invitations
   WHERE invite_token_hash = p_invite_token_hash
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  -- The row lock may have waited behind another response. Evaluate expiry and
  -- persist timestamps from the instant this transaction actually won the lock.
  v_now := pg_catalog.clock_timestamp();

  IF p_action = 'withdraw' THEN
    UPDATE public.informant_consents
       SET withdrawn_at = v_now
     WHERE invitation_id = v_invitation.id
       AND withdrawn_at IS NULL;

    UPDATE public.peer_observations
       SET withdrawn_at = v_now
     WHERE invitation_id = v_invitation.id
       AND withdrawn_at IS NULL;

    UPDATE public.peer_invitations
       SET status = 'withdrawn',
           responded_at = CASE
             WHEN status = 'withdrawn' THEN COALESCE(responded_at, v_now)
             ELSE v_now
           END
     WHERE id = v_invitation.id;

    RETURN pg_catalog.jsonb_build_object('ok', true, 'status', 'withdrawn');
  END IF;

  IF v_invitation.status <> 'pending' THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false,
      'error', 'already_responded',
      'status', v_invitation.status
    );
  END IF;
  IF v_invitation.expires_at <= v_now THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'error', 'expired');
  END IF;

  -- Recheck the privacy and rating invariants at the transactional boundary;
  -- do not rely on the Edge parser remaining the only service-role caller.
  IF p_ratings IS NULL
     OR pg_catalog.jsonb_typeof(p_ratings) <> 'object'
     OR NOT (
       p_ratings ? 'extraversion'
       AND p_ratings ? 'conscientiousness'
       AND p_ratings ? 'agreeableness'
     )
     OR EXISTS (
       SELECT 1
         FROM pg_catalog.jsonb_each(p_ratings) AS rating(key, value)
        WHERE rating.key NOT IN (
          'extraversion', 'conscientiousness', 'agreeableness',
          'openness', 'neuroticism'
        )
           OR pg_catalog.jsonb_typeof(rating.value) <> 'number'
           OR rating.value::text !~ '^[1-5]$'
     )
     OR p_informant_is_minor IS NULL
     OR (p_informant_is_minor AND p_guardian_consent IS DISTINCT FROM true)
     OR p_llm_processing_ack IS DISTINCT FROM true
     OR p_overseas_transfer_ack IS DISTINCT FROM true
     OR (p_ip_hash IS NOT NULL AND p_ip_hash !~ '^v1:[0-9a-f]{64}$')
     OR (p_ua_hash IS NOT NULL AND p_ua_hash !~ '^v1:[0-9a-f]{64}$') THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false,
      'error', 'peer_response_invalid_payload'
    );
  END IF;

  -- ON CONFLICT permits recovery from a legacy partial attempt that committed a
  -- consent before failing. The full invitation_id uniques from 0110 ensure the
  -- selected row is unambiguous; an inactive/inconsistent row aborts below.
  INSERT INTO public.informant_consents (
    invitation_id,
    subject_user_id,
    consent_at,
    informant_is_minor,
    guardian_consent_at,
    llm_processing_ack,
    overseas_transfer_ack,
    ip_hash,
    ua_hash
  ) VALUES (
    v_invitation.id,
    v_invitation.user_id,
    v_now,
    p_informant_is_minor,
    CASE WHEN p_informant_is_minor THEN v_now ELSE NULL END,
    true,
    true,
    p_ip_hash,
    p_ua_hash
  )
  ON CONFLICT (invitation_id) DO NOTHING
  RETURNING id INTO v_consent_id;

  IF v_consent_id IS NULL THEN
    SELECT id
      INTO v_consent_id
      FROM public.informant_consents
     WHERE invitation_id = v_invitation.id
       AND subject_user_id = v_invitation.user_id
       AND withdrawn_at IS NULL;
  END IF;
  IF v_consent_id IS NULL THEN
    RAISE EXCEPTION 'peer_response_inconsistent_consent'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.peer_observations (
    invitation_id,
    subject_user_id,
    informant_consent_id,
    ratings
  ) VALUES (
    v_invitation.id,
    v_invitation.user_id,
    v_consent_id,
    p_ratings
  )
  ON CONFLICT (invitation_id) DO NOTHING;

  PERFORM 1
    FROM public.peer_observations
   WHERE invitation_id = v_invitation.id
     AND subject_user_id = v_invitation.user_id
     AND informant_consent_id = v_consent_id
     AND withdrawn_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'peer_response_inconsistent_observation'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.peer_invitations
     SET status = 'accepted', responded_at = v_now
   WHERE id = v_invitation.id
     AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'peer_response_state_changed'
      USING ERRCODE = '40001';
  END IF;

  RETURN pg_catalog.jsonb_build_object('ok', true, 'status', 'accepted');
END;
$$;

-- The 0110 helper only changed invitation status and was never called. Leaving
-- it callable invites a future partial finalization, so retire it explicitly.
DROP FUNCTION IF EXISTS public.claim_peer_invitation(uuid);

REVOKE ALL ON FUNCTION public.finalize_peer_response(
  text, text, jsonb, boolean, boolean, boolean, boolean, text, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.finalize_peer_response(
  text, text, jsonb, boolean, boolean, boolean, boolean, text, text
) TO service_role;

DO $postconditions$
BEGIN
  IF has_function_privilege(
       'anon',
       'public.finalize_peer_response(text,text,jsonb,boolean,boolean,boolean,boolean,text,text)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated',
       'public.finalize_peer_response(text,text,jsonb,boolean,boolean,boolean,boolean,text,text)',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'service_role',
       'public.finalize_peer_response(text,text,jsonb,boolean,boolean,boolean,boolean,text,text)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'anon',
       'public.keep_peer_withdrawal_terminal()',
       'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated',
       'public.keep_peer_withdrawal_terminal()',
       'EXECUTE'
     )
     OR has_function_privilege(
       'service_role',
       'public.keep_peer_withdrawal_terminal()',
       'EXECUTE'
     )
     OR has_function_privilege(
       'anon',
       'public.require_pending_invitation_for_active_peer_row()',
       'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated',
       'public.require_pending_invitation_for_active_peer_row()',
       'EXECUTE'
     )
     OR has_function_privilege(
       'service_role',
       'public.require_pending_invitation_for_active_peer_row()',
       'EXECUTE'
     )
     OR pg_catalog.to_regprocedure('public.claim_peer_invitation(uuid)') IS NOT NULL
     OR EXISTS (
       SELECT 1
         FROM pg_catalog.pg_class
        WHERE oid IN (
          'public.peer_invitations'::regclass,
          'public.informant_consents'::regclass,
          'public.peer_observations'::regclass
        )
          AND (NOT relrowsecurity OR NOT relforcerowsecurity)
     )
     OR has_table_privilege(
       'anon', 'public.informant_consents',
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
     )
     OR has_table_privilege(
       'anon', 'public.peer_observations',
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
     )
     OR has_table_privilege(
       'authenticated', 'public.informant_consents',
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
     )
     OR has_table_privilege(
       'authenticated', 'public.peer_observations',
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
     )
     OR NOT EXISTS (
       SELECT 1
         FROM pg_catalog.pg_proc
        WHERE oid = 'public.finalize_peer_response(text,text,jsonb,boolean,boolean,boolean,boolean,text,text)'::regprocedure
          AND prosecdef
          AND EXISTS (
            SELECT 1
              FROM pg_catalog.unnest(proconfig) AS setting(value)
             WHERE setting.value LIKE 'search_path=%'
          )
     )
     OR NOT EXISTS (
       SELECT 1
         FROM pg_catalog.pg_proc
        WHERE oid = 'public.keep_peer_withdrawal_terminal()'::regprocedure
          AND prosecdef
          AND EXISTS (
            SELECT 1
              FROM pg_catalog.unnest(proconfig) AS setting(value)
             WHERE setting.value LIKE 'search_path=%'
          )
     )
     OR NOT EXISTS (
       SELECT 1
         FROM pg_catalog.pg_trigger
        WHERE tgname = 'peer_invitation_withdrawal_is_final'
          AND tgrelid = 'public.peer_invitations'::regclass
          AND tgenabled = 'O'
          AND NOT tgisinternal
     )
     OR NOT EXISTS (
       SELECT 1
         FROM pg_catalog.pg_trigger
        WHERE tgname = 'informant_consent_requires_pending_invitation'
          AND tgrelid = 'public.informant_consents'::regclass
          AND tgenabled = 'O'
          AND NOT tgisinternal
     )
     OR NOT EXISTS (
       SELECT 1
         FROM pg_catalog.pg_trigger
        WHERE tgname = 'peer_observation_requires_pending_invitation'
          AND tgrelid = 'public.peer_observations'::regclass
          AND tgenabled = 'O'
          AND NOT tgisinternal
     ) THEN
    RAISE EXCEPTION '0158 peer response atomicity postcondition failed';
  END IF;
END
$postconditions$;

COMMIT;
