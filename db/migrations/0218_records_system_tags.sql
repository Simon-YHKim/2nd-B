-- 0218_records_system_tags.sql
--
-- 앱이 붙이는 표식을 사용자 태그와 다른 칸으로 (Simon 결정 Q-261004-39 = A,
-- 2026-10-05 19:53 · QA D-07).
--
-- 왜. 앱은 자기 표식을 사용자 태그와 같은 칸(records.tags)에 써 왔다 — TTFV 는
-- first_light · first_light:affirm|soft, 회상 인터뷰는 interview · recall ·
-- screener · entry-ui:<locale>. 그래서 /discover · /research 가 first_light ·
-- interview 를 사용자의 주제로 보여 줬다. 화면에서 거르는 수정(#2042)은 게이트 세
-- 번에서 수렴하지 않았다: 사용자도 같은 단어를 태그로 달 수 있고, 같은 칸의 문자열은
-- 누가 썼는지 말해 주지 않는다. 그래서 표식을 자기 칸으로 옮기고, "앱이 쓴 표식인가"
-- 를 묻는 곳(회상 인터뷰 완료 · 북극성 근거 · TTFV 후보 · 커리어 출처)은 전부 그 칸을
-- 읽는다.
--
-- 무엇이 어디에 남나.
--   tags         사용자가 단 태그 + 예약된 domain: 분류. domain: 은 일부러 여기 둔다.
--                사용자 태그와 부딪히지 않는다(createRecord 가 날것의 domain:* 를 지우고,
--                상세 화면이 거부하고, Move · 별 담기 · 추론 비준은 정해진 DomainId 만
--                쓴다). 그리고 그것은 사용자 자신의 분류다(Move 로 바꾼다). 별 밝기
--                (load-domain-levels) · 커리어 타임라인(career.tsx .overlaps) ·
--                /star/<domain>(.contains) 가 tags 에서 읽고, 이 마이그레이션 뒤에도
--                그대로다.
--   system_tags  앱이 "이 기록이 어떻게 만들어졌나" 를 적는 표식. 이 마이그레이션은
--                작성자 둘만 옮긴다: TTFV · 회상 인터뷰.
-- 다른 앱 태그(담기 모드 voice/todo/fourw · call_reflection · 검사 묶음 · life_audit +
-- framework · career_achievement + year: · NORTHSTAR · imported:* · reasoning:ratified)
-- 는 tags 에 남는다. 각자 읽는 곳과 이행 규칙이 달라 같은 칸으로 작성자 하나씩 옮긴다.
--
-- ── 이행 규칙 (기존 행 · 옛 앱의 쓰기) ──────────────────────────────────────
-- 사용자가 직접 붙였을 수 있는 값은 잃지 않는다. 작성자의 모양이 정확히 맞을 때만
-- 옮기고, 아니면 사용자 태그로 둔다(보수적). 모양 판정은 순수 함수
-- records_app_system_tags_split() 한 곳에만 있고, 트리거 · 아래 일괄 이행 · 이행
-- 사후 조건 · 되돌리기 파일의 왕복 확인이 모두 그 함수를 부른다.
--
-- 언제 옮기나 (게이트 CD-01 · CDA-01, 2026-10-06). 표식이 아직 tags 에 있을 수 있는
-- 두 때뿐이다. 이 칸이 비어 있는 행에서
--   · INSERT — 옛 앱(설치된 APK · 캐시된 웹 번들)이 0218 이전 모양으로 새 기록을 쓸 때
--   · tags 를 바꾸지 않는 UPDATE — 아래 일괄 이행(SET tags = tags)
-- 그 밖의 UPDATE(사용자가 태그를 덧붙이거나 Move · 비준이 tags 를 다시 쓰는 것)는
-- 옮기지 않는다. 이미 system_tags 가 있는 행의 tags 에 interview · recall ·
-- screener 나 first_light 쌍이 다시 나타나면 그건 사용자가 단 태그다 — 옛 판에서는
-- 상세 화면에서 차례로 덧붙이면 맨 앞 모양이 되어 사용자 태그 세 개가 지워졌다.
-- 대가: 0218 적용 전에 열어 둔 옛 앱 화면이 적용 뒤 그 행의 낡은 tags 를 되써도
-- 표식은 옮겨지지 않고 tags 에 한 번 더 남는다(잃지 않고 겹친다).
--
--   1. tags 에서 domain:* (대소문자 무시)를 빼고 순서를 지킨 나머지를 본다.
--      맨 앞이 reasoning:ratified 면 그다음부터 본다(/reasoning 비준이
--      [domain, reasoning:ratified, ...이전 태그] 로 다시 쓴다).
--   2. TTFV — kind='note' 이고 맨 앞 둘이 first_light, first_light:affirm|soft 이고
--      body 가 TTFV 가 쓴 문장일 때. 문장은 세 판이 있었다:
--        2026-07-02~  첫 통찰|First light: "<문구>" — <답>   (em dash)
--        2026-08-02~  <접두>: "<문구>" - <답>                 (5개 언어)
--        2026-08-31~  <recordPrefix>: <recordAffirm|recordSoft> (5개 언어, 지금)
--      body 까지 보는 이유: 이 두 단어를 사용자가 직접 같은 순서로 달 수는 있어도,
--      앱이 쓴 문장까지 똑같이 쓰지는 않는다(#2042 게이트 r3 SG-01 이 짚은 충돌).
--   3. 회상 인터뷰 — kind='audit_response' 이고 맨 앞이 아래 중 하나일 때.
--        2026-09-30~  interview, recall, screener, entry-ui:ko|en
--                     (entry-ui 는 그 작성자가 main 에 들어온 2026-09-30 20:39:26
--                     KST(864fd061) 이후 created_at 인 행에서만 표식으로 본다. 그
--                     전 행의 세 표식 뒤 entry-ui:* 는 사용자가 덧붙인 태그다)
--        2026-07-05~  interview, recall, screener
--        2026-05-27~  interview, life_audit, period-<p>, layers-<n>
--        2026-05-26~  interview, life_audit, period-<p>
--      audit_response 를 쓰는 다른 작성자(/audit)는 life_audit 로 시작하고, 사용자는
--      태그를 끝에 덧붙일 수만 있다(상세 화면에 지우기 · 순서 바꾸기가 없다). 그래서
--      interview 로 시작하는 audit_response 는 인터뷰가 쓴 것이다.
--   4. 맞으면 그 표식만 tags 의 그 자리에서 빼서 system_tags 에 (중복 없이) 붙인다.
--      domain:* · reasoning:ratified · 사용자가 덧붙인 태그는 원래 순서대로 남는다.
--
-- 남는 충돌은 하나뿐이다: 사용자가 메모에 first_light · first_light:affirm 을 그
-- 순서로 달고 본문까지 TTFV 문장 그대로 쓴 경우. 그 기록은 TTFV 표식으로 옮겨진다.
--
-- 운영 실측(2026-10-06 읽기 전용 집계): 이 규칙에 맞는 행 32개 = TTFV 26(사용자 4명 ·
-- 전부 domain:collect · 본문 26/26 이 위 문장) + 회상 인터뷰 6(사용자 1명 ·
-- interview, recall, screener 판). first_light 나 interview 를 가진 다른 행은 0.
--
-- ── 이 마이그레이션이 하는 일 ──────────────────────────────────────────────
--   ① records.system_tags text[] NOT NULL DEFAULT '{}' 칸 + 모양 제약
--      records_system_tags_shape: 1차원 · 첨자 1부터 · NULL 원소 없음 · 16개 이하 ·
--      원소마다 [A-Za-z0-9_.:-] 1~64자 · domain: 없음. 클라이언트가 이 칸을 직접 쓸 수
--      있으므로(records_owner_all) 정규화를 클라이언트에만 맡기지 않는다(게이트 CD-02:
--      ARRAY[NULL] 이 표식을 tags 에서 빼고 어디에도 남기지 않던 경로).
--   ② 판정 함수 + BEFORE INSERT OR UPDATE OF tags 트리거: 위 규칙. 옛 앱이 아직
--      표식을 tags 에 넣어 새 기록을 쓰면 저장 순간 옮긴다. 새 앱은 system_tags 에 바로
--      쓰므로 아무것도 안 바뀐다.
--   ③ 기존 행 이행: 판정 함수가 옮길 것이 있다고 하는 행에만 UPDATE ... SET tags =
--      tags 를 해서 같은 트리거를 태운다. 옮겨진 행은 trg_records_updated_at 이
--      updated_at 을 지금으로 바꾼다(클라이언트에 records.updated_at 을 읽는 곳은
--      없다). records 는 FORCE ROW LEVEL SECURITY(0178)라, RLS 를 우회하지 못하는
--      역할로 돌리면 0행을 보고도 성공할 수 있었다(게이트 CD-05). 그래서 우회 역할
--      (superuser 또는 BYPASSRLS)이 아니면 멈추고, row_security=off 로 걸러질 행이
--      있으면 오류가 나게 하고, 끝난 뒤 옮길 모양이 남은 행이 0인지 확인한다.
--      운영의 postgres 는 rolsuper=false · rolbypassrls=true 다(2026-10-06 읽기 전용
--      조회, 같은 조회에서 후보 32행).
--   ④ 북극성 근거를 고르는 두 함수(0195 reserve_polaris_generation ·
--      polaris_evidence_snapshot)가 tags 가 아니라 system_tags 에서 interview 를 찾게
--      다시 정의한다. 본문은 0195 와 한 글자도 다르지 않고 그 조건 하나만 다르다
--      (src/lib/records/__tests__/system-tags-migration.test.ts 가 대조한다). 권한은
--      0195 그대로다.
--
-- ── 순서 (DECISIONS 26.10.05 19:53 ④ · #1869 와 같은 함정) ─────────────────
--   운영 적용 GO → 이 파일 적용 → PR 머지 → 웹 게시 · APK. 적용 뒤에는 옛 앱이 tags
--   에서 표식을 찾는다: TTFV 가 자기 기록을 후보로 고를 수 있고, 커리어 · 대시보드 ·
--   북극성 카드 화면이 인터뷰를 못 알아본다(북극성 생성은 운영에서 꺼져 있다 —
--   polaris_generation_config.enabled=false, 10-06 실측).
--   ⚠ 이 창은 웹 게시로 닫히는 것이 아니다(게이트 CDA-04). 웹은 게시로 바뀌지만 이미
--   설치된 APK 는 새 APK 로 바꿔 깔 때까지 옛 읽기를 계속한다. 이 앱에는 옛 판을
--   막거나 업데이트를 강제하는 장치가 없다(notices.min_app_version 은 공지를 보일
--   판을 고르는 조건일 뿐이다). 옛 판의 읽기를 함께 살리는 경로도 이 파일에는 없다 —
--   표식을 tags 에 다시 겹쳐 두는 것이 곧 이 마이그레이션이 없애려는 결함이기 때문이다.
--   스토어에는 아직 나간 적이 없어(2026-10-06 기준) 영향은 QA 로 깐 APK 다. 그 APK
--   들을 새 판으로 바꾸는 일을 적용의 완료 조건에 넣을지는 적용 GO 와 함께 정한다.
--   새 앱은 칸이 없는 데이터베이스에서도 깨지지 않는다(42703 · PGRST204 를 보면
--   0218 이전 모양으로 다시 묻는다, records/system-tags.ts).
--
-- 되돌리기: db/migrations/rollback/0218_down.sql (표식을 tags 로 되돌리고 칸을 지운다).
-- 그 파일은 다시 적용했을 때 같은 (tags, system_tags) 로 돌아오지 않을 행(예: 본문을
-- 고친 TTFV 기록)이 있으면 아무것도 바꾸기 전에 멈춘다(게이트 CDA-03).
-- 계정 삭제 · 내용 삭제: 칸은 records 행의 일부라 행과 함께 지워진다. records 는
-- 이미 erasure registry 의 client_erasable 이고(0189), 새 표가 없어 등록할 것이 없다.

-- 최상위 BEGIN/COMMIT 을 두지 않는다. Supabase CLI 가 이 파일을 자기 트랜잭션으로
-- 감싼다(supabase-dry-run.yml 이 0147 이상에 대해 막는다).

SET LOCAL lock_timeout = '10s';

-- ① 칸 · 모양 제약
ALTER TABLE public.records
  ADD COLUMN IF NOT EXISTS system_tags text[] NOT NULL DEFAULT ARRAY[]::text[];

COMMENT ON COLUMN public.records.system_tags IS
  'Markers the app attaches to say how the record was produced (0218: TTFV first_light pair, recall interview set). Never user tags; records.tags keeps the user''s tags and the reserved domain: classification.';

-- CASE 는 순서대로 평가된다: 다차원 배열은 array_position 이 오류를 내기 전에 거른다.
-- 원소 검사는 쉼표로 이어 붙인 문자열 하나로 한다. 쉼표 수가 원소 수 - 1 과 같아야
-- 하므로(원소 안의 쉼표는 여기서 걸린다) 정규식의 쉼표는 원소 사이에만 있다.
ALTER TABLE public.records DROP CONSTRAINT IF EXISTS records_system_tags_shape;
ALTER TABLE public.records ADD CONSTRAINT records_system_tags_shape CHECK (
  CASE
    WHEN cardinality(system_tags) = 0 THEN true
    WHEN array_ndims(system_tags) <> 1 OR array_lower(system_tags, 1) <> 1 THEN false
    WHEN array_position(system_tags, NULL) IS NOT NULL THEN false
    WHEN cardinality(system_tags) > 16 THEN false
    WHEN length(array_to_string(system_tags, ','))
         - length(replace(array_to_string(system_tags, ','), ',', '')) <> cardinality(system_tags) - 1 THEN false
    WHEN array_to_string(system_tags, ',') !~ '^[A-Za-z0-9_.:-]{1,64}(,[A-Za-z0-9_.:-]{1,64})*$' THEN false
    WHEN lower(array_to_string(system_tags, ',')) ~ '(^|,)domain:' THEN false
    ELSE true
  END
);

-- ② 판정 · 트리거
-- 판정은 순수 함수다: 표를 읽지 않고, 넘겨받은 값만 본다. kept 는 tags 에서 옮길
-- 자리만 뺀 나머지(원래 순서), markers 는 옮길 표식(작성자가 쓴 순서). 옮길 것이
-- 없으면 kept = p_tags, markers = '{}'.
CREATE OR REPLACE FUNCTION public.records_app_system_tags_split(
  p_kind text, p_body text, p_tags text[], p_created_at timestamptz,
  OUT kept text[], OUT markers text[])
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $split$
DECLARE
  v_core text[] := ARRAY[]::text[];
  v_at integer[] := ARRAY[]::integer[];
  v_drop integer[];
  v_start integer := 1;
  v_take integer := 0;
  v_i integer;
BEGIN
  kept := p_tags;
  markers := ARRAY[]::text[];
  IF p_tags IS NULL OR cardinality(p_tags) = 0 THEN
    RETURN;
  END IF;

  -- 1. domain:* 를 뺀 태그와 그 자리.
  FOR v_i IN array_lower(p_tags, 1) .. array_upper(p_tags, 1) LOOP
    IF p_tags[v_i] IS NOT NULL AND lower(p_tags[v_i]) NOT LIKE 'domain:%' THEN
      v_core := v_core || p_tags[v_i];
      v_at := v_at || v_i;
    END IF;
  END LOOP;
  IF v_core[1] = 'reasoning:ratified' THEN
    v_start := 2;
  END IF;

  -- 2. TTFV. 범위 밖 첨자는 NULL 이라 조건이 거짓이 된다.
  IF p_kind = 'note'
     AND v_core[v_start] = 'first_light'
     AND v_core[v_start + 1] IN ('first_light:affirm', 'first_light:soft')
     AND (
       p_body IN (
         'First record review: This record still feels like me.',
         'First record review: This record feels a little different now.',
         '첫 기록 검토: 이 기록은 지금도 나와 맞아요.',
         '첫 기록 검토: 이 기록은 지금의 나와 조금 달라요.',
         'Revisión del primer registro: Este registro todavía se parece a mí.',
         'Revisión del primer registro: Este registro se siente un poco diferente ahora.',
         'Revisão do primeiro registro: Este registro ainda parece comigo.',
         'Revisão do primeiro registro: Este registro parece um pouco diferente agora.',
         'Tinjauan catatan pertama: Catatan ini masih terasa seperti diriku.',
         'Tinjauan catatan pertama: Catatan ini terasa sedikit berbeda sekarang.'
       )
       OR p_body ~ '^(First light|첫 통찰|Primera luz|Primeira luz|Cahaya pertama): ".*" (—|-) (that''s right|feels a little different|맞아요|조금 다르게 느껴요|es cierto|se siente un poco diferente|faz sentido|parece um pouco diferente|itu benar|terasa sedikit berbeda)$'
     ) THEN
    v_take := 2;
  -- 3. 회상 인터뷰.
  ELSIF p_kind = 'audit_response' AND v_core[v_start] = 'interview' THEN
    IF v_core[v_start + 1] = 'recall' AND v_core[v_start + 2] = 'screener' THEN
      -- entry-ui 작성자(864fd061)가 main 에 들어오기 전의 행에는 앱이 쓴 entry-ui 가
      -- 있을 수 없다. 그 행의 네 번째 entry-ui:* 는 사용자가 덧붙인 태그로 둔다.
      v_take := CASE
        WHEN v_core[v_start + 3] IN ('entry-ui:ko', 'entry-ui:en')
             AND p_created_at >= timestamptz '2026-09-30 20:39:26+09' THEN 4
        ELSE 3
      END;
    ELSIF v_core[v_start + 1] = 'life_audit' AND v_core[v_start + 2] ~ '^period-[a-z]+$' THEN
      v_take := CASE WHEN v_core[v_start + 3] ~ '^layers-[0-9]+$' THEN 4 ELSE 3 END;
    END IF;
  END IF;

  IF v_take = 0 THEN
    RETURN;
  END IF;

  -- 4. 그 자리의 표식만 뺀다. domain:* · reasoning:ratified · 사용자 태그는 원래 순서.
  v_drop := v_at[v_start : v_start + v_take - 1];
  kept := ARRAY[]::text[];
  FOR v_i IN array_lower(p_tags, 1) .. array_upper(p_tags, 1) LOOP
    IF NOT (v_i = ANY (v_drop)) THEN
      kept := kept || p_tags[v_i];
    END IF;
  END LOOP;
  markers := v_core[v_start : v_start + v_take - 1];
END
$split$;

-- 트리거가 호출한 사람의 권한으로 이 함수를 부르므로, 기록을 쓰는 역할(앱 =
-- authenticated, 서버 = service_role)은 실행할 수 있어야 한다. 표를 읽지 않는 순수
-- 함수라 그 역할이 RPC 로 불러도 넘긴 값 말고는 아무것도 보지 못한다. anon 은 기록을
-- 쓸 수 없으므로 막는다(Supabase 의 새 함수 자동 부여를 걷는다).
REVOKE ALL ON FUNCTION public.records_app_system_tags_split(text, text, text[], timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.records_app_system_tags_split(text, text, text[], timestamptz) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.records_move_app_system_tags()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $move$
DECLARE
  v_split record;
  v_marker text;
BEGIN
  NEW.system_tags := COALESCE(NEW.system_tags, ARRAY[]::text[]);
  -- 위 "언제 옮기나": 이 칸이 비어 있는 행의 INSERT, 또는 tags 를 바꾸지 않는
  -- UPDATE(일괄 이행)만. 이미 표식이 있는 행 · 사용자가 tags 를 바꾸는 UPDATE 는
  -- 문자열 모양으로 다시 판정하지 않는다.
  IF cardinality(NEW.system_tags) > 0 THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND (
       cardinality(COALESCE(OLD.system_tags, ARRAY[]::text[])) > 0
       OR NEW.tags IS DISTINCT FROM OLD.tags
     ) THEN
    RETURN NEW;
  END IF;

  SELECT s.kept, s.markers INTO v_split
    FROM public.records_app_system_tags_split(NEW.kind::text, NEW.body, NEW.tags, NEW.created_at) AS s;
  IF cardinality(v_split.markers) = 0 THEN
    RETURN NEW;
  END IF;

  -- 중복 없이 붙인다. NULL 원소가 있어도 비교가 NULL 로 빠지지 않게 COALESCE.
  FOREACH v_marker IN ARRAY v_split.markers LOOP
    IF NOT COALESCE(v_marker = ANY (NEW.system_tags), false) THEN
      NEW.system_tags := NEW.system_tags || v_marker;
    END IF;
  END LOOP;
  NEW.tags := v_split.kept;
  RETURN NEW;
END
$move$;

-- 트리거 함수는 직접 부를 수 없고, 발화할 때는 EXECUTE 권한을 보지 않는다
-- (0195 erase_polaris_record_evidence 와 같은 처리).
REVOKE ALL ON FUNCTION public.records_move_app_system_tags() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS records_move_app_system_tags ON public.records;
CREATE TRIGGER records_move_app_system_tags
  BEFORE INSERT OR UPDATE OF tags ON public.records
  FOR EACH ROW EXECUTE FUNCTION public.records_move_app_system_tags();

-- ③ 기존 행 이행. 판정 함수가 옮길 것이 있다고 하는 행만 건드리고, 옮기는 일은
-- 트리거가 한다. records 는 FORCE ROW LEVEL SECURITY 라 실행 역할이 RLS 를 우회하지
-- 못하면 이 UPDATE 가 0행을 보고 "성공" 한다 — 그래서 멈추고, 걸러질 행이 있으면
-- row_security=off 가 오류를 내게 하고, 끝난 뒤 옮길 모양이 남은 행이 없는지 센다.
DO $backfill$
DECLARE
  v_row_security text := current_setting('row_security');
  v_touched integer;
  v_left integer;
BEGIN
  IF NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_roles
        WHERE rolname = current_user AND (rolsuper OR rolbypassrls)
     ) THEN
    RAISE EXCEPTION '0218: run this migration as a role that bypasses row-level security (public.records is FORCE ROW LEVEL SECURITY); current_user = %', current_user;
  END IF;
  PERFORM set_config('row_security', 'off', true);

  UPDATE public.records AS r
     SET tags = r.tags
   WHERE r.tags && ARRAY['first_light', 'interview']::text[]
     AND cardinality(r.system_tags) = 0
     AND cardinality((public.records_app_system_tags_split(r.kind::text, r.body, r.tags, r.created_at)).markers) > 0;
  GET DIAGNOSTICS v_touched = ROW_COUNT;

  SELECT count(*) INTO v_left
    FROM public.records AS r
   WHERE r.tags && ARRAY['first_light', 'interview']::text[]
     AND cardinality(r.system_tags) = 0
     AND cardinality((public.records_app_system_tags_split(r.kind::text, r.body, r.tags, r.created_at)).markers) > 0;
  IF v_left > 0 THEN
    RAISE EXCEPTION '0218 backfill: % rows still carry the app''s markers in tags', v_left;
  END IF;

  PERFORM set_config('row_security', v_row_security, true);
  RAISE NOTICE '0218 backfill: % rows moved their markers to system_tags', v_touched;
END
$backfill$;

-- ④ 북극성 근거: interview 를 system_tags 에서 찾는다 (0195 본문 + 조건 하나).
CREATE OR REPLACE FUNCTION public.reserve_polaris_generation(p_user_id uuid, p_key text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_row public.polaris_generations%ROWTYPE;
  v_week text := to_char(now() AT TIME ZONE 'Asia/Seoul', 'IYYY-"W"IW');
  v_month text := to_char(now() AT TIME ZONE 'Asia/Seoul', 'YYYY-MM');
  v_spend text; v_tier text; v_cap int; v_count int; v_id uuid; v_evidence jsonb;
  v_credit jsonb; v_entry_ids uuid[] := '{}';
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'owner_required' USING ERRCODE='42501';
  END IF;
  PERFORM public.assert_polaris_account_active(p_user_id);
  IF NOT COALESCE((SELECT enabled FROM public.polaris_generation_config),false) THEN
    RAISE EXCEPTION 'polaris_unavailable';
  END IF;
  IF p_key IS NULL OR length(p_key) NOT BETWEEN 8 AND 120 THEN RAISE EXCEPTION 'invalid_key'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('polaris:' || p_user_id::text));
  -- Serialize with the existing reasoning reserve path as well.
  PERFORM pg_advisory_xact_lock(hashtext('reasoning_run:' || p_user_id::text));
  -- Recovery refunds the ORIGINAL bucket. Late provider settlement is rejected
  -- by its status check, so it can neither save nor charge after recovery.
  FOR v_row IN SELECT * FROM public.polaris_generations WHERE user_id=p_user_id
    AND status IN ('reserved','running') AND created_at < now() - interval '15 minutes' FOR UPDATE
  LOOP
    IF v_row.spend IN ('base','credit') THEN
      PERFORM public.refund_polaris_spend(p_user_id,v_row.id);
    END IF;
    UPDATE public.polaris_generations SET status='failed' WHERE id=v_row.id;
  END LOOP;
  SELECT * INTO v_row FROM public.polaris_generations WHERE user_id=p_user_id AND request_key=p_key;
  IF FOUND THEN RETURN jsonb_build_object('generation_id',v_row.id,'status',v_row.status); END IF;
  IF EXISTS (SELECT 1 FROM public.polaris_generations WHERE user_id=p_user_id AND status IN ('reserved','running')) THEN
    RAISE EXCEPTION 'polaris_generation_active';
  END IF;
  -- Store content hashes, never a second permanent copy of interview text.
  -- Every selected record is included in the bounded server-built prompt.
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',r.id,'domain',r.audit_period,
      'body_hash',encode(sha256(convert_to(r.body,'UTF8')),'hex'))
      ORDER BY r.created_at DESC,r.id), '[]'::jsonb)
    INTO v_evidence FROM (SELECT id,audit_period,body,created_at,
      row_number() OVER (PARTITION BY audit_period ORDER BY created_at DESC,id) AS domain_rank
      FROM public.records WHERE user_id=p_user_id
      AND kind='audit_response' AND system_tags @> ARRAY['interview']::text[] AND length(trim(body))>0
      AND audit_period IN ('infancy','school','twenties','later','work','now')) r
    WHERE r.domain_rank <= 3;
  IF jsonb_array_length(v_evidence)=0 THEN RAISE EXCEPTION 'polaris_no_evidence'; END IF;
  IF (SELECT count(*) FROM public.polaris_generations WHERE user_id=p_user_id AND spend='intro'
      AND status IN ('reserved','running','completed')) < 2 THEN
    v_spend := 'intro';
  ELSE
    v_tier := public.effective_subscription_tier(p_user_id);
    v_cap := CASE COALESCE(v_tier,'free') WHEN 'brain' THEN NULL WHEN 'cortex' THEN 7 WHEN 'soma' THEN 7 ELSE 2 END;
    IF v_cap IS NULL THEN v_spend := 'none';
    ELSE
      INSERT INTO public.usage_counters AS uc(user_id,month_bucket,reasoning_used) VALUES(p_user_id,v_week,1)
      ON CONFLICT(user_id,month_bucket) DO UPDATE SET reasoning_used=uc.reasoning_used+1,updated_at=now()
        WHERE uc.reasoning_used<v_cap RETURNING reasoning_used INTO v_count;
      IF v_count IS NOT NULL THEN v_spend := 'base';
      ELSE
        BEGIN
          v_credit := public.spend_credits(p_user_id,1,'reasoning','polaris:'||p_key);
        EXCEPTION WHEN sqlstate 'X0001' OR sqlstate '23503' THEN
          RAISE EXCEPTION 'polaris_limit_exceeded';
        END;
        SELECT ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(v_credit->'entry_ids')) INTO v_entry_ids;
        INSERT INTO public.usage_counters AS uc(user_id,month_bucket,reasoning_used) VALUES(p_user_id,v_week,1)
        ON CONFLICT(user_id,month_bucket) DO UPDATE SET reasoning_used=uc.reasoning_used+1,updated_at=now();
        v_spend := 'credit';
      END IF;
    END IF;
  END IF;
  INSERT INTO public.polaris_generations(user_id,request_key,status,spend,week_bucket,month_bucket,evidence,credit_entry_ids)
    VALUES(p_user_id,p_key,'reserved',v_spend,v_week,v_month,v_evidence,v_entry_ids) RETURNING id INTO v_id;
  RETURN jsonb_build_object('generation_id',v_id,'status','reserved');
