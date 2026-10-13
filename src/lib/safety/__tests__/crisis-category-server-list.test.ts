import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  CRISIS_EVENT_CATEGORY_LIMIT,
  CRISIS_EVENT_FIXED_CATEGORIES,
  UNLISTED_CRISIS_CATEGORY,
  recordableCrisisCategories,
} from '../crisis-event-categories';

const ROOT = join(__dirname, '..', '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const strip = (s: string) => s.replace(/--.*$/gm, '');
const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
// The two write functions, from the first CREATE to the end of the second body.
const writeFunctions = (sql: string) => {
  const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.log_crisis_event(');
  const once = sql.indexOf('CREATE OR REPLACE FUNCTION public.log_crisis_event_once(', start);
  return sql.slice(start, sql.indexOf('$$;', once) + 3);
};
const listOf = (sql: string, name: string): string[] => {
  const match = new RegExp(`${name} constant text\\[\\] := ARRAY\\[([^\\]]+)\\];`).exec(sql);
  if (!match) throw new Error(`${name} not found`);
  return [...match[1].matchAll(/'([^']*)'/g)].map((m) => m[1]);
};

type Case = { name: string; in: string[]; out: string[] };

describe('0254 위기 기록의 범주 칸은 서버에서도 닫힌 목록만 남긴다 (Q-261013-66)', () => {
  const raw = read('db/migrations/0254_crisis_category_closed_list.sql');
  const sql = strip(raw);
  const names = listOf(sql, 'v_names');
  const numbers = listOf(sql, 'v_numbers');
  const fixtureText = read('db/tests/fixtures/crisis-category-cases.json');
  const cases = (JSON.parse(fixtureText) as { cases: Case[] }).cases;

  // The rule the migration states, written out once more so the shared cases can be
  // checked without a database. The SQL regression checks the real function against
  // the same file.
  const serverRule = (given: readonly string[]): string[] => {
    const isReply = given.includes('output_swap');
    const out: string[] = [];
    for (const entry of given) {
      let kept: string;
      if (names.includes(entry)) kept = entry;
      else if (!isReply) continue;
      else if (numbers.includes(entry)) kept = entry;
      else kept = UNLISTED_CRISIS_CATEGORY;
      if (!out.includes(kept)) out.push(kept);
    }
    return out;
  };

  it('서버의 이름 목록은 앱의 닫힌 목록에서 unlisted 만 뺀 것이고 순서도 같다', () => {
    expect(names).toEqual(CRISIS_EVENT_FIXED_CATEGORIES.filter((name) => name !== UNLISTED_CRISIS_CATEGORY));
    expect(CRISIS_EVENT_FIXED_CATEGORIES).toContain(UNLISTED_CRISIS_CATEGORY);
    expect(sql).toMatch(/v_unlisted constant text := 'unlisted';/);
    expect(UNLISTED_CRISIS_CATEGORY).toBe('unlisted');
  });

  it('서버의 번호는 crisis_term:1 ~ 19 열아홉 개이고, 앱이 번호로 받는 것과 같다', () => {
    expect(numbers).toEqual(Array.from({ length: 19 }, (_, i) => `crisis_term:${i + 1}`));
    const candidates = [
      ...Array.from({ length: 31 }, (_, i) => `crisis_term:${i}`),
      'crisis_term:01',
      'crisis_term:',
      'crisis_term:1a',
      'crisis_term: 1',
      'CRISIS_TERM:1',
    ];
    for (const candidate of candidates) {
      const sent = recordableCrisisCategories(['output_swap', candidate]);
      expect([candidate, sent[1] === candidate]).toEqual([candidate, numbers.includes(candidate)]);
    }
  });

  it('공유 경우 파일: 규칙대로 정리한 값이 적힌 값과 같다', () => {
    expect(fixtureText).toMatch(/^[\x00-\x7F]*$/);
    expect(cases.length).toBeGreaterThanOrEqual(16);
    expect(new Set(cases.map((c) => c.name)).size).toBe(cases.length);
    for (const c of cases) {
      expect([c.name, serverRule(c.in)]).toEqual([c.name, c.out]);
      // A cleaned list is left alone, which is what the once-only comparison relies on.
      expect([c.name, serverRule(c.out)]).toEqual([c.name, c.out]);
    }
    expect(cases.some((c) => c.in.includes('output_swap') && c.out.includes(UNLISTED_CRISIS_CATEGORY))).toBe(true);
    expect(cases.some((c) => !c.in.includes('output_swap') && c.in.length > 0 && c.out.length === 0)).toBe(true);
  });

  it('공유 경우 파일: 앱이 보내는 값을 서버가 정리하면 적힌 값이 된다', () => {
    for (const c of cases) {
      const sent = recordableCrisisCategories(c.in);
      const stored = c.out.slice(0, CRISIS_EVENT_CATEGORY_LIMIT);
      expect([c.name, serverRule(sent)]).toEqual([c.name, stored]);
      // For a swapped AI reply the app already sends exactly what the row will hold.
      if (c.in.includes('output_swap')) expect([c.name, sent]).toEqual([c.name, stored]);
      // A record from user input never holds a number or 'unlisted'.
      else expect(c.out.every((entry) => names.includes(entry))).toBe(true);
    }
  });

  it('두 쓰기 함수는 0181 의 본문에서 범주가 지나는 다섯 자리만 다르다', () => {
    const before = writeFunctions(strip(read('db/migrations/0181_client_audit_ingest_hardening.sql')));
    const swaps: [string, string][] = [
      [
        "p_trigger_categories, p_routing_template_version, p_locale, 'client_unverified'",
        "public.normalize_client_crisis_categories(p_trigger_categories), p_routing_template_version, p_locale, 'client_unverified'",
      ],
      ['v_confidence numeric(4,3);', 'v_confidence numeric(4,3); v_triggers text[];'],
      [
        'v_confidence := p_classifier_confidence;',
        'v_confidence := p_classifier_confidence; v_triggers := public.normalize_client_crisis_categories(p_trigger_categories);',
      ],
      [
        'OR v_existing.trigger_categories IS DISTINCT FROM p_trigger_categories',
        'OR public.normalize_client_crisis_categories(v_existing.trigger_categories) IS DISTINCT FROM v_triggers',
      ],
      ["v_owner_hash, 'red', v_confidence, p_trigger_categories,", "v_owner_hash, 'red', v_confidence, v_triggers,"],
    ];
    let expected = squash(before);
    for (const [from, to] of swaps) {
      expect(expected.split(from)).toHaveLength(2);
      expected = expected.replace(from, to);
    }
    expect(squash(writeFunctions(sql))).toBe(expected);
  });

  it('오류 문구는 전부 고정이고, 알림 · 로그를 내지 않는다', () => {
    const raises = [...sql.matchAll(/RAISE\b[^;]*;/g)].map((m) => squash(m[0]));
    expect(raises.length).toBe(4);
    for (const raise of raises) {
      expect(raise).toMatch(/^RAISE EXCEPTION '[^'%]+' USING ERRCODE = '[0-9A-Z]{5}';$/);
    }
    expect(sql).not.toMatch(/RAISE\s+(NOTICE|LOG|INFO|WARNING|DEBUG)/i);
  });

  it('정리 함수는 안에서만 불리고, 쓰기 함수의 권한은 0181 그대로다', () => {
    expect(sql).toMatch(
      /FUNCTION public\.normalize_client_crisis_categories\(p_categories text\[\]\)\s+RETURNS text\[\]\s+LANGUAGE plpgsql\s+IMMUTABLE\s+SECURITY INVOKER\s+SET search_path = ''/,
    );
    for (const role of ['PUBLIC', 'anon', 'authenticated', 'service_role']) {
      expect(sql).toContain(`REVOKE ALL ON FUNCTION public.normalize_client_crisis_categories(text[]) FROM ${role};`);
    }
    const grants = (text: string) =>
      text
        .split('\n')
        .filter((line) => /^(REVOKE|GRANT) .*public\.log_crisis_event(_once)?\(/.test(line))
        .join('\n');
    expect(grants(sql)).toBe(grants(strip(read('db/migrations/0181_client_audit_ingest_hardening.sql'))));
    expect(grants(sql).split('\n')).toHaveLength(8);
    expect(sql).not.toMatch(/^[ \t]*(BEGIN([ \t]+(WORK|TRANSACTION))?|COMMIT([ \t]+WORK)?)[ \t]*;/im);
  });

  it('롤백은 0181 의 두 함수 본문을 글자 그대로 되돌리고 정리 함수를 지운다', () => {
    const original = writeFunctions(read('db/migrations/0181_client_audit_ingest_hardening.sql'));
    const down = read('db/migrations/rollback/0254_down.sql');
    expect(original.length).toBeGreaterThan(2500);
    expect(writeFunctions(down)).toBe(original);
    expect(down).toContain('DROP FUNCTION IF EXISTS public.normalize_client_crisis_categories(text[]);');
  });

  it('CI 가 회귀 SQL 을 실제로 돌린다', () => {
    const workflow = read('.github/workflows/supabase-dry-run.yml');
    expect(workflow).toMatch(
      /run: psql -X -h localhost -U postgres -v ON_ERROR_STOP=1 -f db\/tests\/crisis_category_closed_list_regression\.sql/,
    );
  });
});
