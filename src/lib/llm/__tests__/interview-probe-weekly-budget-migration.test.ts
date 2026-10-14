import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const HEAD = 'CREATE OR REPLACE FUNCTION public.consume_llm_proxy_purpose_quota(';
/** The quota function statement, up to and including its closing `$$;`. */
const fnOf = (text: string) => {
  const at = text.indexOf(HEAD);
  if (at < 0) return '';
  return text.slice(at, text.indexOf('\n$$;\n', at) + '\n$$;\n'.length);
};
const count = (text: string, part: string) => text.split(part).length - 1;
const once = (text: string, part: string, next: string) => {
  expect(count(text, part)).toBe(1);
  return text.replace(part, next);
};

describe('0259 인터뷰 질문의 주 단위 예산 (Simon 2026-10-14 Q-261014-17)', () => {
  const base = read('db/migrations/0185_llm_proxy_purpose_quota.sql');
  const up = read('db/migrations/0259_interview_probe_weekly_budget.sql');
  const down = read('db/migrations/rollback/0259_down.sql');
  const fn185 = fnOf(base);
  const fn259 = fnOf(up);

  it('함수는 0185 의 글자 그대로이고 정확히 세 곳만 다르다(다른 좌석 · 권한 확인 · 45일 정리는 그대로)', () => {
    expect(fn185.length).toBeGreaterThan(4000);
    let expected = once(fn185, '  v_used  integer;\nBEGIN\n', '  v_used  integer;\n  v_week  integer;\n  v_week_limit integer;\nBEGIN\n');
    expected = once(
      expected,
      "    WHEN p_purpose IN (\n      'audit_qa', 'capture_voice', 'clipper_template_propose', 'cluster_infer',\n" +
        "      'gap_synthesize', 'import_ingest', 'interview_probe',\n",
      "    -- Interview questions: a daily ceiling here and a rolling seven-day budget below (0259).\n" +
        "    WHEN p_purpose = 'interview_probe' THEN CASE v_tier\n" +
        "      WHEN 'brain'  THEN 750\n      WHEN 'cortex' THEN 300\n      WHEN 'soma'   THEN 150\n      ELSE 60\n    END\n" +
        "    WHEN p_purpose IN (\n      'audit_qa', 'capture_voice', 'clipper_template_propose', 'cluster_infer',\n" +
        "      'gap_synthesize', 'import_ingest',\n",
    );
    expected = once(
      expected,
      '  v_used := NULL;\n  INSERT INTO public.llm_proxy_purpose_daily AS daily\n',
      '  -- Interview questions are budgeted by the week as well (0259): the last seven KST days, today\n' +
        '  -- included, under the daily ceiling above. One decision at a time per user and seat, so two calls\n' +
        '  -- that arrive together cannot both take the last question of the week.\n' +
        "  IF p_purpose = 'interview_probe' THEN\n" +
        '    v_week_limit := CASE v_tier\n' +
        "      WHEN 'brain'  THEN 1750\n      WHEN 'cortex' THEN 700\n      WHEN 'soma'   THEN 350\n      ELSE 140\n    END;\n" +
        '    PERFORM pg_catalog.pg_advisory_xact_lock(\n' +
        "      pg_catalog.hashtextextended('llm_proxy_purpose_week:' || p_user_id::text || ':' || p_purpose, 0));\n" +
        '    SELECT COALESCE(pg_catalog.sum(daily.count), 0)::integer\n' +
        '      INTO v_week\n' +
        '      FROM public.llm_proxy_purpose_daily AS daily\n' +
        '     WHERE daily.user_id = p_user_id\n' +
        '       AND daily.purpose = p_purpose\n' +
        '       AND daily.kst_day BETWEEN v_day - 6 AND v_day;\n' +
        '    IF v_week >= v_week_limit THEN\n' +
        '      RETURN QUERY SELECT false, v_week, v_week_limit;\n' +
        '      RETURN;\n' +
        '    END IF;\n' +
        '  END IF;\n\n' +
        '  v_used := NULL;\n  INSERT INTO public.llm_proxy_purpose_daily AS daily\n',
    );
    expect(fn259).toBe(expected);
  });

  it('숫자: 무료는 원문 그대로(하루 60 · 주 140), 다른 등급은 화면 창의 제안(주 = 옛 하루 몫 x 7 · 하루 = x 3)', () => {
    const old = { brain: 250, cortex: 100, soma: 50, free: 20 };
    const day = /WHEN p_purpose = 'interview_probe' THEN CASE v_tier\s+WHEN 'brain'\s+THEN (\d+)\s+WHEN 'cortex' THEN (\d+)\s+WHEN 'soma'\s+THEN (\d+)\s+ELSE (\d+)/.exec(fn259);
    const week = /v_week_limit := CASE v_tier\s+WHEN 'brain'\s+THEN (\d+)\s+WHEN 'cortex' THEN (\d+)\s+WHEN 'soma'\s+THEN (\d+)\s+ELSE (\d+)/.exec(fn259);
    expect(day?.slice(1).map(Number)).toEqual([750, 300, 150, 60]);
    expect(week?.slice(1).map(Number)).toEqual([1750, 700, 350, 140]);
    // paid tiers follow one rule; the free numbers are the owner's own
    expect([old.brain * 3, old.cortex * 3, old.soma * 3]).toEqual(day?.slice(1, 4).map(Number));
    expect([old.brain * 7, old.cortex * 7, old.soma * 7]).toEqual(week?.slice(1, 4).map(Number));
    expect(up).toContain('「Q-261014-17 인터뷰 한도 - 한도: 가. 주 단위 예산(임시 주 140 · 하루 60)');
    // every number fits the proxies' check of the answer (1 <= limit <= 10000)
    for (const n of [...(day?.slice(1) ?? []), ...(week?.slice(1) ?? [])].map(Number)) {
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(10000);
    }
  });

  it('주 예산은 그 사용자 · 그 좌석의 최근 7일이고, 잠금이 먼저 · 하루 카운터를 올리기 전에 본다', () => {
    const at = (part: string) => fn259.indexOf(part);
    const order = [
      at("v_limit := CASE"),
      at('DELETE FROM public.llm_proxy_purpose_daily'),
      at('pg_catalog.pg_advisory_xact_lock('),
      at('SELECT COALESCE(pg_catalog.sum(daily.count), 0)::integer'),
      at('IF v_week >= v_week_limit THEN'),
      at('INSERT INTO public.llm_proxy_purpose_daily AS daily'),
    ];
    expect(order.every((n) => n >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(count(fn259, 'pg_advisory_xact_lock')).toBe(1);
  });

  it('권한과 꼴은 그대로: 프록시(service_role)만 부르고, 스스로 트랜잭션을 열지 않으며, 적용 때 그것을 확인한다', () => {
    expect(up).toContain('REVOKE ALL ON FUNCTION public.consume_llm_proxy_purpose_quota(uuid, text, text)\n  FROM PUBLIC, anon, authenticated, service_role;');
    expect(up).toContain('GRANT EXECUTE ON FUNCTION public.consume_llm_proxy_purpose_quota(uuid, text, text) TO service_role;');
    expect(count(up, 'GRANT ')).toBe(1);
    expect(up).not.toMatch(/^[ \t]*(BEGIN([ \t]+(WORK|TRANSACTION))?|COMMIT([ \t]+WORK)?)[ \t]*;/im);
    expect(up).not.toMatch(/CREATE TABLE|ALTER TABLE|DROP |DELETE FROM public\.(?!llm_proxy_purpose_daily)/);
    expect(up).toMatch(/DO \$verify0259\$[\s\S]*p\.prosrc LIKE '%llm_proxy_purpose_week:%'[\s\S]*\$verify0259\$;/);
  });

  it('되돌리기는 0185 의 함수 · 권한 · 설명을 글자 그대로 되돌린다', () => {
    expect(down).toContain(fn185);
    const grants = base.slice(base.indexOf('REVOKE ALL ON FUNCTION public.consume_llm_proxy_purpose_quota(uuid, text, text)'), base.indexOf('COMMENT ON FUNCTION public.consume_llm_proxy_purpose_quota'));
    expect(grants.length).toBeGreaterThan(100);
    expect(down).toContain(grants);
    expect(down).toContain("'Service-only atomic KST-day allowance with server-owned provider seats, tiers, and limits.';");
    expect(down).not.toMatch(/llm_proxy_purpose_week|v_week/);
  });

  it('CI 가 회귀를 돌리고, 회귀가 두 가장자리 · 7일 경계 · 다른 좌석 · 등급 · 되돌리기 왕복을 본다', () => {
    const workflow = read('.github/workflows/supabase-dry-run.yml');
    expect(workflow).toMatch(/- name: Exercise the weekly interview budget \(0259\)\n\s+env:\n\s+PGPASSWORD: postgres\n\s+run: psql -X -h localhost -U postgres -v ON_ERROR_STOP=1 -f db\/tests\/interview_probe_weekly_budget_regression\.sql/);
    const regression = read('db/tests/interview_probe_weekly_budget_regression.sql');
    for (const want of [
      "'interview_probe') = 'false/60/60'",
      "'interview_probe') = 'false/140/140'",
      "'interview_probe') = 'false/350/350'",
      "'interview_probe') = 'false/150/140'",
      "'ops_recommend') = 'false/20/20'",
      "'axis_estimate') = 'true/1/5'",
      "'interview_probe') = 'false/40/20'",
      '\\ir ../migrations/rollback/0259_down.sql',
      '\\ir ../migrations/0259_interview_probe_weekly_budget.sql',
      ":'today'::date - 7, 'interview_probe', 60",
    ]) {
      expect(regression).toContain(want);
    }
    expect(regression.trimEnd().endsWith('ROLLBACK;')).toBe(true);
    // never across KST midnight, and never two side-effecting calls in one assertion
    expect(regression).toMatch(/DO \$w59_midnight\$[\s\S]*IF v_left < interval '2 minutes' THEN[\s\S]*\$w59_midnight\$;/);
    expect(regression).toContain("'the run crossed KST midnight, so its cases spanned two days: run it again'");
    for (const statement of regression.split(/;\n/)) {
      expect((statement.match(/pg_temp\.w_calls?\(/g) ?? []).length).toBeLessThanOrEqual(1);
    }
    // the race in CI: two sessions for the last place of a week of 139
    const race = workflow.slice(workflow.indexOf('- name: Race two interview questions for the last place of the week (0259)'));
    expect(race).toMatch(/'interview_probe', 60\),[\s\S]*'interview_probe', 60\),[\s\S]*'interview_probe', 19\);/);
    expect(race).toContain('-c "SELECT pg_sleep(3)"');
    expect(race).toContain('if [[ "$a $b $week" != "a=true/1/60 b=false/140/140 140" ]]; then');
    expect(race).toContain("trap 'drop_clone || true' EXIT");
  });
});
