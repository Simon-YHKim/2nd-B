-- 0253: 리즈닝이 끝날 때, 그사이 지워진 기록 · 가져온 자료의 제안은 저장하지 않는다 (Z66 의 남은 좁은 경우).
--
-- 근거: Simon 2026-10-13 15:37 KST 「Q-66·67·68, Gaius 여섯 건, Z66 가 전부 추천대로 진행」(원문은 여기까지다).
--   「Z66 가」가 "서버에서 닫기 · 화면은 건드리지 않음"이라는 것은 Relay 의 풀이이고, 그 구체안(이 파일)은
--   구현한 창이 정했다. 화면 쪽 #2365 는 독립 검토 다섯 번 BLOCK 으로 종료됐다.
-- 사실: 0251 은 기록을 지울 때 이미 저장된 제안 줄을 같이 지운다. 그러나 실행이 도는 사이(모델을 부르는
--   몇 초) 기록을 지우면, 그 뒤에 complete_reasoning_run 이 넣는 제안 줄은 대상 없이 남는다(0251 의 머리말이
--   "하지 않는 일"로 적어 둔 틈). complete_reasoning_run 은 payload 를 검사 없이 넣기 때문이다(0092).
--
-- 하는 일
--   complete_reasoning_run 이 저장 직전에 각 제안의 대상을 본다. refKind 가 record 면 records, source 면
--   sources 에서 **같은 소유자의** refId 가 없으면 그 제안은 넣지 않는다. 나머지는 지금과 같다
--   (호출자 확인 · 32개 상한 · 상태 검사 · 이미 proposed 면 그대로 개수 반환 · 서수는 받은 순서 그대로).
--   돌려주는 수는 실제로 넣은 줄 수다. 앱은 이 수를 읽지 않는다(src/lib/reasoning/runs.ts completeRun).
--   서수를 다시 매기지 않는 이유: 화면은 비준 · 적용할 때 자기가 가진 서수로 부른다
--   (ratify_reasoning_proposals 의 p_ratify · p_dismiss, mark_reasoning_proposal_applied 의 p_ordinal).
--   빠진 서수는 그 두 함수가 오류 없이 지나친다(0092).
--
-- 잠금 순서: 대상 줄(records → sources · id 순서 · FOR KEY SHARE) 다음에 실행 행(FOR UPDATE).
--   0251 의 삭제 트리거는 기록 줄(DELETE 가 잡음) 다음에 실행 행을 잡는다. 같은 순서라 엇갈리지 않는다.
--   - 삭제가 먼저 끝났으면 대상이 안 보여 그 제안을 넣지 않는다.
--   - 삭제가 진행 중이면 이 함수가 그 줄에서 기다렸다가, 끝난 뒤 대상이 없으므로 넣지 않는다.
--   - 이 함수가 먼저 줄을 잡았으면 삭제가 기다렸다가, 커밋된 제안 줄을 0251 의 트리거가 지운다.
--   FOR KEY SHARE 는 키가 아닌 칸의 수정(UPDATE)과는 부딪히지 않는다. 삭제, 그리고 키 값을 바꾸는 UPDATE 와
--   부딪힌다.
--
-- 한 번 정리(파일 끝의 DO 블록): 0251 을 적용한 때부터 이 파일을 적용하기까지의 틈에, 옛 complete_reasoning_run 이
--   실행 도중 지워진 대상의 제안 줄을 넣었을 수 있다. 0251 의 트리거는 삭제 때만 돌므로 그 줄은 다시 지워지지 않는다.
--   그래서 0251 의 정리와 같은 조건(같은 소유자 · 알아볼 수 있는 uuid · record 와 source)으로 한 번 지우고,
--   검토 대기 줄이 안 남은 실행을 ratified 로 닫는다. 다시 돌려도 같은 결과다(대상 없는 줄이 없으면 0줄).
--   정리 전에 reasoning_runs 를 EXCLUSIVE 로 잠근다: 옛 본문으로 이미 실행 행을 잡은 완료는 끝날 때까지
--   기다렸다가 그 줄까지 정리한다. 함수 교체가 먼저이므로 잠금 뒤에 시작하는 완료는 새 본문으로 돈다.
--   닫히지 않는 틈 하나: 옛 본문에 막 들어섰지만 아직 실행 행을 잡지 않은 완료는 잠금이 풀린 뒤 옛 본문으로
--   끝난다(함수에 들어선 때부터 첫 문장까지의 사이). 그 줄은 대상이 다시 지워질 일이 없으므로 남는다.
--   기록이 안 보이는 역할로 적용하면 정리는 거절한다(전부 "대상 없음"으로 읽어 다 지우게 되므로).
--
-- refId 를 읽는 법은 0251 과 같다: 8-4-4-4-12 모양(대소문자 · 중괄호)일 때만 uuid 로 바꿔 비교하고,
--   그 모양이 아니거나 refKind 가 record · source 가 아닌 제안은 판단하지 않고 지금처럼 넣는다.
--
-- 닫힌 쪽이 아니라 열린 쪽으로 실패한다: records 는 FORCE ROW LEVEL SECURITY 다(0178). 이 함수를 가진 역할에
--   행 보안이 걸려 있으면 기록이 하나도 안 보여 **모든 제안이 "대상 없음"으로 빠진다**(돈을 낸 실행의 결과가
--   통째로 사라진다). 그 경우에는 대상 검사를 하지 않고 0092 와 똑같이 전부 넣는다. 운영의 postgres 는
--   BYPASSRLS 라 검사가 돈다(2026-10-13 11:34 읽기).
--
-- 하지 않는 일
--   - 전부 빠져 한 줄도 안 들어가도 실행 상태는 지금처럼 proposed 로 둔다(빈 결과로 끝난 실행과 같다 ·
--     같은 호출을 다시 해도 같은 답이 나오게 하려는 것). 상태 전이를 새로 만들지 않는다.
--   - title 등 payload 의 내용은 건드리지 않는다.
--   - 0251 이 닫은(ratified) 실행에 완료를 다시 부르면 0092 그대로 reasoning_run_invalid_state 다.
--     앱은 끝난 실행에 완료를 다시 부르지 않는다(reserveRun 이 먼저 돌아온다 · src/app/reasoning.tsx).
--   - 삭제하는 쪽이 REPEATABLE READ 이상이면 닫히지 않는다: 그 삭제의 트리거(0251)는 자기 스냅샷보다
--     늦게 커밋된 제안 줄을 못 본다. 저장소에 격리 수준을 올리는 경로는 없다(db/migrations ·
--     supabase/functions · src 에서 0건 · 2026-10-13).
--   - 화면이 들고 있는 목록은 서버가 고치지 못한다. 실행 중에 지운 기록의 제안은 그 화면을 떠났다 돌아오면
--     보이지 않는다(서버에 줄이 없다).
-- 권한: 시그니처가 같아 0092 의 REVOKE/GRANT 가 그대로다(authenticated 만 EXECUTE). 다시 적어 둔다.
-- 되돌리기: rollback/0253_down.sql 이 0092 의 본문을 그대로 되돌린다. 한 번 정리로 지운 줄은 돌아오지 않는다.

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
  v_uuid_shape constant text :=
    '^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}|\{[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\})$';
  v_status text;
  v_count  int;
  v_judge  boolean;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'caller must match p_user_id' USING ERRCODE = '42501';
  END IF;
  IF p_proposals IS NULL OR jsonb_typeof(p_proposals) != 'array'
     OR jsonb_array_length(p_proposals) > 32 THEN
    RAISE EXCEPTION 'invalid proposals payload' USING ERRCODE = '22023';
  END IF;

  -- Judge targets only when this role really sees records and sources. If row security
  -- applied here every proposal would look erased and a paid run would lose its whole result.
  v_judge := NOT pg_catalog.row_security_active('public.records'::regclass)
         AND NOT pg_catalog.row_security_active('public.sources'::regclass);

  IF v_judge THEN
    -- Target rows first, then the run row: the same order as a record delete (0251's trigger).
    PERFORM 1
       FROM public.records AS x
      WHERE x.user_id = p_user_id
        AND x.id IN (
              SELECT CASE WHEN pl.payload->>'refId' ~ v_uuid_shape
                          THEN (pl.payload->>'refId')::uuid END
                FROM jsonb_array_elements(p_proposals) AS t(elem)
               CROSS JOIN LATERAL (SELECT COALESCE(t.elem->'payload', t.elem) AS payload) AS pl
               WHERE pl.payload->>'refKind' = 'record')
      ORDER BY x.id
        FOR KEY SHARE OF x;

    PERFORM 1
       FROM public.sources AS s
      WHERE s.user_id = p_user_id
        AND s.id IN (
              SELECT CASE WHEN pl.payload->>'refId' ~ v_uuid_shape
                          THEN (pl.payload->>'refId')::uuid END
                FROM jsonb_array_elements(p_proposals) AS t(elem)
               CROSS JOIN LATERAL (SELECT COALESCE(t.elem->'payload', t.elem) AS payload) AS pl
               WHERE pl.payload->>'refKind' = 'source')
      ORDER BY s.id
        FOR KEY SHARE OF s;
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
         pl.payload
    FROM jsonb_array_elements(p_proposals) WITH ORDINALITY AS t(elem, ord)
   CROSS JOIN LATERAL (SELECT COALESCE(t.elem->'payload', t.elem) AS payload) AS pl
   CROSS JOIN LATERAL (SELECT CASE WHEN pl.payload->>'refId' ~ v_uuid_shape
                                   THEN (pl.payload->>'refId')::uuid END AS ref) AS u
   WHERE NOT v_judge
      OR u.ref IS NULL
      OR pl.payload->>'refKind' IS NULL
      OR pl.payload->>'refKind' NOT IN ('record', 'source')
      OR (pl.payload->>'refKind' = 'record'
          AND EXISTS (SELECT 1 FROM public.records AS x
                       WHERE x.id = u.ref AND x.user_id = p_user_id))
      OR (pl.payload->>'refKind' = 'source'
          AND EXISTS (SELECT 1 FROM public.sources AS s
                       WHERE s.id = u.ref AND s.user_id = p_user_id));
  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.reasoning_runs SET status = 'proposed' WHERE id = p_run_id;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.complete_reasoning_run(uuid, uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.complete_reasoning_run(uuid, uuid, jsonb) FROM anon;
GRANT  EXECUTE ON FUNCTION public.complete_reasoning_run(uuid, uuid, jsonb) TO authenticated;

-- 한 번 정리. 다시 돌려도 같은 결과다(대상 없는 줄이 없으면 0줄).
DO $cleanup0253$
DECLARE
  v_uuid_shape constant text :=
    '^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}|\{[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\})$';
  v_runs   uuid[];
  v_gone   integer := 0;
  v_closed integer := 0;
BEGIN
  IF pg_catalog.row_security_active('public.records'::regclass)
     OR pg_catalog.row_security_active('public.sources'::regclass) THEN
    RAISE EXCEPTION '0253 cleanup refused: row security is active on records or sources for role %',
      current_user USING ERRCODE = '42501';
  END IF;

  -- A completion that already holds its run row finishes first; its rows are then judged below.
  LOCK TABLE public.reasoning_runs IN EXCLUSIVE MODE;

  SELECT pg_catalog.array_agg(locked.id)
    INTO v_runs
    FROM (
      SELECT r.id
        FROM public.reasoning_runs AS r
       WHERE EXISTS (
               SELECT 1
                 FROM public.reasoning_run_proposals AS p
                CROSS JOIN LATERAL (SELECT CASE WHEN p.payload->>'refId' ~ v_uuid_shape
                                                THEN (p.payload->>'refId')::uuid END AS ref) AS u
                WHERE p.run_id = r.id
                  AND u.ref IS NOT NULL
                  AND ((p.payload->>'refKind' = 'record'
                        AND NOT EXISTS (SELECT 1 FROM public.records AS x
                                         WHERE x.id = u.ref AND x.user_id = r.user_id))
                    OR (p.payload->>'refKind' = 'source'
                        AND NOT EXISTS (SELECT 1 FROM public.sources AS s
                                         WHERE s.id = u.ref AND s.user_id = r.user_id))))
       ORDER BY r.id
         FOR UPDATE OF r
    ) AS locked;

  IF v_runs IS NOT NULL THEN
    DELETE FROM public.reasoning_run_proposals AS p
     USING public.reasoning_runs AS r
     WHERE p.run_id = ANY (v_runs)
       AND r.id = p.run_id
       AND p.payload->>'refId' ~ v_uuid_shape
       AND ((p.payload->>'refKind' = 'record'
             AND NOT EXISTS (SELECT 1 FROM public.records AS x
                              WHERE x.id = CASE WHEN p.payload->>'refId' ~ v_uuid_shape
                                                THEN (p.payload->>'refId')::uuid END
                                AND x.user_id = r.user_id))
         OR (p.payload->>'refKind' = 'source'
             AND NOT EXISTS (SELECT 1 FROM public.sources AS s
                              WHERE s.id = CASE WHEN p.payload->>'refId' ~ v_uuid_shape
                                                THEN (p.payload->>'refId')::uuid END
                                AND s.user_id = r.user_id)));
    GET DIAGNOSTICS v_gone = ROW_COUNT;

    UPDATE public.reasoning_runs AS r
       SET status = 'ratified'
     WHERE r.id = ANY (v_runs)
       AND r.status = 'proposed'
       AND NOT EXISTS (SELECT 1
                         FROM public.reasoning_run_proposals AS q
                        WHERE q.run_id = r.id AND q.status = 'proposed');
    GET DIAGNOSTICS v_closed = ROW_COUNT;
  END IF;

  RAISE NOTICE '0253 cleanup: removed % proposal rows, closed % runs', v_gone, v_closed;
END
$cleanup0253$;
