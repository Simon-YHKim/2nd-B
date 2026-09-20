-- db/tests/erasure_registry_regression.sql
--
-- Behavioural regression for public.erase_my_data() and public.erasure_registry
-- (0189). Run by .github/workflows/supabase-dry-run.yml against the job-local
-- scratch database, after the staged 0147+ migrations are applied.
--
-- WHY THIS FILE EXISTS. The r38 artifact gate counted 37 passing tests for this
-- feature and found that every one of them reads SQL *text*. The migration
-- test's own header claimed "behaviour is exercised against a real database by
-- the supabase-dry-run workflow", and that was not true: the workflow applied
-- 0189 and checked the migration ledger, and never called the function. So the
-- most dangerous thing in the change -- a destructive SECURITY DEFINER function
-- that bypasses RLS -- was the one thing nothing executed.
--
-- The cost of that was measured, not theorised. `pg_catalog.coalesce(...)` sat
-- in the receipt SELECT: COALESCE is a SQL conditional expression, not a
-- function, so schema-qualifying it raises 42883 and rolls the whole deletion
-- back. Every string assertion passed. A single real call would have caught it,
-- and assertion (1) below is that call.
--
-- WHAT IT ASSERTS
--   0  the assertion helper itself rejects FALSE *and* NULL, and a receipt with
--      a null or missing field fails rather than passing (r39 gate R1)
--   1  a normal call, made as the `authenticated` role, succeeds and deletes
--      only the caller's rows (B survives)
--   2  anon and a NULL auth.uid() are refused (28000) and nothing is deleted
--   3  an unknown scope is refused (22023), nothing is deleted, and the refusal
--      does not echo the caller's scope string back (r39 gate finding 4)
--   4  the receipt is the public contract and nothing more: an exact top-level
--      key set, no internal table name / class / reason / parent anywhere in it,
--      and direct_deleted_total equal to the caller's real before/after row
--      delta across every client_erasable table -- while the delta across ALL
--      registry tables is strictly larger, which is what makes
--      count_semantics = 'direct_only' a true statement and not a hope
--   5  a failure in one table rolls the whole call back, all-or-nothing
--   6  `authenticated` cannot write the registry (it is the delete list; write
--      access to it turns this RPC into "delete any table")
--   7  the registry's cascade claims match pg_constraint, and no kept table
--      cascades without saying so (the catalog-side twin of guards G8/G9)
--
-- STYLE. Each block is self-contained: BEGIN ... ROLLBACK, so the file leaves
-- no rows behind and blocks may run in any order. Assertions RAISE EXCEPTION
-- with a message naming the expected and actual value, because a regression
-- that only says "failed" costs another round trip to find the cause.
--
-- auth.uid() in CI reads request.jwt.claim.sub (the compatibility stub at
-- supabase-dry-run.yml). SET LOCAL keeps the claim inside the transaction.

\set ON_ERROR_STOP on

\set uid_a '11111111-1111-4111-8111-1111111111aa'
\set uid_b '22222222-2222-4222-8222-2222222222bb'

----------------------------------------------------------------------
-- Fixture helper. Two users, each with wiki pages + links, plus a template
-- owned by A that B has reported. Created fresh inside every block.
----------------------------------------------------------------------

CREATE OR REPLACE FUNCTION pg_temp.erasure_fixture(p_a uuid, p_b uuid)
RETURNS void
LANGUAGE plpgsql
AS $fixture$
BEGIN
  INSERT INTO auth.users (id, email) VALUES (p_a, 'erasure-a@example.com'), (p_b, 'erasure-b@example.com');
  INSERT INTO public.users (id, email, birth_date)
  VALUES (p_a, 'erasure-a@example.com', '1990-01-01'), (p_b, 'erasure-b@example.com', '1990-01-01');

  -- A: two pages and two links between them. The links are the F2 case --
  -- wiki_links references wiki_pages ON DELETE CASCADE, so if wiki_links were
  -- ordered after its parent the cascade would empty it and its own DELETE
  -- would report 0.
  INSERT INTO public.wiki_pages (id, user_id, slug, kind, title) VALUES
    ('aaaa0000-0000-4000-8000-00000000a001', p_a, 'a-p1', 'concept', 'A page 1'),
    ('aaaa0000-0000-4000-8000-00000000a002', p_a, 'a-p2', 'concept', 'A page 2');
  INSERT INTO public.wiki_links (user_id, from_page, to_page) VALUES
    (p_a, 'aaaa0000-0000-4000-8000-00000000a001', 'aaaa0000-0000-4000-8000-00000000a002'),
    (p_a, 'aaaa0000-0000-4000-8000-00000000a002', 'aaaa0000-0000-4000-8000-00000000a001');
  INSERT INTO public.records (user_id, kind, body) VALUES (p_a, 'note', 'A record');

  -- B: the control group. Nothing A does may touch these.
  INSERT INTO public.wiki_pages (id, user_id, slug, kind, title) VALUES
    ('bbbb0000-0000-4000-8000-00000000b001', p_b, 'b-p1', 'concept', 'B page 1'),
    ('bbbb0000-0000-4000-8000-00000000b002', p_b, 'b-p2', 'concept', 'B page 2');
  INSERT INTO public.wiki_links (user_id, from_page, to_page) VALUES
    (p_b, 'bbbb0000-0000-4000-8000-00000000b001', 'bbbb0000-0000-4000-8000-00000000b002');
  INSERT INTO public.records (user_id, kind, body) VALUES (p_b, 'note', 'B record');

  -- A owns a template; B reported it. B cannot delete this report (0097 grants
  -- authenticated SELECT, INSERT only) -- but A erasing content takes it via
  -- ON DELETE CASCADE. That is the F3 case.
  INSERT INTO public.clipper_templates (id, owner_id, slug, base_kind)
  VALUES ('cccc0000-0000-4000-8000-00000000c001', p_a, 'a-template', 'article');
  INSERT INTO public.content_reports (template_id, reporter_id, reason)
  VALUES ('cccc0000-0000-4000-8000-00000000c001', p_b, 'spam');

  -- Two retention ledgers the erasure path must never touch: the PIPA consent
  -- record and the C3 audit ledger. Without rows here, "consent_records is in
  -- kept[]" is a string check against the registry itself and stays green while
  -- the rows are destroyed.
  INSERT INTO public.consent_records (user_id, age_band, consent_version, policy_version, terms_version, locale)
  VALUES (p_a, 'adult', 'v1', 'v1', 'v1', 'ko');
  INSERT INTO public.ai_audit_log (user_id, prompt_hash, output_hash, model_used, vertex_backend, safety_zone, latency_ms)
  VALUES (p_a, 'deadbeef', 'cafebabe', 'test-model', false, 'green', 1);
