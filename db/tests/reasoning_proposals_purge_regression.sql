\set ON_ERROR_STOP on

-- Run only on the CI scratch database after numbered 0251.
-- Z66: a deleted record or source takes its reasoning proposal rows with it,
-- the run closes when no proposed row is left, and the one-time cleanup removes
-- only rows whose target is gone for the same owner.
BEGIN;

CREATE FUNCTION pg_temp.z66_assert(p_ok boolean, p_what text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'z66 regression failed: %', p_what;
  END IF;
END
$$;

CREATE FUNCTION pg_temp.z66_payload(p_kind text, p_ref text, p_title text) RETURNS jsonb
LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'key', p_kind || ':' || p_ref, 'refKind', p_kind, 'refId', p_ref, 'title', p_title,
    'meta', 'note', 'createdAt', '2026-10-13T00:00:00.000Z', 'icon', 'notes', 'domain', 'growth')
$$;

CREATE FUNCTION pg_temp.z66_row(p_run uuid, p_ordinal integer) RETURNS text
LANGUAGE sql AS $$
  SELECT status FROM public.reasoning_run_proposals WHERE run_id = p_run AND ordinal = p_ordinal
$$;

CREATE FUNCTION pg_temp.z66_run(p_run uuid) RETURNS text
LANGUAGE sql AS $$
  SELECT status FROM public.reasoning_runs WHERE id = p_run
$$;

-- The vanilla PostgreSQL auth stub lacks production trigger columns.
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users (id, email) VALUES
  ('26101351-0000-4000-8000-00000000000a', 'z66-a@example.com'),
  ('26101351-0000-4000-8000-00000000000b', 'z66-b@example.com'),
  ('26101351-0000-4000-8000-00000000000c', 'z66-c@example.com');
SET LOCAL session_replication_role = origin;
INSERT INTO public.users (id, email, birth_date, locale) VALUES
  ('26101351-0000-4000-8000-00000000000a', 'z66-a@example.com', DATE '1990-01-01', 'en'),
  ('26101351-0000-4000-8000-00000000000b', 'z66-b@example.com', DATE '1990-01-01', 'en'),
  ('26101351-0000-4000-8000-00000000000c', 'z66-c@example.com', DATE '1990-01-01', 'en');

INSERT INTO public.records (id, user_id, kind, body) VALUES
  ('26101351-1000-4000-8000-000000000001', '26101351-0000-4000-8000-00000000000a', 'note', 'a1'),
  ('26101351-1000-4000-8000-000000000002', '26101351-0000-4000-8000-00000000000a', 'note', 'a2'),
  ('26101351-1000-4000-8000-000000000003', '26101351-0000-4000-8000-00000000000a', 'note', 'a3'),
  ('26101351-1000-4000-8000-000000000004', '26101351-0000-4000-8000-00000000000a', 'note', 'a4'),
  ('26101351-1000-4000-8000-000000000005', '26101351-0000-4000-8000-00000000000a', 'note', 'a5'),
  ('26101351-1000-4000-8000-0000000000a6', '26101351-0000-4000-8000-00000000000a', 'note', 'a6'),
  ('26101351-1000-4000-8000-0000000000a7', '26101351-0000-4000-8000-00000000000a', 'note', 'a7'),
  ('26101351-1000-4000-8000-0000000000a8', '26101351-0000-4000-8000-00000000000a', 'note', 'a8'),
  ('26101351-1000-4000-8000-0000000000b1', '26101351-0000-4000-8000-00000000000b', 'note', 'b1'),
  ('26101351-1000-4000-8000-0000000000b2', '26101351-0000-4000-8000-00000000000b', 'note', 'b2'),
  ('26101351-1000-4000-8000-0000000000c1', '26101351-0000-4000-8000-00000000000c', 'note', 'c1');
INSERT INTO public.sources (id, user_id, kind, title, storage_path) VALUES
  ('26101351-2000-4000-8000-000000000001', '26101351-0000-4000-8000-00000000000a', 'article', 's1', 'raw/z66-s1.md'),
  ('26101351-2000-4000-8000-000000000002', '26101351-0000-4000-8000-00000000000a', 'article', 's2', 'raw/z66-s2.md');

