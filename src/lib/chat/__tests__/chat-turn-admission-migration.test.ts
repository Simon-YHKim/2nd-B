import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..', '..', '..', '..');
const read = (file: string) => readFileSync(join(root, file), 'utf8').replace(/\r\n/g, '\n');
const draft = 'db/migrations/';
const raw = read(`${draft}0265_chat_turn_attempt_with_quota.sql`);
const sql = raw.replace(/--.*$/gm, '');
const body = sql.slice(sql.indexOf('AS $$'), sql.indexOf('\n$$;'));
const regression = read(`db/tests/chat-turn-attempt-with-quota.sql`);
const down = read(`${draft}rollback/0265_down.sql`).replace(/--.*$/gm, '').trim();
const signature = 'public.begin_chat_turn_attempt_with_quota(uuid, uuid, uuid, text, text)';
const raceInvocation = 'bash scripts/test-chat-turn-admission-races.sh';
const hasRaceInvocation = (source: string) => source.split('\n').some((line) => line.trim() === raceInvocation);
const clusterStatements = /\b(?:CREATE|ALTER|DROP)\s+(?:ROLE|USER|GROUP|TABLESPACE)\b|\bALTER\s+SYSTEM\b/i;

describe('T39 E1-S inactive atomic chat admission draft', () => {
  it('keeps one new service-only volatile definer, under the runner transaction', () => {
    expect(raw).toContain('INACTIVE DRAFT');
    expect(raw).toContain('psql --single-transaction');
    expect(sql).not.toMatch(/^\s*(?:BEGIN(?: WORK| TRANSACTION)?|COMMIT(?: WORK)?)\s*;/m);
    expect(sql).toMatch(/p_user_id uuid,\s+p_audit_id uuid,\s+p_turn_id uuid,\s+p_provider text,\s+p_attempt_intent text\s+\) RETURNS jsonb/);
    expect(sql).toMatch(/LANGUAGE plpgsql VOLATILE\s+SECURITY DEFINER\s+SET search_path = ''/);
    expect(sql).toContain(`REVOKE ALL ON FUNCTION ${signature}\n  FROM PUBLIC, anon, authenticated, service_role;`);
    expect(sql).toContain(`GRANT EXECUTE ON FUNCTION ${signature}\n  TO service_role;`);
    expect(sql).toContain("a.grantee = 0 AND a.privilege_type = 'EXECUTE'");
  });

  it('validates role, all ids, the openai seat and explicit intent before taking the user lock', () => {
    const guard = body.slice(0, body.indexOf('PERFORM pg_catalog.pg_advisory_xact_lock'));
    expect(guard).toContain("public.billing_request_role() IS DISTINCT FROM 'service_role'");
    expect(guard).toContain('p_user_id IS NULL OR p_audit_id IS NULL OR p_turn_id IS NULL');
    expect(guard).toContain("p_provider IS DISTINCT FROM 'openai'");
    expect(guard).toContain("p_attempt_intent IS NULL OR p_attempt_intent NOT IN ('first', 'reask')");
    expect(guard).toContain("'invalid_chat_attempt_intent' USING ERRCODE = '22023'");
  });

  it('takes the existing per-user lock before either reservation read and the nested registration', () => {
    const lock = body.indexOf('PERFORM pg_catalog.pg_advisory_xact_lock(');
    expect(lock).toBeGreaterThan(-1);
    expect(body).toContain("pg_catalog.hashtextextended('chat_turn_bump:' || p_user_id::text, 0)");
    expect(lock).toBeLessThan(body.indexOf('SELECT r.attempts INTO v_before'));
    expect(body.match(/WHERE r\.turn_id = p_turn_id AND r\.user_id = p_user_id;/g)).toHaveLength(2);
    expect(body.indexOf('SELECT r.attempts INTO v_before')).toBeLessThan(body.indexOf('v_registered := public.begin_chat_turn_attempt('));
  });

  it('rejects late first before begin; a reask with zero attempts can take the first slot', () => {
    const begin = body.indexOf('v_registered := public.begin_chat_turn_attempt(');
    const late = body.indexOf("IF p_attempt_intent = 'first' AND v_before >= 1 THEN");
    expect(late).toBeGreaterThan(-1);
    expect(late).toBeLessThan(begin);
    expect(body.slice(late, begin)).toContain("'error', 'first_already_registered'");
    expect(body).not.toMatch(/p_attempt_intent = 'reask' AND v_before/);
    expect(body.match(/public\.begin_chat_turn_attempt\(/g)).toHaveLength(1);
    expect(body).toContain("OR (v_attempt = 2 AND p_attempt_intent <> 'reask')");
  });

  it('derives the granted attempt from the owned row and verifies its audit id and increment', () => {
    expect(body).toContain('IF v_registered IS NULL THEN');
    expect(body).toContain('v_attempt IS NULL OR v_attempt NOT IN (1, 2)');
    expect(body).toContain('v_before IS NULL OR v_attempt <> v_before + 1');
    expect(body).toContain('v_attempt_audit IS DISTINCT FROM p_audit_id');
    expect(body).toContain('WHEN 1 THEN r.attempt1_audit_id WHEN 2 THEN r.attempt2_audit_id');
  });

  it('returns a free second or a rejected reask before touching purpose quota', () => {
    const quota = body.indexOf('SELECT q.allowed, q.used, q.quota_limit INTO STRICT v_quota');
    const second = body.slice(body.indexOf('IF v_attempt = 2 THEN'), quota);
    expect(quota).toBeGreaterThan(-1);
    expect(second).toContain("'allowed', true, 'kind', 'reask', 'attempt', 2");
    expect(second).toContain("'quotaCharged', false, 'bindingEligible', true, 'reaskAvailable', false");
    expect(second).toContain("ELSIF p_attempt_intent = 'reask' THEN");
    expect(second).toContain("'error', 'reask_ineligible'");
    expect(body.match(/public\.consume_llm_proxy_purpose_quota\(/g)).toHaveLength(1);
    expect(body).toContain("public.consume_llm_proxy_purpose_quota(p_user_id, p_provider, 'secondb_chat')");
  });

  it('raises T3901 only for a well-formed normal denial, rolling back the registration', () => {
    expect(body).toContain('INTO STRICT v_quota');
    expect(body).toContain('v_quota.allowed IS NULL OR v_quota.used IS NULL OR v_quota.quota_limit IS NULL');
    expect(body).toContain('v_quota.used < 1 OR v_quota.used > 10000');
    expect(body).toContain('v_quota.quota_limit < 1 OR v_quota.quota_limit > 10000');
    expect(body).toContain('(v_quota.allowed AND v_quota.used > v_quota.quota_limit)');
    expect(body).toContain('(NOT v_quota.allowed AND v_quota.used < v_quota.quota_limit)');
    expect(body).toMatch(/IF v_quota\.allowed = false THEN\s+RAISE EXCEPTION 'purpose_limit_exceeded' USING ERRCODE = 'T3901';\s+END IF;/);
    expect(body.match(/'T3901'/g)).toHaveLength(1);
    expect(body).not.toMatch(/EXCEPTION\s+WHEN|WHEN OTHERS|RETURN false/);
  });

  it('returns complete admission fields and keeps mode and actual claim outside SQL', () => {
    expect(body).toContain("'attempt', CASE WHEN v_registered THEN 1 ELSE NULL END");
    expect(body).toContain("'quotaCharged', true, 'bindingEligible', v_registered, 'reaskAvailable', v_registered");
    for (const key of ['allowed', 'kind', 'attempt', 'quotaCharged', 'bindingEligible', 'reaskAvailable', 'error']) {
      expect(body.match(new RegExp(`'${key}'`, 'g'))).toHaveLength(4);
    }
    expect(body).not.toMatch(/'mode'|'turnBound'|public\.claim_chat_turn_for_audit/);
  });

  it('does not add storage, rewrite old functions, copy quota policy or impose a date/exemption cap', () => {
    expect(sql.match(/CREATE OR REPLACE FUNCTION /g)).toHaveLength(1);
    expect(sql).not.toMatch(/\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|POLICY|INDEX|TRIGGER)|\b(?:INSERT INTO|UPDATE|DELETE FROM)\b/i);
    expect(sql).not.toMatch(/chat_usage|llm_proxy_purpose_daily|erasure_registry|counted_day|issued_at|Asia\/Seoul|effective_subscription_tier/);
    expect(down).toBe(`DROP FUNCTION IF EXISTS ${signature};`);
    expect(down).not.toMatch(/CASCADE/);
  });

  it('pairs source contracts with rollback-only PostgreSQL behavior assertions, including lower-function errors', () => {
    expect(regression).toMatch(/^\\set ON_ERROR_STOP on/m);
    expect(regression.trim()).toMatch(/ROLLBACK;$/);
    for (const label of ['T04 missing and foreign first same', 'T05 reask zero to one charges',
      'T06 rejected late first cannot claim', 'T07 legacy second at 5/5 exempt',
      'T08 quota rejection rolled back registration and cleanup', 'T08 error classification',
      'date second changes neither day quota', 'T07 six exemptions no purpose write',
      'T05 all admissions added zero chat bumps']) {
      expect(regression).toContain(label);
    }
    expect(regression.indexOf('T08 quota rejection rolled back registration')).toBeLessThan(regression.indexOf('T08 only normal quota denial is T3901'));
    expect(regression).toContain('SET LOCAL ROLE service_role;');
    expect(regression).toContain("EXCEPTION WHEN SQLSTATE 'ZX039' THEN NULL;");
  });

  it('runs the inactive draft and rollback on a full-schema CI clone without altering the numbered lane', () => {
    const workflow = read('.github/workflows/supabase-dry-run.yml');
    const start = workflow.indexOf('- name: Exercise dormant T39 admission on full schema clone');
    expect(start).toBeGreaterThan(-1);
    const lane = workflow.slice(start, workflow.indexOf('- name: Verify promoted server-first contracts', start));
    expect(lane).toContain('CREATE DATABASE t39_admission_test_ci TEMPLATE t39_t40_before_0266');
    expect(lane).toContain('--single-transaction -f db/migrations/0265_chat_turn_attempt_with_quota.sql');
    expect(lane).toContain('--single-transaction -f db/migrations/rollback/0265_down.sql');
    expect(lane.match(/-f db\/tests\/chat-turn-attempt-with-quota\.sql/g)).toHaveLength(2);
    expect(lane).toContain('T39 rollback must remove only the new entrypoint');
    expect(lane).toContain('set -euo pipefail');
    expect(hasRaceInvocation(lane)).toBe(true);
    expect(lane).toMatch(/^        timeout-minutes: 10$/m);
    expect(lane.replace(/^\s*#.*$/gm, '')).not.toMatch(/SUPABASE|DATABASE_URL|secrets\.|ALTER ROLE|pg_ctl/);
  });

  it('rejects a commented, missing or failure-masked CI race invocation', () => {
    const source = read('.github/workflows/supabase-dry-run.yml');
    expect(hasRaceInvocation(source)).toBe(true);
    for (const replacement of ['', `# ${raceInvocation}`, `${raceInvocation} || true`]) {
      expect(hasRaceInvocation(source.replace(raceInvocation, replacement))).toBe(false);
    }
  });

  it('dumps failure evidence before teardown, closes every pipe writer and bounds client reaping', () => {
    const runner = read('scripts/test-chat-turn-admission-races.sh');
    const cleanup = runner.slice(runner.indexOf('cleanup() {'), runner.indexOf('trap cleanup EXIT'));
    expect(cleanup.indexOf('cat "$file" >&2')).toBeGreaterThan(-1);
    expect(cleanup).toContain('echo "T39 log: $file" >&2');
    expect(cleanup).toContain('echo "T39 race logs: $work"');
    expect(cleanup.indexOf('cat "$file" >&2')).toBeLessThan(cleanup.indexOf('close_leader_pipes'));
    expect(cleanup.indexOf('echo "T39 race logs: $work"')).toBeLessThan(cleanup.indexOf('pg_terminate_backend'));
    expect(cleanup.indexOf('close_leader_pipes')).toBeLessThan(cleanup.indexOf('reap_client "$leader_pid"'));
    expect(cleanup).toContain('reap_client "$follower_pid"');
    expect(cleanup).not.toContain('wait "$leader_pid"');
    expect(runner).toContain('exec {leader_in}>&-');
    expect(runner).toContain('exec {coproc_in}>&- {coproc_out}<&-');
    expect(runner).toContain('coproc LEADER { exec "${psql[@]}"');
    expect(runner).toContain('for signal in TERM KILL; do');
    expect(runner).toContain('deadline=$((SECONDS + 2))');
    expect(runner).toContain('while kill -0 "$pid" 2>/dev/null && (( SECONDS < deadline ))');
    expect(runner).toContain('kill -"$signal" "$pid"');
  });

  it('keeps runner and fixture free of cluster-wide mutations', () => {
    for (const source of [read('scripts/test-chat-turn-admission-races.sh'),
      read(`db/tests/chat-turn-admission-race-fixture.sql`)]) {
      expect(source.replace(/^\s*(?:#|--).*$/gm, '')).not.toMatch(clusterStatements);
    }
    for (const statement of ['ALTER ROLE service_role BYPASSRLS;', 'CREATE USER fixture;',
      'DROP ROLE fixture;', 'ALTER\nSYSTEM SET max_connections = 99;']) {
      expect(statement).toMatch(clusterStatements);
    }
  });

  it('runs real blocked sessions and requires the isolated lock mutant to fail for the expected reason', () => {
    const runner = read('scripts/test-chat-turn-admission-races.sh');
    const executable = runner.replace(/^\s*#.*$/gm, '');
    expect(runner).toContain('set -euo pipefail');
    expect(runner).toContain('-v ON_ERROR_STOP=1');
    expect(runner).toContain('wait "$follower_pid"');
    expect(runner).toContain('trap cleanup EXIT');
    expect(runner).toContain('pg_terminate_backend(pid)');
    expect(runner).toContain('b.pid = ANY(pg_blocking_pids(a.pid))');
    expect(runner).toContain("a.wait_event_type = 'Lock' AND a.wait_event = '$event'");
    expect(runner.match(/^\s*observe_wait advisory$/gm)).toHaveLength(4);
    expect(runner.match(/^\s*observe_wait transactionid$/gm)).toHaveLength(2);
    expect(runner).toContain('zero_schedules=(zero-first-first zero-reask-reask zero-first-reask zero-reask-first)');
    expect(runner).toContain('for schedule in "${zero_schedules[@]}"; do zero_attempt_race "$schedule"; done');
    expect(runner).toContain('zero_attempt_race "$2"');
    for (const schedule of ['one-reask-reask', 'consume-before-admission',
      'admission-before-consume', 'bump-before-reask', 'reask-before-bump']) {
      expect(runner).toContain(`case_name=${schedule}`);
    }
    expect(runner).toContain('CREATE DATABASE t39_admission_mutant_test_ci TEMPLATE t39_admission_test_ci');
    expect(runner).toContain('source.split(lock).length !== 2');
    expect(runner).toContain("source.replace(lock, '')");
    expect(runner).toContain('-d t39_admission_mutant_test_ci --single-transaction -f "$work/no-user-lock.sql"');
    expect(runner).toContain('bash scripts/test-chat-turn-admission-races.sh --mutant');
    expect(runner).toContain('[[ "$mutation_status" = 3 ]]');
    expect(runner).toContain('grep -q "T39 WAIT $schedule: Lock/advisory"');
    expect(runner).toContain("grep -q 'ERROR:  *55000: chat_admission_invalid_state'");
    expect(executable).not.toMatch(/SUPABASE|DATABASE_URL|secrets\.|pg_ctl|ON_ERROR_STOP=0/);
    const workflow = read('.github/workflows/supabase-dry-run.yml');
    expect(workflow.split('permissions:')[0]).toContain('"scripts/test-chat-turn-admission-races.sh"');
  });

  it('pins all zero-attempt orders to exact outcomes and one purpose charge', () => {
    const runner = read('scripts/test-chat-turn-admission-races.sh');
    expect(runner).toContain('zero-first-first) n=1; first_intent=first; next_intent=first; next_kind=rejected; next_reason="\'first_already_registered\'"; attempts=1');
    expect(runner).toContain('zero-reask-reask) n=7; first_intent=reask; next_intent=reask; next_kind=reask');
    expect(runner).toContain('zero-first-reask) n=8; first_intent=first; next_intent=reask; next_kind=reask');
    expect(runner).toContain('zero-reask-first) n=9; first_intent=reask; next_intent=first; next_kind=rejected; next_reason="\'first_already_registered\'"; attempts=1');
    expect(runner).toContain('next_reason=NULL attempts=2');
    expect(runner).toContain('SELECT t39_race.state($n,$attempts,1);');
    const fixture = read(`db/tests/chat-turn-admission-race-fixture.sql`);
    expect(fixture.match(/generate_series\(1,9\)/g)).toHaveLength(4);
    expect(fixture).toContain('FROM generate_series(2,6) n CROSS JOIN t39_race.clock');
  });

  it('checks persisted counters, exact response fields and T3901 rollback with actual SQL roles', () => {
    const fixture = read(`db/tests/chat-turn-admission-race-fixture.sql`);
    const runner = read('scripts/test-chat-turn-admission-races.sh');
    expect(fixture).toMatch(/^\\set ON_ERROR_STOP on/m);
    expect(fixture).toContain("EXCEPTION WHEN SQLSTATE 'T3901' THEN RETURN true;");
    expect(fixture).not.toContain('WHEN OTHERS');
    expect(fixture).toContain('attempt1_audit_id IS NOT DISTINCT FROM');
    expect(fixture).toContain('attempt2_audit_id IS NOT DISTINCT FROM');
    expect(fixture).toContain('(attempted_at IS NULL) = (attempts_want = 0)');
    expect(fixture).toContain('sum(count) = quota_sum');
    expect(fixture).toContain("'bump retired prior reservation '");
    expect(runner).toContain('SET LOCAL ROLE service_role;');
    expect(runner).toContain('SET LOCAL ROLE authenticated;');
    expect(runner).toContain('SELECT t39_race.state(3,0,9);');
  });
});
