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

-- The day an audit row was used for, or NULL while it is unused.
CREATE FUNCTION pg_temp.z46_used(p_audit uuid) RETURNS date
LANGUAGE sql AS $$
  SELECT day FROM public.chat_turn_refunds WHERE audit_id = p_audit
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

-- Who may call it, and who may touch the ledger table.
DO $acl$
DECLARE
  v_acl aclitem[];
BEGIN
  SELECT p.proacl INTO v_acl FROM pg_catalog.pg_proc p
   WHERE p.oid = 'public.refund_chat_turn_after_output_swap(date)'::regprocedure;
  PERFORM pg_temp.z46_assert(v_acl IS NOT NULL, 'function ACL is still the default (PUBLIC can execute)');
  PERFORM pg_temp.z46_assert(NOT EXISTS (
    SELECT 1 FROM pg_catalog.aclexplode(v_acl) a LEFT JOIN pg_catalog.pg_roles r ON r.oid = a.grantee
     WHERE a.privilege_type = 'EXECUTE' AND (a.grantee = 0 OR r.rolname IN ('anon', 'service_role'))),
    'PUBLIC, anon or service_role holds EXECUTE directly');
  -- Effective privilege, inherited grants included.
  PERFORM pg_temp.z46_assert(has_function_privilege('authenticated', 'public.refund_chat_turn_after_output_swap(date)', 'EXECUTE'),
    'authenticated cannot execute the function');
  PERFORM pg_temp.z46_assert(NOT has_function_privilege('anon', 'public.refund_chat_turn_after_output_swap(date)', 'EXECUTE')
                             AND NOT has_function_privilege('service_role', 'public.refund_chat_turn_after_output_swap(date)', 'EXECUTE'),
    'anon or service_role can execute the function');
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

-- anon is refused by privilege, before the function body runs.
SET LOCAL ROLE anon;
DO $anon$
BEGIN
  BEGIN
    PERFORM public.refund_chat_turn_after_output_swap((pg_catalog.now() AT TIME ZONE 'Asia/Seoul')::date);
    RAISE EXCEPTION 'z46 regression failed: anon called the function';
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
     WHERE user_id = '26101346-0000-4000-8000-00000000000a' AND purpose = 'secondb_chat' AND safety_zone = 'red';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$promote$;
SELECT COALESCE(public.refund_chat_turn_after_output_swap(:'today'::date)::text, 'null') AS r \gset
RESET ROLE;
SELECT pg_temp.z46_assert((SELECT count(*) = 1 FROM public.ai_audit_log
                            WHERE user_id = '26101346-0000-4000-8000-00000000000a' AND model_used = 'gpt-test+swap:v1'
                              AND event_source = 'client_unverified'),
                          'the client audit RPC did not write a client_unverified row');
SELECT pg_temp.z46_assert((SELECT count(*) = 1 FROM public.ai_audit_log
                            WHERE user_id = '26101346-0000-4000-8000-00000000000a' AND model_used = 'gpt-test+swap-once:v1'
                              AND event_source = 'client_unverified'),
                          'the once-only client audit RPC did not write a client_unverified row');
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
SELECT pg_temp.z46_assert((SELECT count(*) = 0 FROM public.ai_audit_log
                            WHERE user_id = '26101346-0000-4000-8000-00000000000a' AND event_source = 'server_verified'
                              AND purpose = 'secondb_chat' AND safety_zone = 'red'
                              AND created_at >= pg_catalog.now() - interval '10 minutes'),
                          'a signed-in user made or promoted a fresh server_verified red chat row');
SELECT pg_temp.z46_assert(:'r' = 'null', 'a turn was given back without proxy evidence (client rows, green, other purpose, old, legacy, another user)');
SELECT pg_temp.z46_assert(pg_temp.z46_count('26101346-0000-4000-8000-00000000000a', :'today'::date) = 3, 'the count moved without evidence');
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
REVOKE ALL ON FUNCTION public.z46_wrapper(), public.z46_dynamic(), public.z46_merge(), public.z46_promote(), public.z46_touch()
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.z46_wrapper(), public.z46_dynamic(), public.z46_merge(), public.z46_promote(), public.z46_touch()
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.z46_inner_writer(uuid, text) TO service_role;

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
SELECT COALESCE(public.refund_chat_turn_after_output_swap(:'today'::date)::text, 'null') AS r \gset
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
SET LOCAL request.jwt.claims = '';
SELECT pg_temp.z46_assert((SELECT count(*) = 0 FROM public.ai_audit_log
                            WHERE event_source = 'server_verified'
                              AND (model_used LIKE 'z46-%' OR model_used = 'gpt-test+swap:v1')),
                          'a signed-in request left a server_verified audit row behind');
SELECT pg_temp.z46_assert((SELECT latency_ms = 11 AND event_source = 'client_unverified' FROM public.ai_audit_log
                            WHERE user_id = '26101346-0000-4000-8000-00000000000a' AND model_used = 'gpt-test+swap:v1'),
                          'the guard stopped a change that does not touch the mark');
