\set ON_ERROR_STOP on

-- Run only on the CI scratch database after numbered 0255.
-- Z46: a chat turn whose answer was swapped for the fixed crisis notice is given back, once, on the
-- proxy-written audit row of that very turn and on the day that turn was counted on (0252, 0255).
BEGIN;

CREATE FUNCTION pg_temp.z46_assert(p_ok boolean, p_what text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'z46 regression failed: %', p_what;
  END IF;
END
$$;

CREATE FUNCTION pg_temp.z46_count(p_user uuid, p_day date) RETURNS int
LANGUAGE sql AS $$
  SELECT count FROM public.chat_usage WHERE user_id = p_user AND day = p_day
$$;

-- How many of that user's reservations counted on that day have not been given back.
CREATE FUNCTION pg_temp.z46_waiting(p_user uuid, p_day date) RETURNS int
LANGUAGE sql AS $$
  SELECT count(*)::int FROM public.chat_turn_reservations
   WHERE user_id = p_user AND counted_day = p_day AND state <> 'refunded'
$$;

-- A reservation as text: 'state/the audit row bound to it' ('counted/-' while nothing answers it).
CREATE FUNCTION pg_temp.z46_turn(p_turn uuid) RETURNS text
LANGUAGE sql AS $$
  SELECT state || '/' || COALESCE(audit_id::text, '-') FROM public.chat_turn_reservations WHERE turn_id = p_turn
$$;

-- The day an audit row was used for, or NULL while it is unused.
CREATE FUNCTION pg_temp.z46_used(p_audit uuid) RETURNS date
LANGUAGE sql AS $$
  SELECT day FROM public.chat_turn_refunds WHERE audit_id = p_audit
$$;

-- What a proxy does for one call: it writes the audit row (openai-proxy writes event_source
-- 'server_verified' as service_role) and, when the app named a turn, asks the server to bind that row
-- to the turn. The answer to that question is the real function's, whatever the row looks like.
CREATE FUNCTION pg_temp.z46_audit(p_id uuid, p_user uuid, p_source text, p_purpose text, p_zone text, p_age interval, p_turn uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.ai_audit_log
    (id, user_id, prompt_hash, output_hash, model_used, vertex_backend, safety_zone, latency_ms, created_at, purpose, event_source)
  VALUES
    (p_id, p_user, '0a0b0c0d', '0e0f0a0b', 'gpt-test', false, p_zone::public.safety_zone, 10,
     pg_catalog.now() - p_age, p_purpose, p_source);
  IF p_turn IS NOT NULL THEN
    PERFORM public.claim_chat_turn_for_audit(p_user, p_id, p_turn);
  END IF;
END
$$;

SELECT (pg_catalog.now() AT TIME ZONE 'Asia/Seoul')::date AS today \gset

-- The vanilla PostgreSQL auth stub lacks production trigger columns.
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users (id, email) VALUES
  ('26101346-0000-4000-8000-00000000000a', 'z46-a@example.com'),
  ('26101346-0000-4000-8000-00000000000b', 'z46-b@example.com'),
  ('26101346-0000-4000-8000-00000000000d', 'z46-d@example.com'),
  ('26101346-0000-4000-8000-00000000000e', 'z46-e@example.com');
SET LOCAL session_replication_role = origin;
INSERT INTO public.users (id, email, birth_date, locale) VALUES
  ('26101346-0000-4000-8000-00000000000a', 'z46-a@example.com', DATE '1990-01-01', 'en'),
  ('26101346-0000-4000-8000-00000000000b', 'z46-b@example.com', DATE '1990-01-01', 'en'),
  ('26101346-0000-4000-8000-00000000000d', 'z46-d@example.com', DATE '1990-01-01', 'en'),
  ('26101346-0000-4000-8000-00000000000e', 'z46-e@example.com', DATE '1990-01-01', 'en');

-- Counted turns, as bump_chat_usage_for_turn leaves them: the count on the day's row and one
-- reservation per turn that may still be given back. Turn ids end in the two digits used below
-- (…7001 is "turn 01"); turn 11 was counted yesterday.
INSERT INTO public.chat_usage (user_id, day, count, ad_bonus) VALUES
  ('26101346-0000-4000-8000-00000000000a', :'today'::date, 3, 2),
  ('26101346-0000-4000-8000-00000000000a', :'today'::date - 1, 2, 0),
  ('26101346-0000-4000-8000-00000000000a', :'today'::date - 2, 4, 0),
  ('26101346-0000-4000-8000-00000000000b', :'today'::date, 1, 0),
  ('26101346-0000-4000-8000-00000000000e', :'today'::date, 3, 0);
INSERT INTO public.chat_turn_reservations (turn_id, user_id, counted_day) VALUES
  ('26101346-7000-4000-8000-000000007001', '26101346-0000-4000-8000-00000000000a', :'today'::date),
  ('26101346-7000-4000-8000-000000007002', '26101346-0000-4000-8000-00000000000a', :'today'::date),
  ('26101346-7000-4000-8000-000000007003', '26101346-0000-4000-8000-00000000000a', :'today'::date),
  ('26101346-7000-4000-8000-000000007004', '26101346-0000-4000-8000-00000000000a', :'today'::date),
  ('26101346-7000-4000-8000-000000007005', '26101346-0000-4000-8000-00000000000a', :'today'::date),
  ('26101346-7000-4000-8000-000000007006', '26101346-0000-4000-8000-00000000000a', :'today'::date),
  ('26101346-7000-4000-8000-000000007007', '26101346-0000-4000-8000-00000000000a', :'today'::date),
  ('26101346-7000-4000-8000-000000007008', '26101346-0000-4000-8000-00000000000a', :'today'::date),
  ('26101346-7000-4000-8000-000000007011', '26101346-0000-4000-8000-00000000000a', :'today'::date - 1),
  ('26101346-7000-4000-8000-0000000070b1', '26101346-0000-4000-8000-00000000000b', :'today'::date),
  ('26101346-7000-4000-8000-0000000070b2', '26101346-0000-4000-8000-00000000000b', :'today'::date),
  ('26101346-7000-4000-8000-0000000070b3', '26101346-0000-4000-8000-00000000000b', :'today'::date),
  ('26101346-7000-4000-8000-0000000070b4', '26101346-0000-4000-8000-00000000000b', :'today'::date);

-- Who may call what, what is left of the unbound form, and who may touch the ledger table.
DO $acl$
DECLARE
  v_acl aclitem[];
BEGIN
  PERFORM pg_temp.z46_assert(to_regprocedure('public.refund_chat_turn_after_output_swap(date)') IS NULL
                             AND to_regprocedure('public.refund_chat_turn_after_output_swap(date, uuid)') IS NULL,
    'a refund that takes a day from the caller still exists');
  SELECT p.proacl INTO v_acl FROM pg_catalog.pg_proc p
   WHERE p.oid = 'public.refund_chat_turn_after_output_swap(uuid)'::regprocedure;
  PERFORM pg_temp.z46_assert(v_acl IS NOT NULL, 'function ACL is still the default (PUBLIC can execute)');
  PERFORM pg_temp.z46_assert(NOT EXISTS (
    SELECT 1 FROM pg_catalog.aclexplode(v_acl) a LEFT JOIN pg_catalog.pg_roles r ON r.oid = a.grantee
     WHERE a.privilege_type = 'EXECUTE' AND (a.grantee = 0 OR r.rolname IN ('anon', 'service_role'))),
    'PUBLIC, anon or service_role holds EXECUTE directly');
  -- Effective privilege, inherited grants included.
  PERFORM pg_temp.z46_assert(has_function_privilege('authenticated', 'public.refund_chat_turn_after_output_swap(uuid)', 'EXECUTE')
                             AND has_function_privilege('authenticated', 'public.bump_chat_usage_for_turn(uuid, date)', 'EXECUTE'),
    'authenticated cannot execute the refund or the turn bump');
  -- The question a proxy asks is the proxy's alone: no signed-in or anonymous caller may bind an answer to a turn.
  PERFORM pg_temp.z46_assert(has_function_privilege('service_role', 'public.claim_chat_turn_for_audit(uuid, uuid, uuid)', 'EXECUTE')
                             AND NOT has_function_privilege('authenticated', 'public.claim_chat_turn_for_audit(uuid, uuid, uuid)', 'EXECUTE')
                             AND NOT has_function_privilege('anon', 'public.claim_chat_turn_for_audit(uuid, uuid, uuid)', 'EXECUTE'),
    'the claim is not service_role''s alone');
  PERFORM pg_temp.z46_assert(NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p CROSS JOIN LATERAL pg_catalog.aclexplode(p.proacl) a
     WHERE p.oid = 'public.claim_chat_turn_for_audit(uuid, uuid, uuid)'::regprocedure AND a.privilege_type = 'EXECUTE' AND a.grantee = 0),
    'PUBLIC holds EXECUTE on the claim');
  PERFORM pg_temp.z46_assert(NOT has_function_privilege('anon', 'public.refund_chat_turn_after_output_swap(uuid)', 'EXECUTE')
                             AND NOT has_function_privilege('service_role', 'public.refund_chat_turn_after_output_swap(uuid)', 'EXECUTE')
                             AND NOT has_function_privilege('anon', 'public.bump_chat_usage_for_turn(uuid, date)', 'EXECUTE')
                             AND NOT has_function_privilege('service_role', 'public.bump_chat_usage_for_turn(uuid, date)', 'EXECUTE'),
    'anon or service_role can execute the refund or the turn bump');
  PERFORM pg_temp.z46_assert(NOT has_function_privilege('authenticated', 'public.guard_ai_audit_server_verified_final()', 'EXECUTE')
                             AND NOT has_function_privilege('authenticated', 'public.guard_ai_audit_server_verified()', 'EXECUTE'),
    'an API role may call a trigger function directly');
  PERFORM pg_temp.z46_assert((SELECT bool_and(p.prosecdef AND p.proconfig @> ARRAY['search_path=""']) FROM pg_catalog.pg_proc p
                               WHERE p.oid IN ('public.refund_chat_turn_after_output_swap(uuid)'::regprocedure,
                                               'public.bump_chat_usage_for_turn(uuid, date)'::regprocedure,
                                               'public.claim_chat_turn_for_audit(uuid, uuid, uuid)'::regprocedure)),
    'the refund, the turn bump or the claim is not a definer function with an empty search path');
  -- Both guards are on the table and switched on: one before the write, one on the stored row.
  PERFORM pg_temp.z46_assert((SELECT count(*) = 2 FROM pg_catalog.pg_trigger t
                               WHERE t.tgrelid = 'public.ai_audit_log'::regclass AND NOT t.tgisinternal AND t.tgenabled = 'O'
                                 AND t.tgname IN ('guard_ai_audit_server_verified', 'guard_ai_audit_server_verified_final')),
    'the two guards on ai_audit_log are not both present and enabled');
  PERFORM pg_temp.z46_assert((SELECT (t.tgtype & 1) = 1 AND (t.tgtype & 2) = 0 AND (t.tgtype & 4) = 4 AND (t.tgtype & 16) = 16
                                     AND t.tgattr::text = ''
                                FROM pg_catalog.pg_trigger t
                               WHERE t.tgrelid = 'public.ai_audit_log'::regclass AND t.tgname = 'guard_ai_audit_server_verified_final'),
    'the final guard is not a row trigger AFTER INSERT OR UPDATE of any column');
  -- The reservation table: row security with no policy, and no privilege for any role of the application.
  PERFORM pg_temp.z46_assert((SELECT c.relrowsecurity FROM pg_catalog.pg_class c WHERE c.oid = 'public.chat_turn_reservations'::regclass)
                             AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policy p WHERE p.polrelid = 'public.chat_turn_reservations'::regclass),
    'the reservation table is not policy-less RLS');
  PERFORM pg_temp.z46_assert(NOT has_table_privilege('authenticated', 'public.chat_turn_reservations', 'SELECT, INSERT, UPDATE, DELETE')
                             AND NOT has_table_privilege('anon', 'public.chat_turn_reservations', 'SELECT, INSERT, UPDATE, DELETE')
                             AND NOT has_table_privilege('service_role', 'public.chat_turn_reservations', 'SELECT, INSERT, UPDATE, DELETE'),
    'an API role holds a privilege on the reservation table');
  -- One answer, one reservation: the audit row a reservation is bound to is unique, and so is the turn id.
  PERFORM pg_temp.z46_assert((SELECT count(*) = 2 FROM pg_catalog.pg_constraint c
                               WHERE c.conrelid = 'public.chat_turn_reservations'::regclass AND c.contype IN ('p', 'u')
                                 AND NOT c.condeferrable AND pg_catalog.cardinality(c.conkey) = 1),
    'the reservation table lacks its primary key or its unique audit row');
  -- The ledger of 0252 is as it was.
  PERFORM pg_temp.z46_assert((SELECT c.relrowsecurity FROM pg_catalog.pg_class c WHERE c.oid = 'public.chat_turn_refunds'::regclass)
                             AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policy p WHERE p.polrelid = 'public.chat_turn_refunds'::regclass),
    'the ledger table is not policy-less RLS');
  PERFORM pg_temp.z46_assert(NOT has_table_privilege('authenticated', 'public.chat_turn_refunds', 'SELECT')
                             AND NOT has_table_privilege('authenticated', 'public.chat_turn_refunds', 'INSERT')
                             AND NOT has_table_privilege('authenticated', 'public.chat_turn_refunds', 'DELETE')
                             AND NOT has_table_privilege('anon', 'public.chat_turn_refunds', 'SELECT')
                             AND NOT has_table_privilege('service_role', 'public.chat_turn_refunds', 'DELETE'),
    'an API role holds a privilege on the ledger table');