INSERT INTO public.reasoning_runs (id, user_id, idempotency_key, trigger_kind, status, spend, week_bucket, month_bucket) VALUES
  ('26101351-3000-4000-8000-000000000001', '26101351-0000-4000-8000-00000000000a', 'z66-run-0001', 'auto', 'proposed', 'none', '2026-W42', '2026-10'),
  ('26101351-3000-4000-8000-000000000002', '26101351-0000-4000-8000-00000000000a', 'z66-run-0002', 'auto', 'proposed', 'none', '2026-W42', '2026-10'),
  ('26101351-3000-4000-8000-000000000003', '26101351-0000-4000-8000-00000000000a', 'z66-run-0003', 'auto', 'ratified', 'none', '2026-W42', '2026-10'),
  ('26101351-3000-4000-8000-000000000004', '26101351-0000-4000-8000-00000000000a', 'z66-run-0004', 'auto', 'proposed', 'none', '2026-W42', '2026-10'),
  ('26101351-3000-4000-8000-000000000005', '26101351-0000-4000-8000-00000000000a', 'z66-run-0005', 'auto', 'proposed', 'none', '2026-W42', '2026-10'),
  ('26101351-3000-4000-8000-000000000006', '26101351-0000-4000-8000-00000000000a', 'z66-run-0006', 'auto', 'proposed', 'none', '2026-W42', '2026-10'),
  ('26101351-3000-4000-8000-000000000012', '26101351-0000-4000-8000-00000000000a', 'z66-run-0012', 'auto', 'proposed', 'none', '2026-W42', '2026-10'),
  ('26101351-3000-4000-8000-000000000013', '26101351-0000-4000-8000-00000000000a', 'z66-run-0013', 'auto', 'proposed', 'none', '2026-W42', '2026-10'),
  ('26101351-3000-4000-8000-000000000014', '26101351-0000-4000-8000-00000000000a', 'z66-run-0014', 'auto', 'proposed', 'none', '2026-W42', '2026-10'),
  ('26101351-3000-4000-8000-0000000000b1', '26101351-0000-4000-8000-00000000000b', 'z66-run-00b1', 'auto', 'proposed', 'none', '2026-W42', '2026-10'),
  ('26101351-3000-4000-8000-0000000000b2', '26101351-0000-4000-8000-00000000000b', 'z66-run-00b2', 'auto', 'proposed', 'none', '2026-W42', '2026-10');

