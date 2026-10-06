-- 0217 account deletion ops: the server state machine, the completion trigger,
-- the Q6 fence release, the receipt reads and the lookup limiter.
-- Runs after the push applied 0192 and 0217; everything happens inside one
-- transaction that is rolled back.
\set ON_ERROR_STOP on

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(p_ok boolean, p_message text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_ok IS DISTINCT FROM true THEN
    RAISE EXCEPTION '%', p_message;
  END IF;
END;
$$;

-- Two accounts: A fails and is released, B is deleted.
INSERT INTO auth.users (id, email) VALUES
  ('de1e7217-0000-4000-8000-00000000000a', 'ops-a-ci@example.invalid'),
  ('de1e7217-0000-4000-8000-00000000000b', 'ops-b-ci@example.invalid');
INSERT INTO auth.sessions (id, user_id) VALUES
  ('de1e7217-0000-4000-8000-0000000000a1', 'de1e7217-0000-4000-8000-00000000000a'),
  ('de1e7217-0000-4000-8000-0000000000b1', 'de1e7217-0000-4000-8000-00000000000b');
INSERT INTO public.users (id, email, birth_date, locale) VALUES
  ('de1e7217-0000-4000-8000-00000000000a', 'ops-a-ci@example.invalid', DATE '1990-01-01', 'en'),
  ('de1e7217-0000-4000-8000-00000000000b', 'ops-b-ci@example.invalid', DATE '1990-01-01', 'en');

-- ACL: client roles hold nothing; service_role holds the eight service functions only.
SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
      FROM (VALUES
        ('public.begin_account_deletion_op(uuid,uuid,bigint,text)'),
        ('public.start_account_deletion_op(uuid,uuid,text)'),
        ('public.start_legacy_account_deletion_op(uuid)'),
        ('public.fail_account_deletion_op(uuid,uuid,text)'),
        ('public.record_account_deletion_op_sweeps(uuid,jsonb)'),
        ('public.get_account_deletion_op(uuid,text)'),
        ('public.consume_account_deletion_receipt_lookup(text)'),
        ('public.purge_account_deletion_ops()'),
        ('public.account_deletion_ops_settle_live_owner(uuid)'),
        ('public.account_deletion_ops_release_failed_fence(uuid)'),
        ('public.complete_account_deletion_ops()')
      ) AS f(sig)
     CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(role)
     WHERE pg_catalog.has_function_privilege(r.role, f.sig, 'EXECUTE')
  )
  AND NOT pg_catalog.has_function_privilege('service_role', 'public.account_deletion_ops_release_failed_fence(uuid)', 'EXECUTE')
  AND NOT pg_catalog.has_function_privilege('service_role', 'public.complete_account_deletion_ops()', 'EXECUTE')
  AND pg_catalog.has_function_privilege('service_role', 'public.begin_account_deletion_op(uuid,uuid,bigint,text)', 'EXECUTE')
  AND pg_catalog.has_function_privilege('service_role', 'public.get_account_deletion_op(uuid,text)', 'EXECUTE')
  AND NOT pg_catalog.has_table_privilege('authenticated', 'public.account_deletion_ops', 'SELECT')
  AND NOT pg_catalog.has_table_privilege('service_role', 'public.account_deletion_ops', 'SELECT'),
  '0217 ACL is not closed to client roles'
);

-- A request without the service role is refused before it reads anything.
SELECT pg_catalog.set_config('request.jwt.claims', '{"role":"authenticated"}', true);
DO $not_service$
BEGIN
  BEGIN
    PERFORM public.get_account_deletion_op('de1e7217-0000-4000-8000-0000000000f1', NULL);
    RAISE EXCEPTION USING ERRCODE = 'ZX001', MESSAGE = 'non-service caller was answered';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$not_service$;

SELECT pg_catalog.set_config('request.jwt.claims', '{"role":"service_role"}', true);

