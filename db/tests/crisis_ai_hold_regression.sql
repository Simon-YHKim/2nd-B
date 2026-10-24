\set ON_ERROR_STOP on
-- Scratch pre-0270 snapshot only. The numbered install and all fixtures roll back.
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

-- 0263 is installed. Without a real consent grant every fixture vector would
-- already be NULL, hiding the backfill/delete-guard collision.
UPDATE public.users SET privacy_prefs = privacy_prefs || jsonb_build_object(
  'records_embedding', true, 'records_embedding_enable_revision',
  (privacy_prefs ->> 'records_embedding_revision')::bigint + 1)
WHERE id IN ('28000000-0000-4000-8000-000000000001', '28000000-0000-4000-8000-000000000002');

CREATE TEMP TABLE consent_functions_before AS
SELECT oid, pg_get_functiondef(oid) AS definition, proacl FROM pg_proc
WHERE oid IN ('public.guard_record_embedding_delete()'::regprocedure,
  'public.guard_record_embedding_write()'::regprocedure,
  'public.guard_records_embedding_consent()'::regprocedure,
  'public.clear_record_embeddings_on_privacy_change()'::regprocedure);
CREATE TEMP TABLE consent_triggers_before AS
SELECT oid, pg_get_triggerdef(oid) AS definition, tgenabled FROM pg_trigger
WHERE tgname IN ('zz_records_embedding_delete_guard', 'zz_records_embedding_write_guard',
  'zz_records_embedding_consent_cas', 'zz_records_embedding_consent_changed');

-- Pre-existing RED and server interview hold; no prose-based classification.
INSERT INTO public.records (id, user_id, kind, body, ai_followup, interview_ai_hold, embedding, embedding_model) VALUES
  ('28000000-0000-4000-8000-000000000011', '28000000-0000-4000-8000-000000000001', 'note', 'original one', '{"zone":"red"}', false, array_fill(1::real, ARRAY[768])::vector, 'test'),
  ('28000000-0000-4000-8000-000000000012', '28000000-0000-4000-8000-000000000001', 'note', 'original two', null, true, array_fill(1::real, ARRAY[768])::vector, 'test'),
  ('28000000-0000-4000-8000-000000000013', '28000000-0000-4000-8000-000000000001', 'note', 'ordinary note', null, false, array_fill(1::real, ARRAY[768])::vector, 'test');