INSERT INTO public.reasoning_run_proposals (run_id, ordinal, payload, status) VALUES
  -- run 1: one row for the record that goes, one for a record that stays.
  ('26101351-3000-4000-8000-000000000001', 0, pg_temp.z66_payload('record', '26101351-1000-4000-8000-000000000001', 'a1'), 'proposed'),
  ('26101351-3000-4000-8000-000000000001', 1, pg_temp.z66_payload('record', '26101351-1000-4000-8000-000000000002', 'a2'), 'proposed'),
  -- run 2: its only row points at the record that goes.
  ('26101351-3000-4000-8000-000000000002', 0, pg_temp.z66_payload('record', '26101351-1000-4000-8000-000000000001', 'a1'), 'proposed'),
  -- run 3: already closed; an applied row is removed just the same.
  ('26101351-3000-4000-8000-000000000003', 0, pg_temp.z66_payload('record', '26101351-1000-4000-8000-000000000001', 'a1'), 'applied'),
  ('26101351-3000-4000-8000-000000000003', 1, pg_temp.z66_payload('record', '26101351-1000-4000-8000-000000000002', 'a2'), 'applied'),
  -- run 4: a source row, a record row that only shares the id text, a second source.
  ('26101351-3000-4000-8000-000000000004', 0, pg_temp.z66_payload('source', '26101351-2000-4000-8000-000000000001', 's1'), 'proposed'),
  ('26101351-3000-4000-8000-000000000004', 1, pg_temp.z66_payload('record', '26101351-2000-4000-8000-000000000001', 'same id text'), 'proposed'),
  ('26101351-3000-4000-8000-000000000004', 2, pg_temp.z66_payload('source', '26101351-2000-4000-8000-000000000002', 's2'), 'ratified'),
  -- run 5: every row belongs to records deleted by one statement.
  ('26101351-3000-4000-8000-000000000005', 0, pg_temp.z66_payload('record', '26101351-1000-4000-8000-000000000003', 'a3'), 'proposed'),
  ('26101351-3000-4000-8000-000000000005', 1, pg_temp.z66_payload('record', '26101351-1000-4000-8000-000000000004', 'a4'), 'proposed'),
  ('26101351-3000-4000-8000-000000000005', 2, pg_temp.z66_payload('record', '26101351-1000-4000-8000-000000000003', 'a3'), 'dismissed'),
  -- run 6: a ratified row waiting to be applied goes; nothing proposed remains.
  ('26101351-3000-4000-8000-000000000006', 0, pg_temp.z66_payload('record', '26101351-1000-4000-8000-000000000001', 'a1'), 'ratified'),
  ('26101351-3000-4000-8000-000000000006', 1, pg_temp.z66_payload('record', '26101351-1000-4000-8000-000000000002', 'a2'), 'dismissed'),
  -- run 12 and B's second run: each has its own record and the other owner's,
  -- and one statement deletes both records.
  ('26101351-3000-4000-8000-000000000012', 0, pg_temp.z66_payload('record', '26101351-1000-4000-8000-000000000005', 'a5'), 'proposed'),
  ('26101351-3000-4000-8000-000000000012', 1, pg_temp.z66_payload('record', '26101351-1000-4000-8000-0000000000b2', 'not mine'), 'proposed'),
  ('26101351-3000-4000-8000-0000000000b2', 0, pg_temp.z66_payload('record', '26101351-1000-4000-8000-0000000000b2', 'b2'), 'proposed'),
  ('26101351-3000-4000-8000-0000000000b2', 1, pg_temp.z66_payload('record', '26101351-1000-4000-8000-000000000005', 'not mine'), 'proposed'),
  -- run 13: the client writes refId and the server stores it unchecked, so it can be any text.
  -- Upper case and braces are the same uuid. Anything that is not the 8-4-4-4-12 shape is not judged.
  ('26101351-3000-4000-8000-000000000013', 0, pg_temp.z66_payload('record', upper('26101351-1000-4000-8000-0000000000a6'), 'upper case'), 'proposed'),
  ('26101351-3000-4000-8000-000000000013', 1, pg_temp.z66_payload('record', '{26101351-1000-4000-8000-0000000000a6}', 'braces'), 'proposed'),
  ('26101351-3000-4000-8000-000000000013', 2, pg_temp.z66_payload('record', upper('26101351-1000-4000-8000-0000000000a7'), 'upper case, live'), 'proposed'),
  ('26101351-3000-4000-8000-000000000013', 3, pg_temp.z66_payload('record', 'not-a-uuid', 'free text'), 'proposed'),
  ('26101351-3000-4000-8000-000000000013', 4, pg_temp.z66_payload('record', (SELECT string_agg(md5(i::text), '') FROM generate_series(1, 400) AS i), 'very long'), 'proposed'),
  ('26101351-3000-4000-8000-000000000013', 5, pg_temp.z66_payload('record', '{26101351-1000-4000-8000-0000000000a6', 'one brace'), 'proposed'),
  ('26101351-3000-4000-8000-000000000013', 6, pg_temp.z66_payload('record', '261013511000400080000000000000a6', 'no hyphens'), 'proposed'),
  -- run 14: used for the rollback round trip at the end.
  ('26101351-3000-4000-8000-000000000014', 0, pg_temp.z66_payload('record', '26101351-1000-4000-8000-0000000000a8', 'a8'), 'proposed'),
  -- B's run: one row names A's record id, one names B's own record.
  ('26101351-3000-4000-8000-0000000000b1', 0, pg_temp.z66_payload('record', '26101351-1000-4000-8000-000000000001', 'not mine'), 'proposed'),
  ('26101351-3000-4000-8000-0000000000b1', 1, pg_temp.z66_payload('record', '26101351-1000-4000-8000-0000000000b1', 'b1'), 'proposed');

