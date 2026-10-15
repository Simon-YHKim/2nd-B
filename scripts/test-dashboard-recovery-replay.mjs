// Re-run the numbered suites against the installed 0249 definitions. Keep the
// original files pinned; only their clock fixtures and obsolete UTC=3 control
// expectations change. No production definition is stubbed for these replays.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function recoveryReplaySql(fixtureDir) {
  const read = (file) => readFileSync(resolve(fixtureDir, file), 'utf8').replaceAll('\r\n', '\n');
  const once = (text, from, to) => {
    if (text.split(from).length !== 2) throw new Error(`Replay adaptation drift: ${from}`);
    return text.replace(from, to);
  };
  const snapshot = `CREATE TEMP TABLE recovery_count_clock AS SELECT pg_get_functiondef(
    'public.dashboard_generation_attempt_count(uuid,text,text)'::regprocedure) AS definition;`;
  const clock = `EXECUTE replace((SELECT definition FROM recovery_count_clock),'now()',
    CASE WHEN at_time IS NULL THEN 'now()' ELSE format('%L::timestamptz',at_time) END);`;
  let note = once(read('dashboard_last_note_regression.sql'), 'CREATE TEMP TABLE last_note_versions', `${snapshot}\nCREATE TEMP TABLE last_note_versions`);
  note = once(note, '  EXECUTE body;', `  EXECUTE body;\n  ${clock}`);
  // 0248 intentionally closed the old 07:00 residual. Retain the 0245 control,
  // and check that 0249 claims at 07:00 and does not duplicate it at 09:00.
  note = once(note, "ELSE b->>'kind'='ready' AND b->'previous'='true'::jsonb AND b->>'slot'='evening' END,version||' residual 07 KST response'",
    "ELSE b->>'kind'='claimed' END,version||' 0248 fourth UTC attempt at 07 KST'");
  note = once(note, "b->>'kind'='claimed',version||' residual releases at 09 KST'",
    "CASE WHEN version='0245' THEN b->>'kind'='claimed' ELSE b->>'kind'='ready' AND b->'previous'='true'::jsonb END,version||' 09 KST returns previous without duplicate claim'");
  let backstop = once(read('dashboard_note_backstop_regression.sql'), 'CREATE TEMP TABLE backstop_versions', `${snapshot}\nCREATE TEMP TABLE backstop_versions`);
  backstop = once(backstop, "  EXECUTE replace(body,'now()',format('%L::timestamptz',at_time));",
    `  EXECUTE replace(body,'now()',format('%L::timestamptz',at_time));\n  ${clock}`);
  let v2 = backstop.slice(0, backstop.indexOf('ROLLBACK;') + 'ROLLBACK;'.length);
  v2 = v2.replaceAll('public.dashboard_generation_request(', 'public.dashboard_generation_request_v2(');
  v2 = once(v2, '(SELECT definition FROM dashboard_request_0247)',
    "(SELECT replace(definition,'public.dashboard_generation_request(', 'public.dashboard_generation_request_v2(') FROM dashboard_request_0247)");
  v2 = once(v2, "  DELETE FROM public.dashboard_generation_runs WHERE user_id IN",
    "  DELETE FROM public.ai_audit_log WHERE user_id IN ('00000000-0000-0000-0000-000000000081','00000000-0000-0000-0000-000000000082');\n  DELETE FROM public.dashboard_generation_runs WHERE user_id IN");
  v2 = once(v2, "    UPDATE public.dashboard_generation_runs SET created_at=at_time WHERE id=(a->>'id')::uuid;",
    "    UPDATE public.dashboard_generation_runs SET created_at=at_time WHERE id=(a->>'id')::uuid;\n    UPDATE public.ai_audit_log SET created_at=at_time WHERE id=(a->>'lease_token')::uuid;");
  return `\n\\echo '0249: replay 0247 v1 (0248 residual expectations)'\n${note}
\\echo '0249: replay 0248 v1'\n${backstop}
\\echo '0249: replay 0248 v2'\n${v2}\n`;
}
