import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const strip = (s: string) => s.replace(/--.*$/gm, '');
/** One `CREATE OR REPLACE FUNCTION <head>` statement, up to and including its closing `$$;`. */
const statement = (text: string, head: string) => {
  const start = text.indexOf(`CREATE OR REPLACE FUNCTION ${head}`);
  if (start < 0) return '';
  return text.slice(start, text.indexOf('\n$$;', start) + '\n$$;'.length);
};

describe('0255 대화 횟수 환불을 그 턴의 근거 줄에 묶는다 (Z46)', () => {
  const raw = read('db/migrations/0255_chat_turn_refund_bound_to_audit.sql');
  const sql = strip(raw);
  const down = read('db/migrations/rollback/0255_down.sql');
  const before = read('db/migrations/0252_chat_turn_refund.sql');
  const fn = statement(sql, 'public.refund_chat_turn_after_output_swap(p_day date, p_audit_id uuid)');
  const dayRule = statement(sql, 'public.chat_turn_refund_day_matches(p_day date, p_made timestamp)');
  const guard = statement(sql, 'public.guard_ai_audit_server_verified()');
  const finalGuard = statement(sql, 'public.guard_ai_audit_server_verified_final()');

  it('부르는 쪽이 넘긴 근거 줄 하나만 본다: 가장 새 줄을 고르지 않는다', () => {
    expect(fn).not.toBe('');
    expect(fn).toMatch(/WHERE a\.id = p_audit_id\s+AND a\.user_id = v_user/);
    expect(fn).toMatch(/AND a\.event_source = 'server_verified'/);
    expect(fn).toMatch(/AND a\.purpose = 'secondb_chat'/);
    expect(fn).toMatch(/AND a\.safety_zone = 'red'/);
    expect(fn).toMatch(/AND a\.created_at >= v_now - interval '10 minutes'\s+AND a\.created_at <= v_now/);
    expect(fn).toMatch(/AND NOT EXISTS \(SELECT 1 FROM public\.chat_turn_refunds AS used WHERE used\.audit_id = a\.id\);/);
    // 0252 picked the newest unused row of the user. Nothing here may choose among rows.
    expect(fn).not.toMatch(/ORDER BY|LIMIT|FOR UPDATE|SKIP LOCKED/i);
    // The client-written marker is not evidence.
    expect(fn).not.toMatch(/model_used|\+swap/);
  });

  it('로그인한 사용자만 부르고, 누구의 횟수인지는 인자가 아니라 세션이 정한다', () => {
    expect(fn).toMatch(/RETURNS int\s+LANGUAGE plpgsql\s+SECURITY DEFINER\s+SET search_path = ''/);
    expect(fn).toMatch(/v_user\s+uuid := auth\.uid\(\);/);
    expect(fn).toMatch(/IF v_user IS NULL THEN\s+RAISE EXCEPTION 'not signed in' USING ERRCODE = '42501';/);
    expect(fn).not.toMatch(/p_user/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.refund_chat_turn_after_output_swap\(date, uuid\) FROM PUBLIC, anon, service_role;/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.refund_chat_turn_after_output_swap\(date, uuid\) TO authenticated;/);
    expect(sql.match(/GRANT /g)).toHaveLength(1);
  });

  it('턴에 묶이지 않은 호출(인자 하나)은 없앤다', () => {
    const drop = sql.indexOf('DROP FUNCTION IF EXISTS public.refund_chat_turn_after_output_swap(date);');
    // After the bound call exists and is granted, so a stop before this line leaves the old call in place.
    expect(drop).toBeGreaterThan(sql.indexOf('GRANT EXECUTE ON FUNCTION public.refund_chat_turn_after_output_swap(date, uuid)'));
    expect(sql).not.toMatch(/FUNCTION public\.refund_chat_turn_after_output_swap\(p_day date\)/);
  });

  it('날짜는 그 줄의 KST 날짜여야 하고, 전날은 0시 10분 전에 생긴 줄에만 받는다', () => {
    expect(dayRule).toMatch(/RETURNS boolean\s+LANGUAGE sql\s+IMMUTABLE\s+SET search_path = ''/);
    expect(dayRule).toMatch(
      /SELECT p_day IS NOT NULL AND p_made IS NOT NULL\s+AND \(p_day = p_made::date\s+OR \(p_day = p_made::date - 1 AND p_made::time < time '00:10'\)\)/,
    );
    expect(sql).toContain(
      'REVOKE ALL ON FUNCTION public.chat_turn_refund_day_matches(date, timestamp) FROM PUBLIC, anon, authenticated, service_role;',
    );
    // The function hands the rule the row's own creation time on the KST clock, and asks before it writes.
    expect(fn).toMatch(/SELECT a\.id, \(a\.created_at AT TIME ZONE 'Asia\/Seoul'\)\s+INTO v_audit, v_made/);
    expect(fn).toMatch(/IF NOT public\.chat_turn_refund_day_matches\(p_day, v_made\) THEN\s+RETURN NULL;/);
    expect(fn.indexOf('chat_turn_refund_day_matches(p_day, v_made)')).toBeLessThan(fn.indexOf('INSERT INTO public.chat_turn_refunds'));
    expect(fn).toMatch(/IF p_audit_id IS NULL OR p_day IS NULL OR p_day NOT IN \(v_today, v_today - 1\) THEN\s+RETURN NULL;/);
    // The clock is read when the function is called, not when the transaction began.
    expect(fn).toMatch(/v_now\s+timestamptz := pg_catalog\.clock_timestamp\(\);/);
    expect(fn).toMatch(/v_today\s+date := \(v_now AT TIME ZONE 'Asia\/Seoul'\)::date;/);
    expect(fn).not.toMatch(/pg_catalog\.now\(\)|\bnow\(\)/);
  });

  it('한 줄은 한 번만 쓰고, 그날 횟수가 있을 때만 1 내린다(0252 와 같은 방법)', () => {
    expect(fn).toMatch(/pg_advisory_xact_lock\(\s*pg_catalog\.hashtextextended\('chat_turn_refund:' \|\| v_user::text, 0\)\)/);
    expect(fn.indexOf('pg_advisory_xact_lock')).toBeLessThan(fn.indexOf('FROM public.ai_audit_log'));
    const block = fn.slice(fn.lastIndexOf('\n  BEGIN'));
    expect(block).toMatch(/INSERT INTO public\.chat_turn_refunds \(audit_id, day\) VALUES \(v_audit, p_day\);/);
    expect(block.indexOf('INSERT INTO public.chat_turn_refunds')).toBeLessThan(block.indexOf('UPDATE public.chat_usage'));
    expect(block).toMatch(/SET count = cu\.count - 1\s+WHERE cu\.user_id = v_user\s+AND cu\.day = p_day\s+AND cu\.count > 0\s+RETURNING cu\.count INTO v_count;/);
    expect(block).toMatch(/IF v_count IS NULL THEN\s+RAISE EXCEPTION 'no turn to give back' USING ERRCODE = 'ZC252';/);
    expect(block).toMatch(
      /WHEN unique_violation THEN\s+GET STACKED DIAGNOSTICS v_hit = CONSTRAINT_NAME;\s+IF v_hit IS NOT DISTINCT FROM \(SELECT c\.conname FROM pg_catalog\.pg_constraint AS c\s+WHERE c\.conrelid = 'public\.chat_turn_refunds'::regclass AND c\.contype = 'p'\) THEN\s+RETURN NULL;\s+END IF;\s+RAISE;/,
    );
    expect(block).toMatch(/WHEN SQLSTATE 'ZC252' THEN\s+RETURN NULL;/);
    expect(fn).not.toMatch(/ad_bonus|chat_ad_credits|usage_counters/);
  });

  it('원장의 기본 키가 미룰 수 있는 꼴이면 아무것도 만들기 전에 멈춘다', () => {
    const shape = sql.indexOf('DO $shape0255$');
    expect(shape).toBeGreaterThanOrEqual(0);
    expect(shape).toBeLessThan(sql.indexOf('CREATE OR REPLACE FUNCTION'));
    const block = sql.slice(shape, sql.indexOf('$shape0255$;'));
    expect(block).toMatch(
      /IF NOT EXISTS \(SELECT 1 FROM pg_catalog\.pg_constraint AS c\s+WHERE c\.conrelid = 'public\.chat_turn_refunds'::regclass\s+AND c\.contype = 'p' AND NOT c\.condeferrable AND NOT c\.condeferred\) THEN/,
    );
    expect(block).toMatch(/RAISE EXCEPTION '0255: chat_turn_refunds must have a primary key that is not deferrable'\s+USING ERRCODE = '55000';/);
  });

  it('감사 표의 표시는 저장된 줄로도 지킨다: 로그인한 요청은 server_verified 줄을 만들지도 근거 칸을 바꾸지도 못한다', () => {
    expect(finalGuard).toMatch(/RETURNS trigger\s+LANGUAGE plpgsql\s+SET search_path = ''/);
    expect(finalGuard).not.toMatch(/SECURITY DEFINER/);
    // Every column the refund reads as evidence, and no other.
    const kept = [...finalGuard.matchAll(/NEW\.(\w+)\s+IS NOT DISTINCT FROM OLD\.\1/g)].map((m) => m[1]);
    expect(kept).toEqual(['event_source', 'id', 'user_id', 'purpose', 'safety_zone', 'created_at']);
    expect(finalGuard.match(/RAISE EXCEPTION '[^'%]+'\s+USING ERRCODE = '42501';/g)).toHaveLength(2);
    expect(finalGuard).not.toMatch(/service_role/);
    // On every INSERT and every UPDATE, whatever columns the statement names.
    expect(sql).toMatch(
      /DROP TRIGGER IF EXISTS guard_ai_audit_server_verified_final ON public\.ai_audit_log;\s+CREATE TRIGGER guard_ai_audit_server_verified_final\s+AFTER INSERT OR UPDATE ON public\.ai_audit_log\s+FOR EACH ROW EXECUTE FUNCTION public\.guard_ai_audit_server_verified_final\(\);/,
    );
    expect(sql).toContain(
      'REVOKE ALL ON FUNCTION public.guard_ai_audit_server_verified_final() FROM PUBLIC, anon, authenticated, service_role;',
    );
    // 0252's trigger stays as it was made: this file replaces the function body only.
    expect(sql).not.toMatch(/TRIGGER guard_ai_audit_server_verified\s/);
  });

  it('요청의 역할은 role 설정을 먼저 읽고, JSON 이 아닌 claims 는 주장 없음으로 본다(두 트리거 함수 모두)', () => {
    for (const body of [guard, finalGuard]) {
      expect(body).not.toBe('');
      const role = body.indexOf("v_role := pg_catalog.current_setting('role', true);");
      const claims = body.indexOf("current_setting('request.jwt.claims', true)");
      expect(role).toBeGreaterThanOrEqual(0);
      expect(claims).toBeGreaterThan(role);
      // The role alone refuses, before the claims are read at all.
      expect(body.slice(role, claims)).toMatch(/IF v_role IN \('authenticated', 'anon'\) THEN\s+RAISE EXCEPTION/);
      expect(body).toMatch(
        /BEGIN\s+v_claim := NULLIF\(pg_catalog\.current_setting\('request\.jwt\.claims', true\), ''\)::jsonb ->> 'role';\s+EXCEPTION WHEN invalid_text_representation THEN\s+v_claim := NULL;\s+END;/,
      );
      expect(body).toMatch(/v_claim := NULLIF\(pg_catalog\.current_setting\('request\.jwt\.claim\.role', true\), ''\);/);
      expect(body).toMatch(/IF v_claim IN \('authenticated', 'anon'\) THEN\s+RAISE EXCEPTION/);
    }
    expect(guard).toMatch(/IF NEW\.event_source IS DISTINCT FROM 'server_verified' THEN\s+RETURN NEW;/);
    expect(guard).toMatch(/IF TG_OP = 'UPDATE' AND OLD\.event_source IS NOT DISTINCT FROM 'server_verified' THEN\s+RETURN NEW;/);
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.guard_ai_audit_server_verified() FROM PUBLIC, anon, authenticated, service_role;');
  });

  it('표와 이미 쓴 줄은 건드리지 않고, 스스로 트랜잭션을 열거나 닫지 않는다', () => {
    expect(sql).not.toMatch(/CREATE TABLE|ALTER TABLE|DROP TABLE|TRUNCATE|CREATE POLICY|CREATE INDEX/i);
    expect(sql).not.toMatch(/DELETE FROM/i);
    expect(sql.match(/INSERT INTO/g)).toHaveLength(1);
    expect(sql.match(/UPDATE public\.\w+/g)).toEqual(['UPDATE public.chat_usage']);
    expect(sql).not.toMatch(/^[ \t]*(BEGIN([ \t]+(WORK|TRANSACTION))?|COMMIT([ \t]+WORK)?)[ \t]*;/im);
  });

  it('롤백은 새 것을 걷고 0252 의 함수 둘을 글자 그대로 되돌린다', () => {
    const code = strip(down);
    const order = [
      'DROP TRIGGER IF EXISTS guard_ai_audit_server_verified_final ON public.ai_audit_log;',
      'DROP FUNCTION IF EXISTS public.guard_ai_audit_server_verified_final();',
      'DROP FUNCTION IF EXISTS public.refund_chat_turn_after_output_swap(date, uuid);',
      'DROP FUNCTION IF EXISTS public.chat_turn_refund_day_matches(date, timestamp);',
      'CREATE OR REPLACE FUNCTION public.guard_ai_audit_server_verified()',
      'CREATE OR REPLACE FUNCTION public.refund_chat_turn_after_output_swap(p_day date)',
    ].map((line) => code.indexOf(line));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // The two bodies are 0252's, comments and all.
    for (const head of ['public.guard_ai_audit_server_verified()', 'public.refund_chat_turn_after_output_swap(p_day date)']) {
      const original = statement(before, head);
      expect(original.length).toBeGreaterThan(400);
      expect(down).toContain(original);
    }
    expect(code).toContain('REVOKE ALL ON FUNCTION public.guard_ai_audit_server_verified() FROM PUBLIC, anon, authenticated, service_role;');
    expect(code).toContain('REVOKE ALL ON FUNCTION public.refund_chat_turn_after_output_swap(date) FROM PUBLIC, anon, service_role;');
    expect(code).toContain('GRANT EXECUTE ON FUNCTION public.refund_chat_turn_after_output_swap(date) TO authenticated;');
    // The ledger and the rows already used stay, and 0252's trigger is not made a second time.
    expect(code).not.toMatch(/(CREATE|ALTER|DROP)\s+TABLE|DELETE FROM|TRUNCATE|CREATE TRIGGER/i);
  });

  it('회귀는 모든 호출에 근거 줄을 넘기고, 되돌리기는 새 것부터 한다', () => {
    const regression = read('db/tests/chat_turn_refund_regression.sql');
    const calls = regression.match(/public\.refund_chat_turn_after_output_swap\((?!date)[^\n]*/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(25);
    // Every call names a day and a row: a quoted id, a psql variable or NULL.
    for (const call of calls) {
      expect(call).toMatch(/^public\.refund_chat_turn_after_output_swap\((NULL|:'today'::date( [-+] \d)?|\(pg_catalog\.now\(\) AT TIME ZONE 'Asia\/Seoul'\)::date), ('[0-9a-f-]{36}'|:'c[12]'|NULL)\)/);
    }
    expect(regression).toContain("to_regprocedure('public.refund_chat_turn_after_output_swap(date)') IS NULL");
    // The cases 0255 adds.
    expect(regression).toMatch(/CREATE TRIGGER z46_flip BEFORE UPDATE OF latency_ms ON public\.ai_audit_log/);
    expect(regression).toMatch(/FOREACH v_case IN ARRAY ARRAY\['user', 'purpose', 'zone', 'time'\] LOOP/);
    expect(regression).toMatch(/SET LOCAL request\.jwt\.claims = 'not-json';\s+SET LOCAL ROLE service_role;\s+SELECT public\.z46_inner_writer\(/);
    expect(regression).toMatch(/NOT public\.chat_turn_refund_day_matches\(DATE '2026-10-13', TIMESTAMP '2026-10-14 00:10:00'\)/);
    expect(regression).toMatch(/public\.chat_turn_refund_day_matches\(DATE '2026-10-13', TIMESTAMP '2026-10-14 00:09:59\.999'\)/);
    const steps = [
      '\\ir ../migrations/rollback/0255_down.sql',
      '\\ir ../migrations/rollback/0252_down.sql',
      '\\ir ../migrations/0252_chat_turn_refund.sql',
      '\\ir ../migrations/0255_chat_turn_refund_bound_to_audit.sql',
    ].map((line) => regression.indexOf(line));
    expect(steps.every((at) => at >= 0)).toBe(true);
    expect([...steps].sort((a, b) => a - b)).toEqual(steps);
  });

  it('CI 가 경합 다섯 가지와 0255 의 다시 적용 네 가지를 실제로 돌린다', () => {
    const workflow = read('.github/workflows/supabase-dry-run.yml');
    // No call in the step is left without a row.
    const calls = workflow.match(/public\.refund_chat_turn_after_output_swap\(\$today[^\n]*/g) ?? [];
    expect(calls).toHaveLength(3);
    for (const call of calls) {
      expect(call).toMatch(/^public\.refund_chat_turn_after_output_swap\(\$today( - \$offset)?, '\$row_[ab]'\)/);
    }
    const races = [...workflow.matchAll(/^ +race (\w+) "([^"\n]*)" (\d) (\d) "([^"\n]*)"(?: "([^"\n]*)")?$/gm)].map((m) =>
      [m[1], m[2] === 'BEGIN' ? 'rc' : 'rr', m[3], m[4], m[5], m[6] ?? ''].join('|'),
    );
    expect(races).toEqual([
      'same_day|rc|0|1|a=4 b=null 4/3/1|',
      'same_row_rr|rr|0|1|a=4 b=null 4/3/1|',
      'cross_day|rr|1|1|a=4 b=null 4/3/1|',
      'two_rows|rc|0|2|a=4 b=3 3/3/2|',
      'two_rows_rr|rr|0|2|a=4 b=ERROR:40001 4/3/1|c=3',
    ]);
    // 0252's re-apply cases start from a database without 0255.
    expect(workflow).toMatch(
      /--single-transaction -f db\/migrations\/rollback\/0255_down\.sql\s+psql [^\n]*--single-transaction -f db\/migrations\/rollback\/0252_down\.sql/,
    );
    expect(workflow).toMatch(/-v VERBOSITY=verbose --single-transaction \\\s+-f db\/migrations\/0255_chat_turn_refund_bound_to_audit\.sql/);
    expect(workflow).toMatch(/grep -q -F "55000: 0255: chat_turn_refunds\$want"/);
    const cases = [...workflow.matchAll(/^ +reapply_0255_over (\w+) "[^\n]*" "([^"\n]*)"$/gm)].map((m) => `${m[1]}:${m[2]}`);
    expect(cases).toEqual([
      'same_ledger:',
      'no_primary_key: must have a primary key that is not deferrable',
      'deferrable_primary_key: must have a primary key that is not deferrable',
      'deferred_primary_key: must have a primary key that is not deferrable',
    ]);
  });
});