-- The function is not callable by any API role, and the trigger still fires for them.
DO $acl$
DECLARE
  v_acl aclitem[];
BEGIN
  SELECT p.proacl INTO v_acl FROM pg_catalog.pg_proc p
   WHERE p.oid = 'public.purge_reasoning_proposals_of_erased()'::regprocedure;
  PERFORM pg_temp.z66_assert(v_acl IS NOT NULL, 'function ACL is still the default (PUBLIC can execute)');
  PERFORM pg_temp.z66_assert(NOT EXISTS (
    SELECT 1 FROM pg_catalog.aclexplode(v_acl) a
      LEFT JOIN pg_catalog.pg_roles r ON r.oid = a.grantee
     WHERE a.privilege_type = 'EXECUTE'
       AND (a.grantee = 0 OR r.rolname IN ('anon', 'authenticated', 'service_role'))),
    'an API role or PUBLIC can execute the trigger function');
  PERFORM pg_temp.z66_assert((SELECT count(*) = 2 FROM pg_catalog.pg_trigger t
    WHERE t.tgname = 'purge_reasoning_proposals' AND NOT t.tgisinternal
      AND t.tgrelid IN ('public.records'::regclass, 'public.sources'::regclass)),
    'the trigger is not on both records and sources');
END
$acl$;

-- The scratch database has no Supabase table-privilege floor; production grants
-- these to `authenticated` by default. Nothing is granted on the reasoning
-- tables, so every row the deletes below remove is removed by the trigger.
GRANT SELECT, DELETE ON public.records, public.sources TO authenticated;
SELECT pg_temp.z66_assert(NOT has_table_privilege('authenticated', 'public.reasoning_run_proposals', 'DELETE')
                          AND NOT has_table_privilege('authenticated', 'public.reasoning_runs', 'UPDATE'),
                          'the signed-in role can write the reasoning tables directly');

-- 1. The owner deletes one record through RLS, as the app does.
SET LOCAL request.jwt.claim.sub = '26101351-0000-4000-8000-00000000000a';
SET LOCAL ROLE authenticated;
DELETE FROM public.records WHERE id = '26101351-1000-4000-8000-000000000001';
RESET ROLE;

SELECT pg_temp.z66_assert(NOT EXISTS (SELECT 1 FROM public.records WHERE id = '26101351-1000-4000-8000-000000000001'), 'the record was not deleted');
SELECT pg_temp.z66_assert(pg_temp.z66_row('26101351-3000-4000-8000-000000000001', 0) IS NULL, 'run 1 kept the row of the deleted record');
SELECT pg_temp.z66_assert(pg_temp.z66_row('26101351-3000-4000-8000-000000000001', 1) = 'proposed', 'run 1 lost the row of a live record');
SELECT pg_temp.z66_assert(pg_temp.z66_run('26101351-3000-4000-8000-000000000001') = 'proposed', 'run 1 closed while a proposed row remains');
SELECT pg_temp.z66_assert(pg_temp.z66_row('26101351-3000-4000-8000-000000000002', 0) IS NULL, 'run 2 kept the row of the deleted record');
SELECT pg_temp.z66_assert(pg_temp.z66_run('26101351-3000-4000-8000-000000000002') = 'ratified', 'run 2 stayed open with no proposed row');
SELECT pg_temp.z66_assert(pg_temp.z66_row('26101351-3000-4000-8000-000000000003', 0) IS NULL, 'run 3 kept an applied row of the deleted record');
SELECT pg_temp.z66_assert(pg_temp.z66_row('26101351-3000-4000-8000-000000000003', 1) = 'applied', 'run 3 lost an applied row of a live record');
SELECT pg_temp.z66_assert(pg_temp.z66_run('26101351-3000-4000-8000-000000000003') = 'ratified', 'run 3 changed state');
SELECT pg_temp.z66_assert(pg_temp.z66_row('26101351-3000-4000-8000-000000000006', 0) IS NULL, 'run 6 kept a ratified row of the deleted record');
SELECT pg_temp.z66_assert(pg_temp.z66_row('26101351-3000-4000-8000-000000000006', 1) = 'dismissed', 'run 6 lost a dismissed row of a live record');
SELECT pg_temp.z66_assert(pg_temp.z66_run('26101351-3000-4000-8000-000000000006') = 'ratified', 'run 6 stayed open with no proposed row');
-- Another owner's row that names the same id is not this owner's to remove.
SELECT pg_temp.z66_assert(pg_temp.z66_row('26101351-3000-4000-8000-0000000000b1', 0) = 'proposed', 'another owner''s row was removed');
SELECT pg_temp.z66_assert(pg_temp.z66_run('26101351-3000-4000-8000-0000000000b1') = 'proposed', 'another owner''s run changed state');
-- Source rows and the unrelated runs are untouched by a record delete.
SELECT pg_temp.z66_assert((SELECT count(*) = 3 FROM public.reasoning_run_proposals WHERE run_id = '26101351-3000-4000-8000-000000000004'), 'a record delete touched run 4');
SELECT pg_temp.z66_assert((SELECT count(*) = 3 FROM public.reasoning_run_proposals WHERE run_id = '26101351-3000-4000-8000-000000000005'), 'a record delete touched run 5');

