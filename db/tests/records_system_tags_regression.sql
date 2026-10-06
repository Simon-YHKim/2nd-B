\set ON_ERROR_STOP on

-- Run only on the CI scratch database after the numbered 0218 migration. The
-- staged Supabase CLI push already applied it; this file replays it only after
-- its rollback, at the end. Everything happens in one transaction that is rolled
-- back, so no row or schema change leaks into the lanes after this one.
--
-- What it proves (0218 records.system_tags, Q-261004-39 = A, design
-- docs/design/system-tags-261006.md, the "schema only + QA hand move" option):
--   1. the column defaults to '{}' and a new client's insert keeps its markers;
--   2. nothing moves markers by shape (P2): an old client's insert in the
--      pre-0218 layout and a user UPDATE that forms the marker shape both stay
--      exactly as written, with system_tags empty;
--   3. system_tags refuses NULL elements, other dimensions, other lower bounds,
--      domain: and malformed values (gate CD-02);
--   4. Polaris evidence (reserve_polaris_generation, polaris_evidence_snapshot)
--      picks interview rows by system_tags only;
--   5. db/ops/0218_system_tags_hand_move.sql moves exactly the listed rows'
--      listed markers, skips a row whose tags changed since the survey or that is
--      already split, keeps a user's duplicate tag, refuses a malformed list and
--      a role that cannot bypass row-level security without changing anything;
--   6. rollback/0218_down.sql puts every marker back into tags (after a leading
--      domain: tag, overlapping a user tag of the same text), restores the 0195
--      Polaris bodies and drops the column; re-applying 0218 changes no data.
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
VALUES ('5a5a0218-0000-4000-8000-000000000001', 'system-tags-ci@example.invalid', DATE '1990-01-01', 'en')
ON CONFLICT (id) DO NOTHING;

-- 1. New client: markers in system_tags from the start.
INSERT INTO public.records (id, user_id, kind, body, tags, system_tags) VALUES
  ('5a5a0218-0000-4000-8000-0000000000a1', '5a5a0218-0000-4000-8000-000000000001', 'note',
   'First record review: This record still feels like me.',
   ARRAY['domain:collect'], ARRAY['first_light', 'first_light:affirm']);
INSERT INTO public.records (id, user_id, kind, audit_period, body, tags, system_tags) VALUES
  ('5a5a0218-0000-4000-8000-0000000000a2', '5a5a0218-0000-4000-8000-000000000001', 'audit_response', 'work',
   'Q: what did you build?\n\nA: a tool', ARRAY['domain:career', 'mine'],
   ARRAY['interview', 'recall', 'screener', 'entry-ui:en']);
-- A plain save names no system_tags and gets the default.
INSERT INTO public.records (id, user_id, kind, body, tags) VALUES
  ('5a5a0218-0000-4000-8000-0000000000a3', '5a5a0218-0000-4000-8000-000000000001', 'note',
   'a plain note', ARRAY['domain:collect', 'mine']);

-- 2. Old client, pre-0218 layout: stays as written (no trigger).
INSERT INTO public.records (id, user_id, kind, body, tags) VALUES
  ('5a5a0218-0000-4000-8000-0000000000b1', '5a5a0218-0000-4000-8000-000000000001', 'note',
   '첫 기록 검토: 이 기록은 지금의 나와 조금 달라요.',
   ARRAY['domain:collect', 'first_light', 'first_light:soft', 'mine']);
INSERT INTO public.records (id, user_id, kind, audit_period, body, tags) VALUES
  ('5a5a0218-0000-4000-8000-0000000000b2', '5a5a0218-0000-4000-8000-000000000001', 'audit_response', 'school',
   'Q: 그때 어땠어요?\n\nA: 밴드를 했다',
   ARRAY['domain:growth', 'interview', 'recall', 'screener', 'entry-ui:ko']),
  -- the same shape, with a user tag that repeats a marker word at the end
  ('5a5a0218-0000-4000-8000-0000000000b3', '5a5a0218-0000-4000-8000-000000000001', 'audit_response', 'work',
   'Q: a\n\nA: b', ARRAY['domain:career', 'interview', 'recall', 'screener', 'interview']),
  -- listed in the hand move, but the user edits its tags after the survey
  ('5a5a0218-0000-4000-8000-0000000000b4', '5a5a0218-0000-4000-8000-000000000001', 'audit_response', 'now',
   'Q: c\n\nA: d', ARRAY['domain:growth', 'interview', 'recall', 'screener']);
