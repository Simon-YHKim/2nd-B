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
    expect(fn).toMatch(/WHEN unique_violation THEN\s+RETURN NULL;/);
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

  it('롤백은 함수만 걷고 원장은 남긴다(쓴 근거가 다시 쓰이지 않게)', () => {
    expect(down).toMatch(/DROP FUNCTION IF EXISTS public\.refund_chat_turn_after_output_swap\(date\);/);
    expect(down).not.toMatch(/chat_turn_refunds|DROP TABLE|chat_usage/);
  });

  it('CI 가 회귀 SQL 과 경합 세 가지를 실제로 돌린다', () => {
    const workflow = read('.github/workflows/supabase-dry-run.yml');
    expect(workflow).toMatch(
      /run: psql -X -h localhost -U postgres -v ON_ERROR_STOP=1 -f db\/tests\/chat_turn_refund_regression\.sql/,
    );
    expect(workflow).toMatch(/- name: Race two chat turn refunds over one proxy row/);
    expect(workflow).toMatch(/race same_day "BEGIN" 0 1 "a=4 b=null 4\/3\/1"/);
    expect(workflow).toMatch(/race cross_day "BEGIN ISOLATION LEVEL REPEATABLE READ" 1 1 "a=4 b=null 4\/3\/1"/);
    expect(workflow).toMatch(/race two_rows "BEGIN" 0 2 "a=4 b=3 3\/3\/2"/);
    // REPEATABLE READ with two rows: one turn now, and the other row still gives its turn later.
    expect(workflow).toMatch(/race two_rows_rr "BEGIN ISOLATION LEVEL REPEATABLE READ" 0 2 "a=4 b=null 4\/3\/1" "c=3"/);
  });

  it('이미 있는 원장 표의 모양이 다르면 함수를 만들기 전에 멈춘다', () => {
    const shape = sql.indexOf('DO $shape0252$');
    expect(shape).toBeGreaterThan(sql.indexOf('REVOKE ALL ON TABLE public.chat_turn_refunds'));
    expect(shape).toBeLessThan(sql.indexOf('CREATE OR REPLACE FUNCTION public.refund_chat_turn_after_output_swap'));
    const block = sql.slice(shape, sql.indexOf('$shape0252$;'));
    expect(block).toContain("'audit_id uuid not null, day date not null, refunded_at timestamp with time zone not null'");
    expect(block).toMatch(/c\.contype = 'p' AND c\.conkey = ARRAY\[v_audit\]/);
    expect(block).toMatch(/c\.contype = 'f' AND c\.conkey = ARRAY\[v_audit\]\s+AND c\.confrelid = 'public\.ai_audit_log'::regclass AND c\.confdeltype = 'c'/);
    expect(block).toMatch(/relrowsecurity/);
    expect(block.match(/RAISE EXCEPTION '0252: chat_turn_refunds[^'%]+'\s+USING ERRCODE = '55000';/g)).toHaveLength(4);
    const workflow = read('.github/workflows/supabase-dry-run.yml');
    expect(workflow).toMatch(/reapply_over no_primary_key "ALTER TABLE public\.chat_turn_refunds DROP CONSTRAINT chat_turn_refunds_pkey"/);
    expect(workflow).toMatch(/reapply_over no_audit_link "ALTER TABLE public\.chat_turn_refunds DROP CONSTRAINT chat_turn_refunds_audit_id_fkey"/);
    expect(workflow).toMatch(/reapply_over day_as_text "ALTER TABLE public\.chat_turn_refunds ALTER COLUMN day TYPE text"/);
  });

  it('회귀는 클라이언트가 부를 수 있는 감사 기록 함수 둘을 다 부르고, 그 목록이 늘면 실패한다', () => {
    const regression = read('db/tests/chat_turn_refund_regression.sql');
    expect(regression).toMatch(/SELECT public\.log_ai_audit\('0a0b0c0d'/);
    expect(regression).toMatch(/SELECT public\.log_ai_audit_once\('z46-once-0001'/);
    expect(regression).toContain(
      "= 'log_ai_audit(text,text,text,boolean,text,integer,text,text,text) | log_ai_audit_once(text,text,text,text,boolean,text,integer,text,text,text)'",
    );
    expect(regression).toMatch(/has_function_privilege\('authenticated', p\.oid, 'EXECUTE'\)/);
  });
});