-- 2. The owner deletes a source: only source rows with that id go.
SET LOCAL ROLE authenticated;
DELETE FROM public.sources WHERE id = '26101351-2000-4000-8000-000000000001';
RESET ROLE;

SELECT pg_temp.z66_assert(NOT EXISTS (SELECT 1 FROM public.sources WHERE id = '26101351-2000-4000-8000-000000000001'), 'the source was not deleted');
SELECT pg_temp.z66_assert(pg_temp.z66_row('26101351-3000-4000-8000-000000000004', 0) IS NULL, 'run 4 kept the row of the deleted source');
SELECT pg_temp.z66_assert(pg_temp.z66_row('26101351-3000-4000-8000-000000000004', 1) = 'proposed', 'a record row was removed by a source delete');
SELECT pg_temp.z66_assert(pg_temp.z66_row('26101351-3000-4000-8000-000000000004', 2) = 'ratified', 'run 4 lost the row of a live source');
SELECT pg_temp.z66_assert(pg_temp.z66_run('26101351-3000-4000-8000-000000000004') = 'proposed', 'run 4 closed while a proposed row remains');

-- 3. One statement deletes two records: every row goes and the run closes once.
SET LOCAL ROLE authenticated;
DELETE FROM public.records
 WHERE id IN ('26101351-1000-4000-8000-000000000003', '26101351-1000-4000-8000-000000000004');
RESET ROLE;

SELECT pg_temp.z66_assert((SELECT count(*) = 0 FROM public.reasoning_run_proposals WHERE run_id = '26101351-3000-4000-8000-000000000005'), 'run 5 kept rows after a two-record delete');
SELECT pg_temp.z66_assert(pg_temp.z66_run('26101351-3000-4000-8000-000000000005') = 'ratified', 'run 5 stayed open with no rows');

-- Run rows are never removed: the paid-entitlement meter counts them.
-- 3b. The same uuid written in upper case or in braces is the same record. Text
--     that is not a uuid is left alone, and it does not make the delete fail.
SELECT pg_temp.z66_assert((SELECT length(payload->>'refId') = 12800 FROM public.reasoning_run_proposals
                            WHERE run_id = '26101351-3000-4000-8000-000000000013' AND ordinal = 4), 'the long refId fixture is not long');
SET LOCAL ROLE authenticated;
DELETE FROM public.records WHERE id = '26101351-1000-4000-8000-0000000000a6';
RESET ROLE;
SELECT pg_temp.z66_assert(NOT EXISTS (SELECT 1 FROM public.records WHERE id = '26101351-1000-4000-8000-0000000000a6'), 'record a6 was not deleted');
SELECT pg_temp.z66_assert(pg_temp.z66_row('26101351-3000-4000-8000-000000000013', 0) IS NULL, 'an upper-case refId row survived its record');
SELECT pg_temp.z66_assert(pg_temp.z66_row('26101351-3000-4000-8000-000000000013', 1) IS NULL, 'a braced refId row survived its record');
SELECT pg_temp.z66_assert((SELECT count(*) = 5 FROM public.reasoning_run_proposals
                            WHERE run_id = '26101351-3000-4000-8000-000000000013' AND ordinal IN (2, 3, 4, 5, 6)), 'a row that is not this record was removed');
