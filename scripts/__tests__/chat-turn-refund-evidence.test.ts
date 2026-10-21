import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const read = (name: string) => readFileSync(resolve(__dirname, '../..', name), 'utf8').replace(/\r\n/g, '\n');
const base = read('db/migrations/0255_chat_turn_refund_bound_to_audit.sql');
const folder = 'db/migration-drafts/';
const sql = read(`${folder}UNNUMBERED_chat_turn_refund_evidence.sql`);
const down = read(`${folder}rollback/UNNUMBERED_chat_turn_refund_evidence_down.sql`);
const tests = read(`${folder}tests/chat-turn-refund-evidence.sql`);
const runner = read('scripts/test-chat-turn-refund-evidence.py');
const functions = ['bump_chat_usage_for_turn', 'begin_chat_turn_attempt', 'claim_chat_turn_for_audit', 'refund_chat_turn_after_output_swap'];
const statement = (source: string, name: string) => {
  const match = source.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\n\\$\\$;`));
  expect(match).not.toBeNull();
  return match![0];
};
const body = (source: string, name: string) => statement(source, name).split('AS $$')[1].split('$$;')[0];
const code = (source: string) => source.replace(/--[^\n]*/g, '');

describe('T40 S dormant evidence contract', () => {
  it('owns exactly four existing signatures, with #2697 argument name and return unchanged', () => {
    expect([...sql.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(/g)].map(m => m[1])).toEqual(functions);
    for (const name of functions) {
      const old = statement(base, name);
      const next = statement(sql, name);
      expect(next.match(/public\.[^\n]+/g)?.[0]).toBe(old.match(/public\.[^\n]+/g)?.[0]);
      expect(next.match(/RETURNS \w+/)?.[0]).toBe(old.match(/RETURNS \w+/)?.[0]);
      for (const prefix of ['REVOKE ALL ON FUNCTION', 'GRANT EXECUTE ON FUNCTION']) {
        const acl = base.match(new RegExp(`${prefix} public\\.${name}[^;]+;`))![0];
        expect(sql).toContain(acl);
        expect(down).toContain(acl);
      }
    }
    expect(sql).toContain('refund_chat_turn_after_output_swap(p_audit_id uuid)\nRETURNS int');
  });

  it('S has only three new booleans and no purpose-table write or hidden quota call', () => {
    expect([...code(sql).matchAll(/ADD COLUMN IF NOT EXISTS (\w+) ([^,;\n]+)/g)].map(m => m.slice(1))).toEqual([
      ['attempt1_delivered', 'boolean NOT NULL DEFAULT false'],
      ['attempt2_delivered', 'boolean NOT NULL DEFAULT false'],
      ['binding_closed', 'boolean NOT NULL DEFAULT false'],
    ]);
    const targets = [...code(sql).matchAll(/\b(?:UPDATE|INSERT\s+INTO|DELETE\s+FROM)\s+public\.(\w+)/gi)].map(m => m[1]);
    expect(new Set(targets)).toEqual(new Set(['chat_turn_reservations', 'chat_turn_refunds', 'chat_usage']));
    for (const name of functions) {
      const fn = code(body(sql, name));
      const calls = [...fn.matchAll(/(?:PERFORM|:=|FROM)\s+public\.(\w+)\(/g)].map(m => m[1]);
      expect(calls).toEqual(name === 'bump_chat_usage_for_turn' ? ['bump_chat_usage_if_under_cap'] : []);
      expect(fn).not.toMatch(/\bEXECUTE\b|\bCALL\b|llm_proxy_purpose|quota_day|purpose_restored_day|consume_/i);
    }
  });

  it('only bump and refund take the parent lock, before children; clocks follow waits', () => {
    for (const name of functions) {
      const fn = code(body(sql, name));
      expect(fn).toContain("hashtextextended('chat_turn_bump:'");
      if (['bump_chat_usage_for_turn', 'refund_chat_turn_after_output_swap'].includes(name)) {
        expect(fn).toContain('FOR KEY SHARE');
        expect(fn.indexOf('FOR KEY SHARE')).toBeGreaterThan(fn.indexOf('pg_advisory_xact_lock'));
        const firstChild = name === 'bump_chat_usage_for_turn' ? fn.indexOf('v_count := public.bump') : fn.indexOf('FROM public.chat_turn_reservations');
        expect(fn.indexOf('FOR KEY SHARE')).toBeLessThan(firstChild);
      } else {
        expect(fn).not.toMatch(/FOR KEY SHARE|FROM public\.users/);
      }
      if (name === 'claim_chat_turn_for_audit' || name === 'refund_chat_turn_after_output_swap') {
        expect(fn.indexOf('v_now := pg_catalog.clock_timestamp()')).toBeGreaterThan(fn.lastIndexOf('FOR UPDATE'));
      }
    }
  });

  it('retains attempts, closes binding, and requires exact delivered attribution', () => {
    expect(body(sql, functions[0])).toContain("(r.state = 'counted' AND r.attempts = 0)");
    expect(body(sql, functions[1])).toContain('AND NOT r.binding_closed');
    const claim = body(sql, functions[2]);
    expect(claim).toContain('v_bound := COALESCE(NOT v_row.binding_closed');
    expect(claim).toContain('audit_id = CASE WHEN v_bound THEN p_audit_id ELSE audit_id END');
    expect(claim.match(/UPDATE public\.chat_turn_reservations/g)).toHaveLength(1);
    expect(claim).toContain('RETURN v_bound;');
    const refund = body(sql, functions[3]);
    expect(refund).toContain('IF v_matches <> 1 THEN RETURN NULL');
    expect(refund).toContain('AND v_row.attempt1_delivered');
    expect(refund).toContain('AND v_row.attempt2_delivered');
    expect(refund).toContain('IS NOT TRUE'); // SQL NULL must fail closed.
    expect(refund).toContain("v_row.state = 'refunded'");
    expect(refund).not.toMatch(/SET[^;]*audit_id\s*=/);
    expect(refund).toContain('cu.count > 0');
    expect(refund).toContain('RETURN v_count;');
    expect(refund).not.toMatch(/WHEN OTHERS/);
  });

  it('down restores the exact original functions and preserves E1-S, with source guards for drift', () => {
    const e1 = read(`${folder}UNNUMBERED_chat_turn_attempt_with_quota.sql`);
    for (const name of functions) {
      expect(statement(down, name)).toBe(statement(base, name));
      for (const [text, source] of [[sql, base], [sql, sql], [down, sql]]) {
        const hash = createHash('md5').update(body(source, name)).digest('hex');
        expect(text).toContain(`'${hash}'`);
      }
    }
    const hash = createHash('md5').update(body(e1, 'begin_chat_turn_attempt_with_quota')).digest('hex');
    expect(sql).toContain(`'${hash}'`);
    expect(down).toContain(`'${hash}'`);
    expect(code(down.split('CREATE OR REPLACE FUNCTION')[0])).not.toMatch(/DROP FUNCTION|CREATE TABLE|DROP TABLE|0255_down|UPDATE public\.chat_usage|DELETE FROM public\.chat_turn_refunds/);
    expect(code(down)).toContain("WHERE audit_id IS NULL AND (binding_closed OR state = 'refunded')");
  });

  it('keeps the 0255 contract separate and tests the changed S assertions in a full-schema clone', () => {
    expect(read('db/tests/chat_turn_refund_regression.sql')).toContain(":'t1_back' = 'null,1,null,null'");
    for (const label of ['T1 back 1,null,null,null', 'T2 back 1,null,null', 'T1 ledger uses late first only',
      'T2 representative and first ledger', 'bump preserves attempted reservation', 'one open reservation',
      'closed stays closed after newer row disappears', 'no synthetic representative on closed refund',
      'same-row duplicate attribution refuses', 'cross-row duplicate attribution refuses',
      'one to integer zero', 'S purpose table unchanged']) expect(tests).toContain(label);
    expect(runner).toContain("'CREATE DATABASE '+DB+' TEMPLATE postgres;'");
    expect(runner.indexOf("file=DRAFT/'UNNUMBERED_chat_turn_attempt_with_quota.sql'")).toBeLessThan(runner.indexOf("file=DRAFT/'UNNUMBERED_chat_turn_refund_evidence.sql'"));
    expect(runner).toContain('schema_snapshot()==baseline');
    expect(runner).toContain('answered/refunded backfill only representative');
    expect(runner).toContain('all newest ties closed');
    expect(runner).toContain('pg_blocking_pids(f.pid)');
    expect(runner).toContain('P0040: T40 FAIL: ');
    expect(runner).toContain('timeout=35');
    expect(runner).toContain('statement_timeout=15000');
    for (const schedule of ['same_audit_refund', 'claim2_before_refund1', 'refund1_before_claim2',
      'refund_two_attempts', 'bump_before_late_claim', 'closed_refund_before_bump', 'two_answers_one_turn',
      'one_answer_two_turns', 'refund_before_account_delete', 'account_delete_before_refund',
      'bump_before_account_delete', 'last_slot_', 'bump_reask_']) expect(runner).toContain(schedule);
    for (const mutant of ['delivery', 'closed', 'bump_delete', 'purpose_write']) expect(runner).toContain(`('${mutant}',`);
    const workflow = read('.github/workflows/supabase-dry-run.yml');
    const lane = workflow.split('- name: Exercise dormant T40 S evidence on full schema clone')[1].split('- name:')[0];
    expect(lane).toContain('timeout-minutes: 10');
    expect(lane).toContain('set -euo pipefail');
    expect(lane).toContain('python3 scripts/test-chat-turn-refund-evidence.py');
    expect(workflow).toContain('- "scripts/test-chat-turn-refund-evidence.py"');
  });
});
