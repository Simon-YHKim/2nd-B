\set ON_ERROR_STOP on

-- Run only on a throwaway clone of the CI scratch database (the workflow step creates and drops it).
-- 0256 waits for other transactions and refuses to run in the transaction that replaced the function, so
-- unlike the other regressions this file COMMITS what it does. The in-flight order (an old call that is
-- still open when 0256 starts) is the workflow's race step, not this file.

CREATE FUNCTION pg_temp.z66d_assert(p_ok boolean, p_what text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'z66d regression failed: %', p_what;
  END IF;
END
$$;

CREATE FUNCTION pg_temp.z66d_p(p_kind text, p_ref text, p_title text) RETURNS jsonb
LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'key', p_kind || ':' || p_ref, 'refKind', p_kind, 'refId', p_ref, 'title', p_title,
    'meta', 'note', 'createdAt', '2026-10-14T00:00:00.000Z', 'icon', 'notes', 'domain', 'growth')
$$;

-- 'ordinals/status' of a run, as text: '1,3,4/proposed'.
CREATE FUNCTION pg_temp.z66d_run(p_run uuid) RETURNS text
LANGUAGE sql AS $$
  SELECT COALESCE((SELECT string_agg(ordinal::text, ',' ORDER BY ordinal)
                     FROM public.reasoning_run_proposals WHERE run_id = p_run), '')
         || '/' || (SELECT status FROM public.reasoning_runs WHERE id = p_run)
$$;

-- The vanilla PostgreSQL auth stub lacks production trigger columns.
SET session_replication_role = replica;
INSERT INTO auth.users (id, email) VALUES
  ('26101456-0000-4000-8000-00000000000a', 'z66d-a@example.com'),
  ('26101456-0000-4000-8000-00000000000b', 'z66d-b@example.com');
SET session_replication_role = origin;
INSERT INTO public.users (id, email, birth_date, locale) VALUES
  ('26101456-0000-4000-8000-00000000000a', 'z66d-a@example.com', DATE '1990-01-01', 'en'),
  ('26101456-0000-4000-8000-00000000000b', 'z66d-b@example.com', DATE '1990-01-01', 'en');

INSERT INTO public.records (id, user_id, kind, body) VALUES
  ('26101456-1000-4000-8000-0000000000a1', '26101456-0000-4000-8000-00000000000a', 'note', 'a1 stays'),
  ('26101456-1000-4000-8000-0000000000a2', '26101456-0000-4000-8000-00000000000a', 'note', 'a2 goes'),
  ('26101456-1000-4000-8000-0000000000b1', '26101456-0000-4000-8000-00000000000b', 'note', 'b1 is B''s');
INSERT INTO public.sources (id, user_id, kind, title, storage_path) VALUES
  ('26101456-2000-4000-8000-0000000000a1', '26101456-0000-4000-8000-00000000000a', 'article', 's1 stays', 'raw/z66d-s1.md'),
  ('26101456-2000-4000-8000-0000000000a2', '26101456-0000-4000-8000-00000000000a', 'article', 's2 goes', 'raw/z66d-s2.md');

INSERT INTO public.reasoning_runs (id, user_id, idempotency_key, trigger_kind, status, spend, week_bucket, month_bucket) VALUES
  ('26101456-3000-4000-8000-000000000001', '26101456-0000-4000-8000-00000000000a', 'z66d-run-0001', 'auto', 'running', 'none', '2026-W42', '2026-10'),
  ('26101456-3000-4000-8000-000000000002', '26101456-0000-4000-8000-00000000000a', 'z66d-run-0002', 'auto', 'running', 'none', '2026-W42', '2026-10'),
  ('26101456-3000-4000-8000-000000000003', '26101456-0000-4000-8000-00000000000a', 'z66d-run-0003', 'auto', 'running', 'none', '2026-W42', '2026-10'),
  ('26101456-3000-4000-8000-0000000000b1', '26101456-0000-4000-8000-00000000000b', 'z66d-run-00b1', 'auto', 'running', 'none', '2026-W42', '2026-10');

