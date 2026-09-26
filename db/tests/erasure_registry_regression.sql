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
--   L  THE SHIPPED LOCK: `authenticated` holds no EXECUTE on the RPC, read
--      off the catalog AND measured by a real call that must come back
--      42501. 0189 + 0190 ship the function locked (8th artifact gate M1: the
--      sweep is sequential, so a second session of the same user can write
--      into a table it already passed and `status=ok` is then false). This
--      block runs BEFORE assertion (1), which grants ITSELF execute inside
--      its own rolled-back transaction, so the test's privilege is never
--      mistaken for the shipped one. It first PROVES the database has the
--      Supabase default privileges for functions, because without them the
--      lock reads as present whether or not it is (R48 artifact gate F-02)
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
--   8  THE DELETE VERDICT ITSELF. For every one of the client_erasable tables,
--      as the real `authenticated` role carrying A's JWT, FOUR questions are
--      asked and EACH ONE starts from the original fixture: A cannot delete
--      B's row (0 rows, and B's row survives); A CAN delete its own (exactly
--      the rows it owns); `DELETE FROM <table> WHERE true` asked with nothing
--      deleted yet reaches A's own rows and NO MORE; and the same column-free
--      statement asked once A's own rows are gone reaches nothing at all. A
--      statement that names no column gets no help from the SELECT policy.
--      This is the assertion the static guard used to make from policy text
--      and no longer does -- see the boundary note below. Each QUESTION is
--      observed inside its OWN rolled-back savepoint, and the sweep is run
--      three times -- ascending delete_order, descending, and with the four
--      questions asked in reverse -- which must produce identical numbers
--   8c the same sweep against the r43 F1 counter-example -- an inherited-role
--      DELETE policy whose USING reads ANOTHER registry table -- which it must
--      REFUSE in all three. Block (8) proves the schema; (8c) proves (8)
--   8d and against the r44 F1 counter-example -- an inherited-role DELETE
--      policy whose USING reads the CASCADE CHILD of the table it guards, so
--      that A's own delete switches it off. Per-table isolation cannot see it
--      and per-question isolation must; (8d) proves that too, by measuring
--      both answers on the same policy
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
-- L  THE SHIPPED LOCK. `authenticated` cannot call erase_my_data at all.
--
--    0189 REVOKEs EXECUTE from PUBLIC and anon; 0190 REVOKEs it from
--    authenticated. No client role holds it: the RPC ships locked. The reason
--    is the 8th artifact gate's M1: the sweep is sequential over 26 tables,
--    ROW EXCLUSIVE does not exclude a concurrent INSERT, so a SECOND SESSION OF
--    THE SAME USER can commit a row into a table the sweep has already passed
--    -- and then `status=ok` is a false receipt. 0189 section 5 states the
--    condition for opening it.
--
--    ⚠ THIS BLOCK WAS GREEN WHILE THE LOCK DID NOT EXIST (R48 artifact gate
--    F-02, 2026-09-20). 0189 alone was described here as "grants it to NOBODY".
--    That is true of 0189's text and false of the platform: Supabase's default
--    privileges grant EXECUTE on every new public function to anon,
--    authenticated and service_role BY NAME (0036:11-13 recorded prod's ACL
--    after a PUBLIC-only revoke: all three still there), so
--    `REVOKE ... FROM PUBLIC, anon` leaves authenticated=X standing.
--    The scratch DB had no such defaults, so authenticated held nothing here
--    for a reason no migration caused, and the catalog assertion below passed
--    with or without the revoke that matters. MEASURED on a scratch PostgreSQL
--    18.3 with 0001-0189 applied: without the floor the ACL is
--    {postgres=X/postgres} and this block is green; with it the ACL is
--    {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
--    and this block is red until 0190 applies.
--
--    So the floor is now installed by the workflow BEFORE the first migration
--    (supabase-dry-run.yml, "Seed Supabase compatibility layer"), and the first
--    thing this block does is PROVE IT IS THERE, by creating a function the way
--    a migration would and reading what the database stamped on it. On a
--    database without the floor this block refuses to draw a conclusion and
--    goes red -- in CI if those lines are ever dropped, and on anyone's local
--    scratch instance, which is where the vacuous green was last reported.
--
--    ⚠ THE ORDER OF THIS FILE IS PART OF THE ASSERTION. Block (1) below
--    GRANTS ITSELF EXECUTE inside its own transaction, because it still has
--    to make a real authenticated call. That grant belongs to the test, not
--    to the product. This block runs FIRST, in a transaction that contains no
--    grant at all, so the test's own privilege can never be mistaken for the
--    shipped one. 0150's dormant complete_profile_signup_consent already has
--    this shape in supabase-dry-run.yml: prove the denial, then reopen inside
--    the transaction that ROLLBACKs.
--
--    BOTH HALVES ARE ASSERTED. This file has twice been shown that a catalog
--    read can be true for a reason no migration caused (the privilege FLOOR
--    note below is the long version). So the ACL is read, AND the call is
--    actually made and must come back 42501.
----------------------------------------------------------------------

BEGIN;

DO $lock_floor$
DECLARE
  v_owner   name;
  v_role    text;
  v_by_name boolean;
BEGIN
  -- Default privileges belong to the role that CREATES the object, so the probe
  -- is created as whoever created erase_my_data. (postgres in CI: a no-op.)
  SELECT r.rolname INTO STRICT v_owner
    FROM pg_catalog.pg_proc  AS p
    JOIN pg_catalog.pg_roles AS r ON r.oid = p.proowner
   WHERE p.oid = 'public.erase_my_data(text)'::pg_catalog.regprocedure;

  EXECUTE pg_catalog.format('SET LOCAL ROLE %I', v_owner);
  CREATE FUNCTION public.erasure_lock_floor_probe() RETURNS integer
    LANGUAGE sql AS 'SELECT 1';
  RESET ROLE;

  -- BY NAME, not has_function_privilege(): every new function is executable by
  -- everyone through PUBLIC, floor or no floor, so the effective answer cannot
  -- tell the two databases apart. The explicit ACL entry can. Both roles the
  -- assertions below draw a conclusion about must be there; PUBLIC needs no
  -- floor, PostgreSQL grants it itself.
  FOREACH v_role IN ARRAY ARRAY['authenticated', 'anon']
  LOOP
    SELECT EXISTS (
      SELECT 1
        FROM pg_catalog.pg_proc AS p,
             LATERAL pg_catalog.aclexplode(p.proacl) AS a
       WHERE p.oid = 'public.erasure_lock_floor_probe()'::pg_catalog.regprocedure
         AND a.grantee = v_role::pg_catalog.regrole
         AND a.privilege_type = 'EXECUTE'
    ) INTO v_by_name;

    IF NOT v_by_name THEN
      RAISE EXCEPTION 'erasure regression FAILED (L): this database does not reproduce the Supabase default privileges for functions -- a function just created in public by "%" carries no by-name EXECUTE for %. Without that floor, "% holds no EXECUTE on erase_my_data" is true of any function whose migration revokes PUBLIC, whether or not it revokes %, so the lock assertions below would be green for a reason no migration caused (R48 artifact gate F-02). Install the floor before the first migration: see "Seed Supabase compatibility layer" in .github/workflows/supabase-dry-run.yml',
        v_owner, v_role, v_role, v_role;
    END IF;
  END LOOP;

  DROP FUNCTION public.erasure_lock_floor_probe();
END;
$lock_floor$;

DO $lock$
BEGIN
  IF pg_catalog.has_function_privilege(
       'authenticated', 'public.erase_my_data(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'erasure regression FAILED: authenticated holds EXECUTE on erase_my_data -- 0190 must revoke it, because the platform grants it by name and 0189 revokes only PUBLIC and anon. It ships LOCKED until a per-user delete fence exists (8th artifact gate M1; R48 artifact gate F-02)';
  END IF;
  -- anon and PUBLIC in the same breath, so one block states the whole shipped
  -- ACL. (2b) measures anon's refusal behaviourally; this is the catalog side.
  IF pg_catalog.has_function_privilege(
       'anon', 'public.erase_my_data(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'erasure regression FAILED: anon holds EXECUTE on erase_my_data (0189 must revoke it)';
  END IF;
  IF pg_catalog.has_function_privilege(
       'public', 'public.erase_my_data(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'erasure regression FAILED: PUBLIC holds EXECUTE on erase_my_data (0189 must revoke it)';
  END IF;
END;
$lock$;

DO $lock_call$
DECLARE
  v_refused boolean := false;
BEGIN
  -- A 42501 only means "the ACL on this function" if the caller could have got
  -- that far. MEASURED 2026-09-20 while writing this block: on a scratch database
  -- whose `public` schema carried no USAGE for `authenticated`, the call below
  -- came back 42501 WITH THE GRANT PUT BACK -- a green assertion that was
  -- measuring the harness. So read the one privilege standing between the role
  -- and the function, and refuse to draw a conclusion without it. (The message
  -- itself is not assertable: psql localises it.)
  IF NOT pg_catalog.has_schema_privilege(
       'authenticated', 'public', 'USAGE') THEN
    RAISE EXCEPTION 'erasure regression FAILED: authenticated holds no USAGE on schema public, so a refusal from the call below would not be about erase_my_data';
  END IF;

  -- Set a valid claim FIRST. With no claim, auth.uid() is NULL and the function
  -- raises 28000 from the inside no matter who may execute it, so the assertion
  -- would pass with the grant put back. (2b) measured exactly that trap.
  PERFORM pg_catalog.set_config('request.jwt.claim.sub',
    '11111111-1111-4111-8111-1111111111aa', true);
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM public.erase_my_data('content');
    RESET ROLE;
  EXCEPTION
    WHEN insufficient_privilege THEN
      RESET ROLE;
      v_refused := true;
  END;
  RESET ROLE;
  PERFORM pg_temp.expect(v_refused,
    'authenticated was able to CALL erase_my_data: the RPC did not ship locked');
END;
$lock_call$;

ROLLBACK;

----------------------------------------------------------------------
-- 1 + 4  A normal call: only A's rows go, the receipt says only what the
--        public contract allows it to say, and its total equals a measured
--        before/after delta rather than its own arithmetic.
--
-- ⚠ THE CALL RUNS AS `authenticated`, NOT AS postgres.
--   psql drives this file as the superuser, and until r39 the call inherited
--   that: the JWT claim was set to A but the caller was postgres. So the one
--   thing an EXECUTE grant to `authenticated` exists to make possible was
--   never exercised -- take the grant away and every block here still passed
--   (measured 2026-09-20 on a scratch PostgreSQL 18.3: the old shape returned
--   status "ok" with no grant; this shape raises `permission denied for
--   function erase_my_data`). The fixture is still built as postgres, because
--   RLS would otherwise stop the test writing B's rows; only the call itself
--   changes role, and RESET ROLE hands the transaction straight back.
--
-- ⚠ AND THE GRANT IS THIS TEST'S OWN. 0189 ships the RPC locked (its section 5
--   says why: the 8th gate's M1 concurrent-write hole). Block (L) above has
--   already asserted, in a transaction with no grant in it, that the shipped
--   state refuses `authenticated`. Only then does this block reopen the
--   function for the length of its own transaction, exactly as
--   supabase-dry-run.yml does for 0150's dormant RPC. ROLLBACK takes it back.
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

-- The test's own EXECUTE grant. Shipped state = no grant, and block (L)
-- asserted that one transaction ago; the ROLLBACK below takes this back.
GRANT EXECUTE ON FUNCTION public.erase_my_data(text) TO authenticated;

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


----------------------------------------------------------------------
-- (8) THE DELETE VERDICT, MEASURED INSTEAD OF PARSED.
--
-- WHY THIS BLOCK EXISTS. `client_erasable` means one sentence: "the owner of
-- this row can delete it, and nobody else's row goes with it." For three
-- review rounds that sentence was checked by reading db/migrations, and three
-- times ordinary PostgreSQL walked past the reader while it stayed green --
-- `ALTER POLICY ... USING (user_id <> auth.uid())`, a second permissive
-- `USING (true)` that Postgres ORs in, `AS RESTRICTIVE ... USING (false)` that
-- it ANDs on, a narrowed SELECT policy, `EXECUTE 'DROP POLICY ...'` in single
-- quotes, `REVOKE ... ON ALL TABLES IN SCHEMA public`. Each round closed the
-- spellings it was shown; the next round brought equivalent ones.
--
-- The repo had already proved the reader could not win. 0102_rls_wrap_auth_uid
-- reads pg_policies at run time and issues `ALTER POLICY %I ON %I.%I USING
-- (...)` against every policy in `public` that calls auth.uid(). It names no
-- table, so "the final USING of this table's delete policy is <x>" has not
-- been readable from db/migrations since it landed -- and the USING spellings
-- the guard used to enshrine were read off CREATE statements that 0102 had
-- already rewritten in the database.
--
-- So the verdict moved here. scripts/check-erasure-registry.ts now asserts
-- only what text can support and FAILS CLOSED on syntax it cannot model; this
-- block deletes real rows as the real role and watches what happens. Policy
-- composition, RESTRICTIVE, role inheritance and 0102's live rewrite are all
-- inside the observation, whatever syntax produced them. The table ACL is NOT:
-- this block installs a floor for it, so that verdict is G3b (see below).
--
-- FOUR QUESTIONS PER TABLE, AND EVERY ONE OF THEM ASKED FROM THE ORIGINAL
-- FIXTURE. The questions are numbered, not ordered: no answer may depend on
-- another answer having been measured first.
--   (1) A tries to delete B's rows. 0 rows affected, and B's rows still
--       present afterwards.
--   (2) A deletes its own rows: exactly as many as A owns. A table whose
--       policy admits nothing (`USING (false)`, a revoked grant, a
--       restrictive veto) returns 0 here and fails.
--   (3) `DELETE FROM <table> WHERE true`, asked with NOTHING deleted yet. It
--       names no column, so no SELECT policy narrows it -- and in a correct
--       tree it reaches exactly A's own rows and leaves B's alone.
--   (4) the same column-free statement, asked once A's own rows are gone. Now
--       every row it could reach belongs to someone else, so it must reach
--       none. See the long note inside pg_temp.erasure_ask().
--
-- (3) AND (4) ARE NOT THE SAME QUESTION, and the r44 authorisation gate (F1)
-- is the reason both are here. The previous version had only (4), and it ran
-- in the SAME subtransaction as (1) and (2) -- so A's own DELETE had already
-- happened when it was asked. Deleting A's rows takes A's CASCADE CHILDREN
-- with them, and a DELETE policy whose USING reads those children is therefore
-- WIDE while a real client calls erase_my_data and NARROW by the time this
-- test looks. The gate reproduced it by execution on public.srs_cards, whose
-- srs_reviews are ON DELETE CASCADE (0051_srs_cards.sql:58): a permissive
-- policy admitting every card while A has any review let `DELETE FROM
-- public.srs_cards WHERE true` take B's card for real -- and this block was
-- green. Per-TABLE isolation could not see it, because the state that hid it
-- was destroyed INSIDE the table's own observation. Block (8d) installs that
-- policy and measures both answers on it.
--
-- ...WHICH IS WHY THE SUBTRANSACTION IS NOW PER QUESTION. Every mutation a
-- question makes, A's own DELETE included, happens inside a subtransaction
-- that is ALWAYS unwound before the next question is asked
-- (pg_temp.erasure_observe_table). That subsumes the r43 gate's F1 -- a policy
-- reading ANOTHER registry table, such as `USING (EXISTS (SELECT 1 FROM
-- public.sources WHERE user_id = auth.uid()))` on public.records, which used to
-- be judged after `sources` (delete_order 20) had been emptied on the way to
-- `records` (30). Nothing leaks forward, between tables or within one.
--
-- THE PROOF THAT NOTHING LEAKS IS EXECUTED, NOT ASSERTED: the sweep runs THREE
-- times -- ascending delete_order, descending, and ascending with the four
-- questions asked in reverse -- and all three must return identical numbers for
-- every table. The first pair is order-independence across TABLES; the second
-- is order-independence across QUESTIONS, which the r43 round claimed in prose
-- and did not measure. Drop either subtransaction and the runs disagree the
-- moment any policy reads a second table or its own children. Blocks (8c) and
-- (8d) below then install the two actual counter-examples and require every one
-- of the three runs to refuse them.
--
-- COVERAGE IS STRUCTURAL, NOT A LIST. The loop reads public.erasure_registry,
-- which guard G7 pins byte-identical to db/erasure-registry.json. A new
-- client_erasable table therefore enters this loop automatically, and if the
-- fixture below has no row for it the block fails with "no fixture row" rather
-- than skipping it quietly. A table this test does not observe is a table that
-- falls back to the static guard, and that is the hole this design closes.
----------------------------------------------------------------------

\set uid_c '33333333-3333-4333-8333-3333333333cc'

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.erasure_owner_rows(p_uid uuid, p_tag text, p_other uuid)
RETURNS void
LANGUAGE plpgsql
AS $owner_rows$
DECLARE
  v_page_1  uuid := pg_catalog.gen_random_uuid();
  v_page_2  uuid := pg_catalog.gen_random_uuid();
  v_entity  uuid := pg_catalog.gen_random_uuid();
  v_entity2 uuid := pg_catalog.gen_random_uuid();
  v_card    uuid := pg_catalog.gen_random_uuid();
  v_routine uuid := pg_catalog.gen_random_uuid();
BEGIN
  -- Parents first. The delete ORDER is the reverse concern and is asserted by
  -- G8; here the only requirement is that every FK is satisfiable.
  INSERT INTO public.wiki_pages (id, user_id, slug, kind, title) VALUES
    (v_page_1, p_uid, p_tag || '-page-1', 'concept', 'page 1'),
    (v_page_2, p_uid, p_tag || '-page-2', 'concept', 'page 2');
  INSERT INTO public.wiki_links (user_id, from_page, to_page) VALUES (p_uid, v_page_1, v_page_2);

  INSERT INTO public.sources (user_id, kind, title, storage_path)
    VALUES (p_uid, 'article', p_tag || ' source', 'raw/' || p_tag || '.md');
  INSERT INTO public.records (user_id, kind, body) VALUES (p_uid, 'note', p_tag || ' record');
  INSERT INTO public.self_contexts (user_id, context_kind, label) VALUES (p_uid, 'work', p_tag || ' context');
  INSERT INTO public.personas (user_id, version, traits) VALUES (p_uid, 1, '{}'::jsonb);

  INSERT INTO public.persona_entity (id, user_id, label, name) VALUES
    (v_entity,  p_uid, p_tag || ' entity 1', p_tag || '-e1'),
    (v_entity2, p_uid, p_tag || ' entity 2', p_tag || '-e2');
  INSERT INTO public.persona_relation (user_id, src, dst, rel_type)
    VALUES (p_uid, v_entity, v_entity2, 'knows');
  INSERT INTO public.persona_reasoning_trace (user_id, entity_id, step, source)
    VALUES (p_uid, v_entity, 1, 'test');

  INSERT INTO public.star_tier_history (user_id, star_id, level) VALUES (p_uid, 'seven:now', 2);

  INSERT INTO public.srs_cards (id, user_id, front, back, due)
    VALUES (v_card, p_uid, 'front', 'back', pg_catalog.now());
  INSERT INTO public.srs_reviews (card_id, user_id, rating, reviewed_on)
    VALUES (v_card, p_uid, 3, CURRENT_DATE);

  INSERT INTO public.health_samples (user_id, source, metric_type, value, unit, started_at)
    VALUES (p_uid, 'manual', 'steps', 100, 'count', pg_catalog.now());
  INSERT INTO public.esm_responses (user_id, prompt_kind) VALUES (p_uid, 'energy');
  INSERT INTO public.relation_people (user_id, display_name) VALUES (p_uid, p_tag || ' friend');
  INSERT INTO public.recreation_items (user_id, title) VALUES (p_uid, p_tag || ' hobby');

  INSERT INTO public.ops_routines (id, user_id, domain_id, title)
    VALUES (v_routine, p_uid, 'health', p_tag || ' routine');
  INSERT INTO public.ops_routine_logs (routine_id, user_id, completed_on)
    VALUES (v_routine, p_uid, CURRENT_DATE);
  INSERT INTO public.ops_ledger (user_id, kind, amount_krw) VALUES (p_uid, 'expense', 1000);
  INSERT INTO public.ops_reading (user_id, volume_id, title) VALUES (p_uid, p_tag || '-vol', 'a book');
  INSERT INTO public.ops_milestones (user_id, domain_id, title) VALUES (p_uid, 'health', p_tag || ' milestone');
  INSERT INTO public.ops_meal_plan (user_id, plan_date, slot, title)
    VALUES (p_uid, CURRENT_DATE, 'lunch', p_tag || ' lunch');
  INSERT INTO public.ops_daily_brief (user_id, day) VALUES (p_uid, CURRENT_DATE);

  -- template_blocks is owned by blocker_id and forbids self-blocks, so it
  -- needs a third user to point at.
  INSERT INTO public.template_blocks (blocker_id, blocked_owner_id) VALUES (p_uid, p_other);
  INSERT INTO public.clipper_templates (owner_id, slug, base_kind)
    VALUES (p_uid, p_tag || '-template', 'article');
  INSERT INTO public.testimonials (user_id, body, locale, consent_given_at)
    VALUES (p_uid, p_tag || ' says hello', 'ko', pg_catalog.now());
END;
$owner_rows$;

-- ---------------------------------------------------------------------
-- ONE QUESTION, ASKED FROM THE ORIGINAL FIXTURE, AND EVERY ROW PUT BACK.
--
-- The DELETEs below are real. They run inside a subtransaction whose EXCEPTION
-- clause is reached on EVERY path: the success path raises a sentinel on
-- purpose. PL/pgSQL rolls a block's database changes back when its EXCEPTION
-- clause catches, while local variables keep the values they held at the moment
-- of the error (PostgreSQL manual 43.6.8) -- which is how the measurement
-- survives its own rollback.
--
-- WHY THIS IS A FUNCTION OF ONE QUESTION. The r43 round put each TABLE in its
-- own subtransaction and asked three questions inside it, sequentially. That
-- closed the leak between tables and left the one INSIDE a table wide open,
-- which is the r44 authorisation gate's F1: the second question really deletes
-- A's rows, Postgres really takes A's CASCADE children with them, and the third
-- question is then asked of a database where a policy reading those children
-- has switched itself off. Asking each question through a function body makes
-- the isolation structural rather than remembered -- there is no order in which
-- these four can be asked that lets one of them see another's writes, because
-- each one's writes are gone before it returns.
--
-- The role is set INSIDE the subtransaction too. `SET LOCAL ROLE` is undone
-- when the subtransaction aborts, so no question can inherit another's role,
-- and `SET LOCAL request.jwt.claim.sub` (set at the outer transaction level)
-- survives all of them, which is what keeps `auth.uid()` answering A.
--
-- Failure is never silent. `v_stage` records how far the block got, so a raise
-- from a real statement is reported with its SQLSTATE and its stage, and only
-- the sentinel at stage 'done' is swallowed.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION pg_temp.erasure_ask(
  p_table text, p_owner text, p_a uuid, p_b uuid, p_q int)
RETURNS jsonb
LANGUAGE plpgsql
AS $ask$
DECLARE
  v_n       bigint;
  v_b_after bigint;
  v_stage   text := 'start';
  v_answer  jsonb;
BEGIN
  BEGIN
    SET LOCAL ROLE authenticated;

    CASE p_q
      -- (1) B's rows are not A's to delete, and they are still there to try.
      WHEN 1 THEN
        v_stage := 'delete-other';
        EXECUTE pg_catalog.format('DELETE FROM public.%I WHERE %I = $1', p_table, p_owner)
          USING p_b;
        GET DIAGNOSTICS v_n = ROW_COUNT;

      -- (2) A's own rows are.
      WHEN 2 THEN
        v_stage := 'delete-own';
        EXECUTE pg_catalog.format('DELETE FROM public.%I WHERE %I = $1', p_table, p_owner)
          USING p_a;
        GET DIAGNOSTICS v_n = ROW_COUNT;

      -- (3) THE SAME QUESTION, ASKED WITHOUT NAMING A COLUMN -- AND ASKED
      -- FIRST, BEFORE ANYTHING HAS BEEN DELETED.
      --
      -- (1) and (2) both say `WHERE <owner> = $1`. That reference to a column
      -- makes Postgres apply the table's SELECT policy ON TOP OF its DELETE
      -- policy, so (1) answers 0 rows EVEN IF THE DELETE POLICY IS WIDER. The
      -- r42 authorisation gate proved it by execution on PostgreSQL 18.3,
      -- against this very block, with a DELETE path the static guard also
      -- passes because the role is not named `authenticated`:
      --
      --   CREATE ROLE review_group;  GRANT review_group TO authenticated;
      --   CREATE POLICY review_extra ON public.records
      --     FOR DELETE TO review_group USING (user_id IS NOT NULL);
      --
      -- (1) still reported 0 rows and B still survived -- and
      -- `DELETE FROM public.records WHERE true` deleted B's row.
      --
      -- `WHERE true` names no column, so no SELECT policy narrows it, and role
      -- inheritance, RESTRICTIVE policies and the permissive OR are all inside
      -- the answer whatever spelling produced them. Asked here, with the
      -- fixture untouched, a correct tree answers with exactly the rows A owns
      -- and leaves B's alone. Asked at (4) instead -- which is how the r43
      -- round asked it, and only there -- a policy that READS A'S OWN CASCADE
      -- CHILDREN has already been switched off by A's own DELETE, and the
      -- answer is 0 for the wrong reason (r44 authorisation gate F1, block 8d).
      WHEN 3 THEN
        v_stage := 'probe-unconditional-fresh';
        EXECUTE pg_catalog.format('DELETE FROM public.%I WHERE true', p_table);
        GET DIAGNOSTICS v_n = ROW_COUNT;

      -- (4) ...and the same statement once A's own rows are gone, which is the
      -- complementary half: now every row it CAN reach belongs to someone else,
      -- so it must reach none. A policy that only OPENS after A's rows go --
      -- the mirror image of (3)'s -- is invisible to (3) and caught here. Both
      -- deletes are this question's own, inside this question's subtransaction.
      --
      -- Neither (3) nor (4) can cascade out of the observation: the 14 inbound
      -- FKs to these tables are CASCADE or SET NULL and there is no BEFORE /
      -- AFTER DELETE trigger on any of them, so an error is itself a finding
      -- rather than noise. One CHECK could still raise:
      -- wiki_pages_source_kind_pair (0022_wiki_rag.sql:61) forbids a
      -- kind='source' page with a NULL source_id, and deleting `sources` nulls
      -- that column through ON DELETE SET NULL. Today's fixture inserts only
      -- kind='concept' pages, so it cannot fire; if one day it does, the
      -- handler below reports the SQLSTATE instead of hiding it.
      ELSE
        v_stage := 'delete-own-before-probe';
        EXECUTE pg_catalog.format('DELETE FROM public.%I WHERE %I = $1', p_table, p_owner)
          USING p_a;
        v_stage := 'probe-unconditional-after-own';
        EXECUTE pg_catalog.format('DELETE FROM public.%I WHERE true', p_table);
        GET DIAGNOSTICS v_n = ROW_COUNT;
    END CASE;

    RESET ROLE;
    v_stage := 'recount-other';
    EXECUTE pg_catalog.format('SELECT pg_catalog.count(*) FROM public.%I WHERE %I = $1',
                              p_table, p_owner)
      INTO v_b_after USING p_b;

    v_answer := CASE p_q
      WHEN 1 THEN pg_catalog.jsonb_build_object('deleted_other', v_n, 'b_after_other', v_b_after)
      WHEN 2 THEN pg_catalog.jsonb_build_object('deleted_own', v_n, 'b_after_own', v_b_after)
      WHEN 3 THEN pg_catalog.jsonb_build_object('unconditional_fresh', v_n, 'b_after_fresh', v_b_after)
      ELSE        pg_catalog.jsonb_build_object('unconditional', v_n, 'b_after_probe', v_b_after)
    END;

    -- Unwind. Caught two lines down and discarded; never reaches the caller.
    v_stage := 'done';
    RAISE EXCEPTION 'erasure regression (8): per-question observation rollback';
  EXCEPTION
    WHEN OTHERS THEN
      IF v_stage <> 'done' THEN
        RAISE EXCEPTION
          'erasure regression FAILED (8): question % on public.% raised % (%) at stage "%" as the '
          '`authenticated` role. Either the statement is refused for a reason this test does not '
          'model, or it reached rows it should never have reached and a referential action rejected '
          'the result. Both are findings -- do not silence this by narrowing the observation.',
          p_q, p_table, SQLSTATE, SQLERRM, v_stage;
      END IF;
  END;

  RETURN v_answer;
END;
$ask$;

-- ---------------------------------------------------------------------
-- ONE TABLE'S OBSERVATION: THE FOUR QUESTIONS, IN THE ORDER ASKED FOR.
--
-- `p_order` is a permutation, and it exists so that "the order does not matter"
-- can be EXECUTED rather than asserted: the driver runs the whole sweep once
-- with 1,2,3,4 and once with 4,3,2,1 and demands the same numbers. A question
-- silently not asked would be a silent pass, so the permutation is validated
-- here -- out of range, repeated, or short, and this raises.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION pg_temp.erasure_observe_table(
  p_table text, p_owner text, p_a uuid, p_b uuid, p_order int[])
RETURNS jsonb
LANGUAGE plpgsql
AS $observe$
DECLARE
  v_a_before bigint;
  v_b_before bigint;
  v_q        int;
  v_seen     int[] := ARRAY[]::int[];
  v_out      jsonb;
BEGIN
  EXECUTE pg_catalog.format('SELECT pg_catalog.count(*) FROM public.%I WHERE %I = $1',
                            p_table, p_owner)
    INTO v_a_before USING p_a;
  EXECUTE pg_catalog.format('SELECT pg_catalog.count(*) FROM public.%I WHERE %I = $1',
                            p_table, p_owner)
    INTO v_b_before USING p_b;

  -- The fixture is the coverage guarantee. A table with no row for either user
  -- would make every observation vacuous, so say so loudly instead.
  IF v_a_before < 1 OR v_b_before < 1 THEN
    RAISE EXCEPTION
      'erasure regression FAILED (8): no fixture row for %.% (A=%, B=%). '
      'It is client_erasable, so this test must observe it -- add it to '
      'pg_temp.erasure_owner_rows() rather than letting it fall back to the static guard.',
      p_table, p_owner, v_a_before, v_b_before;
  END IF;

  IF p_order IS NULL OR pg_catalog.array_length(p_order, 1) IS NULL THEN
    RAISE EXCEPTION
      'erasure regression FAILED (8): public.% was asked no questions at all. An empty order is '
      'not an observation.', p_table;
  END IF;

  v_out := pg_catalog.jsonb_build_object('a_before', v_a_before, 'b_before', v_b_before);

  FOREACH v_q IN ARRAY p_order LOOP
    IF v_q < 1 OR v_q > 4 THEN
      RAISE EXCEPTION
        'erasure regression FAILED (8): % is not one of the four questions asked of public.%.',
        v_q, p_table;
    END IF;
    IF v_q = ANY (v_seen) THEN
      RAISE EXCEPTION
        'erasure regression FAILED (8): question % was asked twice of public.%. Each question is '
        'measured once, from the original fixture; asking one twice would hide the second answer '
        'behind the first.', v_q, p_table;
    END IF;
    v_seen := v_seen || v_q;
    -- Each call is its own subtransaction, so this loop cannot carry a row from
    -- one question into the next whichever way round `p_order` puts them.
    v_out := v_out || pg_temp.erasure_ask(p_table, p_owner, p_a, p_b, v_q);
  END LOOP;

  RETURN v_out;
END;
$observe$;

-- ---------------------------------------------------------------------
-- THE WHOLE SWEEP, IN ONE DIRECTION, WITH EVERY VERDICT.
--
-- Returns one jsonb entry per table so the caller can run it three times and
-- compare. Reversing `delete_order` must not change a single number, and
-- neither must reversing the QUESTION order: those are the only executable
-- statements of "no table's observation depends on another table's state" and
-- "no question's answer depends on another question's writes". They go red the
-- moment either subtransaction above is removed.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION pg_temp.erasure_observe_all(
  p_reverse boolean, p_a uuid, p_b uuid, p_order int[])
RETURNS jsonb
LANGUAGE plpgsql
AS $sweep$
DECLARE
  r     record;
  v_row jsonb;
  v_out jsonb := '{}'::jsonb;
BEGIN
  IF pg_catalog.array_length(p_order, 1) IS DISTINCT FROM 4 THEN
    RAISE EXCEPTION
      'erasure regression FAILED (8): a sweep must ask all four questions of every table, and this '
      'one was given %. A sweep that drops a question reports fewer keys and every comparison '
      'against it silently weakens.', COALESCE(pg_catalog.array_length(p_order, 1), 0);
  END IF;

  FOR r IN
    SELECT table_name, owner_column, delete_order
      FROM public.erasure_registry
     WHERE class = 'client_erasable'
     ORDER BY CASE WHEN p_reverse THEN -delete_order ELSE delete_order END
  LOOP
    v_row := pg_temp.erasure_observe_table(r.table_name, r.owner_column, p_a, p_b, p_order);

    -- Every comparison below is an IF on a number, and an IF on NULL does not
    -- fire. A missing measurement would therefore be a SILENT PASS, so demand
    -- that all ten came back as numbers before believing any of them -- the
    -- count as well as the type, because a question that never ran contributes
    -- no key at all rather than a null one.
    IF v_row IS NULL
       OR (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_each(v_row) AS e(k, v)
            WHERE pg_catalog.jsonb_typeof(v) <> 'number') > 0
       OR (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_object_keys(v_row) AS e(k)) <> 10 THEN
      RAISE EXCEPTION
        'erasure regression FAILED (8): the observation of public.% came back incomplete (%). '
        'Ten numbers are expected, one pair per question plus the two pre-counts. A missing number '
        'would make every comparison below NULL, and an IF on NULL does not fire -- which is a '
        'silent pass, not a verdict.',
        r.table_name, COALESCE(v_row::text, '<null>');
    END IF;

    IF (v_row->>'deleted_other')::bigint <> 0 THEN
      RAISE EXCEPTION
        'erasure regression FAILED (8): as authenticated, A deleted % row(s) of B from public.% '
        '(owner column %). One user''s erasure must never reach another user''s rows.',
        (v_row->>'deleted_other')::bigint, r.table_name, r.owner_column;
    END IF;

    IF (v_row->>'b_after_other')::bigint <> (v_row->>'b_before')::bigint THEN
      RAISE EXCEPTION
        'erasure regression FAILED (8): B had % row(s) in public.% before A''s DELETE and % after, '
        'although the DELETE itself reported 0 rows.',
        (v_row->>'b_before')::bigint, r.table_name, (v_row->>'b_after_other')::bigint;
    END IF;

    IF (v_row->>'deleted_own')::bigint <> (v_row->>'a_before')::bigint THEN
      RAISE EXCEPTION
        'erasure regression FAILED (8): public.% is classified client_erasable, but as the real '
        '`authenticated` role A deleted % of its own % row(s). That is the chat_usage defect (F1): '
        'RLS and table privileges filter rows, they do not raise, so a wipe that erased nothing '
        'reports success. Check the FINAL policy set (pg_policies, including RESTRICTIVE ones) and '
        'the table ACL for %.',
        r.table_name, (v_row->>'deleted_own')::bigint, (v_row->>'a_before')::bigint, r.table_name;
    END IF;

    IF (v_row->>'b_after_own')::bigint <> (v_row->>'b_before')::bigint THEN
      RAISE EXCEPTION
        'erasure regression FAILED (8): A deleted its own row(s) from public.% and B was left '
        'holding % of its % row(s). A''s erasure took someone else''s data with it -- through a '
        'cascade, a trigger, or a policy that reached further than the WHERE clause says.',
        r.table_name, (v_row->>'b_after_own')::bigint, (v_row->>'b_before')::bigint;
    END IF;

    IF (v_row->>'unconditional_fresh')::bigint <> (v_row->>'a_before')::bigint
       OR (v_row->>'b_after_fresh')::bigint <> (v_row->>'b_before')::bigint THEN
      RAISE EXCEPTION
        'erasure regression FAILED (8): as the `authenticated` role, `DELETE FROM public.% WHERE true` '
        'asked with NOTHING deleted yet matched % row(s) where A owns %, and left B holding % of its '
        '% row(s). This question is asked from the untouched fixture on purpose. It names no column, '
        'so Postgres applies no SELECT policy and every DELETE path is inside the answer -- including '
        'one reaching `authenticated` through an inherited role, which no policy-text check reads '
        '(r42 authorisation gate F1); one whose USING reads a DIFFERENT table (r43 F1); and one whose '
        'USING reads this table''s OWN CASCADE CHILDREN, which A''s own DELETE would have taken away '
        'before the question could be asked (r44 F1). Read pg_policies for %, every role that '
        '`authenticated` is a member of included.',
        r.table_name, (v_row->>'unconditional_fresh')::bigint, (v_row->>'a_before')::bigint,
        (v_row->>'b_after_fresh')::bigint, (v_row->>'b_before')::bigint, r.table_name;
    END IF;

    IF (v_row->>'unconditional')::bigint <> 0
       OR (v_row->>'b_after_probe')::bigint <> (v_row->>'b_before')::bigint THEN
      RAISE EXCEPTION
        'erasure regression FAILED (8): as the `authenticated` role, `DELETE FROM public.% WHERE true` '
        'asked once A''s own rows were gone matched % row(s) and left B holding % of its % row(s). '
        'Every row that statement could still reach belongs to another user. This is the mirror of '
        'the question above -- it catches a DELETE path that OPENS once A''s rows go, which asking '
        'from the untouched fixture cannot see -- and both deletes happened inside this question''s '
        'own subtransaction. Read pg_policies for %, every role that `authenticated` is a member of '
        'included.',
        r.table_name, (v_row->>'unconditional')::bigint, (v_row->>'b_after_probe')::bigint,
        (v_row->>'b_before')::bigint, r.table_name;
    END IF;

    v_out := v_out || pg_catalog.jsonb_build_object(r.table_name, v_row);
  END LOOP;

  RETURN v_out;
END;
$sweep$;

-- ---------------------------------------------------------------------
-- The privilege FLOOR, and the exact claim it now makes. Read this before
-- changing it: the r42 authorisation gate (F2) broke the previous version's
-- claim by execution, and the replacement deliberately claims less.
--
-- Supabase ships ALTER DEFAULT PRIVILEGES that auto-GRANT anon and
-- authenticated everything on every new table in `public`. The repo says so at
-- 0113_notices.sql:99-100, and the REVOKE-then-GRANT-back pattern in
-- 0092/0097/0113/0141/0175/0176/0177 only makes sense against that baseline.
-- The CI compatibility stub does not have it, so `SET ROLE authenticated;
-- DELETE FROM public.records ...` would raise 42501 for a reason no migration
-- caused, and the observation below would be measuring the stub.
--
-- WHY NO CONDITION READ OFF THIS CATALOG CAN DRIVE THE FLOOR. Two versions
-- tried and both were disproved by execution. `relacl IS NULL` read as honest
-- -- a NULL ACL means no GRANT or REVOKE ever named the table -- but
-- `REVOKE GRANT OPTION FOR DELETE ON public.records FROM authenticated` takes
-- NO privilege away (r41 gate F2) and still materialises relacl, so the loop
-- skipped a table holding prod's defaults and block (8) went red on a statement
-- that changed nothing. `has_table_privilege(...)` then went red the other way:
-- the r43 gates (artifact M2 / authorisation F2) showed that a migration which
-- really does `REVOKE DELETE` leaves the CI stub in the SAME state as one that
-- revokes nothing -- because with no defaults installed there was nothing to
-- take -- so the floor GRANTED THE PRIVILEGE BACK and the revocation was
-- invisible in this lane too. Post-hoc the catalog cannot tell the two apart at
-- all: `REVOKE DELETE` and `REVOKE GRANT OPTION FOR DELETE` leave
-- byte-identical ACLs here. Any condition read off it inherits that.
--
-- SO THE FLOOR IS NOT A JUDGEMENT ANY MORE. It reproduces the platform default
-- UNCONDITIONALLY -- exactly what ALTER DEFAULT PRIVILEGES would have put on
-- each table at CREATE time and nothing else -- and then RE-APPLIES every
-- privilege db/migrations takes back again. That second list is read from the
-- MIGRATION TEXT, not from this database: guard G10 in
-- scripts/check-erasure-registry.ts recomputes it from the same replay that
-- answers G3b and fails if the pin below is stale. So a real `REVOKE DELETE` on
-- an erasable table cannot be masked from either side -- G3b goes red on the
-- text, G10 goes red on the pin, and if someone updates the pin instead then
-- the floor revokes the privilege again and block (8) goes red on the row
-- count. `REVOKE GRANT OPTION FOR DELETE` takes nothing away, so it appears in
-- neither and both lanes stay green (guard tests [13]/[20] and [31]-[34]).
--
-- The floor deliberately does NOT reproduce the whole default. It names
-- `authenticated` and not PUBLIC, because Postgres grants the pseudo-role
-- nothing on a new table and a PUBLIC grant would hide a
-- `REVOKE ... FROM authenticated` behind it; and it grants SELECT and DELETE
-- and not INSERT or UPDATE, because those two are the verbs block (8) issues
-- and a third would over-grant something no pin subtracts.
--
-- Both counts are printed so the environment stays visible instead of assumed.
--
-- The workflow now restores production-shaped GRANT ALL on ai_audit_log and
-- crisis_events before its staged CLI replay; 0179 revokes direct mutation
-- privileges before checking them. That fixture is limited to those two audit
-- tables. This block still models SELECT/DELETE for client_erasable tables
-- only, so its scope and G10 pin remain unchanged.
-- ---------------------------------------------------------------------

DO $baseline$
DECLARE
  -- PINNED FROM db/migrations. Comma-separated `table.privilege` entries, one
  -- per (client_erasable table, privilege in SELECT/DELETE) that a migration
  -- revokes from `authenticated` or `anon`. EMPTY means db/migrations revokes
  -- neither verb from either role on any of them. Do not hand-edit to silence a
  -- failure: G10 derives this same string from the migration text and reports
  -- both values when they differ.
  v_revoked_pin text := ''; -- G10-ACL-PIN
  r        record;
  v_floor  int := 0;
  v_undone int := 0;
  v_item   text;
  v_parts  text[];
  v_table  text;
  v_priv   text;
BEGIN
  FOR r IN
    SELECT c.relname
      FROM pg_catalog.pg_class     AS c
      JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
      JOIN public.erasure_registry AS reg
        ON reg.table_name = c.relname AND reg.class = 'client_erasable'
     WHERE n.nspname = 'public' AND c.relkind = 'r'
  LOOP
    -- SELECT and DELETE only, not the whole default. They are the two verbs
    -- block (8) issues, so they are the two whose absence would make it measure
    -- the stub -- and granting a third would over-grant something no rule below
    -- subtracts: 0097 really does leave template_blocks without UPDATE for
    -- `authenticated`, and a floor that handed it back would be reporting a
    -- privilege the schema does not give. The pin below therefore has exactly
    -- the same vocabulary (FLOOR_PRIVILEGES in scripts/check-erasure-registry.ts).
    EXECUTE pg_catalog.format('GRANT SELECT, DELETE ON public.%I TO authenticated', r.relname);
    v_floor := v_floor + 1;
  END LOOP;

  FOREACH v_item IN ARRAY pg_catalog.string_to_array(v_revoked_pin, ',')
  LOOP
    IF pg_catalog.btrim(v_item) = '' THEN
      CONTINUE;
    END IF;
    v_parts := pg_catalog.string_to_array(pg_catalog.btrim(v_item), '.');
    IF pg_catalog.array_length(v_parts, 1) <> 2 THEN
      RAISE EXCEPTION 'erasure regression FAILED (8): malformed G10-ACL-PIN entry "%"; '
                      'expected <table>.<privilege>', v_item;
    END IF;
    v_table := pg_catalog.lower(v_parts[1]);
    v_priv  := pg_catalog.lower(v_parts[2]);
    -- The pin drives dynamic SQL, so its vocabulary is closed here as well as
    -- in G10: only the two verbs block (8) depends on, and only a table the
    -- registry itself calls client_erasable.
    IF v_priv NOT IN ('select', 'delete') THEN
      RAISE EXCEPTION 'erasure regression FAILED (8): G10-ACL-PIN names privilege "%"; '
                      'only SELECT and DELETE decide this block', v_priv;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.erasure_registry
                    WHERE table_name = v_table AND class = 'client_erasable') THEN
      RAISE EXCEPTION 'erasure regression FAILED (8): G10-ACL-PIN names "%", which is not a '
                      'client_erasable table in public.erasure_registry', v_table;
    END IF;
    EXECUTE pg_catalog.format('REVOKE %s ON public.%I FROM authenticated',
                              pg_catalog.upper(v_priv), v_table);
    v_undone := v_undone + 1;
  END LOOP;

  RAISE NOTICE 'erasure regression (8): Supabase default privileges reproduced on % client_erasable '
               'table(s), then % privilege(s) taken back again because db/migrations revokes them '
               '(pinned from the migration text by guard G10, never from this catalog). The floor '
               'stands in for defaults the CI stub does not have -- the ACL verdict itself is G3b',
               v_floor, v_undone;
END;
$baseline$;

INSERT INTO auth.users (id, email) VALUES
  (:'uid_a', 'erasure-a@example.com'),
  (:'uid_b', 'erasure-b@example.com'),
  (:'uid_c', 'erasure-c@example.com');

-- health_import is ON deliberately. health_samples carries a BEFORE INSERT
-- backstop (0100, re-defined by 0128) that refuses a row unless the owner is an
-- adult who has opted in, so without this the fixture cannot create the health
-- row and the table would report "no fixture row" -- i.e. drop out of the
-- observation. The birth date makes the age gate (0050) derive
-- minor_tier = 'adult'; the clamp only rewrites prefs for minor_self rows.
INSERT INTO public.users (id, email, birth_date, privacy_prefs) VALUES
  (:'uid_a', 'erasure-a@example.com', '1990-01-01', '{"health_import": true}'::jsonb),
  (:'uid_b', 'erasure-b@example.com', '1990-01-01', '{"health_import": true}'::jsonb),
  (:'uid_c', 'erasure-c@example.com', '1990-01-01', '{}'::jsonb);

SELECT pg_temp.erasure_owner_rows(:'uid_a', 'a', :'uid_c');
SELECT pg_temp.erasure_owner_rows(:'uid_b', 'b', :'uid_c');

SET LOCAL request.jwt.claim.sub = :'uid_a';

DO $eight$
DECLARE
  v_a        uuid := '11111111-1111-4111-8111-1111111111aa';
  v_b        uuid := '22222222-2222-4222-8222-2222222222bb';
  v_no_rls   text;
  v_forward  jsonb;
  v_reverse  jsonb;
  v_qreverse jsonb;
  v_visited  int;
  v_probed   int;
  v_fresh    int;
  v_expected int;
  v_diff     text;
BEGIN
  -- A table with RLS switched off answers every observation below by accident:
  -- `authenticated` would hold the privilege and no policy would filter it.
  -- Check the flag itself so a disabled table is a failure, not a pass.
  SELECT pg_catalog.string_agg(c.relname, ', ' ORDER BY c.relname)
    INTO v_no_rls
  FROM public.erasure_registry AS reg
  JOIN pg_catalog.pg_class     AS c ON c.relname = reg.table_name
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace AND n.nspname = 'public'
  WHERE reg.class = 'client_erasable' AND NOT c.relrowsecurity;

  IF v_no_rls IS NOT NULL THEN
    RAISE EXCEPTION
      'erasure regression FAILED (8): client_erasable table(s) with ROW LEVEL SECURITY disabled: %', v_no_rls;
  END IF;

  -- THREE SWEEPS, TWO AXES. Ascending delete_order, then descending -- both
  -- asking the four questions as 1,2,3,4 -- and then ascending again asking
  -- them as 4,3,2,1. Every sweep sees every table in the ORIGINAL fixture
  -- state, and every question sees it too, because pg_temp.erasure_ask()
  -- unwinds its own DELETEs before it returns.
  v_forward  := pg_temp.erasure_observe_all(false, v_a, v_b, ARRAY[1, 2, 3, 4]);
  v_reverse  := pg_temp.erasure_observe_all(true,  v_a, v_b, ARRAY[1, 2, 3, 4]);
  v_qreverse := pg_temp.erasure_observe_all(false, v_a, v_b, ARRAY[4, 3, 2, 1]);

  -- THE ORDER-INDEPENDENCE ASSERTIONS, and they are not decoration. They are
  -- the only executable forms of "no table's verdict depends on another
  -- table's rows" and "no question's answer depends on another question's
  -- writes" -- the two things the r43 and r44 authorisation gates (both F1)
  -- exploited in turn. r43: a DELETE policy reading `sources` was wide when
  -- erase_my_data really runs and narrow by the time the old loop reached
  -- `records`, because the loop had emptied `sources` on the way. r44: a DELETE
  -- policy reading `srs_reviews` was wide until the observation's OWN second
  -- question deleted A's `srs_cards` and cascaded those reviews away. Remove
  -- either subtransaction and these documents stop matching. Blocks (8c) and
  -- (8d) below install those two policies and require all three sweeps to
  -- refuse them.
  --
  -- The two comparisons are separate on purpose: collapsing them would let one
  -- axis stand in for the other, and it was exactly such a substitution --
  -- table order read as evidence of question order -- that the r43 round's
  -- prose made and the r44 gate disproved.
  IF v_forward <> v_reverse THEN
    SELECT pg_catalog.string_agg(
             pg_catalog.format('%s: ascending %s vs descending %s', t.k, v_forward -> t.k, v_reverse -> t.k),
             '; ' ORDER BY t.k)
      INTO v_diff
    FROM pg_catalog.jsonb_object_keys(v_forward) AS t(k)
    WHERE (v_forward -> t.k) IS DISTINCT FROM (v_reverse -> t.k);
    RAISE EXCEPTION
      'erasure regression FAILED (8): the same sweep produced different numbers in ascending and '
      'descending delete_order, so at least one table''s observation depends on another table''s '
      'rows: %. Every observation must start from the original fixture -- that is what the '
      'per-question subtransaction in pg_temp.erasure_ask() is for (r43 authorisation '
      'gate F1).', COALESCE(v_diff, '<key sets differ>');
  END IF;

  IF v_forward <> v_qreverse THEN
    SELECT pg_catalog.string_agg(
             pg_catalog.format('%s: questions 1,2,3,4 %s vs 4,3,2,1 %s', t.k, v_forward -> t.k, v_qreverse -> t.k),
             '; ' ORDER BY t.k)
      INTO v_diff
    FROM pg_catalog.jsonb_object_keys(v_forward) AS t(k)
    WHERE (v_forward -> t.k) IS DISTINCT FROM (v_qreverse -> t.k);
    RAISE EXCEPTION
      'erasure regression FAILED (8): asking the four questions in reverse produced different '
      'numbers, so at least one question''s answer depends on another question having run first: '
      '%. That is the r44 authorisation gate''s F1 -- A''s own DELETE takes A''s CASCADE children '
      'with it, and a policy that reads those children answers differently on either side of it. '
      'Each question must start from the original fixture, which is what the subtransaction in '
      'pg_temp.erasure_ask() is for.', COALESCE(v_diff, '<key sets differ>');
  END IF;

  SELECT pg_catalog.count(*) INTO v_expected
    FROM public.erasure_registry WHERE class = 'client_erasable';
  SELECT pg_catalog.count(*) INTO v_visited
    FROM pg_catalog.jsonb_object_keys(v_forward) AS t(k);
  -- Counted from the DATA, not from a loop variable, and separately from
  -- v_visited on purpose: a table observed without its column-free probes is a
  -- coverage hole of its own, and they are the numbers the PASS line reprints.
  -- Counting them together would let one stand in for the other -- and the two
  -- probes are counted apart from each other for the same reason: question (3)
  -- and question (4) ask the same statement of two different states, and it is
  -- (3) that the r44 gate showed was missing.
  SELECT pg_catalog.count(*) INTO v_probed
    FROM pg_catalog.jsonb_each(v_forward) AS e(k, v)
   WHERE pg_catalog.jsonb_typeof(v -> 'unconditional') = 'number';
  SELECT pg_catalog.count(*) INTO v_fresh
    FROM pg_catalog.jsonb_each(v_forward) AS e(k, v)
   WHERE pg_catalog.jsonb_typeof(v -> 'unconditional_fresh') = 'number';

  IF v_visited <> v_expected THEN
    RAISE EXCEPTION 'erasure regression FAILED (8): observed % of % client_erasable tables', v_visited, v_expected;
  END IF;
  IF v_probed <> v_expected THEN
    RAISE EXCEPTION 'erasure regression FAILED (8): unconditional-delete probed % of % client_erasable tables', v_probed, v_expected;
  END IF;
  IF v_fresh <> v_expected THEN
    RAISE EXCEPTION
      'erasure regression FAILED (8): the untouched-fixture unconditional probe ran on % of % '
      'client_erasable tables. It is question (3), and it is the only one that can see a DELETE '
      'policy which A''s own erasure switches off (r44 authorisation gate F1).',
      v_fresh, v_expected;
  END IF;

  RAISE NOTICE 'erasure regression (8): % client_erasable tables observed as the authenticated role, '
               'EACH QUESTION inside its own rolled-back savepoint; % probed with a column-free '
               'DELETE ... WHERE true from the UNTOUCHED fixture and % with the same statement once '
               'A''s own rows were gone; and the sweep re-run in reverse delete_order AND with the '
               'four questions reversed produced identical numbers for all % tables '
               '(% question observations in total)',
               v_visited, v_fresh, v_probed, v_visited, v_visited * 4 * 3;
END;
$eight$;

----------------------------------------------------------------------
-- (8c) THE COUNTER-EXAMPLE THIS DESIGN EXISTS FOR, INSTALLED AND REFUSED.
--
-- A test nobody has seen fail is not evidence. Block (8) is green on today's
-- schema, so on its own it cannot show that the isolation it added is
-- load-bearing. This installs the r43 authorisation gate's F1 mutation FOR REAL
-- -- in the same transaction, on the same fixture, which block (8) left
-- untouched because it put every row back -- and requires the sweep to refuse
-- it in ALL THREE of the runs block (8) makes.
--
--   CREATE ROLE erasure_review_probe;
--   GRANT erasure_review_probe TO authenticated;
--   CREATE POLICY ... ON public.records FOR DELETE TO erasure_review_probe
--     USING (EXISTS (SELECT 1 FROM public.sources WHERE user_id = (SELECT auth.uid())));
--
-- Three properties make it the exact shape that got through before:
--   * the role is not `authenticated`, so no policy-TEXT check reads it -- and
--     `authenticated` inherits it (r42 authorisation gate F1);
--   * the owner-bound SELECT policy on `records` still hides it from
--     questions (1) and (2), so only a column-free probe can see it;
--   * its USING reads `sources`, whose delete_order (20) is BELOW `records`
--     (30). The OLD loop had already deleted A's sources by the time it judged
--     `records`, so ASCENDING order was GREEN and only DESCENDING was RED. That
--     asymmetry is the finding, and it is why this block asserts every run.
--
-- The role and the policy are created inside this file's transaction and the
-- final ROLLBACK removes them; they are also dropped explicitly below so no
-- later statement can inherit them by accident.
----------------------------------------------------------------------

DO $eight_c$
DECLARE
  v_a      uuid := '11111111-1111-4111-8111-1111111111aa';
  v_b      uuid := '22222222-2222-4222-8222-2222222222bb';
  v_may    boolean;
  v_run    record;
  v_failed text[] := ARRAY[]::text[];
BEGIN
  -- Fail closed rather than skip: a run that cannot create the role cannot make
  -- this claim, and passing quietly would be the same false green the gates
  -- keep finding.
  SELECT r.rolsuper OR r.rolcreaterole INTO v_may
    FROM pg_catalog.pg_roles AS r WHERE r.rolname = CURRENT_USER;
  IF NOT COALESCE(v_may, false) THEN
    RAISE EXCEPTION
      'erasure regression FAILED (8c): % is neither superuser nor CREATEROLE, so the '
      'inherited-role counter-example cannot be installed and block (8) is unproven in this run. '
      'The workflow connects as postgres (.github/workflows/supabase-dry-run.yml).', CURRENT_USER;
  END IF;

  CREATE ROLE erasure_review_probe;
  GRANT erasure_review_probe TO authenticated;
  CREATE POLICY erasure_r43_f1_probe ON public.records
    FOR DELETE TO erasure_review_probe
    USING (EXISTS (SELECT 1 FROM public.sources AS s WHERE s.user_id = (SELECT auth.uid())));

  -- The same three runs block (8) makes, named, so a failure says WHICH one.
  FOR v_run IN
    SELECT d.label, d.rev, d.ord
      FROM (VALUES ('ascending',        false, ARRAY[1, 2, 3, 4]),
                   ('descending',       true,  ARRAY[1, 2, 3, 4]),
                   ('questions 4,3,2,1', false, ARRAY[4, 3, 2, 1])) AS d(label, rev, ord)
  LOOP
    BEGIN
      PERFORM pg_temp.erasure_observe_all(v_run.rev, v_a, v_b, v_run.ord);
      v_failed := v_failed || (v_run.label || ': the sweep did NOT refuse it')::text;
    EXCEPTION
      WHEN OTHERS THEN
        IF SQLERRM NOT LIKE '%DELETE FROM public.records WHERE true%' THEN
          v_failed := v_failed ||
            (v_run.label || ': refused for the wrong reason: ' || SQLERRM)::text;
        END IF;
    END;
  END LOOP;

  DROP POLICY erasure_r43_f1_probe ON public.records;
  REVOKE erasure_review_probe FROM authenticated;
  DROP ROLE erasure_review_probe;

  IF pg_catalog.array_length(v_failed, 1) > 0 THEN
    RAISE EXCEPTION
      'erasure regression FAILED (8c): the cross-table conditional DELETE policy of r43 '
      'authorisation gate F1 was not caught: %. Block (8) therefore does not observe what it '
      'claims to, and the isolation in pg_temp.erasure_ask() is not doing its job.',
      pg_catalog.array_to_string(v_failed, ' | ');
  END IF;

  RAISE NOTICE 'erasure regression (8c): the r43 F1 inherited-role, cross-table conditional DELETE '
               'policy on public.records was refused in ALL THREE runs -- both delete_order '
               'directions and the reversed question order -- by a column-free probe, with A''s '
               'public.sources rows still present, which is only true because every question is '
               'asked inside its own rolled-back savepoint';
END;
$eight_c$;

----------------------------------------------------------------------
-- (8d) THE COUNTER-EXAMPLE THE PER-TABLE SAVEPOINT COULD NOT SEE.
--
-- (8c) proves isolation BETWEEN tables. This proves isolation between
-- QUESTIONS, and it is the r44 authorisation gate's F1 installed for real.
--
--   CREATE ROLE erasure_cascade_probe;
--   GRANT erasure_cascade_probe TO authenticated;
--   CREATE POLICY ... ON public.srs_cards FOR DELETE TO erasure_cascade_probe
--     USING (EXISTS (SELECT 1 FROM public.srs_reviews WHERE user_id = (SELECT auth.uid())));
--
-- Everything that made (8c) invisible to a policy-text check is here too -- an
-- inherited role, an owner-bound SELECT policy hiding it from the questions
-- that name a column -- plus the one property that defeated the r43 design:
-- the table it reads is its OWN CASCADE CHILD. srs_reviews.card_id REFERENCES
-- srs_cards(id) ON DELETE CASCADE (0051_srs_cards.sql:58), so the moment A
-- deletes A's cards, A's reviews go with them and this policy closes. Putting
-- each TABLE in a savepoint does not help: the state that hid the policy was
-- destroyed inside srs_cards' own observation, by srs_cards' own question.
--
-- SO THIS BLOCK MEASURES BOTH ANSWERS ON ONE POLICY rather than only asserting
-- the refusal. Question (4) alone -- the r43 design -- is asked first and must
-- come back CLEAN; question (3) alone must come back RED. A single number
-- separating them is the whole argument for the change, and if a later edit
-- makes (4) catch it too, the numbers say so instead of the prose.
----------------------------------------------------------------------

DO $eight_d$
DECLARE
  v_a       uuid := '11111111-1111-4111-8111-1111111111aa';
  v_b       uuid := '22222222-2222-4222-8222-2222222222bb';
  v_run     record;
  v_after   jsonb;
  v_fresh   jsonb;
  v_failed  text[] := ARRAY[]::text[];
BEGIN
  CREATE ROLE erasure_cascade_probe;
  GRANT erasure_cascade_probe TO authenticated;
  CREATE POLICY erasure_r44_f1_probe ON public.srs_cards
    FOR DELETE TO erasure_cascade_probe
    USING (EXISTS (SELECT 1 FROM public.srs_reviews AS r WHERE r.user_id = (SELECT auth.uid())));

  -- THE OLD DESIGN'S ANSWER, on this exact policy and this exact fixture.
  v_after := pg_temp.erasure_observe_table('srs_cards', 'user_id', v_a, v_b, ARRAY[4]);
  IF (v_after->>'unconditional')::bigint <> 0
     OR (v_after->>'b_after_probe')::bigint <> (v_after->>'b_before')::bigint THEN
    v_failed := v_failed ||
      ('question (4) unexpectedly caught it (' || v_after::text || '); this block no longer '
       || 'demonstrates what it claims and its premise must be rechecked')::text;
  END IF;

  -- THE NEW QUESTION'S ANSWER, same policy, same fixture, nothing deleted yet.
  v_fresh := pg_temp.erasure_observe_table('srs_cards', 'user_id', v_a, v_b, ARRAY[3]);
  IF (v_fresh->>'unconditional_fresh')::bigint
       <= (v_fresh->>'a_before')::bigint THEN
    v_failed := v_failed ||
      ('question (3) did NOT reach past A''s own rows (' || v_fresh::text || ')')::text;
  END IF;
  IF (v_fresh->>'b_after_fresh')::bigint >= (v_fresh->>'b_before')::bigint THEN
    v_failed := v_failed ||
      ('question (3) left B''s rows intact (' || v_fresh::text || '), so the policy did not '
       || 'reach them and this is not the r44 F1 shape')::text;
  END IF;

  -- ...and the full sweep must refuse it in all three runs, for THIS table.
  FOR v_run IN
    SELECT d.label, d.rev, d.ord
      FROM (VALUES ('ascending',        false, ARRAY[1, 2, 3, 4]),
                   ('descending',       true,  ARRAY[1, 2, 3, 4]),
                   ('questions 4,3,2,1', false, ARRAY[4, 3, 2, 1])) AS d(label, rev, ord)
  LOOP
    BEGIN
      PERFORM pg_temp.erasure_observe_all(v_run.rev, v_a, v_b, v_run.ord);
      v_failed := v_failed || (v_run.label || ': the sweep did NOT refuse it')::text;
    EXCEPTION
      WHEN OTHERS THEN
        IF SQLERRM NOT LIKE '%DELETE FROM public.srs_cards WHERE true%' THEN
          v_failed := v_failed ||
            (v_run.label || ': refused for the wrong reason: ' || SQLERRM)::text;
        END IF;
    END;
  END LOOP;

  DROP POLICY erasure_r44_f1_probe ON public.srs_cards;
  REVOKE erasure_cascade_probe FROM authenticated;
  DROP ROLE erasure_cascade_probe;

  IF pg_catalog.array_length(v_failed, 1) > 0 THEN
    RAISE EXCEPTION
      'erasure regression FAILED (8d): the CASCADE-child conditional DELETE policy of r44 '
      'authorisation gate F1 was not handled as claimed: %. Per-question isolation is what this '
      'block exists to prove; without it the r43 design reports 0 for the wrong reason.',
      pg_catalog.array_to_string(v_failed, ' | ');
  END IF;

  RAISE NOTICE 'erasure regression (8d): the r44 F1 inherited-role DELETE policy reading '
               'public.srs_cards'' OWN CASCADE CHILD was INVISIBLE to question (4) '
               '(unconditional=%, B kept %/%) and caught by question (3) '
               '(unconditional_fresh=% where A owns %, B left with %/%) -- and the full sweep '
               'refused it in all three runs',
               (v_after->>'unconditional')::bigint,
               (v_after->>'b_after_probe')::bigint, (v_after->>'b_before')::bigint,
               (v_fresh->>'unconditional_fresh')::bigint, (v_fresh->>'a_before')::bigint,
               (v_fresh->>'b_after_fresh')::bigint, (v_fresh->>'b_before')::bigint;
END;
$eight_d$;
ROLLBACK;

----------------------------------------------------------------------
-- (8b) THE MEASUREMENT THAT RETIRED THE STATIC USING CHECK.
--
-- Not an assertion -- a number, printed, so the claim in the boundary note
-- above is checkable from a CI log instead of taken on trust. The static guard
-- used to read the USING text out of each table's CREATE POLICY and match it
-- against three spellings. This counts how many of those same policies the
-- DATABASE now renders differently, because 0102 rewrote them in place. Every
-- row of difference is a row where the file and the catalog disagreed and the
-- file was the one being believed.
----------------------------------------------------------------------

BEGIN;
DO $eight_b$
DECLARE
  v_total   int;
  v_wrapped int;
BEGIN
  SELECT pg_catalog.count(*),
         pg_catalog.count(*) FILTER (WHERE p.qual LIKE '%SELECT auth.uid()%')
    INTO v_total, v_wrapped
  FROM pg_catalog.pg_policies AS p
  JOIN public.erasure_registry AS reg
    ON reg.table_name = p.tablename AND reg.class = 'client_erasable'
  WHERE p.schemaname = 'public' AND p.cmd IN ('ALL', 'DELETE');

  RAISE NOTICE
    'erasure regression (8b): % of % live DELETE/ALL policies on client_erasable tables carry the '
    '0102 initplan rewrite, which no CREATE POLICY in db/migrations spells',
    v_wrapped, v_total;
END;
$eight_b$;
ROLLBACK;

-- The count below is read from the registry, not from block (8) -- a ROLLBACK
-- cannot carry a counter out. It is not a free-floating number even so: block
-- (8) raises unless v_visited, v_probed AND v_fresh each equal exactly this
-- count, and unless the reverse-TABLE-order and reverse-QUESTION-order sweeps
-- both returned the same numbers table by table; then (8c) and (8d) raise
-- unless their counter-examples are refused in all three runs. With
-- `ON ERROR STOP` set, this line is unreachable if any of that failed.
SELECT 'ERASURE REGRESSION PASS  erase_my_data: SHIPS LOCKED (authenticated holds no EXECUTE - asserted on the catalog AND by a refused real call, on a database first PROVEN to stamp the Supabase by-name EXECUTE defaults on a new function, before this file grants itself one inside a rolled-back transaction), strict assertions, authenticated call, isolation, refusals without reflection, public receipt contract, measured row deltas, atomicity, registry ACL, catalog cascade parity, and every client_erasable table observed as the authenticated role with EACH OF ITS FOUR QUESTIONS INSIDE ITS OWN ROLLED-BACK SAVEPOINT (own row deleted, other user''s row refused, '
    || (SELECT pg_catalog.count(*) FROM public.erasure_registry WHERE class = 'client_erasable')::text
    || ' tables unconditional-delete probed BOTH from the untouched fixture and after A''s own rows were gone), the whole sweep RE-RUN IN REVERSE delete_order AND WITH THE FOUR QUESTIONS REVERSED with identical numbers per table, the r43 F1 inherited-role cross-table conditional DELETE policy refused in all three runs, and the r44 F1 CASCADE-child conditional DELETE policy measured invisible to the old question and caught by the new one' AS result;
