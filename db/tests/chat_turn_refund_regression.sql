\set ON_ERROR_STOP on

-- Run only on the CI scratch database after numbered 0252.
-- Z46: a chat turn whose answer was swapped for the fixed crisis notice is given back,
-- once per proxy-written audit row, and only on that evidence.
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

-- The proxy's row shape (openai-proxy writes event_source 'server_verified' as service_role).
CREATE FUNCTION pg_temp.z46_audit(p_id uuid, p_user uuid, p_source text, p_purpose text, p_zone text, p_age interval) RETURNS void
LANGUAGE sql AS $$
  INSERT INTO public.ai_audit_log
    (id, user_id, prompt_hash, output_hash, model_used, vertex_backend, safety_zone, latency_ms, created_at, purpose, event_source)
  VALUES
    (p_id, p_user, '0a0b0c0d', '0e0f0a0b', 'gpt-test', false, p_zone::public.safety_zone, 10,
     pg_catalog.now() - p_age, p_purpose, p_source)
$$;

SELECT (pg_catalog.now() AT TIME ZONE 'Asia/Seoul')::date AS today \gset

-- The vanilla PostgreSQL auth stub lacks production trigger columns.
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users (id, email) VALUES
  ('26101346-0000-4000-8000-00000000000a', 'z46-a@example.com'),
  ('26101346-0000-4000-8000-00000000000b', 'z46-b@example.com');
SET LOCAL session_replication_role = origin;
INSERT INTO public.users (id, email, birth_date, locale) VALUES
  ('26101346-0000-4000-8000-00000000000a', 'z46-a@example.com', DATE '1990-01-01', 'en'),
  ('26101346-0000-4000-8000-00000000000b', 'z46-b@example.com', DATE '1990-01-01', 'en');

INSERT INTO public.chat_usage (user_id, day, count, ad_bonus) VALUES
  ('26101346-0000-4000-8000-00000000000a', :'today'::date, 3, 2),
  ('26101346-0000-4000-8000-00000000000a', :'today'::date - 1, 2, 0),
  ('26101346-0000-4000-8000-00000000000a', :'today'::date - 2, 4, 0),
  ('26101346-0000-4000-8000-00000000000b', :'today'::date, 1, 0);

-- Only signed-in users may call it, and nobody else holds EXECUTE.
DO $acl$
DECLARE
  v_acl aclitem[];
BEGIN
  SELECT p.proacl INTO v_acl FROM pg_catalog.pg_proc p
   WHERE p.oid = 'public.refund_chat_turn_after_output_swap(date)'::regprocedure;
  PERFORM pg_temp.z46_assert(v_acl IS NOT NULL, 'function ACL is still the default (PUBLIC can execute)');
  PERFORM pg_temp.z46_assert(EXISTS (
    SELECT 1 FROM pg_catalog.aclexplode(v_acl) a JOIN pg_catalog.pg_roles r ON r.oid = a.grantee
     WHERE a.privilege_type = 'EXECUTE' AND r.rolname = 'authenticated'), 'authenticated cannot execute the function');
  PERFORM pg_temp.z46_assert(NOT EXISTS (
    SELECT 1 FROM pg_catalog.aclexplode(v_acl) a LEFT JOIN pg_catalog.pg_roles r ON r.oid = a.grantee
     WHERE a.privilege_type = 'EXECUTE' AND (a.grantee = 0 OR r.rolname IN ('anon', 'service_role'))),
    'PUBLIC, anon or service_role can execute the function');
END
$acl$;

-- Nobody signed in: refused, not a silent NULL.
DO $unsigned$
BEGIN
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', '', true);
  BEGIN
    PERFORM public.refund_chat_turn_after_output_swap((pg_catalog.now() AT TIME ZONE 'Asia/Seoul')::date);
    RAISE EXCEPTION 'z46 regression failed: a call with no signed-in user was accepted';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$unsigned$;

-- Evidence that must NOT count, all for user A: written by the client, green, another purpose, too old.
SELECT pg_temp.z46_audit('26101346-4000-4000-8000-000000000001', '26101346-0000-4000-8000-00000000000a', 'client_unverified', 'secondb_chat', 'red', interval '1 minute');
SELECT pg_temp.z46_audit('26101346-4000-4000-8000-000000000002', '26101346-0000-4000-8000-00000000000a', 'server_verified', 'secondb_chat', 'green', interval '1 minute');
SELECT pg_temp.z46_audit('26101346-4000-4000-8000-000000000003', '26101346-0000-4000-8000-00000000000a', 'server_verified', 'ops_recommend', 'red', interval '1 minute');
SELECT pg_temp.z46_audit('26101346-4000-4000-8000-000000000004', '26101346-0000-4000-8000-00000000000a', 'server_verified', 'secondb_chat', 'red', interval '11 minutes');
SELECT pg_temp.z46_audit('26101346-4000-4000-8000-000000000005', '26101346-0000-4000-8000-00000000000a', 'legacy_unknown', 'secondb_chat', 'red', interval '1 minute');
-- B's own evidence is B's.
SELECT pg_temp.z46_audit('26101346-4000-4000-8000-0000000000b1', '26101346-0000-4000-8000-00000000000b', 'server_verified', 'secondb_chat', 'red', interval '1 minute');

