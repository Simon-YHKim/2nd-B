-- INACTIVE DRAFT: T40 S only. Relay order: reviewed E1-S, then S.
-- Apply the ENTIRE file in one transaction. No numbered migration or activation.
-- Simon 2026-10-14 14:12:02: close prior unanswered reservations so only the
-- newest can bind. Closing now preserves attempts: a late eligible response
-- records delivery evidence, but cannot bind or register another attempt.
-- Delivery means the server return gate passed, NOT receipt by a device.
-- No purpose quota writes, quota_day, new audit content or proxy changes (F pending).
-- Down restores 0255 functions without dropping E1-S or its begin dependency.

LOCK TABLE public.users IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.chat_usage, public.chat_turn_reservations, public.chat_turn_refunds
  IN ACCESS EXCLUSIVE MODE;

DO $prerequisite$
BEGIN
  IF pg_catalog.to_regprocedure('public.begin_chat_turn_attempt_with_quota(uuid,uuid,uuid,text,text)') IS NULL THEN
    RAISE EXCEPTION 'T40 S: apply E1-S first' USING ERRCODE = '55000';
  END IF;
END
$prerequisite$;

-- Refuse to overwrite a newer function. CRLF is normalized for local replay.
DO $source_guard$
DECLARE v record;
BEGIN
  FOR v IN SELECT * FROM (VALUES
    ('public.bump_chat_usage_for_turn(uuid,date)', ARRAY['de66cf03d34be1bfa94e9a7be264819c','e48d46f5920a2a09a0c87be6ffe04ce7']),
    ('public.begin_chat_turn_attempt(uuid,uuid,uuid)', ARRAY['0489a7a5782c2d3f61992b8dcd929c4e','f8720564d8ec971a208f7e4957ecf484']),
    ('public.claim_chat_turn_for_audit(uuid,uuid,uuid)', ARRAY['256e696462ed40c841e8c87be84880eb','e2cf42ca697af45301640e7c06eb5df0']),
    ('public.refund_chat_turn_after_output_swap(uuid)', ARRAY['4f2ea195a24d23480d105b2efe5b8b8c','3397e5362b6faa62f416cd1ef5e9a81d']),
    ('public.begin_chat_turn_attempt_with_quota(uuid,uuid,uuid,text,text)', ARRAY['9d8ecd755cf436aa3882b2d2854a46c9'])
  ) AS expected(signature, hashes) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc
                    WHERE oid = pg_catalog.to_regprocedure(v.signature)
                      AND pg_catalog.md5(pg_catalog.replace(prosrc, E'\r', '')) = ANY(v.hashes)
                      AND prosecdef AND proconfig @> ARRAY['search_path=""']) THEN
      RAISE EXCEPTION 'T40 S: unexpected installed definition %', v.signature USING ERRCODE = '55000';
    END IF;
  END LOOP;
END
$source_guard$;

ALTER TABLE public.chat_turn_reservations
  ADD COLUMN IF NOT EXISTS attempt1_delivered boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS attempt2_delivered boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS binding_closed boolean NOT NULL DEFAULT false;

DO $columns$
BEGIN
  IF (SELECT count(*) FROM pg_catalog.pg_attribute AS a
       JOIN pg_catalog.pg_attrdef AS d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
       WHERE a.attrelid='public.chat_turn_reservations'::regclass
         AND a.attname IN ('attempt1_delivered','attempt2_delivered','binding_closed')
         AND NOT a.attisdropped AND a.atttypid='boolean'::regtype AND a.attnotnull
         AND a.attgenerated='' AND a.attidentity=''
         AND pg_catalog.pg_get_expr(d.adbin,d.adrelid)='false') <> 3 THEN
    RAISE EXCEPTION 'T40 S: expected three default-false booleans' USING ERRCODE='55000';
  END IF;
END
$columns$;

-- Keep global duplicate-slot checks selective without changing attribution rules.
CREATE INDEX IF NOT EXISTS chat_turn_reservations_attempt1_audit_idx
  ON public.chat_turn_reservations (attempt1_audit_id) WHERE attempt1_audit_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS chat_turn_reservations_attempt2_audit_idx
  ON public.chat_turn_reservations (attempt2_audit_id) WHERE attempt2_audit_id IS NOT NULL;