-- 3. A note the user tagged interview, and a user UPDATE forming the interview shape.
INSERT INTO public.records (id, user_id, kind, body, tags) VALUES
  ('5a5a0218-0000-4000-8000-0000000000c1', '5a5a0218-0000-4000-8000-000000000001', 'note',
   'notes from a job interview', ARRAY['domain:career', 'interview']);
INSERT INTO public.records (id, user_id, kind, audit_period, body, tags) VALUES
  ('5a5a0218-0000-4000-8000-0000000000c2', '5a5a0218-0000-4000-8000-000000000001', 'audit_response', 'work',
   'an answer the user tags by hand', ARRAY['domain:career']);
UPDATE public.records SET tags = tags || ARRAY['interview', 'recall', 'screener']
 WHERE id = '5a5a0218-0000-4000-8000-0000000000c2';
-- An UPDATE that rewrites tags to themselves (a value-equal write) moves nothing either.
UPDATE public.records SET tags = tags WHERE id = '5a5a0218-0000-4000-8000-0000000000b1';

SELECT pg_temp.expect_row('5a5a0218-0000-4000-8000-0000000000a1', ARRAY['domain:collect'], ARRAY['first_light', 'first_light:affirm'], 'new-client TTFV');
SELECT pg_temp.expect_row('5a5a0218-0000-4000-8000-0000000000a2', ARRAY['domain:career', 'mine'], ARRAY['interview', 'recall', 'screener', 'entry-ui:en'], 'new-client interview');
SELECT pg_temp.expect_row('5a5a0218-0000-4000-8000-0000000000a3', ARRAY['domain:collect', 'mine'], ARRAY[]::text[], 'plain save gets the default');
SELECT pg_temp.expect_row('5a5a0218-0000-4000-8000-0000000000b1', ARRAY['domain:collect', 'first_light', 'first_light:soft', 'mine'], ARRAY[]::text[], 'old-client TTFV stays as written');
SELECT pg_temp.expect_row('5a5a0218-0000-4000-8000-0000000000b2', ARRAY['domain:growth', 'interview', 'recall', 'screener', 'entry-ui:ko'], ARRAY[]::text[], 'old-client interview stays as written');
SELECT pg_temp.expect_row('5a5a0218-0000-4000-8000-0000000000c1', ARRAY['domain:career', 'interview'], ARRAY[]::text[], 'user interview tag on a note');
SELECT pg_temp.expect_row('5a5a0218-0000-4000-8000-0000000000c2', ARRAY['domain:career', 'interview', 'recall', 'screener'], ARRAY[]::text[], 'user UPDATE never splits');