SET LOCAL request.jwt.claim.sub = '26101346-0000-4000-8000-00000000000a';
SET LOCAL ROLE authenticated;
SELECT COALESCE(public.refund_chat_turn_after_output_swap(:'today'::date)::text, 'null') AS r \gset
RESET ROLE;
SELECT pg_temp.z46_assert(:'r' = 'null', 'a turn was given back without proxy evidence (client row, green, other purpose, old, legacy, another user)');
SELECT pg_temp.z46_assert(pg_temp.z46_count('26101346-0000-4000-8000-00000000000a', :'today'::date) = 3, 'the count moved without evidence');

-- One fresh proxy row: exactly one turn comes back, on the day asked for.
SELECT pg_temp.z46_audit('26101346-4000-4000-8000-000000000011', '26101346-0000-4000-8000-00000000000a', 'server_verified', 'secondb_chat', 'red', interval '5 seconds');
SET LOCAL ROLE authenticated;
SELECT COALESCE(public.refund_chat_turn_after_output_swap(:'today'::date)::text, 'null') AS r \gset
RESET ROLE;
SELECT pg_temp.z46_assert(:'r' = '2', 'the first refund did not return the new count 2');
SELECT pg_temp.z46_assert(pg_temp.z46_count('26101346-0000-4000-8000-00000000000a', :'today'::date) = 2, 'the count is not 2 after one refund');
SELECT pg_temp.z46_assert((SELECT refunded_audit_ids = ARRAY['26101346-4000-4000-8000-000000000011'::uuid] AND ad_bonus = 2
                             FROM public.chat_usage
                            WHERE user_id = '26101346-0000-4000-8000-00000000000a' AND day = :'today'::date),
                          'the used audit id was not recorded, or ad_bonus changed');

-- The same row is not used twice: not today, and not against yesterday.
SET LOCAL ROLE authenticated;
SELECT COALESCE(public.refund_chat_turn_after_output_swap(:'today'::date)::text, 'null') AS r \gset
SELECT COALESCE(public.refund_chat_turn_after_output_swap(:'today'::date - 1)::text, 'null') AS r2 \gset
RESET ROLE;
SELECT pg_temp.z46_assert(:'r' = 'null' AND :'r2' = 'null', 'one audit row gave back a second turn');
SELECT pg_temp.z46_assert(pg_temp.z46_count('26101346-0000-4000-8000-00000000000a', :'today'::date) = 2
                          AND pg_temp.z46_count('26101346-0000-4000-8000-00000000000a', :'today'::date - 1) = 2,
                          'a count moved on the repeated call');

-- Days other than KST today or yesterday are refused, and the evidence stays unused.
SELECT pg_temp.z46_audit('26101346-4000-4000-8000-000000000012', '26101346-0000-4000-8000-00000000000a', 'server_verified', 'secondb_chat', 'red', interval '5 seconds');
SET LOCAL ROLE authenticated;
SELECT COALESCE(public.refund_chat_turn_after_output_swap(:'today'::date - 2)::text, 'null') AS r \gset
SELECT COALESCE(public.refund_chat_turn_after_output_swap(:'today'::date + 1)::text, 'null') AS r2 \gset
SELECT COALESCE(public.refund_chat_turn_after_output_swap(NULL)::text, 'null') AS r3 \gset
RESET ROLE;
SELECT pg_temp.z46_assert(:'r' = 'null' AND :'r2' = 'null' AND :'r3' = 'null', 'a day other than today or yesterday was accepted');
SELECT pg_temp.z46_assert(pg_temp.z46_count('26101346-0000-4000-8000-00000000000a', :'today'::date - 2) = 4, 'an old day was changed');

-- Yesterday is accepted (a turn sent just before midnight), and uses the row left unused above.
SET LOCAL ROLE authenticated;
SELECT COALESCE(public.refund_chat_turn_after_output_swap(:'today'::date - 1)::text, 'null') AS r \gset
RESET ROLE;
SELECT pg_temp.z46_assert(:'r' = '1', 'yesterday was not given back');
SELECT pg_temp.z46_assert((SELECT refunded_audit_ids = ARRAY['26101346-4000-4000-8000-000000000012'::uuid]
                             FROM public.chat_usage
                            WHERE user_id = '26101346-0000-4000-8000-00000000000a' AND day = :'today'::date - 1),
                          'yesterday did not record the audit id it used');