-- Only a formerly bound answer proves delivery at the migration boundary.
-- Reapply never clears evidence. Do not infer delivery for the replaced attempt.
UPDATE public.chat_turn_reservations
   SET attempt1_delivered = attempt1_delivered OR (audit_id IS NOT NULL AND audit_id IS NOT DISTINCT FROM attempt1_audit_id),
       attempt2_delivered = attempt2_delivered OR (audit_id IS NOT NULL AND audit_id IS NOT DISTINCT FROM attempt2_audit_id)
 WHERE state IN ('answered', 'refunded') AND audit_id IS NOT NULL;

-- Older rows, and ALL ties for newest, close permanently. Refunded rows stay terminal.
UPDATE public.chat_turn_reservations AS r SET binding_closed = true
 WHERE r.state <> 'refunded' AND EXISTS (
   SELECT 1 FROM public.chat_turn_reservations AS n
    WHERE n.user_id = r.user_id AND n.turn_id <> r.turn_id AND n.issued_at >= r.issued_at);
DELETE FROM public.chat_turn_reservations
 WHERE binding_closed AND state = 'counted' AND attempts = 0;

ALTER TABLE public.chat_turn_reservations DROP CONSTRAINT chat_turn_reservations_answer_check;
ALTER TABLE public.chat_turn_reservations ADD CONSTRAINT chat_turn_reservations_answer_check CHECK (
  (state = 'counted' AND audit_id IS NULL)
  OR (state = 'answered' AND audit_id IS NOT NULL)
  OR (state = 'refunded' AND (audit_id IS NOT NULL OR (
    binding_closed AND (
      (attempts >= 1 AND attempt1_audit_id IS NOT NULL AND attempt1_delivered)
      OR (attempts = 2 AND attempt2_audit_id IS NOT NULL AND attempt2_delivered))))));

COMMENT ON COLUMN public.chat_turn_reservations.attempt1_delivered IS
  'T40 S: registered attempt 1 passed the server return gate; not proof of device receipt.';
COMMENT ON COLUMN public.chat_turn_reservations.attempt2_delivered IS
  'T40 S: registered attempt 2 passed the server return gate; not proof of device receipt.';
COMMENT ON COLUMN public.chat_turn_reservations.binding_closed IS
  'T40 S: no new attempt or representative answer; eligible late delivery evidence may still arrive.';
COMMENT ON TABLE public.chat_turn_reservations IS
  'Per-turn chat count and refund evidence (T40 S): ids, counted day, times, attempt count, server-return flags and binding closure; no content. Closed attempted rows retain eligible late-return evidence without reopening binding. Rows older than two days are removed by the next bump; otherwise account deletion cascades.';

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
     AND ((r.state = 'counted' AND r.attempts = 0)
          OR r.issued_at < pg_catalog.clock_timestamp() - interval '2 days');
  INSERT INTO public.chat_turn_reservations (user_id, counted_day, issued_at)
  VALUES (p_user_id, p_day, pg_catalog.clock_timestamp()) RETURNING turn_id INTO v_turn;
  RETURN pg_catalog.jsonb_build_object('count', v_count, 'turnId', v_turn);