CREATE TEMP TABLE ci_now AS
SELECT pg_catalog.floor(EXTRACT(EPOCH FROM pg_catalog.clock_timestamp()) * 1000)::bigint AS ms;

-- begin: accepted, replayed with the stored issue time, taken by another account, invalid, gone.
SELECT pg_temp.assert_true(
  public.begin_account_deletion_op('de1e7217-0000-4000-8000-0000000000f1', 'de1e7217-0000-4000-8000-00000000000a',
    (SELECT ms FROM ci_now), pg_catalog.repeat('a1', 32)) ->> 'result' = 'accepted',
  'begin did not accept a new op'
);
SELECT pg_temp.assert_true(
  (public.begin_account_deletion_op('de1e7217-0000-4000-8000-0000000000f1', 'de1e7217-0000-4000-8000-00000000000a',
     (SELECT ms FROM ci_now) + 5, pg_catalog.repeat('ff', 32)))
    = pg_catalog.jsonb_build_object('result', 'replayed', 'token_issued_ms', (SELECT ms FROM ci_now)),
  'begin retry did not replay the stored token issue time'
);
SELECT pg_temp.assert_true(
  public.begin_account_deletion_op('de1e7217-0000-4000-8000-0000000000f1', 'de1e7217-0000-4000-8000-00000000000b',
    (SELECT ms FROM ci_now), pg_catalog.repeat('b1', 32)) ->> 'result' = 'op_taken',
  'another account could take an existing op number'
);
SELECT pg_temp.assert_true(
  public.begin_account_deletion_op('de1e7217-0000-4000-8000-0000000000f9', 'de1e7217-0000-4000-8000-00000000000a',
    (SELECT ms FROM ci_now) - 600000, pg_catalog.repeat('a9', 32)) ->> 'result' = 'invalid',
  'begin accepted a token issue time ten minutes old'
);
SELECT pg_temp.assert_true(
  public.begin_account_deletion_op('de1e7217-0000-4000-8000-0000000000f8', 'de1e7217-0000-4000-8000-0000000000ff',
    (SELECT ms FROM ci_now), pg_catalog.repeat('a8', 32)) ->> 'result' = 'account_gone',
  'begin wrote an op for an account with no profile row'
);
SELECT pg_temp.assert_true(
  NOT EXISTS (SELECT 1 FROM public.account_deletion_ops WHERE id IN (
    'de1e7217-0000-4000-8000-0000000000f8', 'de1e7217-0000-4000-8000-0000000000f9')),
  'a refused begin left a row behind'
);

-- start: a wrong token or owner is rejected; the right one starts, then continues.
SELECT pg_temp.assert_true(
  public.start_account_deletion_op('de1e7217-0000-4000-8000-0000000000f1', 'de1e7217-0000-4000-8000-00000000000a',
    pg_catalog.repeat('ff', 32)) ->> 'result' = 'rejected',
  'start accepted a wrong token'
);
SELECT pg_temp.assert_true(
  public.start_account_deletion_op('de1e7217-0000-4000-8000-0000000000f1', 'de1e7217-0000-4000-8000-00000000000b',
    pg_catalog.repeat('a1', 32)) ->> 'result' = 'rejected',
  'start accepted another account'
);
SELECT pg_temp.assert_true(
  public.start_account_deletion_op('de1e7217-0000-4000-8000-0000000000f1', 'de1e7217-0000-4000-8000-00000000000a',
    pg_catalog.repeat('a1', 32)) ->> 'result' = 'started',
  'start did not move accepted to executing'
);
SELECT pg_temp.assert_true(
  public.start_account_deletion_op('de1e7217-0000-4000-8000-0000000000f1', 'de1e7217-0000-4000-8000-00000000000a',
    pg_catalog.repeat('a1', 32)) ->> 'result' = 'continued',
  'a retry of the same op did not continue it'
);

