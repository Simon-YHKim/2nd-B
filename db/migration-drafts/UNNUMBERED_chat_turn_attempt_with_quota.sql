-- INACTIVE DRAFT: T39 E1-S (Q-261014-20, Q-261020-02, Q-261021-04).
-- No caller or production activation. Assign the next number only at Relay rollout.
-- Apply this entire file in ONE transaction (CLI migration or psql --single-transaction).
-- No top-level BEGIN/COMMIT: the migration runner owns that transaction.
-- Rollback: rollback/UNNUMBERED_chat_turn_attempt_with_quota_down.sql, after callers use legacy.
-- Existing 0255 reservations/ACL/erasure registry and 0185/0259 quota policy stay unchanged.
-- SQL returns the wire fields except mode (Edge-owned), plus error (null on admission).
-- Rejections: reask_ineligible or first_already_registered; only T3901 means quota exhaustion.

CREATE OR REPLACE FUNCTION public.begin_chat_turn_attempt_with_quota(
  p_user_id uuid,
  p_audit_id uuid,
  p_turn_id uuid,
  p_provider text,
  p_attempt_intent text
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_before smallint;
  v_attempt smallint;
  v_attempt_audit uuid;
  v_registered boolean;
  v_quota record;
BEGIN
  IF public.billing_request_role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role only' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL OR p_audit_id IS NULL OR p_turn_id IS NULL THEN
    RAISE EXCEPTION 'chat admission ids required' USING ERRCODE = '22023';
  END IF;
  IF p_provider IS DISTINCT FROM 'openai' THEN
    RAISE EXCEPTION 'unsupported chat admission provider' USING ERRCODE = '22023';
  END IF;
  IF p_attempt_intent IS NULL OR p_attempt_intent NOT IN ('first', 'reask') THEN
    RAISE EXCEPTION 'invalid_chat_attempt_intent' USING ERRCODE = '22023';
  END IF;

  -- The SAME lock as 0255 bump/begin/refund, BEFORE any reservation or usage read.
  -- The nested begin lock alone cannot protect the pre-registration first check.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('chat_turn_bump:' || p_user_id::text, 0));

  SELECT r.attempts INTO v_before
    FROM public.chat_turn_reservations AS r
   WHERE r.turn_id = p_turn_id AND r.user_id = p_user_id;

  -- Only an OWN reservation can reveal that first already arrived. An absent or
  -- other owner's reservation follows the same unbound/ineligible paths below.
  IF p_attempt_intent = 'first' AND v_before >= 1 THEN
    RETURN pg_catalog.jsonb_build_object(
      'allowed', false, 'kind', 'rejected', 'attempt', NULL,
      'quotaCharged', false, 'bindingEligible', false, 'reaskAvailable', false,
      'error', 'first_already_registered');
  END IF;

  -- Exactly one registration call. Eligibility remains owned by 0255, including
  -- attempts=0 reask, latest-turn checks, distinct audit ids and clock conditions.
  v_registered := public.begin_chat_turn_attempt(p_user_id, p_audit_id, p_turn_id);
  IF v_registered IS NULL THEN
    RAISE EXCEPTION 'chat_admission_invalid_state' USING ERRCODE = '55000';
  END IF;
  IF v_registered THEN
    SELECT r.attempts,
           CASE r.attempts WHEN 1 THEN r.attempt1_audit_id WHEN 2 THEN r.attempt2_audit_id END
      INTO v_attempt, v_attempt_audit
      FROM public.chat_turn_reservations AS r
     WHERE r.turn_id = p_turn_id AND r.user_id = p_user_id;
    IF v_attempt IS NULL OR v_attempt NOT IN (1, 2)
       OR v_before IS NULL OR v_attempt <> v_before + 1
       OR v_attempt_audit IS DISTINCT FROM p_audit_id
       OR (v_attempt = 2 AND p_attempt_intent <> 'reask') THEN
      RAISE EXCEPTION 'chat_admission_invalid_state' USING ERRCODE = '55000';
    END IF;

    -- No daily exemption cap. A valid second attempt never consults quota,
    -- including at 5/5 or across KST midnight after a legacy first attempt.
    IF v_attempt = 2 THEN
      RETURN pg_catalog.jsonb_build_object(
        'allowed', true, 'kind', 'reask', 'attempt', 2,
        'quotaCharged', false, 'bindingEligible', true, 'reaskAvailable', false,
        'error', NULL);
    END IF;
  ELSIF p_attempt_intent = 'reask' THEN
    RETURN pg_catalog.jsonb_build_object(
      'allowed', false, 'kind', 'rejected', 'attempt', NULL,
      'quotaCharged', false, 'bindingEligible', false, 'reaskAvailable', false,
      'error', 'reask_ineligible');
  END IF;

  -- First registration (either intent) or unbound first: the existing server-KST
  -- quota policy charges once. counted_day is not required to match issued_at.
  -- STRICT rejects zero/multiple rows; malformed values and policy errors escape
  -- unchanged as admission failures, never a normal-call fallback or T3901.
  SELECT q.allowed, q.used, q.quota_limit INTO STRICT v_quota
    FROM public.consume_llm_proxy_purpose_quota(p_user_id, p_provider, 'secondb_chat') AS q;
  IF v_quota.allowed IS NULL OR v_quota.used IS NULL OR v_quota.quota_limit IS NULL
     OR v_quota.used < 1 OR v_quota.used > 10000
     OR v_quota.quota_limit < 1 OR v_quota.quota_limit > 10000
     OR (v_quota.allowed AND v_quota.used > v_quota.quota_limit)
     OR (NOT v_quota.allowed AND v_quota.used < v_quota.quota_limit) THEN
    RAISE EXCEPTION 'chat_admission_invalid_quota' USING ERRCODE = '55000';
  END IF;
  IF v_quota.allowed = false THEN
    -- A normal false RETURN here would COMMIT the registration. Do not catch
    -- this exception here: undo the registration AND any quota cleanup together.
    RAISE EXCEPTION 'purpose_limit_exceeded' USING ERRCODE = 'T3901';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'allowed', true, 'kind', CASE WHEN v_registered THEN 'first' ELSE 'unbound' END,
    'attempt', CASE WHEN v_registered THEN 1 ELSE NULL END,
    'quotaCharged', true, 'bindingEligible', v_registered, 'reaskAvailable', v_registered,
    'error', NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.begin_chat_turn_attempt_with_quota(uuid, uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.begin_chat_turn_attempt_with_quota(uuid, uuid, uuid, text, text)
  TO service_role;

COMMENT ON FUNCTION public.begin_chat_turn_attempt_with_quota(uuid, uuid, uuid, text, text) IS
  'T39: atomic chat attempt and purpose quota; first only before registration, second reask exempt; service-only inactive draft.';

DO $verify_t39$
BEGIN
  IF pg_catalog.has_function_privilege('anon', 'public.begin_chat_turn_attempt_with_quota(uuid,uuid,uuid,text,text)', 'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated', 'public.begin_chat_turn_attempt_with_quota(uuid,uuid,uuid,text,text)', 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('service_role', 'public.begin_chat_turn_attempt_with_quota(uuid,uuid,uuid,text,text)', 'EXECUTE')
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS p,
                             LATERAL pg_catalog.aclexplode(p.proacl) AS a
                 WHERE p.oid = 'public.begin_chat_turn_attempt_with_quota(uuid,uuid,uuid,text,text)'::regprocedure
                   AND a.grantee = 0 AND a.privilege_type = 'EXECUTE') THEN
    RAISE EXCEPTION 'T39: service-only function ACL required' USING ERRCODE = '55000';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS p
                  WHERE p.oid = 'public.begin_chat_turn_attempt_with_quota(uuid,uuid,uuid,text,text)'::regprocedure
                    AND p.prosecdef AND p.provolatile = 'v' AND p.proconfig @> ARRAY['search_path=""']) THEN
    RAISE EXCEPTION 'T39: volatile definer with empty search_path required' USING ERRCODE = '55000';
  END IF;
END
$verify_t39$;