-- Run 1: an erased record, a live record, an erased source, a refId that is no uuid, a kind it does not judge.
SELECT jsonb_build_array(
    pg_temp.z66d_p('record', '26101456-1000-4000-8000-0000000000a2', 'a2 goes'),
    pg_temp.z66d_p('record', '26101456-1000-4000-8000-0000000000a1', 'a1 stays'),
    pg_temp.z66d_p('source', '26101456-2000-4000-8000-0000000000a2', 's2 goes'),
    pg_temp.z66d_p('record', 'not-a-uuid', 'cannot be read'),
    pg_temp.z66d_p('note', '26101456-1000-4000-8000-0000000000a2', 'another kind'))::text AS p_run1,
  jsonb_build_array(
    pg_temp.z66d_p('record', '26101456-1000-4000-8000-0000000000a2', 'a2 goes'))::text AS p_run2,
  jsonb_build_array(
    pg_temp.z66d_p('record', '26101456-1000-4000-8000-0000000000a1', 'a1 stays'),
    pg_temp.z66d_p('source', '26101456-2000-4000-8000-0000000000a1', 's1 stays'))::text AS p_run3,
  jsonb_build_array(
    pg_temp.z66d_p('record', '26101456-1000-4000-8000-0000000000a1', 'A''s record, named by B'),
    pg_temp.z66d_p('record', '26101456-1000-4000-8000-0000000000b1', 'b1 is B''s'))::text AS p_runb \gset

-- The state 0256 exists for: the OLD function, and targets erased while the runs were still working.
\ir ../migrations/rollback/0253_down.sql
DELETE FROM public.records WHERE id = '26101456-1000-4000-8000-0000000000a2';
DELETE FROM public.sources WHERE id = '26101456-2000-4000-8000-0000000000a2';
BEGIN;
SET LOCAL request.jwt.claim.sub = '26101456-0000-4000-8000-00000000000a';
SET LOCAL ROLE authenticated;
SELECT public.complete_reasoning_run('26101456-0000-4000-8000-00000000000a', '26101456-3000-4000-8000-000000000001', :'p_run1'::jsonb);
SELECT public.complete_reasoning_run('26101456-0000-4000-8000-00000000000a', '26101456-3000-4000-8000-000000000002', :'p_run2'::jsonb);
SELECT public.complete_reasoning_run('26101456-0000-4000-8000-00000000000a', '26101456-3000-4000-8000-000000000003', :'p_run3'::jsonb);
COMMIT;
BEGIN;
SET LOCAL request.jwt.claim.sub = '26101456-0000-4000-8000-00000000000b';
SET LOCAL ROLE authenticated;
SELECT public.complete_reasoning_run('26101456-0000-4000-8000-00000000000b', '26101456-3000-4000-8000-0000000000b1', :'p_runb'::jsonb);
COMMIT;
SELECT pg_temp.z66d_assert(pg_temp.z66d_run('26101456-3000-4000-8000-000000000001') = '0,1,2,3,4/proposed'
                           AND pg_temp.z66d_run('26101456-3000-4000-8000-000000000002') = '0/proposed'
                           AND pg_temp.z66d_run('26101456-3000-4000-8000-000000000003') = '0,1/proposed'
                           AND pg_temp.z66d_run('26101456-3000-4000-8000-0000000000b1') = '0,1/proposed',
                           'the old function did not store the rows this file is about (sight control)');

-- 1. Refused while the function is still the old one. Nothing is removed.
\set ON_ERROR_STOP off
\ir ../migrations/0256_reasoning_orphan_proposals_cleanup.sql
\set z66d_state :SQLSTATE
\set z66d_message :LAST_ERROR_MESSAGE
\set ON_ERROR_STOP on
SELECT pg_temp.z66d_assert(:'z66d_state' = '55000' AND :'z66d_message' LIKE '%is not the 0253 body%',
                           '0256 ran although complete_reasoning_run was still the old body');
SELECT pg_temp.z66d_assert(pg_temp.z66d_run('26101456-3000-4000-8000-000000000002') = '0/proposed',
                           'a refused 0256 (old function) removed a row');

-- The first stage, committed on its own. It replaces the function and changes no row.
\ir ../migrations/0253_reasoning_complete_skips_erased.sql
SELECT pg_temp.z66d_assert(pg_temp.z66d_run('26101456-3000-4000-8000-000000000001') = '0,1,2,3,4/proposed'
                           AND pg_temp.z66d_run('26101456-3000-4000-8000-000000000002') = '0/proposed',
                           '0253 changed stored rows (the cleanup belongs to 0256)');

