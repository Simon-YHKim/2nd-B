import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const strip = (s: string) => s.replace(/--.*$/gm, '');

describe('0252 답이 바뀐 대화 턴의 횟수 환불 (Z46)', () => {
  const sql = strip(read('db/migrations/0252_chat_turn_refund.sql'));
  const down = strip(read('db/migrations/rollback/0252_down.sql'));
  const fnStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.refund_chat_turn_after_output_swap(p_day date)');
  const fn = sql.slice(fnStart, sql.indexOf('REVOKE ALL ON FUNCTION public.refund_chat_turn_after_output_swap', fnStart));
  const guardStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.guard_ai_audit_server_verified()');
  const guard = sql.slice(guardStart, fnStart);

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
    expect(fn).toMatch(/AND a\.created_at >= v_now - interval '10 minutes'\s+AND a\.created_at <= v_now/);
    // The client-written marker is not evidence.
    expect(fn).not.toMatch(/model_used|\+swap/);
  });

  it('시각은 함수가 불린 순간의 시계로 잰다(트랜잭션 시작 시각이 아니다)', () => {
    expect(fn).toMatch(/v_now\s+timestamptz := pg_catalog\.clock_timestamp\(\);/);
    expect(fn).toMatch(/v_today date := \(v_now AT TIME ZONE 'Asia\/Seoul'\)::date;/);
    expect(fn).not.toMatch(/pg_catalog\.now\(\)|\bnow\(\)/);
  });

  it('한 줄은 한 번만 쓴다: 근거 id 가 원장의 기본 키이고, 겹치면 아무것도 돌려주지 않는다', () => {
    expect(sql).toMatch(
      /CREATE TABLE IF NOT EXISTS public\.chat_turn_refunds \(\s+audit_id\s+uuid PRIMARY KEY REFERENCES public\.ai_audit_log \(id\) ON DELETE CASCADE,/,
    );
    expect(fn).toMatch(/AND NOT EXISTS \(SELECT 1 FROM public\.chat_turn_refunds AS used WHERE used\.audit_id = a\.id\)/);
    expect(fn).toMatch(/INSERT INTO public\.chat_turn_refunds \(audit_id, day\) VALUES \(v_audit, p_day\);/);
    // Only the ledger's own primary key reads as "used already"; any other unique conflict is raised again.
    expect(fn).toMatch(
      /WHEN unique_violation THEN\s+GET STACKED DIAGNOSTICS v_hit = CONSTRAINT_NAME;\s+IF v_hit IS NOT DISTINCT FROM \(SELECT c\.conname FROM pg_catalog\.pg_constraint AS c\s+WHERE c\.conrelid = 'public\.chat_turn_refunds'::regclass AND c\.contype = 'p'\) THEN\s+RETURN NULL;\s+END IF;\s+RAISE;/,
    );
    // The mark and the count move together: the insert comes first, inside the block that can undo it.
    const block = fn.slice(fn.lastIndexOf('BEGIN'));
    expect(block.indexOf('INSERT INTO public.chat_turn_refunds')).toBeLessThan(block.indexOf('UPDATE public.chat_usage'));
    expect(block).toMatch(/IF v_count IS NULL THEN[\s\S]*?RAISE EXCEPTION 'no turn to give back' USING ERRCODE = 'ZC252';/);
    expect(block).toMatch(/WHEN SQLSTATE 'ZC252' THEN\s+RETURN NULL;/);
  });

  it('같은 사용자의 호출은 잠금으로 한 줄씩 처리하고, 잠금은 근거를 고르기 전에 잡는다', () => {
    expect(fn).toMatch(/pg_advisory_xact_lock\(\s*pg_catalog\.hashtextextended\('chat_turn_refund:' \|\| v_user::text, 0\)\)/);
    expect(fn.indexOf('pg_advisory_xact_lock')).toBeLessThan(fn.indexOf('FROM public.ai_audit_log'));
  });

  it('그날 횟수가 있을 때만 1 내리고, KST 오늘이나 어제가 아니면 아무것도 하지 않는다', () => {
    expect(fn).toMatch(/IF p_day IS NULL OR p_day NOT IN \(v_today, v_today - 1\) THEN\s+RETURN NULL;/);
    expect(fn).toMatch(/SET count = cu\.count - 1\s+WHERE cu\.user_id = v_user\s+AND cu\.day = p_day\s+AND cu\.count > 0\s+RETURNING cu\.count INTO v_count;/);
    expect(fn).not.toMatch(/ad_bonus|chat_ad_credits|usage_counters/);
  });

  it('원장 표에는 소유자 칸이 없고, 정책 없는 RLS 에 API 역할의 권한이 없다', () => {
    const table = sql.slice(sql.indexOf('CREATE TABLE IF NOT EXISTS public.chat_turn_refunds'), sql.indexOf('COMMENT ON TABLE'));
    expect(table).not.toMatch(/user_id|owner_id/);
    expect(sql).toMatch(/ALTER TABLE public\.chat_turn_refunds ENABLE ROW LEVEL SECURITY;/);
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.chat_turn_refunds FROM PUBLIC, anon, authenticated, service_role;/);
    expect(sql).not.toMatch(/CREATE POLICY/i);
    expect(sql).not.toMatch(/ALTER TABLE public\.chat_usage/);
    expect(sql).not.toMatch(/^[ \t]*(BEGIN([ \t]+(WORK|TRANSACTION))?|COMMIT([ \t]+WORK)?)[ \t]*;/im);
  });

  it('롤백은 함수와 감사 표의 트리거를 걷고 원장은 남긴다(쓴 근거가 다시 쓰이지 않게)', () => {
    const refund = down.indexOf('DROP FUNCTION IF EXISTS public.refund_chat_turn_after_output_swap(date);');
    const trigger = down.indexOf('DROP TRIGGER IF EXISTS guard_ai_audit_server_verified ON public.ai_audit_log;');
    const guardFn = down.indexOf('DROP FUNCTION IF EXISTS public.guard_ai_audit_server_verified();');
    expect(refund).toBeGreaterThanOrEqual(0);
    // The reader of the mark goes first, then the guard of the mark.
    expect(trigger).toBeGreaterThan(refund);
    expect(guardFn).toBeGreaterThan(trigger);
    expect(down).not.toMatch(/chat_turn_refunds|DROP TABLE|chat_usage/);
  });

  it('감사 표가 스스로 막는다: 로그인했거나 익명인 요청은 어느 함수를 거치든 server_verified 줄을 쓰지 못한다', () => {
    expect(guardStart).toBeGreaterThan(sql.indexOf('$shape0252$;'));
    expect(guardStart).toBeLessThan(fnStart);
    expect(guard).toMatch(/RETURNS trigger\s+LANGUAGE plpgsql\s+SET search_path = ''/);
    expect(guard).not.toMatch(/SECURITY DEFINER/);
    // Rows that are not the mark, and rows that already carry it, pass untouched.
    expect(guard).toMatch(/IF NEW\.event_source IS DISTINCT FROM 'server_verified' THEN\s+RETURN NEW;/);
    expect(guard).toMatch(/IF TG_OP = 'UPDATE' AND OLD\.event_source IS NOT DISTINCT FROM 'server_verified' THEN\s+RETURN NEW;/);
    // The request's role is read from the role setting and from the JWT claims, old and new place.
    expect(guard).toMatch(/v_role := pg_catalog\.current_setting\('role', true\);/);
    expect(guard).toMatch(/IF v_role IN \('authenticated', 'anon'\)\s+OR COALESCE\(/);
    expect(guard).toMatch(/NULLIF\(pg_catalog\.current_setting\('request\.jwt\.claim\.role', true\), ''\)/);
    expect(guard).toMatch(/NULLIF\(pg_catalog\.current_setting\('request\.jwt\.claims', true\), ''\)::jsonb ->> 'role'/);
    expect(guard).toMatch(/\) IN \('authenticated', 'anon'\) THEN\s+RAISE EXCEPTION '[^'%]+'\s+USING ERRCODE = '42501';/);
    expect(guard).not.toMatch(/service_role'\)/);
    expect(guard).toContain('REVOKE ALL ON FUNCTION public.guard_ai_audit_server_verified() FROM PUBLIC, anon, authenticated, service_role;');
    expect(guard).toMatch(
      /DROP TRIGGER IF EXISTS guard_ai_audit_server_verified ON public\.ai_audit_log;\s+CREATE TRIGGER guard_ai_audit_server_verified\s+BEFORE INSERT OR UPDATE OF event_source ON public\.ai_audit_log\s+FOR EACH ROW EXECUTE FUNCTION public\.guard_ai_audit_server_verified\(\);/,
    );
    const regression = read('db/tests/chat_turn_refund_regression.sql');
    expect(regression).toMatch(/FOREACH v_fn IN ARRAY ARRAY\['z46_wrapper', 'z46_dynamic', 'z46_merge', 'z46_promote'\] LOOP/);
    expect(regression).toMatch(/SET LOCAL request\.jwt\.claims = '\{"role":"authenticated"\}';/);
    expect(regression).toMatch(/SET LOCAL ROLE service_role;\s+SELECT public\.z46_inner_writer\(/);
  });

  it('CI 가 회귀 SQL 과 경합 세 가지를 실제로 돌린다', () => {
    const workflow = read('.github/workflows/supabase-dry-run.yml');
    expect(workflow).toMatch(
      /run: psql -X -h localhost -U postgres -v ON_ERROR_STOP=1 -f db\/tests\/chat_turn_refund_regression\.sql/,
    );
    expect(workflow).toMatch(/- name: Race two chat turn refunds over one proxy row/);
    // The races themselves follow the function 0255 put in 0252's place: no call passes a day, and the full
    // list is pinned in chat-turn-refund-bound-migration.test.ts. The step and its first race stay.
    expect(workflow).toMatch(/race same_day "BEGIN" 0 1 "a=4 b=null 4\/3\/1"/);
    expect(workflow).toMatch(/race two_rows "BEGIN" 0 2 "a=4 b=3 3\/3\/2"/);
  });

  it('이미 있는 원장 표의 모양이 다르면 함수를 만들기 전에 멈춘다', () => {
    const shape = sql.indexOf('DO $shape0252$');
    expect(shape).toBeGreaterThan(sql.indexOf('REVOKE ALL ON TABLE public.chat_turn_refunds'));
    expect(shape).toBeLessThan(sql.indexOf('CREATE OR REPLACE FUNCTION public.refund_chat_turn_after_output_swap'));
    const block = sql.slice(shape, sql.indexOf('$shape0252$;'));
    expect(block).toContain(
      "'audit_id uuid not null, day date not null, refunded_at timestamp with time zone not null default now()'",
    );
    expect(block).toMatch(/c\.relkind = 'r' AND c\.relpersistence = 'p' AND NOT c\.relispartition/);
    expect(block).toMatch(/c\.contype = 'p' AND c\.conkey = ARRAY\[v_audit\]/);
    expect(block).toMatch(
      /c\.contype = 'f' AND c\.conkey = ARRAY\[v_audit\]\s+AND c\.confrelid = 'public\.ai_audit_log'::regclass AND c\.confkey = ARRAY\[v_id\]\s+AND c\.confdeltype = 'c' AND c\.convalidated AND NOT c\.condeferrable/,
    );
    // Nothing the migration does not create may hang on the ledger.
    expect(block).toMatch(/c\.contype IN \('p', 'f', 'u', 'x', 'c', 't'\)\) <> 2/);
    expect(block).toMatch(/FROM pg_catalog\.pg_index AS i WHERE i\.indrelid = v_rel\) <> 1/);
    expect(block).toMatch(/pg_catalog\.pg_trigger AS t WHERE t\.tgrelid = v_rel AND NOT t\.tgisinternal/);
    expect(block).toMatch(/pg_catalog\.pg_rewrite AS r WHERE r\.ev_class = v_rel/);
    expect(block).toMatch(/pg_catalog\.pg_policy AS p WHERE p\.polrelid = v_rel/);
    expect(block).toMatch(/relrowsecurity/);
    expect(block.match(/RAISE EXCEPTION '0252: chat_turn_refunds[^'%]+'\s+USING ERRCODE = '55000';/g)).toHaveLength(6);
    const workflow = read('.github/workflows/supabase-dry-run.yml');
    // Applied in one transaction, and each other shape must stop at the check named beside it.
    expect(workflow).toMatch(/-v VERBOSITY=verbose --single-transaction \\\s+-f db\/migrations\/0252_chat_turn_refund\.sql/);
    expect(workflow).toMatch(/grep -q -F "55000: 0252: chat_turn_refunds\$want"/);
    expect(workflow).toMatch(/reapply_over same_table "" ""/);
    const cases = [...workflow.matchAll(/^ +reapply_over (\w+) "[^\n]*" "([^"\n]*)"$/gm)].map((m) => `${m[1]}:${m[2]}`);
    expect(cases).toEqual([
      'same_table:',
      'no_primary_key: has no primary key on audit_id alone',
      'no_audit_link:.audit_id does not follow ai_audit_log.id',
      'link_to_other_column:.audit_id does not follow ai_audit_log.id',
      'day_as_text: has other columns or defaults',
      'no_default: has other columns or defaults',
      'unlogged: is not a plain permanent table',
      'extra_unique: carries a constraint, index, trigger, rule or policy',
      'extra_trigger: carries a constraint, index, trigger, rule or policy',
      'extra_policy: carries a constraint, index, trigger, rule or policy',
    ]);
  });

  it('회귀는 클라이언트가 부를 수 있는 감사 기록 함수 둘을 다 부르고, 그 목록이 늘면 실패한다', () => {
    const regression = read('db/tests/chat_turn_refund_regression.sql');
    expect(regression).toMatch(/SELECT public\.log_ai_audit\('0a0b0c0d'/);
    expect(regression).toMatch(/SELECT public\.log_ai_audit_once\('z46-once-0001'/);
    expect(regression).toContain(
      ":'client_writers' = 'log_ai_audit(text,text,text,boolean,text,integer,text,text,text) | log_ai_audit_once(text,text,text,text,boolean,text,integer,text,text,text)'",
    );
    expect(regression).toMatch(/has_function_privilege\('authenticated', p\.oid, 'EXECUTE'\) \\gset/);
  });
});
