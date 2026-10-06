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
-- 옮기고, 아니면 사용자 태그로 둔다(보수적). 판정은 트리거 함수
-- records_move_app_system_tags() 한 곳에만 있고, 아래 일괄 이행도 같은 함수를 탄다.
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
--   ① records.system_tags text[] NOT NULL DEFAULT '{}' 칸.
--   ② BEFORE INSERT OR UPDATE OF tags 트리거: 위 규칙. 옛 앱(설치된 APK · 캐시된 웹
--      번들)이 아직 표식을 tags 에 쓰면 저장 순간 옮긴다. 새 앱은 system_tags 에 바로
--      쓰므로 tags 에 맞는 모양이 없어 아무것도 안 바뀐다.
--   ③ 기존 행 이행: 후보 행에 UPDATE ... SET tags = tags 를 해서 같은 트리거를 태운다.
--      옮겨진 행은 trg_records_updated_at 이 updated_at 을 지금으로 바꾼다(클라이언트에
--      records.updated_at 을 읽는 곳은 없다).
--   ④ 북극성 근거를 고르는 두 함수(0195 reserve_polaris_generation ·
--      polaris_evidence_snapshot)가 tags 가 아니라 system_tags 에서 interview 를 찾게
--      다시 정의한다. 본문은 0195 와 한 글자도 다르지 않고 그 조건 하나만 다르다
--      (src/lib/records/__tests__/system-tags-migration.test.ts 가 대조한다). 권한은
--      0195 그대로다.
--
-- ── 순서 (DECISIONS 26.10.05 19:53 ④ · #1869 와 같은 함정) ─────────────────
--   운영 적용 GO → 이 파일 적용 → PR 머지 → 웹 게시 · APK. 적용과 게시 사이에는 옛
--   앱이 tags 에서 표식을 찾는다: TTFV 가 자기 기록을 후보로 고를 수 있고, 커리어 ·
--   대시보드 · 북극성 카드 화면이 인터뷰를 못 알아본다(북극성 생성은 운영에서 꺼져
--   있다 — polaris_generation_config.enabled=false, 10-06 실측). 게시를 적용 바로
--   뒤에 붙인다. 새 앱은 칸이 없는 데이터베이스에서도 깨지지 않는다(42703 ·
--   PGRST204 를 보면 한 번 0218 이전 모양으로 다시 묻는다, records/system-tags.ts).
--
-- 되돌리기: db/migrations/rollback/0218_down.sql (표식을 tags 로 되돌리고 칸을 지운다).
-- 계정 삭제 · 내용 삭제: 칸은 records 행의 일부라 행과 함께 지워진다. records 는
-- 이미 erasure registry 의 client_erasable 이고(0189), 새 표가 없어 등록할 것이 없다.

-- 최상위 BEGIN/COMMIT 을 두지 않는다. Supabase CLI 가 이 파일을 자기 트랜잭션으로
-- 감싼다(supabase-dry-run.yml 이 0147 이상에 대해 막는다).

SET LOCAL lock_timeout = '10s';

-- ① 칸
ALTER TABLE public.records
  ADD COLUMN IF NOT EXISTS system_tags text[] NOT NULL DEFAULT ARRAY[]::text[];

COMMENT ON COLUMN public.records.system_tags IS
  'Markers the app attaches to say how the record was produced (0218: TTFV first_light pair, recall interview set). Never user tags; records.tags keeps the user''s tags and the reserved domain: classification.';

-- ② 판정 · 트리거
CREATE OR REPLACE FUNCTION public.records_move_app_system_tags()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $move$
DECLARE
  v_core text[] := ARRAY[]::text[];
  v_at integer[] := ARRAY[]::integer[];
  v_kept text[] := ARRAY[]::text[];
  v_drop integer[];
  v_start integer := 1;
  v_take integer := 0;
  v_marker text;
  v_i integer;
BEGIN
  NEW.system_tags := COALESCE(NEW.system_tags, ARRAY[]::text[]);
  IF NEW.tags IS NULL OR cardinality(NEW.tags) = 0 THEN
    RETURN NEW;
  END IF;

  -- 1. domain:* 를 뺀 태그와 그 자리.
  FOR v_i IN array_lower(NEW.tags, 1) .. array_upper(NEW.tags, 1) LOOP
    IF NEW.tags[v_i] IS NOT NULL AND lower(NEW.tags[v_i]) NOT LIKE 'domain:%' THEN
      v_core := v_core || NEW.tags[v_i];
      v_at := v_at || v_i;
    END IF;
  END LOOP;
  IF v_core[1] = 'reasoning:ratified' THEN
    v_start := 2;
  END IF;

  -- 2. TTFV. 범위 밖 첨자는 NULL 이라 조건이 거짓이 된다.
  IF NEW.kind::text = 'note'
     AND v_core[v_start] = 'first_light'
     AND v_core[v_start + 1] IN ('first_light:affirm', 'first_light:soft')
     AND (
       NEW.body IN (
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
       OR NEW.body ~ '^(First light|첫 통찰|Primera luz|Primeira luz|Cahaya pertama): ".*" (—|-) (that''s right|feels a little different|맞아요|조금 다르게 느껴요|es cierto|se siente un poco diferente|faz sentido|parece um pouco diferente|itu benar|terasa sedikit berbeda)$'
     ) THEN
    v_take := 2;
  -- 3. 회상 인터뷰.
  ELSIF NEW.kind::text = 'audit_response' AND v_core[v_start] = 'interview' THEN
    IF v_core[v_start + 1] = 'recall' AND v_core[v_start + 2] = 'screener' THEN
      v_take := CASE WHEN v_core[v_start + 3] IN ('entry-ui:ko', 'entry-ui:en') THEN 4 ELSE 3 END;
    ELSIF v_core[v_start + 1] = 'life_audit' AND v_core[v_start + 2] ~ '^period-[a-z]+$' THEN
      v_take := CASE WHEN v_core[v_start + 3] ~ '^layers-[0-9]+$' THEN 4 ELSE 3 END;
    END IF;
  END IF;

  IF v_take = 0 THEN
    RETURN NEW;
  END IF;

  -- 4. 그 자리의 표식만 빼고, system_tags 에 중복 없이 붙인다.
  v_drop := v_at[v_start : v_start + v_take - 1];
  FOR v_i IN array_lower(NEW.tags, 1) .. array_upper(NEW.tags, 1) LOOP
    IF NOT (v_i = ANY (v_drop)) THEN
      v_kept := v_kept || NEW.tags[v_i];
    END IF;
  END LOOP;
  FOREACH v_marker IN ARRAY v_core[v_start : v_start + v_take - 1] LOOP
    IF NOT (v_marker = ANY (NEW.system_tags)) THEN
      NEW.system_tags := NEW.system_tags || v_marker;
    END IF;
  END LOOP;
  NEW.tags := v_kept;
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

-- ③ 기존 행 이행. 후보는 표식 단어가 있는 행뿐이고, 옮길지는 트리거가 정한다.
DO $backfill$
DECLARE
  v_touched integer;
  v_moved integer;
BEGIN
  UPDATE public.records
     SET tags = tags
   WHERE tags && ARRAY['first_light', 'interview']::text[];
  GET DIAGNOSTICS v_touched = ROW_COUNT;
  SELECT count(*) INTO v_moved FROM public.records WHERE cardinality(system_tags) > 0;
  RAISE NOTICE '0218 backfill: % candidate rows, % rows now carry system_tags', v_touched, v_moved;
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
