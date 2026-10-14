import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const strip = (s: string) => s.replace(/--.*$/gm, '');
const functionBody = (sql: string) => {
  const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.complete_reasoning_run(');
  return sql.slice(start, sql.indexOf('$$;', start) + 3);
};
const uuidShapes = (s: string) => [...s.matchAll(/v_uuid_shape constant text :=\s+'([^']+)';/g)].map((m) => m[1]);
const TOP_LEVEL_TRANSACTION = /^[ \t]*(BEGIN([ \t]+(WORK|TRANSACTION))?|COMMIT([ \t]+WORK)?)[ \t]*;/im;

describe('0253 리즈닝이 끝날 때 지워진 기록의 제안은 저장하지 않는다 (Z66)', () => {
  const sql = strip(read('db/migrations/0253_reasoning_complete_skips_erased.sql'));
  const fn = functionBody(sql);
  const guardedCast = /CASE WHEN pl\.payload->>'refId' ~ v_uuid_shape\s+THEN \(pl\.payload->>'refId'\)::uuid END/g;

  it('호출자 확인 · 32개 상한 · 상태 검사는 0092 와 같다', () => {
    expect(fn).toMatch(/IF auth\.uid\(\) IS NULL OR auth\.uid\(\) != p_user_id THEN\s+RAISE EXCEPTION 'caller must match p_user_id' USING ERRCODE = '42501';/);
    expect(fn).toMatch(/jsonb_array_length\(p_proposals\) > 32 THEN\s+RAISE EXCEPTION 'invalid proposals payload' USING ERRCODE = '22023';/);
    expect(fn).toMatch(/IF v_status = 'proposed' THEN\s+SELECT count\(\*\)::int INTO v_count FROM public\.reasoning_run_proposals WHERE run_id = p_run_id;\s+RETURN v_count;/);
    expect(fn).toMatch(/IF v_status NOT IN \('reserved', 'running'\) THEN\s+RAISE EXCEPTION 'reasoning_run_invalid_state'/);
    expect(fn).toMatch(/UPDATE public\.reasoning_runs SET status = 'proposed' WHERE id = p_run_id;/);
    expect(fn).toMatch(/SECURITY DEFINER\s+SET search_path = ''/);
  });

  it('대상 줄을 먼저 잠그고(삭제 · 키를 바꾸는 수정과 부딪히는 잠금) 그다음에 실행 행을 잠근다', () => {
    const records = fn.indexOf('FOR KEY SHARE OF x');
    const sources = fn.indexOf('FOR KEY SHARE OF s');
    const run = fn.indexOf('FOR UPDATE');
    expect(records).toBeGreaterThan(0);
    expect(sources).toBeGreaterThan(records);
    expect(run).toBeGreaterThan(sources);
    expect(fn).toMatch(/FROM public\.records AS x\s+WHERE x\.user_id = p_user_id/);
    expect(fn).toMatch(/FROM public\.sources AS s\s+WHERE s\.user_id = p_user_id/);
    expect(fn.match(/ORDER BY [xs]\.id\s+FOR KEY SHARE OF [xs];/g)).toHaveLength(2);
  });

  it('같은 소유자의 대상이 없는 제안만 빼고, 판단할 수 없는 것은 지금처럼 넣는다', () => {
    const insert = fn.slice(fn.indexOf('INSERT INTO public.reasoning_run_proposals'));
    expect(insert).toMatch(/WHERE NOT v_judge\s+OR u\.ref IS NULL\s+OR pl\.payload->>'refKind' IS NULL\s+OR pl\.payload->>'refKind' NOT IN \('record', 'source'\)/);
    expect(insert).toMatch(/OR \(pl\.payload->>'refKind' = 'record'\s+AND EXISTS \(SELECT 1 FROM public\.records AS x\s+WHERE x\.id = u\.ref AND x\.user_id = p_user_id\)\)/);
    expect(insert).toMatch(/OR \(pl\.payload->>'refKind' = 'source'\s+AND EXISTS \(SELECT 1 FROM public\.sources AS s\s+WHERE s\.id = u\.ref AND s\.user_id = p_user_id\)\);/);
    // The stored row is what 0092 stored: the caller's ordinal, kind and payload.
    expect(insert).toMatch(/SELECT p_run_id,\s+\(t\.ord - 1\)::int,\s+COALESCE\(t\.elem->>'kind', 'domain_link'\),\s+pl\.payload/);
    expect(insert).toMatch(/GET DIAGNOSTICS v_count = ROW_COUNT;/);
  });

  it('refId 는 uuid 모양일 때만 형 변환하고, 그 모양은 0251 과 글자까지 같다', () => {
    const here = uuidShapes(sql);
    const purge = uuidShapes(strip(read('db/migrations/0251_reasoning_proposals_purge.sql')));
    expect(here).toHaveLength(1); // the function; the one-time cleanup is 0256
    expect(purge).toHaveLength(2);
    expect(here[0]).toBe(purge[0]);
    expect(fn.match(/\)::uuid/g)).toHaveLength(fn.match(guardedCast)?.length ?? -1);
    expect(fn.match(guardedCast)).toHaveLength(3);
    expect(fn).not.toMatch(/id::text/);
  });

  it('기록이 안 보이는 역할에서는 대상 검사를 하지 않는다(결과를 통째로 잃지 않게)', () => {
    expect(fn).toMatch(
      /v_judge := NOT pg_catalog\.row_security_active\('public\.records'::regclass\)\s+AND NOT pg_catalog\.row_security_active\('public\.sources'::regclass\);/,
    );
    expect(fn.indexOf('v_judge :=')).toBeLessThan(fn.indexOf('FOR KEY SHARE OF x'));
    expect(fn).toMatch(/IF v_judge THEN/);
  });

  it('권한은 0092 그대로이고 최상위 트랜잭션 문장이 없다', () => {
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.complete_reasoning_run\(uuid, uuid, jsonb\) FROM PUBLIC;/);
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.complete_reasoning_run\(uuid, uuid, jsonb\) FROM anon;/);
    expect(sql).toMatch(/GRANT\s+EXECUTE ON FUNCTION public\.complete_reasoning_run\(uuid, uuid, jsonb\) TO authenticated;/);
    expect(sql).not.toMatch(TOP_LEVEL_TRANSACTION);
    expect(sql).not.toMatch(/reasoning_runs SET status = '(ratified|cancelled|failed|recovered)'/);
  });

  it('이 파일은 함수만 바꾼다: 줄을 지우거나 표를 잠그는 문장이 없다(정리는 0256)', () => {
    const rest = sql.replace(fn, '');
    expect(rest).not.toMatch(/\bDO\s+\$/);
    expect(sql).not.toMatch(/DELETE FROM|LOCK TABLE|SET status = 'ratified'/);
    expect(rest.replace(/\s+/g, ' ').trim()).toBe(
      [
        'REVOKE EXECUTE ON FUNCTION public.complete_reasoning_run(uuid, uuid, jsonb) FROM PUBLIC;',
        'REVOKE EXECUTE ON FUNCTION public.complete_reasoning_run(uuid, uuid, jsonb) FROM anon;',
        'GRANT EXECUTE ON FUNCTION public.complete_reasoning_run(uuid, uuid, jsonb) TO authenticated;',
      ].join(' '),
    );
  });

  it('롤백은 0092 의 함수 본문을 글자 그대로 되돌린다', () => {
    const original = functionBody(read('db/migrations/0092_reasoning_runs.sql'));
    const down = functionBody(read('db/migrations/rollback/0253_down.sql'));
    expect(original.length).toBeGreaterThan(800);
    expect(down).toBe(original);
  });
});

