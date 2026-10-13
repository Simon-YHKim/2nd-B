import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const strip = (s: string) => s.replace(/--.*$/gm, '');
const functionBody = (sql: string) => {
  const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.complete_reasoning_run(');
  return sql.slice(start, sql.indexOf('$$;', start) + 3);
};

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

  it('대상 줄을 먼저 잠그고(삭제와만 부딪히는 잠금) 그다음에 실행 행을 잠근다', () => {
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
    const shape = (s: string) => [...s.matchAll(/v_uuid_shape constant text :=\s+'([^']+)';/g)].map((m) => m[1]);
    const here = shape(sql);
    const purge = shape(strip(read('db/migrations/0251_reasoning_proposals_purge.sql')));
    expect(here).toHaveLength(1);
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
    expect(sql).not.toMatch(/^[ \t]*(BEGIN([ \t]+(WORK|TRANSACTION))?|COMMIT([ \t]+WORK)?)[ \t]*;/im);
    expect(sql).not.toMatch(/reasoning_runs SET status = '(ratified|cancelled|failed|recovered)'/);
  });

  it('롤백은 0092 의 함수 본문을 글자 그대로 되돌린다', () => {
    const original = functionBody(read('db/migrations/0092_reasoning_runs.sql'));
    const down = functionBody(read('db/migrations/rollback/0253_down.sql'));
    expect(original.length).toBeGreaterThan(800);
    expect(down).toBe(original);
  });

  it('CI 가 회귀 SQL 과 두 순서의 경합을 실제로 돌린다', () => {
    const workflow = read('.github/workflows/supabase-dry-run.yml');
    expect(workflow).toMatch(
      /run: psql -X -h localhost -U postgres -v ON_ERROR_STOP=1 -f db\/tests\/reasoning_complete_skips_erased_regression\.sql/,
    );
    expect(workflow).toMatch(/- name: Race a record delete against a reasoning completion/);
    expect(workflow).toMatch(/race delete_first "\$delete" "SELECT 'stored=' \|\| \$complete" "0\/0\/0\/proposed\/0\/1"/);
    expect(workflow).toMatch(/race complete_first "SELECT 'stored=' \|\| \$complete" "\$delete" "0\/0\/0\/ratified\/0\/1"/);
    expect(workflow).toMatch(
      /race source_delete_first "\$delete_source" "SELECT 'stored=' \|\| \$complete_source" "0\/0\/0\/proposed\/1\/0"/,
    );
  });
});
