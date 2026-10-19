\set ON_ERROR_STOP on
BEGIN;

-- Run after 0264, on a disposable local database. Every probe is rolled back.
INSERT INTO auth.users (id, email) VALUES
  ('5a5a0264-0000-4000-8000-000000000001', 'sources-tags-one@example.invalid'),
  ('5a5a0264-0000-4000-8000-000000000002', 'sources-tags-two@example.invalid');
INSERT INTO public.users (id, email, birth_date, locale) VALUES
  ('5a5a0264-0000-4000-8000-000000000001', 'sources-tags-one@example.invalid', '1990-01-01', 'en'),
  ('5a5a0264-0000-4000-8000-000000000002', 'sources-tags-two@example.invalid', '1990-01-01', 'en')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.sources (id, user_id, kind, title, storage_path, tags) VALUES
  ('5a5a0264-0000-4000-8000-0000000000a1', '5a5a0264-0000-4000-8000-000000000001',
   'inbox', 'old writer', 't54/one.md', ARRAY['memo', 'reasoning:ratified', 'NULL', 'a,b', '"', E'\\', '{}', '한글', '']),
  ('5a5a0264-0000-4000-8000-0000000000a2', '5a5a0264-0000-4000-8000-000000000002',
   'inbox', 'other owner', 't54/two.md', '{}');

DO $contract$
DECLARE bad text[]; label text;
BEGIN
  IF (SELECT system_tags FROM public.sources WHERE id='5a5a0264-0000-4000-8000-0000000000a1')
     IS DISTINCT FROM '{}'::text[] THEN
    RAISE EXCEPTION 'old writer did not get empty system_tags';
  END IF;
  FOR label, bad IN SELECT * FROM (VALUES
    ('NULL element', ARRAY[NULL]::text[]),
    ('mixed NULL', ARRAY['memo',NULL]),
    ('two dimensions', '{{memo},{voice}}'::text[]),
    ('lower bound zero', '[0:0]={memo}'::text[]),
    ('domain', ARRAY['domain:career']),
    ('mixed case domain', ARRAY['memo','Domain:Career']),
    ('empty item', ARRAY['']), ('comma', ARRAY['memo,voice']),
    ('space', ARRAY['two words']), ('quote', ARRAY['"']),
    ('backslash', ARRAY[E'\\']), ('braces', ARRAY['{}']),
    ('non ASCII', ARRAY['한글']), ('too long', ARRAY[repeat('x',65)]),
    ('too many', array_fill('x'::text, ARRAY[17]))
  ) AS cases(label,bad) LOOP
    BEGIN
      UPDATE public.sources SET system_tags=bad WHERE id='5a5a0264-0000-4000-8000-0000000000a1';
      RAISE EXCEPTION 'shape accepted %', label;
    EXCEPTION WHEN check_violation THEN NULL;
    END;
  END LOOP;
  BEGIN
    UPDATE public.sources SET system_tags=NULL WHERE id='5a5a0264-0000-4000-8000-0000000000a1';
    RAISE EXCEPTION 'NULL array accepted';
  EXCEPTION WHEN not_null_violation THEN NULL;
  END;
  UPDATE public.sources SET system_tags=array_fill(repeat('x',64),ARRAY[16])
    WHERE id='5a5a0264-0000-4000-8000-0000000000a1';
  UPDATE public.sources SET system_tags=ARRAY['memo','reasoning:ratified']
    WHERE id='5a5a0264-0000-4000-8000-0000000000a1';
  IF (SELECT tags FROM public.sources WHERE id='5a5a0264-0000-4000-8000-0000000000a1')
     IS DISTINCT FROM ARRAY['memo','reasoning:ratified','NULL','a,b','"',E'\\','{}','한글',''] THEN
    RAISE EXCEPTION 'user tags changed';
  END IF;
  IF (SELECT to_jsonb(s)->'system_tags' FROM public.sources s
      WHERE id='5a5a0264-0000-4000-8000-0000000000a1')
     IS DISTINCT FROM '["memo","reasoning:ratified"]'::jsonb THEN
    RAISE EXCEPTION 'whole-row account export lost system_tags';
  END IF;
  IF '{}'::text[] IS DISTINCT FROM ARRAY[]::text[]
    OR '{"NULL","interview"}'::text[] IS DISTINCT FROM ARRAY['NULL','interview']
    OR array_position('{"NULL","interview"}'::text[],NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'system marker equality literal changed NULL text or empty array';
  END IF;
END $contract$;

-- Existing owner RLS remains the authorization boundary for both columns.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '5a5a0264-0000-4000-8000-000000000001', true);
DO $ownership$
DECLARE affected int;
BEGIN
  UPDATE public.sources SET tags=ARRAY['domain:career'] || tags,
    system_tags=ARRAY['memo','reasoning:ratified']
    WHERE id='5a5a0264-0000-4000-8000-0000000000a1'
      AND system_tags='{"memo","reasoning:ratified"}'::text[];
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>1 THEN RAISE EXCEPTION 'owner cannot update both arrays'; END IF;
  IF (SELECT tags FROM public.sources WHERE id='5a5a0264-0000-4000-8000-0000000000a1')
    IS DISTINCT FROM ARRAY['domain:career','memo','reasoning:ratified','NULL','a,b','"',E'\\','{}','한글',''] THEN
    RAISE EXCEPTION 'ratification changed arbitrary user tag characters';
  END IF;
  UPDATE public.sources SET system_tags=ARRAY['reasoning:ratified']
    WHERE id='5a5a0264-0000-4000-8000-0000000000a2';
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>0 THEN RAISE EXCEPTION 'cross-owner update escaped RLS'; END IF;
END $ownership$;
RESET ROLE;

-- No trigger may classify sources by either tag array.
DO $no_trigger$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid
    WHERE t.tgrelid='public.sources'::regclass AND NOT t.tgisinternal
      AND position('system_tags' IN lower(p.prosrc))>0) THEN
    RAISE EXCEPTION 'sources trigger references system_tags';
  END IF;
END $no_trigger$;
ROLLBACK;
\echo PASS sources system tags: defaults, 16 rejection cases, valid limits, user tags, export, owner RLS
