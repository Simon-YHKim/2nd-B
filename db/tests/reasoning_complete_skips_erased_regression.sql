\set ON_ERROR_STOP on

-- Run only on the CI scratch database after numbered 0253.
-- Z66, the narrow case: a record or source deleted while its reasoning run was still working.
-- complete_reasoning_run must not store a proposal whose target is gone for that owner.
BEGIN;

CREATE FUNCTION pg_temp.z66c_assert(p_ok boolean, p_what text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'z66c regression failed: %', p_what;
  END IF;
END
$$;

CREATE FUNCTION pg_temp.z66c_p(p_kind text, p_ref text, p_title text) RETURNS jsonb
LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'key', p_kind || ':' || p_ref, 'refKind', p_kind, 'refId', p_ref, 'title', p_title,
    'meta', 'note', 'createdAt', '2026-10-13T00:00:00.000Z', 'icon', 'notes', 'domain', 'growth')
$$;

-- The ordinals a run ended up with, as text: '0,2,5'.
CREATE FUNCTION pg_temp.z66c_ordinals(p_run uuid) RETURNS text
LANGUAGE sql AS $$
  SELECT COALESCE(string_agg(ordinal::text, ',' ORDER BY ordinal), '') FROM public.reasoning_run_proposals WHERE run_id = p_run
$$;

-- The vanilla PostgreSQL auth stub lacks production trigger columns.
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users (id, email) VALUES
  ('26101353-0000-4000-8000-00000000000a', 'z66c-a@example.com'),
  ('26101353-0000-4000-8000-00000000000b', 'z66c-b@example.com');
SET LOCAL session_replication_role = origin;
INSERT INTO public.users (id, email, birth_date, locale) VALUES
  ('26101353-0000-4000-8000-00000000000a', 'z66c-a@example.com', DATE '1990-01-01', 'en'),
  ('26101353-0000-4000-8000-00000000000b', 'z66c-b@example.com', DATE '1990-01-01', 'en');

INSERT INTO public.records (id, user_id, kind, body) VALUES
  ('26101353-1000-4000-8000-0000000000a1', '26101353-0000-4000-8000-00000000000a', 'note', 'a1 stays'),
  ('26101353-1000-4000-8000-0000000000a2', '26101353-0000-4000-8000-00000000000a', 'note', 'a2 goes'),
  ('26101353-1000-4000-8000-0000000000a3', '26101353-0000-4000-8000-00000000000a', 'note', 'a3 stays'),
  ('26101353-1000-4000-8000-0000000000b1', '26101353-0000-4000-8000-00000000000b', 'note', 'b1 is B''s');
INSERT INTO public.sources (id, user_id, kind, title, storage_path) VALUES
  ('26101353-2000-4000-8000-0000000000a1', '26101353-0000-4000-8000-00000000000a', 'article', 's1 stays', 'raw/z66c-s1.md'),
  ('26101353-2000-4000-8000-0000000000a2', '26101353-0000-4000-8000-00000000000a', 'article', 's2 goes', 'raw/z66c-s2.md'),
  ('26101353-2000-4000-8000-0000000000b1', '26101353-0000-4000-8000-00000000000b', 'article', 'sb1 is B''s', 'raw/z66c-sb1.md');

INSERT INTO public.reasoning_runs (id, user_id, idempotency_key, trigger_kind, status, spend, week_bucket, month_bucket) VALUES
  ('26101353-3000-4000-8000-000000000001', '26101353-0000-4000-8000-00000000000a', 'z66c-run-0001', 'auto', 'running',  'none', '2026-W42', '2026-10'),
  ('26101353-3000-4000-8000-000000000002', '26101353-0000-4000-8000-00000000000a', 'z66c-run-0002', 'auto', 'reserved', 'none', '2026-W42', '2026-10'),
  ('26101353-3000-4000-8000-000000000003', '26101353-0000-4000-8000-00000000000a', 'z66c-run-0003', 'auto', 'running',  'none', '2026-W42', '2026-10'),
  ('26101353-3000-4000-8000-000000000004', '26101353-0000-4000-8000-00000000000a', 'z66c-run-0004', 'auto', 'ratified', 'none', '2026-W42', '2026-10'),
  ('26101353-3000-4000-8000-000000000005', '26101353-0000-4000-8000-00000000000a', 'z66c-run-0005', 'auto', 'running',  'none', '2026-W42', '2026-10'),
  ('26101353-3000-4000-8000-000000000006', '26101353-0000-4000-8000-00000000000a', 'z66c-run-0006', 'auto', 'running',  'none', '2026-W42', '2026-10'),
  ('26101353-3000-4000-8000-000000000007', '26101353-0000-4000-8000-00000000000a', 'z66c-run-0007', 'auto', 'running',  'none', '2026-W42', '2026-10'),
  ('26101353-3000-4000-8000-0000000000b1', '26101353-0000-4000-8000-00000000000b', 'z66c-run-00b1', 'auto', 'running',  'none', '2026-W42', '2026-10');