CREATE FUNCTION pg_temp.assert_true(value boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'assertion failed: %', label; END IF;
  RAISE NOTICE 'D4 PASS: %', label;
END;
$$;
SELECT pg_temp.assert_true((SELECT count(*) = 3 FROM public.records
  WHERE user_id = '28000000-0000-4000-8000-000000000001'
    AND embedding IS NOT NULL AND embedding_model = 'test'), 'fixture has three real consented vectors');

\ir ../migrations/0270_crisis_ai_hold.sql

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
  FOREACH helper IN ARRAY ARRAY['guard_record_ai_hold()', 'guard_record_ai_hold_embedding()', 'guard_source_ai_hold()', 'guard_wiki_page_ai_hold()'] LOOP
    PERFORM pg_temp.assert_true(NOT has_function_privilege('authenticated', 'public.' || helper, 'EXECUTE'), 'helper cannot be called directly');
  END LOOP;
END;
$acl$;

-- Reapplication cannot reset the bits or erase the original rows.
\ir ../migrations/0270_crisis_ai_hold.sql
SELECT pg_temp.assert_true((SELECT count(*) = 5 FROM public.records WHERE ai_hold), 'reapply retains all holds');
SELECT pg_temp.assert_true((SELECT count(*) = 2 FROM public.sources WHERE ai_hold), 'reapply retains source holds');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '28000000-0000-4000-8000-000000000001';
DELETE FROM public.records WHERE id = '28000000-0000-4000-8000-000000000014';
SELECT pg_temp.assert_true((SELECT count(*) = 4 FROM public.records), 'owner can delete a held original');
RESET ROLE;

-- Reproduce the original 0263 collision for late client RED, not just backfill.
INSERT INTO public.records (id, user_id, kind, body, embedding, embedding_model) VALUES
  ('28000000-0000-4000-8000-000000000041', '28000000-0000-4000-8000-000000000001', 'note', 'late red original', array_fill(1::real, ARRAY[768])::vector, 'test'),
  ('28000000-0000-4000-8000-000000000042', '28000000-0000-4000-8000-000000000001', 'note', 'ordinary control', array_fill(1::real, ARRAY[768])::vector, 'test');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '28000000-0000-4000-8000-000000000001';
UPDATE public.records SET embedding = NULL, embedding_model = NULL
WHERE id = '28000000-0000-4000-8000-000000000042';
SELECT pg_temp.assert_true((SELECT NOT ai_hold AND embedding = array_fill(1::real, ARRAY[768])::vector AND embedding_model = 'test'
  FROM public.records WHERE id = '28000000-0000-4000-8000-000000000042'), '0263 stale NULL still restores non-held pair');
UPDATE public.records SET ai_followup = '{"zone":"red"}'
WHERE id = '28000000-0000-4000-8000-000000000041';
SELECT pg_temp.assert_true((SELECT ai_hold AND embedding IS NULL AND embedding_model IS NULL AND body = 'late red original'
  FROM public.records WHERE id = '28000000-0000-4000-8000-000000000041'), 'late RED clears consented pair and retains original');
INSERT INTO public.records (id, user_id, kind, body, ai_followup, embedding, embedding_model) VALUES
  ('28000000-0000-4000-8000-000000000043', '28000000-0000-4000-8000-000000000001', 'note', 'new red original', '{"zone":"red"}', array_fill(1::real, ARRAY[768])::vector, 'test');
SELECT pg_temp.assert_true((SELECT ai_hold AND embedding IS NULL AND embedding_model IS NULL AND body = 'new red original'
  FROM public.records WHERE id = '28000000-0000-4000-8000-000000000043'), 'standalone SQL clears new legacy RED insert');
INSERT INTO public.records (id, user_id, kind, body, ai_hold, embedding, embedding_model) VALUES
  ('28000000-0000-4000-8000-000000000043', '28000000-0000-4000-8000-000000000001', 'note', 'upserted original', false, array_fill(1::real, ARRAY[768])::vector, 'attempt')
ON CONFLICT (id) DO UPDATE SET body = EXCLUDED.body, ai_hold = EXCLUDED.ai_hold,
  ai_followup = NULL, embedding = EXCLUDED.embedding, embedding_model = EXCLUDED.embedding_model;
SELECT pg_temp.assert_true((SELECT ai_hold AND embedding IS NULL AND embedding_model IS NULL AND body = 'upserted original'
  FROM public.records WHERE id = '28000000-0000-4000-8000-000000000043'), 'UPSERT cannot release or re-embed held row');
RESET ROLE;

-- The real service role bypasses RLS, but never the row's hold.
ALTER ROLE service_role BYPASSRLS;
GRANT SELECT, INSERT, UPDATE ON public.records TO service_role;
SET LOCAL ROLE service_role;
UPDATE public.records SET ai_hold = false, embedding = array_fill(1::real, ARRAY[768])::vector, embedding_model = 'service'
WHERE id = '28000000-0000-4000-8000-000000000043';
SELECT pg_temp.assert_true((SELECT ai_hold AND embedding IS NULL AND embedding_model IS NULL
  FROM public.records WHERE id = '28000000-0000-4000-8000-000000000043'), 'service bypass RLS cannot bypass D4');
RESET ROLE;

-- Synthesize the earlier broken draft's residual, then repair it by reapply.
-- Only D4 triggers are suspended for this fixture; all 0263 guards stay active.
ALTER TABLE public.records DISABLE TRIGGER guard_record_ai_hold;
ALTER TABLE public.records DISABLE TRIGGER zzz_records_ai_hold_embedding_guard;
UPDATE public.records SET embedding = array_fill(1::real, ARRAY[768])::vector, embedding_model = 'old-draft'
WHERE id = '28000000-0000-4000-8000-000000000043';
ALTER TABLE public.records ENABLE TRIGGER guard_record_ai_hold;
ALTER TABLE public.records ENABLE TRIGGER zzz_records_ai_hold_embedding_guard;
SELECT pg_temp.assert_true((SELECT ai_hold AND embedding IS NOT NULL AND embedding_model = 'old-draft'
  FROM public.records WHERE id = '28000000-0000-4000-8000-000000000043'), 'fixture models already-held residual from older draft');
\ir ../migrations/0270_crisis_ai_hold.sql
SELECT pg_temp.assert_true(NOT EXISTS (SELECT 1 FROM public.records WHERE ai_hold
  AND (embedding IS NOT NULL OR embedding_model IS NOT NULL)), 'reapply repairs already-held residual pairs');
SELECT pg_temp.assert_true((SELECT embedding IS NOT NULL AND embedding_model = 'test'
  FROM public.records WHERE id = '28000000-0000-4000-8000-000000000042'), 'reapply leaves ordinary control unchanged');

-- A failed hold statement rolls back both the hold and vector, not just one.
SAVEPOINT hold_attempt;
UPDATE public.records SET ai_hold = true WHERE id = '28000000-0000-4000-8000-000000000042';
SELECT pg_temp.assert_true((SELECT ai_hold AND embedding IS NULL AND embedding_model IS NULL
  FROM public.records WHERE id = '28000000-0000-4000-8000-000000000042'), 'explicit hold clears before transaction rollback');
ROLLBACK TO SAVEPOINT hold_attempt;
SELECT pg_temp.assert_true((SELECT NOT ai_hold AND embedding IS NOT NULL AND embedding_model = 'test'
  FROM public.records WHERE id = '28000000-0000-4000-8000-000000000042'), 'transaction rollback restores pre-hold row atomically');

SET LOCAL ROLE authenticated;
UPDATE public.users SET privacy_prefs = privacy_prefs || '{"records_embedding":false}'
WHERE id = '28000000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true(NOT EXISTS (SELECT 1 FROM public.records
  WHERE embedding IS NOT NULL OR embedding_model IS NOT NULL), '0263 withdrawal clears held and ordinary rows');
