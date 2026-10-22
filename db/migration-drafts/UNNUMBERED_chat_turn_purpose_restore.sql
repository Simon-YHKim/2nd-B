-- INACTIVE DRAFT: T40 F. Q-261022-02: 하루 1회 상한으로 복원 (추천).
-- Relay: reviewed E1-S -> S -> F, each ENTIRE file in one transaction.
-- No caller/proxy activation or numbered migration. Keep 0185/0259 unchanged.
-- Free C=5 first-debit budget: 2C=10 -> 2(C+1)=12 attempts (not all calendar-day traffic).
-- F-BEGIN/F-END delimit additive changes; executable source pins compare all
-- remaining E1-S/S bytes against the reviewed originals, including down.
-- Down stops purpose restoration and restores exact E1-S/S refund bodies/ACL.
-- The two dates, unique cap index and bump retention exception MUST survive down.

LOCK TABLE public.users IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.chat_usage, public.llm_proxy_purpose_daily,
  public.chat_turn_reservations, public.chat_turn_refunds IN ACCESS EXCLUSIVE MODE;

DO $source_guard$
DECLARE v record;
BEGIN
  FOR v IN SELECT * FROM (VALUES
    ('public.begin_chat_turn_attempt_with_quota(uuid,uuid,uuid,text,text)', ARRAY['9d8ecd755cf436aa3882b2d2854a46c9','c652bc6687d23bb00d5662cfc68968ac']),
    ('public.bump_chat_usage_for_turn(uuid,date)', ARRAY['e48d46f5920a2a09a0c87be6ffe04ce7','551d2c3b26384e4da2ed9c59c23d7ae7']),
    ('public.refund_chat_turn_after_output_swap(uuid)', ARRAY['3397e5362b6faa62f416cd1ef5e9a81d','7486a59a6c655900ec21753cf069bebd']),
    ('public.begin_chat_turn_attempt(uuid,uuid,uuid)', ARRAY['f8720564d8ec971a208f7e4957ecf484']),
    ('public.claim_chat_turn_for_audit(uuid,uuid,uuid)', ARRAY['e2cf42ca697af45301640e7c06eb5df0']),
    ('public.consume_llm_proxy_purpose_quota(uuid,text,text)', ARRAY['9f289b5b3b82757f62166167eb67ed73'])
  ) AS expected(signature, hashes) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc
                    WHERE oid = pg_catalog.to_regprocedure(v.signature)
                      AND pg_catalog.md5(pg_catalog.replace(prosrc, E'\r', '')) = ANY(v.hashes)
                      AND prosecdef AND proconfig @> ARRAY['search_path=""']) THEN
      RAISE EXCEPTION 'T40 F: unexpected installed definition %', v.signature USING ERRCODE = '55000';
    END IF;
  END LOOP;
END
$source_guard$;

ALTER TABLE public.chat_turn_reservations
  ADD COLUMN IF NOT EXISTS quota_day date,
  ADD COLUMN IF NOT EXISTS purpose_restored_day date;

CREATE UNIQUE INDEX IF NOT EXISTS chat_turn_reservations_purpose_restore_day_key
  ON public.chat_turn_reservations (user_id, purpose_restored_day)
  WHERE purpose_restored_day IS NOT NULL;

DO $shape$
BEGIN
  IF (SELECT count(*) FROM pg_catalog.pg_attribute a
       WHERE a.attrelid = 'public.chat_turn_reservations'::regclass
         AND a.attname IN ('quota_day','purpose_restored_day') AND NOT a.attisdropped
         AND a.atttypid = 'date'::regtype AND NOT a.attnotnull AND NOT a.atthasdef
         AND a.attgenerated = '' AND a.attidentity = '') <> 2 THEN
    RAISE EXCEPTION 'T40 F: expected nullable dates without defaults' USING ERRCODE = '55000';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_index i
                 WHERE i.indexrelid = pg_catalog.to_regclass('public.chat_turn_reservations_purpose_restore_day_key')
                   AND i.indrelid = 'public.chat_turn_reservations'::regclass
                   AND i.indisunique AND i.indisvalid AND i.indisready AND i.indimmediate
                   AND i.indnatts = 2 AND i.indexprs IS NULL
                   AND pg_catalog.pg_get_indexdef(i.indexrelid,1,true) = 'user_id'
                   AND pg_catalog.pg_get_indexdef(i.indexrelid,2,true) = 'purpose_restored_day'
                   AND pg_catalog.pg_get_expr(i.indpred,i.indrelid) = '(purpose_restored_day IS NOT NULL)') THEN
    RAISE EXCEPTION 'T40 F: expected user daily restore unique index' USING ERRCODE = '55000';
  END IF;