-- The run is still working when its owner deletes one record and one source.
DELETE FROM public.records WHERE id = '26101353-1000-4000-8000-0000000000a2';
DELETE FROM public.sources WHERE id = '26101353-2000-4000-8000-0000000000a2';

-- Payloads, built here because the signed-in role cannot reach this session's pg_temp helpers.
SELECT jsonb_build_array(
    pg_temp.z66c_p('record', '26101353-1000-4000-8000-0000000000a1', 'a1 stays'),
    pg_temp.z66c_p('record', '26101353-1000-4000-8000-0000000000a2', 'a2 goes'),
    pg_temp.z66c_p('source', '26101353-2000-4000-8000-0000000000a1', 's1 stays'),
    pg_temp.z66c_p('source', '26101353-2000-4000-8000-0000000000a2', 's2 goes'),
    pg_temp.z66c_p('record', '26101353-1000-4000-8000-0000000000b1', 'another owner''s record'),
    pg_temp.z66c_p('source', '26101353-1000-4000-8000-0000000000a1', 'a record id named as a source'),
    pg_temp.z66c_p('source', '26101353-2000-4000-8000-0000000000b1', 'another owner''s source'))::text AS p_n1 \gset
SELECT jsonb_build_array(pg_temp.z66c_p('record', '26101353-1000-4000-8000-0000000000a3', 'a late retry'))::text AS p_n1b \gset
SELECT jsonb_build_array(
    pg_temp.z66c_p('record', upper('26101353-1000-4000-8000-0000000000a1'), 'upper case, live'),
    pg_temp.z66c_p('record', '{26101353-1000-4000-8000-0000000000a3}', 'braces, live'),
    pg_temp.z66c_p('record', upper('26101353-1000-4000-8000-0000000000a2'), 'upper case, erased'),
    pg_temp.z66c_p('record', '{26101353-1000-4000-8000-0000000000a2}', 'braces, erased'),
    pg_temp.z66c_p('record', 'not-a-uuid', 'free text'),
    pg_temp.z66c_p('other', '26101353-1000-4000-8000-0000000000a2', 'a kind this function does not judge'),
    jsonb_build_object('refKind', 'record', 'title', 'no refId'),
    jsonb_build_object('refId', '26101353-1000-4000-8000-0000000000a2', 'title', 'no refKind'),
    jsonb_build_object('kind', 'domain_link', 'payload', pg_temp.z66c_p('record', '26101353-1000-4000-8000-0000000000a1', 'wrapped, live')),
    jsonb_build_object('kind', 'domain_link', 'payload', pg_temp.z66c_p('record', '26101353-1000-4000-8000-0000000000a2', 'wrapped, erased')),
    pg_temp.z66c_p('record', (SELECT string_agg(md5(i::text), '') FROM generate_series(1, 400) AS i), 'very long'))::text AS p_n2 \gset
SELECT jsonb_build_array(
    pg_temp.z66c_p('record', '26101353-1000-4000-8000-0000000000a2', 'a2 goes'),
    pg_temp.z66c_p('source', '26101353-2000-4000-8000-0000000000a2', 's2 goes'))::text AS p_n3 \gset
