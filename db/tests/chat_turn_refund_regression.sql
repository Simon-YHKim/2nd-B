\set ON_ERROR_STOP on

-- Run only on the CI scratch database after numbered 0255.
-- Z46: a chat turn whose answer was swapped for the fixed crisis notice is given back,
-- once, on the proxy-written audit row of that very turn (0252, bound to the row by 0255).
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

-- Who may call it, what is left of the unbound form, and who may touch the ledger table.
DO $acl$
DECLARE
  v_acl aclitem[];
BEGIN
  PERFORM pg_temp.z46_assert(to_regprocedure('public.refund_chat_turn_after_output_swap(date)') IS NULL,
    'the refund that is not bound to a turn (one argument) still exists');
  SELECT p.proacl INTO v_acl FROM pg_catalog.pg_proc p
   WHERE p.oid = 'public.refund_chat_turn_after_output_swap(date, uuid)'::regprocedure;
  PERFORM pg_temp.z46_assert(v_acl IS NOT NULL, 'function ACL is still the default (PUBLIC can execute)');
  PERFORM pg_temp.z46_assert(NOT EXISTS (
    SELECT 1 FROM pg_catalog.aclexplode(v_acl) a LEFT JOIN pg_catalog.pg_roles r ON r.oid = a.grantee
     WHERE a.privilege_type = 'EXECUTE' AND (a.grantee = 0 OR r.rolname IN ('anon', 'service_role'))),
    'PUBLIC, anon or service_role holds EXECUTE directly');
  -- Effective privilege, inherited grants included.
  PERFORM pg_temp.z46_assert(has_function_privilege('authenticated', 'public.refund_chat_turn_after_output_swap(date, uuid)', 'EXECUTE'),
    'authenticated cannot execute the function');
  PERFORM pg_temp.z46_assert(NOT has_function_privilege('anon', 'public.refund_chat_turn_after_output_swap(date, uuid)', 'EXECUTE')
                             AND NOT has_function_privilege('service_role', 'public.refund_chat_turn_after_output_swap(date, uuid)', 'EXECUTE'),
    'anon or service_role can execute the function');
  PERFORM pg_temp.z46_assert(NOT has_function_privilege('authenticated', 'public.chat_turn_refund_day_matches(date, timestamp)', 'EXECUTE')
                             AND NOT has_function_privilege('anon', 'public.chat_turn_refund_day_matches(date, timestamp)', 'EXECUTE')
                             AND NOT has_function_privilege('service_role', 'public.chat_turn_refund_day_matches(date, timestamp)', 'EXECUTE')
                             AND NOT has_function_privilege('authenticated', 'public.guard_ai_audit_server_verified_final()', 'EXECUTE')
                             AND NOT has_function_privilege('authenticated', 'public.guard_ai_audit_server_verified()', 'EXECUTE'),
    'an API role may call the day rule or a trigger function directly');
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

-- The day rule, asked directly. The function cannot be made to see another "now", so the moments
-- around midnight are checked here by value: p_made is the audit row's creation time on the KST clock.
SELECT pg_temp.z46_assert(
      public.chat_turn_refund_day_matches(DATE '2026-10-14', TIMESTAMP '2026-10-14 13:00:00')
  AND public.chat_turn_refund_day_matches(DATE '2026-10-14', TIMESTAMP '2026-10-14 00:00:00')
  AND public.chat_turn_refund_day_matches(DATE '2026-10-14', TIMESTAMP '2026-10-14 23:59:59'),
  'the row''s own day was refused');
SELECT pg_temp.z46_assert(
      public.chat_turn_refund_day_matches(DATE '2026-10-13', TIMESTAMP '2026-10-14 00:00:00')
  AND public.chat_turn_refund_day_matches(DATE '2026-10-13', TIMESTAMP '2026-10-14 00:09:59.999'),
  'the day before was refused for a row made in the first ten minutes of the day');