END;
$fixture$;

CREATE OR REPLACE FUNCTION pg_temp.expect(p_ok boolean, p_what text)
RETURNS void
LANGUAGE plpgsql
AS $expect$
BEGIN
  -- IS DISTINCT FROM TRUE, not NOT. `IF NOT p_ok` runs its body only when the
  -- condition is TRUE, and `NOT NULL` is NULL -- so a NULL argument was
  -- ACCEPTED. That is not a theoretical hole: every receipt assertion below
  -- compares a JSON extraction, and `->>` on a missing key or a JSON null
  -- yields NULL, which makes the whole comparison NULL. The gate that exists
  -- to catch a lying receipt count was passing a NULL count. Measured by the
  -- r39 authorization gate on a scratch PostgreSQL against this exact helper:
  --   NULL_BOOLEAN ACCEPTED exit=0
  --   NULL_WIKI_LINKS ACCEPTED exit=0
  --   MISSING_DELETED_TOTAL ACCEPTED exit=0
  --   FALSE_CONTROL REJECTED exit=3
  -- Block 0 below is that measurement, kept as a standing test.
  IF p_ok IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'erasure regression FAILED: %', p_what;
  END IF;
END;
$expect$;

----------------------------------------------------------------------
-- Row-count probes. They read the registry rather than a hand-written list,
-- so they cover all 26 client_erasable tables and not just the four the
-- fixture populates. Run as the superuser that drives this file; the call
-- under test is the only thing that runs as `authenticated`.
----------------------------------------------------------------------

-- Rows in every client_erasable table that belong to one user.
CREATE OR REPLACE FUNCTION pg_temp.owned_rows(p_uid uuid)
RETURNS bigint
LANGUAGE plpgsql
AS $owned_rows$
DECLARE
  v_row   record;
  v_n     bigint;
  v_total bigint := 0;
BEGIN
  FOR v_row IN
    SELECT table_name, owner_column FROM public.erasure_registry
    WHERE class = 'client_erasable' ORDER BY table_name
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE %I = $1',
                   v_row.table_name, v_row.owner_column)
      INTO v_n USING p_uid;
    v_total := v_total + v_n;
  END LOOP;
  RETURN v_total;
END;
$owned_rows$;

-- Rows in EVERY registry table, whoever owns them. The difference between this
-- and owned_rows() is where the cascade hides: rows that belong to other people
-- and disappear anyway because their parent was the caller's.
CREATE OR REPLACE FUNCTION pg_temp.registry_rows()
RETURNS bigint
LANGUAGE plpgsql
AS $registry_rows$
DECLARE
  v_row   record;
  v_n     bigint;
  v_total bigint := 0;
BEGIN
  FOR v_row IN SELECT table_name FROM public.erasure_registry ORDER BY table_name
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', v_row.table_name) INTO v_n;
    v_total := v_total + v_n;
  END LOOP;
  RETURN v_total;
END;
$registry_rows$;

----------------------------------------------------------------------
-- 0  The assertion helper is itself under test.
--
--    Every other block in this file is worth exactly as much as pg_temp.expect
--    is strict. When it tolerated NULL, a receipt that omitted a field or set
--    it to JSON null passed every count assertion below. So: FALSE must be
--    rejected, NULL must be rejected, and the two JSON shapes that produce NULL
--    -- a null value and a missing key -- must each fail.
--
--    The shape of each probe: call expect() with the bad input; if it returns,
--    raise 22000 (data_exception), which the handler for raise_exception (P0001,
--    what expect() throws) does NOT catch, so it propagates and fails the file.
----------------------------------------------------------------------

