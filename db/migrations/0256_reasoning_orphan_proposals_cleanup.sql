-- 0256: 0253 의 둘째 단계. 옛 complete_reasoning_run 이 남긴, 대상이 이미 지워진 제안 줄을 한 번 지운다 (Z66).
--
-- 근거: Simon 2026-10-14 10:05 KST 「Q-261013-49 : 가 (권장): 리뷰에서 요청한 두 가지 사소한 수정을 진행하고
--   3차 리뷰를 실행합니다(약 1시간 소요).」(다른 창에 직접 입력 · 원문은 여기까지다). 그 물음의 첫 선택지는
--   "한 번 더 고쳐 3회차를 돌린다. 두 단계로 올리기 + 그 틈을 시험으로 재현"이었다. 구체안(이 파일)은 구현한
--   창이 정했다.
-- 사실: 0251 을 적용한 때부터 0253 이 보이게 된 때까지, 옛 complete_reasoning_run 은 실행 도중 지워진 대상의
--   제안 줄을 넣을 수 있었다. 0251 의 트리거는 삭제 때만 돌므로 그 줄은 다시 지워지지 않는다.
--
-- 왜 0253 과 다른 파일인가 (독립 검토 2회차 Z66C-01)
--   함수 교체와 정리를 한 트랜잭션에 두면, 그 트랜잭션이 커밋되기 전에 시작한 호출은 옛 본문으로 돈다. 그 호출이
--   정리 뒤에 줄을 넣으면 아무도 지우지 않는다. 그래서 0253(함수 교체)이 먼저 커밋되고, 이 파일은 그 뒤 다른
--   트랜잭션에서 돈다. 0253 이 커밋된 뒤에 시작하는 트랜잭션은 새 본문을 쓴다. 옛 본문으로 돌 수 있는 것은
--   그때 이미 열려 있던 트랜잭션뿐이다.
--
-- 하는 일 (순서대로)
--   1. 거절: 기록 · 가져온 자료가 안 보이는 역할(전부 "대상 없음"으로 읽게 된다) · READ COMMITTED 가 아닌
--      트랜잭션(기다린 뒤에 커밋된 줄이 안 보인다) · 함수가 0253 의 본문이 아님 · 0253 이 아직 커밋되지 않음
--      (같은 트랜잭션에서 돌림).
--   2. 기다림: 이 블록이 시작할 때 이 데이터베이스에 열려 있던 다른 트랜잭션이 전부 끝날 때까지. 옛 본문에
--      들어섰지만 아직 실행 행을 잡지 않은 호출도 여기서 끝난다(2회차가 짚은 틈). 20초 안에 안 끝나면
--      아무것도 바꾸지 않고 멈춘다(55P03). 다시 돌리면 된다.
--   3. 정리: 0251 의 정리와 같은 조건(같은 소유자 · 알아볼 수 있는 uuid · record 와 source)으로 지우고,
--      검토 대기 줄이 안 남은 실행을 ratified 로 닫는다. 다시 돌려도 같은 결과다(대상 없는 줄이 없으면 0줄).
--
-- 2 가 보는 것: pg_locks 의 virtualxid 줄(트랜잭션을 연 백엔드는 누구나 하나 쥔다 · 역할과 무관하게 보인다).
--   다른 데이터베이스의 백엔드와 사용자 없는 시스템 프로세스(자동 청소 등)는 이 함수를 부를 수 없으므로 뺀다.
--   그 둘인지 알 수 없는 백엔드는 기다리는 쪽에 둔다.
-- 정리 전에 reasoning_runs 를 EXCLUSIVE 로 잠근다(0253 의 판에서 검토를 받은 그대로): 실행 행을 쥔 완료가
--   끝난 뒤에 고른다. 기다림(2)이 먼저다. 잠금을 먼저 잡으면 그 잠금을 기다리는 옛 호출을 영영 기다리게 된다.
--
-- 하지 않는 일
--   - title 등 payload 의 내용은 건드리지 않는다. 대상이 살아 있는 줄, 판단할 수 없는 줄은 그대로다.
--   - 준비된(2PC) 트랜잭션은 보지 않는다. 그런 트랜잭션은 코드를 실행하고 있지 않다.
-- 되돌리기: 지운 줄과 닫은 실행 상태는 돌아오지 않는다(rollback/0256_down.sql 은 그 사실만 적는다).

