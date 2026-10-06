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
--     id                   uuid PRIMARY KEY,
--     user_id              uuid NOT NULL,   -- 2단계에서 본 계정. 다르면 전체를 멈춘다.
--     expected_tags        text[] NOT NULL, -- 2단계에서 본 tags 그대로.
--     markers              text[] NOT NULL, -- 작성자가 쓴 표식 묶음 그대로(아래 "묶음"). tags 에 있어야 한다.
--     mode                 text NOT NULL,   -- 'move' 또는 'cleanup' (아래 "모드").
--     expected_system_tags text[] NOT NULL  -- 2단계에서 본 system_tags 그대로.
--   );
--   INSERT INTO ops_0218_hand_move VALUES (...), (...);
--
-- 묶음. markers 는 두 작성자가 실제로 쓴 묶음 가운데 하나와 순서까지 같아야 한다(게이트 ST-02).
--   TTFV:      {first_light, first_light:affirm} 또는 {first_light, first_light:soft}
--   회상 인터뷰: {interview, recall, screener} (#1941, 2026-09-30 이전 판) 또는
--             {interview, recall, screener, entry-ui:ko} 또는 {..., entry-ui:en}
--   그 밖의 조합(soft 하나만 · affirm 과 soft 함께 · interview 없는 entry-ui · ko 와 en 함께 ·
--   다른 순서)은 어느 작성자도 쓴 적이 없다. 그런 줄은 사용자가 단 태그를 표식으로 잘못 고른
--   것이라 목록 전체를 멈춘다.
--
-- 모드 (게이트 ST-03).
--   move    아직 나뉘지 않은 행. expected_system_tags = '{}'. 표식을 tags 에서 빼 system_tags 에 쓴다.
--   cleanup 이미 나뉜 행인데 tags 에 같은 표식이 다시 들어온 행. 옛 판 화면이 이행 전에 읽어 둔
--           tags 전체를 이행 뒤에 되쓰면 이렇게 된다(사후 집계에서 already_have_system_tags 로
--           보인다). expected_system_tags = markers. system_tags 는 그대로 두고 tags 에서만 뺀다.
--           두 칸이 모두 사람이 확인한 값과 같을 때만 한다. 사용자가 그 단어를 직접 달았을 수도
--           있으므로, 그런 행은 주인이 확인한 QA 행일 때만 목록에 넣는다(Q2).
--
-- 실행 (목록 파일과 이 파일을 한 트랜잭션으로):
--   psql -X -v ON_ERROR_STOP=1 --single-transaction -f <목록 파일> -f db/ops/0218_system_tags_hand_move.sql
--
-- 무엇을 하나 (아래 DO 블록 하나가 전부다. 중간에 멈추면 아무것도 바뀌지 않는다).
--   1. 실행 역할이 행 보안을 우회하는지 본다. records 는 FORCE ROW LEVEL SECURITY(0178)라
--      우회하지 못하는 역할로는 0행을 보고 "성공" 한다(게이트 CD-05). 그래서 멈춘다. 그리고
--      row_security 를 끈다: 걸러질 행이 있으면 조용히 비지 않고 오류가 난다.
--   2. records.system_tags 가 있는지(0218 적용 뒤인지) 본다.
--   3. 목록을 먼저 다 본다. markers 는 위 묶음 가운데 하나(TTFV 묶음은 note 에만, 회상 인터뷰
--      묶음은 audit_response 에만)이고 표식마다 expected_tags 안에 있어야 한다. mode 와
--      expected_system_tags 는 위 모드의 짝이어야 한다. 하나라도 어긋나면 아무것도 바꾸지 않고
--      멈춘다(목록을 고쳐 다시 돌린다).
--   4. 행마다 잠그고(FOR UPDATE) 지금 값을 다시 본다.
--        · 행이 없으면(그사이 지워짐) 건너뛴다.
--        · 계정이 목록과 다르거나 종류(kind)가 표식 묶음과 다르면 전체를 멈춘다.
--        · 두 칸이 이미 이 줄을 실행한 뒤의 값이면 건너뛴다(두 번 돌려도 한 번 돌린 것과 같다).
--        · 지금 tags 나 system_tags 가 목록 값과 다르면 그 행만 건너뛴다(그사이 바뀌었다).
--        · 그 밖에는 표식마다 tags 에서 처음 나온 한 자리만 빼고, 표식을 system_tags 에 쓴다
--          (cleanup 은 system_tags 가 이미 그 값이다). 같은 문자열이 tags 에 또 있으면 그것은
--          사용자가 단 것이라 남는다(P4).
--   5. 사후 집계: 옮김 · 건너뜀 수, 목록 해시(sha256, 정렬한 행 번호), 그리고 표식 문자열이
--      아직 tags 에 남은 후보 행 수(목록 밖 = 실사용자 행 · 옛 판이 새로 쓴 행)를 NOTICE 로.
-- 바꾼 행의 updated_at 은 trg_records_updated_at 이 지금으로 바꾼다.
-- 되돌리기: 옮긴 행의 tags · system_tags 전후 값(보고서 폴더)을 손으로 되쓰거나,
-- db/migrations/rollback/0218_down.sql 이 칸을 지우며 표식을 전부 tags 로 돌린다.

DO $hand_move$
DECLARE
  -- src/lib/records/system-tags.ts 의 firstLightSystemTags · recallInterviewSystemTags 와
  -- 같은 문자열이다(src/lib/records/__tests__/system-tags-migration.test.ts 가 대조한다).
  c_ttfv      CONSTANT text[] := ARRAY['first_light', 'first_light:affirm', 'first_light:soft'];
  c_interview CONSTANT text[] := ARRAY['interview', 'recall', 'screener', 'entry-ui:ko', 'entry-ui:en'];
  -- 작성자가 실제로 쓴 묶음, 순서까지(헤더 "묶음"). c_interview_old 는 #1941 이전 판이다.
  c_ttfv_affirm   CONSTANT text[] := ARRAY['first_light', 'first_light:affirm'];
  c_ttfv_soft     CONSTANT text[] := ARRAY['first_light', 'first_light:soft'];
  c_interview_old CONSTANT text[] := ARRAY['interview', 'recall', 'screener'];
  c_interview_ko  CONSTANT text[] := ARRAY['interview', 'recall', 'screener', 'entry-ui:ko'];
  c_interview_en  CONSTANT text[] := ARRAY['interview', 'recall', 'screener', 'entry-ui:en'];
  v_item      record;
  v_row       record;
  v_kind      text;
  v_tags      text[];
  v_pos       integer;
  v_marker    text;
  v_listed    integer;
  v_bad       integer;
  v_moved     integer := 0;
  v_cleaned   integer := 0;
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
      OR l.mode IS NULL OR l.expected_system_tags IS NULL
      OR cardinality(l.markers) = 0
      OR array_position(l.markers, NULL) IS NOT NULL
      -- 순서까지 같은 작성자 묶음 하나(부분 묶음 · 섞인 묶음 · 다른 순서는 어긋남, 게이트 ST-02).
      OR NOT (   l.markers = c_ttfv_affirm OR l.markers = c_ttfv_soft
              OR l.markers = c_interview_old OR l.markers = c_interview_ko OR l.markers = c_interview_en)
      OR (SELECT count(DISTINCT m) FROM unnest(l.markers) AS m) <> cardinality(l.markers)
      OR NOT (l.markers <@ l.expected_tags)
      -- 모드와 expected_system_tags 의 짝(게이트 ST-03).
      OR l.mode NOT IN ('move', 'cleanup')
      OR (l.mode = 'move' AND cardinality(l.expected_system_tags) <> 0)
      OR (l.mode = 'cleanup' AND l.expected_system_tags IS DISTINCT FROM l.markers);
  IF v_bad > 0 THEN
    RAISE EXCEPTION '0218 hand move: % list rows are malformed (markers must be exactly one writer''s set in its order and present in expected_tags; mode move needs expected_system_tags {}, mode cleanup needs expected_system_tags = markers); nothing was changed', v_bad;
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

    -- 이 줄을 실행한 뒤의 tags: expected_tags 에서 표식마다 처음 나온 한 자리를 뺀 값.
    v_tags := v_item.expected_tags;
    FOREACH v_marker IN ARRAY v_item.markers LOOP
      v_pos := array_position(v_tags, v_marker);
      v_tags := v_tags[array_lower(v_tags, 1) : v_pos - 1] || v_tags[v_pos + 1 : array_upper(v_tags, 1)];
    END LOOP;

    IF v_row.tags IS NOT DISTINCT FROM v_tags AND v_row.system_tags IS NOT DISTINCT FROM v_item.markers THEN
      v_already := v_already + 1;
      RAISE NOTICE '0218 hand move: % is already done, skipped', v_item.id;
      CONTINUE;
    END IF;
    -- 두 칸 모두 사람이 확인한 값이어야 한다. move 줄인데 그사이 나뉜 행, cleanup 줄인데
    -- system_tags 가 다른 행, 그사이 tags 를 고친 행은 그 행만 건너뛴다.
    IF v_row.tags IS DISTINCT FROM v_item.expected_tags
       OR v_row.system_tags IS DISTINCT FROM v_item.expected_system_tags THEN
      v_changed := v_changed + 1;
      RAISE NOTICE '0218 hand move: % changed since the survey, skipped', v_item.id;
      CONTINUE;
    END IF;

    UPDATE public.records
       SET tags = v_tags,
           system_tags = v_item.markers
     WHERE id = v_item.id;
    IF v_item.mode = 'cleanup' THEN
      v_cleaned := v_cleaned + 1;
    ELSE
      v_moved := v_moved + 1;
    END IF;
  END LOOP;

  -- 5.
  IF v_moved + v_cleaned + v_changed + v_already + v_missing <> v_listed THEN
    RAISE EXCEPTION '0218 hand move: accounted for % of % list rows', v_moved + v_cleaned + v_changed + v_already + v_missing, v_listed;
  END IF;
  SELECT encode(sha256(convert_to(string_agg(l.id::text, ',' ORDER BY l.id), 'UTF8')), 'hex') INTO v_hash
    FROM pg_temp.ops_0218_hand_move AS l;
  SELECT count(*) INTO v_left
    FROM public.records AS r
   WHERE (r.kind::text = 'note' AND r.tags && c_ttfv)
      OR (r.kind::text = 'audit_response' AND r.tags && c_interview);
  RAISE NOTICE '0218 hand move: listed % (sha256 %), moved %, cleaned %, skipped % changed since the survey, % already done, % gone', v_listed, v_hash, v_moved, v_cleaned, v_changed, v_already, v_missing;
  RAISE NOTICE '0218 hand move: % candidate rows still carry marker words in tags (rows not listed: real users, user-typed tags, old-build writes after 0218)', v_left;
END
$hand_move$;