DO $zero$
BEGIN
  -- FALSE is rejected. The control: proves the handler below is catching a real
  -- rejection rather than expect() never running.
  BEGIN
    PERFORM pg_temp.expect(false, 'control: FALSE must be rejected');
    RAISE EXCEPTION USING ERRCODE = '22000',
      MESSAGE = 'erasure regression FAILED: pg_temp.expect accepted FALSE';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;

  -- NULL is rejected. This is the r39 R1 defect.
  BEGIN
    PERFORM pg_temp.expect(NULL, 'control: NULL must be rejected');
    RAISE EXCEPTION USING ERRCODE = '22000',
      MESSAGE = 'erasure regression FAILED: pg_temp.expect accepted NULL -- the NULL-tolerant IF is back, and every receipt assertion in this file is vacuous';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;

  -- A receipt field set to JSON null. `->>` yields SQL NULL, the comparison is
  -- NULL, and the assertion used to pass.
  BEGIN
    PERFORM pg_temp.expect(
      ('{"outcomes":{"direct_deleted":null}}'::jsonb -> 'outcomes' ->> 'direct_deleted') = '2',
      'control: a JSON null receipt value must be rejected');
    RAISE EXCEPTION USING ERRCODE = '22000',
      MESSAGE = 'erasure regression FAILED: a JSON null receipt value was accepted';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;

  -- A receipt field that is absent entirely.
  BEGIN
    PERFORM pg_temp.expect(
      ('{}'::jsonb ->> 'direct_deleted_total')::bigint = 6,
      'control: a missing receipt field must be rejected');
    RAISE EXCEPTION USING ERRCODE = '22000',
      MESSAGE = 'erasure regression FAILED: a missing receipt field was accepted';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;

  -- ...and TRUE still passes, or the helper rejects everything and the whole
  -- file is green for the wrong reason.
  PERFORM pg_temp.expect(true, 'control: TRUE must pass');
END;
$zero$;

----------------------------------------------------------------------
-- 1 + 4  A normal call: only A's rows go, the receipt says only what the
--        public contract allows it to say, and its total equals a measured
--        before/after delta rather than its own arithmetic.
--
-- ⚠ THE CALL RUNS AS `authenticated`, NOT AS postgres.
--   psql drives this file as the superuser, and until r39 the call inherited
--   that: the JWT claim was set to A but the caller was postgres. So the one
--   thing `GRANT EXECUTE ... TO authenticated` exists to make possible was
--   never exercised -- revoke that grant and every block here still passed
--   (measured 2026-09-20 on a scratch PostgreSQL 18.3: the old shape returned
--   status "ok" under the revoke; this shape raises `permission denied for
--   function erase_my_data`). The fixture is still built as postgres, because
--   RLS would otherwise stop the test writing B's rows; only the call itself
--   changes role, and RESET ROLE hands the transaction straight back.
----------------------------------------------------------------------

BEGIN;
SELECT pg_temp.erasure_fixture(:'uid_a', :'uid_b');
SET LOCAL request.jwt.claim.sub = :'uid_a';

-- Measured BEFORE, over the registry rather than over a list written by hand.
CREATE TEMP TABLE probe ON COMMIT DROP AS
  SELECT pg_temp.owned_rows(:'uid_a'::uuid) AS owned_before,
         pg_temp.registry_rows()            AS all_before;

CREATE TEMP TABLE receipt (r jsonb) ON COMMIT DROP;
GRANT INSERT ON receipt TO authenticated;

SET LOCAL ROLE authenticated;
INSERT INTO receipt SELECT public.erase_my_data('content');
RESET ROLE;

DO $one$
DECLARE
  v_r            jsonb  := (SELECT r FROM receipt);
  v_text         text   := v_r::text;
  v_owned_before bigint := (SELECT owned_before FROM probe);
  v_all_before   bigint := (SELECT all_before   FROM probe);
  v_owned_after  bigint := pg_temp.owned_rows('11111111-1111-4111-8111-1111111111aa');
  v_all_after    bigint := pg_temp.registry_rows();
  v_total        bigint;
  v_leak         text;
