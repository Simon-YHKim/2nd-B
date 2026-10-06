\set ON_ERROR_STOP on

-- Run only on the CI scratch database after the numbered 0218 migration. The
-- staged Supabase CLI push already applied it; this file replays it only for the
-- rollback round trip at the end. Everything happens in one transaction that is
-- rolled back, so no row or schema change leaks into the lanes after this one.
--
-- What it proves (0218 records.system_tags, Q-261004-39 = A):
--   1. a new client's insert (markers already in system_tags) is left alone;
--   2. an old client's insert in the pre-0218 layout is moved, for every
--      historical writer shape, and the user's own tags stay where they were;
--   3. nothing the user could have typed is moved: same words with another
--      body, or not in the writer's leading position, stay in tags;
--   4. an old client's write-back (UPDATE OF tags) is moved without duplicates;
--   5. the backfill statement (UPDATE ... SET tags = tags) moves pre-existing
--      rows through the same trigger;
--   6. rollback/0218_down.sql puts every marker back and a re-apply restores
--      exactly the same (tags, system_tags) for every row.
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.expect_row(
  p_id uuid, p_tags text[], p_system_tags text[], p_label text
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_tags text[];
  v_system_tags text[];
BEGIN
  SELECT tags, system_tags INTO v_tags, v_system_tags FROM public.records WHERE id = p_id;
  IF v_tags IS DISTINCT FROM p_tags OR v_system_tags IS DISTINCT FROM p_system_tags THEN
    RAISE EXCEPTION '%: got tags % system_tags %, expected tags % system_tags %',
      p_label, v_tags, v_system_tags, p_tags, p_system_tags;
  END IF;
END;
$$;

INSERT INTO auth.users (id, email)
VALUES ('5a5a0218-0000-4000-8000-000000000001', 'system-tags-ci@example.invalid');
INSERT INTO public.users (id, email, birth_date, locale)
VALUES ('5a5a0218-0000-4000-8000-000000000001', 'system-tags-ci@example.invalid', DATE '1990-01-01', 'en');

-- 1. New client: markers already in system_tags.
INSERT INTO public.records (id, user_id, kind, body, tags, system_tags) VALUES
  ('5a5a0218-0000-4000-8000-0000000000a1', '5a5a0218-0000-4000-8000-000000000001', 'note',
   'First record review: This record still feels like me.',
   ARRAY['domain:collect'], ARRAY['first_light', 'first_light:affirm']);
INSERT INTO public.records (id, user_id, kind, audit_period, body, tags, system_tags) VALUES
  ('5a5a0218-0000-4000-8000-0000000000a2', '5a5a0218-0000-4000-8000-000000000001', 'audit_response', 'work',
   'Q: what did you build?\n\nA: a tool', ARRAY['domain:career', 'mine'],
   ARRAY['interview', 'recall', 'screener', 'entry-ui:en']);

-- 2. Old client, pre-0218 layout (system_tags left to its default).
INSERT INTO public.records (id, user_id, kind, body, tags) VALUES
  -- TTFV, current Korean copy, soft, with a tag the user added later
  ('5a5a0218-0000-4000-8000-0000000000b1', '5a5a0218-0000-4000-8000-000000000001', 'note',
   '첫 기록 검토: 이 기록은 지금의 나와 조금 달라요.',
   ARRAY['domain:collect', 'first_light', 'first_light:soft', 'mine']),
  -- TTFV, the 2026-07-02 copy (em dash)
  ('5a5a0218-0000-4000-8000-0000000000b2', '5a5a0218-0000-4000-8000-000000000001', 'note',
   '첫 통찰: "혼자 있을 때 생각이 정리돼요" — 맞아요',
   ARRAY['domain:collect', 'first_light', 'first_light:affirm']),
  -- TTFV, the 2026-08-02 copy (hyphen, Spanish)
  ('5a5a0218-0000-4000-8000-0000000000b3', '5a5a0218-0000-4000-8000-000000000001', 'note',
   'Primera luz: "pienso mejor a solas" - es cierto',
   ARRAY['domain:collect', 'first_light', 'first_light:affirm']);
INSERT INTO public.records (id, user_id, kind, audit_period, body, tags) VALUES
  -- interview, 2026-09-30 shape
  ('5a5a0218-0000-4000-8000-0000000000b4', '5a5a0218-0000-4000-8000-000000000001', 'audit_response', 'school',
   'Q: 그때 어땠어요?\n\nA: 밴드를 했다',
   ARRAY['domain:growth', 'interview', 'recall', 'screener', 'entry-ui:ko']),
  -- interview, 2026-07-05 shape, after a Move (domain tag last)
  ('5a5a0218-0000-4000-8000-0000000000b5', '5a5a0218-0000-4000-8000-000000000001', 'audit_response', 'work',
   'Q: a\n\nA: b', ARRAY['interview', 'recall', 'screener', 'domain:career']),
  -- interview after /reasoning ratify: [domain, reasoning:ratified, ...previous]
  ('5a5a0218-0000-4000-8000-0000000000b6', '5a5a0218-0000-4000-8000-000000000001', 'audit_response', 'now',
   'Q: c\n\nA: d', ARRAY['domain:career', 'reasoning:ratified', 'interview', 'recall', 'screener', 'mine']),
  -- interview, 2026-05-27 shape (no domain tag yet)
  ('5a5a0218-0000-4000-8000-0000000000b7', '5a5a0218-0000-4000-8000-000000000001', 'audit_response', 'teens',
   'Q: e\n\nA: f', ARRAY['interview', 'life_audit', 'period-teens', 'layers-3']);

-- 3. What the user could have typed stays theirs.
INSERT INTO public.records (id, user_id, kind, body, tags) VALUES
  -- same two words, the user's own sentence
  ('5a5a0218-0000-4000-8000-0000000000c1', '5a5a0218-0000-4000-8000-000000000001', 'note',
   'my own note about first light', ARRAY['domain:collect', 'first_light', 'first_light:affirm']),
  -- a note the user tagged interview
  ('5a5a0218-0000-4000-8000-0000000000c2', '5a5a0218-0000-4000-8000-000000000001', 'note',
   'notes from a job interview', ARRAY['domain:career', 'interview']);
INSERT INTO public.records (id, user_id, kind, audit_period, body, tags) VALUES
  -- a life-audit answer, untouched
  ('5a5a0218-0000-4000-8000-0000000000c3', '5a5a0218-0000-4000-8000-000000000001', 'audit_response', 'current',
   'an audit answer', ARRAY['life_audit', 'values']),
  -- a life-audit answer the user appended the interview words to (not the leading position)
  ('5a5a0218-0000-4000-8000-0000000000c4', '5a5a0218-0000-4000-8000-000000000001', 'audit_response', 'current',
   'another audit answer', ARRAY['life_audit', 'values', 'interview', 'recall', 'screener']);

SELECT pg_temp.expect_row('5a5a0218-0000-4000-8000-0000000000a1', ARRAY['domain:collect'], ARRAY['first_light', 'first_light:affirm'], 'new-client TTFV');
SELECT pg_temp.expect_row('5a5a0218-0000-4000-8000-0000000000a2', ARRAY['domain:career', 'mine'], ARRAY['interview', 'recall', 'screener', 'entry-ui:en'], 'new-client interview');
SELECT pg_temp.expect_row('5a5a0218-0000-4000-8000-0000000000b1', ARRAY['domain:collect', 'mine'], ARRAY['first_light', 'first_light:soft'], 'legacy TTFV, current copy');
SELECT pg_temp.expect_row('5a5a0218-0000-4000-8000-0000000000b2', ARRAY['domain:collect'], ARRAY['first_light', 'first_light:affirm'], 'legacy TTFV, 07-02 copy');
SELECT pg_temp.expect_row('5a5a0218-0000-4000-8000-0000000000b3', ARRAY['domain:collect'], ARRAY['first_light', 'first_light:affirm'], 'legacy TTFV, 08-02 copy');
SELECT pg_temp.expect_row('5a5a0218-0000-4000-8000-0000000000b4', ARRAY['domain:growth'], ARRAY['interview', 'recall', 'screener', 'entry-ui:ko'], 'legacy interview 09-30');
SELECT pg_temp.expect_row('5a5a0218-0000-4000-8000-0000000000b5', ARRAY['domain:career'], ARRAY['interview', 'recall', 'screener'], 'legacy interview 07-05 after Move');
SELECT pg_temp.expect_row('5a5a0218-0000-4000-8000-0000000000b6', ARRAY['domain:career', 'reasoning:ratified', 'mine'], ARRAY['interview', 'recall', 'screener'], 'legacy interview after ratify');
SELECT pg_temp.expect_row('5a5a0218-0000-4000-8000-0000000000b7', ARRAY[]::text[], ARRAY['interview', 'life_audit', 'period-teens', 'layers-3'], 'legacy interview 05-27');
SELECT pg_temp.expect_row('5a5a0218-0000-4000-8000-0000000000c1', ARRAY['domain:collect', 'first_light', 'first_light:affirm'], ARRAY[]::text[], 'user sentence with the TTFV words');
SELECT pg_temp.expect_row('5a5a0218-0000-4000-8000-0000000000c2', ARRAY['domain:career', 'interview'], ARRAY[]::text[], 'user interview tag on a note');
SELECT pg_temp.expect_row('5a5a0218-0000-4000-8000-0000000000c3', ARRAY['life_audit', 'values'], ARRAY[]::text[], 'life-audit answer');
SELECT pg_temp.expect_row('5a5a0218-0000-4000-8000-0000000000c4', ARRAY['life_audit', 'values', 'interview', 'recall', 'screener'], ARRAY[]::text[], 'appended interview words');

-- 4. Updates. An old client writing back the pre-0218 tags it cached, after a Move.
UPDATE public.records SET tags = ARRAY['first_light', 'first_light:soft', 'mine', 'domain:career']
 WHERE id = '5a5a0218-0000-4000-8000-0000000000b1';
SELECT pg_temp.expect_row('5a5a0218-0000-4000-8000-0000000000b1', ARRAY['mine', 'domain:career'], ARRAY['first_light', 'first_light:soft'], 'legacy write-back');
-- A new client appending a user tag.
UPDATE public.records SET tags = tags || 'later'::text WHERE id = '5a5a0218-0000-4000-8000-0000000000b4';
SELECT pg_temp.expect_row('5a5a0218-0000-4000-8000-0000000000b4', ARRAY['domain:growth', 'later'], ARRAY['interview', 'recall', 'screener', 'entry-ui:ko'], 'user tag appended');

-- 5. The backfill statement on a row that predates the trigger.
ALTER TABLE public.records DISABLE TRIGGER records_move_app_system_tags;
INSERT INTO public.records (id, user_id, kind, body, tags) VALUES
  ('5a5a0218-0000-4000-8000-0000000000d1', '5a5a0218-0000-4000-8000-000000000001', 'note',
   'First record review: This record feels a little different now.',
   ARRAY['domain:collect', 'first_light', 'first_light:soft']);
ALTER TABLE public.records ENABLE TRIGGER records_move_app_system_tags;
SELECT pg_temp.expect_row('5a5a0218-0000-4000-8000-0000000000d1', ARRAY['domain:collect', 'first_light', 'first_light:soft'], ARRAY[]::text[], 'pre-trigger row before backfill');
UPDATE public.records SET tags = tags WHERE tags && ARRAY['first_light', 'interview']::text[];
SELECT pg_temp.expect_row('5a5a0218-0000-4000-8000-0000000000d1', ARRAY['domain:collect'], ARRAY['first_light', 'first_light:soft'], 'pre-trigger row after backfill');
SELECT pg_temp.expect_row('5a5a0218-0000-4000-8000-0000000000c1', ARRAY['domain:collect', 'first_light', 'first_light:affirm'], ARRAY[]::text[], 'user sentence after backfill');
SELECT pg_temp.expect_row('5a5a0218-0000-4000-8000-0000000000c4', ARRAY['life_audit', 'values', 'interview', 'recall', 'screener'], ARRAY[]::text[], 'appended words after backfill');

-- The Polaris evidence condition now selects exactly the interview rows.
DO $polaris$
BEGIN
  IF (SELECT array_agg(id ORDER BY id) FROM public.records
       WHERE user_id = '5a5a0218-0000-4000-8000-000000000001'
         AND kind = 'audit_response' AND system_tags @> ARRAY['interview']::text[])
     IS DISTINCT FROM ARRAY[
       '5a5a0218-0000-4000-8000-0000000000a2', '5a5a0218-0000-4000-8000-0000000000b4',
       '5a5a0218-0000-4000-8000-0000000000b5', '5a5a0218-0000-4000-8000-0000000000b6',
       '5a5a0218-0000-4000-8000-0000000000b7']::uuid[] THEN
    RAISE EXCEPTION 'Polaris evidence condition picked the wrong rows';
  END IF;
END
$polaris$;

-- 6. Rollback round trip.
CREATE TEMP TABLE system_tags_before ON COMMIT DROP AS
  SELECT id, tags, system_tags FROM public.records WHERE user_id = '5a5a0218-0000-4000-8000-000000000001';

\i db/migrations/rollback/0218_down.sql

DO $down$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'records' AND column_name = 'system_tags') THEN
    RAISE EXCEPTION 'rollback left records.system_tags';
  END IF;
  -- Every marker is back in tags, right after a leading domain tag.
  IF (SELECT tags FROM public.records WHERE id = '5a5a0218-0000-4000-8000-0000000000b4')
       IS DISTINCT FROM ARRAY['domain:growth', 'interview', 'recall', 'screener', 'entry-ui:ko', 'later']
     OR (SELECT tags FROM public.records WHERE id = '5a5a0218-0000-4000-8000-0000000000a1')
       IS DISTINCT FROM ARRAY['domain:collect', 'first_light', 'first_light:affirm']
     OR (SELECT tags FROM public.records WHERE id = '5a5a0218-0000-4000-8000-0000000000b7')
       IS DISTINCT FROM ARRAY['interview', 'life_audit', 'period-teens', 'layers-3']
     OR (SELECT tags FROM public.records WHERE id = '5a5a0218-0000-4000-8000-0000000000c1')
       IS DISTINCT FROM ARRAY['domain:collect', 'first_light', 'first_light:affirm'] THEN
    RAISE EXCEPTION 'rollback did not put the markers back into tags';
  END IF;
  IF position('AND tags @> ARRAY[''interview'']::text[]' IN
       (SELECT prosrc FROM pg_catalog.pg_proc WHERE oid = 'public.reserve_polaris_generation(uuid,text)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'rollback did not restore the 0195 Polaris evidence query';
  END IF;
END
$down$;

\i db/migrations/0218_records_system_tags.sql

DO $roundtrip$
BEGIN
  IF EXISTS (
    SELECT id, tags, system_tags FROM system_tags_before
    EXCEPT
    SELECT id, tags, system_tags FROM public.records WHERE user_id = '5a5a0218-0000-4000-8000-000000000001'
  ) OR EXISTS (
    SELECT id, tags, system_tags FROM public.records WHERE user_id = '5a5a0218-0000-4000-8000-000000000001'
    EXCEPT
    SELECT id, tags, system_tags FROM system_tags_before
  ) THEN
    RAISE EXCEPTION 'rollback then re-apply did not restore every row''s tags and system_tags';
  END IF;
END
$roundtrip$;

ROLLBACK;

SELECT 'PASS: 0218 moves only app-written markers, keeps user tags, and round-trips through its rollback';