describe('0256 옛 함수가 남긴 대상 없는 제안 줄을 한 번 지운다 (0253 의 둘째 단계)', () => {
  const sql = strip(read('db/migrations/0256_reasoning_orphan_proposals_cleanup.sql'));
  const start = sql.indexOf('DO $cleanup0256$');
  const block = sql.slice(start, sql.indexOf('$cleanup0256$;', start));
  const at = (needle: string) => {
    const i = block.indexOf(needle);
    expect(`${needle} @ ${i >= 0}`).toBe(`${needle} @ true`);
    return i;
  };

  it('블록 하나뿐이고 최상위 트랜잭션 문장이 없다', () => {
    expect(start).toBeGreaterThan(-1);
    expect(sql.replace(block, '').replace(/\s+/g, '')).toBe('$cleanup0256$;');
    expect(sql).not.toMatch(TOP_LEVEL_TRANSACTION);
    expect(sql).not.toMatch(/CREATE |ALTER |DROP |GRANT |REVOKE /);
  });

  it('거절 넷이 기다림보다 먼저, 기다림이 잠금보다 먼저, 잠금이 삭제보다 먼저다', () => {
    const order = [
      at("RAISE EXCEPTION '0256 cleanup refused: row security is active"),
      at("RAISE EXCEPTION '0256 cleanup refused: it must run READ COMMITTED"),
      at("RAISE EXCEPTION '0256 cleanup refused: complete_reasoning_run is not the 0253 body"),
      at("RAISE EXCEPTION '0256 cleanup refused: 0253 is not committed yet"),
      at('SELECT pg_catalog.array_agg(l.virtualxid)'),
      at('EXIT WHEN v_left = 0;'),
      at('LOCK TABLE public.reasoning_runs IN EXCLUSIVE MODE;'),
      at('FOR UPDATE OF r'),
      at('DELETE FROM public.reasoning_run_proposals AS p'),
      at("SET status = 'ratified'"),
    ];
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(block.match(/DELETE FROM/g)).toHaveLength(1);
    expect(block.match(/LOCK TABLE/g)).toHaveLength(1);
  });

  it('거절 조건: 기록이 안 보임 · 격리 수준 · 함수가 0253 의 본문이 아님 · 0253 이 아직 커밋 전', () => {
    expect(block).toMatch(/row_security_active\('public\.records'::regclass\)\s+OR pg_catalog\.row_security_active\('public\.sources'::regclass\)/);
    expect(block).toMatch(/IF pg_catalog\.current_setting\('transaction_isolation'\) <> 'read committed' THEN/);
    expect(block).toMatch(/WHERE p\.oid = 'public\.complete_reasoning_run\(uuid, uuid, jsonb\)'::regprocedure;/);
    expect(block).toMatch(
      /IF v_fn_src IS NULL\s+OR pg_catalog\.strpos\(v_fn_src, 'FOR KEY SHARE OF x'\) = 0\s+OR pg_catalog\.strpos\(v_fn_src, 'FOR KEY SHARE OF s'\) = 0 THEN/,
    );
    // the marker it looks for is in 0253's function and not in the body 0253 replaces
    const fresh = functionBody(strip(read('db/migrations/0253_reasoning_complete_skips_erased.sql')));
    const old = functionBody(read('db/migrations/0092_reasoning_runs.sql'));
    expect(fresh).toContain('FOR KEY SHARE OF x');
    expect(fresh).toContain('FOR KEY SHARE OF s');
    expect(old).not.toContain('FOR KEY SHARE');
    expect(block).toMatch(/WHERE l\.locktype = 'transactionid' AND l\.granted AND l\.transactionid = v_fn_xmin\)/);
  });

  it('기다림: 시작할 때 이 데이터베이스에 열려 있던 다른 트랜잭션이 끝날 때까지, 20초 뒤에는 아무것도 바꾸지 않고 멈춘다', () => {
    expect(block).toMatch(/WHERE l\.locktype = 'virtualxid'\s+AND l\.granted\s+AND l\.pid IS DISTINCT FROM pg_catalog\.pg_backend_pid\(\)/);
    // only a backend known to be in another database or to have no user is left out; an unknown one is waited for
    expect(block).toMatch(/LEFT JOIN pg_catalog\.pg_stat_activity AS a ON a\.pid = l\.pid/);
    expect(block).toMatch(/AND NOT \(a\.pid IS NOT NULL AND \(a\.datid IS DISTINCT FROM v_db OR a\.usesysid IS NULL\)\);/);
    expect(block).toMatch(/WHERE l\.locktype = 'virtualxid' AND l\.granted AND l\.virtualxid = ANY \(v_old\);/);
    expect(block).toMatch(/v_deadline := pg_catalog\.clock_timestamp\(\) \+ INTERVAL '20 seconds';/);
    expect(block).toMatch(/IF pg_catalog\.clock_timestamp\(\) >= v_deadline THEN\s+RAISE EXCEPTION '0256 cleanup refused: % older transaction\(s\) still open after 20 seconds, nothing was changed \(run it again\)',\s+v_left USING ERRCODE = '55P03';/);
    // the give-up comes before any statement that changes a row
    expect(at("USING ERRCODE = '55P03'")).toBeLessThan(at('LOCK TABLE public.reasoning_runs IN EXCLUSIVE MODE;'));
  });

  it('정리: 같은 소유자의 대상이 없는 줄만 지우고, 검토 대기 줄이 안 남은 실행만 닫는다', () => {
    // same owner, both kinds, and only a refId it can read as a uuid
    expect(block.match(/x\.user_id = r\.user_id/g)).toHaveLength(2);
    expect(block.match(/s\.user_id = r\.user_id/g)).toHaveLength(2);
    expect(block).toMatch(/AND p\.payload->>'refId' ~ v_uuid_shape/);
    expect(block.match(/\)::uuid/g)).toHaveLength(
      block.match(/CASE WHEN p\.payload->>'refId' ~ v_uuid_shape\s+THEN \(p\.payload->>'refId'\)::uuid END/g)?.length ?? -1,
    );
    const shape = uuidShapes(sql);
    expect(shape).toHaveLength(1);
    expect(shape[0]).toBe(uuidShapes(strip(read('db/migrations/0251_reasoning_proposals_purge.sql')))[0]);
    // closes only runs it emptied of pending rows; never touches titles or other payload fields
    expect(block).toMatch(/SET status = 'ratified'\s+WHERE r\.id = ANY \(v_runs\)\s+AND r\.status = 'proposed'\s+AND NOT EXISTS/);
    expect(block).not.toMatch(/SET payload/);
  });

  it('되돌리기 파일은 아무것도 바꾸지 않는다', () => {
    const down = strip(read('db/migrations/rollback/0256_down.sql'));
    expect(down).not.toMatch(/CREATE |ALTER |DROP |DELETE |UPDATE |INSERT |GRANT |REVOKE |LOCK /);
    expect(down).not.toMatch(TOP_LEVEL_TRANSACTION);
  });
});