-- 2. Refused in a transaction whose snapshot would not show rows committed while it waits.
BEGIN ISOLATION LEVEL REPEATABLE READ;
\set ON_ERROR_STOP off
\ir ../migrations/0256_reasoning_orphan_proposals_cleanup.sql
\set z66d_state :SQLSTATE
\set z66d_message :LAST_ERROR_MESSAGE
\set ON_ERROR_STOP on
ROLLBACK;
SELECT pg_temp.z66d_assert(:'z66d_state' = '25001' AND :'z66d_message' LIKE '%must run READ COMMITTED%',
                           '0256 ran in a REPEATABLE READ transaction');

-- 3. Refused for a role that row security hides records from: it would read every target as erased.
--    A role outlives the clone (roles belong to the cluster), so it is dropped again right after the case.
DROP ROLE IF EXISTS z66d_plain;
CREATE ROLE z66d_plain NOLOGIN NOBYPASSRLS;
GRANT USAGE ON SCHEMA public TO z66d_plain;
GRANT SELECT ON public.records, public.sources TO z66d_plain;
SET ROLE z66d_plain;
SELECT pg_catalog.row_security_active('public.records'::regclass)::text AS z66d_blind \gset
\set ON_ERROR_STOP off
\ir ../migrations/0256_reasoning_orphan_proposals_cleanup.sql
\set z66d_state :SQLSTATE
\set z66d_message :LAST_ERROR_MESSAGE
\set ON_ERROR_STOP on
RESET ROLE;
REVOKE SELECT ON public.records, public.sources FROM z66d_plain;
REVOKE USAGE ON SCHEMA public FROM z66d_plain;
DROP ROLE z66d_plain;
SELECT pg_temp.z66d_assert(:'z66d_blind' = 'true',
                           'the control role is not under row security, so the next check would prove nothing');
SELECT pg_temp.z66d_assert(:'z66d_state' = '42501' AND :'z66d_message' LIKE '%row security is active%',
                           '0256 ran for a role that cannot see records');
SELECT pg_temp.z66d_assert(pg_temp.z66d_run('26101456-3000-4000-8000-000000000001') = '0,1,2,3,4/proposed'
                           AND pg_temp.z66d_run('26101456-3000-4000-8000-000000000002') = '0/proposed',
                           'a refused 0256 removed a row');

-- 4. The second stage in its own transaction. Gone: the rows whose target that owner no longer has
--    (A's erased record and source; A's record named by B). Kept: live targets, the refId it cannot
--    read, the kind it does not judge. A run left with no pending row is closed; the others are not.
\ir ../migrations/0256_reasoning_orphan_proposals_cleanup.sql
SELECT pg_temp.z66d_assert(:'SQLSTATE' = '00000', '0256 failed on its own transaction');
SELECT pg_temp.z66d_assert(pg_temp.z66d_run('26101456-3000-4000-8000-000000000001') = '1,3,4/proposed',
                           'run 1 did not keep exactly the live, unreadable and unjudged rows');
SELECT pg_temp.z66d_assert(pg_temp.z66d_run('26101456-3000-4000-8000-000000000002') = '/ratified',
                           'a run emptied by the cleanup was not closed');
SELECT pg_temp.z66d_assert(pg_temp.z66d_run('26101456-3000-4000-8000-000000000003') = '0,1/proposed',
                           'the cleanup touched a run whose targets are all live');
SELECT pg_temp.z66d_assert(pg_temp.z66d_run('26101456-3000-4000-8000-0000000000b1') = '1/proposed',
                           'B kept a row for a record that is not B''s, or lost B''s own');
SELECT pg_temp.z66d_assert((SELECT count(*) FROM public.records) = 2 AND (SELECT count(*) FROM public.sources) = 1,
                           'the cleanup changed records or sources');

-- 5. Again: nothing left to remove, nothing changes.
\ir ../migrations/0256_reasoning_orphan_proposals_cleanup.sql
SELECT pg_temp.z66d_assert(:'SQLSTATE' = '00000', '0256 failed when run a second time');
SELECT pg_temp.z66d_assert(pg_temp.z66d_run('26101456-3000-4000-8000-000000000001') = '1,3,4/proposed'
                           AND pg_temp.z66d_run('26101456-3000-4000-8000-000000000002') = '/ratified'
                           AND pg_temp.z66d_run('26101456-3000-4000-8000-000000000003') = '0,1/proposed'
                           AND pg_temp.z66d_run('26101456-3000-4000-8000-0000000000b1') = '1/proposed',
                           'running 0256 again changed something');
