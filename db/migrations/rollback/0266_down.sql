-- INACTIVE T40 S down: one transaction; E1-S remains installed byte-for-byte.
-- Restore the 0255 schema/function contract, not a reversal of settled money/counts.
-- Closed unbound evidence has no 0255 representation: remove those reservation
-- rows, keeping the refund ledger and all usage counters. No synthetic answer.
-- Stop new S traffic before rollback; the guard refuses a live rebind window.
LOCK TABLE public.users IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.chat_usage, public.chat_turn_reservations, public.chat_turn_refunds
  IN ACCESS EXCLUSIVE MODE;

-- 0255 can replace an answered attempt 1 with attempt 2 for five minutes.
-- Never discard closure while that old binding path could reopen a closed row.
DO $rebind_guard$
BEGIN
  IF EXISTS (SELECT 1 FROM public.chat_turn_reservations
              WHERE binding_closed AND attempts = 2
                AND attempted_at > pg_catalog.clock_timestamp() - interval '5 minutes') THEN
    RAISE EXCEPTION 'T40 S down: closed attempt 2 is within the five-minute 0255 rebind window; stop S traffic and retry after it expires'
      USING ERRCODE = '55000';
  END IF;
END
$rebind_guard$;

-- Refuse to overwrite a newer function. CRLF is normalized for local replay.
DO $source_guard$
DECLARE v record;
BEGIN
  FOR v IN SELECT * FROM (VALUES
    ('public.bump_chat_usage_for_turn(uuid,date)', ARRAY['e48d46f5920a2a09a0c87be6ffe04ce7']),
    ('public.begin_chat_turn_attempt(uuid,uuid,uuid)', ARRAY['f8720564d8ec971a208f7e4957ecf484']),
    ('public.claim_chat_turn_for_audit(uuid,uuid,uuid)', ARRAY['e2cf42ca697af45301640e7c06eb5df0']),
    ('public.refund_chat_turn_after_output_swap(uuid)', ARRAY['3397e5362b6faa62f416cd1ef5e9a81d']),
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

DROP INDEX public.chat_turn_reservations_attempt1_audit_idx;
DROP INDEX public.chat_turn_reservations_attempt2_audit_idx;

DELETE FROM public.chat_turn_reservations
 WHERE audit_id IS NULL AND (binding_closed OR state = 'refunded');
ALTER TABLE public.chat_turn_reservations DROP CONSTRAINT chat_turn_reservations_answer_check;
ALTER TABLE public.chat_turn_reservations
  ADD CONSTRAINT chat_turn_reservations_answer_check CHECK ((state = 'counted') = (audit_id IS NULL));
ALTER TABLE public.chat_turn_reservations
  DROP COLUMN attempt1_delivered, DROP COLUMN attempt2_delivered, DROP COLUMN binding_closed;

CREATE OR REPLACE FUNCTION public.bump_chat_usage_for_turn(p_user_id uuid, p_day date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count int;
  v_turn  uuid;
BEGIN
  -- One decision about this user's turns at a time, and this lock first, before any row: the bump, the attempt
  -- and the refund all take it before they touch chat_usage or a reservation, so none of them waits for a row
  -- another holds while holding one it wants (round 7). The next statements see every reservation an earlier
  -- bump made.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('chat_turn_bump:' || p_user_id::text, 0));

  -- Raises 42501 for another user's id and P0001 chat_limit_exceeded at the cap. The third argument is ignored there.
  v_count := public.bump_chat_usage_if_under_cap(p_user_id, p_day, 0);

  -- This turn closes the turns before it that never got an answer: an answer can only ever be bound to the
  -- user's latest counted turn. A refund is only possible within minutes of the answer, so the user's
  -- reservations older than two days go here too.
  DELETE FROM public.chat_turn_reservations AS r
   WHERE r.user_id = p_user_id
     AND (r.state = 'counted'
          OR r.issued_at < pg_catalog.clock_timestamp() - interval '2 days');

  -- The reservation carries the day the turn was counted on. That day is the day a refund gives back.
  -- Stamped with the clock, so that "the user's latest turn" (see the attempt below) reads the same here.
  INSERT INTO public.chat_turn_reservations (user_id, counted_day, issued_at)
  VALUES (p_user_id, p_day, pg_catalog.clock_timestamp())
  RETURNING turn_id INTO v_turn;

  RETURN pg_catalog.jsonb_build_object('count', v_count, 'turnId', v_turn);
END;
$$;

REVOKE ALL ON FUNCTION public.bump_chat_usage_for_turn(uuid, date) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.bump_chat_usage_for_turn(uuid, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.begin_chat_turn_attempt(p_user_id uuid, p_audit_id uuid, p_turn_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now  timestamptz;
  v_done uuid;
BEGIN
  IF p_user_id IS NULL OR p_audit_id IS NULL OR p_turn_id IS NULL THEN
    RETURN false;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('chat_turn_bump:' || p_user_id::text, 0));

  -- The clock after the lock, so the attempt is stamped when it is recorded.
  v_now := pg_catalog.clock_timestamp();

  UPDATE public.chat_turn_reservations AS r
     SET attempts = r.attempts + 1,
         attempt1_audit_id = CASE WHEN r.attempts = 0 THEN p_audit_id ELSE r.attempt1_audit_id END,
         attempt2_audit_id = CASE WHEN r.attempts = 1 THEN p_audit_id ELSE r.attempt2_audit_id END,
         attempted_at = v_now
   WHERE r.turn_id = p_turn_id
     AND r.user_id = p_user_id
     AND r.issued_at <= v_now
     AND ((r.attempts = 0 AND r.state = 'counted')
          OR (r.attempts = 1 AND r.state IN ('counted', 'answered')
              AND r.attempt1_audit_id IS DISTINCT FROM p_audit_id
              AND NOT EXISTS (SELECT 1
                                FROM public.chat_turn_reservations AS n
                               WHERE n.user_id = r.user_id
                                 AND n.turn_id <> r.turn_id
                                 AND n.issued_at >= r.issued_at)))
  RETURNING r.turn_id INTO v_done;

  RETURN v_done IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.begin_chat_turn_attempt(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_chat_turn_attempt(uuid, uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_chat_turn_for_audit(p_user_id uuid, p_audit_id uuid, p_turn_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now  timestamptz := pg_catalog.clock_timestamp();
  v_done uuid;
BEGIN
  IF p_user_id IS NULL OR p_audit_id IS NULL OR p_turn_id IS NULL THEN
    RETURN false;
  END IF;

  -- The answer: this user's row, written by a proxy for chat, just now.
  IF NOT EXISTS (SELECT 1
                   FROM public.ai_audit_log AS a
                  WHERE a.id = p_audit_id
                    AND a.user_id = p_user_id
                    AND a.event_source = 'server_verified'
                    AND a.purpose = 'secondb_chat'
                    AND a.created_at >= v_now - interval '60 seconds'
                    AND a.created_at <= v_now) THEN
    RETURN false;
  END IF;

  BEGIN
    -- The reservation: this user's, and this row is one of its recorded attempts, the latest recorded in the last
    -- five minutes. Not answered yet (either attempt's row), or answered by the first attempt's row while this is
    -- the second's: the one re-ask (Q-261014-20), whose answer takes the place of the first, whose row is then
    -- bound to nothing. Never the other way round, so an earlier attempt that ends late cannot take the place of
    -- the one after it. One statement, so answers arriving at once for one reservation leave exactly one bound.
    UPDATE public.chat_turn_reservations AS r
       SET state = 'answered',
           audit_id = p_audit_id,
           answered_at = v_now
     WHERE r.turn_id = p_turn_id
       AND r.user_id = p_user_id
       AND (r.attempt1_audit_id = p_audit_id OR r.attempt2_audit_id = p_audit_id)
       AND r.attempted_at >= v_now - interval '5 minutes'
       AND r.attempted_at <= v_now
       AND ((r.state = 'counted' AND r.audit_id IS NULL)
            OR (r.state = 'answered' AND r.audit_id = r.attempt1_audit_id AND r.attempt2_audit_id = p_audit_id))
    RETURNING r.turn_id INTO v_done;
  EXCEPTION
    WHEN unique_violation THEN
      -- That audit row already answers another reservation.
      RETURN false;
  END;

  RETURN v_done IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_chat_turn_for_audit(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_chat_turn_for_audit(uuid, uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.refund_chat_turn_after_output_swap(p_audit_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user    uuid := auth.uid();
  v_now     timestamptz := pg_catalog.clock_timestamp();
  v_audit   uuid;
  v_turn    uuid;
  v_day     date;
  v_count   int;
  v_hit     text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not signed in' USING ERRCODE = '42501';
  END IF;
  IF p_audit_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- One decision about this user's turns at a time, under the bump's and the attempt's lock and before any row
  -- (round 7): the later call waits, then sees what the earlier one used, and a bump cannot hold chat_usage
  -- while this call holds the reservation it wants.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('chat_turn_bump:' || v_user::text, 0));

  -- That row and no other: the caller's own, written by a proxy, for chat, red, recent, not used yet.
  SELECT a.id
    INTO v_audit
    FROM public.ai_audit_log AS a
   WHERE a.id = p_audit_id
     AND a.user_id = v_user
     AND a.event_source = 'server_verified'
     AND a.purpose = 'secondb_chat'
     AND a.safety_zone = 'red'
     AND a.created_at >= v_now - interval '10 minutes'
     AND a.created_at <= v_now
     AND NOT EXISTS (SELECT 1 FROM public.chat_turn_refunds AS used WHERE used.audit_id = a.id);

  IF v_audit IS NULL THEN
    RETURN NULL;
  END IF;

  -- The day is the server's own record: the caller's reservation that this answer was bound to. No day
  -- and no turn id come from the caller.
  SELECT r.turn_id, r.counted_day
    INTO v_turn, v_day
    FROM public.chat_turn_reservations AS r
   WHERE r.audit_id = v_audit
     AND r.user_id = v_user
     AND r.state = 'answered'
     FOR UPDATE;

  IF v_turn IS NULL THEN
    RETURN NULL;
  END IF;

  BEGIN
    -- The primary key is what lets one audit row count once, whatever snapshot this call read.
    INSERT INTO public.chat_turn_refunds (audit_id, day) VALUES (v_audit, v_day);

    UPDATE public.chat_usage AS cu
       SET count = cu.count - 1
     WHERE cu.user_id = v_user
       AND cu.day = v_day
       AND cu.count > 0
    RETURNING cu.count INTO v_count;

    IF v_count IS NULL THEN
      -- Nothing to give back on that day: undo the mark so the row stays usable.
      RAISE EXCEPTION 'no turn to give back' USING ERRCODE = 'ZC252';
    END IF;

    UPDATE public.chat_turn_reservations AS r
       SET state = 'refunded',
           refunded_at = v_now
     WHERE r.turn_id = v_turn
       AND r.state = 'answered';
  EXCEPTION
    WHEN unique_violation THEN
      -- Only the ledger's own primary key means "this row was used already".
      GET STACKED DIAGNOSTICS v_hit = CONSTRAINT_NAME;
      IF v_hit IS NOT DISTINCT FROM (SELECT c.conname FROM pg_catalog.pg_constraint AS c
                                      WHERE c.conrelid = 'public.chat_turn_refunds'::regclass AND c.contype = 'p') THEN
        RETURN NULL;
      END IF;
      RAISE;
    WHEN SQLSTATE 'ZC252' THEN
      RETURN NULL;
  END;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.refund_chat_turn_after_output_swap(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.refund_chat_turn_after_output_swap(uuid) TO authenticated;

COMMENT ON TABLE public.chat_turn_reservations IS
  'One row per counted chat turn (0255): who, the day it was counted on, the proxy audit row that answered it, and its attempts (how many were started, the audit ids they will write in the order they reached the server, when the latest was recorded). Ids, days, times and a count only, no content. Rows older than two days are removed by the next bump.';
