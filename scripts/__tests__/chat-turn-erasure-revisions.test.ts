import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderRegistryRevisionsSql } from '../erasure-registry-forward';

const read = (name: string) => readFileSync(resolve(__dirname, '../..', name), 'utf8').replace(/\r\n/g, '\n');
const registry = JSON.parse(read('db/erasure-registry.json'));
const table = 'chat_turn_reservations';
const stages = [
  ['0268', 'chat-turn-refund-evidence', '0266'],
  ['0269', 'chat-turn-purpose-restore', '0267'],
] as const;
const sidecars = stages.map(([, side]) => JSON.parse(read(`db/migration-drafts/${side}-erasure-revision.json`)));

describe('numbered S/F erasure reason revisions', () => {
  test('preserves the 0258 to S to F chain and changes only the reason', () => {
    const s = sidecars[0].tables[table];
    const f = sidecars[1].tables[table];
    expect(read('db/migrations/0258_chat_turn_reservations_erasure_registry.sql')).toContain(`'${s.previousReason}'`);
    expect(f.previousReason).toBe(s.reason);
    expect(registry.tables[table]).toEqual({ owner: 'user_id', class: 'account_delete_only', reason: f.reason });
    expect(f.reason).toContain('current or a later server KST day');
    expect(f.reason).toContain('Without another bump rows remain until account deletion');
    expect(f.reason).toContain('Content erasure and F rollback leave this bookkeeping intact');
    for (const entry of [s, f]) {
      expect(entry.owner).toBe('user_id');
      expect(entry.class).toBe('account_delete_only');
      expect(Object.keys(entry).sort()).toEqual(['class', 'owner', 'previousReason', 'reason']);
    }
  });

  test.each(stages)('%s is a declared, generated revision after its table change', (number, side, prerequisite) => {
    const data = JSON.parse(read(`db/migration-drafts/${side}-erasure-revision.json`));
    const file = `${number}_${side.replace(/-/g, '_')}_erasure_registry_reason.sql`;
    expect(data.forwardMigration).toBe(`db/migrations/${file}`);
    expect(JSON.stringify(data)).not.toMatch(/UNNUMBERED|Draft candidate|at promotion/i);
    const { previousReason, ...entry } = data.tables[table];
    expect(registry.forwardRevisions[file]).toEqual({ [table]: { previousReason } });
    const sql = read(data.forwardMigration);
    const code = sql.replace(/^--[^\n]*(?:\n|$)/gm, '').trim();
    expect(code).toBe(renderRegistryRevisionsSql({ [table]: { entry, previousReason } })
      .replace(/^--[^\n]*(?:\n|$)/gm, '').trim());
    expect(Number(number)).toBeGreaterThan(Number(prerequisite));
    expect(read('db/migrations/rollback/0189_down.sql')).toContain(`'${file.slice(5, -4)}'`);
  });

  test('CI keeps both revision rows in the control and checks exact causal failures', () => {
    const workflow = read('.github/workflows/supabase-dry-run.yml');
    const verify = workflow.split('- name: Verify promoted server-first contracts')[1].split('- name:')[0];
    for (const [number, side] of stages) {
      const stem = `${side.replace(/-/g, '_')}_erasure_registry_reason`;
      expect(verify).toContain(`('${number}', '${stem}')`);
      expect(workflow.split('pair="')[1].split('"')[0]).toContain(stem);
      const control = workflow.split('echo "== control:')[1].split('echo "== fixed:')[0];
      expect(control).toContain(`'${stem}'`);
      expect(control).toContain(` ${stem}`);
    }
    for (const [retained, successor] of [
      ['chat_turn_reservations_erasure_registry', '0268_chat_turn_refund_evidence_erasure_registry_reason'],
      ['chat_turn_refund_evidence_erasure_registry_reason', '0269_chat_turn_purpose_restore_erasure_registry_reason'],
    ]) {
      const causal = workflow.split(`elif [[ "$1" == "${retained}" ]]`)[1].split(/\n\s+(?:elif|fi)\b/)[0];
      expect(causal).toContain(`Applying migration ${successor}.sql`);
      expect(causal).toContain('erasure_revisions_row_not_in_recorded_state: chat_turn_reservations');
      expect(causal).toContain('SQLSTATE P0001');
    }
    expect(verify).toContain('))) <> 16');
  });

  test('DPIA and rollout guide use the numbered chain without claiming production application', () => {
    const dpia = read('docs/legal/DPIA-2ndB-minors-draft.md').split('**[T40 S numbered')[1].split('\n')[0];
    for (const data of sidecars) expect(dpia).toContain(data.forwardMigration.split('/').pop());
    expect(dpia).not.toMatch(/registry candidate|reason-only candidate|still needs a separate/);
    expect(dpia).toContain('No S deployment was performed');
    expect(dpia).toContain('No F deployment was performed');
    expect(dpia).toContain('0265 → 0266 → 0267 → 0268 → 0269');
    expect(read('db/README.md')).toContain('0268 S reason → 0269 F reason');
  });
});