BEGIN
  -- (1) the caller's rows are gone...
  PERFORM pg_temp.expect((SELECT count(*) FROM public.wiki_pages WHERE user_id = '11111111-1111-4111-8111-1111111111aa') = 0,
    'A wiki_pages survived erase_my_data');
  PERFORM pg_temp.expect((SELECT count(*) FROM public.records WHERE user_id = '11111111-1111-4111-8111-1111111111aa') = 0,
    'A records survived erase_my_data');

  -- ...and B's are untouched. A SECURITY DEFINER function bypasses RLS, so this
  -- is the only thing standing between one user's wipe and another user's data.
  PERFORM pg_temp.expect((SELECT count(*) FROM public.wiki_pages WHERE user_id = '22222222-2222-4222-8222-2222222222bb') = 2,
    format('B wiki_pages should be 2, got %s',
           (SELECT count(*) FROM public.wiki_pages WHERE user_id = '22222222-2222-4222-8222-2222222222bb')));
  PERFORM pg_temp.expect((SELECT count(*) FROM public.wiki_links WHERE user_id = '22222222-2222-4222-8222-2222222222bb') = 1,
    'B wiki_links were destroyed by A''s erasure');
  PERFORM pg_temp.expect((SELECT count(*) FROM public.records WHERE user_id = '22222222-2222-4222-8222-2222222222bb') = 1,
    'B records were destroyed by A''s erasure');

  ------------------------------------------------------------------
  -- (4a) THE RECEIPT IS A PUBLIC CONTRACT. An exact key set, checked as a
  --      whitelist rather than a blacklist: a blacklist only forbids the
  --      leaks someone already thought of, and the leak this replaced was
  --      exactly the one nobody had thought of (r39 gate finding 1 -- kept[]
  --      and cascaded[] handed every authenticated caller the raw names of
  --      the retention, billing and audit ledgers, the stated reason each
  --      one is protected, the FK parent that destroys it, and the
  --      migration numbers inside those reasons).
  ------------------------------------------------------------------
  PERFORM pg_temp.expect(
    (SELECT pg_catalog.array_agg(k ORDER BY k) FROM pg_catalog.jsonb_object_keys(v_r) AS k)
      = ARRAY['count_semantics', 'direct_deleted_total', 'executed_at',
              'outcomes', 'receipt_version', 'scope', 'status'],
    format('receipt key set changed; got %s', (SELECT pg_catalog.array_agg(k ORDER BY k)
                                                 FROM pg_catalog.jsonb_object_keys(v_r) AS k)));
  PERFORM pg_temp.expect(
    NOT EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_array_elements(v_r -> 'outcomes') AS o,
                    pg_catalog.jsonb_object_keys(o) AS k
       WHERE k NOT IN ('outcome', 'categories', 'direct_deleted')),
    'an outcome entry carries a key outside the public contract');

  -- ...and no internal name reaches the caller. Driven off the registry, so a
  -- future table is covered the day it is added rather than the day someone
  -- remembers to extend a hand-written list.
  SELECT pg_catalog.string_agg(r.table_name, ', ' ORDER BY r.table_name) INTO v_leak
    FROM public.erasure_registry AS r
   WHERE pg_catalog.strpos(v_text, r.table_name) > 0;
  PERFORM pg_temp.expect(v_leak IS NULL,
    format('the receipt names internal tables: %s', v_leak));
  PERFORM pg_temp.expect(
    pg_catalog.strpos(v_text, 'client_erasable') = 0
      AND pg_catalog.strpos(v_text, 'account_delete_only') = 0
      AND pg_catalog.strpos(v_text, 'retained') = 0,
    'the receipt leaks the registry''s internal class values');
  -- `r.reason <> ''` is load-bearing: strpos(anything, '') is 1, so an empty
  -- reason would make this assertion fail for a table that leaks nothing.
  SELECT pg_catalog.string_agg(r.table_name, ', ' ORDER BY r.table_name) INTO v_leak
    FROM public.erasure_registry AS r
   WHERE r.reason <> ''
     AND pg_catalog.strpos(v_text, pg_catalog.left(r.reason, 12)) > 0;
  PERFORM pg_temp.expect(v_leak IS NULL,
    format('the receipt leaks the registry''s stated reasons: %s', v_leak));

  ------------------------------------------------------------------
  -- (4b) THE TOTAL IS MEASURED, NOT BELIEVED.
  --
  --      The old assertion read the receipt's own per-table numbers and added
  --      them up -- which is the receipt checking its own arithmetic. Here the
  --      number the function returns is compared against a before/after count
  --      taken over EVERY client_erasable table by the probes above. That is
  --      what catches F2 generally: if any table were ordered after a parent
  --      that cascades into it, its own DELETE would report 0 while the rows
  --      were already gone, the returned sum would drop, and the measured
  --      delta would not.
  ------------------------------------------------------------------
  v_total := (v_r ->> 'direct_deleted_total')::bigint;
  PERFORM pg_temp.expect(v_owned_before = 6,
    format('fixture assumption broken: A should own 6 erasable rows, has %s', v_owned_before));
  PERFORM pg_temp.expect(v_owned_after = 0,
    format('A still owns %s rows in client_erasable tables after erasure', v_owned_after));
  PERFORM pg_temp.expect(v_total = v_owned_before - v_owned_after,
    format('direct_deleted_total is %s but %s of the caller''s rows actually disappeared',
           v_total, v_owned_before - v_owned_after));

  -- ...and `count_semantics: direct_only` is a true statement about it. MORE
  -- rows left the database than the receipt counts, because B's report went
  -- with A's template. Asserting the gap -- rather than only documenting it --
  -- is what stops the name `direct_deleted_total` from quietly becoming a
  -- claim about the whole database again (r39 gate finding 2).
  PERFORM pg_temp.expect(v_r ->> 'count_semantics' = 'direct_only',
    format('count_semantics should be direct_only, got %s', v_r ->> 'count_semantics'));
  PERFORM pg_temp.expect(v_all_before - v_all_after = 7,
    format('7 rows should have left the registry''s tables, %s did', v_all_before - v_all_after));
  PERFORM pg_temp.expect(v_all_before - v_all_after > v_total,
    format('the cascade gap vanished: %s rows left, the receipt counts %s. Either the cascade fixture stopped cascading, or the receipt started counting more than its own DELETEs -- in which case direct_only is now the wrong label',
           v_all_before - v_all_after, v_total));

  PERFORM pg_temp.expect(v_r ->> 'scope' = 'content', 'receipt scope is not content');
  PERFORM pg_temp.expect(v_r ->> 'status' = 'ok', 'receipt status is not ok');
  PERFORM pg_temp.expect((v_r ->> 'receipt_version')::int = 1,
    format('receipt_version should be 1, got %s', v_r ->> 'receipt_version'));

  -- (F3) B's report is gone, taken by the cascade from A's template. The
  -- receipt must therefore count it under removed_with_parent and not under
  -- kept. It is no longer NAMED anywhere -- the name was the leak -- so the
  -- assertion is on the counts, tied back to the registry, plus the row itself.
  PERFORM pg_temp.expect((SELECT count(*) FROM public.content_reports WHERE reporter_id = '22222222-2222-4222-8222-2222222222bb') = 0,
    'fixture assumption broken: B''s report should have cascaded away with A''s template');
  PERFORM pg_temp.expect(
    (SELECT o ->> 'categories' FROM pg_catalog.jsonb_array_elements(v_r -> 'outcomes') AS o
      WHERE o ->> 'outcome' = 'removed_with_parent')::bigint
      = (SELECT count(*) FROM public.erasure_registry WHERE cascades_from IS NOT NULL),
    'removed_with_parent does not count the registry''s cascade rows');
  PERFORM pg_temp.expect(
    (SELECT count(*) FROM public.erasure_registry WHERE cascades_from IS NOT NULL) >= 1,
    'the registry declares no cascade at all, so the F3 split is untested here');
  PERFORM pg_temp.expect(
    (SELECT o ->> 'categories' FROM pg_catalog.jsonb_array_elements(v_r -> 'outcomes') AS o
      WHERE o ->> 'outcome' = 'kept')::bigint
      = (SELECT count(*) FROM public.erasure_registry
          WHERE class <> 'client_erasable' AND cascades_from IS NULL),
    'kept counts a table a cascade destroys, or drops one it does not (F3)');

  -- Retention ledger ROWS are still there. Counting them under `kept` would
  -- test the registry against itself: widen the delete loop to cover a
  -- retained table and the count still says kept while the rows burn.
  -- That is the F1/F3 failure at the C3/PIPA boundary, so check the table.
  PERFORM pg_temp.expect((SELECT count(*) FROM public.consent_records WHERE user_id = '11111111-1111-4111-8111-1111111111aa') = 1,
    'a retention ledger lost rows to content erasure');
  PERFORM pg_temp.expect((SELECT count(*) FROM public.ai_audit_log WHERE user_id = '11111111-1111-4111-8111-1111111111aa') = 1,
    'ai_audit_log (hard constraint C3) lost rows to content erasure');

  -- Content deletion keeps the account. Scope 'content' and scope 'account' are
  -- different paths on purpose (design F5); if this call ever starts taking the
  -- profile with it, the user loses far more than they asked to lose.
  PERFORM pg_temp.expect((SELECT count(*) FROM public.users WHERE id = '11111111-1111-4111-8111-1111111111aa') = 1,
    'erase_my_data(content) deleted the caller''s account row');
  PERFORM pg_temp.expect((SELECT count(*) FROM auth.users WHERE id = '11111111-1111-4111-8111-1111111111aa') = 1,
    'erase_my_data(content) deleted the caller''s auth.users row');

  -- Every client_erasable table is visited, and only those. Four of the 26
  -- carry fixture rows, so without this a regression that drops one from the
  -- loop is invisible: its rows are never created, so nothing misses them.
  --
  -- ⚠ This used to count the receipt's per-table KEYS, which is why the old
  --   receipt had to expose them. It does not any more, so the count comes
  --   from the loop itself (`categories` under the `erased` outcome). Same
  --   property, no names: the registry is what it is compared against, and
  --   this file reads the registry directly as the superuser driving it -- a
  --   privilege the RPC's callers deliberately do not have.
  --
  -- ⚠ Written with a strict `=` against a subquery, not NOT EXISTS over a
  --   jsonb path. Two assertions here previously FAILED OPEN: NOT EXISTS over
  --   jsonb_array_elements/jsonb_object_keys of an ABSENT key iterates zero
  --   rows and goes green, so a receipt that dropped the key entirely passed
  --   the test that existed to police it.
  PERFORM pg_temp.expect(
    (SELECT o ->> 'categories' FROM pg_catalog.jsonb_array_elements(v_r -> 'outcomes') AS o
      WHERE o ->> 'outcome' = 'erased')::bigint
      = (SELECT count(*) FROM public.erasure_registry WHERE class = 'client_erasable'),
    format('the loop visited %s categories, the registry lists %s client_erasable',
           (SELECT o ->> 'categories' FROM pg_catalog.jsonb_array_elements(v_r -> 'outcomes') AS o
             WHERE o ->> 'outcome' = 'erased'),
           (SELECT count(*) FROM public.erasure_registry WHERE class = 'client_erasable')));

  -- The three outcome buckets are the whole registry, once each. A table that
  -- fell out of every bucket -- or into two -- would otherwise be silent.
  PERFORM pg_temp.expect(
    (SELECT pg_catalog.sum((o ->> 'categories')::bigint)
       FROM pg_catalog.jsonb_array_elements(v_r -> 'outcomes') AS o)
      = (SELECT count(*) FROM public.erasure_registry),
    'the outcome buckets do not add up to the registry');
  PERFORM pg_temp.expect(
    (SELECT pg_catalog.array_agg(o ->> 'outcome' ORDER BY o ->> 'outcome')
       FROM pg_catalog.jsonb_array_elements(v_r -> 'outcomes') AS o)
      = ARRAY['erased', 'kept', 'removed_with_parent'],
    'the receipt''s outcome buckets changed');
  PERFORM pg_temp.expect(
    (SELECT o ->> 'direct_deleted' FROM pg_catalog.jsonb_array_elements(v_r -> 'outcomes') AS o
      WHERE o ->> 'outcome' = 'erased')::bigint = v_total,
    'the erased bucket disagrees with direct_deleted_total');
