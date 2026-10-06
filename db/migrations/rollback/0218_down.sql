-- rollback/0218_down.sql
--
-- NOT part of the numbered apply sequence. `db/migrations/*.sql` is a
-- non-recursive glob, so this file in a subdirectory is never picked up.
-- Run it BY HAND and only deliberately. No top-level BEGIN/COMMIT: run it inside
-- one transaction (psql --single-transaction, or the console's own).
--
-- 무엇을 되돌리나. 0218 이 records.system_tags 로 옮긴 앱 표식을 records.tags 로
-- 되돌리고(0218 이전 모양: 맨 앞 domain: 태그 다음에 표식, 그 뒤에 나머지), 북극성
-- 근거 두 함수를 0195 본문 그대로 되돌리고, 트리거 · 트리거 함수 · 칸을 지운다.
-- 표식 문자열은 하나도 버리지 않는다 — 칸을 지우기 전에 전부 tags 로 옮긴다.
--
-- ⚠ 순서. 새 앱(0218 을 아는 판)은 칸이 없으면 0218 이전 방식으로 스스로 돌아간다
--   (records/system-tags.ts 가 42703 · PGRST204 를 보고 다시 묻는다). 그래서 앱을
--   먼저 되돌릴 필요는 없다. 다만 되돌린 뒤에는 /discover · /research 에 first_light ·
--   interview 가 다시 주제로 보인다(0218 이전 동작).
-- ⚠ 옮겨진 행의 updated_at 은 이 파일이 다시 바꾼다(trg_records_updated_at).
-- ⚠ 왕복 확인(게이트 CDA-03). 0218 을 다시 적용하면 tags 의 모양 · TTFV 본문으로 표식을
--   다시 찾는다. 그런데 0218 뒤에는 본문을 고칠 수 있다(상세 화면 · updateRecord).
--   본문을 고친 TTFV 기록은 되돌린 뒤 다시 적용하면 표식이 사용자 태그로 남고(그
--   행만 0218 이전 모습), TTFV 가 자기 기록을 후보로 다시 고르게 된다. 거꾸로,
--   system_tags 가 빈 행에 사용자가 덧붙인 태그가 표식 모양이 되었으면 다시 적용할
--   때의 일괄 이행이 그 사용자 태그를 표식으로 가져간다. 그래서 다시 적용했을 때
--   지금의 (tags, system_tags) 로 돌아오지 않을 행이 하나라도 있으면 이 파일은
--   아무것도 바꾸기 전에 멈춘다. 그 결과를 알고 그래도 되돌려야 하면 같은
--   트랜잭션에서 먼저
--       SET LOCAL app.rollback_0218_accept_unrecoverable = 'on';
--   를 실행한다. 그때도 표식 문자열은 하나도 버리지 않는다(전부 tags 로 간다).

-- 0. 되돌린 tags 를 만드는 식은 확인과 실제 UPDATE 가 같은 것을 쓴다:
--    맨 앞이 domain: 태그면 그 바로 뒤에, 아니면 맨 앞에 표식을 넣는다.
CREATE OR REPLACE FUNCTION pg_temp.records_0218_tags_with_markers(p_tags text[], p_system_tags text[])
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $with_markers$
  SELECT ARRAY(
           SELECT u.t FROM unnest(p_tags) WITH ORDINALITY AS u(t, o)
            WHERE u.o = 1 AND COALESCE(lower(u.t) LIKE 'domain:%', false)
         )
         || p_system_tags
         || ARRAY(
           SELECT u.t FROM unnest(p_tags) WITH ORDINALITY AS u(t, o)
            WHERE NOT (u.o = 1 AND COALESCE(lower(u.t) LIKE 'domain:%', false))
            ORDER BY u.o
         )
$with_markers$;

DO $roundtrip_guard$
DECLARE
  v_unrecoverable integer;
BEGIN
  -- 우회 역할이 아니면 FORCE RLS 가 행을 숨겨 이 확인도 아래 UPDATE 도 빈다.
  IF NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_roles
        WHERE rolname = current_user AND (rolsuper OR rolbypassrls)
     ) THEN
    RAISE EXCEPTION '0218_down: run this rollback as a role that bypasses row-level security; current_user = %', current_user;
  END IF;

  -- 다시 적용하면 되돌린 tags 를 같은 판정 함수가 나눈다. 그 결과가 지금의
  -- (tags, system_tags) 와 같아야 한다. system_tags 가 빈 행도 본다: 사용자가 나중에
  -- 덧붙여 표식 모양이 된 태그는 트리거가 옮기지 않지만, 다시 적용할 때의 일괄 이행은
  -- 옮긴다.
  SELECT count(*) INTO v_unrecoverable
    FROM public.records AS r,
         LATERAL public.records_app_system_tags_split(
           r.kind::text, r.body,
           pg_temp.records_0218_tags_with_markers(r.tags, r.system_tags),
           r.created_at) AS s
   WHERE (cardinality(r.system_tags) > 0 OR r.tags && ARRAY['first_light', 'interview']::text[])
     AND (s.markers IS DISTINCT FROM r.system_tags OR s.kept IS DISTINCT FROM r.tags);

  IF v_unrecoverable > 0
     AND COALESCE(current_setting('app.rollback_0218_accept_unrecoverable', true), '') <> 'on' THEN
    RAISE EXCEPTION '0218_down: % rows would not come back to the same tags and system_tags if 0218 were re-applied (for example a TTFV note whose body was edited, or user tags that now look like a marker set); nothing was changed', v_unrecoverable
      USING HINT = 'SET LOCAL app.rollback_0218_accept_unrecoverable = ''on'' in the same transaction to roll back anyway; every marker still goes back into tags.';
  END IF;
  IF v_unrecoverable > 0 THEN
    RAISE NOTICE '0218_down: % rows will not come back the same after a re-apply (accepted)', v_unrecoverable;
  END IF;