END
$shape$;

COMMENT ON COLUMN public.chat_turn_reservations.quota_day IS
  'T40 F: server KST first debit day, bracketed around successful consume; NULL for pre-F/legacy/unbound.';
COMMENT ON COLUMN public.chat_turn_reservations.purpose_restored_day IS
  'T40 F: server KST processing day of successful purpose restoration; user-wide daily cap, retained through rollback.';
COMMENT ON TABLE public.chat_turn_reservations IS
  'T40 F: S chat refund evidence plus first-debit and restoration KST dates, no content. Next bump removes rows older than two days except current/future server-day restoration markers. F rollback retains these markers and their cleanup exception; account deletion cascades.';

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
-- F-BEGIN
  v_quota_before date;
  v_quota_after date;
-- F-END
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
-- F-BEGIN
  -- Before registration and quota child locks, including account deletion.
  PERFORM 1 FROM public.users WHERE id = p_user_id FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'chat turn owner missing' USING ERRCODE = '23503';
  END IF;
-- F-END

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
-- F-BEGIN
  v_quota_before := (pg_catalog.clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date;
-- F-END
  SELECT q.allowed, q.used, q.quota_limit INTO STRICT v_quota
    FROM public.consume_llm_proxy_purpose_quota(p_user_id, p_provider, 'secondb_chat') AS q;
-- F-BEGIN
  v_quota_after := (pg_catalog.clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date;
-- F-END
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

-- F-BEGIN
  -- T3901 retains precedence for ordinary quota refusal. An admitted charge
  -- straddling KST midnight must undo registration, quota and cleanup together.
  IF v_quota_before IS DISTINCT FROM v_quota_after THEN
    RAISE EXCEPTION 'chat quota day changed' USING ERRCODE = '55000';
  END IF;
  IF v_registered THEN
    UPDATE public.chat_turn_reservations SET quota_day = v_quota_before
     WHERE turn_id = p_turn_id AND user_id = p_user_id AND attempts = 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'chat quota receipt missing' USING ERRCODE = '55000';
    END IF;
  END IF;

-- F-END
  RETURN pg_catalog.jsonb_build_object(
    'allowed', true, 'kind', CASE WHEN v_registered THEN 'first' ELSE 'unbound' END,
    'attempt', CASE WHEN v_registered THEN 1 ELSE NULL END,
    'quotaCharged', true, 'bindingEligible', v_registered, 'reaskAvailable', v_registered,
    'error', NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.bump_chat_usage_for_turn(p_user_id uuid, p_day date)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_count int;
  v_turn uuid;
BEGIN
  -- Authenticate before taking any other user's parent lock.
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'not the caller' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('chat_turn_bump:' || p_user_id::text, 0));
  -- Before BOTH child tables: serialize against account deletion's FK cascades.
  PERFORM 1 FROM public.users WHERE id = p_user_id FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'chat turn owner missing' USING ERRCODE = '23503';
  END IF;
  v_count := public.bump_chat_usage_if_under_cap(p_user_id, p_day, 0);
  UPDATE public.chat_turn_reservations SET binding_closed = true
   WHERE user_id = p_user_id AND state <> 'refunded' AND NOT binding_closed;
  DELETE FROM public.chat_turn_reservations AS r
   WHERE r.user_id = p_user_id
-- F-BEGIN
     -- The app's p_day cannot erase today's cap marker. Keep future markers
     -- too if the wall clock moves backwards. This condition survives down.
     AND (r.purpose_restored_day IS NULL OR r.purpose_restored_day <
          (pg_catalog.clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date)
-- F-END
     AND ((r.state = 'counted' AND r.attempts = 0)
          OR r.issued_at < pg_catalog.clock_timestamp() - interval '2 days');
  INSERT INTO public.chat_turn_reservations (user_id, counted_day, issued_at)
  VALUES (p_user_id, p_day, pg_catalog.clock_timestamp()) RETURNING turn_id INTO v_turn;
  RETURN pg_catalog.jsonb_build_object('count', v_count, 'turnId', v_turn);
END;
$$;

CREATE OR REPLACE FUNCTION public.refund_chat_turn_after_output_swap(p_audit_id uuid)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_now timestamptz;
  v_turn uuid;
  v_day date;
  v_count int;
  v_matches bigint;
  v_row public.chat_turn_reservations%ROWTYPE;
  v_hit text;
-- F-BEGIN
  v_quota_day date;
  v_restore_day date;
  v_purpose_count int;
-- F-END
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not signed in' USING ERRCODE = '42501'; END IF;
  IF p_audit_id IS NULL THEN RETURN NULL; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('chat_turn_bump:' || v_user::text, 0));

  -- Cheap refusal reads take no row locks (0242 FOR UPDATE NOWAIT). Recheck
  -- eligibility and the clock below after every row-lock wait.
  IF NOT EXISTS (SELECT 1 FROM public.ai_audit_log WHERE id = p_audit_id AND user_id = v_user)
     OR EXISTS (SELECT 1 FROM public.chat_turn_refunds WHERE audit_id = p_audit_id) THEN RETURN NULL; END IF;

  -- Count ALL slots, including other owners/terminal rows: corrupt attribution
  -- must not pick an arbitrary reservation or ignore a second copy in one row.
  -- UNION ALL counts two equal slots in one row twice; each arm uses its index.
  -- A user lock does not justify ignoring corrupt slots owned by other users.
  SELECT count(*) INTO v_matches FROM (
    SELECT 1 FROM public.chat_turn_reservations WHERE attempt1_audit_id = p_audit_id
    UNION ALL
    SELECT 1 FROM public.chat_turn_reservations WHERE attempt2_audit_id = p_audit_id
  ) AS slots;
  IF v_matches <> 1 THEN RETURN NULL; END IF;
  SELECT turn_id, counted_day INTO v_turn, v_day FROM public.chat_turn_reservations
   WHERE user_id = v_user AND state <> 'refunded'
     AND (attempt1_audit_id = p_audit_id OR attempt2_audit_id = p_audit_id);
  IF v_turn IS NULL THEN RETURN NULL; END IF;

  -- Parent still precedes every child row lock, including FK-cascade deletion.
  PERFORM 1 FROM public.users WHERE id = v_user FOR KEY SHARE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Consistent child order: usage, then reservation. E1-S is unchanged.
  PERFORM 1 FROM public.chat_usage WHERE user_id = v_user AND day = v_day FOR UPDATE;
-- F-BEGIN
  -- Child order is chat usage, purpose usage, then reservation. The user
  -- lock prevents concurrent registration/claim/bump while quota can contend
  -- with the unchanged, standalone consume function.
  SELECT quota_day INTO v_quota_day FROM public.chat_turn_reservations WHERE turn_id = v_turn;
  SELECT count INTO v_purpose_count FROM public.llm_proxy_purpose_daily
   WHERE user_id = v_user AND kst_day = v_quota_day AND purpose = 'secondb_chat' FOR UPDATE;
-- F-END
  SELECT * INTO v_row FROM public.chat_turn_reservations WHERE turn_id = v_turn FOR UPDATE;
  v_now := pg_catalog.clock_timestamp();
  IF NOT FOUND OR v_row.user_id IS DISTINCT FROM v_user OR v_row.state = 'refunded'
     OR ((v_row.attempts >= 1 AND v_row.attempt1_audit_id = p_audit_id AND v_row.attempt1_delivered)
          OR (v_row.attempts = 2 AND v_row.attempt2_audit_id = p_audit_id AND v_row.attempt2_delivered)) IS NOT TRUE
     OR (v_row.state = 'counted' AND NOT v_row.binding_closed) THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ai_audit_log AS a
                  WHERE a.id = p_audit_id AND a.user_id = v_user
                    AND a.event_source = 'server_verified' AND a.purpose = 'secondb_chat'
                    AND a.safety_zone = 'red'
                    AND a.created_at >= v_now - interval '10 minutes' AND a.created_at <= v_now)
     OR EXISTS (SELECT 1 FROM public.chat_turn_refunds WHERE audit_id = p_audit_id) THEN RETURN NULL; END IF;
  BEGIN
    INSERT INTO public.chat_turn_refunds (audit_id, day) VALUES (p_audit_id, v_day);
    UPDATE public.chat_usage AS cu SET count = cu.count - 1
     WHERE cu.user_id = v_user AND cu.day = v_day AND cu.count > 0
    RETURNING cu.count INTO v_count;
    IF v_count IS NULL THEN RAISE EXCEPTION 'no turn to give back' USING ERRCODE = 'ZC252'; END IF;
-- F-BEGIN
    -- Only today's actual debit can restore usable budget. Old-day settlement
    -- still refunds chat, without reducing an expired row or spending today's cap.
    v_restore_day := (pg_catalog.clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date;
    IF v_row.quota_day = v_restore_day AND v_purpose_count > 0
       AND v_row.purpose_restored_day IS NULL
       AND NOT EXISTS (SELECT 1 FROM public.chat_turn_reservations
                        WHERE user_id = v_user AND purpose_restored_day = v_restore_day)
       -- Every registered attempt must be delivered with trustworthy non-green
       -- evidence. Missing/foreign/future/client evidence and pending attempts
       -- fail closed. The ten-minute refund window above stays S's contract.
       AND v_row.attempts IN (1, 2)
       AND NOT EXISTS (
         SELECT 1 FROM (VALUES
           (1, v_row.attempt1_audit_id, v_row.attempt1_delivered),
           (2, v_row.attempt2_audit_id, v_row.attempt2_delivered)
         ) AS attempt(number, audit_id, delivered)
         LEFT JOIN public.ai_audit_log AS a ON a.id = attempt.audit_id
         WHERE attempt.number <= v_row.attempts
           AND (attempt.delivered AND a.user_id = v_user
                AND a.event_source = 'server_verified' AND a.purpose = 'secondb_chat'
                AND a.safety_zone IN ('red', 'yellow') AND a.created_at <= v_now) IS NOT TRUE
       ) THEN
      BEGIN
        IF v_purpose_count = 1 THEN
          DELETE FROM public.llm_proxy_purpose_daily
           WHERE user_id = v_user AND kst_day = v_row.quota_day AND purpose = 'secondb_chat';
        ELSE
          UPDATE public.llm_proxy_purpose_daily SET count = count - 1
           WHERE user_id = v_user AND kst_day = v_row.quota_day AND purpose = 'secondb_chat';
        END IF;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'chat purpose receipt disappeared' USING ERRCODE = '55000';
        END IF;
        UPDATE public.chat_turn_reservations SET purpose_restored_day = v_restore_day
         WHERE turn_id = v_turn;
      EXCEPTION WHEN unique_violation THEN
        GET STACKED DIAGNOSTICS v_hit = CONSTRAINT_NAME;
        -- Only the daily cap collision cancels this subtransaction. Chat refund
        -- remains valid; other errors escape and roll back the whole settlement.
        IF v_hit IS DISTINCT FROM 'chat_turn_reservations_purpose_restore_day_key' THEN RAISE; END IF;
      END;
    END IF;
-- F-END
    UPDATE public.chat_turn_reservations SET state = 'refunded', refunded_at = v_now
     WHERE turn_id = v_turn;
  EXCEPTION
    WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_hit = CONSTRAINT_NAME;
      IF v_hit IS NOT DISTINCT FROM (SELECT conname FROM pg_catalog.pg_constraint
                                     WHERE conrelid = 'public.chat_turn_refunds'::regclass AND contype = 'p') THEN
        RETURN NULL;
      END IF;
      RAISE;
    WHEN SQLSTATE 'ZC252' THEN RETURN NULL;
  END;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.begin_chat_turn_attempt_with_quota(uuid, uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.begin_chat_turn_attempt_with_quota(uuid, uuid, uuid, text, text)
  TO service_role;

REVOKE ALL ON FUNCTION public.bump_chat_usage_for_turn(uuid, date) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.bump_chat_usage_for_turn(uuid, date) TO authenticated;

REVOKE ALL ON FUNCTION public.refund_chat_turn_after_output_swap(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.refund_chat_turn_after_output_swap(uuid) TO authenticated;
