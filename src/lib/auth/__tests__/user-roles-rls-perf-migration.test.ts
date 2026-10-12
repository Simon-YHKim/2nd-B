import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const strip = (s: string) => s.replace(/--.*$/gm, '');

describe('0250 user_roles RLS 성능 정리', () => {
  const sql = strip(read('db/migrations/0250_user_roles_rls_perf.sql'));
  const down = strip(read('db/migrations/rollback/0250_down.sql'));

  it('self 정책은 (select auth.uid()) OR admin 으로 의미를 보존한다', () => {
    expect(sql).toMatch(
      /ALTER POLICY user_roles_select_self ON public\.user_roles\s+USING \(\s*user_id = \(select auth\.uid\(\)\)\s+OR \(select public\.has_app_role_now\('admin'\)\)\s*\)/,
    );
    expect(sql).toMatch(/DROP POLICY IF EXISTS user_roles_select_admin ON public\.user_roles/);
  });

  it('로그인 hook 정책과 함수 권한은 건드리지 않는다', () => {
    expect(sql).not.toMatch(/user_roles_select_auth_admin/);
    expect(sql).not.toMatch(/\b(GRANT|REVOKE)\b/i);
    expect(sql).not.toMatch(/bump_reasoning_usage_if_under_cap/);
  });

  it('granted_by FK 인덱스를 만든다', () => {
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS user_roles_granted_by_idx\s+ON public\.user_roles \(granted_by\)/);
  });

  it('롤백은 0139 정책 두 개로 돌아간다', () => {
    expect(down).toMatch(/DROP INDEX IF EXISTS public\.user_roles_granted_by_idx/);
    expect(down).toMatch(/CREATE POLICY user_roles_select_admin ON public\.user_roles\s+FOR SELECT TO authenticated\s+USING \(public\.has_app_role_now\('admin'\)\)/);
    expect(down).toMatch(/ALTER POLICY user_roles_select_self ON public\.user_roles\s+USING \(user_id = auth\.uid\(\)\)/);
  });
});