-- Q6: the executing op lays the 0192 fence; while a second op of A is executing,
-- failing the first one must NOT release it. Failing the second one does.
SELECT pg_temp.assert_true(
  public.begin_account_deletion(
    'de1e7217-0000-4000-8000-00000000000a', 'de1e7217-0000-4000-8000-0000000000a1', pg_catalog.now()),
  'begin_account_deletion did not lay the fence'
);
SELECT pg_temp.assert_true(
  public.begin_account_deletion_op('de1e7217-0000-4000-8000-0000000000f2', 'de1e7217-0000-4000-8000-00000000000a',
    (SELECT ms FROM ci_now), pg_catalog.repeat('a2', 32)) ->> 'result' = 'accepted'
  AND public.start_account_deletion_op('de1e7217-0000-4000-8000-0000000000f2', 'de1e7217-0000-4000-8000-00000000000a',
    pg_catalog.repeat('a2', 32)) ->> 'result' = 'started',
  'second op of A did not start'
);
SELECT pg_temp.assert_true(
  (public.fail_account_deletion_op('de1e7217-0000-4000-8000-0000000000f1', 'de1e7217-0000-4000-8000-00000000000a',
     'storage_precondition'))
    = pg_catalog.jsonb_build_object('status', 'failed', 'fence_released', false),
  'failing one op released the fence while another op of the account was executing'
);
SELECT pg_temp.assert_true(
  EXISTS (SELECT 1 FROM public.account_deletion_tombstones WHERE user_id = 'de1e7217-0000-4000-8000-00000000000a'),
  'the fence disappeared while an op was still executing'
);
-- A function's writes are invisible to a subquery of the statement that called it
-- (one snapshot per statement), so each call lands in a temp table first.
-- (c) gate SAFE-02 / DLR-A1-01: the attempt that just started may share its op
-- with another Edge call still in Storage/Auth, so its failure keeps the fence.
CREATE TEMP TABLE ci_fail_f2 AS
SELECT public.fail_account_deletion_op('de1e7217-0000-4000-8000-0000000000f2', 'de1e7217-0000-4000-8000-00000000000a',
  'auth_delete_failed') AS r;
SELECT pg_temp.assert_true(
  (SELECT r FROM ci_fail_f2) = pg_catalog.jsonb_build_object('status', 'failed', 'fence_released', false)
  AND EXISTS (SELECT 1 FROM public.account_deletion_tombstones WHERE user_id = 'de1e7217-0000-4000-8000-00000000000a'),
  'a failure released the fence while another call of the same op could still be running'
);
-- Ten minutes after the last attempt started, no call of that op can be alive.
UPDATE public.account_deletion_ops
   SET last_attempt_at = last_attempt_at - interval '11 minutes'
 WHERE id IN ('de1e7217-0000-4000-8000-0000000000f1', 'de1e7217-0000-4000-8000-0000000000f2');
CREATE TEMP TABLE ci_release_f2 AS
SELECT public.fail_account_deletion_op('de1e7217-0000-4000-8000-0000000000f2', 'de1e7217-0000-4000-8000-00000000000a',
  'auth_delete_failed') AS r;
SELECT pg_temp.assert_true(
  (SELECT r FROM ci_release_f2) = pg_catalog.jsonb_build_object('status', 'failed', 'fence_released', true)
  AND NOT EXISTS (SELECT 1 FROM public.account_deletion_tombstones WHERE user_id = 'de1e7217-0000-4000-8000-00000000000a'),
  'the last failed op of a live account did not release its fence (Q6)'
);
SELECT pg_temp.assert_true(
  public.start_account_deletion_op('de1e7217-0000-4000-8000-0000000000f2', 'de1e7217-0000-4000-8000-00000000000a',
    pg_catalog.repeat('a2', 32)) ->> 'result' = 'failed',
  'a failed op could be started again'
);
-- A fence laid after the last failure is not released by that older failure.
SELECT pg_temp.assert_true(
  public.begin_account_deletion(
    'de1e7217-0000-4000-8000-00000000000a', 'de1e7217-0000-4000-8000-0000000000a1', pg_catalog.clock_timestamp()),
  'begin_account_deletion did not lay the fence again'
);
UPDATE public.account_deletion_tombstones
   SET last_requested_at = pg_catalog.clock_timestamp() + interval '1 second'
 WHERE user_id = 'de1e7217-0000-4000-8000-00000000000a';