describe('0253 · 0256 을 CI 가 실제로 돌린다', () => {
  const workflow = read('.github/workflows/supabase-dry-run.yml');
  const stepOf = (name: string) => {
    const start = workflow.indexOf(`- name: ${name}`);
    expect(`${name} @ ${start >= 0}`).toBe(`${name} @ true`);
    return workflow.slice(start, workflow.indexOf('\n      - name:', start + 10));
  };
  const race = stepOf('Race a record delete against a reasoning completion');

  it('경합 단계는 고정 대기가 아니라, 둘째 세션이 첫째의 잠금을 기다리는 것을 본 뒤에 푼다', () => {
    expect(race).not.toMatch(/pg_sleep\(3\)/);
    expect(race).toMatch(/-c "SELECT pg_advisory_xact_lock\(\$key\)"/);
    expect(race).toMatch(/w\.wait_event_type = 'Lock'/);
    expect(race).toMatch(/= ANY \(pg_catalog\.pg_blocking_pids\(w\.pid\)\)/);
    expect(race).toMatch(/the second session did not wait for a lock the first session holds/);
    // the barrier is opened only after that check
    expect(race.indexOf('pg_blocking_pids')).toBeLessThan(race.indexOf('# Open the barrier by ending the holder.'));
    expect(race).toMatch(/statement_timeout=90s/);
  });

  it('회귀 SQL 둘과 경합 세 순서를 돌린다', () => {
    expect(workflow).toMatch(
      /run: psql -X -h localhost -U postgres -v ON_ERROR_STOP=1 -f db\/tests\/reasoning_complete_skips_erased_regression\.sql/,
    );
    const cleanup = stepOf('Exercise the one-time cleanup of proposals whose target is gone (0256)');
    // the file commits, so it runs on a clone that is dropped on every way out
    expect(cleanup).toMatch(/CREATE DATABASE \$clone_db TEMPLATE \$source_db/);
    expect(cleanup).toMatch(/-d "\$clone_db" -v ON_ERROR_STOP=1 \\\s+-f db\/tests\/reasoning_orphan_proposals_cleanup_regression\.sql/);
    expect(cleanup).toMatch(/trap 'drop_clone \|\| true' EXIT/);
    expect(race).toMatch(/race delete_first "\$delete" "SELECT 'stored=' \|\| \$complete" "0\/0\/0\/proposed\/0\/1"/);
    expect(race).toMatch(/race complete_first "SELECT 'stored=' \|\| \$complete" "\$delete" "0\/0\/0\/ratified\/0\/1"/);
    expect(race).toMatch(/race source_delete_first "\$delete_source" "SELECT 'stored=' \|\| \$complete_source" "0\/0\/0\/proposed\/1\/0"/);
  });

  it('넘겨주기: 옛 본문 안에 멈춘 호출이 열려 있는 채로 0253 을 커밋하고 0256 을 돌린다', () => {
    const body = race.slice(race.indexOf('transition() {'), race.indexOf('# The delete is open when the completion arrives'));
    const at = (needle: string) => {
      const i = body.indexOf(needle);
      expect(`${needle} @ ${i >= 0}`).toBe(`${needle} @ true`);
      return i;
    };
    const order = [
      at('-f db/migrations/rollback/0253_down.sql'), // the clone starts from the old function
      at('CREATE OR REPLACE FUNCTION auth.uid()'), // the first thing the old body evaluates waits on a gate
      at(`-c "SELECT 'stored=' || $complete"`), // the old call, left open
      at("the old call never reached the gate inside the old function"),
      at('-f db/migrations/0253_reasoning_complete_skips_erased.sql'), // committed while the old call is open
      at('sql "$db" "$delete"'),
      at('-f db/migrations/0256_reasoning_orphan_proposals_cleanup.sql > "race_0253_c_$label.out" 2>&1 &'),
      at('0256 did not wait for the transaction that was already open'),
      at('sql "$db" "UPDATE public.z66c_gate SET open = true"'), // the gate opens only after 0256 was seen waiting
    ];
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(body).toMatch(/WHERE application_name = '\$c_app' AND state = 'active' AND wait_event = 'PgSleep'/);
    // the old body stored the row (the new one would store 0), and 0256 removed exactly that row
    expect(body).toMatch(/grep -q "stored=1" <<< "\$a"/);
    expect(body).toMatch(/grep -q "removed 1 proposal rows, closed 1 runs" <<< "\$c"/);
    expect(body).toMatch(/"\$a_rc\/\$c_rc\/\$state" != "0\/0\/0\/ratified\/0\/1"/);
    // held: 0256 gives up having changed nothing, the old call then leaves its row, a second 0256 removes it
    expect(body).toMatch(/grep -q "0256 cleanup refused: 1 older transaction\(s\) still open after 20 seconds" <<< "\$c"/);
    expect(body).toMatch(/a 0256 that gave up changed the state to \$state/);
    expect(body).toMatch(/"\$state" != "1\/proposed\/0\/1"/);
    expect(race).toMatch(/\n\s+transition transition_released released\n/);
    expect(race).toMatch(/\n\s+transition transition_held held\n/);
  });

  it('어느 길로 끝나도 세션을 끝내고 복제 데이터베이스를 지운다', () => {
    expect(race).toMatch(/trap 'end_case \|\| true' EXIT/);
    const endCase = race.slice(race.indexOf('end_case() {'), race.indexOf("trap 'end_case || true' EXIT"));
    expect(endCase).toMatch(/pg_terminate_backend\(pid\) FROM pg_catalog\.pg_stat_activity\s+WHERE datname = '\$db'/);
    // a clone that cannot be dropped fails the case instead of being swallowed
    expect(endCase).toMatch(/sql "\$source_db" "DROP DATABASE IF EXISTS \$db WITH \(FORCE\)"\n/);
    expect(race).not.toMatch(/DROP DATABASE IF EXISTS \$clone_db WITH \(FORCE\)" \|\| true/);
    // the clone is registered before it is created, so a failed seed is cleaned up too
    const clone = race.slice(race.indexOf('clone() {'), race.indexOf('seen() {'));
    expect(clone.indexOf('active_db="$db"')).toBeLessThan(clone.indexOf('CREATE DATABASE $db TEMPLATE $source_db'));
    expect(race).toMatch(/0253 completion race left \$left clone database\(s\) behind/);
  });
});
