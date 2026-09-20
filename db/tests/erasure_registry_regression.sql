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
--   1  a normal call succeeds and deletes only the caller's rows (B survives)
--   2  anon and a NULL auth.uid() are refused (28000) and nothing is deleted
--   3  an unknown scope is refused (22023) and nothing is deleted
--   4  per-table counts equal the rows actually removed, INCLUDING a table that
--      a cascade empties (wiki_links -- the F2 defect)
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
END;
$fixture$;

CREATE OR REPLACE FUNCTION pg_temp.expect(p_ok boolean, p_what text)
RETURNS void
LANGUAGE plpgsql
AS $expect$
BEGIN
  IF NOT p_ok THEN
    RAISE EXCEPTION 'erasure regression FAILED: %', p_what;
  END IF;
END;
$expect$;

----------------------------------------------------------------------
-- 1 + 4  A normal call: only A's rows go, and every per-table count equals
--        the rows that actually disappeared.
----------------------------------------------------------------------

BEGIN;
SELECT pg_temp.erasure_fixture(:'uid_a', :'uid_b');
SET LOCAL request.jwt.claim.sub = :'uid_a';

CREATE TEMP TABLE receipt ON COMMIT DROP AS SELECT public.erase_my_data('content') AS r;

DO $one$
DECLARE
  v_r jsonb := (SELECT r FROM receipt);
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

  -- (4) the receipt counts what really went. wiki_links is the one that lied:
  -- it read 0 while two rows were destroyed by the cascade from wiki_pages.
  PERFORM pg_temp.expect((v_r -> 'deleted' ->> 'wiki_pages') = '2',
    format('receipt wiki_pages should be 2, got %s', v_r -> 'deleted' ->> 'wiki_pages'));
  PERFORM pg_temp.expect((v_r -> 'deleted' ->> 'wiki_links') = '2',
    format('receipt wiki_links should be 2, got %s -- the parent cascade emptied it before its own DELETE ran (F2)',
           v_r -> 'deleted' ->> 'wiki_links'));
  PERFORM pg_temp.expect((v_r -> 'deleted' ->> 'records') = '1',
    format('receipt records should be 1, got %s', v_r -> 'deleted' ->> 'records'));
  PERFORM pg_temp.expect((v_r -> 'deleted' ->> 'clipper_templates') = '1',
    format('receipt clipper_templates should be 1, got %s', v_r -> 'deleted' ->> 'clipper_templates'));

  -- deleted_total is the sum of the per-table counts, so a table that reports 0
  -- while destroying rows understates it too.
  PERFORM pg_temp.expect((v_r ->> 'deleted_total')::bigint = 6,
    format('deleted_total should be 6 (2 pages + 2 links + 1 record + 1 template), got %s', v_r ->> 'deleted_total'));

  PERFORM pg_temp.expect(v_r ->> 'scope' = 'content', 'receipt scope is not content');
  PERFORM pg_temp.expect(pg_catalog.jsonb_typeof(v_r -> 'kept') = 'array', 'receipt kept is not an array');

  -- (F3) B's report is gone, taken by the cascade from A's template. It must
  -- therefore NOT be reported as kept, and it must be named in cascaded[].
  PERFORM pg_temp.expect((SELECT count(*) FROM public.content_reports WHERE reporter_id = '22222222-2222-4222-8222-2222222222bb') = 0,
    'fixture assumption broken: B''s report should have cascaded away with A''s template');
  PERFORM pg_temp.expect(
    NOT EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(v_r -> 'kept') AS k WHERE k ->> 'table' = 'content_reports'),
    'content_reports is reported as kept, but the cascade destroyed it (F3)');
  PERFORM pg_temp.expect(
    EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(v_r -> 'cascaded') AS c
             WHERE c ->> 'table' = 'content_reports' AND c ->> 'removed_with' = 'clipper_templates'),
    'content_reports is missing from cascaded[] with removed_with = clipper_templates');

  -- Retention ledgers stay in kept, where the receipt promises they are.
  PERFORM pg_temp.expect(
    EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(v_r -> 'kept') AS k WHERE k ->> 'table' = 'consent_records'),
    'consent_records is not reported as kept');
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
  -- fails at the permission check (42501) rather than inside the function.
  -- Either refusal is acceptable; deleting anything is not.
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM public.erase_my_data('content');
    RESET ROLE;
    RAISE EXCEPTION 'erasure regression FAILED: anon was allowed to call erase_my_data';
  EXCEPTION
    WHEN insufficient_privilege OR sqlstate '28000' THEN
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

SELECT 'ERASURE REGRESSION PASS  erase_my_data: isolation, refusals, per-table counts, atomicity, registry ACL, catalog cascade parity' AS result;