CREATE TEMP TABLE ci_fail_again AS
SELECT public.fail_account_deletion_op('de1e7217-0000-4000-8000-0000000000f2', 'de1e7217-0000-4000-8000-00000000000a',
  'auth_delete_failed') AS r;
SELECT pg_temp.assert_true(
  NOT ((SELECT r FROM ci_fail_again) ->> 'fence_released')::boolean
  AND EXISTS (SELECT 1 FROM public.account_deletion_tombstones WHERE user_id = 'de1e7217-0000-4000-8000-00000000000a'),
  'an older failure released a fence a later request laid'
);
DELETE FROM public.account_deletion_tombstones WHERE user_id = 'de1e7217-0000-4000-8000-00000000000a';

-- Device recovery read (with the token hash) answers a failed op; the receipt read does not.
SELECT pg_temp.assert_true(
  public.get_account_deletion_op('de1e7217-0000-4000-8000-0000000000f1', pg_catalog.repeat('a1', 32)) ->> 'status' = 'failed'
  AND public.get_account_deletion_op('de1e7217-0000-4000-8000-0000000000f1', NULL) IS NULL
  AND public.get_account_deletion_op('de1e7217-0000-4000-8000-0000000000f1', pg_catalog.repeat('ee', 32)) IS NULL,
  'recovery/receipt reads of a failed op are wrong'
);

-- Lazy settle: an accepted op older than 10 minutes is abandoned, an executing op
-- whose last attempt is older than 15 minutes fails.
SELECT public.begin_account_deletion_op('de1e7217-0000-4000-8000-0000000000f3', 'de1e7217-0000-4000-8000-00000000000a',
  (SELECT ms FROM ci_now), pg_catalog.repeat('a3', 32));
UPDATE public.account_deletion_ops SET created_at = pg_catalog.now() - interval '11 minutes'
 WHERE id = 'de1e7217-0000-4000-8000-0000000000f3';
SELECT pg_temp.assert_true(
  public.get_account_deletion_op('de1e7217-0000-4000-8000-0000000000f3', pg_catalog.repeat('a3', 32)) ->> 'status' = 'abandoned'
  AND public.begin_account_deletion_op('de1e7217-0000-4000-8000-0000000000f3', 'de1e7217-0000-4000-8000-00000000000a',
    (SELECT ms FROM ci_now), pg_catalog.repeat('a3', 32)) ->> 'result' = 'op_taken',
  'an expired accepted op was not abandoned, or its number could be reused'
);

-- Legacy ({}) requests get a server-made op, continued on retry.
CREATE TEMP TABLE ci_legacy AS
SELECT public.start_legacy_account_deletion_op('de1e7217-0000-4000-8000-00000000000b') AS first_call;
SELECT pg_temp.assert_true(
  (SELECT first_call ->> 'result' = 'started' FROM ci_legacy)
  AND public.start_legacy_account_deletion_op('de1e7217-0000-4000-8000-00000000000b') ->> 'op_id'
      = (SELECT first_call ->> 'op_id' FROM ci_legacy),
  'a legacy retry did not continue the server-made op'
);

-- B: one accepted op, one executing op, then the profile row goes (as Auth deletion
-- cascades). The trigger completes both and keeps no account id.
SELECT public.begin_account_deletion_op('de1e7217-0000-4000-8000-0000000000f4', 'de1e7217-0000-4000-8000-00000000000b',
  (SELECT ms FROM ci_now), pg_catalog.repeat('b4', 32));
