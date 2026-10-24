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
const TOP_LEVEL_TRANSACTION = /^[ \t]*(BEGIN([ \t]+(WORK|TRANSACTION))?|COMMIT([ \t]+WORK)?)[ \t]*;/im;

describe('0255 대화 횟수 환불을 그 턴의 예약에 묶는다 (Z46)', () => {
  const raw = read('db/migrations/0255_chat_turn_refund_bound_to_audit.sql');
  const sql = strip(raw);
  const down = read('db/migrations/rollback/0255_down.sql');
  const before = read('db/migrations/0252_chat_turn_refund.sql');
  const fn = statement(sql, 'public.refund_chat_turn_after_output_swap(p_audit_id uuid)');
  const bump = statement(sql, 'public.bump_chat_usage_for_turn(p_user_id uuid, p_day date)');
  const claim = statement(sql, 'public.claim_chat_turn_for_audit(p_user_id uuid, p_audit_id uuid, p_turn_id uuid)');
  const attempt = statement(sql, 'public.begin_chat_turn_attempt(p_user_id uuid, p_audit_id uuid, p_turn_id uuid)');
  const guard = statement(sql, 'public.guard_ai_audit_server_verified()');
  const finalGuard = statement(sql, 'public.guard_ai_audit_server_verified_final()');

  it('예약 표: 서버가 만드는 번호 · 주인 · 센 날 · 상태 · 묶인 답. 앱의 어떤 역할도 직접 못 건드린다', () => {
    const table = sql.slice(sql.indexOf('CREATE TABLE IF NOT EXISTS public.chat_turn_reservations ('), sql.indexOf('COMMENT ON TABLE public.chat_turn_reservations'));
    expect(table).toMatch(/turn_id\s+uuid\s+NOT NULL DEFAULT gen_random_uuid\(\),/);
    expect(table).toMatch(/user_id\s+uuid\s+NOT NULL,/);
    expect(table).toMatch(/counted_day date\s+NOT NULL,/);
    expect(table).toMatch(/issued_at\s+timestamptz NOT NULL DEFAULT now\(\),/);
    expect(table).toMatch(/state\s+text\s+NOT NULL DEFAULT 'counted',/);
    expect(table).toMatch(/audit_id\s+uuid,/);
    // round 8: the attempts of the turn (how many began, their audit ids in the order they reached the server, when the latest was recorded)
    expect(table).toMatch(/attempts\s+smallint\s+NOT NULL DEFAULT 0,\s+attempt1_audit_id uuid,\s+attempt2_audit_id uuid,\s+attempted_at timestamptz,/);
    expect(table).not.toMatch(/pending_audit_id|attempt_started_at/);
    expect(table).not.toMatch(/rebound/);
    expect(table).toContain('CONSTRAINT chat_turn_reservations_pkey PRIMARY KEY (turn_id),');
    // one answer, one reservation
    expect(table).toContain('CONSTRAINT chat_turn_reservations_audit_id_key UNIQUE (audit_id),');
    // goes with the account
    expect(table).toContain('CONSTRAINT chat_turn_reservations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users (id) ON DELETE CASCADE,');
    expect(table).toContain("CONSTRAINT chat_turn_reservations_state_check CHECK (state IN ('counted', 'answered', 'refunded')),");
    // an answer is there exactly when the state says so
    expect(table).toContain("CONSTRAINT chat_turn_reservations_answer_check CHECK ((state = 'counted') = (audit_id IS NULL))");
    expect(table).not.toMatch(/DEFERRABLE/i);
    expect(sql).toContain('ALTER TABLE public.chat_turn_reservations ENABLE ROW LEVEL SECURITY;');
    expect(sql).toContain('REVOKE ALL ON TABLE public.chat_turn_reservations FROM PUBLIC, anon, authenticated, service_role;');
    expect(sql).not.toMatch(/CREATE POLICY/i);
    expect(sql).not.toMatch(/GRANT [^;]*ON (TABLE )?public\.chat_turn_reservations/i);
    // nothing is added to the audit table or to chat_usage
    expect(sql).not.toMatch(/ALTER TABLE public\.(ai_audit_log|chat_usage)\b/);
    expect(sql).not.toMatch(/chat_turn_id|refundable_turns/);
    expect(sql).not.toMatch(/CREATE (UNIQUE )?INDEX[^;]*ON public\.ai_audit_log/i);
  });

  it('이미 있는 표의 모양을 적용 때 확인한다: 원장의 기본 키와 예약 표의 열 · 키 · 외래 키 · 검사 · 덤 · 열림', () => {
    const ledger = sql.slice(sql.indexOf('DO $shape0255$'), sql.indexOf('$shape0255$;'));
    expect(sql.indexOf('DO $shape0255$')).toBeLessThan(sql.indexOf('CREATE TABLE'));
    expect(ledger).toMatch(/ON a\.attrelid = c\.conrelid AND a\.attname = 'audit_id' AND NOT a\.attisdropped/);
    expect(ledger).toMatch(/AND c\.contype = 'p' AND NOT c\.condeferrable AND NOT c\.condeferred\s+AND c\.conkey = ARRAY\[a\.attnum\]\) THEN/);
    expect(ledger).toMatch(/RAISE EXCEPTION '0255: chat_turn_refunds must have a primary key on audit_id alone that is not deferrable'\s+USING ERRCODE = '55000';/);
    const start = sql.indexOf('DO $table0255$');
    const check = sql.slice(start, sql.indexOf('$table0255$;'));
    // after the table, the index, the row security switch and the revoke; before any function
    expect(start).toBeGreaterThan(sql.indexOf('REVOKE ALL ON TABLE public.chat_turn_reservations'));
    expect(start).toBeLessThan(sql.indexOf('CREATE OR REPLACE FUNCTION'));
    expect(check).toMatch(/c\.relkind = 'r' AND c\.relpersistence = 'p' AND c\.relrowsecurity\s+AND NOT c\.relispartition\)/);
    expect(check).toMatch(/OR EXISTS \(SELECT 1 FROM pg_catalog\.pg_inherits AS i WHERE i\.inhrelid = v_rel OR i\.inhparent = v_rel\) THEN/);
    // a generated or identity column is another column
    expect(check).toMatch(/\|\| CASE WHEN a\.attgenerated <> '' OR a\.attidentity <> '' THEN ':generated' ELSE '' END,/);
    expect(check).toContain(
      "'turn_id:uuid:t:gen_random_uuid()|user_id:uuid:t:-|counted_day:date:t:-|issued_at:timestamp with time zone:t:now()'",
    );
    expect(check).toContain("|| '|state:text:t:''counted''::text|audit_id:uuid:f:-|answered_at:timestamp with time zone:f:-'");
    expect(check).toContain("|| '|refunded_at:timestamp with time zone:f:-|attempts:smallint:t:0|attempt1_audit_id:uuid:f:-'");
    expect(check).toContain("|| '|attempt2_audit_id:uuid:f:-|attempted_at:timestamp with time zone:f:-';");
    expect(check).toMatch(/IF v_cols IS DISTINCT FROM v_want THEN/);
    expect(check).toMatch(/\(\(c\.contype = 'p' AND a\.attname = 'turn_id'\) OR \(c\.contype = 'u' AND a\.attname = 'audit_id'\)\)\) <> 2 THEN/);
    expect(check).toMatch(/c\.contype = 'f' AND c\.confrelid = 'public\.users'::regclass\s+AND c\.conkey = ARRAY\[a\.attnum\] AND c\.confkey = ARRAY\[p\.attnum\]\s+AND c\.confdeltype = 'c' AND c\.convalidated AND NOT c\.condeferrable\s+AND pg_catalog\.to_jsonb\(c\) ->> 'conenforced' IS DISTINCT FROM 'false'\) THEN/);
    // the two checks by name AND by definition: a check of another meaning under the same name does not count
    expect(check).toContain("AND (c.conname::text, pg_catalog.pg_get_constraintdef(c.oid)) IN (");
    expect(check).toContain("'CHECK ((state = ANY (ARRAY[''counted''::text, ''answered''::text, ''refunded''::text])))'),");
    expect(check).toContain("'CHECK (((state = ''counted''::text) = (audit_id IS NULL)))'))) <> 2 THEN");
    // nothing else on the table: five constraints, three indexes (the lookup index by its columns), no trigger, no rule
    expect(check).toMatch(/c\.contype IN \('p', 'f', 'u', 'x', 'c', 't'\)\) <> 5\s+OR \(SELECT pg_catalog\.count\(\*\) FROM pg_catalog\.pg_index AS i WHERE i\.indrelid = v_rel\) <> 3/);
    expect(check).toMatch(/ic\.relname = 'chat_turn_reservations_user_issued_idx'\s+AND NOT i\.indisunique AND i\.indisvalid AND i\.indisready\s+AND i\.indpred IS NULL AND i\.indexprs IS NULL\s+AND i\.indnatts = 2 AND i\.indnkeyatts = 2 AND i\.indkey\[0\] = u\.attnum AND i\.indkey\[1\] = t\.attnum\s+AND ic\.relam = \(SELECT am\.oid FROM pg_catalog\.pg_am AS am WHERE am\.amname = 'btree'\)\)/);
    expect(check).toMatch(/OR EXISTS \(SELECT 1 FROM pg_catalog\.pg_trigger AS t WHERE t\.tgrelid = v_rel AND NOT t\.tgisinternal\)\s+OR EXISTS \(SELECT 1 FROM pg_catalog\.pg_rewrite AS r WHERE r\.ev_class = v_rel\) THEN/);
    expect(check).toMatch(/has_table_privilege\('anon', v_rel, 'SELECT, INSERT, UPDATE, DELETE'\)\s+OR pg_catalog\.has_table_privilege\('authenticated', v_rel, 'SELECT, INSERT, UPDATE, DELETE'\)\s+OR pg_catalog\.has_table_privilege\('service_role', v_rel, 'SELECT, INSERT, UPDATE, DELETE'\)\s+OR EXISTS \(SELECT 1 FROM pg_catalog\.pg_policy AS pol WHERE pol\.polrelid = v_rel\) THEN/);
    expect(check.match(/RAISE EXCEPTION '0255: [^']+'[^;]*USING ERRCODE = '55000';/g)).toHaveLength(7);
  });

  it('올리기는 지금의 함수가 그대로 하고, 서버가 예약 줄을 만든다. 본인의 앞선 답 없는 줄과 이틀 지난 줄은 여기서 지운다', () => {
    expect(bump).toMatch(/RETURNS jsonb\s+LANGUAGE plpgsql\s+SECURITY DEFINER\s+SET search_path = ''/);
    // The cap, the caller check and the limit error are the existing function's.
    expect(bump).toMatch(/v_count := public\.bump_chat_usage_if_under_cap\(p_user_id, p_day, 0\);/);
    expect(bump).not.toMatch(/v_cap|effective_subscription_tier|ad_bonus|auth\.uid/);
    // round 6: stamped with the clock, so that "the user's latest turn" reads the same inside one transaction
    expect(bump).toMatch(
      /INSERT INTO public\.chat_turn_reservations \(user_id, counted_day, issued_at\)\s+VALUES \(p_user_id, p_day, pg_catalog\.clock_timestamp\(\)\)\s+RETURNING turn_id INTO v_turn;/,
    );
    // the id is the table's own default: the function never takes one from the caller or makes one itself
    expect(bump).not.toMatch(/gen_random_uuid|p_turn/);
    // round 4: an answer can only be bound to the user's latest counted turn, so a bump closes the earlier ones
    expect(bump).toMatch(
      /DELETE FROM public\.chat_turn_reservations AS r\s+WHERE r\.user_id = p_user_id\s+AND \(r\.state = 'counted'\s+OR r\.issued_at < pg_catalog\.clock_timestamp\(\) - interval '2 days'\);/,
    );
    // one bump at a time per user, so that delete sees every reservation an earlier bump made
    expect(bump).toMatch(/PERFORM pg_catalog\.pg_advisory_xact_lock\(\s*pg_catalog\.hashtextextended\('chat_turn_bump:' \|\| p_user_id::text, 0\)\);/);
    // round 7: the per-user lock comes first, before the existing bump touches chat_usage (R2438-22)
    const order = [bump.indexOf('pg_advisory_xact_lock'), bump.indexOf('bump_chat_usage_if_under_cap'), bump.indexOf('DELETE FROM public.chat_turn_reservations'), bump.indexOf('INSERT INTO public.chat_turn_reservations')];
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(bump).toMatch(/RETURN pg_catalog\.jsonb_build_object\('count', v_count, 'turnId', v_turn\);/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.bump_chat_usage_for_turn\(uuid, date\) FROM PUBLIC, anon, service_role;/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.bump_chat_usage_for_turn\(uuid, date\) TO authenticated;/);
    // The existing bump is left as it is.
    expect(sql).not.toMatch(/FUNCTION public\.bump_chat_usage_if_under_cap\(/);
  });

  it('묶기: 프록시만 묻고, 앱이 보낸 번호는 서버의 줄로 확인한다(주인 · 아직 답 없음 · 5분 안 · 방금 쓴 그 사용자의 대화 줄)', () => {
    expect(claim).toMatch(/RETURNS boolean\s+LANGUAGE plpgsql\s+SECURITY DEFINER\s+SET search_path = ''/);
    expect(claim).toMatch(/IF p_user_id IS NULL OR p_audit_id IS NULL OR p_turn_id IS NULL THEN\s+RETURN false;/);
    // the answer: this user's row, written by a proxy for chat, within sixty seconds
    expect(claim).toMatch(
      /IF NOT EXISTS \(SELECT 1\s+FROM public\.ai_audit_log AS a\s+WHERE a\.id = p_audit_id\s+AND a\.user_id = p_user_id\s+AND a\.event_source = 'server_verified'\s+AND a\.purpose = 'secondb_chat'\s+AND a\.created_at >= v_now - interval '60 seconds'\s+AND a\.created_at <= v_now\) THEN\s+RETURN false;/,
    );
    // the reservation: one statement decides and writes. This row must be one of the reservation's recorded attempts,
    // the latest recorded in the last five minutes; not answered yet (either attempt), or answered by the first
    // attempt's row while this is the second's (the re-ask). Never the first over the second (round 8).
    expect(claim).toMatch(
      /UPDATE public\.chat_turn_reservations AS r\s+SET state = 'answered',\s+audit_id = p_audit_id,\s+answered_at = v_now\s+WHERE r\.turn_id = p_turn_id\s+AND r\.user_id = p_user_id\s+AND \(r\.attempt1_audit_id = p_audit_id OR r\.attempt2_audit_id = p_audit_id\)\s+AND r\.attempted_at >= v_now - interval '5 minutes'\s+AND r\.attempted_at <= v_now\s+AND \(\(r\.state = 'counted' AND r\.audit_id IS NULL\)\s+OR \(r\.state = 'answered' AND r\.audit_id = r\.attempt1_audit_id AND r\.attempt2_audit_id = p_audit_id\)\)\s+RETURNING r\.turn_id INTO v_done;/,
    );
    expect(claim).not.toMatch(/pending_audit_id|IS DISTINCT FROM p_audit_id/);
    // nothing given back is ever bound again, and the reservation's own age is not the window any more
    expect(claim).not.toMatch(/'refunded'|issued_at|rebound/);
    expect(claim.match(/UPDATE /g)).toHaveLength(1);
    expect(claim).not.toMatch(/INSERT INTO|DELETE FROM|chat_usage|chat_turn_refunds/);
    // an answer that already has a reservation takes no second one
    expect(claim).toMatch(/EXCEPTION\s+WHEN unique_violation THEN\s+RETURN false;/);
    expect(claim).toMatch(/RETURN v_done IS NOT NULL;/);
    // who is asking is not read from the session: the proxy passes the user of the token it verified
    expect(claim).not.toMatch(/auth\.uid|safety_zone/);
    expect(claim).toMatch(/v_now\s+timestamptz := pg_catalog\.clock_timestamp\(\);/);
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.claim_chat_turn_for_audit(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.claim_chat_turn_for_audit(uuid, uuid, uuid) TO service_role;');
  });

  it('환불은 부르는 쪽이 넘긴 근거 줄 하나만 본다: 가장 새 줄을 고르지 않는다', () => {
    expect(fn).not.toBe('');
    expect(fn).toMatch(/WHERE a\.id = p_audit_id\s+AND a\.user_id = v_user/);
    expect(fn).toMatch(/AND a\.event_source = 'server_verified'/);
    expect(fn).toMatch(/AND a\.purpose = 'secondb_chat'/);
    expect(fn).toMatch(/AND a\.safety_zone = 'red'/);
    expect(fn).toMatch(/AND a\.created_at >= v_now - interval '10 minutes'\s+AND a\.created_at <= v_now/);
    expect(fn).toMatch(/AND NOT EXISTS \(SELECT 1 FROM public\.chat_turn_refunds AS used WHERE used\.audit_id = a\.id\);/);
    // Nothing here may choose among audit rows.
    const pick = fn.slice(fn.indexOf('FROM public.ai_audit_log'), fn.indexOf('IF v_audit IS NULL'));
    expect(pick).not.toMatch(/ORDER BY|LIMIT|FOR UPDATE|SKIP LOCKED/i);
    // The client-written marker is not evidence.
    expect(fn).not.toMatch(/model_used|\+swap/);
  });

  it('날짜도 턴 번호도 화면에서 받지 않는다: 그 답이 묶인 본인의 예약이 센 날이다', () => {
    // No day argument at all, and no clock arithmetic on days.
    expect(sql).not.toMatch(/p_day\b[^,)]*\)\s+RETURNS int/);
    expect(fn).not.toMatch(/p_day|p_turn|v_today|AT TIME ZONE/);
    expect(fn).toMatch(
      /SELECT r\.turn_id, r\.counted_day\s+INTO v_turn, v_day\s+FROM public\.chat_turn_reservations AS r\s+WHERE r\.audit_id = v_audit\s+AND r\.user_id = v_user\s+AND r\.state = 'answered'\s+FOR UPDATE;/,
    );
    // that lookup finds at most one row (audit_id is unique), so nothing is chosen
    const lookup = fn.slice(fn.indexOf('FROM public.chat_turn_reservations AS r'), fn.indexOf('IF v_turn IS NULL'));
    expect(lookup).not.toMatch(/ORDER BY|LIMIT/i);
    expect(fn).toMatch(/IF v_turn IS NULL THEN\s+RETURN NULL;/);
    expect(fn).toMatch(/INSERT INTO public\.chat_turn_refunds \(audit_id, day\) VALUES \(v_audit, v_day\);/);
    // the day row that is lowered is that reservation's, and the reservation is closed with it
    expect(fn).toMatch(
      /UPDATE public\.chat_usage AS cu\s+SET count = cu\.count - 1\s+WHERE cu\.user_id = v_user\s+AND cu\.day = v_day\s+AND cu\.count > 0\s+RETURNING cu\.count INTO v_count;/,
    );
    expect(fn).toMatch(
      /UPDATE public\.chat_turn_reservations AS r\s+SET state = 'refunded',\s+refunded_at = v_now\s+WHERE r\.turn_id = v_turn\s+AND r\.state = 'answered';/,
    );
    // The clock is read when the function is called, not when the transaction began.
    expect(fn).toMatch(/v_now\s+timestamptz := pg_catalog\.clock_timestamp\(\);/);
    expect(fn).not.toMatch(/pg_catalog\.now\(\)|\bnow\(\)/);
  });

  it('시도: 모델을 부르기 전에 프록시만 적고, 첫 시도는 아직 시도 없는 답 없는 턴에, 다시 묻기는 그 사람의 가장 최근 턴에 한 번', () => {
    expect(attempt).toMatch(/RETURNS boolean\s+LANGUAGE plpgsql\s+SECURITY DEFINER\s+SET search_path = ''/);
    expect(attempt).toMatch(/IF p_user_id IS NULL OR p_audit_id IS NULL OR p_turn_id IS NULL THEN\s+RETURN false;/);
    // round 8: no clock of a proxy; the clock is read after the lock only to stamp the attempt
    expect(attempt).toMatch(/v_now := pg_catalog\.clock_timestamp\(\);\s+UPDATE public\.chat_turn_reservations AS r/);
    expect(attempt.indexOf('pg_advisory_xact_lock')).toBeLessThan(attempt.indexOf('v_now := pg_catalog.clock_timestamp();'));
    expect(attempt).not.toMatch(/v_now\s+timestamptz := |p_started_at|attempt_started_at|interval/);
    // in line with the bump: the same per-user lock, so "latest" cannot move under it
    expect(attempt).toMatch(/PERFORM pg_catalog\.pg_advisory_xact_lock\(\s*pg_catalog\.hashtextextended\('chat_turn_bump:' \|\| p_user_id::text, 0\)\);/);
    // numbered in the order they reach the server: the first slot, then the second; never the same row twice
    expect(attempt).toMatch(
      /UPDATE public\.chat_turn_reservations AS r\s+SET attempts = r\.attempts \+ 1,\s+attempt1_audit_id = CASE WHEN r\.attempts = 0 THEN p_audit_id ELSE r\.attempt1_audit_id END,\s+attempt2_audit_id = CASE WHEN r\.attempts = 1 THEN p_audit_id ELSE r\.attempt2_audit_id END,\s+attempted_at = v_now\s+WHERE r\.turn_id = p_turn_id\s+AND r\.user_id = p_user_id\s+AND r\.issued_at <= v_now\s+AND \(\(r\.attempts = 0 AND r\.state = 'counted'\)\s+OR \(r\.attempts = 1 AND r\.state IN \('counted', 'answered'\)\s+AND r\.attempt1_audit_id IS DISTINCT FROM p_audit_id\s+AND NOT EXISTS \(SELECT 1\s+FROM public\.chat_turn_reservations AS n\s+WHERE n\.user_id = r\.user_id\s+AND n\.turn_id <> r\.turn_id\s+AND n\.issued_at >= r\.issued_at\)\)\)\s+RETURNING r\.turn_id INTO v_done;/,
    );
    expect(attempt.indexOf('pg_advisory_xact_lock')).toBeLessThan(attempt.indexOf('UPDATE public.chat_turn_reservations'));
    expect(attempt.match(/UPDATE /g)).toHaveLength(1);
    expect(attempt).not.toMatch(/INSERT INTO|DELETE FROM|chat_usage|chat_turn_refunds|ai_audit_log|'refunded'/);
    expect(attempt).toMatch(/RETURN v_done IS NOT NULL;/);
    // the proxy's alone
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.begin_chat_turn_attempt(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.begin_chat_turn_attempt(uuid, uuid, uuid) TO service_role;');
    // before the claim in the file, and both after the bump
    expect(sql.indexOf(attempt)).toBeLessThan(sql.indexOf(claim));
    expect(sql.indexOf(bump)).toBeLessThan(sql.indexOf(attempt));
  });

  it('로그인한 사용자만 부르고, 누구의 횟수인지는 인자가 아니라 세션이 정한다', () => {
    expect(fn).toMatch(/RETURNS int\s+LANGUAGE plpgsql\s+SECURITY DEFINER\s+SET search_path = ''/);
    expect(fn).toMatch(/v_user\s+uuid := auth\.uid\(\);/);
    expect(fn).toMatch(/IF v_user IS NULL THEN\s+RAISE EXCEPTION 'not signed in' USING ERRCODE = '42501';/);
    expect(fn).toMatch(/IF p_audit_id IS NULL THEN\s+RETURN NULL;/);
    expect(fn).not.toMatch(/p_user/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.refund_chat_turn_after_output_swap\(uuid\) FROM PUBLIC, anon, service_role;/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.refund_chat_turn_after_output_swap\(uuid\) TO authenticated;/);
    // three grants in all: the bump and the refund to signed-in users, the claim to the proxy
    expect(sql.match(/GRANT /g)).toHaveLength(4);
  });

  it('날짜를 받는 호출(0252 의 인자 하나짜리)은 없앤다', () => {
    const drop = sql.indexOf('DROP FUNCTION IF EXISTS public.refund_chat_turn_after_output_swap(date);');
    // After the bound call exists and is granted, so a stop before this line leaves the old call in place.
    expect(drop).toBeGreaterThan(sql.indexOf('GRANT EXECUTE ON FUNCTION public.refund_chat_turn_after_output_swap(uuid)'));
    expect(sql).not.toMatch(/FUNCTION public\.refund_chat_turn_after_output_swap\(p_day date/);
  });

  it('한 줄은 한 번만 쓰고, 그날 횟수가 있을 때만 1 내린다(0252 와 같은 방법)', () => {
    // round 7: the bump's and the attempt's per-user lock, taken before any row (R2438-22)
    expect(fn).toMatch(/pg_advisory_xact_lock\(\s*pg_catalog\.hashtextextended\('chat_turn_bump:' \|\| v_user::text, 0\)\)/);
    expect(fn).not.toMatch(/chat_turn_refund:/);
    expect(fn.indexOf('pg_advisory_xact_lock')).toBeLessThan(fn.indexOf('FROM public.ai_audit_log'));
    expect(fn.indexOf('pg_advisory_xact_lock')).toBeLessThan(fn.indexOf('FROM public.ai_audit_log'));
    const block = fn.slice(fn.lastIndexOf('\n  BEGIN'));
    const order = [
      block.indexOf('INSERT INTO public.chat_turn_refunds'),
      block.indexOf('UPDATE public.chat_usage'),
      block.indexOf("RAISE EXCEPTION 'no turn to give back'"),
      block.indexOf('UPDATE public.chat_turn_reservations'),
    ];
    expect(order.every((at) => at >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(block).toMatch(/IF v_count IS NULL THEN\s+RAISE EXCEPTION 'no turn to give back' USING ERRCODE = 'ZC252';/);
    expect(block).toMatch(
      /WHEN unique_violation THEN\s+GET STACKED DIAGNOSTICS v_hit = CONSTRAINT_NAME;\s+IF v_hit IS NOT DISTINCT FROM \(SELECT c\.conname FROM pg_catalog\.pg_constraint AS c\s+WHERE c\.conrelid = 'public\.chat_turn_refunds'::regclass AND c\.contype = 'p'\) THEN\s+RETURN NULL;\s+END IF;\s+RAISE;/,
    );
    expect(block).toMatch(/WHEN SQLSTATE 'ZC252' THEN\s+RETURN NULL;/);
    expect(fn).not.toMatch(/ad_bonus|chat_ad_credits|usage_counters/);
  });

  it('감사 표의 표시는 저장된 줄로도 지킨다: 로그인한 요청은 server_verified 줄을 만들지도 근거 칸을 바꾸지도 못한다', () => {
    expect(finalGuard).toMatch(/RETURNS trigger\s+LANGUAGE plpgsql\s+SET search_path = ''/);
    expect(finalGuard).not.toMatch(/SECURITY DEFINER/);
    // Every column the claim and the refund read as evidence, and no other.
    const kept = [...finalGuard.matchAll(/NEW\.(\w+)\s+IS NOT DISTINCT FROM OLD\.\1/g)].map((m) => m[1]);
    expect(kept).toEqual(['event_source', 'id', 'user_id', 'purpose', 'safety_zone', 'created_at']);
    for (const column of ['id', 'user_id', 'event_source', 'purpose', 'created_at']) {
      expect(claim).toMatch(new RegExp(`a\\.${column}\\b`));
    }
    // One change is left alone under any role: the owner alone is cleared, as the foreign key does when
    // an account is deleted (0011). Nothing else about the row may change with it.
    expect(finalGuard).toMatch(
      /IF OLD\.event_source IS NOT DISTINCT FROM 'server_verified'\s+AND NEW\.event_source IS NOT DISTINCT FROM OLD\.event_source\s+AND NEW\.id\s+IS NOT DISTINCT FROM OLD\.id\s+AND \(NEW\.user_id\s+IS NOT DISTINCT FROM OLD\.user_id OR NEW\.user_id IS NULL\)\s+AND NEW\.purpose\s+IS NOT DISTINCT FROM OLD\.purpose\s+AND NEW\.safety_zone\s+IS NOT DISTINCT FROM OLD\.safety_zone\s+AND NEW\.created_at\s+IS NOT DISTINCT FROM OLD\.created_at THEN\s+RETURN NULL;/,
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
    // and once where only the AFTER trigger runs: a change of the zone that does not name event_source
    expect(regression).toMatch(
      /SAVEPOINT z46_mixed_retarget;\s+SET LOCAL request\.jwt\.claim\.role = 'anon';\s+SET LOCAL request\.jwt\.claims = '\{"role":"service_role"\}';\s+DO \$mixed_retarget\$\s+BEGIN\s+BEGIN\s+PERFORM public\.z46_retarget\('zone'\);/,
    );
  });

  it('있는 줄의 값은 건드리지 않고, 스스로 트랜잭션을 열거나 닫지 않는다', () => {
    expect(sql).not.toMatch(/DROP TABLE|TRUNCATE|CREATE POLICY|DROP COLUMN|ALTER COLUMN|ADD COLUMN/i);
    expect(sql.match(/CREATE TABLE/g)).toHaveLength(1);
    // the only ALTER TABLE switches row security on for the new table
    expect(sql.match(/ALTER TABLE [^\n;]+/g)).toEqual(['ALTER TABLE public.chat_turn_reservations ENABLE ROW LEVEL SECURITY']);
    // Rows are written only inside the three functions: reservations, the day row of a refund, the ledger.
    expect(sql.match(/DELETE FROM public\.\w+/g)).toEqual(['DELETE FROM public.chat_turn_reservations']);
    expect(sql.match(/INSERT INTO public\.\w+/g)).toEqual(['INSERT INTO public.chat_turn_reservations', 'INSERT INTO public.chat_turn_refunds']);
    expect(sql.match(/UPDATE public\.\w+/g)).toEqual([
      'UPDATE public.chat_turn_reservations',
      'UPDATE public.chat_turn_reservations',
      'UPDATE public.chat_usage',
      'UPDATE public.chat_turn_reservations',
    ]);
    for (const body of [bump, attempt, claim, fn]) {
      expect(sql).toContain(body);
    }
    const outside = [bump, attempt, claim, fn].reduce((text, body) => text.replace(body, ''), sql);
    expect(outside).not.toMatch(/DELETE FROM|INSERT INTO|UPDATE public\./);
    expect(sql).not.toMatch(TOP_LEVEL_TRANSACTION);
  });

  it('롤백은 새 것을 걷고 0252 의 함수 둘을 글자 그대로 되돌린다', () => {
    const code = strip(down);
    const order = [
      'DROP TRIGGER IF EXISTS guard_ai_audit_server_verified_final ON public.ai_audit_log;',
      'DROP FUNCTION IF EXISTS public.guard_ai_audit_server_verified_final();',
      'DROP FUNCTION IF EXISTS public.refund_chat_turn_after_output_swap(uuid);',
      'DROP FUNCTION IF EXISTS public.claim_chat_turn_for_audit(uuid, uuid, uuid);',
      'DROP FUNCTION IF EXISTS public.begin_chat_turn_attempt(uuid, uuid, uuid);',
      'DROP FUNCTION IF EXISTS public.bump_chat_usage_for_turn(uuid, date);',
      'DROP TABLE IF EXISTS public.chat_turn_reservations;',
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
    // The ledger and the rows already used stay, 0252's trigger is not made a second time, and the only
    // table that goes is the one 0255 made.
    expect(code.match(/DROP\s+TABLE[^;]*/gi)).toEqual(['DROP TABLE IF EXISTS public.chat_turn_reservations']);
    expect(code).not.toMatch(/CREATE\s+TABLE|DELETE FROM|TRUNCATE|CREATE TRIGGER|chat_turn_refunds\s+(DROP|ADD|ALTER)|DROP COLUMN/i);
  });

  it('삭제 등록부: 예약 표는 계정 삭제로만 사라지는 표로 올리고, 그 줄을 0258 이 넣는다', () => {
    const registry = JSON.parse(read('db/erasure-registry.json')) as {
      tables: Record<string, { owner: string; class: string; reason: string }>;
      forwardAdditions: Record<string, string[]>;
      forwardRevisions: Record<string, Record<string, { previousReason: string }>>;
    };
    expect(registry.tables.chat_turn_reservations).toMatchObject({ owner: 'user_id', class: 'account_delete_only' });
    expect(registry.forwardAdditions['0258_chat_turn_reservations_erasure_registry.sql']).toEqual(['chat_turn_reservations']);
    const forward = read('db/migrations/0258_chat_turn_reservations_erasure_registry.sql');
    expect(forward).toContain("('chat_turn_reservations', 'user_id', 'account_delete_only', NULL, NULL, ");
    // 0268 records the reason 0258 shipped; the canonical row now carries F.
    const historical = registry.forwardRevisions['0268_chat_turn_refund_evidence_erasure_registry_reason.sql']
      .chat_turn_reservations.previousReason;
    expect(forward).toContain(historical.replace(/'/g, "''"));
    expect(registry.tables.chat_turn_reservations.reason).not.toBe(historical);
  });

  it('회귀는 환불에 근거 줄만 넘기고, 묶기를 실제 함수로 묻고, 되돌리기는 새 것부터 한다', () => {
    const regression = read('db/tests/chat_turn_refund_regression.sql');
    const calls = regression.match(/public\.refund_chat_turn_after_output_swap\((?!uuid|date)[^\n]*/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(30);
    // Every call names a row and nothing else: a quoted id, a psql variable or NULL.
    for (const call of calls) {
      expect(call).toMatch(/^public\.refund_chat_turn_after_output_swap\(('[0-9a-f-]{36}'|:'c[12]'|NULL)\)/);
    }
    expect(regression).toContain("to_regprocedure('public.refund_chat_turn_after_output_swap(date)') IS NULL");
    // the helper that stands in for a proxy binds through the real function, never by writing the table
    const helper = regression.slice(regression.indexOf('CREATE FUNCTION pg_temp.z46_audit('), regression.indexOf("SELECT (pg_catalog.now() AT TIME ZONE 'Asia/Seoul')::date AS today"));
    expect(helper).toMatch(/IF p_turn IS NOT NULL THEN[\s\S]{0,400}PERFORM public\.claim_chat_turn_for_audit\(p_user, p_id, p_turn\);/);
    // round 5 (R2438-16): the fresh reservations rely on a five-minute window of clock time
    expect(helper).toMatch(/IF pg_catalog\.clock_timestamp\(\) - pg_catalog\.now\(\) > interval '4 minutes' THEN/);
    expect(regression).not.toMatch(/chat_turn_reservations \(turn_id, user_id, counted_day\) VALUES\n  \('26101346-7000-4000-8000-000000007001'/);
    expect(helper).not.toMatch(/chat_turn_reservations/);
    // the cases the reservation brings
    // round 6: a re-ask only on the user's latest turn; the late first attempt (R2438-17) and the lost bound answer
    expect(regression).toMatch(/'a re-ask was recorded on a turn that is not the user''s latest, or a later call took the turn'/);
    expect(regression).toMatch(/concat_ws\(',', :'t1_b1', :'t1_b2', :'t1_c2', :'t1_late', :'t1_b3', :'t1_c3'\) = 'true,true,true,false,false,false'/);
    expect(regression).toMatch(/:'t1_back' = 'null,1,null,null'/);
    expect(regression).toMatch(/concat_ws\(',', :'t2_b1', :'t2_c1', :'t2_b2', :'t2_c2', :'t2_again', :'t2_b3', :'t2_c3'\) = 'true,true,true,true,false,false,false'/);
    expect(regression).toMatch(/:'t2_back' = 'null,1,null'/);
    expect(regression).toMatch(/concat_ws\(',', :'t3_b1', :'t3_c1', :'t3_back', :'t3_b2', :'t3_c2'\) = 'true,true,1,false,false'/);
    // the stand-in for a proxy records the attempt before writing its row, as the proxies do
    expect(helper.indexOf('PERFORM public.begin_chat_turn_attempt(p_user, p_id, p_turn);')).toBeGreaterThan(-1);
    expect(helper.indexOf('PERFORM public.begin_chat_turn_attempt(p_user, p_id, p_turn);')).toBeLessThan(helper.indexOf('INSERT INTO public.ai_audit_log'));
    // round 8: the order is the server's. The re-ask reaches it first, the late call second; the re-ask's answer
    // binds and alone gives the turn back; the same row twice and a third call are not recorded (T4 · R2438-21 · R2438-23)
    expect(regression).toMatch(/concat_ws\(',', :'t4_b1', :'t4_same', :'t4_late', :'t4_third', :'t4_c1', :'t4_back', :'t4_back_late'\) = 'true,false,true,false,true,1,null'/);
    expect(regression).toMatch(/AND \(SELECT attempts = 2 AND attempt1_audit_id = '26101346-4000-4000-8000-0000000000db' AND attempt2_audit_id = '26101346-4000-4000-8000-0000000000dc'/);
    expect(regression).not.toMatch(/t5_|p_started_at|attempt_started_at|pending_audit_id/);
    // the refund reads the owner of the reservation itself, not only what the claim guarantees
    expect(regression).toMatch(
      /SAVEPOINT z46_foreign_reservation;[\s\S]{0,1400}'a reservation of another user gave the caller a turn back, or was closed'\);\s+ROLLBACK TO SAVEPOINT z46_foreign_reservation;/,
    );
    // round 8: a fresh row of the user that is not an attempt of the turn it names binds nothing (sixteen refusals)
    expect(regression).toMatch(/:'no' = 'false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false'/);
    expect(regression).toContain("public.claim_chat_turn_for_audit('26101346-0000-4000-8000-00000000000e', '26101346-4000-4000-8000-0000000000e2', '26101346-7000-4000-8000-0000000070e1')::text,");
    expect(regression).toMatch(/:'yes' = 'true,false,false,true,true'/);
    // another user's refused attempt on a turn does not stop its owner from binding it afterwards
    expect(regression).toMatch(
      /SAVEPOINT z46_owner_after_attempt;[\s\S]{0,1100}SELECT public\.begin_chat_turn_attempt\([\s\S]{0,700}'the owner could not bind a turn after another user had asked for it'\);\s+ROLLBACK TO SAVEPOINT z46_owner_after_attempt;/,
    );
    expect(regression).toMatch(/RAISE EXCEPTION 'z46 regression failed: a signed-in user bound an answer to a turn';\s+EXCEPTION WHEN insufficient_privilege THEN/);
    expect(regression).toMatch(/RAISE EXCEPTION 'z46 regression failed: a signed-in user made a reservation directly';\s+EXCEPTION WHEN insufficient_privilege THEN/);
    expect(regression).toMatch(/'the bump did not remove exactly the caller''s unanswered reservations and those older than two days'/);
    // round 4: the midnight case of round 3 (yesterday's unanswered reservation cannot take today's answer)
    expect(regression).toMatch(/SAVEPOINT z46_midnight;[\s\S]{0,2600}:'midnight' = 'false,true'[\s\S]{0,900}ROLLBACK TO SAVEPOINT z46_midnight;/);
    // audit rows are made at clock time, like the windows the functions read
    expect(regression).toContain('pg_catalog.clock_timestamp() - p_age, p_purpose, p_source);');
    expect(regression).toMatch(/'a deleted account left reservations behind'/);
    expect(regression).toMatch(/'the turn counted yesterday lowered another day, or did not lower yesterday'/);
    expect(regression).toMatch(/FOREACH v_case IN ARRAY ARRAY\['user', 'purpose', 'zone', 'time'\] LOOP/);
    expect(regression).toMatch(/CREATE TRIGGER z46_flip BEFORE UPDATE OF latency_ms ON public\.ai_audit_log/);
    expect(regression).toMatch(/SET LOCAL request\.jwt\.claims = 'not-json';\s+SET LOCAL ROLE service_role;\s+SELECT public\.z46_inner_writer\(/);
    expect(regression).toContain(
      ":'turn_writers' = 'begin_chat_turn_attempt(uuid,uuid,uuid) | bump_chat_usage_for_turn(uuid,date) | claim_chat_turn_for_audit(uuid,uuid,uuid) | refund_chat_turn_after_output_swap(uuid)'",
    );
    const steps = [
      '\\ir ../migrations/rollback/0255_down.sql',
      '\\ir ../migrations/rollback/0252_down.sql',
      '\\ir ../migrations/0252_chat_turn_refund.sql',
      '\\ir ../migrations/0255_chat_turn_refund_bound_to_audit.sql',
    ].map((line) => regression.indexOf(line));
    expect(steps.every((at) => at >= 0)).toBe(true);
    expect([...steps].sort((a, b) => a - b)).toEqual(steps);
  });

  it('CI 가 환불 경합 여섯 · 묶기 경합 셋 · 올리기 경합 하나 · 다시 묻기 경합 하나 · 늦은 시도 경합 하나 · 잠금 순서 경합 둘 · 0255 의 다시 적용 스물여덟을 실제로 돌린다', () => {
    const workflow = read('.github/workflows/supabase-dry-run.yml');
    // No call in the step passes a day.
    const calls = workflow.match(/public\.refund_chat_turn_after_output_swap\('[^\n]*/g) ?? [];
    expect(calls).toHaveLength(4);
    // the refund races pass the row they bound; the lock-order race passes its fixture's row
    for (const call of calls.slice(0, 3)) {
      expect(call).toMatch(/^public\.refund_chat_turn_after_output_swap\('\$row_[ab]'\)::text/);
    }
    expect(calls[3]).toMatch(/^public\.refund_chat_turn_after_output_swap\('26101347-4000-4000-8000-000000000001'\)::text, 'null'\)/);
    expect(workflow).not.toMatch(/refund_chat_turn_after_output_swap\(\$today/);
    expect(workflow).not.toMatch(/chat_turn_id|refundable_turns/);
    // the answers of the refund races are bound through the claim, and the race fails if that does not bind
    expect(workflow.match(/SELECT public\.claim_chat_turn_for_audit\('\$user', '26101347-4000-4000-8000-00000000000[12]', '\$turn_[ab]'\)" \| tr -d '\\r'\)" != "t" \]\]; then/g)).toHaveLength(2);
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
    const claims = [...workflow.matchAll(/^ +claim_race (\w+) (turn|row|retry) "([^"\n]*)"$/gm)].map((m) => `${m[1]}|${m[2]}|${m[3]}`);
    expect(claims).toEqual([
      'two_answers_one_turn|turn|a=true b=false answered:02:2:01,02/counted:-:0:-,-',
      'one_answer_two_turns|row|a=true b=false answered:01:1:01,-/counted:-:1:01,-',
      'two_retries_one_turn|retry|a=true b=false answered:03:2:03,01/counted:-:0:-,-',
    ]);
    // the second claim is made while the first one's transaction is still open
    const claimRace = workflow.slice(workflow.indexOf('claim_race() {'), workflow.indexOf('reapply_over() {'));
    expect(claimRace.indexOf('-c "SELECT pg_sleep(3)"')).toBeLessThan(claimRace.indexOf("SELECT 'b=' || public.$fn('$user', $b_args)::text"));
    // round 6: the races begin from attempts recorded as the proxies record them
    expect(claimRace).toContain('SELECT public.begin_chat_turn_attempt(\'$user\', $args)');
    // round 8: no attempt in the step carries a time
    for (const call of workflow.match(/public\.begin_chat_turn_attempt\([^\n]*/g) ?? []) {
      expect(call).not.toMatch(/clock_timestamp|interval|started/);
    }
    // round 8: a late first call arrives while the re-ask holds the lock (R2438-21 · R2438-23): it is the second
    // attempt and the re-ask's answer binds; and a refund during a bump (R2438-22)
    const lates = [...workflow.matchAll(/^ +late_begin_race (\w+) "([^"\n]*)"$/gm)].map((m) => m.slice(1).join('|'));
    expect(lates).toEqual(['late_first_attempt|a=true b=true c=true 2:02,01 answered:02']);
    const orders = [...workflow.matchAll(/^ +lock_order_race (\w+) (bump|row) "([^"\n]*)"$/gm)].map((m) => m.slice(1).join('|'));
    expect(orders).toEqual([
      'bump_then_refund|bump|b=4 r=null wait=Lock:advisory',
      // a third session holds today's usage row: the waiting bump already holds the user's lock
      'bump_waits_for_row|row|a=3 b=4 r=null wait=Lock:advisory',
    ]);
    const lateRace = workflow.slice(workflow.indexOf('late_begin_race() {'), workflow.indexOf('lock_order_race() {'));
    // the late call (row 01) is made while the re-ask's (row 02) transaction is open, and only the re-ask claims
    expect(lateRace.indexOf("'26101347-4000-4000-8000-000000000002', '$turn')::text\" \\")).toBeLessThan(lateRace.indexOf('-c "SELECT pg_sleep(3)"'));
    expect(lateRace.indexOf('-c "SELECT pg_sleep(3)"')).toBeLessThan(lateRace.indexOf("'26101347-4000-4000-8000-000000000001', '$turn')::text"));
    expect(lateRace.match(/claim_chat_turn_for_audit\(/g)).toEqual(['claim_chat_turn_for_audit(']);
    expect(lateRace).toContain("claim_chat_turn_for_audit('$user', '26101347-4000-4000-8000-000000000002', '$turn')");
    const orderRace = workflow.slice(workflow.indexOf('lock_order_race() {'), workflow.indexOf('reapply_over() {'));
    expect(orderRace).toContain("pg_catalog.now() - interval '3 days', 'answered'");
    expect(orderRace).toContain("AND a.query LIKE '%refund_chat_turn_after_output_swap%'");
    expect(claimRace).toContain('fn="begin_chat_turn_attempt"');
    expect(claimRace).toMatch(/AND query = 'SELECT pg_sleep\(3\)'/);
    // round 4: two bumps of one user on two days at once leave only the later reservation open
    const bumps = [...workflow.matchAll(/^ +bump_race (\w+) "([^"\n]*)"$/gm)].map((m) => `${m[1]}|${m[2]}`);
    expect(bumps).toEqual(['two_bumps_two_days|a=1 b=1 1:0']);
    // round 6: a re-ask that arrives while a new turn is being counted waits for the lock and is refused
    const reasks = [...workflow.matchAll(/^ +reask_race (\w+) "([^"\n]*)"$/gm)].map((m) => `${m[1]}|${m[2]}`);
    expect(reasks).toEqual(['reask_during_bump|a=2 b=false 1:01,-']);
    const reaskRace = workflow.slice(workflow.indexOf('reask_race() {'), workflow.indexOf('reapply_over() {'));
    expect(reaskRace.indexOf('-c "SELECT pg_sleep(3)"')).toBeLessThan(reaskRace.indexOf("SELECT 'b=' || public.begin_chat_turn_attempt("));
    const bumpRace = workflow.slice(workflow.indexOf('bump_race() {'), workflow.indexOf('reapply_over() {'));
    expect(bumpRace).toContain("-c \"SELECT 'a=' || (public.bump_chat_usage_for_turn('$user', $kst_today - 1) ->> 'count')\"");
    expect(bumpRace.indexOf('-c "SELECT pg_sleep(3)"')).toBeLessThan(bumpRace.indexOf("SELECT 'b=' || (public.bump_chat_usage_for_turn('$user', $kst_today)"));
    expect(bumpRace).toMatch(/AND query = 'SELECT pg_sleep\(3\)'/);
    expect(bumpRace).toContain("WHERE r.state = 'counted'");
    // 0252's re-apply cases start from a database without 0255.
    expect(workflow).toMatch(
      /--single-transaction -f db\/migrations\/rollback\/0255_down\.sql\s+psql [^\n]*--single-transaction -f db\/migrations\/rollback\/0252_down\.sql/,
    );
    expect(workflow).toMatch(/-v VERBOSITY=verbose --single-transaction \\\s+-f db\/migrations\/0255_chat_turn_refund_bound_to_audit\.sql/);
    expect(workflow).toMatch(/grep -q -F "55000: 0255: \$want"/);
    const cases = [...workflow.matchAll(/^ +reapply_0255_over (\w+) "[^\n]*" "([^"\n]*)"$/gm)].map((m) => `${m[1]}:${m[2]}`);
    const key = 'chat_turn_refunds must have a primary key on audit_id alone that is not deferrable';
    const extra = 'chat_turn_reservations carries a constraint, index, trigger or rule this migration does not create';
    expect(cases).toEqual([
      'same_ledger:',
      `no_primary_key:${key}`,
      `deferrable_primary_key:${key}`,
      `deferred_primary_key:${key}`,
      `wider_primary_key:${key}`,
      'rsv_same_table:',
      'rsv_no_default:chat_turn_reservations has other columns',
      'rsv_audit_as_text:chat_turn_reservations has other columns',
      'rsv_extra_column:chat_turn_reservations has other columns',
      // a table made by round 6 (one pending attempt) or round 7 (with its start) stops the re-apply
      'rsv_round6_shape:chat_turn_reservations has other columns',
      'rsv_round7_shape:chat_turn_reservations has other columns',
      'rsv_no_unique_answer:chat_turn_reservations lacks its primary key on turn_id or its unique on audit_id',
      'rsv_deferrable_unique:chat_turn_reservations lacks its primary key on turn_id or its unique on audit_id',
      'rsv_no_cascade:chat_turn_reservations.user_id does not follow public.users(id) with ON DELETE CASCADE',
      'rsv_no_answer_check:chat_turn_reservations lacks its state checks',
      'rsv_unlogged:chat_turn_reservations is not a permanent table with row security on',
      'rsv_generated_state:chat_turn_reservations has other columns',
      'rsv_check_other_meaning:chat_turn_reservations lacks its state checks',
      'rsv_deferrable_owner_link:chat_turn_reservations.user_id does not follow public.users(id) with ON DELETE CASCADE',
      `rsv_extra_check:${extra}`,
      `rsv_extra_index:${extra}`,
      `rsv_extra_rule:${extra}`,
      'rsv_with_child:chat_turn_reservations is not a permanent table with row security on',
      `rsv_extra_trigger:${extra}`,
      `rsv_other_lookup_index:${extra}`,
      `rsv_include_lookup_index:${extra}`,
      `rsv_brin_lookup_index:${extra}`,
      'rsv_open_policy:chat_turn_reservations is open to an application role',
    ]);
    // Each case runs on a clone named <prefix>_<label>_<run id>_<attempt>_<pid>. PostgreSQL ends a name at 63 bytes
    // and the step refuses a longer one, so every label has to fit beside a twelve-digit run id (CI's are eleven).
    const fits = (prefix: string, label: string) => `${prefix}_${label}_123456789012_99_1234567`.length <= 63;
    const labels: [string, string[]][] = [
      ['race_0252', races.map((r) => r.slice(0, r.indexOf('|')))],
      ['race_0255', claims.map((c) => c.slice(0, c.indexOf('|')))],
      ['reapply_0252', [...workflow.matchAll(/^ +reapply_over (\w+) /gm)].map((m) => m[1])],
      ['reapply_0255', cases.map((c) => c.slice(0, c.indexOf(':')))],
    ];
    for (const [prefix, names] of labels) {
      expect(names.length).toBeGreaterThan(1);
      expect(names.filter((name) => !fits(prefix, name))).toEqual([]);
    }
    for (const prefix of ['race_0252', 'race_0255', 'reapply_0252', 'reapply_0255']) {
      expect(workflow).toContain(`local clone_db="${prefix}_\${label}_\${GITHUB_RUN_ID:-local}_\${GITHUB_RUN_ATTEMPT:-0}_$$"`);
    }
    // every message a case waits for is one the migration can raise
    for (const message of new Set(cases.map((c) => c.slice(c.indexOf(':') + 1)).filter(Boolean))) {
      expect(raw).toContain(`'0255: ${message}`);
    }
    // the table text the cases start from is the table the migration makes
    const good = /good_table="CREATE TABLE public\.chat_turn_reservations \(([^\n]*)\)"\n/.exec(workflow)?.[1] ?? '';
    const made = sql.slice(sql.indexOf('CREATE TABLE IF NOT EXISTS public.chat_turn_reservations (') + 'CREATE TABLE IF NOT EXISTS public.chat_turn_reservations ('.length, sql.indexOf('\n);\nCOMMENT ON TABLE'));
    expect(good.replace(/\s+/g, ' ').trim()).toBe(made.replace(/\s+/g, ' ').trim());
  });
});