SELECT jsonb_build_array(pg_temp.z66c_p('record', '26101353-1000-4000-8000-0000000000a1', 'a late retry'))::text AS p_n3b \gset
SELECT jsonb_build_array(
    pg_temp.z66c_p('record', '26101353-1000-4000-8000-0000000000b1', 'b1 is B''s'),
    pg_temp.z66c_p('record', '26101353-1000-4000-8000-0000000000a1', 'A''s record'),
    pg_temp.z66c_p('source', '26101353-2000-4000-8000-0000000000b1', 'sb1 is B''s'),
    pg_temp.z66c_p('source', '26101353-2000-4000-8000-0000000000a1', 'A''s source'))::text AS p_nb \gset
SELECT jsonb_build_array(pg_temp.z66c_p('record', '26101353-1000-4000-8000-0000000000a2', 'a2 goes'))::text AS p_n5 \gset
SELECT jsonb_build_array(
    pg_temp.z66c_p('record', '26101353-1000-4000-8000-0000000000a2', 'a2 goes'),
    pg_temp.z66c_p('record', '26101353-1000-4000-8000-0000000000a1', 'a1 stays'))::text AS p_n6 \gset

-- Who may call it is what 0092 set: signed-in users only.
SELECT pg_temp.z66c_assert(has_function_privilege('authenticated', 'public.complete_reasoning_run(uuid, uuid, jsonb)', 'EXECUTE')
                           AND NOT has_function_privilege('anon', 'public.complete_reasoning_run(uuid, uuid, jsonb)', 'EXECUTE'),
                           'the EXECUTE grants of complete_reasoning_run changed');

SET LOCAL request.jwt.claim.sub = '26101353-0000-4000-8000-00000000000a';
SET LOCAL ROLE authenticated;

-- 1. Live targets are stored, erased ones and another owner's are not. Ordinals keep their place.
SELECT public.complete_reasoning_run('26101353-0000-4000-8000-00000000000a', '26101353-3000-4000-8000-000000000001', :'p_n1'::jsonb) AS n1 \gset
-- 2. Calling it again returns the same number and adds nothing.
SELECT public.complete_reasoning_run('26101353-0000-4000-8000-00000000000a', '26101353-3000-4000-8000-000000000001', :'p_n1b'::jsonb) AS n1b \gset

-- 3. Shapes. Upper case and braces are the same uuid; anything the function cannot judge is stored as before.
SELECT public.complete_reasoning_run('26101353-0000-4000-8000-00000000000a', '26101353-3000-4000-8000-000000000002', :'p_n2'::jsonb) AS n2 \gset

-- 4. Every target is gone: nothing is stored, the run still ends, and a retry says the same.
SELECT public.complete_reasoning_run('26101353-0000-4000-8000-00000000000a', '26101353-3000-4000-8000-000000000003', :'p_n3'::jsonb) AS n3 \gset
SELECT public.complete_reasoning_run('26101353-0000-4000-8000-00000000000a', '26101353-3000-4000-8000-000000000003', :'p_n3b'::jsonb) AS n3b \gset

RESET ROLE;

-- 5. The refusals 0092 had are unchanged.
DO $refusals$
DECLARE
  v_a constant uuid := '26101353-0000-4000-8000-00000000000a';
  v_b constant uuid := '26101353-0000-4000-8000-00000000000b';
BEGIN
  BEGIN
    PERFORM public.complete_reasoning_run(v_b, '26101353-3000-4000-8000-0000000000b1', '[]'::jsonb);
    RAISE EXCEPTION 'z66c regression failed: a caller completed another user''s run';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.complete_reasoning_run(v_a, '26101353-3000-4000-8000-0000000000b1', '[]'::jsonb);
    RAISE EXCEPTION 'z66c regression failed: a run of another user was found';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN NULL;
  END;
  BEGIN
    PERFORM public.complete_reasoning_run(v_a, '26101353-3000-4000-8000-000000000004', '[]'::jsonb);
    RAISE EXCEPTION 'z66c regression failed: an already ratified run was completed';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN NULL;
  END;
  BEGIN
    PERFORM public.complete_reasoning_run(v_a, '26101353-3000-4000-8000-000000000005', '{"not":"an array"}'::jsonb);
    RAISE EXCEPTION 'z66c regression failed: a non-array payload was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.complete_reasoning_run(v_a, '26101353-3000-4000-8000-000000000005',
      (SELECT jsonb_agg(pg_temp.z66c_p('record', '26101353-1000-4000-8000-0000000000a1', 'x')) FROM generate_series(1, 33)));
    RAISE EXCEPTION 'z66c regression failed: 33 proposals were accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
