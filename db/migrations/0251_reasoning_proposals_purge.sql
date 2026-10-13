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
-- 하지 않는 일
--   - complete_reasoning_run 은 그대로다. 실행이 도는 사이 기록을 지우면 그 뒤에 들어온 제안 줄은
--     대상 없이 남을 수 있다. 화면이 그런 줄을 거르고, 새 빌드는 title 을 쓰지 않는다(#2365).
--   - refKind 가 record · source 가 아니거나 refId 가 없는 줄은 건드리지 않는다.
--   - 삭제 등록부(db/erasure-registry.json)에는 넣지 않는다. 그 등록부는 소유자 열이 있는 표만
--     받고 이 표에는 소유자 열이 없다(run_id 로만 이어진다).
--
-- 잠금 순서: 실행 행 다음에 제안 줄. ratify_reasoning_proposals · complete_reasoning_run 과 같다.
-- 권한: 0092 가 authenticated · anon 의 INSERT/UPDATE/DELETE 를 회수했으므로 SECURITY DEFINER 로 돈다.
--   트리거 함수는 records · sources 를 읽지 않는다(지운 행은 전이 표 gone 으로 받는다).
-- 되돌리기: rollback/0251_down.sql 은 트리거 · 함수 · 인덱스만 걷는다. 지운 줄과 title 은 돌아오지 않는다.

CREATE INDEX IF NOT EXISTS reasoning_run_proposals_ref_id_idx
  ON public.reasoning_run_proposals ((payload->>'refId'));

CREATE OR REPLACE FUNCTION public.purge_reasoning_proposals_of_erased()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_kind text := TG_ARGV[0];
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
                 FROM gone AS g
                 JOIN public.reasoning_run_proposals AS p
                   ON p.payload->>'refId' = g.id::text
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
     AND p.payload->>'refId' = g.id::text;

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
  v_runs   uuid[];
  v_gone   integer;
  v_closed integer;
  v_titles integer;
BEGIN
  -- records 는 FORCE ROW LEVEL SECURITY 다(0178). 이 블록을 돌리는 역할에 행 보안이 걸리면
  -- 기록이 하나도 안 보여 모든 줄이 "대상 없음"으로 잡힌다. 그 경우 아무것도 지우지 않고 멈춘다.
  IF pg_catalog.row_security_active('public.records'::regclass)
     OR pg_catalog.row_security_active('public.sources'::regclass) THEN
    RAISE EXCEPTION '0251 cleanup refused: row security is active on records or sources for role %',
      current_user USING ERRCODE = '42501';
  END IF;

  WITH orphan AS (
    SELECT p.run_id, p.ordinal
      FROM public.reasoning_run_proposals AS p
      JOIN public.reasoning_runs AS r ON r.id = p.run_id
     WHERE p.payload->>'refId' IS NOT NULL
       AND ((p.payload->>'refKind' = 'record'
             AND NOT EXISTS (SELECT 1 FROM public.records AS x
                              WHERE x.id::text = p.payload->>'refId' AND x.user_id = r.user_id))
         OR (p.payload->>'refKind' = 'source'
             AND NOT EXISTS (SELECT 1 FROM public.sources AS s
                              WHERE s.id::text = p.payload->>'refId' AND s.user_id = r.user_id)))
  ), gone AS (
    DELETE FROM public.reasoning_run_proposals AS p
     USING orphan AS o
     WHERE p.run_id = o.run_id AND p.ordinal = o.ordinal
    RETURNING p.run_id
  )
  SELECT pg_catalog.array_agg(DISTINCT gone.run_id), pg_catalog.count(*)::integer
    INTO v_runs, v_gone
    FROM gone;

  UPDATE public.reasoning_runs AS r
     SET status = 'ratified'
   WHERE r.id = ANY (COALESCE(v_runs, ARRAY[]::uuid[]))
     AND r.status = 'proposed'
     AND NOT EXISTS (SELECT 1
                       FROM public.reasoning_run_proposals AS q
                      WHERE q.run_id = r.id AND q.status = 'proposed');
  GET DIAGNOSTICS v_closed = ROW_COUNT;

  UPDATE public.reasoning_run_proposals
     SET payload = payload - 'title'
   WHERE payload -> 'title' IS NOT NULL;
  GET DIAGNOSTICS v_titles = ROW_COUNT;

  RAISE NOTICE '0251 cleanup: removed % proposal rows, closed % runs, cleared % titles',
    v_gone, v_closed, v_titles;
END
$cleanup0251$;
