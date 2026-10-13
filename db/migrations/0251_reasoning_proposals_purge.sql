-- 0251: 지운 기록 · 가져온 자료를 가리키는 리즈닝 제안 줄을 같이 지운다 (Z66).
--
-- 근거: Device Lab 병렬 4회차(2026-10-13) Z66 · Simon 답 Q-261013-35
--   (2026-10-13 10:36 KST 「Q-34·Q-35 둘 다 추천대로 진행해」 · DECISIONS 26.10.13 07:20 · 07:22).
-- 사실: reasoning_run_proposals.payload 는 refKind('record' | 'source') · refId · title(본문 앞쪽 글)을
--   담는데 records · sources 로 가는 FK 가 없다(0092). 기록을 지워도 제안 줄과 그 제목이 남았다.
--   운영 읽기 2026-10-13 10:51 KST: 전체 15줄 중 대상 없는 줄 4(record · proposed · 전부 QA 계정).
--
-- 하는 일
--   1. records · sources 에 AFTER DELETE 문장 단위 트리거. 지운 행의 소유자가 가진 실행에 속하고
--      refKind · refId 가 맞는 제안 줄을 상태와 무관하게 지운다.
--   2. 그 실행에 proposed 줄이 남지 않으면 실행을 ratified 로 닫는다. ratify_reasoning_proposals(0092)가
--      닫는 규칙과 같다. 환불 계량(0117 · 0136)은 cancelled · failed · recovered 만 빼므로
--      proposed 에서 ratified 로 가는 것은 세는 수를 바꾸지 않는다. reasoning_runs 행은 지우지 않는다.
--   3. 한 번 정리: 이미 남은 줄 중 "종류별로 맞는 표에 같은 소유자의 대상이 없는 줄"만 지우고,
--      그 때문에 proposed 줄이 없어진 실행만 닫는다. 줄 수가 아니라 조건으로 잡는다.
--   4. 한 번 정리: 남은 줄의 payload 에서 title 을 뺀다. 본문 조각은 title 에만 있다
--      (meta = 종류 이름 + 상대 시각 · key = record:<id>). 화면은 title 이 없으면 key 로 그린다.
--
-- refId 를 읽는 법: payload 는 클라이언트가 쓰고 서버는 검사 없이 넣는다(complete_reasoning_run).
--   그래서 refId 는 아무 글일 수 있다. 여기서는 8-4-4-4-12 모양의 16진수(대소문자 무관 · 중괄호로
--   감싼 것 포함)일 때만 uuid 로 바꿔 uuid 끼리 비교한다. 그 모양이 아닌 줄은 판단하지 않는다:
--   트리거도 한 번 정리도 그 줄을 건드리지 않고, 그 글 때문에 삭제나 적용이 실패하지도 않는다.
--   글자로 비교하지 않는 이유: 대문자로 적힌 같은 id 를 "대상 없음"으로 읽으면 살아 있는 줄을 지운다.
--   refId 에 인덱스를 두지 않는 이유: 길이 제한이 없는 글이라 긴 값 하나가 인덱스 생성과 그 뒤의
--   제안 저장을 실패하게 만든다. 조회는 소유자의 실행에서 그 실행의 줄로 내려가므로 없어도 된다.
--
-- 하지 않는 일
--   - complete_reasoning_run 은 그대로다. 실행이 도는 사이 기록을 지우면 그 뒤에 들어온 제안 줄은
--     대상 없이 남을 수 있다. 그 좁은 틈은 이 파일이 닫지 않는다(화면 쪽 #2365 가 다루는 중이다).
--   - refKind 가 record · source 가 아니거나 refId 가 위 모양이 아닌 줄은 건드리지 않는다.
--   - 삭제 등록부(db/erasure-registry.json)에는 넣지 않는다. 그 등록부는 소유자 열이 있는 표만
--     받고 이 표에는 소유자 열이 없다(run_id 로만 이어진다).
--
-- 잠금 순서: 실행 행 다음에 제안 줄. ratify_reasoning_proposals · complete_reasoning_run 과 같다.
--   트리거도 한 번 정리도 이 순서를 지킨다.
-- 권한: 0092 가 authenticated · anon 의 INSERT/UPDATE/DELETE 를 회수했으므로 SECURITY DEFINER 로 돈다.
--   트리거 함수는 records · sources 를 읽지 않는다(지운 행은 전이 표 gone 으로 받는다).
-- 되돌리기: rollback/0251_down.sql 은 트리거와 함수만 걷는다. 지운 줄과 title 은 돌아오지 않는다.

CREATE OR REPLACE FUNCTION public.purge_reasoning_proposals_of_erased()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_kind text := TG_ARGV[0];
  v_uuid_shape constant text :=
    '^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}|\{[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\})$';
  v_runs uuid[];
BEGIN
  IF v_kind IS NULL OR v_kind NOT IN ('record', 'source') THEN
    RAISE EXCEPTION 'purge_reasoning_proposals_of_erased: unknown kind %', v_kind
      USING ERRCODE = '22023';
  END IF;

  -- 실행 행을 먼저, id 순서로 잠근다. ratify_reasoning_proposals 가 실행 행을 잡은 뒤 제안 줄을
  -- 고치므로 같은 순서로 잡으면 서로 엇갈리지 않는다.
  SELECT pg_catalog.array_agg(locked.id)
    INTO v_runs
    FROM (
      SELECT r.id
        FROM public.reasoning_runs AS r
       WHERE r.user_id IN (SELECT DISTINCT g.user_id FROM gone AS g)
         AND EXISTS (
               SELECT 1
                 FROM public.reasoning_run_proposals AS p
                 JOIN gone AS g
                   ON g.id = CASE WHEN p.payload->>'refId' ~ v_uuid_shape
                                  THEN (p.payload->>'refId')::uuid END
                WHERE p.run_id = r.id
                  AND p.payload->>'refKind' = v_kind
                  AND g.user_id = r.user_id)
       ORDER BY r.id
         FOR UPDATE OF r
    ) AS locked;

  IF v_runs IS NULL THEN
    RETURN NULL;
  END IF;

  DELETE FROM public.reasoning_run_proposals AS p
   USING gone AS g, public.reasoning_runs AS r
   WHERE p.run_id = ANY (v_runs)
     AND r.id = p.run_id
     AND g.user_id = r.user_id
     AND p.payload->>'refKind' = v_kind
     AND g.id = CASE WHEN p.payload->>'refId' ~ v_uuid_shape
                     THEN (p.payload->>'refId')::uuid END;

  UPDATE public.reasoning_runs AS r
     SET status = 'ratified'
   WHERE r.id = ANY (v_runs)
     AND r.status = 'proposed'
     AND NOT EXISTS (SELECT 1
                       FROM public.reasoning_run_proposals AS q
                      WHERE q.run_id = r.id AND q.status = 'proposed');

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_reasoning_proposals_of_erased() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS purge_reasoning_proposals ON public.records;
CREATE TRIGGER purge_reasoning_proposals
  AFTER DELETE ON public.records
  REFERENCING OLD TABLE AS gone
  FOR EACH STATEMENT EXECUTE FUNCTION public.purge_reasoning_proposals_of_erased('record');

DROP TRIGGER IF EXISTS purge_reasoning_proposals ON public.sources;
CREATE TRIGGER purge_reasoning_proposals
  AFTER DELETE ON public.sources
  REFERENCING OLD TABLE AS gone
  FOR EACH STATEMENT EXECUTE FUNCTION public.purge_reasoning_proposals_of_erased('source');

-- 한 번 정리. 다시 돌려도 같은 결과다(대상 없는 줄이 없으면 0줄 · title 이 없으면 0줄).
DO $cleanup0251$
DECLARE
  v_uuid_shape constant text :=
    '^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}|\{[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\})$';
  v_runs   uuid[];
  v_gone   integer := 0;
  v_closed integer := 0;
  v_titles integer;
BEGIN
  -- records 는 FORCE ROW LEVEL SECURITY 다(0178). 이 블록을 돌리는 역할에 행 보안이 걸리면
  -- 기록이 하나도 안 보여 모든 줄이 "대상 없음"으로 잡힌다. 그 경우 아무것도 지우지 않고 멈춘다.
  IF pg_catalog.row_security_active('public.records'::regclass)
     OR pg_catalog.row_security_active('public.sources'::regclass) THEN
    RAISE EXCEPTION '0251 cleanup refused: row security is active on records or sources for role %',
      current_user USING ERRCODE = '42501';
  END IF;

  -- 트리거와 같은 순서: 대상 없는 줄을 가진 실행 행을 id 순서로 먼저 잠근다.
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

  UPDATE public.reasoning_run_proposals
     SET payload = payload - 'title'
   WHERE payload -> 'title' IS NOT NULL;
  GET DIAGNOSTICS v_titles = ROW_COUNT;

  RAISE NOTICE '0251 cleanup: removed % proposal rows, closed % runs, cleared % titles',
    v_gone, v_closed, v_titles;
END
$cleanup0251$;
