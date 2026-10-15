\set ON_ERROR_STOP on
-- Scratch database only. The unnumbered draft and all fixtures roll back.
BEGIN;
-- Vanilla scratch Postgres has no Supabase default table grants. These fixture
-- grants let the real owner RLS run; they are not part of the draft migration.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.records, public.sources, public.wiki_pages TO authenticated;
GRANT SELECT ON public.users TO authenticated;
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users (id, email) VALUES
  ('28000000-0000-4000-8000-000000000001', 'hold-one@example.invalid'),
  ('28000000-0000-4000-8000-000000000002', 'hold-two@example.invalid');
SET LOCAL session_replication_role = origin;
INSERT INTO public.users (id, email, birth_date, locale) VALUES
  ('28000000-0000-4000-8000-000000000001', 'hold-one@example.invalid', '1990-01-01', 'en'),
  ('28000000-0000-4000-8000-000000000002', 'hold-two@example.invalid', '1990-01-01', 'en');

-- Pre-existing RED and server interview hold; no prose-based classification.
INSERT INTO public.records (id, user_id, kind, body, ai_followup, interview_ai_hold, embedding, embedding_model) VALUES
  ('28000000-0000-4000-8000-000000000011', '28000000-0000-4000-8000-000000000001', 'note', 'original one', '{"zone":"red"}', false, array_fill(1::real, ARRAY[768])::vector, 'test'),
  ('28000000-0000-4000-8000-000000000012', '28000000-0000-4000-8000-000000000001', 'note', 'original two', null, true, array_fill(1::real, ARRAY[768])::vector, 'test'),
  ('28000000-0000-4000-8000-000000000013', '28000000-0000-4000-8000-000000000001', 'note', 'ordinary note', null, false, array_fill(1::real, ARRAY[768])::vector, 'test');

\ir ../migration-drafts/UNNUMBERED_crisis_ai_hold.sql

CREATE FUNCTION pg_temp.assert_true(value boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'assertion failed: %', label; END IF;
END;
$$;
SELECT pg_temp.assert_true((SELECT count(*) = 2 FROM public.records WHERE ai_hold), 'existing flags backfilled');
SELECT pg_temp.assert_true((SELECT count(*) = 2 FROM public.records WHERE ai_hold AND embedding IS NULL AND embedding_model IS NULL), 'held vectors removed');
SELECT pg_temp.assert_true((SELECT body = 'original one' AND ai_followup = '{"zone":"red"}'::jsonb FROM public.records WHERE id = '28000000-0000-4000-8000-000000000011'), 'original data retained');
SELECT pg_temp.assert_true((SELECT embedding IS NOT NULL AND embedding_model = 'test' FROM public.records WHERE id = '28000000-0000-4000-8000-000000000013'), 'ordinary vector retained');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '28000000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true((SELECT count(*) = 3 FROM public.records), 'owner can still read all originals');
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM public.records_ai_eligible), 'AI view excludes both kinds of hold');
UPDATE public.records SET ai_hold = false, ai_followup = null, body = 'edited original',
  embedding = array_fill(1::real, ARRAY[768])::vector, embedding_model = 'attempt'
WHERE id = '28000000-0000-4000-8000-000000000011';
SELECT pg_temp.assert_true((SELECT ai_hold AND body = 'edited original' AND embedding IS NULL AND embedding_model IS NULL
  FROM public.records WHERE id = '28000000-0000-4000-8000-000000000011'), 'editing or clearing follow-up never releases hold');
INSERT INTO public.records (id, user_id, kind, body, ai_hold) VALUES
  ('28000000-0000-4000-8000-000000000014', '28000000-0000-4000-8000-000000000001', 'note', 'known local result', true);
INSERT INTO public.records (id, user_id, kind, body, ai_followup) VALUES
  ('28000000-0000-4000-8000-000000000015', '28000000-0000-4000-8000-000000000001', 'note', 'known returned result', '{"zone":"red"}');
SELECT pg_temp.assert_true((SELECT count(*) = 4 FROM public.records WHERE ai_hold), 'new client and legacy RED inserts held');

INSERT INTO public.sources (id, user_id, kind, title, storage_path, ai_hold) VALUES
  ('28000000-0000-4000-8000-000000000021', '28000000-0000-4000-8000-000000000001', 'self_knowledge', 'Held source', 'owner/kept.md', true),
  ('28000000-0000-4000-8000-000000000022', '28000000-0000-4000-8000-000000000001', 'self_knowledge', 'Plain source', 'owner/plain.md', false);
UPDATE public.sources SET ai_hold = false, title = 'Edited source' WHERE id = '28000000-0000-4000-8000-000000000021';
SELECT pg_temp.assert_true((SELECT count(*) = 2 FROM public.sources), 'sources remain available to owner');
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM public.sources_ai_eligible), 'source hold cannot be cleared');
INSERT INTO public.wiki_pages (id, user_id, slug, kind, title, body_md, source_id, ai_hold) VALUES
  ('28000000-0000-4000-8000-000000000031', '28000000-0000-4000-8000-000000000001', 'hold-source', 'source', 'Source page', 'source body', '28000000-0000-4000-8000-000000000021', false),
  ('28000000-0000-4000-8000-000000000032', '28000000-0000-4000-8000-000000000001', 'hold-entity', 'entity', 'Held page', 'page body', null, true),
  ('28000000-0000-4000-8000-000000000033', '28000000-0000-4000-8000-000000000001', 'ordinary-source', 'source', 'Plain page', 'plain body', '28000000-0000-4000-8000-000000000022', false);
