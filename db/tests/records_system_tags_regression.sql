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
--      an entry-ui tag after the three interview markers on a row created
--      before the entry-ui writer existed stays the user's;
--   3. nothing the user could have typed is moved: same words with another
--      body, or not in the writer's leading position, stay in tags;
--   4. a row that already has system_tags is never split again (gate CD-01 /
--      CDA-01, 2026-10-06): the user appending interview, recall, screener or
--      the first_light pair keeps them, and a stale old-client write-back keeps
--      the markers in tags too (overlap, not loss); a user UPDATE that forms the
--      shape on a row without system_tags is not moved either;
--   5. system_tags refuses NULL elements, other dimensions, other lower bounds,
--      domain: and malformed values (gate CD-02);
--   6. the migration's backfill statement moves pre-existing rows through the
--      same trigger and touches only rows the split says to move;
--   7. rollback/0218_down.sql puts every marker back and a re-apply restores
--      exactly the same (tags, system_tags) for every row; with the explicit
--      override a rollback the guard would refuse still loses no marker.
-- The refusal itself (the guard stops a rollback a re-apply could not undo,
-- gate CDA-03) runs in db/tests/records_system_tags_rollback_refusal.sql.
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
-- A new-client insert carries its markers in system_tags. User tags that happen to
-- read like the marker set (an import, a hand-typed tag) are not split.
INSERT INTO public.records (id, user_id, kind, audit_period, body, tags, system_tags) VALUES
  ('5a5a0218-0000-4000-8000-0000000000a3', '5a5a0218-0000-4000-8000-000000000001', 'audit_response', 'work',
   'Q: i\n\nA: j', ARRAY['domain:career', 'interview', 'recall', 'screener'],
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
INSERT INTO public.records (id, user_id, kind, audit_period, body, tags, created_at) VALUES
  -- interview, 2026-07-05 shape, created before the entry-ui writer (864fd061,
  -- 2026-09-30 20:39:26 KST): the entry-ui tag after it is the user's own
  ('5a5a0218-0000-4000-8000-0000000000b8', '5a5a0218-0000-4000-8000-000000000001', 'audit_response', 'twenties',
   'Q: g\n\nA: h', ARRAY['domain:growth', 'interview', 'recall', 'screener', 'entry-ui:ko'],
   timestamptz '2026-08-01 12:00:00+09');

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
SELECT pg_temp.expect_row('5a5a0218-0000-4000-8000-0000000000a3', ARRAY['domain:career', 'interview', 'recall', 'screener'], ARRAY['interview', 'recall', 'screener', 'entry-ui:en'], 'new-client insert never splits its user tags');
SELECT pg_temp.expect_row('5a5a0218-0000-4000-8000-0000000000b1', ARRAY['domain:collect', 'mine'], ARRAY['first_light', 'first_light:soft'], 'legacy TTFV, current copy');
SELECT pg_temp.expect_row('5a5a0218-0000-4000-8000-0000000000b2', ARRAY['domain:collect'], ARRAY['first_light', 'first_light:affirm'], 'legacy TTFV, 07-02 copy');
SELECT pg_temp.expect_row('5a5a0218-0000-4000-8000-0000000000b3', ARRAY['domain:collect'], ARRAY['first_light', 'first_light:affirm'], 'legacy TTFV, 08-02 copy');
SELECT pg_temp.expect_row('5a5a0218-0000-4000-8000-0000000000b4', ARRAY['domain:growth'], ARRAY['interview', 'recall', 'screener', 'entry-ui:ko'], 'legacy interview 09-30');
SELECT pg_temp.expect_row('5a5a0218-0000-4000-8000-0000000000b5', ARRAY['domain:career'], ARRAY['interview', 'recall', 'screener'], 'legacy interview 07-05 after Move');
SELECT pg_temp.expect_row('5a5a0218-0000-4000-8000-0000000000b6', ARRAY['domain:career', 'reasoning:ratified', 'mine'], ARRAY['interview', 'recall', 'screener'], 'legacy interview after ratify');
SELECT pg_temp.expect_row('5a5a0218-0000-4000-8000-0000000000b7', ARRAY[]::text[], ARRAY['interview', 'life_audit', 'period-teens', 'layers-3'], 'legacy interview 05-27');
SELECT pg_temp.expect_row('5a5a0218-0000-4000-8000-0000000000b8', ARRAY['domain:growth', 'entry-ui:ko'], ARRAY['interview', 'recall', 'screener'], 'entry-ui before its writer existed is the user''s');
SELECT pg_temp.expect_row('5a5a0218-0000-4000-8000-0000000000c1', ARRAY['domain:collect', 'first_light', 'first_light:affirm'], ARRAY[]::text[], 'user sentence with the TTFV words');
SELECT pg_temp.expect_row('5a5a0218-0000-4000-8000-0000000000c2', ARRAY['domain:career', 'interview'], ARRAY[]::text[], 'user interview tag on a note');
SELECT pg_temp.expect_row('5a5a0218-0000-4000-8000-0000000000c3', ARRAY['life_audit', 'values'], ARRAY[]::text[], 'life-audit answer');
SELECT pg_temp.expect_row('5a5a0218-0000-4000-8000-0000000000c4', ARRAY['life_audit', 'values', 'interview', 'recall', 'screener'], ARRAY[]::text[], 'appended interview words');

-- 4. Updates. None of them splits a row again.
-- An old client writing back the pre-0218 tags it cached before 0218, after a Move.
-- The row already has system_tags, so the markers stay in tags as well.
UPDATE public.records SET tags = ARRAY['first_light', 'first_light:soft', 'mine', 'domain:career']
 WHERE id = '5a5a0218-0000-4000-8000-0000000000b1';
SELECT pg_temp.expect_row('5a5a0218-0000-4000-8000-0000000000b1', ARRAY['first_light', 'first_light:soft', 'mine', 'domain:career'], ARRAY['first_light', 'first_light:soft'], 'stale write-back overlaps, nothing lost');
-- A new client appending a user tag.
UPDATE public.records SET tags = tags || 'later'::text WHERE id = '5a5a0218-0000-4000-8000-0000000000b4';
SELECT pg_temp.expect_row('5a5a0218-0000-4000-8000-0000000000b4', ARRAY['domain:growth', 'later'], ARRAY['interview', 'recall', 'screener', 'entry-ui:ko'], 'user tag appended');
-- Gate CD-01 / CDA-01: the detail screen appends one tag at a time and refuses only
-- domain: and a tag already in tags. Three appends make the interview's leading
-- shape; the old trigger then dropped all three and added nothing.
UPDATE public.records SET tags = tags || 'interview'::text WHERE id = '5a5a0218-0000-4000-8000-0000000000b5';
UPDATE public.records SET tags = tags || 'recall'::text WHERE id = '5a5a0218-0000-4000-8000-0000000000b5';
UPDATE public.records SET tags = tags || 'screener'::text WHERE id = '5a5a0218-0000-4000-8000-0000000000b5';
SELECT pg_temp.expect_row('5a5a0218-0000-4000-8000-0000000000b5', ARRAY['domain:career', 'interview', 'recall', 'screener'], ARRAY['interview', 'recall', 'screener'], 'user-typed interview set on a split row');
-- The same on a TTFV note whose body is still the TTFV sentence.
UPDATE public.records SET tags = tags || 'first_light'::text WHERE id = '5a5a0218-0000-4000-8000-0000000000a1';
UPDATE public.records SET tags = tags || 'first_light:soft'::text WHERE id = '5a5a0218-0000-4000-8000-0000000000a1';
SELECT pg_temp.expect_row('5a5a0218-0000-4000-8000-0000000000a1', ARRAY['domain:collect', 'first_light', 'first_light:soft'], ARRAY['first_light', 'first_light:affirm'], 'user-typed first_light pair on a split row');
-- A write that clears system_tags while it rewrites tags does not re-split the
-- user's tags either: the row was split before this write. (Rolled back here.)
SAVEPOINT clear_system_tags;
UPDATE public.records SET tags = tags, system_tags = ARRAY[]::text[]
 WHERE id = '5a5a0218-0000-4000-8000-0000000000b5';
SELECT pg_temp.expect_row('5a5a0218-0000-4000-8000-0000000000b5', ARRAY['domain:career', 'interview', 'recall', 'screener'], ARRAY[]::text[], 'clearing system_tags does not re-split');
ROLLBACK TO SAVEPOINT clear_system_tags;
-- A user UPDATE that forms the shape on a row without system_tags is not split
-- either. (A re-apply after a rollback would split it, so the rollback guard
-- refuses while such a row exists; checked in the refusal file. Rolled back here.)
SAVEPOINT user_formed_shape;
INSERT INTO public.records (id, user_id, kind, audit_period, body, tags) VALUES
  ('5a5a0218-0000-4000-8000-0000000000e1', '5a5a0218-0000-4000-8000-000000000001', 'audit_response', 'current',
   'an answer the user tags by hand', ARRAY['domain:career']);
UPDATE public.records SET tags = tags || ARRAY['interview', 'recall', 'screener']
 WHERE id = '5a5a0218-0000-4000-8000-0000000000e1';
SELECT pg_temp.expect_row('5a5a0218-0000-4000-8000-0000000000e1', ARRAY['domain:career', 'interview', 'recall', 'screener'], ARRAY[]::text[], 'user UPDATE never splits');
ROLLBACK TO SAVEPOINT user_formed_shape;

-- 5. Gate CD-02: the database keeps the column's shape, not only the client.
DO $shape$
DECLARE
  v_bad text[];
  v_label text;
BEGIN
  FOR v_label, v_bad IN
    SELECT * FROM (VALUES
      ('a NULL element', ARRAY[NULL]::text[]),
      ('a NULL among markers', ARRAY['interview', NULL]::text[]),
      ('two dimensions', '{{interview},{recall}}'::text[]),
      ('a lower bound of 0', '[0:0]={interview}'::text[]),
      ('a domain: tag', ARRAY['domain:career']),
      ('an empty string', ARRAY['']),
      ('a comma', ARRAY['interview,recall']),
      ('a space', ARRAY['entry ui']),
      ('17 markers', array_fill('x'::text, ARRAY[17]))
    ) AS t(label, bad)
  LOOP
    BEGIN
      INSERT INTO public.records (user_id, kind, body, tags, system_tags)
      VALUES ('5a5a0218-0000-4000-8000-000000000001', 'audit_response', 'shape probe',
              ARRAY['interview', 'recall', 'screener'], v_bad);
      RAISE EXCEPTION 'system_tags accepted %: %', v_label, v_bad;
    EXCEPTION WHEN check_violation THEN
      NULL;
    END;
    BEGIN
      UPDATE public.records SET system_tags = v_bad WHERE id = '5a5a0218-0000-4000-8000-0000000000a2';
      RAISE EXCEPTION 'system_tags update accepted %: %', v_label, v_bad;
    EXCEPTION WHEN check_violation THEN
      NULL;
    END;
  END LOOP;
END
$shape$;
SELECT pg_temp.expect_row('5a5a0218-0000-4000-8000-0000000000a2', ARRAY['domain:career', 'mine'], ARRAY['interview', 'recall', 'screener', 'entry-ui:en'], 'shape probes changed nothing');

-- 6. The migration's backfill statement on a row that predates the trigger.
ALTER TABLE public.records DISABLE TRIGGER records_move_app_system_tags;
INSERT INTO public.records (id, user_id, kind, body, tags) VALUES
  ('5a5a0218-0000-4000-8000-0000000000d1', '5a5a0218-0000-4000-8000-000000000001', 'note',
   'First record review: This record feels a little different now.',
   ARRAY['domain:collect', 'first_light', 'first_light:soft']);
ALTER TABLE public.records ENABLE TRIGGER records_move_app_system_tags;
SELECT pg_temp.expect_row('5a5a0218-0000-4000-8000-0000000000d1', ARRAY['domain:collect', 'first_light', 'first_light:soft'], ARRAY[]::text[], 'pre-trigger row before backfill');
CREATE TEMP TABLE backfill_touched (id uuid) ON COMMIT DROP;
WITH touched AS (
  UPDATE public.records AS r
     SET tags = r.tags
   WHERE r.tags && ARRAY['first_light', 'interview']::text[]
     AND cardinality(r.system_tags) = 0
     AND cardinality((public.records_app_system_tags_split(r.kind::text, r.body, r.tags, r.created_at)).markers) > 0
  RETURNING r.id
)
INSERT INTO backfill_touched SELECT id FROM touched;
SELECT pg_temp.expect_row('5a5a0218-0000-4000-8000-0000000000d1', ARRAY['domain:collect'], ARRAY['first_light', 'first_light:soft'], 'pre-trigger row after backfill');
SELECT pg_temp.expect_row('5a5a0218-0000-4000-8000-0000000000c1', ARRAY['domain:collect', 'first_light', 'first_light:affirm'], ARRAY[]::text[], 'user sentence after backfill');
SELECT pg_temp.expect_row('5a5a0218-0000-4000-8000-0000000000c4', ARRAY['life_audit', 'values', 'interview', 'recall', 'screener'], ARRAY[]::text[], 'appended words after backfill');
DO $touched$
BEGIN
  IF (SELECT array_agg(id ORDER BY id) FROM backfill_touched)
     IS DISTINCT FROM ARRAY['5a5a0218-0000-4000-8000-0000000000d1']::uuid[] THEN
    RAISE EXCEPTION 'backfill touched rows it does not move: %', (SELECT array_agg(id ORDER BY id) FROM backfill_touched);
  END IF;
END
$touched$;

-- The Polaris evidence condition now selects exactly the interview rows.
DO $polaris$
BEGIN
  IF (SELECT array_agg(id ORDER BY id) FROM public.records
       WHERE user_id = '5a5a0218-0000-4000-8000-000000000001'
         AND kind = 'audit_response' AND system_tags @> ARRAY['interview']::text[])
     IS DISTINCT FROM ARRAY[
       '5a5a0218-0000-4000-8000-0000000000a2', '5a5a0218-0000-4000-8000-0000000000a3',
       '5a5a0218-0000-4000-8000-0000000000b4',
       '5a5a0218-0000-4000-8000-0000000000b5', '5a5a0218-0000-4000-8000-0000000000b6',
       '5a5a0218-0000-4000-8000-0000000000b7', '5a5a0218-0000-4000-8000-0000000000b8']::uuid[] THEN
    RAISE EXCEPTION 'Polaris evidence condition picked the wrong rows';
  END IF;
END
$polaris$;

-- 7. Rollback round trip. Every row here comes back, so the guard lets it run.
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
       IS DISTINCT FROM ARRAY['domain:collect', 'first_light', 'first_light:affirm', 'first_light', 'first_light:soft']
     OR (SELECT tags FROM public.records WHERE id = '5a5a0218-0000-4000-8000-0000000000b5')
       IS DISTINCT FROM ARRAY['domain:career', 'interview', 'recall', 'screener', 'interview', 'recall', 'screener']
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

-- 8. Gate CDA-03: a TTFV note whose body was edited would not get its markers
-- back from a re-apply. With the explicit override the rollback still runs and
-- still puts every marker into tags. (Without it, the refusal file shows the
-- rollback stopping before any change.)
SAVEPOINT accepted_override;
UPDATE public.records SET body = 'I rewrote this note.' WHERE id = '5a5a0218-0000-4000-8000-0000000000b2';
SET LOCAL app.rollback_0218_accept_unrecoverable = 'on';

\i db/migrations/rollback/0218_down.sql

DO $override$
BEGIN
  IF (SELECT tags FROM public.records WHERE id = '5a5a0218-0000-4000-8000-0000000000b2')
       IS DISTINCT FROM ARRAY['domain:collect', 'first_light', 'first_light:affirm'] THEN
    RAISE EXCEPTION 'an accepted rollback lost a marker of the edited TTFV note';
  END IF;
END
$override$;
ROLLBACK TO SAVEPOINT accepted_override;

ROLLBACK;

SELECT 'PASS: 0218 moves only app-written markers, never re-splits a split row, keeps user tags, guards its shape, and round-trips through its rollback';
