-- rollback/0218_down.sql — 0218(records.system_tags)을 되돌린다. 손으로, 사고 중에만 돌린다.
--
-- 번호 순서 적용에 들어가지 않는다(db/migrations/*.sql 은 하위 폴더를 읽지 않는다).
-- ⚠ 단독 실행 전용. 파일 안에 BEGIN/COMMIT 이 없고, 첫 문장이 표 잠금이라 트랜잭션 밖에서
--   돌리면 그 자리에서 멈춘다. 이렇게만 돌린다:
--       psql -X -v ON_ERROR_STOP=1 --single-transaction -f db/migrations/rollback/0218_down.sql
--   원장 행(supabase_migrations)은 지우지 않는다. 되돌린 사실은 HANDOFF 와 사건 기록에 남긴다.
--
-- 무엇을 하나 (설계 docs/design/system-tags-261006.md 7절 "되돌리기", 원칙 P5).
--   0. public.records 를 SHARE ROW EXCLUSIVE 로 잠근다. 아래가 끝날 때까지 다른 쓰기가
--      끼어들지 못한다(게이트 CDA2-02: 검사와 변경 사이의 동시 쓰기).
--   1. 실행 역할이 행 보안을 우회하는지 본다. records 는 FORCE ROW LEVEL SECURITY(0178)라
--      우회하지 못하는 역할로는 아래 UPDATE 가 0행을 보고 "성공" 하고, 칸을 지우는 순간 표식이
--      사라진다(게이트 CD-05). 그래서 멈춘다.
--   2. 표식을 tags 로 옮긴다: 맨 앞이 domain: 태그면 그 바로 뒤, 아니면 맨 앞(0218 이전
--      작성자들이 쓰던 자리). 사용자 태그에 같은 문자열이 있어도 지우지 않고 겹친 채 둔다(P4).
--      옮긴 행 수가 표식이 있던 행 수와 같아야 다음으로 간다.
--   3. 북극성 근거 두 함수를 0195 본문 그대로(글자 단위 대조는
--      src/lib/records/__tests__/system-tags-migration.test.ts).
--   4. 모양 제약과 칸을 지운다.
--   5. 사후 조건.
--
-- 하지 않는 것: "다시 적용하면 같은 값으로 돌아오는가" 왕복 판정(#2094 의 확인 단계)은 없다.
-- 0218 은 데이터를 바꾸지 않으므로 다시 적용해도 tags 로 간 표식은 tags 에 남는다. 다시
-- 나누려면 운영 절차 2 · 4 단계(db/ops/0218_system_tags_survey.sql ·
-- db/ops/0218_system_tags_hand_move.sql)를 다시 한다.
-- ⚠ 옮겨진 행의 updated_at 은 trg_records_updated_at 이 지금으로 바꾼다.
-- ⚠ 되돌린 뒤에는 /discover · /research 에 first_light · interview 가 다시 주제로 보인다
--   (0218 이전 동작). 새 앱은 칸이 없으면 칸 없이 다시 물어 0218 이전처럼 동작하므로
--   앱을 먼저 되돌릴 필요는 없다.

-- 0. 첫 문장. 트랜잭션 밖이면 PostgreSQL 이 여기서 거절한다.
LOCK TABLE public.records IN SHARE ROW EXCLUSIVE MODE;

-- 1 · 2.
DO $down_move$
DECLARE
  v_marked integer;
  v_moved integer;
BEGIN
  IF NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_roles
        WHERE rolname = current_user AND (rolsuper OR rolbypassrls)
     ) THEN
    RAISE EXCEPTION '0218_down: run this rollback as a role that bypasses row-level security (public.records is FORCE ROW LEVEL SECURITY); current_user = %', current_user;
  END IF;
  -- 걸러질 행이 있으면 조용히 비지 않고 오류가 난다.
  PERFORM set_config('row_security', 'off', true);

  SELECT count(*) INTO v_marked FROM public.records WHERE cardinality(system_tags) > 0;

  UPDATE public.records AS r
     SET tags = CASE
                  WHEN COALESCE(lower(r.tags[array_lower(r.tags, 1)]) LIKE 'domain:%', false)
                    THEN r.tags[array_lower(r.tags, 1) : array_lower(r.tags, 1)]
                         || r.system_tags
                         || r.tags[array_lower(r.tags, 1) + 1 : array_upper(r.tags, 1)]
                  ELSE r.system_tags || r.tags
                END
   WHERE cardinality(r.system_tags) > 0;
  GET DIAGNOSTICS v_moved = ROW_COUNT;

  IF v_moved <> v_marked THEN
    RAISE EXCEPTION '0218_down: % rows carried markers but % were moved back into tags; nothing is kept', v_marked, v_moved;
  END IF;
  RAISE NOTICE '0218_down: moved the markers of % rows back into tags', v_moved;
END
$down_move$;

-- 3. 북극성 근거 두 함수를 0195 본문 그대로.
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
      AND kind='audit_response' AND tags @> ARRAY['interview']::text[] AND length(trim(body))>0
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
      AND r.tags @> ARRAY['interview']::text[]
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

REVOKE ALL ON FUNCTION public.reserve_polaris_generation(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_polaris_generation(uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.polaris_evidence_snapshot(uuid,jsonb) FROM PUBLIC, anon, authenticated, service_role;

-- 4. 모양 제약 · 칸.
ALTER TABLE public.records DROP CONSTRAINT IF EXISTS records_system_tags_shape;
ALTER TABLE public.records DROP COLUMN IF EXISTS system_tags;

-- 5. 사후 조건.
DO $verify_down$
BEGIN
  IF EXISTS (
       SELECT 1 FROM pg_catalog.pg_attribute
        WHERE attrelid = 'public.records'::regclass AND attname = 'system_tags' AND NOT attisdropped
     ) THEN
    RAISE EXCEPTION '0218_down: records.system_tags is still there';
  END IF;
  IF position('system_tags' IN
       (SELECT prosrc FROM pg_catalog.pg_proc WHERE oid = 'public.reserve_polaris_generation(uuid,text)'::regprocedure)) > 0
     OR position('system_tags' IN
       (SELECT prosrc FROM pg_catalog.pg_proc WHERE oid = 'public.polaris_evidence_snapshot(uuid,jsonb)'::regprocedure)) > 0 THEN
    RAISE EXCEPTION '0218_down: Polaris evidence still reads system_tags';
  END IF;
END
$verify_down$;