SELECT pg_temp.z66_assert(pg_temp.z66_run('26101351-3000-4000-8000-000000000013') = 'proposed', 'run 13 closed while proposed rows remain');

SELECT pg_temp.z66_assert((SELECT count(*) = 9 FROM public.reasoning_runs WHERE user_id = '26101351-0000-4000-8000-00000000000a'), 'a run row was removed');

-- From here on nobody is signed in: service paths and cascades delete with no auth.uid().
SELECT pg_catalog.set_config('request.jwt.claim.sub', '', true);
SELECT pg_temp.z66_assert(auth.uid() IS NULL, 'a user is still signed in for the service-path steps');

-- 4. One statement deletes records of two owners (service paths can). Each
--    owner loses only the row that names their own record.
DELETE FROM public.records
 WHERE id IN ('26101351-1000-4000-8000-000000000005', '26101351-1000-4000-8000-0000000000b2');
SELECT pg_temp.z66_assert(pg_temp.z66_row('26101351-3000-4000-8000-000000000012', 0) IS NULL, 'run 12 kept the row of its owner''s deleted record');
SELECT pg_temp.z66_assert(pg_temp.z66_row('26101351-3000-4000-8000-000000000012', 1) = 'proposed', 'run 12 lost a row naming another owner''s record');
SELECT pg_temp.z66_assert(pg_temp.z66_row('26101351-3000-4000-8000-0000000000b2', 0) IS NULL, 'B''s second run kept the row of its owner''s deleted record');
SELECT pg_temp.z66_assert(pg_temp.z66_row('26101351-3000-4000-8000-0000000000b2', 1) = 'proposed', 'B''s second run lost a row naming another owner''s record');

-- 5. A delete that reaches records without a signed-in user (service paths, cascades).
DELETE FROM public.records WHERE user_id = '26101351-0000-4000-8000-00000000000b';
SELECT pg_temp.z66_assert(pg_temp.z66_row('26101351-3000-4000-8000-0000000000b1', 1) IS NULL, 'a delete without a signed-in user kept the row');
SELECT pg_temp.z66_assert(pg_temp.z66_row('26101351-3000-4000-8000-0000000000b1', 0) = 'proposed', 'the row naming another owner''s id was removed');
SELECT pg_temp.z66_assert(pg_temp.z66_run('26101351-3000-4000-8000-0000000000b1') = 'proposed', 'B''s run closed while a proposed row remains');

-- 6. The one-time cleanup, replayed over rows shaped like the ones left behind
--    before the trigger existed.
INSERT INTO public.reasoning_runs (id, user_id, idempotency_key, trigger_kind, status, spend, week_bucket, month_bucket) VALUES
  ('26101351-3000-4000-8000-000000000007', '26101351-0000-4000-8000-00000000000a', 'z66-run-0007', 'auto', 'proposed', 'none', '2026-W42', '2026-10'),
  ('26101351-3000-4000-8000-000000000008', '26101351-0000-4000-8000-00000000000a', 'z66-run-0008', 'auto', 'proposed', 'none', '2026-W42', '2026-10'),
  ('26101351-3000-4000-8000-000000000009', '26101351-0000-4000-8000-00000000000a', 'z66-run-0009', 'auto', 'proposed', 'none', '2026-W42', '2026-10'),
  ('26101351-3000-4000-8000-000000000010', '26101351-0000-4000-8000-00000000000a', 'z66-run-0010', 'auto', 'proposed', 'none', '2026-W42', '2026-10'),
  ('26101351-3000-4000-8000-000000000011', '26101351-0000-4000-8000-00000000000a', 'z66-run-0011', 'auto', 'proposed', 'none', '2026-W42', '2026-10');
