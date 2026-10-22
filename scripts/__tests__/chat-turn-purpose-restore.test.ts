import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const read = (path: string) => readFileSync(resolve(__dirname, '../..', path), 'utf8').replace(/\r\n/g, '\n');
const folder = 'db/migration-drafts/';
const e1 = read(`${folder}UNNUMBERED_chat_turn_attempt_with_quota.sql`);
const s = read(`${folder}UNNUMBERED_chat_turn_refund_evidence.sql`);
const up = read(`${folder}UNNUMBERED_chat_turn_purpose_restore.sql`);
const down = read(`${folder}rollback/UNNUMBERED_chat_turn_purpose_restore_down.sql`);
const runner = read('scripts/test-chat-turn-purpose-restore.py');
const tests = read(`${folder}tests/chat-turn-purpose-restore.sql`);
const names = ['begin_chat_turn_attempt_with_quota', 'bump_chat_usage_for_turn', 'refund_chat_turn_after_output_swap'];
const statement = (source: string, name: string) => source.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\n\\$\\$;`))![0];
const body = (source: string, name: string) => statement(source, name).split('AS $$')[1].split('$$;')[0];
const stripF = (source: string) => source.replace(/^-- F-BEGIN\n[\s\S]*?^-- F-END\n/gm, '');

describe('T40 F purpose restoration draft', () => {
  it('adds only bounded blocks to the exact reviewed E1-S/S bodies; down restores originals', () => {
    expect([...up.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(/g)].map(m => m[1])).toEqual(names);
    for (const name of names) {
      const original = name === names[0] ? e1 : s;
      expect(stripF(statement(up, name))).toBe(statement(original, name));
      for (const prefix of ['REVOKE ALL ON FUNCTION', 'GRANT EXECUTE ON FUNCTION']) {
        const acl = original.match(new RegExp(`${prefix} public\\.${name}[^;]+;`))![0];
        expect(up).toContain(acl);
        expect(down).toContain(acl);
      }
      expect(statement(down, name)).toBe(statement(name === names[1] ? up : original, name));
      for (const source of [original, up]) {
        const hash = createHash('md5').update(body(source, name)).digest('hex');
        expect(up).toContain(`'${hash}'`);
        expect(down).toContain(`'${hash}'`);
      }
    }
    expect(stripF(statement(up.replace("'first_already_registered'", "'drift'"), names[0]))).not.toBe(statement(e1, names[0]));
    expect(up).toContain('refund_chat_turn_after_output_swap(p_audit_id uuid)\nRETURNS int');
  });

  it('brackets the unchanged consume with real clock samples and records only successful first debits', () => {
    const fn = body(up, names[0]);
    const before = "v_quota_before := (pg_catalog.clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date;";
    const after = "v_quota_after := (pg_catalog.clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date;";
    expect(fn.indexOf(before)).toBeGreaterThan(fn.indexOf('IF v_attempt = 2 THEN'));
    expect(fn.indexOf(before)).toBeLessThan(fn.indexOf('FROM public.consume_llm_proxy_purpose_quota'));
    expect(fn.indexOf(after)).toBeGreaterThan(fn.indexOf('FROM public.consume_llm_proxy_purpose_quota'));
    expect(fn).toContain('IF v_quota_before IS DISTINCT FROM v_quota_after THEN');
    expect(fn).toContain("RAISE EXCEPTION 'chat quota day changed' USING ERRCODE = '55000'");
    expect(fn).toContain('IF v_registered THEN\n    UPDATE public.chat_turn_reservations SET quota_day = v_quota_before');
    const parentLock = fn.indexOf('FOR KEY SHARE');
    expect(parentLock).toBeGreaterThanOrEqual(0);
    expect(parentLock).toBeGreaterThan(fn.indexOf("'first_already_registered'"));
    expect(parentLock).toBeLessThan(fn.indexOf('v_registered := public.begin_chat_turn_attempt'));
    expect(fn).toContain('IF v_before = 0 THEN');
    expect(fn.match(/FROM public\.consume_llm_proxy_purpose_quota/g)).toHaveLength(1);
  });

  it('uses nullable dates, a user-wide unique processing-day cap and server-day cleanup through down', () => {
    expect([...up.matchAll(/ADD COLUMN IF NOT EXISTS (\w+) ([^,;\n]+)/g)].map(m => m.slice(1))).toEqual([
      ['quota_day', 'date'], ['purpose_restored_day', 'date'],
    ]);
    expect(up).toContain('ON public.chat_turn_reservations (user_id, purpose_restored_day)\n  WHERE purpose_restored_day IS NOT NULL');
    expect(up).toContain('i.indisunique AND i.indisvalid AND i.indisready AND i.indimmediate');
    const bump = body(up, names[1]);
    expect(bump).toContain("r.purpose_restored_day <\n          (pg_catalog.clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date");
    expect(bump).not.toMatch(/purpose_restored_day\s*(?:<|=|<>)\s*p_day/);
    expect(down.replace(/--[^\n]*/g, '')).not.toMatch(/DROP (?:COLUMN|INDEX|FUNCTION)|SET purpose_restored_day\s*=/);
  });

  it('requires all registered deliveries with valid red evidence and a current-day debit', () => {
    const fn = body(up, names[2]);
    for (const pin of ['v_row.quota_day = v_restore_day AND v_purpose_count > 0',
      'user_id = v_user AND purpose_restored_day = v_restore_day',
      'attempt.number <= v_row.attempts', 'attempt.delivered AND a.user_id = v_user',
      "a.event_source = 'server_verified' AND a.purpose = 'secondb_chat'",
      "a.safety_zone = 'red' AND a.created_at <= v_now) IS NOT TRUE",
      'IF v_purpose_count = 1 THEN\n          DELETE FROM public.llm_proxy_purpose_daily',
      'UPDATE public.llm_proxy_purpose_daily SET count = count - 1',
      "IF v_hit IS DISTINCT FROM 'chat_turn_reservations_purpose_restore_day_key' THEN RAISE; END IF;"])
      expect(fn).toContain(pin);
    expect(fn.indexOf('FROM public.chat_usage')).toBeLessThan(fn.indexOf('FROM public.llm_proxy_purpose_daily'));
    expect(fn.indexOf('FROM public.llm_proxy_purpose_daily')).toBeLessThan(fn.indexOf('WHERE turn_id = v_turn FOR UPDATE'));
    expect(fn.indexOf('v_now := pg_catalog.clock_timestamp()')).toBeGreaterThan(fn.lastIndexOf('FOR UPDATE'));
    expect(fn.indexOf('v_restore_day :=')).toBeGreaterThan(fn.indexOf("ERRCODE = 'ZC252'"));
    expect(fn).not.toMatch(/WHEN OTHERS|SET count = 0/);
  });

  it('locks only the reservation and refund tables during apply and down', () => {
    for (const source of [up, down]) {
      expect(source.match(/LOCK TABLE [^;]+;/g)).toEqual([
        'LOCK TABLE public.chat_turn_refunds, public.chat_turn_reservations IN ACCESS EXCLUSIVE MODE;',
      ]);
    }
  });

  it('runs E1-S then S then F in isolated clones with real races, assertion-only mutations and bounded waits', () => {
    expect(runner).toContain("pg.DB = 't40_purpose_test_ci'");
    expect(runner).toContain("pg.MUTANT = 't40_purpose_mutant_test_ci'");
    const main = runner.split('def main():')[1];
    expect(main.indexOf("file=DRAFT/'UNNUMBERED_chat_turn_attempt_with_quota.sql'")).toBeLessThan(main.indexOf("file=DRAFT/'UNNUMBERED_chat_turn_refund_evidence.sql'"));
    expect(main.indexOf("file=DRAFT/'UNNUMBERED_chat_turn_refund_evidence.sql'")).toBeLessThan(main.indexOf('file=UP'));
    for (const marker of ['F_two_reservations_same_day', 'F_last_slot_', 'F_count_one_', 'F_bump_late_refund_',
      'F_green_claim_refund_', 'F_begin_refund_', 'F_delete_refund_', 'F_delete_admission_',
      "sql_mutant('daily_cap'", "sql_mutant('green'", "sql_mutant('old_day_cap'", "sql_mutant('p_day_cleanup'",
      "('e1_copy_drift'", 'P0040: T40 FAIL: ', 'clock_boundary(remove_guard=True)', 'source_contract()',
      'static_check(source)', 'static_check(down)', 'count == 53', "sql_mutant('yellow'",
      'def down_checks(', 'down_checks(DOWN, 5101)', 'down_checks(mutant_down, 7100',
      'mutant_down.write_text(DOWN_SOURCE+', 'M34_parent_key_share',
      'def cascade_orders()', 'F actual FK trigger order', 'withdraw_profile_import_internal',
      'apply_races()', 'parent_lock_races()', 'warm_refund_races()',
      'F warm refund survives ', 'actual 40P01 reproduced', 'refund.lines.get(timeout=20)',
      "('up', 'down')", '(1000, 200)', 'nowait_admissions(mutant=True)',
      "('unbound_first', None, 'first', 3, False)", 'F mutation killed unbound_parent_lock',
      'F down reapply never resets cap', 'F down exact S baseline']) expect(runner).toContain(marker);
    const transport = read('scripts/test-chat-turn-refund-evidence.py');
    for (const guard of ['pg_blocking_pids(f.pid)', 'timeout=35', 'statement_timeout=15000', "'-h', '127.0.0.1'", 'refusing non-test database']) expect(transport).toContain(guard);
    for (const label of ['F green first prevents purpose restore', 'F green second prevents purpose restore',
      'F yellow first prevents purpose restore', 'F yellow second prevents purpose restore',
      'F pending second prevents purpose restore', 'F previous-day refund does not spend today cap',
      'F malicious p_day cannot erase today marker', 'F unexpected unique error rolls back whole refund',
      'F absent purpose row keeps chat refund']) expect(tests).toContain(label);
    expect(tests.match(/SELECT t40\.check\(/g)).toHaveLength(53);
    const workflow = read('.github/workflows/supabase-dry-run.yml');
    const lane = workflow.split('- name: Exercise dormant T40 F purpose restore on full schema clone')[1].split('- name:')[0];
    for (const pin of ['timeout-minutes: 10', 'set -euo pipefail', 'python3 scripts/test-chat-turn-purpose-restore.py']) expect(lane).toContain(pin);
    expect(workflow).toContain('- "scripts/test-chat-turn-purpose-restore.py"');
  });

  it('chains the F retention reason after S without changing ownership, erasure or export rules', () => {
    const prior = JSON.parse(read(`${folder}chat-turn-refund-evidence-erasure-revision.json`)).tables.chat_turn_reservations;
    const next = JSON.parse(read(`${folder}chat-turn-purpose-restore-erasure-revision.json`)).tables.chat_turn_reservations;
    expect(next.previousReason).toBe(prior.reason);
    expect(next.owner).toBe(prior.owner);
    expect(next.class).toBe(prior.class);
    expect(next.reason).toContain('current or a later server KST day');
    expect(next.reason).toContain('F rollback leave this bookkeeping intact');
  });
});