END
$acl$;

-- anon is refused by privilege, before either function body runs.
SET LOCAL ROLE anon;
DO $anon$
BEGIN
  BEGIN
    PERFORM public.refund_chat_turn_after_output_swap('26101346-4000-4000-8000-000000000011');
    RAISE EXCEPTION 'z46 regression failed: anon called the refund';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  BEGIN
    PERFORM public.bump_chat_usage_for_turn('26101346-0000-4000-8000-00000000000a', (pg_catalog.now() AT TIME ZONE 'Asia/Seoul')::date);
    RAISE EXCEPTION 'z46 regression failed: anon called the turn bump';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  BEGIN
    PERFORM public.claim_chat_turn_for_audit('26101346-0000-4000-8000-00000000000a', '26101346-4000-4000-8000-000000000011', '26101346-7000-4000-8000-000000007001');
    RAISE EXCEPTION 'z46 regression failed: anon called the claim';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$anon$;
RESET ROLE;

-- Nobody signed in: refused, not a silent NULL.
DO $unsigned$
BEGIN
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', '', true);
  BEGIN
    PERFORM public.refund_chat_turn_after_output_swap('26101346-4000-4000-8000-000000000011');
    RAISE EXCEPTION 'z46 regression failed: a call with no signed-in user was accepted';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$unsigned$;

-- The turn bump: counts through the existing bump and hands out the id of a reservation for that day.
-- User D is on the free plan (five turns a day).
SET LOCAL request.jwt.claim.sub = '26101346-0000-4000-8000-00000000000d';
SET LOCAL ROLE authenticated;
SELECT public.bump_chat_usage_for_turn('26101346-0000-4000-8000-00000000000d', :'today'::date)::text AS d1 \gset
SELECT public.bump_chat_usage_for_turn('26101346-0000-4000-8000-00000000000d', :'today'::date)::text AS d2 \gset
SELECT public.bump_chat_usage_for_turn('26101346-0000-4000-8000-00000000000d', :'today'::date - 1)::text AS d3 \gset
DO $others$
BEGIN
  BEGIN
    PERFORM public.bump_chat_usage_for_turn('26101346-0000-4000-8000-00000000000a', (pg_catalog.now() AT TIME ZONE 'Asia/Seoul')::date);
    RAISE EXCEPTION 'z46 regression failed: a turn was counted on another user''s day';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$others$;
RESET ROLE;
SELECT pg_temp.z46_assert((:'d1'::jsonb ->> 'count') = '1' AND (:'d2'::jsonb ->> 'count') = '2' AND (:'d3'::jsonb ->> 'count') = '1',
                          'the turn bump did not return the new counts 1, 2 and 1');
SELECT pg_temp.z46_assert((:'d1'::jsonb ->> 'turnId') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                          AND (:'d1'::jsonb ->> 'turnId') <> (:'d2'::jsonb ->> 'turnId')
                          AND (:'d2'::jsonb ->> 'turnId') <> (:'d3'::jsonb ->> 'turnId'),
                          'the turn bump did not hand out three different ids');
SELECT pg_temp.z46_assert((SELECT count(*) = 2 AND bool_and(user_id = '26101346-0000-4000-8000-00000000000d' AND counted_day = :'today'::date
                                                             AND state = 'counted' AND audit_id IS NULL
                                                             AND issued_at <= pg_catalog.clock_timestamp()
                                                             AND issued_at > pg_catalog.clock_timestamp() - interval '1 minute')
                             FROM public.chat_turn_reservations
                            WHERE turn_id IN ((:'d1'::jsonb ->> 'turnId')::uuid, (:'d2'::jsonb ->> 'turnId')::uuid))
                          AND (SELECT user_id = '26101346-0000-4000-8000-00000000000d' AND counted_day = :'today'::date - 1 AND state = 'counted'
                                 FROM public.chat_turn_reservations WHERE turn_id = (:'d3'::jsonb ->> 'turnId')::uuid)
                          AND (SELECT count(*) = 3 FROM public.chat_turn_reservations WHERE user_id = '26101346-0000-4000-8000-00000000000d'),
                          'a counted turn did not get a reservation of its own for the caller and the day it was counted on');
SELECT pg_temp.z46_assert(pg_temp.z46_count('26101346-0000-4000-8000-00000000000a', :'today'::date) = 3
                          AND pg_temp.z46_waiting('26101346-0000-4000-8000-00000000000a', :'today'::date) = 8,
                          'the refused bump for another user changed that user''s row');
-- At the cap the bump refuses as the existing one does, and no reservation is left behind.
SET LOCAL ROLE authenticated;
SELECT public.bump_chat_usage_for_turn('26101346-0000-4000-8000-00000000000d', :'today'::date) \gset d_
SELECT public.bump_chat_usage_for_turn('26101346-0000-4000-8000-00000000000d', :'today'::date) \gset d_
SELECT public.bump_chat_usage_for_turn('26101346-0000-4000-8000-00000000000d', :'today'::date) \gset d_
DO $cap$
BEGIN
  BEGIN
    PERFORM public.bump_chat_usage_for_turn('26101346-0000-4000-8000-00000000000d', (pg_catalog.now() AT TIME ZONE 'Asia/Seoul')::date);
    RAISE EXCEPTION 'z46 regression failed: a sixth turn was counted on the free plan';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM NOT LIKE '%chat_limit_exceeded%' THEN RAISE; END IF;
  END;
END
$cap$;
RESET ROLE;
SELECT pg_temp.z46_assert(pg_temp.z46_count('26101346-0000-4000-8000-00000000000d', :'today'::date) = 5
                          AND pg_temp.z46_waiting('26101346-0000-4000-8000-00000000000d', :'today'::date) = 5,
                          'the refused sixth turn changed the count or left a reservation behind');
-- The existing bump still works and makes no reservation: a turn counted that way cannot be given back.
SET LOCAL request.jwt.claim.sub = '26101346-0000-4000-8000-00000000000b';
SET LOCAL ROLE authenticated;
SELECT public.bump_chat_usage_if_under_cap('26101346-0000-4000-8000-00000000000b', :'today'::date, 0) AS old_bump \gset
RESET ROLE;
SELECT pg_temp.z46_assert(:'old_bump' = '2' AND pg_temp.z46_waiting('26101346-0000-4000-8000-00000000000b', :'today'::date) = 4,
                          'the existing bump did not count as before, or made a reservation');
UPDATE public.chat_usage SET count = 1 WHERE user_id = '26101346-0000-4000-8000-00000000000b' AND day = :'today'::date;

-- Evidence that must NOT count, all for user A, each naming a turn that waits (06, 07, 08) or none: written by the
-- client, green, another purpose, too old, legacy, without a turn, naming a turn nobody counted.
SELECT pg_temp.z46_audit('26101346-4000-4000-8000-000000000001', '26101346-0000-4000-8000-00000000000a', 'client_unverified', 'secondb_chat', 'red', interval '1 minute', NULL);
SELECT pg_temp.z46_audit('26101346-4000-4000-8000-000000000002', '26101346-0000-4000-8000-00000000000a', 'server_verified', 'secondb_chat', 'green', interval '20 seconds', '26101346-7000-4000-8000-000000007006');
SELECT pg_temp.z46_audit('26101346-4000-4000-8000-000000000003', '26101346-0000-4000-8000-00000000000a', 'server_verified', 'ops_recommend', 'red', interval '20 seconds', '26101346-7000-4000-8000-000000007007');
SELECT pg_temp.z46_audit('26101346-4000-4000-8000-000000000004', '26101346-0000-4000-8000-00000000000a', 'server_verified', 'secondb_chat', 'red', interval '11 minutes', '26101346-7000-4000-8000-000000007008');
SELECT pg_temp.z46_audit('26101346-4000-4000-8000-000000000005', '26101346-0000-4000-8000-00000000000a', 'legacy_unknown', 'secondb_chat', 'red', interval '1 minute', NULL);
SELECT pg_temp.z46_audit('26101346-4000-4000-8000-000000000006', '26101346-0000-4000-8000-00000000000a', 'server_verified', 'secondb_chat', 'red', interval '1 minute', NULL);
SELECT pg_temp.z46_audit('26101346-4000-4000-8000-000000000007', '26101346-0000-4000-8000-00000000000a', 'server_verified', 'secondb_chat', 'red', interval '20 seconds', '26101346-7000-4000-8000-0000000070ff');
-- A's row naming a turn that B counted: the turn is not on any of A's rows.
SELECT pg_temp.z46_audit('26101346-4000-4000-8000-000000000008', '26101346-0000-4000-8000-00000000000a', 'server_verified', 'secondb_chat', 'red', interval '20 seconds', '26101346-7000-4000-8000-0000000070b4');
-- B's own evidence is B's.
SELECT pg_temp.z46_audit('26101346-4000-4000-8000-0000000000b1', '26101346-0000-4000-8000-00000000000b', 'server_verified', 'secondb_chat', 'red', interval '20 seconds', '26101346-7000-4000-8000-0000000070b1');