DO $no_trigger$
BEGIN
  IF EXISTS (
       SELECT 1
         FROM pg_catalog.pg_trigger AS t
         JOIN pg_catalog.pg_proc AS p ON p.oid = t.tgfoid
        WHERE t.tgrelid = 'public.records'::regclass
          AND NOT t.tgisinternal
          AND position('system_tags' IN p.prosrc) > 0
     ) THEN
    RAISE EXCEPTION 'a records trigger reads or writes system_tags';
  END IF;
  IF (SELECT pg_catalog.pg_get_expr(adbin, adrelid) FROM pg_catalog.pg_attrdef
       WHERE adrelid = 'public.records'::regclass
         AND adnum = (SELECT attnum FROM pg_catalog.pg_attribute
                       WHERE attrelid = 'public.records'::regclass AND attname = 'system_tags'))
     NOT IN ('ARRAY[]::text[]', '''{}''::text[]') THEN
    RAISE EXCEPTION 'system_tags default is not an empty array';
  END IF;
END
$no_trigger$;

-- 3. Gate CD-02: the database keeps the column's shape, not only the client.
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
      ('an upper-case domain: tag', ARRAY['interview', 'Domain:Career']),
      ('an empty string', ARRAY['']),
      ('a comma', ARRAY['interview,recall']),
      ('a space', ARRAY['entry ui']),
      ('65 characters', ARRAY[repeat('x', 65)]),
      ('17 markers', array_fill('x'::text, ARRAY[17]))
    ) AS t(label, bad)
  LOOP
    BEGIN
      INSERT INTO public.records (user_id, kind, body, tags, system_tags)
      VALUES ('5a5a0218-0000-4000-8000-000000000001', 'audit_response', 'shape probe', ARRAY[]::text[], v_bad);
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
  -- And what the writers write is accepted.
  UPDATE public.records SET system_tags = ARRAY['interview', 'recall', 'screener', 'entry-ui:en']
   WHERE id = '5a5a0218-0000-4000-8000-0000000000a2';
END
$shape$;
SELECT pg_temp.expect_row('5a5a0218-0000-4000-8000-0000000000a2', ARRAY['domain:career', 'mine'], ARRAY['interview', 'recall', 'screener', 'entry-ui:en'], 'shape probes changed nothing');

-- 4. Polaris evidence reads system_tags. a2 (system_tags interview, work) is the
-- only evidence row: b2 · b3 · b4 · c2 carry the word in tags only.
SAVEPOINT polaris;
UPDATE public.polaris_generation_config SET enabled = true;
SELECT set_config('request.jwt.claim.sub', '5a5a0218-0000-4000-8000-000000000001', true);
DO $polaris$
DECLARE
  v_generation uuid;
  v_evidence jsonb;
  v_ids uuid[];
BEGIN
  v_generation := (public.reserve_polaris_generation('5a5a0218-0000-4000-8000-000000000001', 'system-tags-0218-ci')->>'generation_id')::uuid;
  SELECT evidence INTO v_evidence FROM public.polaris_generations WHERE id = v_generation;
  SELECT array_agg((e->>'id')::uuid ORDER BY e->>'id') INTO v_ids FROM jsonb_array_elements(v_evidence) AS e;
  IF v_ids IS DISTINCT FROM ARRAY['5a5a0218-0000-4000-8000-0000000000a2']::uuid[] THEN
    RAISE EXCEPTION 'Polaris evidence picked % instead of the system_tags interview row', v_ids;
  END IF;
  IF jsonb_array_length(public.polaris_evidence_snapshot('5a5a0218-0000-4000-8000-000000000001', v_evidence)) <> 1 THEN
    RAISE EXCEPTION 'Polaris snapshot dropped the system_tags interview row';
  END IF;
  BEGIN
    PERFORM public.polaris_evidence_snapshot('5a5a0218-0000-4000-8000-000000000001',
      jsonb_build_array(jsonb_build_object('id', '5a5a0218-0000-4000-8000-0000000000b4', 'domain', 'now',
        'body_hash', encode(sha256(convert_to('Q: c\n\nA: d', 'UTF8')), 'hex'))));
    RAISE EXCEPTION 'Polaris snapshot accepted a row whose interview word is only in tags';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'polaris_evidence_changed' THEN
      RAISE;
    END IF;
  END;
END
$polaris$;
ROLLBACK TO SAVEPOINT polaris;

-- 5. Hand move. The list is what the survey showed and the owner confirmed.
CREATE TEMP TABLE ops_0218_hand_move (
  id            uuid PRIMARY KEY,
  user_id       uuid NOT NULL,
  expected_tags text[] NOT NULL,
  markers       text[] NOT NULL
) ON COMMIT DROP;

-- 5a. A malformed list (a user tag listed as a marker) changes nothing.
INSERT INTO ops_0218_hand_move VALUES
  ('5a5a0218-0000-4000-8000-0000000000b1', '5a5a0218-0000-4000-8000-000000000001',
   ARRAY['domain:collect', 'first_light', 'first_light:soft', 'mine'], ARRAY['first_light', 'first_light:soft', 'mine']);
SAVEPOINT malformed;
\set ON_ERROR_STOP off
\i db/ops/0218_system_tags_hand_move.sql
\set ON_ERROR_STOP on
ROLLBACK TO SAVEPOINT malformed;
SELECT :'LAST_ERROR_MESSAGE' LIKE '0218 hand move: 1 list rows are malformed%' AS hand_move_refused_list \gset
\if :hand_move_refused_list
\else
  DO $$ BEGIN RAISE EXCEPTION 'the hand move did not refuse a malformed list'; END $$;
\endif
SELECT pg_temp.expect_row('5a5a0218-0000-4000-8000-0000000000b1', ARRAY['domain:collect', 'first_light', 'first_light:soft', 'mine'], ARRAY[]::text[], 'malformed list changed nothing');
DELETE FROM ops_0218_hand_move;

-- 5a'. A well-formed list that names the wrong account, or TTFV markers on an
-- interview-kind row, stops the whole run before anything changes.
INSERT INTO public.records (id, user_id, kind, audit_period, body, tags) VALUES
  ('5a5a0218-0000-4000-8000-0000000000d1', '5a5a0218-0000-4000-8000-000000000001', 'audit_response', 'work',
   'an answer the user tagged with the TTFV words', ARRAY['domain:collect', 'first_light', 'first_light:affirm']);
INSERT INTO ops_0218_hand_move VALUES
  ('5a5a0218-0000-4000-8000-0000000000d1', '5a5a0218-0000-4000-8000-000000000001',
   ARRAY['domain:collect', 'first_light', 'first_light:affirm'], ARRAY['first_light', 'first_light:affirm']);
SAVEPOINT wrong_kind;
\set ON_ERROR_STOP off
\i db/ops/0218_system_tags_hand_move.sql
\set ON_ERROR_STOP on
ROLLBACK TO SAVEPOINT wrong_kind;
SELECT :'LAST_ERROR_MESSAGE' LIKE '0218 hand move: 5a5a0218-0000-4000-8000-0000000000d1 does not belong to the listed account or is not a note row%' AS hand_move_refused_kind \gset
\if :hand_move_refused_kind
\else
  DO $$ BEGIN RAISE EXCEPTION 'the hand move did not refuse TTFV markers on an interview-kind row'; END $$;
\endif
DELETE FROM ops_0218_hand_move;
INSERT INTO ops_0218_hand_move VALUES
  ('5a5a0218-0000-4000-8000-0000000000b1', '5a5a0218-0000-4000-8000-0000000000ee',
   ARRAY['domain:collect', 'first_light', 'first_light:soft', 'mine'], ARRAY['first_light', 'first_light:soft']);
SAVEPOINT wrong_owner;
\set ON_ERROR_STOP off
\i db/ops/0218_system_tags_hand_move.sql
\set ON_ERROR_STOP on
ROLLBACK TO SAVEPOINT wrong_owner;
SELECT :'LAST_ERROR_MESSAGE' LIKE '0218 hand move: 5a5a0218-0000-4000-8000-0000000000b1 does not belong to the listed account%' AS hand_move_refused_owner \gset
\if :hand_move_refused_owner
\else
  DO $$ BEGIN RAISE EXCEPTION 'the hand move did not refuse a row of another account'; END $$;
\endif
SELECT pg_temp.expect_row('5a5a0218-0000-4000-8000-0000000000d1', ARRAY['domain:collect', 'first_light', 'first_light:affirm'], ARRAY[]::text[], 'refused kind changed nothing');
SELECT pg_temp.expect_row('5a5a0218-0000-4000-8000-0000000000b1', ARRAY['domain:collect', 'first_light', 'first_light:soft', 'mine'], ARRAY[]::text[], 'refused owner changed nothing');
DELETE FROM ops_0218_hand_move;

-- A user typed the interview words onto a2, a row a new client already split.
UPDATE public.records SET tags = tags || ARRAY['interview', 'recall', 'screener', 'entry-ui:en']
 WHERE id = '5a5a0218-0000-4000-8000-0000000000a2';
INSERT INTO ops_0218_hand_move VALUES
  ('5a5a0218-0000-4000-8000-0000000000b1', '5a5a0218-0000-4000-8000-000000000001',
   ARRAY['domain:collect', 'first_light', 'first_light:soft', 'mine'], ARRAY['first_light', 'first_light:soft']),
  ('5a5a0218-0000-4000-8000-0000000000b2', '5a5a0218-0000-4000-8000-000000000001',
   ARRAY['domain:growth', 'interview', 'recall', 'screener', 'entry-ui:ko'], ARRAY['interview', 'recall', 'screener', 'entry-ui:ko']),
  ('5a5a0218-0000-4000-8000-0000000000b3', '5a5a0218-0000-4000-8000-000000000001',
   ARRAY['domain:career', 'interview', 'recall', 'screener', 'interview'], ARRAY['interview', 'recall', 'screener']),
  ('5a5a0218-0000-4000-8000-0000000000b4', '5a5a0218-0000-4000-8000-000000000001',
   ARRAY['domain:growth', 'interview', 'recall', 'screener'], ARRAY['interview', 'recall', 'screener']),
  -- already split by a new client: skipped, the user's words stay in tags
  ('5a5a0218-0000-4000-8000-0000000000a2', '5a5a0218-0000-4000-8000-000000000001',
   ARRAY['domain:career', 'mine', 'interview', 'recall', 'screener', 'entry-ui:en'], ARRAY['interview', 'recall', 'screener', 'entry-ui:en']),
  -- deleted since the survey: skipped
  ('5a5a0218-0000-4000-8000-0000000000ff', '5a5a0218-0000-4000-8000-000000000001',
   ARRAY['domain:collect', 'first_light', 'first_light:affirm'], ARRAY['first_light', 'first_light:affirm']);
-- The user edits b4 after the survey.
UPDATE public.records SET tags = tags || 'later'::text WHERE id = '5a5a0218-0000-4000-8000-0000000000b4';

-- 5b. A role that cannot bypass row-level security is refused before anything.
SAVEPOINT refused_role;
SET LOCAL ROLE authenticated;
\set ON_ERROR_STOP off
\i db/ops/0218_system_tags_hand_move.sql
\set ON_ERROR_STOP on
ROLLBACK TO SAVEPOINT refused_role;
SELECT :'LAST_ERROR_MESSAGE' LIKE '0218 hand move: run as a role that bypasses row-level security%' AS hand_move_refused_role \gset
\if :hand_move_refused_role
\else
  DO $$ BEGIN RAISE EXCEPTION 'the hand move did not refuse a role that cannot bypass row-level security'; END $$;
\endif
SELECT pg_temp.expect_row('5a5a0218-0000-4000-8000-0000000000b2', ARRAY['domain:growth', 'interview', 'recall', 'screener', 'entry-ui:ko'], ARRAY[]::text[], 'refused role changed nothing');

-- 5c. The real run, twice: the second run finds every row already split.
\i db/ops/0218_system_tags_hand_move.sql
SELECT pg_temp.expect_row('5a5a0218-0000-4000-8000-0000000000b1', ARRAY['domain:collect', 'mine'], ARRAY['first_light', 'first_light:soft'], 'hand move: TTFV');
SELECT pg_temp.expect_row('5a5a0218-0000-4000-8000-0000000000b2', ARRAY['domain:growth'], ARRAY['interview', 'recall', 'screener', 'entry-ui:ko'], 'hand move: interview with entry-ui (Q3)');
SELECT pg_temp.expect_row('5a5a0218-0000-4000-8000-0000000000b3', ARRAY['domain:career', 'interview'], ARRAY['interview', 'recall', 'screener'], 'hand move keeps the user''s duplicate tag');
SELECT pg_temp.expect_row('5a5a0218-0000-4000-8000-0000000000b4', ARRAY['domain:growth', 'interview', 'recall', 'screener', 'later'], ARRAY[]::text[], 'hand move skips a row changed since the survey');
SELECT pg_temp.expect_row('5a5a0218-0000-4000-8000-0000000000a2', ARRAY['domain:career', 'mine', 'interview', 'recall', 'screener', 'entry-ui:en'], ARRAY['interview', 'recall', 'screener', 'entry-ui:en'], 'hand move skips a split row');
SELECT pg_temp.expect_row('5a5a0218-0000-4000-8000-0000000000c1', ARRAY['domain:career', 'interview'], ARRAY[]::text[], 'hand move leaves unlisted rows');
SELECT pg_temp.expect_row('5a5a0218-0000-4000-8000-0000000000c2', ARRAY['domain:career', 'interview', 'recall', 'screener'], ARRAY[]::text[], 'hand move leaves unlisted rows (shape)');
CREATE TEMP TABLE system_tags_after_move ON COMMIT DROP AS
  SELECT id, tags, system_tags FROM public.records WHERE user_id = '5a5a0218-0000-4000-8000-000000000001';
\i db/ops/0218_system_tags_hand_move.sql
DO $idempotent$
BEGIN
  -- (The run's NOTICE says: moved 0, 4 already split, 1 changed since the survey, 1 gone.)
  IF EXISTS (
    (SELECT id, tags, system_tags FROM system_tags_after_move
     EXCEPT
     SELECT id, tags, system_tags FROM public.records WHERE user_id = '5a5a0218-0000-4000-8000-000000000001')
    UNION ALL
    (SELECT id, tags, system_tags FROM public.records WHERE user_id = '5a5a0218-0000-4000-8000-000000000001'
     EXCEPT
     SELECT id, tags, system_tags FROM system_tags_after_move)
  ) THEN
    RAISE EXCEPTION 'a second hand move changed rows';
  END IF;
END
$idempotent$;

-- 6. Rollback, then re-apply.
\i db/migrations/rollback/0218_down.sql

DO $down$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'records' AND column_name = 'system_tags') THEN
    RAISE EXCEPTION 'rollback left records.system_tags';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_constraint
              WHERE conrelid = 'public.records'::regclass AND conname = 'records_system_tags_shape') THEN
    RAISE EXCEPTION 'rollback left the shape constraint';
  END IF;
  -- Every marker is back in tags, right after a leading domain tag; a user tag of
  -- the same text stays beside it.
  IF (SELECT tags FROM public.records WHERE id = '5a5a0218-0000-4000-8000-0000000000a1')
       IS DISTINCT FROM ARRAY['domain:collect', 'first_light', 'first_light:affirm']
     OR (SELECT tags FROM public.records WHERE id = '5a5a0218-0000-4000-8000-0000000000a2')
       IS DISTINCT FROM ARRAY['domain:career', 'interview', 'recall', 'screener', 'entry-ui:en', 'mine', 'interview', 'recall', 'screener', 'entry-ui:en']
     OR (SELECT tags FROM public.records WHERE id = '5a5a0218-0000-4000-8000-0000000000b1')
       IS DISTINCT FROM ARRAY['domain:collect', 'first_light', 'first_light:soft', 'mine']
     OR (SELECT tags FROM public.records WHERE id = '5a5a0218-0000-4000-8000-0000000000b3')
       IS DISTINCT FROM ARRAY['domain:career', 'interview', 'recall', 'screener', 'interview']
     OR (SELECT tags FROM public.records WHERE id = '5a5a0218-0000-4000-8000-0000000000b4')
       IS DISTINCT FROM ARRAY['domain:growth', 'interview', 'recall', 'screener', 'later']
     OR (SELECT tags FROM public.records WHERE id = '5a5a0218-0000-4000-8000-0000000000a3')
       IS DISTINCT FROM ARRAY['domain:collect', 'mine'] THEN
    RAISE EXCEPTION 'rollback did not put the markers back into tags';
  END IF;
  IF position('AND tags @> ARRAY[''interview'']::text[]' IN
       (SELECT prosrc FROM pg_catalog.pg_proc WHERE oid = 'public.reserve_polaris_generation(uuid,text)'::regprocedure)) = 0
     OR position('AND r.tags @> ARRAY[''interview'']::text[]' IN
       (SELECT prosrc FROM pg_catalog.pg_proc WHERE oid = 'public.polaris_evidence_snapshot(uuid,jsonb)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'rollback did not restore the 0195 Polaris evidence query';
  END IF;
END
$down$;

CREATE TEMP TABLE system_tags_after_down ON COMMIT DROP AS
  SELECT id, tags FROM public.records WHERE user_id = '5a5a0218-0000-4000-8000-000000000001';

\i db/migrations/0218_records_system_tags.sql

DO $reapply$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.records AS r
      JOIN system_tags_after_down AS d ON d.id = r.id
     WHERE r.tags IS DISTINCT FROM d.tags OR cardinality(r.system_tags) <> 0
  ) THEN
    RAISE EXCEPTION 're-applying 0218 changed data';
  END IF;
END
$reapply$;

ROLLBACK;

SELECT 'PASS: 0218 keeps app markers apart without moving data by shape, guards the column shape, feeds Polaris from system_tags, hand-moves only listed rows, and rolls back without losing a marker';