END;
$one$;
ROLLBACK;

----------------------------------------------------------------------
-- 2  No authenticated caller: refused with 28000, nothing deleted.
--    Two shapes -- the anon role, and a session with no JWT claim at all.
----------------------------------------------------------------------

BEGIN;
SELECT pg_temp.erasure_fixture(:'uid_a', :'uid_b');

DO $two$
DECLARE
  v_state text;
  v_before bigint := (SELECT count(*) FROM public.wiki_pages);
BEGIN
  -- (a) no claim set: auth.uid() is NULL.
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', '', true);
  PERFORM pg_catalog.set_config('request.jwt.claims', '', true);
  BEGIN
    PERFORM public.erase_my_data('content');
    RAISE EXCEPTION 'erasure regression FAILED: a NULL auth.uid() was allowed to erase';
  EXCEPTION
    WHEN sqlstate '28000' THEN v_state := '28000';
  END;
  PERFORM pg_temp.expect(v_state = '28000', 'NULL auth.uid() did not raise 28000');
  PERFORM pg_temp.expect((SELECT count(*) FROM public.wiki_pages) = v_before,
    'rows were deleted despite the unauthenticated call being refused');
END;
$two$;
ROLLBACK;

BEGIN;
SELECT pg_temp.erasure_fixture(:'uid_a', :'uid_b');