SELECT pg_temp.z46_assert(
      NOT public.chat_turn_refund_day_matches(DATE '2026-10-13', TIMESTAMP '2026-10-14 00:10:00')
  AND NOT public.chat_turn_refund_day_matches(DATE '2026-10-13', TIMESTAMP '2026-10-14 13:00:00')
  AND NOT public.chat_turn_refund_day_matches(DATE '2026-10-13', TIMESTAMP '2026-10-14 23:59:59'),
  'the day before was accepted for a row made at ten past midnight or later');
SELECT pg_temp.z46_assert(
      NOT public.chat_turn_refund_day_matches(DATE '2026-10-15', TIMESTAMP '2026-10-14 23:59:59')
  AND NOT public.chat_turn_refund_day_matches(DATE '2026-10-12', TIMESTAMP '2026-10-14 00:00:01')
  AND NOT public.chat_turn_refund_day_matches(NULL, TIMESTAMP '2026-10-14 13:00:00')
  AND NOT public.chat_turn_refund_day_matches(DATE '2026-10-14', NULL),
  'the day after, two days before or a missing value was accepted');

-- anon is refused by privilege, before the function body runs.
SET LOCAL ROLE anon;
DO $anon$
BEGIN
  BEGIN
    PERFORM public.refund_chat_turn_after_output_swap((pg_catalog.now() AT TIME ZONE 'Asia/Seoul')::date, '26101346-4000-4000-8000-000000000011');
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
    PERFORM public.refund_chat_turn_after_output_swap((pg_catalog.now() AT TIME ZONE 'Asia/Seoul')::date, '26101346-4000-4000-8000-000000000011');
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
         COALESCE(public.refund_chat_turn_after_output_swap(:'today'::date, '26101346-4000-4000-8000-000000000001')::text, 'null'),
         COALESCE(public.refund_chat_turn_after_output_swap(:'today'::date, '26101346-4000-4000-8000-000000000002')::text, 'null'),
         COALESCE(public.refund_chat_turn_after_output_swap(:'today'::date, '26101346-4000-4000-8000-000000000003')::text, 'null'),
         COALESCE(public.refund_chat_turn_after_output_swap(:'today'::date, '26101346-4000-4000-8000-000000000004')::text, 'null'),
         COALESCE(public.refund_chat_turn_after_output_swap(:'today'::date, '26101346-4000-4000-8000-000000000005')::text, 'null'),
         COALESCE(public.refund_chat_turn_after_output_swap(:'today'::date, '26101346-4000-4000-8000-0000000000b1')::text, 'null'),
         COALESCE(public.refund_chat_turn_after_output_swap(:'today'::date, :'c1')::text, 'null'),
         COALESCE(public.refund_chat_turn_after_output_swap(:'today'::date, :'c2')::text, 'null'),
         COALESCE(public.refund_chat_turn_after_output_swap(:'today'::date, '26101346-4000-4000-8000-0000000000ff')::text, 'null'),
         COALESCE(public.refund_chat_turn_after_output_swap(:'today'::date, NULL)::text, 'null')) AS r \gset
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
SELECT pg_temp.z46_assert((SELECT count(*) = 0 FROM public.ai_audit_log
                            WHERE user_id = '26101346-0000-4000-8000-00000000000a' AND event_source = 'server_verified'
                              AND purpose = 'secondb_chat' AND safety_zone = 'red'
                              AND created_at >= pg_catalog.now() - interval '10 minutes'),
                          'a signed-in user made or promoted a fresh server_verified red chat row');
SELECT pg_temp.z46_assert(:'r' = 'null,null,null,null,null,null,null,null,null,null',
                          'a turn was given back on a row that is not evidence (client rows, green, other purpose, old, legacy, another user, unknown id, no id): ' || :'r');
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
-- Those four are real evidence rows. Take them away so the cases below count what they wrote themselves.
DELETE FROM public.ai_audit_log WHERE model_used LIKE 'z46-as-%';