END $$;

CREATE OR REPLACE FUNCTION public.polaris_evidence_snapshot(p_user_id uuid,p_evidence jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_record record; v_result jsonb := '[]'; v_text text;
BEGIN
  IF jsonb_typeof(p_evidence) IS DISTINCT FROM 'array' OR jsonb_array_length(p_evidence) NOT BETWEEN 1 AND 18 THEN
    RAISE EXCEPTION 'polaris_evidence_changed';
  END IF;
  FOR v_record IN
    SELECT r.id,r.audit_period,r.body FROM jsonb_array_elements(p_evidence) WITH ORDINALITY e(item,position)
    JOIN public.records r ON r.id::text=e.item->>'id' AND r.user_id=p_user_id
      AND r.audit_period=e.item->>'domain' AND r.kind='audit_response'
      AND r.system_tags @> ARRAY['interview']::text[]
      AND encode(sha256(convert_to(r.body,'UTF8')),'hex')=e.item->>'body_hash'
    ORDER BY e.position FOR SHARE OF r
  LOOP
    v_text := trim(v_record.body);
    IF length(v_text)>290 THEN
      v_text := left(v_text,94)||' … '||substring(v_text FROM greatest(length(v_text)/2-47,1) FOR 94)||' … '||right(v_text,94);
    END IF;
    v_result := v_result||jsonb_build_array(jsonb_build_object('id',v_record.id,'domain',v_record.audit_period,'excerpt',v_text));
  END LOOP;
  IF jsonb_array_length(v_result)<>jsonb_array_length(p_evidence) THEN RAISE EXCEPTION 'polaris_evidence_changed'; END IF;
  RETURN v_result;
END $$;

-- 권한은 0195 그대로다. CREATE OR REPLACE 는 기존 권한을 지키지만, 같은 파일에서
-- 다시 적는다(check:definer-grants 규칙 B).
REVOKE ALL ON FUNCTION public.reserve_polaris_generation(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_polaris_generation(uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.polaris_evidence_snapshot(uuid,jsonb) FROM PUBLIC, anon, authenticated, service_role;

-- 사후 조건
DO $verify$
BEGIN
  IF NOT EXISTS (
       SELECT 1
         FROM pg_catalog.pg_attribute
        WHERE attrelid = 'public.records'::regclass
          AND attname = 'system_tags'
          AND atttypid = 'text[]'::regtype
          AND attnotnull
          AND NOT attisdropped
     ) THEN
    RAISE EXCEPTION '0218: records.system_tags is missing or not text[] NOT NULL';
  END IF;

  IF NOT EXISTS (
       SELECT 1
         FROM pg_catalog.pg_constraint
        WHERE conrelid = 'public.records'::regclass
          AND conname = 'records_system_tags_shape'
          AND contype = 'c'
          AND convalidated
     ) THEN
    RAISE EXCEPTION '0218: records_system_tags_shape check constraint is missing or not validated';
  END IF;

  IF has_function_privilege('anon', 'public.records_app_system_tags_split(text,text,text[],timestamptz)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.records_app_system_tags_split(text,text,text[],timestamptz)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.records_app_system_tags_split(text,text,text[],timestamptz)', 'EXECUTE') THEN
    RAISE EXCEPTION '0218: the split function must run for the roles that write records (authenticated, service_role) and not for anon';
  END IF;

  IF NOT EXISTS (
       SELECT 1
         FROM pg_catalog.pg_trigger t
        WHERE t.tgrelid = 'public.records'::regclass
          AND t.tgname = 'records_move_app_system_tags'
          AND t.tgenabled = 'O'
          AND t.tgfoid = 'public.records_move_app_system_tags()'::regprocedure
          -- ROW(1) | BEFORE(2) | INSERT(4) | UPDATE(16)
          AND (t.tgtype & 23) = 23
     ) THEN
    RAISE EXCEPTION '0218: records_move_app_system_tags trigger is missing or not BEFORE INSERT OR UPDATE FOR EACH ROW';
  END IF;

  IF has_function_privilege('anon', 'public.records_move_app_system_tags()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.records_move_app_system_tags()', 'EXECUTE') THEN
    RAISE EXCEPTION '0218: the trigger function must not be callable by clients';
  END IF;

  IF position('system_tags @> ARRAY[''interview'']::text[]' IN
       (SELECT prosrc FROM pg_catalog.pg_proc WHERE oid = 'public.reserve_polaris_generation(uuid,text)'::regprocedure)) = 0
     OR position('r.system_tags @> ARRAY[''interview'']::text[]' IN
       (SELECT prosrc FROM pg_catalog.pg_proc WHERE oid = 'public.polaris_evidence_snapshot(uuid,jsonb)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION '0218: Polaris evidence still reads interview from tags';
  END IF;

  IF has_function_privilege('anon', 'public.reserve_polaris_generation(uuid,text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.reserve_polaris_generation(uuid,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.polaris_evidence_snapshot(uuid,jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.polaris_evidence_snapshot(uuid,jsonb)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.polaris_evidence_snapshot(uuid,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION '0218: Polaris function grants drifted from 0195';
  END IF;
END
$verify$;