SELECT public.begin_account_deletion_op('de1e7217-0000-4000-8000-0000000000f5', 'de1e7217-0000-4000-8000-00000000000b',
  (SELECT ms FROM ci_now), pg_catalog.repeat('b5', 32));
SELECT public.start_account_deletion_op('de1e7217-0000-4000-8000-0000000000f5', 'de1e7217-0000-4000-8000-00000000000b',
  pg_catalog.repeat('b5', 32));

DELETE FROM public.users WHERE id = 'de1e7217-0000-4000-8000-00000000000b';

SELECT pg_temp.assert_true(
  (SELECT pg_catalog.count(*) = 3
          AND pg_catalog.bool_and(status = 'completed' AND owner_id IS NULL
                                  AND receipt_expires_at = finished_at + interval '365 days')
     FROM public.account_deletion_ops
    WHERE id IN ('de1e7217-0000-4000-8000-0000000000f4', 'de1e7217-0000-4000-8000-0000000000f5')
       OR id = (SELECT (first_call ->> 'op_id')::uuid FROM ci_legacy))
  AND NOT EXISTS (SELECT 1 FROM public.account_deletion_ops WHERE owner_id = 'de1e7217-0000-4000-8000-00000000000b'),
  'the profile deletion did not complete every open op of the account, or kept its id'
);

-- After deletion: execute replays the receipt without destruction; sweeps record once.
SELECT pg_temp.assert_true(
  public.start_account_deletion_op('de1e7217-0000-4000-8000-0000000000f5', 'de1e7217-0000-4000-8000-00000000000b',
    pg_catalog.repeat('b5', 32)) ->> 'result' = 'completed'
  AND public.start_account_deletion_op('de1e7217-0000-4000-8000-0000000000f5', 'de1e7217-0000-4000-8000-00000000000b',
    pg_catalog.repeat('ff', 32)) ->> 'result' = 'rejected',
  'a finished op did not replay its receipt, or replayed it for a wrong token'
);
-- The replay carries the token issue time, so the Edge can bind the CALLER by
-- recomputing the token HMAC; the row itself has no owner any more (gate DLR-A1-02).
SELECT pg_temp.assert_true(
  (public.start_account_deletion_op('de1e7217-0000-4000-8000-0000000000f5', 'de1e7217-0000-4000-8000-00000000000b',
     pg_catalog.repeat('b5', 32)) ->> 'token_issued_ms')::bigint = (SELECT ms FROM ci_now),
  'the completed replay did not carry the token issue time for the caller binding'
);
SELECT pg_temp.assert_true(
  public.record_account_deletion_op_sweeps('de1e7217-0000-4000-8000-0000000000f5',
    '{"profile_erased": true, "deletion_fenced": true, "raw_clippings_erased": null}'::jsonb)
  AND NOT public.record_account_deletion_op_sweeps('de1e7217-0000-4000-8000-0000000000f5',
    '{"profile_erased": false}'::jsonb)
  AND NOT public.record_account_deletion_op_sweeps('de1e7217-0000-4000-8000-0000000000f4',
    '{"email": "ops-b-ci@example.invalid"}'::jsonb),
  'sweeps were not recorded exactly once with allow-listed keys'
);
SELECT pg_temp.assert_true(
  (SELECT r ->> 'status' = 'completed'
          AND (r -> 'sweeps' ->> 'profile_erased')::boolean
          AND (r ->> 'sweeps_reported')::boolean
          AND NOT (r ? 'token_issued_ms')
          AND NOT (r::text LIKE '%de1e7217-0000-4000-8000-00000000000b%')
     FROM (SELECT public.get_account_deletion_op('de1e7217-0000-4000-8000-0000000000f5', NULL) AS r) AS q)
  AND public.get_account_deletion_op('de1e7217-0000-4000-8000-0000000000f5', pg_catalog.repeat('b5', 32)) ->> 'status' = 'completed',
  'the receipt read leaked an account id or missed the completed op'
);