SELECT pg_temp.z46_assert(:'r' = 'null' AND pg_temp.z46_count('26101346-0000-4000-8000-00000000000a', :'today'::date) = 3,
                          'a turn was given back after the forged writes');
-- The server's own writes are not touched: as service_role, and with no API role at all.
SET LOCAL request.jwt.claims = '{"role":"service_role"}';
SET LOCAL ROLE service_role;
SELECT public.z46_inner_writer('26101346-0000-4000-8000-00000000000a', 'z46-as-service');
RESET ROLE;
SET LOCAL request.jwt.claims = '';
SELECT public.z46_inner_writer('26101346-0000-4000-8000-00000000000a', 'z46-as-owner');
SELECT pg_temp.z46_assert((SELECT count(*) = 2 FROM public.ai_audit_log
                            WHERE event_source = 'server_verified' AND model_used IN ('z46-as-service', 'z46-as-owner')),
                          'the guard stopped a server write');
-- Those two are real evidence rows. Take them away so the cases below count what they wrote themselves.
DELETE FROM public.ai_audit_log WHERE model_used IN ('z46-as-service', 'z46-as-owner');

-- One fresh proxy row: exactly one turn comes back, on the day asked for.
SELECT pg_temp.z46_audit('26101346-4000-4000-8000-000000000011', '26101346-0000-4000-8000-00000000000a', 'server_verified', 'secondb_chat', 'red', interval '5 seconds');
SET LOCAL ROLE authenticated;
SELECT COALESCE(public.refund_chat_turn_after_output_swap(:'today'::date)::text, 'null') AS r \gset
RESET ROLE;
SELECT pg_temp.z46_assert(:'r' = '2', 'the first refund did not return the new count 2');
SELECT pg_temp.z46_assert(pg_temp.z46_count('26101346-0000-4000-8000-00000000000a', :'today'::date) = 2, 'the count is not 2 after one refund');
SELECT pg_temp.z46_assert(pg_temp.z46_used('26101346-4000-4000-8000-000000000011') = :'today'::date
                          AND (SELECT count(*) = 1 FROM public.chat_turn_refunds), 'the used audit row was not recorded once, for today');
SELECT pg_temp.z46_assert((SELECT ad_bonus = 2 FROM public.chat_usage
                            WHERE user_id = '26101346-0000-4000-8000-00000000000a' AND day = :'today'::date), 'ad_bonus changed');

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
SELECT pg_temp.z46_assert(pg_temp.z46_used('26101346-4000-4000-8000-000000000012') IS NULL, 'a refused day used up the evidence');

-- Yesterday is accepted (a turn sent just before midnight), and uses the row left unused above.
SET LOCAL ROLE authenticated;
SELECT COALESCE(public.refund_chat_turn_after_output_swap(:'today'::date - 1)::text, 'null') AS r \gset
RESET ROLE;
SELECT pg_temp.z46_assert(:'r' = '1', 'yesterday was not given back');
SELECT pg_temp.z46_assert(pg_temp.z46_used('26101346-4000-4000-8000-000000000012') = :'today'::date - 1, 'yesterday did not record the audit row it used');

-- Three fresh rows, two turns left today: two come back, the third call finds a zero count.
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
-- The call that found no turn to give back left its evidence unused: four rows used so far, not five.
SELECT pg_temp.z46_assert((SELECT count(*) = 4 FROM public.chat_turn_refunds), 'an audit row was marked used although no turn came back');
-- ... and that evidence still works for the day that has a turn.
SET LOCAL ROLE authenticated;
SELECT COALESCE(public.refund_chat_turn_after_output_swap(:'today'::date - 1)::text, 'null') AS r \gset
RESET ROLE;
SELECT pg_temp.z46_assert(:'r' = '0' AND (SELECT count(*) = 5 FROM public.chat_turn_refunds), 'the evidence left unused did not work for the day with a turn');

-- A's calls never touched B, and B's own evidence works for B only.
SELECT pg_temp.z46_assert(pg_temp.z46_count('26101346-0000-4000-8000-00000000000b', :'today'::date) = 1
                          AND pg_temp.z46_used('26101346-4000-4000-8000-0000000000b1') IS NULL, 'another user''s count or evidence moved');
SET LOCAL request.jwt.claim.sub = '26101346-0000-4000-8000-00000000000b';
SET LOCAL ROLE authenticated;
SELECT COALESCE(public.refund_chat_turn_after_output_swap(:'today'::date)::text, 'null') AS r \gset
SELECT COALESCE(public.refund_chat_turn_after_output_swap(:'today'::date)::text, 'null') AS r2 \gset
RESET ROLE;
SELECT pg_temp.z46_assert(:'r' = '0' AND :'r2' = 'null', 'B did not get exactly one turn back from B''s own row');