DO $two_b$
DECLARE
  v_before bigint := (SELECT count(*) FROM public.wiki_pages);
BEGIN
  -- (b) the anon role. EXECUTE is revoked from PUBLIC and anon (0189), so this
  -- must fail at the PERMISSION check.
  --
  -- ⚠ The claim is specifically 42501, and the claim only means something with
  -- a valid JWT claim set. Written the obvious way - switch to anon, accept
  -- `insufficient_privilege OR 28000` - the assertion cannot fail: with no
  -- claim, auth.uid() is NULL and the function raises 28000 from inside no
  -- matter who may execute it, so `GRANT EXECUTE ... TO anon` passes too
  -- (measured: it did). Set the claim first, then the only remaining reason to
  -- be refused is the ACL.
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-1111111111aa', true);
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM public.erase_my_data('content');
    RESET ROLE;
    RAISE EXCEPTION 'erasure regression FAILED: anon holds EXECUTE on erase_my_data (0189 must revoke it)';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RESET ROLE;
  END;
  RESET ROLE;
  PERFORM pg_temp.expect((SELECT count(*) FROM public.wiki_pages) = v_before,
    'rows were deleted despite the anon call being refused');
END;
$two_b$;
ROLLBACK;

----------------------------------------------------------------------
-- 3  Unknown scope: refused with 22023, nothing deleted.
----------------------------------------------------------------------

BEGIN;
SELECT pg_temp.erasure_fixture(:'uid_a', :'uid_b');
SET LOCAL request.jwt.claim.sub = :'uid_a';

DO $three$
DECLARE
  v_before bigint := (SELECT count(*) FROM public.wiki_pages);
  v_state  text;
  -- Built with chr(10) rather than an E'' escape so the newline survives every
  -- layer between here and psql intact.
  v_probe  text := 'unknown_scope' || pg_catalog.chr(10) || 'reflected-marker-2f6c1d';
