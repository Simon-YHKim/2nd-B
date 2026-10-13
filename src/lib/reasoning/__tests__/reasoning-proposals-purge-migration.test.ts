import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const strip = (s: string) => s.replace(/--.*$/gm, '');

describe('0251 지운 기록의 리즈닝 제안 줄 정리 (Z66)', () => {
  const sql = strip(read('db/migrations/0251_reasoning_proposals_purge.sql'));
  const down = strip(read('db/migrations/rollback/0251_down.sql'));
  const fn = sql.slice(
    sql.indexOf('CREATE OR REPLACE FUNCTION public.purge_reasoning_proposals_of_erased()'),
    sql.indexOf('REVOKE ALL ON FUNCTION public.purge_reasoning_proposals_of_erased()'),
  );
  const cleanup = sql.slice(sql.indexOf('DO $cleanup0251$'));

  it('records 와 sources 에 종류를 넘기는 AFTER DELETE 문장 단위 트리거를 건다', () => {
    for (const [table, kind] of [['records', 'record'], ['sources', 'source']] as const) {
      expect(sql).toMatch(
        new RegExp(
          `DROP TRIGGER IF EXISTS purge_reasoning_proposals ON public\\.${table};\\s+` +
            `CREATE TRIGGER purge_reasoning_proposals\\s+AFTER DELETE ON public\\.${table}\\s+` +
            `REFERENCING OLD TABLE AS gone\\s+` +
            `FOR EACH STATEMENT EXECUTE FUNCTION public\\.purge_reasoning_proposals_of_erased\\('${kind}'\\);`,
        ),
      );
    }
  });

  it('함수는 소유자 권한으로 돌고 API 역할 어디에도 실행 권한을 남기지 않는다', () => {
    expect(fn).toMatch(/SECURITY DEFINER\s+SET search_path = ''\s+SET row_security = off/);
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.purge_reasoning_proposals_of_erased\(\) FROM PUBLIC, anon, authenticated, service_role;/,
    );
    expect(sql).not.toMatch(/\bGRANT\b/i);
  });

  it('함수는 FORCE RLS 인 records 와 sources 를 읽지 않고 전이 표만 본다', () => {
    expect(fn.length).toBeGreaterThan(200);
    expect(fn).not.toMatch(/public\.(records|sources)\b/);
    expect(fn).toMatch(/FROM gone AS g/);
  });

  it('같은 소유자 · 같은 종류 · 같은 id 의 줄만 지우고 실행 행을 먼저 잠근다', () => {
    expect(fn).toMatch(/g\.user_id = r\.user_id/);
    expect(fn).toMatch(/p\.payload->>'refKind' = v_kind/);
    expect(fn).toMatch(/p\.payload->>'refId' = g\.id::text/);
    expect(fn.indexOf('FOR UPDATE OF r')).toBeGreaterThan(0);
    expect(fn.indexOf('FOR UPDATE OF r')).toBeLessThan(fn.indexOf('DELETE FROM public.reasoning_run_proposals'));
  });

  it('실행 행은 지우지 않고, 닫을 때는 계량이 세는 ratified 로만 간다', () => {
    expect(sql).not.toMatch(/DELETE FROM public\.reasoning_runs\b/);
    const statuses = [...sql.matchAll(/SET status = '([a-z]+)'/g)].map((m) => m[1]);
    expect(statuses).toEqual(['ratified', 'ratified']);
    expect(sql).not.toMatch(/'(cancelled|failed|recovered)'/);
  });

  it('한 번 정리는 행 보안이 걸린 역할에서 지우기 전에 멈춘다', () => {
    const guard = cleanup.indexOf("row_security_active('public.records'::regclass)");
    expect(guard).toBeGreaterThan(0);
    expect(cleanup).toMatch(/row_security_active\('public\.sources'::regclass\)/);
    expect(cleanup.indexOf('RAISE EXCEPTION')).toBeGreaterThan(guard);
    expect(cleanup.indexOf('RAISE EXCEPTION')).toBeLessThan(cleanup.indexOf('DELETE FROM'));
  });

  it('한 번 정리는 종류별로 맞는 표에 같은 소유자의 대상이 없는 줄만 잡는다', () => {
    expect(cleanup).toMatch(
      /p\.payload->>'refKind' = 'record'\s+AND NOT EXISTS \(SELECT 1 FROM public\.records AS x\s+WHERE x\.id::text = p\.payload->>'refId' AND x\.user_id = r\.user_id\)/,
    );
    expect(cleanup).toMatch(
      /p\.payload->>'refKind' = 'source'\s+AND NOT EXISTS \(SELECT 1 FROM public\.sources AS s\s+WHERE s\.id::text = p\.payload->>'refId' AND s\.user_id = r\.user_id\)/,
    );
    expect(cleanup).toMatch(/p\.payload->>'refId' IS NOT NULL/);
    expect(cleanup).toMatch(/r\.id = ANY \(COALESCE\(v_runs, ARRAY\[\]::uuid\[\]\)\)/);
    expect(cleanup).toMatch(/SET payload = payload - 'title'\s+WHERE payload -> 'title' IS NOT NULL;/);
  });

  it('CLI 가 적용하는 파일이라 최상위 트랜잭션 문장이 없다', () => {
    expect(sql).not.toMatch(/^[ \t]*(BEGIN([ \t]+(WORK|TRANSACTION))?|COMMIT([ \t]+WORK)?)[ \t]*;/im);
  });

  it('롤백은 트리거 둘 · 함수 · 인덱스를 걷는다', () => {
    expect(down).toMatch(/DROP TRIGGER IF EXISTS purge_reasoning_proposals ON public\.records;/);
    expect(down).toMatch(/DROP TRIGGER IF EXISTS purge_reasoning_proposals ON public\.sources;/);
    expect(down).toMatch(/DROP FUNCTION IF EXISTS public\.purge_reasoning_proposals_of_erased\(\);/);
    expect(down).toMatch(/DROP INDEX IF EXISTS public\.reasoning_run_proposals_ref_id_idx;/);
  });

  it('CI 가 회귀 SQL 을 실제로 돌린다', () => {
    const workflow = read('.github/workflows/supabase-dry-run.yml');
    expect(workflow).toMatch(
      /run: psql -X -h localhost -U postgres -v ON_ERROR_STOP=1 -f db\/tests\/reasoning_proposals_purge_regression\.sql/,
    );
  });
});