-- Two fresh rows give two turns back, the third call nothing. The count never goes below zero.
SELECT pg_temp.z46_audit('26101346-4000-4000-8000-000000000013', '26101346-0000-4000-8000-00000000000a', 'server_verified', 'secondb_chat', 'red', interval '3 seconds');
SELECT pg_temp.z46_audit('26101346-4000-4000-8000-000000000014', '26101346-0000-4000-8000-00000000000a', 'server_verified', 'secondb_chat', 'red', interval '2 seconds');
SELECT pg_temp.z46_audit('26101346-4000-4000-8000-000000000015', '26101346-0000-4000-8000-00000000000a', 'server_verified', 'secondb_chat', 'red', interval '1 second');
SET LOCAL ROLE authenticated;
SELECT COALESCE(public.refund_chat_turn_after_output_swap(:'today'::date)::text, 'null') AS r \gset
SELECT COALESCE(public.refund_chat_turn_after_output_swap(:'today'::date)::text, 'null') AS r2 \gset
SELECT COALESCE(public.refund_chat_turn_after_output_swap(:'today'::date)::text, 'null') AS r3 \gset
RESET ROLE;
SELECT pg_temp.z46_assert(:'r' = '1' AND :'r2' = '0', 'two fresh rows did not give two turns back');
SELECT pg_temp.z46_assert(:'r3' = 'null', 'a turn was given back from a day whose count is already 0');
SELECT pg_temp.z46_assert(pg_temp.z46_count('26101346-0000-4000-8000-00000000000a', :'today'::date) = 0, 'the count is not 0');
-- The row that found no turn to give back is still unused: nothing was recorded for it.
SELECT pg_temp.z46_assert((SELECT pg_catalog.cardinality(refunded_audit_ids) = 3 FROM public.chat_usage
                            WHERE user_id = '26101346-0000-4000-8000-00000000000a' AND day = :'today'::date),
                          'an audit id was recorded although no turn came back');

-- A's calls never touched B, and B's own evidence works for B only.
SELECT pg_temp.z46_assert(pg_temp.z46_count('26101346-0000-4000-8000-00000000000b', :'today'::date) = 1, 'another user''s count moved');
SET LOCAL request.jwt.claim.sub = '26101346-0000-4000-8000-00000000000b';
SET LOCAL ROLE authenticated;
SELECT COALESCE(public.refund_chat_turn_after_output_swap(:'today'::date)::text, 'null') AS r \gset
SELECT COALESCE(public.refund_chat_turn_after_output_swap(:'today'::date)::text, 'null') AS r2 \gset
RESET ROLE;
SELECT pg_temp.z46_assert(:'r' = '0' AND :'r2' = 'null', 'B did not get exactly one turn back from B''s own row');

-- The table stays read-only for its owner: no policy lets a signed-in user write chat_usage,
-- so the function is the only way a count goes down.
SELECT pg_temp.z46_assert(NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policy p
                                       WHERE p.polrelid = 'public.chat_usage'::regclass AND p.polcmd <> 'r'),
                          'a policy lets the signed-in role write chat_usage directly');

-- Rollback round trip: the down file removes the function and the column, applying again restores both.
\ir ../migrations/rollback/0252_down.sql
SELECT pg_temp.z46_assert((SELECT count(*) = 0 FROM pg_catalog.pg_proc p WHERE p.proname = 'refund_chat_turn_after_output_swap')
                          AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                                           WHERE table_schema = 'public' AND table_name = 'chat_usage' AND column_name = 'refunded_audit_ids'),
                          'the down file left the function or the column behind');
SELECT pg_temp.z46_assert(pg_temp.z46_count('26101346-0000-4000-8000-00000000000a', :'today'::date) = 0, 'the down file changed a count');
\ir ../migrations/0252_chat_turn_refund.sql
\ir ../migrations/0252_chat_turn_refund.sql
SELECT pg_temp.z46_assert((SELECT count(*) = 1 FROM pg_catalog.pg_proc p WHERE p.proname = 'refund_chat_turn_after_output_swap')
                          AND (SELECT refunded_audit_ids = '{}'::uuid[] FROM public.chat_usage
                                WHERE user_id = '26101346-0000-4000-8000-00000000000b' AND day = :'today'::date),
                          'applying again did not restore the function and an empty column');

ROLLBACK;