-- A row a proxy wrote stays what it is under a signed-in request: owner, purpose, zone and time
-- cannot be changed, a column that is not evidence can.
SELECT pg_temp.z46_audit('26101346-4000-4000-8000-000000000021', '26101346-0000-4000-8000-00000000000a', 'server_verified', 'secondb_chat', 'red', interval '30 seconds');
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
-- The server itself may still correct such a row.
UPDATE public.ai_audit_log SET purpose = 'ops_recommend' WHERE id = '26101346-4000-4000-8000-000000000021';
SELECT pg_temp.z46_assert((SELECT purpose = 'ops_recommend' FROM public.ai_audit_log WHERE id = '26101346-4000-4000-8000-000000000021'),
                          'the guard stopped a server-side correction');
DELETE FROM public.ai_audit_log WHERE id = '26101346-4000-4000-8000-000000000021';
SELECT pg_temp.z46_assert(pg_temp.z46_count('26101346-0000-4000-8000-00000000000a', :'today'::date) = 3
                          AND (SELECT count(*) = 0 FROM public.chat_turn_refunds),
                          'a count or the ledger moved during the forged writes');

-- One fresh proxy row: asking with that row gives exactly one turn back, on the day asked for.
SELECT pg_temp.z46_audit('26101346-4000-4000-8000-000000000011', '26101346-0000-4000-8000-00000000000a', 'server_verified', 'secondb_chat', 'red', interval '5 seconds');
SET LOCAL ROLE authenticated;
SELECT COALESCE(public.refund_chat_turn_after_output_swap(:'today'::date, '26101346-4000-4000-8000-000000000011')::text, 'null') AS r \gset
RESET ROLE;
SELECT pg_temp.z46_assert(:'r' = '2', 'the first refund did not return the new count 2');
SELECT pg_temp.z46_assert(pg_temp.z46_count('26101346-0000-4000-8000-00000000000a', :'today'::date) = 2, 'the count is not 2 after one refund');
SELECT pg_temp.z46_assert(pg_temp.z46_used('26101346-4000-4000-8000-000000000011') = :'today'::date
                          AND (SELECT count(*) = 1 FROM public.chat_turn_refunds), 'the used audit row was not recorded once, for today');
SELECT pg_temp.z46_assert((SELECT ad_bonus = 2 FROM public.chat_usage
                            WHERE user_id = '26101346-0000-4000-8000-00000000000a' AND day = :'today'::date), 'ad_bonus changed');

-- The same row is not used twice: not today, and not against yesterday.
SET LOCAL ROLE authenticated;
SELECT COALESCE(public.refund_chat_turn_after_output_swap(:'today'::date, '26101346-4000-4000-8000-000000000011')::text, 'null') AS r \gset
SELECT COALESCE(public.refund_chat_turn_after_output_swap(:'today'::date - 1, '26101346-4000-4000-8000-000000000011')::text, 'null') AS r2 \gset
RESET ROLE;
SELECT pg_temp.z46_assert(:'r' = 'null' AND :'r2' = 'null', 'one audit row gave back a second turn');
SELECT pg_temp.z46_assert(pg_temp.z46_count('26101346-0000-4000-8000-00000000000a', :'today'::date) = 2
                          AND pg_temp.z46_count('26101346-0000-4000-8000-00000000000a', :'today'::date - 1) = 2,
                          'a count moved on the repeated call');