END
$refusals$;

SELECT pg_temp.z66c_assert(:n1 = 2 AND pg_temp.z66c_ordinals('26101353-3000-4000-8000-000000000001') = '0,2',
                           'run 1 did not store exactly the two live targets at their own ordinals');
SELECT pg_temp.z66c_assert(:n1b = 2 AND pg_temp.z66c_ordinals('26101353-3000-4000-8000-000000000001') = '0,2',
                           'a second call changed run 1');
SELECT pg_temp.z66c_assert((SELECT payload->>'title' = 'a1 stays' AND payload->>'refId' = '26101353-1000-4000-8000-0000000000a1'
                                   AND kind = 'domain_link' AND status = 'proposed'
                              FROM public.reasoning_run_proposals
                             WHERE run_id = '26101353-3000-4000-8000-000000000001' AND ordinal = 0),
                           'a stored proposal lost part of its payload');
SELECT pg_temp.z66c_assert(:n2 = 8 AND pg_temp.z66c_ordinals('26101353-3000-4000-8000-000000000002') = '0,1,4,5,6,7,8,10',
                           'run 2: wrong rows for the upper-case, braced, free-text, unjudged and wrapped shapes');
SELECT pg_temp.z66c_assert(:n3 = 0 AND :n3b = 0 AND pg_temp.z66c_ordinals('26101353-3000-4000-8000-000000000003') = '',
                           'run 3 stored a proposal although every target was gone');
SELECT pg_temp.z66c_assert((SELECT bool_and(status = 'proposed') FROM public.reasoning_runs
                             WHERE id IN ('26101353-3000-4000-8000-000000000001', '26101353-3000-4000-8000-000000000002',
                                          '26101353-3000-4000-8000-000000000003')),
                           'a completed run is not in the proposed state');
SELECT pg_temp.z66c_assert((SELECT status = 'running' FROM public.reasoning_runs WHERE id = '26101353-3000-4000-8000-000000000005')
                           AND pg_temp.z66c_ordinals('26101353-3000-4000-8000-000000000005') = '',
                           'a refused call changed run 5');

-- 6. B is judged against B's own rows: B's record is stored, A's is not B's.
SET LOCAL request.jwt.claim.sub = '26101353-0000-4000-8000-00000000000b';
SET LOCAL ROLE authenticated;
SELECT public.complete_reasoning_run('26101353-0000-4000-8000-00000000000b', '26101353-3000-4000-8000-0000000000b1', :'p_nb'::jsonb) AS nb \gset
RESET ROLE;
SELECT pg_temp.z66c_assert(:nb = 2 AND pg_temp.z66c_ordinals('26101353-3000-4000-8000-0000000000b1') = '0,2',
                           'B''s run did not store exactly B''s own record and source');

-- 7. With 0251: a record deleted AFTER the run completed takes its stored row with it.
DELETE FROM public.records WHERE id = '26101353-1000-4000-8000-0000000000a3';
SELECT pg_temp.z66c_assert(pg_temp.z66c_ordinals('26101353-3000-4000-8000-000000000002') = '0,4,5,6,7,8,10',
                           'deleting a record after completion did not remove its stored proposal');

-- 8. Rollback round trip: the down file brings back the old behaviour, applying again removes it.
SELECT pg_temp.z66c_ordinals('26101353-3000-4000-8000-000000000001') AS z66c_run1_before \gset
\ir ../migrations/rollback/0253_down.sql
SET LOCAL request.jwt.claim.sub = '26101353-0000-4000-8000-00000000000a';
SET LOCAL ROLE authenticated;
SELECT public.complete_reasoning_run('26101353-0000-4000-8000-00000000000a', '26101353-3000-4000-8000-000000000005', :'p_n5'::jsonb) AS n5 \gset
RESET ROLE;
SELECT pg_temp.z66c_assert(:n5 = 1 AND pg_temp.z66c_ordinals('26101353-3000-4000-8000-000000000005') = '0',
                           'after the down file the old function did not store the row (the down file is not 0092''s body)');