DO $cleanup0256$
DECLARE
  v_uuid_shape constant text :=
    '^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}|\{[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\})$';
  v_fn_xmin  xid;
  v_fn_src   text;
  v_db       oid;
  v_old      text[];
  v_waited   integer := 0;
  v_left     integer;
  v_deadline timestamptz;
  v_runs     uuid[];
  v_gone     integer := 0;
  v_closed   integer := 0;
BEGIN
  IF pg_catalog.row_security_active('public.records'::regclass)
     OR pg_catalog.row_security_active('public.sources'::regclass) THEN
    RAISE EXCEPTION '0256 cleanup refused: row security is active on records or sources for role %',
      current_user USING ERRCODE = '42501';
  END IF;
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION '0256 cleanup refused: it must run READ COMMITTED, not %',
      pg_catalog.current_setting('transaction_isolation') USING ERRCODE = '25001';
  END IF;

  -- The function every new transaction now runs must be 0253's, and 0253 must be committed.
  SELECT p.xmin, p.prosrc
    INTO v_fn_xmin, v_fn_src
    FROM pg_catalog.pg_proc AS p
   WHERE p.oid = 'public.complete_reasoning_run(uuid, uuid, jsonb)'::regprocedure;
  IF v_fn_src IS NULL
     OR pg_catalog.strpos(v_fn_src, 'FOR KEY SHARE OF x') = 0
     OR pg_catalog.strpos(v_fn_src, 'FOR KEY SHARE OF s') = 0 THEN
    RAISE EXCEPTION '0256 cleanup refused: complete_reasoning_run is not the 0253 body (apply 0253 first)'
      USING ERRCODE = '55000';
  END IF;
  -- A transaction (or subtransaction) still in progress holds the lock on its own id. This session can only
  -- see such a function row if that transaction is its own.
  IF EXISTS (SELECT 1
               FROM pg_catalog.pg_locks AS l
              WHERE l.locktype = 'transactionid' AND l.granted AND l.transactionid = v_fn_xmin) THEN
    RAISE EXCEPTION '0256 cleanup refused: 0253 is not committed yet (run the two files in separate transactions)'
      USING ERRCODE = '55000';
  END IF;

  -- Every transaction open right now in this database, other than this one. One of them may be inside
  -- the old function body; none that starts later can be.
  PERFORM pg_catalog.pg_stat_clear_snapshot();
  SELECT d.oid INTO v_db FROM pg_catalog.pg_database AS d WHERE d.datname = pg_catalog.current_database();
  SELECT pg_catalog.array_agg(l.virtualxid)
    INTO v_old
    FROM pg_catalog.pg_locks AS l
    LEFT JOIN pg_catalog.pg_stat_activity AS a ON a.pid = l.pid
   WHERE l.locktype = 'virtualxid'
     AND l.granted
     AND l.pid IS DISTINCT FROM pg_catalog.pg_backend_pid()
     AND NOT (a.pid IS NOT NULL AND (a.datid IS DISTINCT FROM v_db OR a.usesysid IS NULL));
  v_waited := COALESCE(pg_catalog.cardinality(v_old), 0);
  v_deadline := pg_catalog.clock_timestamp() + INTERVAL '20 seconds';
  LOOP
    SELECT pg_catalog.count(*)::integer
      INTO v_left
      FROM pg_catalog.pg_locks AS l
     WHERE l.locktype = 'virtualxid' AND l.granted AND l.virtualxid = ANY (v_old);
    EXIT WHEN v_left = 0;
    IF pg_catalog.clock_timestamp() >= v_deadline THEN
      RAISE EXCEPTION '0256 cleanup refused: % older transaction(s) still open after 20 seconds, nothing was changed (run it again)',
        v_left USING ERRCODE = '55P03';
    END IF;
    PERFORM pg_catalog.pg_sleep(0.1);
  END LOOP;

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

  RAISE NOTICE '0256 cleanup: waited for % older transaction(s), removed % proposal rows, closed % runs',
    v_waited, v_gone, v_closed;
END
$cleanup0256$;