-- A fresh row, asked for days that are not its own: refused, and the evidence stays unused.
SELECT pg_temp.z46_audit('26101346-4000-4000-8000-000000000012', '26101346-0000-4000-8000-00000000000a', 'server_verified', 'secondb_chat', 'red', interval '5 seconds');
SET LOCAL ROLE authenticated;
SELECT COALESCE(public.refund_chat_turn_after_output_swap(:'today'::date - 2, '26101346-4000-4000-8000-000000000012')::text, 'null') AS r \gset
SELECT COALESCE(public.refund_chat_turn_after_output_swap(:'today'::date + 1, '26101346-4000-4000-8000-000000000012')::text, 'null') AS r2 \gset
SELECT COALESCE(public.refund_chat_turn_after_output_swap(NULL, '26101346-4000-4000-8000-000000000012')::text, 'null') AS r3 \gset
RESET ROLE;
SELECT pg_temp.z46_assert(:'r' = 'null' AND :'r2' = 'null' AND :'r3' = 'null', 'a day other than today or yesterday was accepted');
SELECT pg_temp.z46_assert(pg_temp.z46_count('26101346-0000-4000-8000-00000000000a', :'today'::date - 2) = 4, 'an old day was changed');
SELECT pg_temp.z46_assert(pg_temp.z46_used('26101346-4000-4000-8000-000000000012') IS NULL, 'a refused day used up the evidence');

-- The day before, for that same fresh row. What the function answers must be what the day rule says
-- about the row's own creation time: the day before only when the row was made before 00:10 KST.
-- Whatever the clock says while this runs, the case is undone so the cases below start the same.
SELECT public.chat_turn_refund_day_matches(:'today'::date - 1, (a.created_at AT TIME ZONE 'Asia/Seoul'))::text AS y_ok
  FROM public.ai_audit_log AS a WHERE a.id = '26101346-4000-4000-8000-000000000012' \gset
SAVEPOINT z46_day_before;
SET LOCAL ROLE authenticated;
SELECT COALESCE(public.refund_chat_turn_after_output_swap(:'today'::date - 1, '26101346-4000-4000-8000-000000000012')::text, 'null') AS r \gset
RESET ROLE;
SELECT pg_temp.z46_assert((:'y_ok' = 'true' AND :'r' = '1' AND pg_temp.z46_used('26101346-4000-4000-8000-000000000012') = :'today'::date - 1)
                       OR (:'y_ok' = 'false' AND :'r' = 'null' AND pg_temp.z46_used('26101346-4000-4000-8000-000000000012') IS NULL),
                          'the day before was not handled as the day rule says (rule ' || :'y_ok' || ', function ' || :'r' || ')');
ROLLBACK TO SAVEPOINT z46_day_before;

-- Its own day works.
SET LOCAL ROLE authenticated;
SELECT COALESCE(public.refund_chat_turn_after_output_swap(:'today'::date, '26101346-4000-4000-8000-000000000012')::text, 'null') AS r \gset
RESET ROLE;
SELECT pg_temp.z46_assert(:'r' = '1' AND pg_temp.z46_used('26101346-4000-4000-8000-000000000012') = :'today'::date, 'the row''s own day was not given back');

-- Three fresh rows, one turn left today: one comes back, the next call finds a zero count.
SELECT pg_temp.z46_audit('26101346-4000-4000-8000-000000000013', '26101346-0000-4000-8000-00000000000a', 'server_verified', 'secondb_chat', 'red', interval '3 seconds');
SELECT pg_temp.z46_audit('26101346-4000-4000-8000-000000000014', '26101346-0000-4000-8000-00000000000a', 'server_verified', 'secondb_chat', 'red', interval '2 seconds');
SELECT pg_temp.z46_audit('26101346-4000-4000-8000-000000000015', '26101346-0000-4000-8000-00000000000a', 'server_verified', 'secondb_chat', 'red', interval '1 second');
SET LOCAL ROLE authenticated;
SELECT COALESCE(public.refund_chat_turn_after_output_swap(:'today'::date, '26101346-4000-4000-8000-000000000013')::text, 'null') AS r \gset
SELECT COALESCE(public.refund_chat_turn_after_output_swap(:'today'::date, '26101346-4000-4000-8000-000000000014')::text, 'null') AS r2 \gset
RESET ROLE;
SELECT pg_temp.z46_assert(:'r' = '0', 'the fresh row did not give the last turn back');
SELECT pg_temp.z46_assert(:'r2' = 'null', 'a turn was given back from a day whose count is already 0');
SELECT pg_temp.z46_assert(pg_temp.z46_count('26101346-0000-4000-8000-00000000000a', :'today'::date) = 0, 'the count is not 0');
-- The call that found no turn to give back left its evidence unused: three rows used so far, not four.
SELECT pg_temp.z46_assert((SELECT count(*) = 3 FROM public.chat_turn_refunds)
                          AND pg_temp.z46_used('26101346-4000-4000-8000-000000000014') IS NULL,
                          'an audit row was marked used although no turn came back');