\ir ../migrations/0253_reasoning_complete_skips_erased.sql
-- The row the old function just stored for an erased record is what the gap between 0251 and 0253 can leave
-- behind. Applying 0253 removes it and closes its run; the live rows of the other runs are untouched.
SELECT pg_temp.z66c_assert(pg_temp.z66c_ordinals('26101353-3000-4000-8000-000000000005') = ''
                           AND (SELECT status FROM public.reasoning_runs WHERE id = '26101353-3000-4000-8000-000000000005') = 'ratified',
                           'applying 0253 left the row the old function stored for an erased record, or did not close its run');
SELECT pg_temp.z66c_assert(pg_temp.z66c_ordinals('26101353-3000-4000-8000-000000000001') = :'z66c_run1_before',
                           'the one-time cleanup of 0253 touched rows whose targets are live');
\ir ../migrations/0253_reasoning_complete_skips_erased.sql
SET LOCAL ROLE authenticated;
SELECT public.complete_reasoning_run('26101353-0000-4000-8000-00000000000a', '26101353-3000-4000-8000-000000000006', :'p_n6'::jsonb) AS n6 \gset
RESET ROLE;
SELECT pg_temp.z66c_assert(:n6 = 1 AND pg_temp.z66c_ordinals('26101353-3000-4000-8000-000000000006') = '1',
                           'applying 0253 again did not bring the target check back');
SELECT pg_temp.z66c_assert(has_function_privilege('authenticated', 'public.complete_reasoning_run(uuid, uuid, jsonb)', 'EXECUTE')
                           AND NOT has_function_privilege('anon', 'public.complete_reasoning_run(uuid, uuid, jsonb)', 'EXECUTE'),
                           'applying again changed who may call complete_reasoning_run');

-- 9. An owner that row security applies to. records is FORCE ROW LEVEL SECURITY, so an owner without
--    BYPASSRLS sees no record at all while it still sees its own run tables. Such an owner must store
--    everything, as 0092 did, instead of reading every target as erased and dropping a whole result.
SELECT jsonb_build_array(
    pg_temp.z66c_p('record', '26101353-1000-4000-8000-0000000000a2', 'a2 goes'),
    pg_temp.z66c_p('record', '26101353-1000-4000-8000-0000000000a1', 'a1 stays'))::text AS p_n7 \gset
CREATE ROLE z66c_plain_owner NOLOGIN NOBYPASSRLS;
GRANT USAGE ON SCHEMA public, auth TO z66c_plain_owner;
GRANT EXECUTE ON FUNCTION auth.uid() TO z66c_plain_owner;
GRANT SELECT, UPDATE ON public.records, public.sources TO z66c_plain_owner;
ALTER TABLE public.reasoning_runs OWNER TO z66c_plain_owner;
ALTER TABLE public.reasoning_run_proposals OWNER TO z66c_plain_owner;
ALTER FUNCTION public.complete_reasoning_run(uuid, uuid, jsonb) OWNER TO z66c_plain_owner;
-- Sight control: this owner really is blind to the caller's records, and row security is why.
SET LOCAL ROLE z66c_plain_owner;
SELECT (SELECT count(*) FROM public.records) AS owner_sees,
       pg_catalog.row_security_active('public.records'::regclass)::text AS owner_rls \gset
RESET ROLE;
SELECT pg_temp.z66c_assert(:owner_sees = 0 AND :'owner_rls' = 'true',
                           'the control owner can see records, so the next case would prove nothing');
SET LOCAL ROLE authenticated;
SELECT public.complete_reasoning_run('26101353-0000-4000-8000-00000000000a', '26101353-3000-4000-8000-000000000007', :'p_n7'::jsonb) AS n7 \gset
RESET ROLE;
SELECT pg_temp.z66c_assert(:n7 = 2 AND pg_temp.z66c_ordinals('26101353-3000-4000-8000-000000000007') = '0,1',
                           'an owner that cannot see records dropped proposals instead of storing them as before');

ROLLBACK;