-- What a signed-in client can do on its own must never become evidence.
-- The scratch database has no Supabase table-privilege floor, so the grants below stand in for
-- it: with them in place only row security is left to refuse a direct write.
GRANT SELECT, INSERT, UPDATE ON public.ai_audit_log TO authenticated;
SET LOCAL request.jwt.claim.sub = '26101346-0000-4000-8000-00000000000a';
SET LOCAL ROLE authenticated;
-- (1) The client's own audit RPC stamps the row as the client's.
SELECT public.log_ai_audit('0a0b0c0d', '0e0f0a0b', 'gpt-test+swap:v1', false, 'red', 10, 'secondb_chat');
-- (1b) So does the once-only variant, the other audit writer a client may call.
SELECT public.log_ai_audit_once('z46-once-0001', '0a0b0c0d', '0e0f0a0b', 'gpt-test+swap-once:v1', false, 'red', 10, 'secondb_chat');
-- (2) A direct insert that claims to be the proxy is refused.
DO $forge$
BEGIN
  BEGIN
    INSERT INTO public.ai_audit_log
      (user_id, prompt_hash, output_hash, model_used, vertex_backend, safety_zone, latency_ms, purpose, event_source)
    VALUES ('26101346-0000-4000-8000-00000000000a', '0a0b0c0d', '0e0f0a0b', 'forged', false, 'red', 10, 'secondb_chat', 'server_verified');
    RAISE EXCEPTION 'z46 regression failed: a signed-in user inserted a server_verified audit row';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$forge$;
-- (3) Promoting an existing row is refused or changes nothing.
DO $promote$
BEGIN
  BEGIN
    UPDATE public.ai_audit_log SET event_source = 'server_verified'
     WHERE user_id = '26101346-0000-4000-8000-00000000000a' AND purpose = 'secondb_chat' AND safety_zone = 'red'
       AND event_source = 'client_unverified' AND model_used = 'gpt-test+swap:v1';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$promote$;
RESET ROLE;
SELECT pg_temp.z46_assert((SELECT count(*) = 1 FROM public.ai_audit_log
                            WHERE user_id = '26101346-0000-4000-8000-00000000000a' AND model_used = 'gpt-test+swap:v1'
                              AND event_source = 'client_unverified'),
                          'the client audit RPC did not write a client_unverified row');
SELECT pg_temp.z46_assert((SELECT count(*) = 1 FROM public.ai_audit_log
                            WHERE user_id = '26101346-0000-4000-8000-00000000000a' AND model_used = 'gpt-test+swap-once:v1'
                              AND event_source = 'client_unverified'),
                          'the once-only client audit RPC did not write a client_unverified row');
-- The ids of the two rows the client wrote for itself: the client knows them, so it can ask with them.
SELECT (SELECT id FROM public.ai_audit_log WHERE model_used = 'gpt-test+swap:v1') AS c1,
       (SELECT id FROM public.ai_audit_log WHERE model_used = 'gpt-test+swap-once:v1') AS c2 \gset
-- Asking with each row that is not evidence, one by one, and with B's row: never a turn back.
SET LOCAL ROLE authenticated;
SELECT concat_ws(',',
         COALESCE(public.refund_chat_turn_after_output_swap('26101346-4000-4000-8000-000000000001')::text, 'null'),
         COALESCE(public.refund_chat_turn_after_output_swap('26101346-4000-4000-8000-000000000002')::text, 'null'),
         COALESCE(public.refund_chat_turn_after_output_swap('26101346-4000-4000-8000-000000000003')::text, 'null'),
         COALESCE(public.refund_chat_turn_after_output_swap('26101346-4000-4000-8000-000000000004')::text, 'null'),
         COALESCE(public.refund_chat_turn_after_output_swap('26101346-4000-4000-8000-000000000005')::text, 'null'),
         COALESCE(public.refund_chat_turn_after_output_swap('26101346-4000-4000-8000-000000000006')::text, 'null'),
         COALESCE(public.refund_chat_turn_after_output_swap('26101346-4000-4000-8000-000000000007')::text, 'null'),
         COALESCE(public.refund_chat_turn_after_output_swap('26101346-4000-4000-8000-000000000008')::text, 'null'),
         COALESCE(public.refund_chat_turn_after_output_swap('26101346-4000-4000-8000-0000000000b1')::text, 'null'),
         COALESCE(public.refund_chat_turn_after_output_swap(:'c1')::text, 'null'),
         COALESCE(public.refund_chat_turn_after_output_swap(:'c2')::text, 'null'),
         COALESCE(public.refund_chat_turn_after_output_swap('26101346-4000-4000-8000-0000000000ff')::text, 'null'),
         COALESCE(public.refund_chat_turn_after_output_swap(NULL)::text, 'null')) AS r \gset
RESET ROLE;
-- The two calls above are every way a signed-in user has to write an audit row. If this list
-- grows, the new function needs its own forged-evidence call here before it may ship. The list is
-- read from function bodies (a direct INSERT or UPDATE of the table) outside the pg_* schemas, so
-- this file's own pg_temp helper is not in it. A function that writes through another function is
-- not seen here. The names are sorted byte by byte (COLLATE "C"), so the list reads the same on
-- every server whatever its locale.
SELECT COALESCE(pg_catalog.string_agg(p.oid::regprocedure::text, ' | ' ORDER BY p.oid::regprocedure::text COLLATE "C"), '') AS client_writers
  FROM pg_catalog.pg_proc AS p JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
 WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema' AND p.prokind = 'f'
   AND p.prosrc ~* '(insert\s+into|update)\s+(only\s+)?(public\.)?ai_audit_log\M'
   AND has_function_privilege('authenticated', p.oid, 'EXECUTE') \gset
SELECT pg_temp.z46_assert(
  :'client_writers' = 'log_ai_audit(text,text,text,boolean,text,integer,text,text,text) | log_ai_audit_once(text,text,text,text,boolean,text,integer,text,text,text)',
  'the functions a signed-in user may call that write ai_audit_log are no longer exactly log_ai_audit and log_ai_audit_once: ' || :'client_writers');
-- The same for the reservations: only the turn bump, the claim and the refund name that table.
SELECT COALESCE(pg_catalog.string_agg(p.oid::regprocedure::text, ' | ' ORDER BY p.oid::regprocedure::text COLLATE "C"), '') AS turn_writers
  FROM pg_catalog.pg_proc AS p JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
 WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema' AND p.prokind = 'f'
   AND p.prosrc ~* 'chat_turn_reservations' \gset
SELECT pg_temp.z46_assert(
  :'turn_writers' = 'bump_chat_usage_for_turn(uuid,date) | claim_chat_turn_for_audit(uuid,uuid,uuid) | refund_chat_turn_after_output_swap(uuid)',
  'the functions that name chat_turn_reservations are no longer exactly the turn bump, the claim and the refund: ' || :'turn_writers');
SELECT pg_temp.z46_assert((SELECT count(*) = 0 FROM public.ai_audit_log
                            WHERE user_id = '26101346-0000-4000-8000-00000000000a' AND event_source = 'server_verified'
                              AND model_used IN ('forged', 'gpt-test+swap:v1', 'gpt-test+swap-once:v1')),
                          'a signed-in user made or promoted a server_verified row');
-- What those rows did to the reservations: the green answer took turn 06 (a green row gives nothing back);
-- the row for another purpose and the row that was 11 minutes old took nothing; neither did the row that
-- named a turn nobody counted, nor A's row that named B's turn. B's own row took B's turn 1.
SELECT pg_temp.z46_assert(pg_temp.z46_turn('26101346-7000-4000-8000-000000007006') = 'answered/26101346-4000-4000-8000-000000000002'
                          AND pg_temp.z46_turn('26101346-7000-4000-8000-000000007007') = 'counted/-'
                          AND pg_temp.z46_turn('26101346-7000-4000-8000-000000007008') = 'counted/-'
                          AND pg_temp.z46_turn('26101346-7000-4000-8000-0000000070b4') = 'counted/-'
                          AND pg_temp.z46_turn('26101346-7000-4000-8000-0000000070b1') = 'answered/26101346-4000-4000-8000-0000000000b1'
                          AND pg_temp.z46_turn('26101346-7000-4000-8000-0000000070ff') IS NULL,
                          'a row that should not have been bound to a turn was, or one that should have been was not');
-- A signed-in user holding every table privilege still sees and changes no reservation: row security has no policy.
SAVEPOINT z46_reservations_open;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_turn_reservations TO authenticated;
SET LOCAL ROLE authenticated;
SELECT (SELECT count(*) FROM public.chat_turn_reservations) AS seen \gset
UPDATE public.chat_turn_reservations SET state = 'answered', audit_id = '26101346-4000-4000-8000-000000000006'
 WHERE turn_id = '26101346-7000-4000-8000-000000007001';
DELETE FROM public.chat_turn_reservations WHERE user_id = '26101346-0000-4000-8000-00000000000a';
DO $reserve$
BEGIN
  BEGIN
    INSERT INTO public.chat_turn_reservations (user_id, counted_day)
    VALUES ('26101346-0000-4000-8000-00000000000a', (pg_catalog.now() AT TIME ZONE 'Asia/Seoul')::date);
    RAISE EXCEPTION 'z46 regression failed: a signed-in user made a reservation directly';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$reserve$;
RESET ROLE;
SELECT pg_temp.z46_assert(:'seen' = '0' AND pg_temp.z46_turn('26101346-7000-4000-8000-000000007001') = 'counted/-'
                          AND pg_temp.z46_waiting('26101346-0000-4000-8000-00000000000a', :'today'::date) = 8,
                          'a signed-in user read or changed the reservation table directly');