-- ... and that evidence still works once the day has a turn again.
UPDATE public.chat_usage SET count = 1
 WHERE user_id = '26101346-0000-4000-8000-00000000000a' AND day = :'today'::date;
SET LOCAL ROLE authenticated;
SELECT COALESCE(public.refund_chat_turn_after_output_swap(:'today'::date, '26101346-4000-4000-8000-000000000014')::text, 'null') AS r \gset
RESET ROLE;
SELECT pg_temp.z46_assert(:'r' = '0' AND (SELECT count(*) = 4 FROM public.chat_turn_refunds), 'the evidence left unused did not work once there was a turn');
-- The row nobody asked with stays unused, however many calls were made around it.
SELECT pg_temp.z46_assert(pg_temp.z46_used('26101346-4000-4000-8000-000000000015') IS NULL, 'a row was used although no call named it');

-- A's calls never touched B, and B's own evidence works for B only.
SELECT pg_temp.z46_assert(pg_temp.z46_count('26101346-0000-4000-8000-00000000000b', :'today'::date) = 1
                          AND pg_temp.z46_used('26101346-4000-4000-8000-0000000000b1') IS NULL, 'another user''s count or evidence moved');
SET LOCAL request.jwt.claim.sub = '26101346-0000-4000-8000-00000000000b';
SET LOCAL ROLE authenticated;
SELECT COALESCE(public.refund_chat_turn_after_output_swap(:'today'::date, '26101346-4000-4000-8000-000000000015')::text, 'null') AS r0 \gset
SELECT COALESCE(public.refund_chat_turn_after_output_swap(:'today'::date, '26101346-4000-4000-8000-0000000000b1')::text, 'null') AS r \gset
SELECT COALESCE(public.refund_chat_turn_after_output_swap(:'today'::date, '26101346-4000-4000-8000-0000000000b1')::text, 'null') AS r2 \gset
RESET ROLE;
SELECT pg_temp.z46_assert(:'r0' = 'null' AND pg_temp.z46_used('26101346-4000-4000-8000-000000000015') IS NULL, 'B got a turn back on A''s row');
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
SELECT COALESCE(public.refund_chat_turn_after_output_swap(:'today'::date, '26101346-4000-4000-8000-0000000000b2')::text, 'null') AS r \gset
DO $other$
BEGIN
  BEGIN
    -- The second fresh row is for the same day: it collides on the extra index, not on the primary key.
    PERFORM public.refund_chat_turn_after_output_swap((pg_catalog.now() AT TIME ZONE 'Asia/Seoul')::date, '26101346-4000-4000-8000-0000000000b3');
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

