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
  const guardedCast = /CASE WHEN p\.payload->>'refId' ~ v_uuid_shape\s+THEN \(p\.payload->>'refId'\)::uuid END/g;

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

  it('refId 는 uuid 모양일 때만 uuid 로 바꿔 비교하고, 글자 비교와 맨 형 변환이 없다', () => {
    const shapes = [...sql.matchAll(/v_uuid_shape constant text :=\s+'([^']+)';/g)].map((m) => m[1]);
    expect(shapes).toHaveLength(2);
    expect(shapes[0]).toBe(shapes[1]);
    const shape = new RegExp(shapes[0].replace(/\\\{/g, '\\{').replace(/\\\}/g, '\\}'));
    const id = '26101351-1000-4000-8000-0000000000a6';
    expect(shape.test(id)).toBe(true);
    expect(shape.test(id.toUpperCase())).toBe(true);
    expect(shape.test(`{${id}}`)).toBe(true);
    for (const bad of [`{${id}`, `${id}}`, id.replace(/-/g, ''), 'not-a-uuid', '', `${id}\n`, ` ${id}`]) {
      expect(shape.test(bad)).toBe(false);
    }
    // Every text-to-uuid cast sits inside the shape guard; an unguarded one would raise on free text.
    expect(sql.match(/\)::uuid/g)).toHaveLength(sql.match(guardedCast)?.length ?? -1);
    expect(sql).not.toMatch(/id::text/);
  });

  it('같은 소유자 · 같은 종류 · 같은 id 의 줄만 지우고 실행 행을 먼저 잠근다', () => {
    expect(fn.match(guardedCast)).toHaveLength(2);
    expect(fn.match(/g\.user_id = r\.user_id/g)).toHaveLength(2);
    expect(fn.match(/p\.payload->>'refKind' = v_kind/g)).toHaveLength(2);
    expect(fn.indexOf('FOR UPDATE OF r')).toBeGreaterThan(0);
    expect(fn.indexOf('FOR UPDATE OF r')).toBeLessThan(fn.indexOf('DELETE FROM public.reasoning_run_proposals'));
  });

  it('refId 에 인덱스를 만들지 않는다(길이 제한 없는 글이다)', () => {
    expect(sql).not.toMatch(/CREATE\s+(UNIQUE\s+)?INDEX/i);
    expect(down).not.toMatch(/INDEX/i);
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
    expect(cleanup.indexOf('RAISE EXCEPTION')).toBeLessThan(cleanup.indexOf('FOR UPDATE OF r'));
  });

  it('한 번 정리도 실행 행을 먼저 잠그고, 잠근 실행 안에서만 지우고 닫는다', () => {
    const lock = cleanup.indexOf('FOR UPDATE OF r');
    const del = cleanup.indexOf('DELETE FROM public.reasoning_run_proposals');
    expect(lock).toBeGreaterThan(0);
    expect(lock).toBeLessThan(del);
    expect(cleanup.slice(del)).toMatch(/WHERE p\.run_id = ANY \(v_runs\)\s+AND r\.id = p\.run_id/);
    expect(cleanup.slice(del)).toMatch(/WHERE r\.id = ANY \(v_runs\)\s+AND r\.status = 'proposed'/);
  });

  it('한 번 정리는 종류별로 맞는 표에 같은 소유자의 대상이 없는 줄만 잡는다', () => {
    for (const [kind, table, alias] of [['record', 'records', 'x'], ['source', 'sources', 's']] as const) {
      // once to pick the runs to lock, once to remove the rows
      expect(
        cleanup.match(new RegExp(`p\\.payload->>'refKind' = '${kind}'\\s+AND NOT EXISTS \\(SELECT 1 FROM public\\.${table} AS ${alias}`, 'g')),
      ).toHaveLength(2);
      expect(cleanup.match(new RegExp(`AND ${alias}\\.user_id = r\\.user_id\\)`, 'g'))).toHaveLength(2);
    }
    expect(cleanup).toMatch(/AND u\.ref IS NOT NULL/);
    expect(cleanup).toMatch(/AND p\.payload->>'refId' ~ v_uuid_shape\s+AND \(\(/);
    expect(cleanup.match(guardedCast)).toHaveLength(3);
    expect(cleanup).toMatch(/SET payload = payload - 'title'\s+WHERE payload -> 'title' IS NOT NULL;/);
  });

  it('CLI 가 적용하는 파일이라 최상위 트랜잭션 문장이 없다', () => {
    expect(sql).not.toMatch(/^[ \t]*(BEGIN([ \t]+(WORK|TRANSACTION))?|COMMIT([ \t]+WORK)?)[ \t]*;/im);
  });

  it('롤백은 트리거 둘과 함수를 걷는다', () => {
    expect(down).toMatch(/DROP TRIGGER IF EXISTS purge_reasoning_proposals ON public\.records;/);
    expect(down).toMatch(/DROP TRIGGER IF EXISTS purge_reasoning_proposals ON public\.sources;/);
    expect(down).toMatch(/DROP FUNCTION IF EXISTS public\.purge_reasoning_proposals_of_erased\(\);/);
  });

  it('CI 가 회귀 SQL 을 실제로 돌린다', () => {
    const workflow = read('.github/workflows/supabase-dry-run.yml');
    expect(workflow).toMatch(
      /run: psql -X -h localhost -U postgres -v ON_ERROR_STOP=1 -f db\/tests\/reasoning_proposals_purge_regression\.sql/,
    );
  });
});