UPDATE public.wiki_pages SET ai_hold = false, embedding = array_fill(1::real, ARRAY[768])::vector, embedding_model = 'attempt'
WHERE id = '28000000-0000-4000-8000-000000000032';
SELECT pg_temp.assert_true((SELECT ai_hold AND embedding IS NULL AND embedding_model IS NULL FROM public.wiki_pages
  WHERE id = '28000000-0000-4000-8000-000000000032'), 'held wiki vector write refused');
SELECT pg_temp.assert_true((SELECT count(*) = 3 FROM public.wiki_pages), 'user can read all pages');
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM public.wiki_pages_ai_eligible), 'direct source and page hold excluded');
UPDATE public.sources SET ai_hold = true WHERE id = '28000000-0000-4000-8000-000000000022';
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM public.wiki_pages_ai_eligible), 'late parent hold immediately excludes page');
UPDATE public.wiki_pages SET kind = 'entity', source_id = null, ai_hold = false
WHERE id = '28000000-0000-4000-8000-000000000033';
SELECT pg_temp.assert_true((SELECT ai_hold FROM public.wiki_pages WHERE id = '28000000-0000-4000-8000-000000000033'), 'repointing a held source page cannot release it');

DO $refusals$
BEGIN
  BEGIN
    UPDATE public.records_ai_eligible SET body = 'view write';
    RAISE EXCEPTION 'AI view unexpectedly writable';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.records SET ai_hold = null WHERE id = '28000000-0000-4000-8000-000000000014';
    RAISE EXCEPTION 'null hold unexpectedly accepted';
  EXCEPTION WHEN null_value_not_allowed THEN NULL;
  END;
END;
$refusals$;

-- RLS is evaluated as the caller, not as the view creator.
SET LOCAL request.jwt.claim.sub = '28000000-0000-4000-8000-000000000002';
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM public.records_ai_eligible), 'record view has owner isolation');
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM public.sources_ai_eligible), 'source view has owner isolation');
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM public.wiki_pages_ai_eligible), 'wiki view has owner isolation');
UPDATE public.records SET ai_hold = true WHERE user_id = '28000000-0000-4000-8000-000000000001';
RESET ROLE;
SELECT pg_temp.assert_true((SELECT NOT ai_hold FROM public.records WHERE id = '28000000-0000-4000-8000-000000000013'), 'foreign update changed no row');
UPDATE public.records SET interview_ai_hold = true WHERE id = '28000000-0000-4000-8000-000000000013';
SELECT pg_temp.assert_true((SELECT ai_hold AND embedding IS NULL FROM public.records WHERE id = '28000000-0000-4000-8000-000000000013'), 'late server interview hold inherited');

DO $acl$
DECLARE relation text; helper text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['records_ai_eligible', 'sources_ai_eligible', 'wiki_pages_ai_eligible'] LOOP
    PERFORM pg_temp.assert_true(NOT has_table_privilege('anon', 'public.' || relation, 'SELECT'), 'anon has no view access');
    PERFORM pg_temp.assert_true(has_table_privilege('authenticated', 'public.' || relation, 'SELECT'), 'owner can read view');
    PERFORM pg_temp.assert_true(NOT has_table_privilege('authenticated', 'public.' || relation, 'INSERT,UPDATE,DELETE'), 'view is read-only to client');
    PERFORM pg_temp.assert_true((SELECT reloptions @> ARRAY['security_invoker=true','security_barrier=true'] FROM pg_class WHERE oid = ('public.' || relation)::regclass), 'view security options');
  END LOOP;
  FOREACH helper IN ARRAY ARRAY['guard_record_ai_hold()', 'guard_source_ai_hold()', 'guard_wiki_page_ai_hold()'] LOOP
    PERFORM pg_temp.assert_true(NOT has_function_privilege('authenticated', 'public.' || helper, 'EXECUTE'), 'helper cannot be called directly');
  END LOOP;
END;
$acl$;

-- Reapplication cannot reset the bits or erase the original rows.
\ir ../migration-drafts/UNNUMBERED_crisis_ai_hold.sql
SELECT pg_temp.assert_true((SELECT count(*) = 5 FROM public.records WHERE ai_hold), 'reapply retains all holds');
SELECT pg_temp.assert_true((SELECT count(*) = 2 FROM public.sources WHERE ai_hold), 'reapply retains source holds');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '28000000-0000-4000-8000-000000000001';
DELETE FROM public.records WHERE id = '28000000-0000-4000-8000-000000000014';
SELECT pg_temp.assert_true((SELECT count(*) = 4 FROM public.records), 'owner can delete a held original');
RESET ROLE;
ROLLBACK;
