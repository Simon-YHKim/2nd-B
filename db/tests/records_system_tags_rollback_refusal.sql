\set ON_ERROR_STOP on

-- Gate CDA-03 (2026-10-06): rollback/0218_down.sql must stop BEFORE it changes
-- anything when a re-apply of 0218 would not bring every row back to the same
-- (tags, system_tags). This file is EXPECTED TO FAIL: the CI step runs it, checks
-- that psql exits non-zero with the guard's message, and that the line after the
-- rollback was never reached. It runs in one transaction that never commits.
--
-- Two rows the guard must count:
--   1. a TTFV note whose body was edited after 0218 split it (a re-apply looks
--      for the TTFV sentence and would leave the markers as user tags);
--   2. a row without system_tags whose user tags now have the interview's leading
--      shape (a user UPDATE does not split it, but a re-apply's backfill would
--      take the user's three tags as markers).
BEGIN;

INSERT INTO auth.users (id, email)
VALUES ('5a5a0218-0000-4000-8000-000000000002', 'system-tags-refusal-ci@example.invalid');
INSERT INTO public.users (id, email, birth_date, locale)
VALUES ('5a5a0218-0000-4000-8000-000000000002', 'system-tags-refusal-ci@example.invalid', DATE '1990-01-01', 'en');

INSERT INTO public.records (id, user_id, kind, body, tags, system_tags) VALUES
  ('5a5a0218-0000-4000-8000-0000000000f1', '5a5a0218-0000-4000-8000-000000000002', 'note',
   'First record review: This record still feels like me.',
   ARRAY['domain:collect'], ARRAY['first_light', 'first_light:affirm']);
UPDATE public.records SET body = 'I rewrote this note.' WHERE id = '5a5a0218-0000-4000-8000-0000000000f1';

INSERT INTO public.records (id, user_id, kind, audit_period, body, tags) VALUES
  ('5a5a0218-0000-4000-8000-0000000000f2', '5a5a0218-0000-4000-8000-000000000002', 'audit_response', 'current',
   'an answer the user tags by hand', ARRAY['domain:career']);
UPDATE public.records SET tags = tags || ARRAY['interview', 'recall', 'screener']
 WHERE id = '5a5a0218-0000-4000-8000-0000000000f2';

-- Both rows are as the user left them before the rollback is tried.
DO $before$
BEGIN
  IF (SELECT system_tags FROM public.records WHERE id = '5a5a0218-0000-4000-8000-0000000000f1')
       IS DISTINCT FROM ARRAY['first_light', 'first_light:affirm']
     OR (SELECT tags FROM public.records WHERE id = '5a5a0218-0000-4000-8000-0000000000f2')
       IS DISTINCT FROM ARRAY['domain:career', 'interview', 'recall', 'screener'] THEN
    RAISE EXCEPTION 'UNEXPECTED: refusal fixture is not in the expected state';
  END IF;
END
$before$;

\i db/migrations/rollback/0218_down.sql

SELECT 'UNEXPECTED: the 0218 rollback ran although a re-apply could not restore 2 rows';
ROLLBACK;
