-- 0150_reasoning_proxy_reservation_claim.sql
-- Bind each paid reasoning_connect sub-call to the exact run that already
-- reserved its server-derived allowance. The proxy validates the end-user JWT,
-- then calls this RPC with service_role, that JWT's user id, and one of the two
-- real call-site slots: records or sources.
--
-- One run may legitimately make both calls, so status alone cannot be the
-- consume marker. A bounded text[] ledger makes each slot one-shot. The single
-- conditional UPDATE makes owner matching, the absolute 30-minute claim window,
-- per-slot use, and the run's item budget indivisible under concurrency.

BEGIN;

SET LOCAL lock_timeout = '10s';

ALTER TABLE public.reasoning_runs
  ADD COLUMN IF NOT EXISTS proxy_claimed_slots text[] NOT NULL DEFAULT '{}'::text[];

-- Re-applying the migration also repairs the column modifiers if an interrupted
-- manual rollout created only the column before the transaction was restored.
UPDATE public.reasoning_runs
   SET proxy_claimed_slots = '{}'::text[]
 WHERE proxy_claimed_slots IS NULL;

ALTER TABLE public.reasoning_runs
  ALTER COLUMN proxy_claimed_slots SET DEFAULT '{}'::text[];
ALTER TABLE public.reasoning_runs
  ALTER COLUMN proxy_claimed_slots SET NOT NULL;

DO $constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_constraint
     WHERE conrelid = 'public.reasoning_runs'::regclass
       AND conname = 'reasoning_runs_proxy_claimed_slots_allowed'
  ) THEN
    ALTER TABLE public.reasoning_runs
      ADD CONSTRAINT reasoning_runs_proxy_claimed_slots_allowed
      CHECK (
        proxy_claimed_slots <@ ARRAY['records', 'sources']::text[]
        AND array_position(proxy_claimed_slots, NULL) IS NULL
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_constraint
     WHERE conrelid = 'public.reasoning_runs'::regclass
       AND conname = 'reasoning_runs_proxy_claimed_slots_max_two'
  ) THEN
    ALTER TABLE public.reasoning_runs
      ADD CONSTRAINT reasoning_runs_proxy_claimed_slots_max_two
      CHECK (cardinality(proxy_claimed_slots) <= 2);
  END IF;
END
$constraints$;

CREATE OR REPLACE FUNCTION public.claim_reasoning_proxy_call(
  p_user_id uuid,
  p_run_id uuid,
  p_slot text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_claimed uuid;
BEGIN
  -- ACLs are necessary but not sufficient for a DEFINER body that accepts an
  -- arbitrary user id. Reject privilege drift inside the function as well.
  IF public.billing_request_role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role only' USING ERRCODE = '42501';
  END IF;

  -- Only the two batches emitted by reasoning_connect are valid. Nulls and
  -- every other value fail without exposing whether the run exists.
  IF p_user_id IS NULL
     OR p_run_id IS NULL
     OR p_slot IS NULL
     OR p_slot NOT IN ('records', 'sources') THEN
    RETURN false;
  END IF;

  -- PostgreSQL rechecks this predicate after a concurrent row-lock wait. Two
  -- distinct slots may therefore claim a mixed run, while concurrent repeats
  -- of the same slot see the appended value and fail.
  UPDATE public.reasoning_runs
     SET proxy_claimed_slots = array_append(proxy_claimed_slots, p_slot),
         status = 'running',
         updated_at = now()
   WHERE id = p_run_id
     AND user_id = p_user_id
     AND status IN ('reserved', 'running')
     -- created_at is deliberate: authenticated start_reasoning_run may refresh
     -- updated_at, and must not be able to extend a reservation indefinitely.
     AND created_at >= now() - make_interval(mins => 30)
     AND NOT (p_slot = ANY(proxy_claimed_slots))
     AND cardinality(proxy_claimed_slots) < LEAST(item_count, 2)
  RETURNING id INTO v_claimed;

  -- Covers missing, cross-user, expired, duplicate-slot, and exhausted runs.
  RETURN v_claimed IS NOT NULL;
END;
$$;

-- Once a proxy slot has been claimed, the scarce allowance paid for a real
-- vendor attempt. Client-controlled lifecycle RPCs may still close the row, but
-- cannot refund that allowance. This removes the reserve -> call -> cancel/fail
-- -> reserve loop while preserving refunds for failures before any proxy claim.

CREATE OR REPLACE FUNCTION public.fail_reasoning_run(p_user_id uuid, p_run_id uuid, p_code text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_run public.reasoning_runs%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'caller must match p_user_id' USING ERRCODE = '42501';
  END IF;
  UPDATE public.reasoning_runs
     SET status = 'failed', error_code = left(COALESCE(p_code, 'error'), 64)
   WHERE id = p_run_id AND user_id = p_user_id AND status IN ('reserved', 'running')
  RETURNING * INTO v_run;
  IF v_run.id IS NULL THEN RETURN false; END IF;
  IF cardinality(v_run.proxy_claimed_slots) = 0 THEN
    PERFORM public.refund_reasoning_run_spend(p_user_id, v_run.id);
  END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_reasoning_run(p_user_id uuid, p_run_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_run public.reasoning_runs%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'caller must match p_user_id' USING ERRCODE = '42501';
  END IF;
  UPDATE public.reasoning_runs SET status = 'cancelled'
   WHERE id = p_run_id AND user_id = p_user_id AND status IN ('reserved', 'running')
  RETURNING * INTO v_run;
  IF v_run.id IS NULL THEN RETURN false; END IF;
  IF cardinality(v_run.proxy_claimed_slots) = 0 THEN
    PERFORM public.refund_reasoning_run_spend(p_user_id, v_run.id);
  END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.recover_stale_reasoning_runs(
  p_user_id uuid, p_stale_minutes int DEFAULT 30
) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_run public.reasoning_runs%ROWTYPE; v_count int := 0;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'caller must match p_user_id' USING ERRCODE = '42501';
  END IF;
  FOR v_run IN
    UPDATE public.reasoning_runs SET status = 'recovered', error_code = 'stale'
     WHERE user_id = p_user_id AND status IN ('reserved', 'running')
       AND updated_at < now() - make_interval(mins => GREATEST(COALESCE(p_stale_minutes, 30), 5))
    RETURNING *
  LOOP
    IF cardinality(v_run.proxy_claimed_slots) = 0 THEN
      PERFORM public.refund_reasoning_run_spend(p_user_id, v_run.id);
    END IF;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_reasoning_proxy_call(uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_reasoning_proxy_call(uuid, uuid, text) TO service_role;

DO $verify$
BEGIN
  IF has_function_privilege('anon', 'public.claim_reasoning_proxy_call(uuid,uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.claim_reasoning_proxy_call(uuid,uuid,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.claim_reasoning_proxy_call(uuid,uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'reasoning proxy claim ACL verification failed'
      USING ERRCODE = '42501';
  END IF;
END
$verify$;

COMMIT;