-- (A ledger whose primary key may be deferred is refused by 0255 when it is applied. That case
-- ends the apply with an error, so it is run by the workflow's re-apply step, not here.)

-- Rollback round trip, newest first. The 0255 down file brings back the two function bodies of 0252;
-- the 0252 down file then removes the function and keeps the ledger, so evidence used before cannot
-- be used again after both are applied a second time.
\ir ../migrations/rollback/0255_down.sql
SELECT pg_temp.z46_assert(to_regprocedure('public.refund_chat_turn_after_output_swap(date)') IS NOT NULL
                          AND to_regprocedure('public.refund_chat_turn_after_output_swap(date, uuid)') IS NULL
                          AND to_regprocedure('public.chat_turn_refund_day_matches(date, timestamp)') IS NULL
                          AND to_regprocedure('public.guard_ai_audit_server_verified_final()') IS NULL
                          AND (SELECT count(*) = 1 FROM pg_catalog.pg_trigger t
                                WHERE t.tgrelid = 'public.ai_audit_log'::regclass AND NOT t.tgisinternal),
                          'the 0255 down file did not leave exactly what 0252 made');
\ir ../migrations/rollback/0252_down.sql
SELECT pg_temp.z46_assert((SELECT count(*) = 0 FROM pg_catalog.pg_proc p WHERE p.proname = 'refund_chat_turn_after_output_swap'),
                          'the down files left a refund function behind');
SELECT pg_temp.z46_assert((SELECT count(*) = 5 FROM public.chat_turn_refunds)
                          AND pg_temp.z46_count('26101346-0000-4000-8000-00000000000a', :'today'::date) = 0,
                          'the down files dropped used-evidence marks or changed a count');
-- Supabase grants new tables to the API roles by default; the scratch database does not.
-- Put those grants in place so that applying 0252 again has something to take away.
GRANT ALL ON TABLE public.chat_turn_refunds TO anon, authenticated, service_role;
\ir ../migrations/0252_chat_turn_refund.sql
\ir ../migrations/0252_chat_turn_refund.sql
\ir ../migrations/0255_chat_turn_refund_bound_to_audit.sql
\ir ../migrations/0255_chat_turn_refund_bound_to_audit.sql
SELECT pg_temp.z46_assert(NOT has_table_privilege('anon', 'public.chat_turn_refunds', 'SELECT')
                          AND NOT has_table_privilege('authenticated', 'public.chat_turn_refunds', 'INSERT')
                          AND NOT has_table_privilege('service_role', 'public.chat_turn_refunds', 'DELETE'),
                          'applying again left an API role with a privilege on the ledger table');
UPDATE public.chat_usage SET count = 3
 WHERE user_id = '26101346-0000-4000-8000-00000000000a' AND day = :'today'::date;
SELECT pg_temp.z46_audit('26101346-4000-4000-8000-000000000016', '26101346-0000-4000-8000-00000000000a', 'server_verified', 'secondb_chat', 'red', interval '1 second');
SET LOCAL request.jwt.claim.sub = '26101346-0000-4000-8000-00000000000a';
SET LOCAL ROLE authenticated;
SELECT COALESCE(public.refund_chat_turn_after_output_swap(:'today'::date, '26101346-4000-4000-8000-000000000011')::text, 'null') AS r \gset
SELECT COALESCE(public.refund_chat_turn_after_output_swap(:'today'::date, '26101346-4000-4000-8000-000000000016')::text, 'null') AS r2 \gset
RESET ROLE;
SELECT pg_temp.z46_assert(:'r' = 'null', 'evidence used before the rollback gave a turn back again after applying both a second time');
SELECT pg_temp.z46_assert(:'r2' = '2' AND pg_temp.z46_count('26101346-0000-4000-8000-00000000000a', :'today'::date) = 2,
                          'a fresh row did not give a turn back after applying both a second time');
SELECT pg_temp.z46_assert(has_function_privilege('authenticated', 'public.refund_chat_turn_after_output_swap(date, uuid)', 'EXECUTE')
                          AND NOT has_function_privilege('anon', 'public.refund_chat_turn_after_output_swap(date, uuid)', 'EXECUTE')
                          AND to_regprocedure('public.refund_chat_turn_after_output_swap(date)') IS NULL
                          AND NOT has_table_privilege('authenticated', 'public.chat_turn_refunds', 'SELECT')
                          AND (SELECT count(*) = 2 FROM pg_catalog.pg_trigger t
                                WHERE t.tgrelid = 'public.ai_audit_log'::regclass AND NOT t.tgisinternal),
                          'applying again changed who may call the function, brought the unbound form back, or lost a guard');

ROLLBACK;