UPDATE public.records SET embedding = array_fill(1::real, ARRAY[768])::vector, embedding_model = 'late'
WHERE id = '28000000-0000-4000-8000-000000000042';
SELECT pg_temp.assert_true((SELECT NOT ai_hold AND embedding IS NULL AND embedding_model IS NULL
  FROM public.records WHERE id = '28000000-0000-4000-8000-000000000042'), '0263 rejects non-held late write after withdrawal');
UPDATE public.users SET privacy_prefs = privacy_prefs || jsonb_build_object(
  'records_embedding', true, 'records_embedding_enable_revision',
  (privacy_prefs ->> 'records_embedding_revision')::bigint + 1)
WHERE id = '28000000-0000-4000-8000-000000000001';
UPDATE public.records SET embedding = array_fill(1::real, ARRAY[768])::vector, embedding_model = 'fresh'
WHERE id IN ('28000000-0000-4000-8000-000000000042', '28000000-0000-4000-8000-000000000043');
SELECT pg_temp.assert_true((SELECT NOT ai_hold AND embedding IS NOT NULL AND embedding_model = 'fresh'
  FROM public.records WHERE id = '28000000-0000-4000-8000-000000000042'), 'fresh consent still permits non-held pair');
SELECT pg_temp.assert_true((SELECT ai_hold AND embedding IS NULL AND embedding_model IS NULL
  FROM public.records WHERE id = '28000000-0000-4000-8000-000000000043'), 'fresh consent never releases held row');
SELECT pg_temp.assert_true((SELECT array_agg(id) = ARRAY['28000000-0000-4000-8000-000000000042'::uuid]
  FROM public.match_records('28000000-0000-4000-8000-000000000001', array_fill(1::real, ARRAY[768])::vector, 20)),
  'existing record vector search returns only ordinary row');
RESET ROLE;

SELECT pg_temp.assert_true((SELECT count(*) = 4 AND bool_and(
    pg_get_functiondef(p.oid) = b.definition AND p.proacl IS NOT DISTINCT FROM b.proacl)
  FROM consent_functions_before b JOIN pg_proc p USING (oid)), 'all four 0263 functions and ACLs unchanged');
SELECT pg_temp.assert_true((SELECT count(*) = 4 AND bool_and(
    pg_get_triggerdef(t.oid) = b.definition AND t.tgenabled = b.tgenabled)
  FROM consent_triggers_before b JOIN pg_trigger t USING (oid)), 'all four 0263 trigger identities definitions and enablement unchanged');
SELECT pg_temp.assert_true((SELECT NOT prosecdef AND proconfig @> ARRAY['search_path=""']
  FROM pg_proc WHERE oid = 'public.guard_record_ai_hold_embedding()'::regprocedure), 'final cleanup adds no definer privilege');

-- Exercise the real historical down file while all three AI views are live.
-- SELECT r.* used to pin system_tags and fail here with SQLSTATE 2BP01.
\ir ../migrations/rollback/0218_down.sql
SELECT pg_temp.assert_true(NOT EXISTS (SELECT 1 FROM pg_attribute
  WHERE attrelid = 'public.records'::regclass AND attname = 'system_tags' AND NOT attisdropped),
  '0218 rollback drops system_tags with draft installed');
SELECT pg_temp.assert_true((SELECT count(*) = 3 FROM pg_class
  WHERE oid IN ('public.records_ai_eligible'::regclass, 'public.sources_ai_eligible'::regclass,
    'public.wiki_pages_ai_eligible'::regclass)), '0218 rollback retains all AI views');
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM public.records_ai_eligible),
  '0218 rollback preserves record eligibility');
SELECT pg_temp.assert_true((SELECT body = 'upserted original' AND ai_hold
  AND embedding IS NULL AND embedding_model IS NULL FROM public.records
  WHERE id = '28000000-0000-4000-8000-000000000043'), '0218 rollback preserves held original and empty pair');
ROLLBACK;

-- Run the entire existing 0263 suite with the draft installed, including adult,
-- consent CAS/recovery, partial pairs, owner changes, RLS and service writes.
-- Its BEGIN joins this transaction; its ROLLBACK removes the draft as well.
BEGIN;
\ir ../migrations/0270_crisis_ai_hold.sql
\ir records_embedding_consent_regression.sql

-- Also retain 0218's full hand-move / down / reapply behavior under the draft.
BEGIN;
\ir ../migrations/0270_crisis_ai_hold.sql
\ir records_system_tags_regression.sql

DO $rollback_verified$
BEGIN
  IF to_regclass('public.records_ai_eligible') IS NOT NULL OR EXISTS (
    SELECT 1 FROM pg_attribute WHERE attrelid IN
      ('public.records'::regclass, 'public.sources'::regclass, 'public.wiki_pages'::regclass)
      AND attname = 'ai_hold' AND NOT attisdropped
  ) OR to_regprocedure('public.guard_record_ai_hold_embedding()') IS NOT NULL THEN
    RAISE EXCEPTION 'D4 scratch rollback left draft objects';
  END IF;
  RAISE NOTICE 'D4 PASS: scratch rollback removes draft objects';
END;
$rollback_verified$;
