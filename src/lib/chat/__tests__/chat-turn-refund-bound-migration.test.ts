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

describe('0255 대화 횟수 환불을 그 턴에 묶는다 (Z46)', () => {
  const raw = read('db/migrations/0255_chat_turn_refund_bound_to_audit.sql');
  const sql = strip(raw);
  const down = read('db/migrations/rollback/0255_down.sql');
  const before = read('db/migrations/0252_chat_turn_refund.sql');
  const fn = statement(sql, 'public.refund_chat_turn_after_output_swap(p_audit_id uuid)');
  const bump = statement(sql, 'public.bump_chat_usage_for_turn(p_user_id uuid, p_day date)');
  const guard = statement(sql, 'public.guard_ai_audit_server_verified()');
  const finalGuard = statement(sql, 'public.guard_ai_audit_server_verified_final()');

  it('부르는 쪽이 넘긴 근거 줄 하나만 본다: 가장 새 줄을 고르지 않는다', () => {
    expect(fn).not.toBe('');
    expect(fn).toMatch(/WHERE a\.id = p_audit_id\s+AND a\.user_id = v_user/);
    expect(fn).toMatch(/AND a\.event_source = 'server_verified'/);
    expect(fn).toMatch(/AND a\.purpose = 'secondb_chat'/);
    expect(fn).toMatch(/AND a\.safety_zone = 'red'/);
    expect(fn).toMatch(/AND a\.created_at >= v_now - interval '10 minutes'\s+AND a\.created_at <= v_now/);
    expect(fn).toMatch(/AND a\.chat_turn_id IS NOT NULL/);
    expect(fn).toMatch(/AND NOT EXISTS \(SELECT 1 FROM public\.chat_turn_refunds AS used WHERE used\.audit_id = a\.id\);/);
    // Nothing here may choose among audit rows.
    const pick = fn.slice(fn.indexOf('FROM public.ai_audit_log'), fn.indexOf('IF v_audit IS NULL'));
    expect(pick).not.toMatch(/ORDER BY|LIMIT|FOR UPDATE|SKIP LOCKED/i);
    // The client-written marker is not evidence.
    expect(fn).not.toMatch(/model_used|\+swap/);
  });

  it('날짜는 화면에서 받지 않는다: 그 턴 번호가 적힌 본인의 줄이 센 날이다', () => {
    // No day argument at all, and no clock arithmetic on days.
    expect(sql).not.toMatch(/p_day\b[^,)]*\)\s+RETURNS int/);
    expect(fn).not.toMatch(/p_day|v_today|AT TIME ZONE|chat_turn_refund_day_matches/);
    expect(sql).not.toMatch(/chat_turn_refund_day_matches/);
    expect(fn).toMatch(
      /SELECT cu\.day\s+INTO v_day\s+FROM public\.chat_usage AS cu\s+WHERE cu\.user_id = v_user\s+AND v_turn = ANY \(cu\.refundable_turns\)\s+ORDER BY cu\.day DESC\s+LIMIT 1\s+FOR UPDATE;/,
    );
    expect(fn).toMatch(/IF v_day IS NULL THEN\s+RETURN NULL;/);
    // The row that is lowered is that row, and the turn stops waiting in the same statement.
    expect(fn).toMatch(
      /SET count = cu\.count - 1,\s+refundable_turns = pg_catalog\.array_remove\(cu\.refundable_turns, v_turn\)\s+WHERE cu\.user_id = v_user\s+AND cu\.day = v_day\s+AND v_turn = ANY \(cu\.refundable_turns\)\s+AND cu\.count > 0\s+RETURNING cu\.count INTO v_count;/,
    );
    expect(fn).toMatch(/INSERT INTO public\.chat_turn_refunds \(audit_id, day\) VALUES \(v_audit, v_day\);/);
    // The clock is read when the function is called, not when the transaction began.
    expect(fn).toMatch(/v_now\s+timestamptz := pg_catalog\.clock_timestamp\(\);/);
    expect(fn).not.toMatch(/pg_catalog\.now\(\)|\bnow\(\)/);
  });

  it('턴 번호는 서버가 만들고, 올리기는 지금의 함수가 그대로 한다', () => {
    expect(bump).toMatch(/RETURNS jsonb\s+LANGUAGE plpgsql\s+SECURITY DEFINER\s+SET search_path = ''/);
    expect(bump).toMatch(/v_turn\s+uuid := pg_catalog\.gen_random_uuid\(\);/);
    // The cap, the caller check and the limit error are the existing function's.
    expect(bump).toMatch(/v_count := public\.bump_chat_usage_if_under_cap\(p_user_id, p_day, 0\);/);
    expect(bump).not.toMatch(/v_cap|effective_subscription_tier|ad_bonus|auth\.uid/);
    expect(bump).toMatch(
      /UPDATE public\.chat_usage AS cu\s+SET refundable_turns = cu\.refundable_turns \|\| v_turn\s+WHERE cu\.user_id = p_user_id\s+AND cu\.day = p_day;\s+IF NOT FOUND THEN\s+RAISE EXCEPTION/,
    );
    expect(bump.indexOf('bump_chat_usage_if_under_cap')).toBeLessThan(bump.indexOf('UPDATE public.chat_usage'));
    expect(bump).toMatch(/RETURN pg_catalog\.jsonb_build_object\('count', v_count, 'turnId', v_turn\);/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.bump_chat_usage_for_turn\(uuid, date\) FROM PUBLIC, anon, service_role;/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.bump_chat_usage_for_turn\(uuid, date\) TO authenticated;/);
    // The existing bump is left as it is.
    expect(sql).not.toMatch(/FUNCTION public\.bump_chat_usage_if_under_cap\(/);
  });

  it('턴 하나에는 감사 줄 하나만 붙는다(유일 인덱스)이고, 그 모양을 적용 때 확인한다', () => {
    expect(sql).toMatch(/ALTER TABLE public\.chat_usage\s+ADD COLUMN IF NOT EXISTS refundable_turns uuid\[\] NOT NULL DEFAULT '\{\}'::uuid\[\];/);
    expect(sql).toMatch(/ALTER TABLE public\.ai_audit_log\s+ADD COLUMN IF NOT EXISTS chat_turn_id uuid;/);
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS ai_audit_log_chat_turn_id_key\s+ON public\.ai_audit_log \(chat_turn_id\)\s+WHERE chat_turn_id IS NOT NULL;/,
    );
    const check = sql.slice(sql.indexOf('DO $link0255$'), sql.indexOf('$link0255$;'));
    expect(sql.indexOf('DO $link0255$')).toBeGreaterThan(sql.indexOf('CREATE UNIQUE INDEX IF NOT EXISTS ai_audit_log_chat_turn_id_key'));
    expect(sql.indexOf('DO $link0255$')).toBeLessThan(sql.indexOf('CREATE OR REPLACE FUNCTION'));
    expect(check).toMatch(/a\.atttypid = 'uuid\[\]'::regtype AND a\.attnotnull/);
    expect(check).toMatch(/a\.atttypid = 'uuid'::regtype AND NOT a\.attnotnull/);
    expect(check).toMatch(
      /c\.relname = 'ai_audit_log_chat_turn_id_key'\s+AND i\.indisunique AND i\.indisvalid AND i\.indisready AND i\.indimmediate\s+AND i\.indnatts = 1 AND i\.indkey\[0\] = v_turn\s+AND i\.indexprs IS NULL\s+AND pg_catalog\.pg_get_expr\(i\.indpred, i\.indrelid\) = '\(chat_turn_id IS NOT NULL\)'/,
    );
    expect(check.match(/RAISE EXCEPTION '0255: [^'%]+'\s+USING ERRCODE = '55000';/g)).toHaveLength(2);
  });

  it('로그인한 사용자만 부르고, 누구의 횟수인지는 인자가 아니라 세션이 정한다', () => {
    expect(fn).toMatch(/RETURNS int\s+LANGUAGE plpgsql\s+SECURITY DEFINER\s+SET search_path = ''/);
    expect(fn).toMatch(/v_user\s+uuid := auth\.uid\(\);/);
    expect(fn).toMatch(/IF v_user IS NULL THEN\s+RAISE EXCEPTION 'not signed in' USING ERRCODE = '42501';/);
    expect(fn).toMatch(/IF p_audit_id IS NULL THEN\s+RETURN NULL;/);
    expect(fn).not.toMatch(/p_user/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.refund_chat_turn_after_output_swap\(uuid\) FROM PUBLIC, anon, service_role;/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.refund_chat_turn_after_output_swap\(uuid\) TO authenticated;/);
    expect(sql.match(/GRANT /g)).toHaveLength(2);
  });

  it('날짜를 받는 호출(0252 의 인자 하나짜리)은 없앤다', () => {
    const drop = sql.indexOf('DROP FUNCTION IF EXISTS public.refund_chat_turn_after_output_swap(date);');
    // After the bound call exists and is granted, so a stop before this line leaves the old call in place.
    expect(drop).toBeGreaterThan(sql.indexOf('GRANT EXECUTE ON FUNCTION public.refund_chat_turn_after_output_swap(uuid)'));
    expect(sql).not.toMatch(/FUNCTION public\.refund_chat_turn_after_output_swap\(p_day date/);
  });

  it('한 줄은 한 번만 쓰고, 그날 횟수가 있을 때만 1 내린다(0252 와 같은 방법)', () => {
    expect(fn).toMatch(/pg_advisory_xact_lock\(\s*pg_catalog\.hashtextextended\('chat_turn_refund:' \|\| v_user::text, 0\)\)/);
    expect(fn.indexOf('pg_advisory_xact_lock')).toBeLessThan(fn.indexOf('FROM public.ai_audit_log'));
    const block = fn.slice(fn.lastIndexOf('\n  BEGIN'));
    expect(block.indexOf('INSERT INTO public.chat_turn_refunds')).toBeLessThan(block.indexOf('UPDATE public.chat_usage'));
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
    expect(shape).toBeLessThan(sql.indexOf('ALTER TABLE'));
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
    expect(kept).toEqual(['event_source', 'id', 'user_id', 'purpose', 'safety_zone', 'created_at', 'chat_turn_id']);
    // One change is left alone under any role: the owner alone is cleared, as the foreign key does when
    // an account is deleted (0011). Nothing else about the row may change with it.
    expect(finalGuard).toMatch(
      /IF OLD\.event_source IS NOT DISTINCT FROM 'server_verified'\s+AND NEW\.event_source IS NOT DISTINCT FROM OLD\.event_source\s+AND NEW\.id\s+IS NOT DISTINCT FROM OLD\.id\s+AND \(NEW\.user_id\s+IS NOT DISTINCT FROM OLD\.user_id OR NEW\.user_id IS NULL\)\s+AND NEW\.purpose\s+IS NOT DISTINCT FROM OLD\.purpose\s+AND NEW\.safety_zone\s+IS NOT DISTINCT FROM OLD\.safety_zone\s+AND NEW\.created_at\s+IS NOT DISTINCT FROM OLD\.created_at\s+AND NEW\.chat_turn_id IS NOT DISTINCT FROM OLD\.chat_turn_id THEN\s+RETURN NULL;/,
    );
    expect(finalGuard.match(/NEW\.user_id IS NULL/g)).toHaveLength(1);
    expect(finalGuard.match(/RAISE EXCEPTION '[^'%]+'\s+USING ERRCODE = '42501';/g)).toHaveLength(1);
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
    const regression = read('db/tests/chat_turn_refund_regression.sql');
    expect(regression).toMatch(/DELETE FROM public\.users WHERE id = '26101346-0000-4000-8000-00000000000c';/);
    expect(regression).toMatch(/PERFORM public\.z46_retarget\('owner_gone_and_green'\);\s+RAISE EXCEPTION/);
    expect(regression).toMatch(/SET LOCAL ROLE authenticated;\s+SELECT public\.z46_retarget\('account_deleted'\);/);
  });

  it('요청의 역할을 읽는 곳 셋을 각각 따로 본다: 하나라도 로그인했다고 하면 거절한다(두 트리거 함수 모두)', () => {
    for (const body of [guard, finalGuard]) {
      expect(body).not.toBe('');
      expect(body).toMatch(/v_role := pg_catalog\.current_setting\('role', true\);/);
      expect(body).toMatch(/v_claim := NULLIF\(pg_catalog\.current_setting\('request\.jwt\.claim\.role', true\), ''\);/);
      // Text that is not JSON carries no claim, for that one place only.
      expect(body).toMatch(
        /BEGIN\s+v_claims := NULLIF\(pg_catalog\.current_setting\('request\.jwt\.claims', true\), ''\)::jsonb ->> 'role';\s+EXCEPTION WHEN invalid_text_representation THEN\s+v_claims := NULL;\s+END;/,
      );
      // None of the three is read only when another is empty.
      expect(body).not.toMatch(/IF v_claim IS NULL THEN/);
      expect(body).toMatch(
        /IF COALESCE\(v_role IN \('authenticated', 'anon'\), false\)\s+OR COALESCE\(v_claim IN \('authenticated', 'anon'\), false\)\s+OR COALESCE\(v_claims IN \('authenticated', 'anon'\), false\) THEN\s+RAISE EXCEPTION/,
      );
    }
    expect(guard).toMatch(/IF NEW\.event_source IS DISTINCT FROM 'server_verified' THEN\s+RETURN NEW;/);
    expect(guard).toMatch(/IF TG_OP = 'UPDATE' AND OLD\.event_source IS NOT DISTINCT FROM 'server_verified' THEN\s+RETURN NEW;/);
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.guard_ai_audit_server_verified() FROM PUBLIC, anon, authenticated, service_role;');
    const regression = read('db/tests/chat_turn_refund_regression.sql');
    expect(regression).toMatch(/SET LOCAL request\.jwt\.claim\.role = 'service_role';\s+DO \$mixed\$/);
    expect(regression).toMatch(/SET LOCAL request\.jwt\.claim\.role = 'anon';\s+SET LOCAL request\.jwt\.claims = '\{"role":"service_role"\}';\s+DO \$mixed2\$/);
  });

  it('있는 줄의 값은 건드리지 않고, 스스로 트랜잭션을 열거나 닫지 않는다', () => {
    expect(sql).not.toMatch(/CREATE TABLE|DROP TABLE|TRUNCATE|CREATE POLICY|DROP COLUMN|ALTER COLUMN/i);
    expect(sql.match(/ALTER TABLE [^\n]+\n\s+ADD COLUMN IF NOT EXISTS/g)).toHaveLength(2);
    expect(sql.match(/ALTER TABLE/g)).toHaveLength(2);
    expect(sql).not.toMatch(/DELETE FROM/i);
    expect(sql.match(/INSERT INTO/g)).toHaveLength(1);
    // The only rows written are inside the two functions: the day row of a turn, and the ledger.
    expect(sql.match(/UPDATE public\.\w+/g)).toEqual(['UPDATE public.chat_usage', 'UPDATE public.chat_usage']);
    expect(sql).not.toMatch(/^[ \t]*(BEGIN([ \t]+(WORK|TRANSACTION))?|COMMIT([ \t]+WORK)?)[ \t]*;/im);
  });

  it('롤백은 새 것을 걷고 0252 의 함수 둘을 글자 그대로 되돌린다', () => {
    const code = strip(down);
    const order = [
      'DROP TRIGGER IF EXISTS guard_ai_audit_server_verified_final ON public.ai_audit_log;',
      'DROP FUNCTION IF EXISTS public.guard_ai_audit_server_verified_final();',
      'DROP FUNCTION IF EXISTS public.refund_chat_turn_after_output_swap(uuid);',
      'DROP FUNCTION IF EXISTS public.bump_chat_usage_for_turn(uuid, date);',
      'DROP INDEX IF EXISTS public.ai_audit_log_chat_turn_id_key;',
      'ALTER TABLE public.ai_audit_log DROP COLUMN IF EXISTS chat_turn_id;',
      'ALTER TABLE public.chat_usage DROP COLUMN IF EXISTS refundable_turns;',
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
    expect(code).not.toMatch(/(CREATE|DROP)\s+TABLE|DELETE FROM|TRUNCATE|CREATE TRIGGER|chat_turn_refunds\s+(DROP|ADD|ALTER)/i);
  });

  it('회귀는 모든 호출에 근거 줄만 넘기고, 되돌리기는 새 것부터 한다', () => {
    const regression = read('db/tests/chat_turn_refund_regression.sql');
    const calls = regression.match(/public\.refund_chat_turn_after_output_swap\((?!uuid|date)[^\n]*/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(25);
    // Every call names a row and nothing else: a quoted id, a psql variable or NULL.
    for (const call of calls) {
      expect(call).toMatch(/^public\.refund_chat_turn_after_output_swap\(('[0-9a-f-]{36}'|:'c[12]'|NULL)\)/);
    }
    expect(regression).toContain("to_regprocedure('public.refund_chat_turn_after_output_swap(date)') IS NULL");
    // The cases the turn id brings.
    expect(regression).toMatch(/RAISE EXCEPTION 'z46 regression failed: one turn got a second audit row';\s+EXCEPTION WHEN unique_violation THEN/);
    expect(regression).toMatch(/'the turn counted yesterday lowered another day, or did not lower yesterday'/);
    expect(regression).toMatch(/FOREACH v_case IN ARRAY ARRAY\['user', 'purpose', 'zone', 'time', 'turn'\] LOOP/);
    expect(regression).toMatch(/CREATE TRIGGER z46_flip BEFORE UPDATE OF latency_ms ON public\.ai_audit_log/);
    expect(regression).toMatch(/SET LOCAL request\.jwt\.claims = 'not-json';\s+SET LOCAL ROLE service_role;\s+SELECT public\.z46_inner_writer\(/);
    expect(regression).toContain(":'turn_writers' = 'bump_chat_usage_for_turn(uuid,date) | refund_chat_turn_after_output_swap(uuid)'");
    const steps = [
      '\\ir ../migrations/rollback/0255_down.sql',
      '\\ir ../migrations/rollback/0252_down.sql',
      '\\ir ../migrations/0252_chat_turn_refund.sql',
      '\\ir ../migrations/0255_chat_turn_refund_bound_to_audit.sql',
    ].map((line) => regression.indexOf(line));
    expect(steps.every((at) => at >= 0)).toBe(true);
    expect([...steps].sort((a, b) => a - b)).toEqual(steps);
  });

  it('CI 가 경합 여섯 가지와 0255 의 다시 적용 일곱 가지를 실제로 돌린다', () => {
    const workflow = read('.github/workflows/supabase-dry-run.yml');
    // No call in the step passes a day.
    const calls = workflow.match(/public\.refund_chat_turn_after_output_swap\('[^\n]*/g) ?? [];
    expect(calls).toHaveLength(3);
    for (const call of calls) {
      expect(call).toMatch(/^public\.refund_chat_turn_after_output_swap\('\$row_[ab]'\)::text/);
    }
    expect(workflow).not.toMatch(/refund_chat_turn_after_output_swap\(\$today/);
    const races = [...workflow.matchAll(/^ +race (\w+) "([^"\n]*)" (\d) (\d) "([^"\n]*)"(?: "([^"\n]*)")?$/gm)].map((m) =>
      [m[1], m[2] === 'BEGIN' ? 'rc' : 'rr', m[3], m[4], m[5], m[6] ?? ''].join('|'),
    );
    expect(races).toEqual([
      'same_day|rc|0|1|a=4 b=null 4/3/1|',
      'same_row_rr|rr|0|1|a=4 b=ERROR:40001 4/3/1|c=null',
      'two_rows|rc|0|2|a=4 b=3 3/3/2|',
      'two_rows_rr|rr|0|2|a=4 b=ERROR:40001 4/3/1|c=3',
      'other_day|rc|1|2|a=4 b=2 4/2/2|',
      'other_day_rr|rr|1|2|a=4 b=2 4/2/2|',
    ]);
    // 0252's re-apply cases start from a database without 0255.
    expect(workflow).toMatch(
      /--single-transaction -f db\/migrations\/rollback\/0255_down\.sql\s+psql [^\n]*--single-transaction -f db\/migrations\/rollback\/0252_down\.sql/,
    );
    expect(workflow).toMatch(/-v VERBOSITY=verbose --single-transaction \\\s+-f db\/migrations\/0255_chat_turn_refund_bound_to_audit\.sql/);
    expect(workflow).toMatch(/grep -q -F "55000: 0255: \$want"/);
    const cases = [...workflow.matchAll(/^ +reapply_0255_over (\w+) "[^\n]*" "([^"\n]*)"$/gm)].map((m) => `${m[1]}:${m[2]}`);
    expect(cases).toEqual([
      'same_ledger:',
      'no_primary_key:chat_turn_refunds must have a primary key that is not deferrable',
      'deferrable_primary_key:chat_turn_refunds must have a primary key that is not deferrable',
      'deferred_primary_key:chat_turn_refunds must have a primary key that is not deferrable',
      'turns_as_text:chat_usage.refundable_turns or ai_audit_log.chat_turn_id has another type',
      'turn_index_not_unique:ai_audit_log_chat_turn_id_key is not the unique index on chat_turn_id alone',
      'turn_index_whole_table:ai_audit_log_chat_turn_id_key is not the unique index on chat_turn_id alone',
    ]);
  });
});
