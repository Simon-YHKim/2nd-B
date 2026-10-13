import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const strip = (s: string) => s.replace(/--.*$/gm, '');

describe('0252 답이 바뀐 대화 턴의 횟수 환불 (Z46)', () => {
  const sql = strip(read('db/migrations/0252_chat_turn_refund.sql'));
  const down = strip(read('db/migrations/rollback/0252_down.sql'));
  const fn = sql.slice(
    sql.indexOf('CREATE OR REPLACE FUNCTION public.refund_chat_turn_after_output_swap(p_day date)'),
    sql.indexOf('REVOKE ALL ON FUNCTION'),
  );

  it('로그인한 사용자만 부르고, 누구의 횟수인지는 인자가 아니라 세션이 정한다', () => {
    expect(fn).toMatch(/SECURITY DEFINER\s+SET search_path = ''/);
    expect(fn).toMatch(/v_user\s+uuid := auth\.uid\(\);/);
    expect(fn).toMatch(/IF v_user IS NULL THEN\s+RAISE EXCEPTION 'not signed in' USING ERRCODE = '42501';/);
    expect(fn).not.toMatch(/p_user/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.refund_chat_turn_after_output_swap\(date\) FROM PUBLIC, anon, service_role;/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.refund_chat_turn_after_output_swap\(date\) TO authenticated;/);
  });

  it('근거는 프록시가 쓴 줄뿐이다: server_verified · secondb_chat · red · 10분 안 · 본인 것', () => {
    expect(fn).toMatch(/WHERE a\.user_id = v_user/);
    expect(fn).toMatch(/AND a\.event_source = 'server_verified'/);
    expect(fn).toMatch(/AND a\.purpose = 'secondb_chat'/);
    expect(fn).toMatch(/AND a\.safety_zone = 'red'/);
    expect(fn).toMatch(/AND a\.created_at >= pg_catalog\.now\(\) - interval '10 minutes'/);
    // The client-written marker is not evidence.
    expect(fn).not.toMatch(/model_used|\+swap/);
  });

  it('한 줄은 한 번만 쓴다: 쓴 id 를 적고, 오늘 · 어제에 적힌 id 는 다시 고르지 않는다', () => {
    expect(fn).toMatch(/pg_advisory_xact_lock\(\s*pg_catalog\.hashtextextended\('chat_turn_refund:' \|\| v_user::text, 0\)\)/);
    expect(fn).toMatch(/AND used\.day IN \(v_today, v_today - 1\)\s+AND a\.id = ANY \(used\.refunded_audit_ids\)/);
    expect(fn).toMatch(/refunded_audit_ids = cu\.refunded_audit_ids \|\| v_audit/);
    expect(fn.indexOf('pg_advisory_xact_lock')).toBeLessThan(fn.indexOf('FROM public.ai_audit_log'));
  });

  it('그날 횟수가 있을 때만 1 내리고, KST 오늘이나 어제가 아니면 아무것도 하지 않는다', () => {
    expect(fn).toMatch(/v_today date := \(pg_catalog\.now\(\) AT TIME ZONE 'Asia\/Seoul'\)::date;/);
    expect(fn).toMatch(/IF p_day IS NULL OR p_day NOT IN \(v_today, v_today - 1\) THEN\s+RETURN NULL;/);
    expect(fn).toMatch(/SET count = cu\.count - 1,/);
    expect(fn).toMatch(/WHERE cu\.user_id = v_user\s+AND cu\.day = p_day\s+AND cu\.count > 0\s+RETURNING cu\.count INTO v_count;/);
    expect(fn).not.toMatch(/ad_bonus|chat_ad_credits|usage_counters/);
  });

  it('새 표를 만들지 않고 chat_usage 에 칸 하나만 더한다', () => {
    expect(sql).not.toMatch(/CREATE TABLE/i);
    expect(sql).toMatch(
      /ALTER TABLE public\.chat_usage\s+ADD COLUMN IF NOT EXISTS refunded_audit_ids uuid\[\] NOT NULL DEFAULT '\{\}'::uuid\[\];/,
    );
    expect(sql).not.toMatch(/^[ \t]*(BEGIN([ \t]+(WORK|TRANSACTION))?|COMMIT([ \t]+WORK)?)[ \t]*;/im);
  });

  it('롤백은 함수와 칸을 걷는다', () => {
    expect(down).toMatch(/DROP FUNCTION IF EXISTS public\.refund_chat_turn_after_output_swap\(date\);/);
    expect(down).toMatch(/ALTER TABLE public\.chat_usage DROP COLUMN IF EXISTS refunded_audit_ids;/);
  });

  it('CI 가 회귀 SQL 을 실제로 돌린다', () => {
    const workflow = read('.github/workflows/supabase-dry-run.yml');
    expect(workflow).toMatch(
      /run: psql -X -h localhost -U postgres -v ON_ERROR_STOP=1 -f db\/tests\/chat_turn_refund_regression\.sql/,
    );
    // The two-session race is a step of its own: one proxy row, one turn back.
    expect(workflow).toMatch(/- name: Race two chat turn refunds over one proxy row/);
    expect(workflow).toMatch(/"\$a" != "a=4" \|\| "\$b" != "b=null" \|\| "\$state" != "4\/1"/);
  });
});
