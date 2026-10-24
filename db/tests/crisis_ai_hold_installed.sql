\set ON_ERROR_STOP on
-- Final numbered schema, unlike the backfill lane's pre-0270 snapshot.
BEGIN;
CREATE TEMP TABLE d4_catalog_before AS
SELECT 'function' AS kind, p.oid, pg_get_functiondef(p.oid) AS definition,
       p.proacl::text AS acl
FROM pg_proc p WHERE p.oid IN (
  'public.guard_record_ai_hold()'::regprocedure,
  'public.guard_record_ai_hold_embedding()'::regprocedure,
  'public.guard_source_ai_hold()'::regprocedure,
  'public.guard_wiki_page_ai_hold()'::regprocedure);
CREATE TEMP TABLE d4_views_before AS
SELECT c.relname, pg_get_viewdef(c.oid) AS definition, c.relacl, c.reloptions
FROM pg_class c WHERE c.oid IN ('public.records_ai_eligible'::regclass,
  'public.sources_ai_eligible'::regclass, 'public.wiki_pages_ai_eligible'::regclass);
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users (id, email) VALUES
  ('28000000-0000-4000-8000-000000000071', 'hold-installed@example.invalid');
SET LOCAL session_replication_role = origin;
INSERT INTO public.users (id, email, birth_date, locale) VALUES
  ('28000000-0000-4000-8000-000000000071', 'hold-installed@example.invalid', '1990-01-01', 'en');
INSERT INTO public.records (id, user_id, kind, body, ai_followup) VALUES
  ('28000000-0000-4000-8000-000000000072', '28000000-0000-4000-8000-000000000071',
   'note', 'held original survives rollback', '{"zone":"red"}');
CREATE TEMP TABLE d4_rows_before AS SELECT to_jsonb(r) AS value FROM public.records r;

\ir ../migrations/rollback/0270_down.sql
DO $down$
BEGIN
  IF to_regclass('public.records_ai_eligible') IS NOT NULL
    OR to_regclass('public.sources_ai_eligible') IS NOT NULL
    OR to_regclass('public.wiki_pages_ai_eligible') IS NOT NULL THEN
    RAISE EXCEPTION '0270 down left an AI view';
  END IF;
  IF EXISTS (SELECT value FROM d4_rows_before EXCEPT SELECT to_jsonb(r) FROM public.records r)
     OR EXISTS (SELECT to_jsonb(r) FROM public.records r EXCEPT SELECT value FROM d4_rows_before) THEN
    RAISE EXCEPTION '0270 down changed held/original data';
  END IF;
  IF (SELECT count(*) FROM d4_catalog_before b JOIN pg_proc p ON p.oid=b.oid
      WHERE CASE WHEN p.prokind IN ('f','p') THEN pg_get_functiondef(p.oid) END=b.definition
        AND p.proacl::text IS NOT DISTINCT FROM b.acl) <> 4 THEN
    RAISE EXCEPTION '0270 down changed monotonic enforcement';
  END IF;
  RAISE NOTICE 'D4 INSTALLED PASS: down removes only read views';
END;
$down$;
UPDATE public.records SET ai_hold=false, ai_followup=null
WHERE id='28000000-0000-4000-8000-000000000072';
DO $hold$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.records
      WHERE id='28000000-0000-4000-8000-000000000072' AND ai_hold
        AND embedding IS NULL AND embedding_model IS NULL
        AND body='held original survives rollback') THEN
    RAISE EXCEPTION '0270 down released a hold';
  END IF;
  RAISE NOTICE 'D4 INSTALLED PASS: down cannot release a hold';
END;
$hold$;
\ir ../migrations/0270_crisis_ai_hold.sql
DO $up$
BEGIN
  IF (SELECT count(*) FROM d4_views_before b JOIN pg_class c ON c.relname=b.relname
      AND c.relnamespace='public'::regnamespace WHERE pg_get_viewdef(c.oid)=b.definition
      AND c.relacl IS NOT DISTINCT FROM b.relacl AND c.reloptions=b.reloptions) <> 3 THEN
    RAISE EXCEPTION '0270 reapply did not restore exact views and ACLs';
  END IF;
  IF EXISTS (SELECT 1 FROM public.records_ai_eligible
      WHERE id='28000000-0000-4000-8000-000000000072') THEN
    RAISE EXCEPTION '0270 reapply exposed held original';
  END IF;
  RAISE NOTICE 'D4 INSTALLED PASS: reapply restores views without releasing hold';
END;
$up$;
ROLLBACK;
