-- 0253 되돌리기: complete_reasoning_run 을 0092 의 본문 그대로 되돌린다(대상 검사 없이 받은 제안을 전부 넣는다).
-- 아래 함수 본문은 db/migrations/0092_reasoning_runs.sql 에서 글자 그대로 옮긴 것이다. 데이터는 바꾸지 않는다.
CREATE OR REPLACE FUNCTION public.complete_reasoning_run(
  p_user_id   uuid,
  p_run_id    uuid,
  p_proposals jsonb
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status text;
  v_count  int;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'caller must match p_user_id' USING ERRCODE = '42501';
  END IF;
  IF p_proposals IS NULL OR jsonb_typeof(p_proposals) != 'array'
     OR jsonb_array_length(p_proposals) > 32 THEN
    RAISE EXCEPTION 'invalid proposals payload' USING ERRCODE = '22023';
  END IF;

  SELECT status INTO v_status FROM public.reasoning_runs
   WHERE id = p_run_id AND user_id = p_user_id
   FOR UPDATE;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'reasoning_run_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF v_status = 'proposed' THEN
    SELECT count(*)::int INTO v_count FROM public.reasoning_run_proposals WHERE run_id = p_run_id;
    RETURN v_count;
  END IF;
  IF v_status NOT IN ('reserved', 'running') THEN
    RAISE EXCEPTION 'reasoning_run_invalid_state' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.reasoning_run_proposals (run_id, ordinal, kind, payload)
  SELECT p_run_id,
         (t.ord - 1)::int,
         COALESCE(t.elem->>'kind', 'domain_link'),
         COALESCE(t.elem->'payload', t.elem)
    FROM jsonb_array_elements(p_proposals) WITH ORDINALITY AS t(elem, ord);
  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.reasoning_runs SET status = 'proposed' WHERE id = p_run_id;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.complete_reasoning_run(uuid, uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.complete_reasoning_run(uuid, uuid, jsonb) FROM anon;
GRANT  EXECUTE ON FUNCTION public.complete_reasoning_run(uuid, uuid, jsonb) TO authenticated;
