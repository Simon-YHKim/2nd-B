-- 0218_records_system_tags.sql
--
-- 앱 표식 칸 records.system_tags (Simon 결정 Q-261004-39 = A, 2026-10-05 19:53 · QA D-07).
-- 설계: docs/design/system-tags-261006.md 의 A안 "스키마만 + QA 손 이행" (Simon 채택
-- 2026-10-06 22:33, DECISIONS). 첫 구현 #2094 를 대체한다.
--
-- 왜. 앱은 자기 표식을 사용자 태그와 같은 칸(records.tags)에 써 왔다. TTFV 는
-- first_light · first_light:affirm|soft, 회상 인터뷰는 interview · recall · screener ·
-- entry-ui:<ko|en>. 그래서 /discover · /research 가 first_light · interview 를 사용자의
-- 주제로 보여 줬다. 같은 칸의 같은 문자열은 누가 썼는지 말해 주지 않고, 사용자도 같은
-- 단어를 태그로 달 수 있다. 그래서 표식은 자기 칸에 두고, "앱이 쓴 표식인가" 를 묻는
-- 곳(회상 인터뷰 · 북극성 근거 · TTFV 후보 · 커리어 출처 · 별 밝기)은 그 칸을 읽는다.
--
-- 원칙 (설계 2절). 출처는 쓰는 순간에만 확실하다.
--   P1 새 기록은 작성자(인터뷰 · TTFV)가 처음부터 system_tags 에 쓴다(앱 쪽).
--   P2 서버는 저장 · 수정 때 tags 를 바꾸지 않는다. 트리거가 없다.
--   P3 옛 행은 자동으로 옮기지 않는다. 계정 주인이 확인한 QA · 제작자 계정 행만, 운영
--      적용 단계에서 행 번호로 한 번 옮긴다(db/ops/0218_system_tags_hand_move.sql).
--      확인하지 못한 행은 그대로 둔다. #2094 는 tags 의 모양으로 출처를 추측했고 게이트
--      2회차에도 새 지적 11건(high 2)이 나왔다(설계 3절. 원인이 그 추측이라는 판단은 추론).
--   P4 사용자 태그 칸은 줄이지 않는다.
--
-- 이 파일이 하는 일 (설계 7절).
--   ① records.system_tags text[] NOT NULL DEFAULT '{}' 칸 + 설명.
--   ② 모양 제약 records_system_tags_shape: 1차원 · 첨자 1부터 · NULL 원소 없음 ·
--      16개 이하 · 원소마다 [A-Za-z0-9_.:-] 1~64자 · domain: 없음. 소유자가 이 칸을
--      직접 쓸 수 있으므로(records_owner_all) 정규화를 앱에만 맡기지 않는다(게이트 CD-02).
--      domain: 은 사용자 자신의 분류라 tags 에 남는다(설계 4절).
--   ⑤ 북극성 근거를 고르는 두 함수(0195 reserve_polaris_generation ·
--      polaris_evidence_snapshot)가 interview 를 tags 가 아니라 system_tags 에서 찾는다.
--      본문은 0195 와 그 조건 하나만 다르다(src/lib/records/__tests__/
--      system-tags-migration.test.ts 가 글자 단위로 대조한다). 권한은 0195 그대로다.
--   ⑥ 사후 조건: 칸 · 제약이 있고, records 에 표식을 옮기는 트리거가 없고, 두 함수가
--      system_tags 를 읽는다.
-- 이 파일이 하지 않는 일: 데이터를 바꾸지 않는다(칸의 기본값 '{}' 말고는). 판정 함수 ·
-- 트리거 · 일괄 이행이 없다(#2094 의 ③ · ④ 를 뺐다).
--
-- 운영 적용 순서 (설계 6.2, 모두 GO 대상).
--   1. 구현 PR 은 게이트를 통과할 때까지 머지하지 않는다.
--   2. 적용 직전 읽기 집계(db/ops/0218_system_tags_survey.sql): 후보 행 · 계정별 행 수 ·
--      QA · 제작자 계정인지. Simon 에게 보이고 손 이행 목록을 정한다. 실사용자 행은 목록에
--      넣지 않고 그대로 둔다.
--   3. 이 파일을 적용한다.
--   4. 손 이행(db/ops/0218_system_tags_hand_move.sql, 같은 GO, 별도 트랜잭션).
--   5. PR 머지 → 웹 게시 → android-release APK → QA 설치본 교체.
--   6. 사후 집계(2 의 집계를 다시): 3 뒤에 옛 판이 tags 에 표식을 넣어 쓴 행을 찾아 주인
--      확인 뒤 4 를 한 번 더 하거나 그대로 둔다.
--   3~5 사이에는 옛 웹 · 옛 APK 가 tags 만 읽어, 4 에서 옮긴 QA 행이 옛 판에서는 인터뷰로
--   보이지 않는다. 영향은 QA 계정뿐이고 북극성 생성은 운영에서 꺼져 있다
--   (polaris_generation_config.enabled = false, 2026-10-06 실측 · 인용).
--
-- 옛 APK (설계 5절). 스토어에 나간 적이 없고 실사용자 인터뷰 기록이 0 이라 옛 판을 위한
-- 호환 읽기를 만들지 않는다. 표식을 tags 에 다시 겹쳐 두는 것이 곧 이 마이그레이션이 없애려는
-- 결함이기 때문이다. 적용 완료 조건 = 웹 게시 + QA APK 교체.
-- 새 앱은 칸이 없는 데이터베이스에서도 깨지지 않는다(42703 · PGRST204 를 보면 칸 없이 한 번
-- 더 묻고, 표식을 0218 이전처럼 tags 에 쓴다. src/lib/records/system-tags.ts).
--
-- 되돌리기: db/migrations/rollback/0218_down.sql (단독 실행 전용. 표식을 tags 로 돌리고
-- 0195 본문을 되살리고 칸을 지운다).
-- 계정 삭제 · 내용 삭제 · 내보내기: 칸은 records 행의 일부라 행과 함께 지워지고(0189
-- client_erasable), 계정 내보내기는 select('*') 라 새 칸이 그대로 실린다. 새 표가 없어
-- erasure registry 에 더할 것이 없다.
--
-- 최상위 BEGIN/COMMIT 을 두지 않는다. Supabase CLI 가 이 파일을 자기 트랜잭션으로 감싼다
-- (supabase-dry-run.yml 이 0147 이상에 대해 막는다).

SET LOCAL lock_timeout = '10s';

-- ① 칸 · ② 모양 제약
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

-- ⑤ 북극성 근거: interview 를 system_tags 에서 찾는다 (0195 본문 + 조건 하나).
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

-- ⑥ 사후 조건
DO $verify$
BEGIN
  IF NOT EXISTS (
       SELECT 1
         FROM pg_catalog.pg_attribute
        WHERE attrelid = 'public.records'::regclass
          AND attname = 'system_tags'
          AND atttypid = 'text[]'::regtype
          AND attnotnull
          AND atthasdef
          AND NOT attisdropped
     ) THEN
    RAISE EXCEPTION '0218: records.system_tags is missing or not text[] NOT NULL with a default';
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

  -- P2: nothing on records rewrites tags or system_tags by shape. A user trigger whose
  -- function reads system_tags, or the split objects of the first draft (#2094), is a
  -- regression of this design.
  IF EXISTS (
       SELECT 1
         FROM pg_catalog.pg_trigger AS t
         JOIN pg_catalog.pg_proc AS p ON p.oid = t.tgfoid
        WHERE t.tgrelid = 'public.records'::regclass
          AND NOT t.tgisinternal
          AND position('system_tags' IN p.prosrc) > 0
     )
     OR to_regprocedure('public.records_move_app_system_tags()') IS NOT NULL
     OR to_regprocedure('public.records_app_system_tags_split(text,text,text[],timestamptz)') IS NOT NULL THEN
    RAISE EXCEPTION '0218: a trigger or split function moves markers between tags and system_tags';
  END IF;

  IF position('AND system_tags @> ARRAY[''interview'']::text[]' IN
       (SELECT prosrc FROM pg_catalog.pg_proc WHERE oid = 'public.reserve_polaris_generation(uuid,text)'::regprocedure)) = 0
     OR position('AND r.system_tags @> ARRAY[''interview'']::text[]' IN
       (SELECT prosrc FROM pg_catalog.pg_proc WHERE oid = 'public.polaris_evidence_snapshot(uuid,jsonb)'::regprocedure)) = 0
     OR position('AND tags @> ARRAY[''interview'']::text[]' IN
       (SELECT prosrc FROM pg_catalog.pg_proc WHERE oid = 'public.reserve_polaris_generation(uuid,text)'::regprocedure)) > 0
     OR position('AND r.tags @> ARRAY[''interview'']::text[]' IN
       (SELECT prosrc FROM pg_catalog.pg_proc WHERE oid = 'public.polaris_evidence_snapshot(uuid,jsonb)'::regprocedure)) > 0 THEN
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