END
$roundtrip_guard$;

-- 1. 트리거부터 걷는다. 그래야 아래 UPDATE 가 표식을 다시 옮기지 않는다.
DROP TRIGGER IF EXISTS records_move_app_system_tags ON public.records;

-- 2. 표식을 tags 로(위 0 의 식).
UPDATE public.records AS r
   SET tags = pg_temp.records_0218_tags_with_markers(r.tags, r.system_tags)
 WHERE cardinality(r.system_tags) > 0;

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

-- 4. 트리거 함수 · 판정 함수 · 칸(모양 제약은 칸과 함께 지워진다).
DROP FUNCTION IF EXISTS public.records_move_app_system_tags();
DROP FUNCTION IF EXISTS public.records_app_system_tags_split(text, text, text[], timestamptz);
DROP FUNCTION IF EXISTS pg_temp.records_0218_tags_with_markers(text[], text[]);
ALTER TABLE public.records DROP COLUMN IF EXISTS system_tags;

DO $verify_down$
BEGIN
  IF EXISTS (
       SELECT 1 FROM pg_catalog.pg_attribute
        WHERE attrelid = 'public.records'::regclass AND attname = 'system_tags' AND NOT attisdropped
     )
     OR to_regprocedure('public.records_move_app_system_tags()') IS NOT NULL
     OR to_regprocedure('public.records_app_system_tags_split(text,text,text[],timestamptz)') IS NOT NULL THEN
    RAISE EXCEPTION '0218_down: system_tags column, its trigger function or its split function is still there';
  END IF;
  IF position('system_tags' IN
       (SELECT prosrc FROM pg_catalog.pg_proc WHERE oid = 'public.reserve_polaris_generation(uuid,text)'::regprocedure)) > 0
     OR position('system_tags' IN
       (SELECT prosrc FROM pg_catalog.pg_proc WHERE oid = 'public.polaris_evidence_snapshot(uuid,jsonb)'::regprocedure)) > 0 THEN
    RAISE EXCEPTION '0218_down: Polaris evidence still reads system_tags';
  END IF;
END
$verify_down$;
