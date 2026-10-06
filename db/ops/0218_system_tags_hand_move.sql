-- db/ops/0218_system_tags_hand_move.sql — 확인된 QA · 제작자 계정 행의 앱 표식을 한 번 옮긴다.
--
-- ⚠ 운영 적용 단계에서만, 묶음 GO 아래에서 실행한다(설계 docs/design/system-tags-261006.md
--   6.2 의 4단계: 0218 적용 뒤, 같은 GO 안에서 별도 트랜잭션). 이 저장소의 어떤 자동화도 이
--   파일을 운영에 돌리지 않는다. CI 는 빈 연습 데이터베이스에서 동작만 확인한다.
-- ⚠ 대상은 적용 직전 집계(db/ops/0218_system_tags_survey.sql)에서 계정 주인(Simon)이 QA ·
--   제작자 계정으로 확인한 행뿐이다. 실사용자 행은 목록에 넣지 않고 그대로 둔다(Q2).
--   entry-ui:* 도 옮긴다(Q3: 주인이 확인한 QA 행이라 출처가 확실하다).
--
-- 왜 손으로, 행 번호로. 옛 행에는 "누가 썼나" 를 말해 줄 증거가 tags 의 모양밖에 없다. 모양으로
-- 옮기면 사용자가 같은 단어를 단 태그까지 가져간다(#2094 게이트 CD2-01 high). 그래서 자동
-- 이행은 없고(설계 P3), 사람이 확인한 행만 그 행 번호로 옮긴다.
--
-- 입력. 행 번호는 이 파일에 넣지 않는다. 같은 세션에서 먼저 임시 표를 만든다(저장소 밖 목록
-- 파일. 행 번호 · 전후 값은 저장소 밖 보고서 폴더에만 두고, DECISIONS 에는 개수와 아래 NOTICE
-- 의 목록 해시만 적는다):
--
--   CREATE TEMP TABLE ops_0218_hand_move (
--     id            uuid PRIMARY KEY,
--     user_id       uuid NOT NULL,     -- 2단계에서 본 계정. 다르면 전체를 멈춘다.
--     expected_tags text[] NOT NULL,   -- 2단계에서 본 tags 그대로. 지금 값과 다르면 그 행만 건너뛴다.
--     markers       text[] NOT NULL    -- 옮길 표식(작성자가 쓴 순서). tags 에 있는 것만.
--   );
--   INSERT INTO ops_0218_hand_move VALUES (...), (...);
--
-- 실행 (목록 파일과 이 파일을 한 트랜잭션으로):
--   psql -X -v ON_ERROR_STOP=1 --single-transaction -f <목록 파일> -f db/ops/0218_system_tags_hand_move.sql
--
-- 무엇을 하나 (아래 DO 블록 하나가 전부다. 중간에 멈추면 아무것도 바뀌지 않는다).
--   1. 실행 역할이 행 보안을 우회하는지 본다. records 는 FORCE ROW LEVEL SECURITY(0178)라
--      우회하지 못하는 역할로는 0행을 보고 "성공" 한다(게이트 CD-05). 그래서 멈춘다. 그리고
--      row_security 를 끈다: 걸러질 행이 있으면 조용히 비지 않고 오류가 난다.
--   2. records.system_tags 가 있는지(0218 적용 뒤인지) 본다.
--   3. 목록을 먼저 다 본다. 표식은 두 작성자가 쓰는 문자열뿐이다(TTFV 묶음은 note 에만,
--      회상 인터뷰 묶음은 audit_response 에만, 섞지 않는다). 표식마다 expected_tags 안에
--      있어야 한다. 하나라도 어긋나면 아무것도 바꾸지 않고 멈춘다(목록을 고쳐 다시 돌린다).
--   4. 행마다 잠그고(FOR UPDATE) 지금 값을 다시 본다.
--        · 행이 없으면(그사이 지워짐) 건너뛴다.
--        · 계정이 목록과 다르거나 종류(kind)가 표식 묶음과 다르면 전체를 멈춘다.
--        · 이미 system_tags 가 있으면 건너뛴다(두 번 돌려도 한 번 돌린 것과 같다).
--        · 지금 tags 가 expected_tags 와 다르면 그 행만 건너뛴다(그사이 사용자가 고쳤다).
--        · 그 밖에는 표식마다 tags 에서 처음 나온 한 자리만 빼고, 표식을 system_tags 에 쓴다.
--          같은 문자열이 tags 에 또 있으면 그것은 사용자가 단 것이라 남는다(P4).
--   5. 사후 집계: 옮김 · 건너뜀 수, 목록 해시(sha256, 정렬한 행 번호), 그리고 표식 문자열이
--      아직 tags 에 남은 후보 행 수(목록 밖 = 실사용자 행 · 옛 판이 새로 쓴 행)를 NOTICE 로.
-- 옮긴 행의 updated_at 은 trg_records_updated_at 이 지금으로 바꾼다.
-- 되돌리기: 옮긴 행의 tags · system_tags 전후 값(보고서 폴더)을 손으로 되쓰거나,
-- db/migrations/rollback/0218_down.sql 이 칸을 지우며 표식을 전부 tags 로 돌린다.

DO $hand_move$
DECLARE
  -- src/lib/records/system-tags.ts 의 firstLightSystemTags · recallInterviewSystemTags 와
  -- 같은 문자열이다(src/lib/records/__tests__/system-tags-migration.test.ts 가 대조한다).
  c_ttfv      CONSTANT text[] := ARRAY['first_light', 'first_light:affirm', 'first_light:soft'];
  c_interview CONSTANT text[] := ARRAY['interview', 'recall', 'screener', 'entry-ui:ko', 'entry-ui:en'];
  v_item      record;
  v_row       record;
  v_kind      text;
  v_tags      text[];
  v_pos       integer;
  v_marker    text;
  v_listed    integer;
  v_bad       integer;
  v_moved     integer := 0;
  v_changed   integer := 0;
  v_already   integer := 0;
  v_missing   integer := 0;
  v_left      integer;
  v_hash      text;
BEGIN
  -- 1.
  IF NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_roles
        WHERE rolname = current_user AND (rolsuper OR rolbypassrls)
     ) THEN
    RAISE EXCEPTION '0218 hand move: run as a role that bypasses row-level security (public.records is FORCE ROW LEVEL SECURITY); current_user = %', current_user;
  END IF;
  PERFORM set_config('row_security', 'off', true);

  -- 2.
  IF NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_attribute
        WHERE attrelid = 'public.records'::regclass AND attname = 'system_tags' AND NOT attisdropped
     ) THEN
    RAISE EXCEPTION '0218 hand move: public.records.system_tags does not exist; apply 0218 first';
  END IF;
  IF to_regclass('pg_temp.ops_0218_hand_move') IS NULL THEN
    RAISE EXCEPTION '0218 hand move: create the temp table ops_0218_hand_move with the confirmed rows first (see the header)';
  END IF;

  -- 3. 목록 검사. 어긋난 줄이 하나라도 있으면 아무것도 바꾸지 않는다.
  SELECT count(*) INTO v_listed FROM pg_temp.ops_0218_hand_move;
  IF v_listed = 0 THEN
    RAISE EXCEPTION '0218 hand move: ops_0218_hand_move is empty';
  END IF;
  SELECT count(*) INTO v_bad
    FROM pg_temp.ops_0218_hand_move AS l
   WHERE l.id IS NULL OR l.user_id IS NULL OR l.expected_tags IS NULL OR l.markers IS NULL
      OR cardinality(l.markers) = 0
      OR array_position(l.markers, NULL) IS NOT NULL
      OR NOT (l.markers <@ c_ttfv OR l.markers <@ c_interview)
      OR (SELECT count(DISTINCT m) FROM unnest(l.markers) AS m) <> cardinality(l.markers)
      OR NOT (l.markers <@ l.expected_tags);
  IF v_bad > 0 THEN
    RAISE EXCEPTION '0218 hand move: % list rows are malformed (markers must be one writer''s set, distinct, and present in expected_tags); nothing was changed', v_bad;
  END IF;

  -- 4.
  FOR v_item IN SELECT * FROM pg_temp.ops_0218_hand_move ORDER BY id LOOP
    SELECT r.user_id, r.kind::text AS kind, r.tags, r.system_tags INTO v_row
      FROM public.records AS r
     WHERE r.id = v_item.id
       FOR UPDATE;
    IF NOT FOUND THEN
      v_missing := v_missing + 1;
      RAISE NOTICE '0218 hand move: % is gone, skipped', v_item.id;
      CONTINUE;
    END IF;

    v_kind := CASE WHEN v_item.markers <@ c_ttfv THEN 'note' ELSE 'audit_response' END;
    IF v_row.user_id IS DISTINCT FROM v_item.user_id OR v_row.kind IS DISTINCT FROM v_kind THEN
      RAISE EXCEPTION '0218 hand move: % does not belong to the listed account or is not a % row; nothing was changed', v_item.id, v_kind;
    END IF;

    IF cardinality(v_row.system_tags) > 0 THEN
      v_already := v_already + 1;
      RAISE NOTICE '0218 hand move: % already has system_tags, skipped', v_item.id;
      CONTINUE;
    END IF;
    IF v_row.tags IS DISTINCT FROM v_item.expected_tags THEN
      v_changed := v_changed + 1;
      RAISE NOTICE '0218 hand move: % changed since the survey, skipped', v_item.id;
      CONTINUE;
    END IF;

    v_tags := v_row.tags;
    FOREACH v_marker IN ARRAY v_item.markers LOOP
      v_pos := array_position(v_tags, v_marker);
      v_tags := v_tags[array_lower(v_tags, 1) : v_pos - 1] || v_tags[v_pos + 1 : array_upper(v_tags, 1)];
    END LOOP;

    UPDATE public.records
       SET tags = v_tags,
           system_tags = v_item.markers
     WHERE id = v_item.id;
    v_moved := v_moved + 1;
  END LOOP;

  -- 5.
  IF v_moved + v_changed + v_already + v_missing <> v_listed THEN
    RAISE EXCEPTION '0218 hand move: accounted for % of % list rows', v_moved + v_changed + v_already + v_missing, v_listed;
  END IF;
  SELECT encode(sha256(convert_to(string_agg(l.id::text, ',' ORDER BY l.id), 'UTF8')), 'hex') INTO v_hash
    FROM pg_temp.ops_0218_hand_move AS l;
  SELECT count(*) INTO v_left
    FROM public.records AS r
   WHERE (r.kind::text = 'note' AND r.tags && c_ttfv)
      OR (r.kind::text = 'audit_response' AND r.tags && c_interview);
  RAISE NOTICE '0218 hand move: listed % (sha256 %), moved %, skipped % changed since the survey, % already split, % gone', v_listed, v_hash, v_moved, v_changed, v_already, v_missing;
  RAISE NOTICE '0218 hand move: % candidate rows still carry marker words in tags (rows not listed: real users, user-typed tags, old-build writes after 0218)', v_left;
END
$hand_move$;