END;
$$;
REVOKE ALL ON FUNCTION public.bump_chat_usage_for_turn(uuid, date) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.bump_chat_usage_for_turn(uuid, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.begin_chat_turn_attempt(p_user_id uuid, p_audit_id uuid, p_turn_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_now timestamptz;
  v_done uuid;
BEGIN
  IF p_user_id IS NULL OR p_audit_id IS NULL OR p_turn_id IS NULL THEN RETURN false; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('chat_turn_bump:' || p_user_id::text, 0));
  -- No users lock here: only one child table is written (0242 NOWAIT compatibility).
  v_now := pg_catalog.clock_timestamp();
  UPDATE public.chat_turn_reservations AS r
     SET attempts = r.attempts + 1,
         attempt1_audit_id = CASE WHEN r.attempts = 0 THEN p_audit_id ELSE r.attempt1_audit_id END,
         attempt2_audit_id = CASE WHEN r.attempts = 1 THEN p_audit_id ELSE r.attempt2_audit_id END,
         attempted_at = v_now
   WHERE r.turn_id = p_turn_id AND r.user_id = p_user_id AND NOT r.binding_closed
     AND r.issued_at <= v_now
     AND ((r.attempts = 0 AND r.state = 'counted')
          OR (r.attempts = 1 AND r.state IN ('counted', 'answered')
              AND r.attempt1_audit_id IS DISTINCT FROM p_audit_id
              AND NOT EXISTS (SELECT 1 FROM public.chat_turn_reservations AS n
                               WHERE n.user_id = r.user_id AND n.turn_id <> r.turn_id
                                 AND n.issued_at >= r.issued_at)))
  RETURNING r.turn_id INTO v_done;
  RETURN v_done IS NOT NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.begin_chat_turn_attempt(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_chat_turn_attempt(uuid, uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_chat_turn_for_audit(p_user_id uuid, p_audit_id uuid, p_turn_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_now timestamptz;
  v_row public.chat_turn_reservations%ROWTYPE;
  v_hit text;
  v_bound boolean;
BEGIN
  IF p_user_id IS NULL OR p_audit_id IS NULL OR p_turn_id IS NULL THEN RETURN false; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('chat_turn_bump:' || p_user_id::text, 0));
  SELECT * INTO v_row FROM public.chat_turn_reservations
   WHERE turn_id = p_turn_id AND user_id = p_user_id FOR UPDATE;
  -- Read the clock AFTER all lock waits, never in DECLARE.
  v_now := pg_catalog.clock_timestamp();
  IF NOT FOUND OR v_row.state = 'refunded'
     OR v_row.attempted_at IS NULL OR v_row.attempted_at < v_now - interval '5 minutes'
     OR v_row.attempted_at > v_now
     OR NOT ((v_row.attempts >= 1 AND v_row.attempt1_audit_id IS NOT DISTINCT FROM p_audit_id)
          OR (v_row.attempts = 2 AND v_row.attempt2_audit_id IS NOT DISTINCT FROM p_audit_id)) THEN
    RETURN false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ai_audit_log AS a
                  WHERE a.id = p_audit_id AND a.user_id = p_user_id
                    AND a.event_source = 'server_verified' AND a.purpose = 'secondb_chat'
                    AND a.created_at >= v_now - interval '60 seconds' AND a.created_at <= v_now) THEN
    RETURN false;
  END IF;
  -- Also reject a conflict on evidence-only claims, not just the unique UPDATE.
  IF EXISTS (SELECT 1 FROM public.chat_turn_reservations
              WHERE audit_id = p_audit_id AND turn_id <> p_turn_id) THEN RETURN false; END IF;
  v_bound := COALESCE(NOT v_row.binding_closed AND (
    (v_row.state = 'counted' AND v_row.audit_id IS NULL)
    OR (v_row.state = 'answered' AND v_row.audit_id = v_row.attempt1_audit_id
        AND v_row.attempt2_audit_id = p_audit_id)), false);
  BEGIN
    -- One UPDATE: updating the same child twice can recheck its owner FK and
    -- implicitly take users KEY SHARE, conflicting with 0242 FOR UPDATE NOWAIT.
    UPDATE public.chat_turn_reservations
       SET attempt1_delivered = attempt1_delivered OR (attempt1_audit_id IS NOT DISTINCT FROM p_audit_id),
           attempt2_delivered = attempt2_delivered OR (attempt2_audit_id IS NOT DISTINCT FROM p_audit_id),
           state = CASE WHEN v_bound THEN 'answered' ELSE state END,
           audit_id = CASE WHEN v_bound THEN p_audit_id ELSE audit_id END,
           answered_at = CASE WHEN v_bound THEN v_now ELSE answered_at END
     WHERE turn_id = p_turn_id;
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_hit = CONSTRAINT_NAME;
    IF v_hit = 'chat_turn_reservations_audit_id_key' THEN RETURN false; END IF;
    RAISE;
  END;
  RETURN v_bound;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_chat_turn_for_audit(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_chat_turn_for_audit(uuid, uuid, uuid) TO service_role;

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
REVOKE ALL ON FUNCTION public.refund_chat_turn_after_output_swap(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.refund_chat_turn_after_output_swap(uuid) TO authenticated;