INSERT INTO public.reasoning_run_proposals (run_id, ordinal, payload, status) VALUES
  -- run 7: a row whose record never existed, next to a live one.
  ('26101351-3000-4000-8000-000000000007', 0, pg_temp.z66_payload('record', '26101351-1000-4000-8000-0000000000ff', 'left behind'), 'proposed'),
  ('26101351-3000-4000-8000-000000000007', 1, pg_temp.z66_payload('record', '26101351-1000-4000-8000-000000000002', 'live title'), 'proposed'),
  -- run 8: only an applied row whose source never existed.
  ('26101351-3000-4000-8000-000000000008', 0, pg_temp.z66_payload('source', '26101351-2000-4000-8000-0000000000ff', 'left behind'), 'applied'),
  -- run 9 has no rows at all and is none of the cleanup's business.
  -- run 10: shapes the cleanup does not judge (unknown kind, missing refId).
  ('26101351-3000-4000-8000-000000000010', 0, jsonb_build_object('refKind', 'other', 'refId', 'x', 'title', 'unknown kind'), 'proposed'),
  ('26101351-3000-4000-8000-000000000010', 1, jsonb_build_object('refKind', 'record', 'title', 'no ref id'), 'proposed'),
  -- run 11: the id is a real record, but it belongs to another owner.
  ('26101351-3000-4000-8000-000000000011', 0, pg_temp.z66_payload('record', '26101351-1000-4000-8000-0000000000c1', 'not mine'), 'proposed');

\ir ../migrations/0251_reasoning_proposals_purge.sql

SELECT pg_temp.z66_assert(pg_temp.z66_row('26101351-3000-4000-8000-000000000007', 0) IS NULL, 'cleanup kept a row whose record is gone');
SELECT pg_temp.z66_assert(pg_temp.z66_row('26101351-3000-4000-8000-000000000007', 1) = 'proposed', 'cleanup removed a row whose record is live');
SELECT pg_temp.z66_assert(pg_temp.z66_run('26101351-3000-4000-8000-000000000007') = 'proposed', 'cleanup closed run 7 while a proposed row remains');
SELECT pg_temp.z66_assert(pg_temp.z66_row('26101351-3000-4000-8000-000000000008', 0) IS NULL, 'cleanup kept an applied row whose source is gone');
SELECT pg_temp.z66_assert(pg_temp.z66_run('26101351-3000-4000-8000-000000000008') = 'ratified', 'cleanup left run 8 open with no rows');
SELECT pg_temp.z66_assert(pg_temp.z66_run('26101351-3000-4000-8000-000000000009') = 'proposed', 'cleanup closed a run it removed nothing from');
SELECT pg_temp.z66_assert((SELECT count(*) = 2 FROM public.reasoning_run_proposals WHERE run_id = '26101351-3000-4000-8000-000000000010'), 'cleanup removed a row it does not judge');
SELECT pg_temp.z66_assert(pg_temp.z66_run('26101351-3000-4000-8000-000000000010') = 'proposed', 'cleanup closed run 10');
SELECT pg_temp.z66_assert(pg_temp.z66_row('26101351-3000-4000-8000-000000000011', 0) IS NULL, 'cleanup kept a row naming another owner''s record');
SELECT pg_temp.z66_assert(pg_temp.z66_run('26101351-3000-4000-8000-000000000011') = 'ratified', 'cleanup left run 11 open with no rows');
-- B's leftover row (it names an id B never owned) is an orphan too.
SELECT pg_temp.z66_assert(pg_temp.z66_row('26101351-3000-4000-8000-0000000000b1', 0) IS NULL, 'cleanup kept B''s row whose target B does not own');
SELECT pg_temp.z66_assert(pg_temp.z66_run('26101351-3000-4000-8000-0000000000b1') = 'ratified', 'cleanup left B''s run open with no rows');
-- Run 13: the upper-case row of a live record stays, and so does every row that is not a uuid.
SELECT pg_temp.z66_assert(pg_temp.z66_row('26101351-3000-4000-8000-000000000013', 2) = 'proposed', 'cleanup removed an upper-case refId row whose record is live');
SELECT pg_temp.z66_assert((SELECT count(*) = 4 FROM public.reasoning_run_proposals
                            WHERE run_id = '26101351-3000-4000-8000-000000000013' AND ordinal IN (3, 4, 5, 6)), 'cleanup removed a row whose refId is not a uuid');