ROLLBACK TO SAVEPOINT z46_reservations_open;
SELECT pg_temp.z46_assert(:'r' = 'null,null,null,null,null,null,null,null,null,null,null,null,null',
                          'a turn was given back on a row that is not evidence (client rows, green, other purpose, old, legacy, no turn, a turn nobody counted, another user''s turn, another user''s row, unknown id, no id): ' || :'r');
SELECT pg_temp.z46_assert(pg_temp.z46_count('26101346-0000-4000-8000-00000000000a', :'today'::date) = 3
                          AND pg_temp.z46_waiting('26101346-0000-4000-8000-00000000000a', :'today'::date) = 8
                          AND pg_temp.z46_count('26101346-0000-4000-8000-00000000000b', :'today'::date) = 1
                          AND pg_temp.z46_waiting('26101346-0000-4000-8000-00000000000b', :'today'::date) = 4,
                          'a count or a waiting turn moved without evidence');
SELECT pg_temp.z46_assert((SELECT count(*) = 0 FROM public.chat_turn_refunds), 'an audit row was marked used without a refund');

-- The table itself refuses the mark from a signed-in request, whatever function does the writing.
-- Four throw-away functions a signed-in user may call: one hides the write behind a function it
-- cannot call itself, one builds its statement at run time, one uses MERGE, one turns the client's
-- own row into a server row. None of them is in the list above, and none may succeed.
CREATE FUNCTION public.z46_inner_writer(p_user uuid, p_tag text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $f$
  INSERT INTO public.ai_audit_log (user_id, prompt_hash, output_hash, model_used, vertex_backend, safety_zone, latency_ms, purpose, event_source)
  VALUES (p_user, '0a0b0c0d', '0e0f0a0b', p_tag, false, 'red', 10, 'secondb_chat', 'server_verified')
$f$;
REVOKE ALL ON FUNCTION public.z46_inner_writer(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
CREATE FUNCTION public.z46_wrapper() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $f$
BEGIN
  PERFORM public.z46_inner_writer(auth.uid(), 'z46-wrapper');
END
$f$;
CREATE FUNCTION public.z46_dynamic() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $f$
BEGIN
  EXECUTE 'INS' || 'ERT INTO public.ai_' || 'audit_log (user_id, prompt_hash, output_hash, model_used, vertex_backend, safety_zone, latency_ms, purpose, event_source) '
       || 'VALUES ($1, ''0a0b0c0d'', ''0e0f0a0b'', ''z46-dynamic'', false, ''red'', 10, ''secondb_chat'', ''server_'' || ''verified'')'
    USING auth.uid();
END
$f$;
CREATE FUNCTION public.z46_merge() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $f$
BEGIN
  MERGE INTO public.ai_audit_log AS t
  USING (SELECT auth.uid() AS user_id) AS s ON false
  WHEN NOT MATCHED THEN
    INSERT (user_id, prompt_hash, output_hash, model_used, vertex_backend, safety_zone, latency_ms, purpose, event_source)
    VALUES (s.user_id, '0a0b0c0d', '0e0f0a0b', 'z46-merge', false, 'red', 10, 'secondb_chat', 'server_verified');
END
$f$;
CREATE FUNCTION public.z46_promote() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $f$
  UPDATE public.ai_audit_log SET event_source = 'server_verified'
   WHERE user_id = auth.uid() AND model_used = 'gpt-test+swap:v1'
$f$;
-- Not a forgery: another column of a row changes. The guard must leave this alone.
CREATE FUNCTION public.z46_touch() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $f$
  UPDATE public.ai_audit_log SET latency_ms = 11
   WHERE user_id = auth.uid() AND model_used = 'gpt-test+swap:v1'
$f$;
-- A signed-in request reaching a row a proxy wrote: each evidence column in turn, and one column
-- that is not evidence.
CREATE FUNCTION public.z46_retarget(p_what text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $f$
BEGIN
  IF p_what = 'user' THEN
    UPDATE public.ai_audit_log SET user_id = '26101346-0000-4000-8000-00000000000b' WHERE id = '26101346-4000-4000-8000-000000000021';
  ELSIF p_what = 'purpose' THEN
    UPDATE public.ai_audit_log SET purpose = 'ops_recommend' WHERE id = '26101346-4000-4000-8000-000000000021';
  ELSIF p_what = 'zone' THEN
    UPDATE public.ai_audit_log SET safety_zone = 'green' WHERE id = '26101346-4000-4000-8000-000000000021';
  ELSIF p_what = 'time' THEN
    UPDATE public.ai_audit_log SET created_at = pg_catalog.now() WHERE id = '26101346-4000-4000-8000-000000000021';
  ELSIF p_what = 'latency' THEN
    UPDATE public.ai_audit_log SET latency_ms = 12 WHERE id = '26101346-4000-4000-8000-000000000021';
  ELSIF p_what = 'owner_gone' THEN
    UPDATE public.ai_audit_log SET user_id = NULL WHERE id = '26101346-4000-4000-8000-000000000021';
  ELSIF p_what = 'owner_gone_and_green' THEN
    UPDATE public.ai_audit_log SET user_id = NULL, safety_zone = 'green' WHERE id = '26101346-4000-4000-8000-000000000022';
  ELSIF p_what = 'account_deleted' THEN
    -- What deleting an account does to its audit rows: the foreign key clears user_id (0011).
    DELETE FROM public.users WHERE id = '26101346-0000-4000-8000-00000000000c';
  ELSE
    RAISE EXCEPTION 'z46_retarget: unknown case %', p_what;
  END IF;
END
$f$;
REVOKE ALL ON FUNCTION public.z46_wrapper(), public.z46_dynamic(), public.z46_merge(), public.z46_promote(), public.z46_touch(), public.z46_retarget(text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.z46_wrapper(), public.z46_dynamic(), public.z46_merge(), public.z46_promote(), public.z46_touch(), public.z46_retarget(text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.z46_inner_writer(uuid, text) TO service_role;

-- A trigger that runs before the write and turns the row into a server row while another column is
-- being changed. The first guard is not asked (the statement does not name event_source); the
-- guard on the stored row must refuse it.
CREATE FUNCTION public.z46_flip() RETURNS trigger
LANGUAGE plpgsql AS $f$
BEGIN
  NEW.event_source := 'server_verified';
  RETURN NEW;
END
$f$;
CREATE TRIGGER z46_flip BEFORE UPDATE OF latency_ms ON public.ai_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.z46_flip();
SET LOCAL ROLE authenticated;
DO $flip$
BEGIN
  BEGIN
    PERFORM public.z46_touch();
    RAISE EXCEPTION 'z46 regression failed: a trigger promoted a client row during a signed-in request and the stored row was accepted';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$flip$;
RESET ROLE;
DROP TRIGGER z46_flip ON public.ai_audit_log;
DROP FUNCTION public.z46_flip();
SELECT pg_temp.z46_assert((SELECT event_source = 'client_unverified' AND latency_ms = 10 FROM public.ai_audit_log
                            WHERE user_id = '26101346-0000-4000-8000-00000000000a' AND model_used = 'gpt-test+swap:v1'),
                          'the refused promotion left a changed row behind');

SET LOCAL ROLE authenticated;
DO $guard$
DECLARE
  v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY['z46_wrapper', 'z46_dynamic', 'z46_merge', 'z46_promote'] LOOP
    BEGIN
      EXECUTE 'SELECT public.' || v_fn || '()';
      RAISE EXCEPTION 'z46 regression failed: % wrote a server_verified audit row for a signed-in user', v_fn;
    EXCEPTION WHEN insufficient_privilege THEN
      NULL;
    END;
  END LOOP;
  PERFORM public.z46_touch();
END
$guard$;
RESET ROLE;
-- The same request seen only through its JWT: no API role is set, the claim says signed-in.
SET LOCAL request.jwt.claims = '{"role":"authenticated"}';
DO $claims$
BEGIN
  BEGIN
    PERFORM public.z46_inner_writer('26101346-0000-4000-8000-00000000000a', 'z46-claims');
    RAISE EXCEPTION 'z46 regression failed: a request whose JWT says signed-in wrote a server_verified row';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$claims$;
-- The three places are read one by one: one that says signed-in refuses, whatever the others say.
SET LOCAL request.jwt.claim.role = 'service_role';
DO $mixed$
BEGIN
  BEGIN
    PERFORM public.z46_inner_writer('26101346-0000-4000-8000-00000000000a', 'z46-mixed-claims');
    RAISE EXCEPTION 'z46 regression failed: a service_role claim in one place hid a signed-in claim in the other';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$mixed$;
SET LOCAL request.jwt.claim.role = 'anon';
SET LOCAL request.jwt.claims = '{"role":"service_role"}';
DO $mixed2$
BEGIN
  BEGIN
    PERFORM public.z46_inner_writer('26101346-0000-4000-8000-00000000000a', 'z46-mixed-claim');
    RAISE EXCEPTION 'z46 regression failed: a service_role role in the claims hid an anon claim in the other place';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$mixed2$;
SET LOCAL request.jwt.claim.role = '';
-- Claims that are not JSON carry no role. A signed-in request is still refused on its role setting.
SET LOCAL request.jwt.claims = 'not-json';
SET LOCAL ROLE authenticated;
DO $notjson$
BEGIN
  BEGIN
    PERFORM public.z46_wrapper();
    RAISE EXCEPTION 'z46 regression failed: a signed-in request with unreadable claims wrote a server_verified row';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$notjson$;
RESET ROLE;
SELECT pg_temp.z46_assert((SELECT count(*) = 0 FROM public.ai_audit_log
                            WHERE event_source = 'server_verified'
                              AND (model_used LIKE 'z46-%' OR model_used = 'gpt-test+swap:v1')),
                          'a signed-in request left a server_verified audit row behind');
SELECT pg_temp.z46_assert((SELECT latency_ms = 11 AND event_source = 'client_unverified' FROM public.ai_audit_log
                            WHERE user_id = '26101346-0000-4000-8000-00000000000a' AND model_used = 'gpt-test+swap:v1'),
                          'the guard stopped a change that does not touch the mark');
-- The server's own writes are not touched: as service_role, with claims that are not JSON (the old
-- guard failed such a write with 22P02), and with no API role at all.
SET LOCAL request.jwt.claims = '{"role":"service_role"}';
SET LOCAL ROLE service_role;
SELECT public.z46_inner_writer('26101346-0000-4000-8000-00000000000a', 'z46-as-service');
RESET ROLE;
SET LOCAL request.jwt.claims = 'not-json';
SET LOCAL ROLE service_role;
SELECT public.z46_inner_writer('26101346-0000-4000-8000-00000000000a', 'z46-as-service-notjson');
RESET ROLE;
SELECT public.z46_inner_writer('26101346-0000-4000-8000-00000000000a', 'z46-as-owner-notjson');
SET LOCAL request.jwt.claims = '';
SELECT public.z46_inner_writer('26101346-0000-4000-8000-00000000000a', 'z46-as-owner');
SELECT pg_temp.z46_assert((SELECT count(*) = 4 FROM public.ai_audit_log
                            WHERE event_source = 'server_verified'
                              AND model_used IN ('z46-as-service', 'z46-as-service-notjson', 'z46-as-owner-notjson', 'z46-as-owner')),
                          'the guard stopped a server write');
-- Those four are real server rows. Take them away so the cases below count what they wrote themselves.
DELETE FROM public.ai_audit_log WHERE model_used LIKE 'z46-as-%';

-- A row a proxy wrote stays what it is under a signed-in request: owner, purpose, zone and time
-- cannot be changed, a column that is not evidence can.
SELECT pg_temp.z46_audit('26101346-4000-4000-8000-000000000021', '26101346-0000-4000-8000-00000000000a', 'server_verified', 'secondb_chat', 'red', interval '30 seconds', NULL);
SET LOCAL ROLE authenticated;
DO $retarget$
DECLARE
  v_case text;
BEGIN
  FOREACH v_case IN ARRAY ARRAY['user', 'purpose', 'zone', 'time'] LOOP
    BEGIN
      PERFORM public.z46_retarget(v_case);
      RAISE EXCEPTION 'z46 regression failed: a signed-in request changed the % of a server_verified row', v_case;
    EXCEPTION WHEN insufficient_privilege THEN
      NULL;
    END;
  END LOOP;
  PERFORM public.z46_retarget('latency');
END
$retarget$;
RESET ROLE;
SELECT pg_temp.z46_assert((SELECT user_id = '26101346-0000-4000-8000-00000000000a' AND purpose = 'secondb_chat'
                                  AND safety_zone = 'red' AND event_source = 'server_verified' AND latency_ms = 12
                                  AND created_at < pg_catalog.now() - interval '20 seconds'
                             FROM public.ai_audit_log WHERE id = '26101346-4000-4000-8000-000000000021'),
                          'an evidence column of a server row changed, or the guard stopped a change that is not evidence');
-- A row may lose its owner under any role, and only that: with another evidence column changed in
-- the same statement it is refused. A row without an owner gives nobody a turn back.
SELECT pg_temp.z46_audit('26101346-4000-4000-8000-000000000022', '26101346-0000-4000-8000-00000000000a', 'server_verified', 'secondb_chat', 'red', interval '5 seconds', '26101346-7000-4000-8000-000000007005');
SET LOCAL ROLE authenticated;
DO $ownerless$
BEGIN
  BEGIN
    PERFORM public.z46_retarget('owner_gone_and_green');
    RAISE EXCEPTION 'z46 regression failed: a signed-in request changed the zone of a server row while clearing its owner';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  PERFORM public.z46_retarget('owner_gone');
END
$ownerless$;
RESET ROLE;
-- The row that answered turn 05 loses its owner through the server, then A asks with it.
UPDATE public.ai_audit_log SET user_id = NULL WHERE id = '26101346-4000-4000-8000-000000000022';
SET LOCAL ROLE authenticated;
SELECT COALESCE(public.refund_chat_turn_after_output_swap('26101346-4000-4000-8000-000000000022')::text, 'null') AS r \gset
RESET ROLE;
SELECT pg_temp.z46_assert((SELECT user_id IS NULL AND safety_zone = 'red' AND event_source = 'server_verified'
                             FROM public.ai_audit_log WHERE id = '26101346-4000-4000-8000-000000000021')
                          AND (SELECT user_id IS NULL AND safety_zone = 'red'
                                 FROM public.ai_audit_log WHERE id = '26101346-4000-4000-8000-000000000022'),
                          'a server row could not lose its owner, or lost it together with another evidence column');
SELECT pg_temp.z46_assert(:'r' = 'null' AND pg_temp.z46_waiting('26101346-0000-4000-8000-00000000000a', :'today'::date) = 8,
                          'a row without an owner gave a turn back');
DELETE FROM public.ai_audit_log WHERE id = '26101346-4000-4000-8000-000000000022';
-- The same through the real path: an account with a fresh server row is deleted while the request
-- role is a signed-in one. The foreign key clears the owner and the deletion goes through.
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users (id, email) VALUES ('26101346-0000-4000-8000-00000000000c', 'z46-c@example.com');
SET LOCAL session_replication_role = origin;
INSERT INTO public.users (id, email, birth_date, locale) VALUES
  ('26101346-0000-4000-8000-00000000000c', 'z46-c@example.com', DATE '1990-01-01', 'en');
INSERT INTO public.chat_turn_reservations (turn_id, user_id, counted_day) VALUES
  ('26101346-7000-4000-8000-0000000070c1', '26101346-0000-4000-8000-00000000000c', :'today'::date),
  ('26101346-7000-4000-8000-0000000070c2', '26101346-0000-4000-8000-00000000000c', :'today'::date);
SELECT pg_temp.z46_audit('26101346-4000-4000-8000-0000000000c1', '26101346-0000-4000-8000-00000000000c', 'server_verified', 'secondb_chat', 'red', interval '5 seconds', '26101346-7000-4000-8000-0000000070c1');
SELECT pg_temp.z46_assert(pg_temp.z46_turn('26101346-7000-4000-8000-0000000070c1') = 'answered/26101346-4000-4000-8000-0000000000c1',
                          'the account that is about to be deleted has no answered reservation, so the next case would prove less');
SET LOCAL ROLE authenticated;
SELECT public.z46_retarget('account_deleted');
RESET ROLE;
SELECT pg_temp.z46_assert((SELECT count(*) = 0 FROM public.chat_turn_reservations WHERE user_id = '26101346-0000-4000-8000-00000000000c')
                          AND pg_temp.z46_turn('26101346-7000-4000-8000-0000000070c1') IS NULL,
                          'a deleted account left reservations behind');
SELECT pg_temp.z46_assert(NOT EXISTS (SELECT 1 FROM public.users WHERE id = '26101346-0000-4000-8000-00000000000c')
                          AND (SELECT user_id IS NULL AND event_source = 'server_verified' AND safety_zone = 'red'
                                 FROM public.ai_audit_log WHERE id = '26101346-4000-4000-8000-0000000000c1'),
                          'deleting an account under a signed-in request role did not go through, or its audit row did not stay without an owner');
DELETE FROM public.ai_audit_log WHERE id = '26101346-4000-4000-8000-0000000000c1';
-- The server itself may still correct such a row.
UPDATE public.ai_audit_log SET purpose = 'ops_recommend' WHERE id = '26101346-4000-4000-8000-000000000021';
SELECT pg_temp.z46_assert((SELECT purpose = 'ops_recommend' FROM public.ai_audit_log WHERE id = '26101346-4000-4000-8000-000000000021'),
                          'the guard stopped a server-side correction');
DELETE FROM public.ai_audit_log WHERE id = '26101346-4000-4000-8000-000000000021';
SELECT pg_temp.z46_assert(pg_temp.z46_count('26101346-0000-4000-8000-00000000000a', :'today'::date) = 3
                          AND (SELECT count(*) = 0 FROM public.chat_turn_refunds),
                          'a count or the ledger moved during the forged writes');

-- One turn, one answer. Turn 01 is answered by a green call. A second call that names the same turn is
-- audited like any other, but the server binds nothing to a turn that already has its answer, so one
-- counted turn cannot be answered by two calls and given back on the second.
SELECT pg_temp.z46_audit('26101346-4000-4000-8000-000000000011', '26101346-0000-4000-8000-00000000000a', 'server_verified', 'secondb_chat', 'green', interval '8 seconds', '26101346-7000-4000-8000-000000007001');
SELECT pg_temp.z46_audit('26101346-4000-4000-8000-000000000010', '26101346-0000-4000-8000-00000000000a', 'server_verified', 'secondb_chat', 'red', interval '5 seconds', '26101346-7000-4000-8000-000000007001');
SELECT pg_temp.z46_assert(pg_temp.z46_turn('26101346-7000-4000-8000-000000007001') = 'answered/26101346-4000-4000-8000-000000000011',
                          'a second call took a turn that already had its answer');
SET LOCAL ROLE authenticated;
SELECT COALESCE(public.refund_chat_turn_after_output_swap('26101346-4000-4000-8000-000000000010')::text, 'null') AS r \gset
SELECT COALESCE(public.refund_chat_turn_after_output_swap('26101346-4000-4000-8000-000000000011')::text, 'null') AS r2 \gset
RESET ROLE;
SELECT pg_temp.z46_assert(:'r' = 'null' AND :'r2' = 'null' AND pg_temp.z46_count('26101346-0000-4000-8000-00000000000a', :'today'::date) = 3,
                          'a turn answered by a green call was given back through a second call');

-- A fresh red proxy row for turn 02: asking with that row gives exactly one turn back, on the day
-- that turn was counted on.
SELECT pg_temp.z46_audit('26101346-4000-4000-8000-000000000012', '26101346-0000-4000-8000-00000000000a', 'server_verified', 'secondb_chat', 'red', interval '5 seconds', '26101346-7000-4000-8000-000000007002');
SET LOCAL ROLE authenticated;
SELECT COALESCE(public.refund_chat_turn_after_output_swap('26101346-4000-4000-8000-000000000012')::text, 'null') AS r \gset
RESET ROLE;
SELECT pg_temp.z46_assert(:'r' = '2', 'the first refund did not return the new count 2');
SELECT pg_temp.z46_assert(pg_temp.z46_count('26101346-0000-4000-8000-00000000000a', :'today'::date) = 2
                          AND pg_temp.z46_waiting('26101346-0000-4000-8000-00000000000a', :'today'::date) = 7,
                          'the count is not 2, or the turn still waits, after one refund');
SELECT pg_temp.z46_assert(pg_temp.z46_used('26101346-4000-4000-8000-000000000012') = :'today'::date
                          AND (SELECT count(*) = 1 FROM public.chat_turn_refunds), 'the used audit row was not recorded once, for today');
SELECT pg_temp.z46_assert((SELECT ad_bonus = 2 FROM public.chat_usage
                            WHERE user_id = '26101346-0000-4000-8000-00000000000a' AND day = :'today'::date), 'ad_bonus changed');

-- The same row is not used twice.
SET LOCAL ROLE authenticated;
SELECT COALESCE(public.refund_chat_turn_after_output_swap('26101346-4000-4000-8000-000000000012')::text, 'null') AS r \gset
RESET ROLE;
SELECT pg_temp.z46_assert(:'r' = 'null' AND pg_temp.z46_count('26101346-0000-4000-8000-00000000000a', :'today'::date) = 2
                          AND pg_temp.z46_count('26101346-0000-4000-8000-00000000000a', :'today'::date - 1) = 2,
                          'one audit row gave back a second turn');

-- The day is the server's record, not the clock's and not the caller's. Turn 11 was counted
-- yesterday; its answer was written just now. The turn comes back on yesterday's row and today's
-- count does not move, whatever time it is while this runs.
SELECT pg_temp.z46_audit('26101346-4000-4000-8000-000000000013', '26101346-0000-4000-8000-00000000000a', 'server_verified', 'secondb_chat', 'red', interval '5 seconds', '26101346-7000-4000-8000-000000007011');
SET LOCAL ROLE authenticated;
SELECT COALESCE(public.refund_chat_turn_after_output_swap('26101346-4000-4000-8000-000000000013')::text, 'null') AS r \gset
RESET ROLE;
SELECT pg_temp.z46_assert(:'r' = '1', 'the turn counted yesterday did not come back as yesterday''s new count 1');
SELECT pg_temp.z46_assert(pg_temp.z46_count('26101346-0000-4000-8000-00000000000a', :'today'::date - 1) = 1
                          AND pg_temp.z46_waiting('26101346-0000-4000-8000-00000000000a', :'today'::date - 1) = 0
                          AND pg_temp.z46_count('26101346-0000-4000-8000-00000000000a', :'today'::date) = 2
                          AND pg_temp.z46_count('26101346-0000-4000-8000-00000000000a', :'today'::date - 2) = 4,
                          'the turn counted yesterday lowered another day, or did not lower yesterday');
SELECT pg_temp.z46_assert(pg_temp.z46_used('26101346-4000-4000-8000-000000000013') = :'today'::date - 1,
                          'the ledger did not record the day the turn was counted on');

-- A day with reservations waiting and a count of zero: nothing comes back and the evidence stays unused.
UPDATE public.chat_usage SET count = 0
 WHERE user_id = '26101346-0000-4000-8000-00000000000a' AND day = :'today'::date;
SELECT pg_temp.z46_audit('26101346-4000-4000-8000-000000000014', '26101346-0000-4000-8000-00000000000a', 'server_verified', 'secondb_chat', 'red', interval '2 seconds', '26101346-7000-4000-8000-000000007003');
SELECT pg_temp.z46_audit('26101346-4000-4000-8000-000000000015', '26101346-0000-4000-8000-00000000000a', 'server_verified', 'secondb_chat', 'red', interval '1 second', '26101346-7000-4000-8000-000000007004');
SET LOCAL ROLE authenticated;
SELECT COALESCE(public.refund_chat_turn_after_output_swap('26101346-4000-4000-8000-000000000014')::text, 'null') AS r \gset
RESET ROLE;
SELECT pg_temp.z46_assert(:'r' = 'null', 'a turn was given back from a day whose count is already 0');
SELECT pg_temp.z46_assert((SELECT count(*) = 2 FROM public.chat_turn_refunds)
                          AND pg_temp.z46_used('26101346-4000-4000-8000-000000000014') IS NULL
                          AND pg_temp.z46_waiting('26101346-0000-4000-8000-00000000000a', :'today'::date) = 7,
                          'an audit row was marked used, or a reservation was closed, although no turn came back');
-- ... and that evidence still works once the day has a turn again.
UPDATE public.chat_usage SET count = 1
 WHERE user_id = '26101346-0000-4000-8000-00000000000a' AND day = :'today'::date;
SET LOCAL ROLE authenticated;
SELECT COALESCE(public.refund_chat_turn_after_output_swap('26101346-4000-4000-8000-000000000014')::text, 'null') AS r \gset
RESET ROLE;
SELECT pg_temp.z46_assert(:'r' = '0' AND (SELECT count(*) = 3 FROM public.chat_turn_refunds), 'the evidence left unused did not work once there was a turn');
-- The row nobody asked with stays unused, however many calls were made around it.
SELECT pg_temp.z46_assert(pg_temp.z46_used('26101346-4000-4000-8000-000000000015') IS NULL
                          AND pg_temp.z46_waiting('26101346-0000-4000-8000-00000000000a', :'today'::date) = 6,
                          'a row was used, or its reservation was closed, although no call named it');

-- A's calls never touched B, and B's own evidence works for B only.
SELECT pg_temp.z46_assert(pg_temp.z46_count('26101346-0000-4000-8000-00000000000b', :'today'::date) = 1
                          AND pg_temp.z46_waiting('26101346-0000-4000-8000-00000000000b', :'today'::date) = 4
                          AND pg_temp.z46_used('26101346-4000-4000-8000-0000000000b1') IS NULL, 'another user''s count, turns or evidence moved');
SET LOCAL request.jwt.claim.sub = '26101346-0000-4000-8000-00000000000b';
SET LOCAL ROLE authenticated;
SELECT COALESCE(public.refund_chat_turn_after_output_swap('26101346-4000-4000-8000-000000000015')::text, 'null') AS r0 \gset
SELECT COALESCE(public.refund_chat_turn_after_output_swap('26101346-4000-4000-8000-0000000000b1')::text, 'null') AS r \gset
SELECT COALESCE(public.refund_chat_turn_after_output_swap('26101346-4000-4000-8000-0000000000b1')::text, 'null') AS r2 \gset
RESET ROLE;
SELECT pg_temp.z46_assert(:'r0' = 'null' AND pg_temp.z46_used('26101346-4000-4000-8000-000000000015') IS NULL, 'B got a turn back on A''s row');
SELECT pg_temp.z46_assert(:'r' = '0' AND :'r2' = 'null' AND pg_temp.z46_waiting('26101346-0000-4000-8000-00000000000b', :'today'::date) = 3,
                          'B did not get exactly one turn back from B''s own row');

-- The claim itself, asked as a proxy asks it (service_role). User E has three turns counted today.
-- Reservations: e1 and e4 made just now, e2 made six minutes ago, e3 already answered.
-- Audit rows of E, all written by a proxy for chat unless said otherwise: ea1 and ea2 red and fresh,
-- ec1 written by the client, ep1 for another purpose, eo1 two minutes old, eg1 green and fresh.
INSERT INTO public.chat_turn_reservations (turn_id, user_id, counted_day, issued_at, state, audit_id, answered_at) VALUES
  ('26101346-7000-4000-8000-0000000070e1', '26101346-0000-4000-8000-00000000000e', :'today'::date, pg_catalog.now(), 'counted', NULL, NULL),
  ('26101346-7000-4000-8000-0000000070e2', '26101346-0000-4000-8000-00000000000e', :'today'::date, pg_catalog.now() - interval '6 minutes', 'counted', NULL, NULL),
  ('26101346-7000-4000-8000-0000000070e3', '26101346-0000-4000-8000-00000000000e', :'today'::date, pg_catalog.now(), 'answered', '26101346-4000-4000-8000-0000000000e9', pg_catalog.now()),
  ('26101346-7000-4000-8000-0000000070e4', '26101346-0000-4000-8000-00000000000e', :'today'::date, pg_catalog.now(), 'counted', NULL, NULL),
  ('26101346-7000-4000-8000-0000000070e5', '26101346-0000-4000-8000-00000000000e', :'today'::date, pg_catalog.now(), 'counted', NULL, NULL);
SELECT pg_temp.z46_audit('26101346-4000-4000-8000-0000000000e1', '26101346-0000-4000-8000-00000000000e', 'server_verified', 'secondb_chat', 'red', interval '2 seconds', NULL);
SELECT pg_temp.z46_audit('26101346-4000-4000-8000-0000000000e2', '26101346-0000-4000-8000-00000000000e', 'server_verified', 'secondb_chat', 'red', interval '2 seconds', NULL);
SELECT pg_temp.z46_audit('26101346-4000-4000-8000-0000000000ec', '26101346-0000-4000-8000-00000000000e', 'client_unverified', 'secondb_chat', 'red', interval '2 seconds', NULL);
SELECT pg_temp.z46_audit('26101346-4000-4000-8000-0000000000ea', '26101346-0000-4000-8000-00000000000e', 'server_verified', 'ops_recommend', 'red', interval '2 seconds', NULL);
SELECT pg_temp.z46_audit('26101346-4000-4000-8000-0000000000e0', '26101346-0000-4000-8000-00000000000e', 'server_verified', 'secondb_chat', 'red', interval '2 minutes', NULL);
SELECT pg_temp.z46_audit('26101346-4000-4000-8000-0000000000e6', '26101346-0000-4000-8000-00000000000e', 'server_verified', 'secondb_chat', 'green', interval '2 seconds', NULL);
-- A signed-in user cannot ask the question at all, for a turn and a row that would otherwise bind.
SET LOCAL request.jwt.claim.sub = '26101346-0000-4000-8000-00000000000e';
SET LOCAL ROLE authenticated;
DO $claim_denied$
BEGIN
  BEGIN
    PERFORM public.claim_chat_turn_for_audit('26101346-0000-4000-8000-00000000000e', '26101346-4000-4000-8000-0000000000e1', '26101346-7000-4000-8000-0000000070e1');
    RAISE EXCEPTION 'z46 regression failed: a signed-in user bound an answer to a turn';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$claim_denied$;
RESET ROLE;
SET LOCAL ROLE service_role;
-- Everything that must bind nothing, asked one by one: a reservation that is old, one that is answered,
-- another user's, one that does not exist; a row the client wrote, a row for another purpose, a row that
-- is old, another user's row, a row that does not exist; a user who owns neither; and nothing at all.
SELECT concat_ws(',',
         public.claim_chat_turn_for_audit('26101346-0000-4000-8000-00000000000e', '26101346-4000-4000-8000-0000000000e1', '26101346-7000-4000-8000-0000000070e2')::text,
         public.claim_chat_turn_for_audit('26101346-0000-4000-8000-00000000000e', '26101346-4000-4000-8000-0000000000e1', '26101346-7000-4000-8000-0000000070e3')::text,
         public.claim_chat_turn_for_audit('26101346-0000-4000-8000-00000000000e', '26101346-4000-4000-8000-0000000000e1', '26101346-7000-4000-8000-0000000070b4')::text,
         public.claim_chat_turn_for_audit('26101346-0000-4000-8000-00000000000e', '26101346-4000-4000-8000-0000000000e1', '26101346-7000-4000-8000-0000000070ff')::text,
         public.claim_chat_turn_for_audit('26101346-0000-4000-8000-00000000000e', '26101346-4000-4000-8000-0000000000ec', '26101346-7000-4000-8000-0000000070e1')::text,
         public.claim_chat_turn_for_audit('26101346-0000-4000-8000-00000000000e', '26101346-4000-4000-8000-0000000000ea', '26101346-7000-4000-8000-0000000070e1')::text,
         public.claim_chat_turn_for_audit('26101346-0000-4000-8000-00000000000e', '26101346-4000-4000-8000-0000000000e0', '26101346-7000-4000-8000-0000000070e1')::text,
         public.claim_chat_turn_for_audit('26101346-0000-4000-8000-00000000000e', '26101346-4000-4000-8000-0000000000b1', '26101346-7000-4000-8000-0000000070e1')::text,
         public.claim_chat_turn_for_audit('26101346-0000-4000-8000-00000000000e', '26101346-4000-4000-8000-0000000000ff', '26101346-7000-4000-8000-0000000070e1')::text,
         public.claim_chat_turn_for_audit('26101346-0000-4000-8000-00000000000b', '26101346-4000-4000-8000-0000000000e1', '26101346-7000-4000-8000-0000000070e1')::text,
         public.claim_chat_turn_for_audit('26101346-0000-4000-8000-00000000000b', '26101346-4000-4000-8000-0000000000e1', '26101346-7000-4000-8000-0000000070b4')::text,
         public.claim_chat_turn_for_audit('26101346-0000-4000-8000-00000000000e', '26101346-4000-4000-8000-0000000000b1', '26101346-7000-4000-8000-0000000070b4')::text,
         COALESCE(public.claim_chat_turn_for_audit(NULL, '26101346-4000-4000-8000-0000000000e1', '26101346-7000-4000-8000-0000000070e1')::text, 'null'),
         COALESCE(public.claim_chat_turn_for_audit('26101346-0000-4000-8000-00000000000e', NULL, '26101346-7000-4000-8000-0000000070e1')::text, 'null'),
         COALESCE(public.claim_chat_turn_for_audit('26101346-0000-4000-8000-00000000000e', '26101346-4000-4000-8000-0000000000e1', NULL)::text, 'null')) AS no \gset
RESET ROLE;
SELECT pg_temp.z46_assert(:'no' = 'false,false,false,false,false,false,false,false,false,false,false,false,false,false,false',
                          'the claim bound an answer it must not (old, answered, another user''s or unknown reservation; client, other-purpose, old, another user''s or unknown row; a user who owns neither; missing arguments): ' || :'no');
SELECT pg_temp.z46_assert(pg_temp.z46_turn('26101346-7000-4000-8000-0000000070e1') = 'counted/-'
                          AND pg_temp.z46_turn('26101346-7000-4000-8000-0000000070e2') = 'counted/-'
                          AND pg_temp.z46_turn('26101346-7000-4000-8000-0000000070e3') = 'answered/26101346-4000-4000-8000-0000000000e9'
                          AND pg_temp.z46_turn('26101346-7000-4000-8000-0000000070b4') = 'counted/-',
                          'a refused claim changed a reservation');
-- B's turn that E just asked for is still B's to bind: a refused attempt by someone else blocks nothing.
SAVEPOINT z46_owner_after_attempt;
SELECT pg_temp.z46_audit('26101346-4000-4000-8000-0000000000b4', '26101346-0000-4000-8000-00000000000b', 'server_verified', 'secondb_chat', 'red', interval '1 second', NULL);
SET LOCAL ROLE service_role;
SELECT public.claim_chat_turn_for_audit('26101346-0000-4000-8000-00000000000b', '26101346-4000-4000-8000-0000000000b4', '26101346-7000-4000-8000-0000000070b4')::text AS own \gset
RESET ROLE;
SELECT pg_temp.z46_assert(:'own' = 'true'
                          AND pg_temp.z46_turn('26101346-7000-4000-8000-0000000070b4') = 'answered/26101346-4000-4000-8000-0000000000b4',
                          'the owner could not bind a turn after another user had asked for it');
ROLLBACK TO SAVEPOINT z46_owner_after_attempt;
-- The one that binds: E's fresh reservation and E's fresh chat row. Then nothing else can take either.
SET LOCAL ROLE service_role;
SELECT concat_ws(',',
         public.claim_chat_turn_for_audit('26101346-0000-4000-8000-00000000000e', '26101346-4000-4000-8000-0000000000e1', '26101346-7000-4000-8000-0000000070e1')::text,
         public.claim_chat_turn_for_audit('26101346-0000-4000-8000-00000000000e', '26101346-4000-4000-8000-0000000000e1', '26101346-7000-4000-8000-0000000070e1')::text,
         public.claim_chat_turn_for_audit('26101346-0000-4000-8000-00000000000e', '26101346-4000-4000-8000-0000000000e2', '26101346-7000-4000-8000-0000000070e1')::text,
         public.claim_chat_turn_for_audit('26101346-0000-4000-8000-00000000000e', '26101346-4000-4000-8000-0000000000e1', '26101346-7000-4000-8000-0000000070e4')::text,
         public.claim_chat_turn_for_audit('26101346-0000-4000-8000-00000000000e', '26101346-4000-4000-8000-0000000000e2', '26101346-7000-4000-8000-0000000070e4')::text,
         public.claim_chat_turn_for_audit('26101346-0000-4000-8000-00000000000e', '26101346-4000-4000-8000-0000000000e6', '26101346-7000-4000-8000-0000000070e5')::text) AS yes \gset
RESET ROLE;
SELECT pg_temp.z46_assert(:'yes' = 'true,false,false,false,true,true',
                          'the claim did not bind exactly once per reservation and once per audit row: ' || :'yes');
SELECT pg_temp.z46_assert(pg_temp.z46_turn('26101346-7000-4000-8000-0000000070e1') = 'answered/26101346-4000-4000-8000-0000000000e1'
                          AND pg_temp.z46_turn('26101346-7000-4000-8000-0000000070e4') = 'answered/26101346-4000-4000-8000-0000000000e2'
                          AND pg_temp.z46_turn('26101346-7000-4000-8000-0000000070e5') = 'answered/26101346-4000-4000-8000-0000000000e6'
                          AND (SELECT bool_and(answered_at IS NOT NULL AND refunded_at IS NULL) FROM public.chat_turn_reservations
                                WHERE turn_id IN ('26101346-7000-4000-8000-0000000070e1', '26101346-7000-4000-8000-0000000070e4', '26101346-7000-4000-8000-0000000070e5')),
                          'a bound reservation does not carry its audit row and the time it was answered');
-- E asks for the two red answers and the green one; B asks with E's row. Each red answer gives one turn back.
SET LOCAL request.jwt.claim.sub = '26101346-0000-4000-8000-00000000000b';
SET LOCAL ROLE authenticated;
SELECT COALESCE(public.refund_chat_turn_after_output_swap('26101346-4000-4000-8000-0000000000e1')::text, 'null') AS rb \gset
RESET ROLE;
SET LOCAL request.jwt.claim.sub = '26101346-0000-4000-8000-00000000000e';
SET LOCAL ROLE authenticated;
SELECT concat_ws(',',
         COALESCE(public.refund_chat_turn_after_output_swap('26101346-4000-4000-8000-0000000000e6')::text, 'null'),
         COALESCE(public.refund_chat_turn_after_output_swap('26101346-4000-4000-8000-0000000000e1')::text, 'null'),
         COALESCE(public.refund_chat_turn_after_output_swap('26101346-4000-4000-8000-0000000000e1')::text, 'null'),
         COALESCE(public.refund_chat_turn_after_output_swap('26101346-4000-4000-8000-0000000000e2')::text, 'null')) AS re \gset
RESET ROLE;
SELECT pg_temp.z46_assert(:'rb' = 'null' AND :'re' = 'null,2,null,1'
                          AND pg_temp.z46_count('26101346-0000-4000-8000-00000000000e', :'today'::date) = 1
                          AND pg_temp.z46_count('26101346-0000-4000-8000-00000000000b', :'today'::date) = 0,
                          'the bound answers did not give back exactly one turn each, to their owner only: ' || :'rb' || ' / ' || :'re');
SELECT pg_temp.z46_assert(pg_temp.z46_turn('26101346-7000-4000-8000-0000000070e1') = 'refunded/26101346-4000-4000-8000-0000000000e1'
                          AND pg_temp.z46_turn('26101346-7000-4000-8000-0000000070e4') = 'refunded/26101346-4000-4000-8000-0000000000e2'
                          AND pg_temp.z46_turn('26101346-7000-4000-8000-0000000070e5') = 'answered/26101346-4000-4000-8000-0000000000e6'
                          AND (SELECT bool_and(refunded_at IS NOT NULL) FROM public.chat_turn_reservations
                                WHERE turn_id IN ('26101346-7000-4000-8000-0000000070e1', '26101346-7000-4000-8000-0000000070e4'))
                          AND pg_temp.z46_used('26101346-4000-4000-8000-0000000000e1') = :'today'::date
                          AND pg_temp.z46_used('26101346-4000-4000-8000-0000000000e6') IS NULL,
                          'a refund did not close its reservation, or a green answer was marked used');
-- A refunded reservation takes no new answer.
SELECT pg_temp.z46_audit('26101346-4000-4000-8000-0000000000e7', '26101346-0000-4000-8000-00000000000e', 'server_verified', 'secondb_chat', 'red', interval '1 second', '26101346-7000-4000-8000-0000000070e1');
SELECT pg_temp.z46_assert(pg_temp.z46_turn('26101346-7000-4000-8000-0000000070e1') = 'refunded/26101346-4000-4000-8000-0000000000e1',
                          'a refunded reservation was answered again');
-- The refund does not rely on the claim alone: a reservation that is another user's gives the caller nothing,
-- even if it carries the caller's own fresh red row. The claim never makes such a row; it is built here directly.
SAVEPOINT z46_foreign_reservation;
SELECT pg_temp.z46_audit('26101346-4000-4000-8000-0000000000e8', '26101346-0000-4000-8000-00000000000e', 'server_verified', 'secondb_chat', 'red', interval '1 second', NULL);
INSERT INTO public.chat_turn_reservations (turn_id, user_id, counted_day, state, audit_id, answered_at) VALUES
  ('26101346-7000-4000-8000-0000000070b9', '26101346-0000-4000-8000-00000000000b', :'today'::date, 'answered', '26101346-4000-4000-8000-0000000000e8', pg_catalog.now());
SELECT pg_temp.z46_count('26101346-0000-4000-8000-00000000000e', :'today'::date) AS e_before \gset
SET LOCAL request.jwt.claim.sub = '26101346-0000-4000-8000-00000000000e';
SET LOCAL ROLE authenticated;
SELECT COALESCE(public.refund_chat_turn_after_output_swap('26101346-4000-4000-8000-0000000000e8')::text, 'null') AS rf \gset
RESET ROLE;
SELECT pg_temp.z46_assert(:'rf' = 'null' AND :e_before > 0
                          AND pg_temp.z46_count('26101346-0000-4000-8000-00000000000e', :'today'::date) = :e_before
                          AND pg_temp.z46_turn('26101346-7000-4000-8000-0000000070b9') = 'answered/26101346-4000-4000-8000-0000000000e8'
                          AND pg_temp.z46_used('26101346-4000-4000-8000-0000000000e8') IS NULL,
                          'a reservation of another user gave the caller a turn back, or was closed');
ROLLBACK TO SAVEPOINT z46_foreign_reservation;
-- The next bump clears that user's reservations older than two days and nobody else's, and keeps the rest.
INSERT INTO public.chat_turn_reservations (turn_id, user_id, counted_day, issued_at) VALUES
  ('26101346-7000-4000-8000-0000000070e8', '26101346-0000-4000-8000-00000000000e', :'today'::date - 3, pg_catalog.now() - interval '49 hours'),
  ('26101346-7000-4000-8000-0000000070e9', '26101346-0000-4000-8000-00000000000e', :'today'::date - 2, pg_catalog.now() - interval '47 hours'),
  ('26101346-7000-4000-8000-0000000070bf', '26101346-0000-4000-8000-00000000000b', :'today'::date - 3, pg_catalog.now() - interval '49 hours');
SET LOCAL ROLE authenticated;
SELECT public.bump_chat_usage_for_turn('26101346-0000-4000-8000-00000000000e', :'today'::date)::text AS e_new \gset
RESET ROLE;
SELECT pg_temp.z46_assert((:'e_new'::jsonb ->> 'count') = '2'
                          AND pg_temp.z46_turn('26101346-7000-4000-8000-0000000070e8') IS NULL
                          AND pg_temp.z46_turn('26101346-7000-4000-8000-0000000070e9') = 'counted/-'
                          AND pg_temp.z46_turn('26101346-7000-4000-8000-0000000070bf') = 'counted/-'
                          AND pg_temp.z46_turn((:'e_new'::jsonb ->> 'turnId')::uuid) = 'counted/-'
                          AND pg_temp.z46_turn('26101346-7000-4000-8000-0000000070e2') = 'counted/-',
                          'the bump did not remove exactly the caller''s reservations older than two days');
DELETE FROM public.chat_turn_reservations WHERE turn_id = '26101346-7000-4000-8000-0000000070bf';

-- Only the ledger's own primary key means "used already". Another unique rule that the ledger is not
-- supposed to carry must not be read as that: its conflict is an error, not a quiet NULL.
SAVEPOINT z46_other_unique;
UPDATE public.chat_usage SET count = 2
 WHERE user_id = '26101346-0000-4000-8000-00000000000b' AND day = :'today'::date;
SELECT pg_temp.z46_audit('26101346-4000-4000-8000-0000000000b2', '26101346-0000-4000-8000-00000000000b', 'server_verified', 'secondb_chat', 'red', interval '2 seconds', '26101346-7000-4000-8000-0000000070b2');
SELECT pg_temp.z46_audit('26101346-4000-4000-8000-0000000000b3', '26101346-0000-4000-8000-00000000000b', 'server_verified', 'secondb_chat', 'red', interval '1 second', '26101346-7000-4000-8000-0000000070b3');
CREATE UNIQUE INDEX z46_one_of_two ON public.chat_turn_refunds (day)
 WHERE audit_id IN ('26101346-4000-4000-8000-0000000000b2', '26101346-4000-4000-8000-0000000000b3');
SET LOCAL request.jwt.claim.sub = '26101346-0000-4000-8000-00000000000b';
SET LOCAL ROLE authenticated;
SELECT COALESCE(public.refund_chat_turn_after_output_swap('26101346-4000-4000-8000-0000000000b2')::text, 'null') AS r \gset
DO $other$
BEGIN
  BEGIN
    -- The second fresh row is for the same day: it collides on the extra index, not on the primary key.
    PERFORM public.refund_chat_turn_after_output_swap('26101346-4000-4000-8000-0000000000b3');
    RAISE EXCEPTION 'z46 regression failed: a conflict on another unique rule was read as an already used row';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
END
$other$;
RESET ROLE;
SELECT pg_temp.z46_assert(:'r' = '1' AND pg_temp.z46_count('26101346-0000-4000-8000-00000000000b', :'today'::date) = 1
                          AND pg_temp.z46_waiting('26101346-0000-4000-8000-00000000000b', :'today'::date) = 2,
                          'the refund before the foreign conflict did not stand, or the failed one changed the count or the waiting turns');
ROLLBACK TO SAVEPOINT z46_other_unique;

-- The table stays read-only for its owner: no policy lets a signed-in user write chat_usage,
-- so the functions are the only way a count changes.
SELECT pg_temp.z46_assert(NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policy p
                                       WHERE p.polrelid = 'public.chat_usage'::regclass AND p.polcmd <> 'r'),
                          'a policy lets the signed-in role write chat_usage directly');

-- (A ledger whose primary key may be deferred or is not on the audit row alone, and a table of
-- another shape under the reservation table's name, are refused by 0255 when it is applied. Those
-- cases end the apply with an error, so they are run by the workflow's re-apply step, not here.)

-- Rollback round trip, newest first. The 0255 down file brings back the two function bodies of 0252
-- and takes the reservation table away; the 0252 down file then removes the function and keeps the
-- ledger, so evidence used before cannot be used again after both are applied a second time.
\ir ../migrations/rollback/0255_down.sql
SELECT pg_temp.z46_assert(to_regprocedure('public.refund_chat_turn_after_output_swap(date)') IS NOT NULL
                          AND to_regprocedure('public.refund_chat_turn_after_output_swap(uuid)') IS NULL
                          AND to_regprocedure('public.bump_chat_usage_for_turn(uuid, date)') IS NULL
                          AND to_regprocedure('public.guard_ai_audit_server_verified_final()') IS NULL
                          AND (SELECT count(*) = 1 FROM pg_catalog.pg_trigger t
                                WHERE t.tgrelid = 'public.ai_audit_log'::regclass AND NOT t.tgisinternal)
                          AND to_regprocedure('public.claim_chat_turn_for_audit(uuid, uuid, uuid)') IS NULL
                          AND to_regclass('public.chat_turn_reservations') IS NULL
                          AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a
                                           WHERE a.attname IN ('chat_turn_id', 'refundable_turns') AND NOT a.attisdropped
                                             AND a.attrelid IN ('public.ai_audit_log'::regclass, 'public.chat_usage'::regclass)),
                          'the 0255 down file did not leave exactly what 0252 made');
\ir ../migrations/rollback/0252_down.sql
SELECT pg_temp.z46_assert((SELECT count(*) = 0 FROM pg_catalog.pg_proc p WHERE p.proname = 'refund_chat_turn_after_output_swap'),
                          'the down files left a refund function behind');
SELECT pg_temp.z46_assert((SELECT count(*) = 6 FROM public.chat_turn_refunds)
                          AND pg_temp.z46_count('26101346-0000-4000-8000-00000000000a', :'today'::date) = 0,
                          'the down files dropped used-evidence marks or changed a count');
-- Supabase grants new tables to the API roles by default; the scratch database does not.
-- Put those grants in place so that applying 0252 again has something to take away.
GRANT ALL ON TABLE public.chat_turn_refunds TO anon, authenticated, service_role;
\ir ../migrations/0252_chat_turn_refund.sql
\ir ../migrations/0252_chat_turn_refund.sql
\ir ../migrations/0255_chat_turn_refund_bound_to_audit.sql
-- The same for the table 0255 makes: with those grants in place, applying it again must take them away.
GRANT ALL ON TABLE public.chat_turn_reservations TO anon, authenticated, service_role;
\ir ../migrations/0255_chat_turn_refund_bound_to_audit.sql
SELECT pg_temp.z46_assert(NOT has_table_privilege('anon', 'public.chat_turn_refunds', 'SELECT')
                          AND NOT has_table_privilege('authenticated', 'public.chat_turn_refunds', 'INSERT')
                          AND NOT has_table_privilege('service_role', 'public.chat_turn_refunds', 'DELETE'),
                          'applying again left an API role with a privilege on the ledger table');
SELECT pg_temp.z46_assert(NOT has_table_privilege('anon', 'public.chat_turn_reservations', 'SELECT, INSERT, UPDATE, DELETE')
                          AND NOT has_table_privilege('authenticated', 'public.chat_turn_reservations', 'SELECT, INSERT, UPDATE, DELETE')
                          AND NOT has_table_privilege('service_role', 'public.chat_turn_reservations', 'SELECT, INSERT, UPDATE, DELETE'),
                          'applying again left an API role with a privilege on the reservation table');
-- The table came back empty: the reservations that waited before the rollback are gone with it.
SELECT pg_temp.z46_assert((SELECT count(*) = 0 FROM public.chat_turn_reservations),
                          'the reservation table came back with rows after the round trip');
SET LOCAL request.jwt.claim.sub = '26101346-0000-4000-8000-00000000000a';
SET LOCAL ROLE authenticated;
SELECT public.bump_chat_usage_for_turn('26101346-0000-4000-8000-00000000000a', :'today'::date)::text AS a1 \gset
RESET ROLE;
SELECT pg_temp.z46_audit('26101346-4000-4000-8000-000000000016', '26101346-0000-4000-8000-00000000000a', 'server_verified', 'secondb_chat', 'red', interval '1 second',
                         (:'a1'::jsonb ->> 'turnId')::uuid);
SET LOCAL ROLE authenticated;
SELECT COALESCE(public.refund_chat_turn_after_output_swap('26101346-4000-4000-8000-000000000012')::text, 'null') AS r \gset
SELECT COALESCE(public.refund_chat_turn_after_output_swap('26101346-4000-4000-8000-000000000016')::text, 'null') AS r2 \gset
RESET ROLE;
SELECT pg_temp.z46_assert(:'r' = 'null', 'evidence used before the rollback gave a turn back again after applying both a second time');
SELECT pg_temp.z46_assert((:'a1'::jsonb ->> 'count') = '1' AND :'r2' = '0'
                          AND pg_temp.z46_count('26101346-0000-4000-8000-00000000000a', :'today'::date) = 0,
                          'a turn counted and answered after the round trip did not come back');
SELECT pg_temp.z46_assert(has_function_privilege('authenticated', 'public.refund_chat_turn_after_output_swap(uuid)', 'EXECUTE')
                          AND NOT has_function_privilege('anon', 'public.refund_chat_turn_after_output_swap(uuid)', 'EXECUTE')
                          AND to_regprocedure('public.refund_chat_turn_after_output_swap(date)') IS NULL
                          AND has_function_privilege('service_role', 'public.claim_chat_turn_for_audit(uuid, uuid, uuid)', 'EXECUTE')
                          AND NOT has_function_privilege('authenticated', 'public.claim_chat_turn_for_audit(uuid, uuid, uuid)', 'EXECUTE')
                          AND NOT has_table_privilege('authenticated', 'public.chat_turn_refunds', 'SELECT')
                          AND (SELECT count(*) = 2 FROM pg_catalog.pg_trigger t
                                WHERE t.tgrelid = 'public.ai_audit_log'::regclass AND NOT t.tgisinternal),
                          'applying again changed who may call the function, brought the unbound form back, or lost a guard');

ROLLBACK;