BEGIN
  FOREACH v_state IN ARRAY ARRAY['account', 'everything', ''] LOOP
    BEGIN
      PERFORM public.erase_my_data(v_state);
      RAISE EXCEPTION 'erasure regression FAILED: scope % was accepted', v_state;
    EXCEPTION
      WHEN sqlstate '22023' THEN NULL;
    END;
  END LOOP;

  -- NULL is a distinct shape: `IS DISTINCT FROM` must reject it too, rather
  -- than letting a NULL comparison fall through.
  BEGIN
    PERFORM public.erase_my_data(NULL);
    RAISE EXCEPTION 'erasure regression FAILED: a NULL scope was accepted';
  EXCEPTION
    WHEN sqlstate '22023' THEN NULL;
  END;

  -- ...and the refusal does not read the caller's string back out. `RAISE
  -- EXCEPTION '... %', p_scope` put untrusted input into both the error
  -- response and the database's own error log, where a token would then be
  -- retained and a newline would split a log line in two (r39 gate finding 4).
  -- The caller already knows what it sent, so there is nothing to give back.
  BEGIN
    PERFORM public.erase_my_data(v_probe);
    RAISE EXCEPTION 'erasure regression FAILED: the marker scope was accepted';
  EXCEPTION
    WHEN sqlstate '22023' THEN
      PERFORM pg_temp.expect(pg_catalog.strpos(SQLERRM, 'reflected-marker-2f6c1d') = 0,
        format('the refusal echoed the caller''s scope string back: %s', SQLERRM));
      PERFORM pg_temp.expect(pg_catalog.strpos(SQLERRM, pg_catalog.chr(10)) = 0,
        'the refusal message carries a newline from caller input');
  END;

  PERFORM pg_temp.expect((SELECT count(*) FROM public.wiki_pages) = v_before,
    'rows were deleted despite every scope being refused');
END;
$three$;
ROLLBACK;

----------------------------------------------------------------------
-- 5  All-or-nothing. If one table's DELETE fails, the tables already deleted
--    must come back. The function has no exception handler and no autonomous
--    commit, so this is really a test that nobody has added one.
--
--    A BEFORE DELETE trigger on a table late in the order (clipper_templates,
--    71) raises after the early tables (wiki_links 9, wiki_pages 10, ...) have
--    already been deleted. The trigger is created inside the transaction and
--    rolled back with it; it never exists outside this block.
----------------------------------------------------------------------

BEGIN;
SELECT pg_temp.erasure_fixture(:'uid_a', :'uid_b');
SET LOCAL request.jwt.claim.sub = :'uid_a';

CREATE FUNCTION pg_temp.boom() RETURNS trigger LANGUAGE plpgsql AS $boom$
BEGIN
  RAISE EXCEPTION 'simulated failure late in the delete order' USING ERRCODE = 'P0001';
END;
$boom$;
CREATE TRIGGER zzz_erasure_atomicity_probe
  BEFORE DELETE ON public.clipper_templates
  FOR EACH ROW EXECUTE FUNCTION pg_temp.boom();

DO $five$
DECLARE
  v_pages_before bigint := (SELECT count(*) FROM public.wiki_pages WHERE user_id = '11111111-1111-4111-8111-1111111111aa');
  v_raised boolean := false;
BEGIN
  PERFORM pg_temp.expect(v_pages_before = 2, 'fixture assumption broken: A should start with 2 wiki_pages');
  BEGIN
    PERFORM public.erase_my_data('content');
  EXCEPTION
    WHEN sqlstate 'P0001' THEN v_raised := true;
  END;
  PERFORM pg_temp.expect(v_raised, 'the simulated mid-order failure did not surface to the caller');

  -- The subtransaction opened by this EXCEPTION block is what rolls the deletes
  -- back; a real client sees the same effect at statement level. Either way the
  -- contract is: a partial wipe must not be left behind.
  PERFORM pg_temp.expect((SELECT count(*) FROM public.wiki_pages WHERE user_id = '11111111-1111-4111-8111-1111111111aa') = v_pages_before,
    format('erase_my_data was not atomic: %s of %s wiki_pages stayed deleted after a later table failed',
           v_pages_before - (SELECT count(*) FROM public.wiki_pages WHERE user_id = '11111111-1111-4111-8111-1111111111aa'),
           v_pages_before));
  PERFORM pg_temp.expect((SELECT count(*) FROM public.wiki_links WHERE user_id = '11111111-1111-4111-8111-1111111111aa') = 2,
    'erase_my_data was not atomic: wiki_links stayed deleted after a later table failed');
END;
$five$;
DROP TRIGGER zzz_erasure_atomicity_probe ON public.clipper_templates;
ROLLBACK;

----------------------------------------------------------------------
-- 6  The registry is the delete list. If `authenticated` can write it, this
--    RPC becomes "delete from any table I name", because the function is
--    SECURITY DEFINER and loops over whatever the registry says.
----------------------------------------------------------------------

BEGIN;
DO $six$
DECLARE
  v_rows bigint := (SELECT count(*) FROM public.erasure_registry);
BEGIN
  -- Not a fixed count: the registry grows whenever the schema gains an owned
  -- table, and scripts/check-erasure-registry.ts (G1/G2) is what keeps it
  -- complete. What matters here is that it is populated and that the five
  -- retention ledgers are in it as retained, whatever else has been added.
  PERFORM pg_temp.expect(v_rows > 0, 'erasure_registry is empty; the seed did not apply');
  PERFORM pg_temp.expect(
    (SELECT count(*) FROM public.erasure_registry
      WHERE table_name IN ('consent_records', 'ai_audit_log', 'revenue_events',
                           'credit_ledger', 'paddle_webhook_events')
        AND class = 'retained') = 5,
    'a retention ledger is missing from the registry or is not classified retained');

  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.erasure_registry (table_name, owner_column, class, delete_order, reason)
    VALUES ('consent_records', 'user_id', 'client_erasable', 1, 'privilege escalation probe');
    RESET ROLE;
    RAISE EXCEPTION 'erasure regression FAILED: authenticated could INSERT into erasure_registry';
  EXCEPTION
    WHEN insufficient_privilege THEN RESET ROLE;
  END;
  RESET ROLE;

  SET LOCAL ROLE authenticated;
  BEGIN
    UPDATE public.erasure_registry SET class = 'client_erasable' WHERE table_name = 'consent_records';
    RESET ROLE;
    RAISE EXCEPTION 'erasure regression FAILED: authenticated could UPDATE erasure_registry';
  EXCEPTION
    WHEN insufficient_privilege THEN RESET ROLE;
  END;
  RESET ROLE;

  SET LOCAL ROLE authenticated;
  BEGIN
    DELETE FROM public.erasure_registry;
    RESET ROLE;
    RAISE EXCEPTION 'erasure regression FAILED: authenticated could DELETE from erasure_registry';
  EXCEPTION
    WHEN insufficient_privilege THEN RESET ROLE;
  END;
  RESET ROLE;

  -- ...and it cannot even read it. The registry is a map of the schema; the
  -- receipt is the sanctioned view of it.
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM count(*) FROM public.erasure_registry;
    RESET ROLE;
    RAISE EXCEPTION 'erasure regression FAILED: authenticated could SELECT erasure_registry';
  EXCEPTION
    WHEN insufficient_privilege THEN RESET ROLE;
  END;
  RESET ROLE;

  PERFORM pg_temp.expect((SELECT count(*) FROM public.erasure_registry) = v_rows,
    'erasure_registry changed while proving it could not be changed');

  -- The two CHECKs are what stop a hand-edited row from becoming a delete
  -- instruction: an order on a kept table, or a cascade claim on an erasable one.
  PERFORM pg_temp.expect(
    (SELECT count(*) FROM pg_catalog.pg_constraint
      WHERE conrelid = 'public.erasure_registry'::regclass AND contype = 'c'
        AND conname IN ('erasure_registry_order_pair', 'erasure_registry_cascade_is_for_kept')) = 2,
    'erasure_registry lost one of its CHECK constraints');
END;
$six$;
ROLLBACK;

----------------------------------------------------------------------
-- 7  The registry's cascade claims against the real catalog.
--
--    scripts/check-erasure-registry.ts derives the same two facts by reading
--    db/migrations with regexes (G8, G9). This block derives them from
--    pg_constraint, which is the original. If the two ever disagree, the regex
--    has drifted -- and a guard that has drifted is worse than no guard, so the
--    disagreement must be loud.
----------------------------------------------------------------------

BEGIN;
DO $seven$
DECLARE
  v_bad text;
BEGIN
  -- G8: a CASCADE child that is itself erasable must be deleted BEFORE its
  -- parent, or the cascade empties it first and its DELETE reports 0.
  SELECT pg_catalog.string_agg(
           ch.relname || ' (' || child.delete_order || ') >= ' || pa.relname || ' (' || parent.delete_order || ')',
           ', ' ORDER BY ch.relname)
    INTO v_bad
  FROM pg_catalog.pg_constraint AS k
  JOIN pg_catalog.pg_class AS ch ON ch.oid = k.conrelid
  JOIN pg_catalog.pg_class AS pa ON pa.oid = k.confrelid
  -- Both ends must be the public tables the registry names. Joining on bare
  -- relname would let a same-named table in auth/storage answer for one of them.
  JOIN pg_catalog.pg_namespace AS chn ON chn.oid = ch.relnamespace AND chn.nspname = 'public'
  JOIN pg_catalog.pg_namespace AS pan ON pan.oid = pa.relnamespace AND pan.nspname = 'public'
  JOIN public.erasure_registry AS parent ON parent.table_name = pa.relname AND parent.class = 'client_erasable'
  JOIN public.erasure_registry AS child  ON child.table_name  = ch.relname AND child.class  = 'client_erasable'
  WHERE k.contype = 'f'
    AND k.confdeltype = 'c'
    AND child.delete_order >= parent.delete_order;

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'erasure regression FAILED (G8, catalog side): CASCADE child deleted at or after its parent: %', v_bad;
  END IF;

  -- G9: a kept table that an erased parent cascades into must say so.
  SELECT pg_catalog.string_agg(ch.relname || ' <- ' || pa.relname, ', ' ORDER BY ch.relname)
    INTO v_bad
  FROM pg_catalog.pg_constraint AS k
  JOIN pg_catalog.pg_class AS ch ON ch.oid = k.conrelid
  JOIN pg_catalog.pg_class AS pa ON pa.oid = k.confrelid
  JOIN pg_catalog.pg_namespace AS chn ON chn.oid = ch.relnamespace AND chn.nspname = 'public'
  JOIN pg_catalog.pg_namespace AS pan ON pan.oid = pa.relnamespace AND pan.nspname = 'public'
  JOIN public.erasure_registry AS parent ON parent.table_name = pa.relname AND parent.class = 'client_erasable'
  JOIN public.erasure_registry AS child  ON child.table_name  = ch.relname AND child.class <> 'client_erasable'
  WHERE k.contype = 'f'
    AND k.confdeltype = 'c'
    AND child.cascades_from IS DISTINCT FROM pa.relname;

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION
      'erasure regression FAILED (G9, catalog side): table reported as kept but destroyed by a cascade: %', v_bad;
  END IF;

  -- And the declared cascades are real. (0189 checks this at apply time too;
  -- repeated here so the assertion survives a future edit to that DO block.)
  SELECT pg_catalog.string_agg(r.table_name || ' -> ' || r.cascades_from, ', ' ORDER BY r.table_name)
    INTO v_bad
  FROM public.erasure_registry AS r
  WHERE r.cascades_from IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_constraint AS k
      JOIN pg_catalog.pg_class AS ch ON ch.oid = k.conrelid
      JOIN pg_catalog.pg_class AS pa ON pa.oid = k.confrelid
      JOIN pg_catalog.pg_namespace AS chn ON chn.oid = ch.relnamespace AND chn.nspname = 'public'
      JOIN pg_catalog.pg_namespace AS pan ON pan.oid = pa.relnamespace AND pan.nspname = 'public'
      WHERE k.contype = 'f' AND k.confdeltype = 'c'
        AND ch.relname = r.table_name AND pa.relname = r.cascades_from
    );

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'erasure regression FAILED: declared cascade does not exist in the catalog: %', v_bad;
  END IF;

  -- Every client_erasable row names a column the table really has, and the
  -- owner column is a uuid (a text owner column would compare against auth.uid()
  -- by coercion and match nothing).
  SELECT pg_catalog.string_agg(r.table_name || '.' || r.owner_column, ', ' ORDER BY r.table_name)
    INTO v_bad
  FROM public.erasure_registry AS r
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute AS a
    JOIN pg_catalog.pg_class     AS c ON c.oid = a.attrelid
    JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = r.table_name AND a.attname = r.owner_column
      AND a.attnum > 0 AND NOT a.attisdropped
      AND a.atttypid = 'uuid'::regtype
  );

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'erasure regression FAILED: owner column missing or not uuid: %', v_bad;
  END IF;
END;
$seven$;
ROLLBACK;

SELECT 'ERASURE REGRESSION PASS  erase_my_data: strict assertions, authenticated call, isolation, refusals without reflection, public receipt contract, measured row deltas, atomicity, registry ACL, catalog cascade parity' AS result;