SELECT pg_temp.z66_assert(pg_temp.z66_run('26101351-3000-4000-8000-000000000013') = 'proposed', 'cleanup closed run 13');
-- Rows with a live target stay, and no row keeps a title.
SELECT pg_temp.z66_assert(pg_temp.z66_row('26101351-3000-4000-8000-000000000001', 1) = 'proposed', 'cleanup removed run 1''s live row');
SELECT pg_temp.z66_assert(pg_temp.z66_row('26101351-3000-4000-8000-000000000003', 1) = 'applied', 'cleanup removed run 3''s live row');
SELECT pg_temp.z66_assert(pg_temp.z66_row('26101351-3000-4000-8000-000000000004', 2) = 'ratified', 'cleanup removed run 4''s live source row');
SELECT pg_temp.z66_assert((SELECT count(*) = 0 FROM public.reasoning_run_proposals WHERE payload -> 'title' IS NOT NULL), 'a title is still stored');
SELECT pg_temp.z66_assert((SELECT payload->>'refId' = '26101351-1000-4000-8000-000000000002' AND payload->>'refKind' = 'record'
                              AND payload->>'domain' = 'growth' AND payload->>'key' = 'record:26101351-1000-4000-8000-000000000002'
                             FROM public.reasoning_run_proposals
                            WHERE run_id = '26101351-3000-4000-8000-000000000007' AND ordinal = 1), 'clearing the title changed another payload field');

-- Replaying it again changes nothing.
CREATE TEMP TABLE z66_before ON COMMIT DROP AS
  SELECT (SELECT count(*) FROM public.reasoning_run_proposals) AS rows_left,
         (SELECT count(*) FROM public.reasoning_runs WHERE status = 'ratified') AS runs_closed;

\ir ../migrations/0251_reasoning_proposals_purge.sql

SELECT pg_temp.z66_assert((SELECT b.rows_left = (SELECT count(*) FROM public.reasoning_run_proposals)
                              AND b.runs_closed = (SELECT count(*) FROM public.reasoning_runs WHERE status = 'ratified')
                             FROM z66_before b), 'a second replay changed rows or runs');
SELECT pg_temp.z66_assert((SELECT count(*) = 2 FROM pg_catalog.pg_trigger t
  WHERE t.tgname = 'purge_reasoning_proposals' AND NOT t.tgisinternal), 'replay left the wrong number of triggers');

-- 7. Rollback round trip: the down file takes the behaviour away, and applying again brings it back.
\ir ../migrations/rollback/0251_down.sql

SELECT pg_temp.z66_assert((SELECT count(*) = 0 FROM pg_catalog.pg_trigger t WHERE t.tgname = 'purge_reasoning_proposals' AND NOT t.tgisinternal)
                          AND (SELECT count(*) = 0 FROM pg_catalog.pg_proc p WHERE p.proname = 'purge_reasoning_proposals_of_erased'),
                          'the down file left a trigger or the function behind');
DELETE FROM public.records WHERE id = '26101351-1000-4000-8000-0000000000a8';
SELECT pg_temp.z66_assert(pg_temp.z66_row('26101351-3000-4000-8000-000000000014', 0) = 'proposed', 'after the down file a delete still removed the row');

\ir ../migrations/0251_reasoning_proposals_purge.sql

SELECT pg_temp.z66_assert(pg_temp.z66_row('26101351-3000-4000-8000-000000000014', 0) IS NULL, 'applying again did not clean up the row left behind');
SELECT pg_temp.z66_assert(pg_temp.z66_run('26101351-3000-4000-8000-000000000014') = 'ratified', 'applying again left run 14 open with no rows');
SELECT pg_temp.z66_assert((SELECT count(*) = 2 FROM pg_catalog.pg_trigger t WHERE t.tgname = 'purge_reasoning_proposals' AND NOT t.tgisinternal), 'applying again did not restore both triggers');

ROLLBACK;