-- Lookup limiter: thirty per key per hour, then a bounded retry-after.
DO $limiter$
DECLARE
  v_allowed boolean;
  v_retry integer;
  v_i integer;
BEGIN
  FOR v_i IN 1..30 LOOP
    SELECT allowed, retry_after_seconds INTO v_allowed, v_retry
      FROM public.consume_account_deletion_receipt_lookup(pg_catalog.repeat('c1', 32));
    IF NOT v_allowed THEN
      RAISE EXCEPTION 'lookup % was refused under the cap', v_i;
    END IF;
  END LOOP;
  SELECT allowed, retry_after_seconds INTO v_allowed, v_retry
    FROM public.consume_account_deletion_receipt_lookup(pg_catalog.repeat('c1', 32));
  IF v_allowed OR v_retry NOT BETWEEN 1 AND 3600 THEN
    RAISE EXCEPTION 'lookup 31 was not refused with a bounded retry-after (%, %)', v_allowed, v_retry;
  END IF;
  SELECT allowed INTO v_allowed
    FROM public.consume_account_deletion_receipt_lookup(pg_catalog.repeat('c2', 32));
  IF NOT v_allowed THEN
    RAISE EXCEPTION 'one exhausted key throttled another key';
  END IF;
END;
$limiter$;

-- Maintenance: expired receipts and month-old closed ops go; live receipts stay.
UPDATE public.account_deletion_ops
   SET finished_at = pg_catalog.now() - interval '400 days',
       receipt_expires_at = pg_catalog.now() - interval '35 days'
 WHERE id = 'de1e7217-0000-4000-8000-0000000000f4';
UPDATE public.account_deletion_ops
   SET finished_at = pg_catalog.now() - interval '31 days'
 WHERE id = 'de1e7217-0000-4000-8000-0000000000f1';
SELECT pg_temp.assert_true(
  public.get_account_deletion_op('de1e7217-0000-4000-8000-0000000000f4', NULL) IS NULL,
  'an expired receipt was still readable'
);
SELECT public.purge_account_deletion_ops();
SELECT pg_temp.assert_true(
  NOT EXISTS (SELECT 1 FROM public.account_deletion_ops WHERE id IN (
    'de1e7217-0000-4000-8000-0000000000f4', 'de1e7217-0000-4000-8000-0000000000f1'))
  AND EXISTS (SELECT 1 FROM public.account_deletion_ops WHERE id = 'de1e7217-0000-4000-8000-0000000000f5')
  AND EXISTS (SELECT 1 FROM public.account_deletion_ops WHERE id = 'de1e7217-0000-4000-8000-0000000000f2'),
  'maintenance purged the wrong rows'
);

-- Maintenance settles a stale executing op of a live account and releases its fence.
SELECT public.begin_account_deletion_op('de1e7217-0000-4000-8000-0000000000f6', 'de1e7217-0000-4000-8000-00000000000a',
  (SELECT ms FROM ci_now), pg_catalog.repeat('a6', 32));
SELECT public.start_account_deletion_op('de1e7217-0000-4000-8000-0000000000f6', 'de1e7217-0000-4000-8000-00000000000a',
  pg_catalog.repeat('a6', 32));
SELECT public.begin_account_deletion(
  'de1e7217-0000-4000-8000-00000000000a', 'de1e7217-0000-4000-8000-0000000000a1', pg_catalog.now());
UPDATE public.account_deletion_ops SET last_attempt_at = pg_catalog.now() - interval '16 minutes'
 WHERE id = 'de1e7217-0000-4000-8000-0000000000f6';
UPDATE public.account_deletion_tombstones SET last_requested_at = pg_catalog.now() - interval '16 minutes'
 WHERE user_id = 'de1e7217-0000-4000-8000-00000000000a';