-- Only the ledger's own primary key means "used already". Another unique rule that the ledger is not
-- supposed to carry must not be read as that: its conflict is an error, not a quiet NULL.
SAVEPOINT z46_other_unique;
UPDATE public.chat_usage SET count = 2
 WHERE user_id = '26101346-0000-4000-8000-00000000000b' AND day = :'today'::date;
SELECT pg_temp.z46_audit('26101346-4000-4000-8000-0000000000b2', '26101346-0000-4000-8000-00000000000b', 'server_verified', 'secondb_chat', 'red', interval '2 seconds');
SELECT pg_temp.z46_audit('26101346-4000-4000-8000-0000000000b3', '26101346-0000-4000-8000-00000000000b', 'server_verified', 'secondb_chat', 'red', interval '1 second');
CREATE UNIQUE INDEX z46_one_of_two ON public.chat_turn_refunds (day)
 WHERE audit_id IN ('26101346-4000-4000-8000-0000000000b2', '26101346-4000-4000-8000-0000000000b3');
SET LOCAL request.jwt.claim.sub = '26101346-0000-4000-8000-00000000000b';
SET LOCAL ROLE authenticated;
SELECT COALESCE(public.refund_chat_turn_after_output_swap(:'today'::date)::text, 'null') AS r \gset
DO $other$
BEGIN
  BEGIN
    -- The second fresh row is for the same day: it collides on the extra index, not on the primary key.
    PERFORM public.refund_chat_turn_after_output_swap((pg_catalog.now() AT TIME ZONE 'Asia/Seoul')::date);
    RAISE EXCEPTION 'z46 regression failed: a conflict on another unique rule was read as an already used row';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
END
$other$;
RESET ROLE;
SELECT pg_temp.z46_assert(:'r' = '1' AND pg_temp.z46_count('26101346-0000-4000-8000-00000000000b', :'today'::date) = 1,
                          'the refund before the foreign conflict did not stand, or the failed one changed the count');
ROLLBACK TO SAVEPOINT z46_other_unique;

-- The table stays read-only for its owner: no policy lets a signed-in user write chat_usage,
-- so the function is the only way a count goes down.
SELECT pg_temp.z46_assert(NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policy p
                                       WHERE p.polrelid = 'public.chat_usage'::regclass AND p.polcmd <> 'r'),
                          'a policy lets the signed-in role write chat_usage directly');

-- Rollback round trip. The down file removes the function and keeps the ledger, so evidence
-- used before it cannot be used again after 0252 is applied a second time.
\ir ../migrations/rollback/0252_down.sql
SELECT pg_temp.z46_assert((SELECT count(*) = 0 FROM pg_catalog.pg_proc p WHERE p.proname = 'refund_chat_turn_after_output_swap'),
                          'the down file left the function behind');
SELECT pg_temp.z46_assert((SELECT count(*) = 6 FROM public.chat_turn_refunds)
                          AND pg_temp.z46_count('26101346-0000-4000-8000-00000000000a', :'today'::date) = 0,
                          'the down file dropped used-evidence marks or changed a count');
-- Supabase grants new tables to the API roles by default; the scratch database does not.
-- Put those grants in place so that applying 0252 again has something to take away.
GRANT ALL ON TABLE public.chat_turn_refunds TO anon, authenticated, service_role;
\ir ../migrations/0252_chat_turn_refund.sql
\ir ../migrations/0252_chat_turn_refund.sql
SELECT pg_temp.z46_assert(NOT has_table_privilege('anon', 'public.chat_turn_refunds', 'SELECT')
                          AND NOT has_table_privilege('authenticated', 'public.chat_turn_refunds', 'INSERT')
                          AND NOT has_table_privilege('service_role', 'public.chat_turn_refunds', 'DELETE'),
                          'applying 0252 left an API role with a privilege on the ledger table');
UPDATE public.chat_usage SET count = 3
 WHERE user_id = '26101346-0000-4000-8000-00000000000a' AND day = :'today'::date;
SET LOCAL request.jwt.claim.sub = '26101346-0000-4000-8000-00000000000a';
SET LOCAL ROLE authenticated;
SELECT COALESCE(public.refund_chat_turn_after_output_swap(:'today'::date)::text, 'null') AS r \gset
RESET ROLE;
SELECT pg_temp.z46_assert(:'r' = 'null' AND pg_temp.z46_count('26101346-0000-4000-8000-00000000000a', :'today'::date) = 3,
                          'evidence used before the rollback gave a turn back again after applying 0252 a second time');
SELECT pg_temp.z46_assert(has_function_privilege('authenticated', 'public.refund_chat_turn_after_output_swap(date)', 'EXECUTE')
                          AND NOT has_function_privilege('anon', 'public.refund_chat_turn_after_output_swap(date)', 'EXECUTE')
                          AND NOT has_table_privilege('authenticated', 'public.chat_turn_refunds', 'SELECT'),
                          'applying again changed who may call the function or read the ledger');

ROLLBACK;