CREATE TEMP TABLE ci_purge AS SELECT public.purge_account_deletion_ops() AS r;
SELECT pg_temp.assert_true(
  ((SELECT r FROM ci_purge) ->> 'fences_released')::integer = 1
  AND (SELECT status = 'failed' AND failure_code = 'stale_execution'
         FROM public.account_deletion_ops WHERE id = 'de1e7217-0000-4000-8000-0000000000f6')
  AND NOT EXISTS (SELECT 1 FROM public.account_deletion_tombstones WHERE user_id = 'de1e7217-0000-4000-8000-00000000000a'),
  'maintenance did not settle a stale execution and release its fence'
);

-- Gate DLR-A1-10: a month-old failure that is still the release evidence of an
-- unreleased fence (another op of the account is executing) survives the purge.
UPDATE public.account_deletion_ops
   SET finished_at = pg_catalog.now() - interval '31 days',
       last_attempt_at = pg_catalog.now() - interval '32 days'
 WHERE id = 'de1e7217-0000-4000-8000-0000000000f6';
SELECT public.begin_account_deletion(
  'de1e7217-0000-4000-8000-00000000000a', 'de1e7217-0000-4000-8000-0000000000a1', pg_catalog.now());
UPDATE public.account_deletion_tombstones SET last_requested_at = pg_catalog.now() - interval '33 days'
 WHERE user_id = 'de1e7217-0000-4000-8000-00000000000a';
SELECT public.begin_account_deletion_op('de1e7217-0000-4000-8000-0000000000f7', 'de1e7217-0000-4000-8000-00000000000a',
  (SELECT ms FROM ci_now), pg_catalog.repeat('a7', 32));
SELECT public.start_account_deletion_op('de1e7217-0000-4000-8000-0000000000f7', 'de1e7217-0000-4000-8000-00000000000a',
  pg_catalog.repeat('a7', 32));
CREATE TEMP TABLE ci_purge_evidence AS SELECT public.purge_account_deletion_ops() AS r;
SELECT pg_temp.assert_true(
  ((SELECT r FROM ci_purge_evidence) ->> 'fences_released')::integer = 0
  AND EXISTS (SELECT 1 FROM public.account_deletion_ops WHERE id = 'de1e7217-0000-4000-8000-0000000000f6')
  AND EXISTS (SELECT 1 FROM public.account_deletion_tombstones WHERE user_id = 'de1e7217-0000-4000-8000-00000000000a'),
  'maintenance purged the release evidence of a fence it could not release yet'
);

-- Gate SAFE-06: the profile trigger swallowed its failure (simulated by
-- disabling it), so the op is still executing after the profile row went. The
-- sweep record completes it and records the sweeps, so the receipt exists now.
ALTER TABLE public.users DISABLE TRIGGER trg_users_complete_account_deletion_ops;
DELETE FROM public.users WHERE id = 'de1e7217-0000-4000-8000-00000000000a';
ALTER TABLE public.users ENABLE TRIGGER trg_users_complete_account_deletion_ops;
CREATE TEMP TABLE ci_record_settle AS
SELECT public.record_account_deletion_op_sweeps('de1e7217-0000-4000-8000-0000000000f7',
  '{"profile_erased": true, "deletion_fenced": true}'::jsonb) AS r;
SELECT pg_temp.assert_true(
  (SELECT r FROM ci_record_settle)
  AND (SELECT status = 'completed' AND owner_id IS NULL AND sweeps_reported_at IS NOT NULL
              AND (sweeps ->> 'profile_erased')::boolean
         FROM public.account_deletion_ops WHERE id = 'de1e7217-0000-4000-8000-0000000000f7')
  AND public.get_account_deletion_op('de1e7217-0000-4000-8000-0000000000f7', NULL) ->> 'status' = 'completed'
  AND NOT EXISTS (SELECT 1 FROM public.account_deletion_ops WHERE owner_id = 'de1e7217-0000-4000-8000-00000000000a'),
  'the sweep record did not complete an op the trigger left open'
);

ROLLBACK;
