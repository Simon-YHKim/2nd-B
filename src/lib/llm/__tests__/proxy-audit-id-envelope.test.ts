import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

// Every proxy that can seat the chat. The chat screen hands the id to
// refund_chat_turn_after_output_swap (0255), so a proxy that leaves it out gives no turn back.
const PROXIES = ['openai-proxy', 'claude-proxy', 'gemini-proxy', 'xai-proxy'];
const REPLY =
  'return jsonResponse(req, {\n    text, modelUsed, latencyMs, audited,\n    ...(audited ? { auditId: consentAuditId } : {}),\n    ...(chatTurnId ? { turnBound } : {}),\n  });';

describe('프록시는 답이 나온 턴의 감사 줄 id 를 응답에 싣고, 그 답을 턴에 묶어 달라고 서버에 묻는다 (Z46 · 0255)', () => {
  it.each(PROXIES)('%s: 방금 쓴 그 줄의 id 를, 그 줄이 돌아왔을 때만', (name) => {
    const src = read(`supabase/functions/${name}/index.ts`);
    expect(src).toContain("import { beginChatTurnAttempt, claimChatTurn, insertLlmAuditRow, readChatTurnId } from '../_shared/llm-audit-row.ts';");
    // One reply response, and it is the one that carries the id.
    expect(src.match(/return jsonResponse\(req, \{\n    text, [\s\S]*?\n  \}\);/g)).toEqual([REPLY]);
    expect(src).not.toMatch(/return jsonResponse\(req, \{ text, /);
    // `audited` has one source: the shared insert, which is true only when the row it was given came back.
    const tail = src.slice(src.lastIndexOf('const consentAuditId = crypto.randomUUID();'));
    expect(tail).toMatch(
      /const audited = await insertLlmAuditRow\(supabaseAdmin, \{\n {4}id: consentAuditId,\n {4}user_id: userId,\n {4}event_source: 'server_verified',/,
    );
    expect(tail).toContain(`}, '${name}');`);
    expect(tail.match(/\baudited = [^\n]*/g)).toEqual(['audited = await insertLlmAuditRow(supabaseAdmin, {']);
    expect(tail).not.toMatch(/\.from\('ai_audit_log'\)\.insert\(/);
    // The row's zone is the server's own reading of the reply, not something the caller sends.
    expect(tail).toMatch(/safety_zone: hasCrisisTerm\(text\) \? 'red' : 'green',/);
    expect(tail).toMatch(/\n {4}purpose,\n/);
    expect(src).toMatch(/chatTurnId\?: unknown/);
  });

  it.each(PROXIES)('%s: 턴 번호는 감사 줄에 적지 않고, 답을 돌려주는 길에서만 서버에 묻는다', (name) => {
    const src = read(`supabase/functions/${name}/index.ts`);
    const tail = src.slice(name === 'openai-proxy'
      ? src.indexOf('const chatTurnId = readChatTurnId(purpose, body?.chatTurnId);')
      : src.lastIndexOf('const consentAuditId = crypto.randomUUID();'));
    // read by shape for chat only; never written on the row
    expect(tail).toContain('const chatTurnId = readChatTurnId(purpose, body?.chatTurnId);');
    expect(src).not.toMatch(/chat_turn_id/);
    // one question, with the user from the verified token, the row just written and the turn the app named
    expect(src.match(/claimChatTurn\(/g)).toHaveLength(1);
    // round 6: before the model is asked, the call is recorded as the turn's attempt under the id its audit row
    // will carry; the id is made there, once, and only a recorded attempt is ever bound
    expect(src.match(/beginChatTurnAttempt\(/g)).toHaveLength(1);
    if (name === 'openai-proxy') {
      // T39 registers enforce before spend; legacy alone retains soft begin.
      expect(tail).toContain("const usesChatAdmission = admissionMode === 'enforce' && chatTurnId !== null;");
      expect(tail).toContain(
        "const turnAttempt = usesChatAdmission\n    ? turnAdmission?.bindingEligible === true\n    : chatTurnId !== null\n      && await beginChatTurnAttempt(supabaseAdmin, { userId, auditId: consentAuditId, turnId: chatTurnId }, 'openai-proxy');\n\n  const t0 = Date.now();\n  let upstream: Response;\n",
      );
      const admission = tail.indexOf('await admitChatTurn(');
      const spend = tail.indexOf("'bump_gemini_spend'");
      const model = tail.indexOf('await fetch(');
      expect(admission).toBeGreaterThan(tail.indexOf('const consentAuditId = crypto.randomUUID();'));
      expect(spend).toBeGreaterThan(admission);
      expect(model).toBeGreaterThan(spend);
    } else {
      expect(tail).toMatch(
        new RegExp(
          `^const consentAuditId = crypto\\.randomUUID\\(\\);\\n  const chatTurnId = readChatTurnId\\(purpose, body\\?\\.chatTurnId\\);\\n  const turnAttempt = chatTurnId !== null\\n    && await beginChatTurnAttempt\\(supabaseAdmin, \\{ userId, auditId: consentAuditId, turnId: chatTurnId \\}, '${name}'\\);\\n\\n  const t0 = Date\\.now\\(\\);\\n  let upstream: Response;\\n`,
        ),
      );
    }
    expect(tail.match(/const consentAuditId = /g)).toHaveLength(1);
    expect(tail.match(/const chatTurnId = /g)).toHaveLength(1);
    // after the input classifier has had its say: a blocked input records no attempt
    expect(src.lastIndexOf("error: 'safety_red_zone', reason: 'crisis_term_detected' }, 422);")).toBeLessThan(src.indexOf('beginChatTurnAttempt(supabaseAdmin'));
    // an empty answer binds nothing (round 4), nor an answer whose attempt was not recorded (round 6), and the
    // reply says whether the turn was bound
    expect(tail).toContain(
      `  const turnBound = audited && chatTurnId && turnAttempt && text.trim() !== ''\n    ? await claimChatTurn(supabaseAdmin, { userId, auditId: consentAuditId, turnId: chatTurnId }, '${name}')\n    : false;\n`,
    );
    // after the row is written, after the consent re-check has had its say, and before the reply
    const order = [
      tail.indexOf('await insertLlmAuditRow(supabaseAdmin, {'),
      tail.indexOf('const consentDenial = await recheckLlmConsent(capacityRpc, consentLease);'),
      tail.indexOf('    return jsonResponse(req, { error: consentDenial.error }, consentDenial.status);'),
      tail.indexOf('? await claimChatTurn(supabaseAdmin, {'),
      tail.indexOf(REPLY),
    ];
    expect(order.every((at) => at >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    // no early return of the reply path sits below the question: every refusal, cut-off and failure
    // answer has already left by then
    const between = tail.slice(tail.indexOf('? await claimChatTurn(supabaseAdmin, {'), tail.indexOf(REPLY));
    expect(between).not.toMatch(/return /);
    const before = tail.slice(0, tail.indexOf('? await claimChatTurn(supabaseAdmin, {'));
    for (const answer of [...before.matchAll(/return jsonResponse\(req, \{ error: '(upstream_[a-z_]+)'/g)].map((m) => m[1])) {
      // round 6: the attempt is recorded before the model call, so the failures of the call itself sit here too
      expect(['upstream_unreachable', 'upstream_bad_payload', 'upstream_refusal', 'upstream_truncated', 'upstream_blocked', 'upstream_empty']).toContain(answer);
    }
    expect(before).toMatch(/return jsonResponse\(req, \{ error: 'upstream_truncated'/);
  });

  it.each(PROXIES)('%s: 다른 응답은 id 를 싣지 않는다(막힌 입력 · 실패 · 동의 철회 · 임베딩)', (name) => {
    const src = read(`supabase/functions/${name}/index.ts`);
    expect(src.match(/auditId: consentAuditId/g)).toHaveLength(name === 'openai-proxy' ? 4 : 3); // T39 adds atomic admission using the same audit id
    // every response call, read whole (the reply spans lines): exactly one carries the id, and it is the reply
    const calls = [...src.matchAll(/jsonResponse\(req, \{[\s\S]*?\}\s*(?:,[^;]*?)?\);/g)].map((m) => m[0]);
    expect(calls.length).toBeGreaterThan(3);
    expect(calls.filter((call) => call.includes('auditId'))).toEqual([REPLY.replace(/^return /, '')]);
    expect(calls.filter((call) => call.includes('turnBound'))).toEqual([REPLY.replace(/^return /, '')]);
    for (const line of src.split('\n').filter((l) => /jsonResponse\(req, \{ (error|vectors)\b/.test(l))) {
      expect(line).not.toMatch(/auditId|consentAuditId/);
    }
    // The input block answers as it did before: nothing is written for it and nothing is added to it.
    const blocks = [...src.matchAll(/error: 'safety_red_zone'/g)].map((m) => src.slice(m.index, (m.index ?? 0) + 240));
    expect(blocks.length).toBeGreaterThanOrEqual(1);
    for (const block of blocks) {
      expect(block).toMatch(/422\)/);
      expect(block).not.toMatch(/auditId|ai_audit_log|insertLlmAuditRow|claimChatTurn/);
    }
  });

  it('공용 도우미: 넣은 줄이 돌아왔는지 보고, 묶기는 서버 함수 하나에 상한을 두고 묻는다', () => {
    const helper = read('supabase/functions/_shared/llm-audit-row.ts');
    expect(helper).toContain("await admin.from('ai_audit_log').insert(row).select('id').single();");
    expect(helper).toMatch(/const stored = !error && !!data && typeof data === 'object' && \(data as \{ id\?: unknown \}\)\.id === row\.id;/);
    expect(helper).toMatch(/if \(purpose !== 'secondb_chat' \|\| typeof raw !== 'string'\) return null;/);
    expect(helper).toContain("export const CHAT_TURN_CLAIM_FN = 'claim_chat_turn_for_audit';");
    expect(helper).toContain("export const CHAT_TURN_BEGIN_FN = 'begin_chat_turn_attempt';");
    expect(helper).toContain('export const CHAT_TURN_CLAIM_TIMEOUT_MS = 1500;');
    // the two questions are one bounded call with the same three ids, by name
    expect(helper).toContain('admin.rpc(fn, args)');
    expect(helper.match(/const args = \{ p_user_id: ids\.userId, p_audit_id: ids\.auditId, p_turn_id: ids\.turnId \};/g)).toHaveLength(2);
    expect(helper).not.toMatch(/p_started_at|new Date\(/);
    expect(helper).toContain("return askAboutTurn(admin, CHAT_TURN_BEGIN_FN, 'attempt', args, tag, timeoutMs);");
    expect(helper).toContain("return askAboutTurn(admin, CHAT_TURN_CLAIM_FN, 'claim', args, tag, timeoutMs);");
    expect(helper.match(/askAboutTurn\(admin, /g)).toHaveLength(2);
    expect(helper).toContain('return await Promise.race([call, limit]);');
    expect(helper).toContain('return data === true;');
    // one limit for every outcome, and no retry of either write
    expect(helper.match(/setTimeout\(/g)).toHaveLength(1);
    expect(helper.match(/\.insert\(/g)).toHaveLength(1);
    expect(helper.match(/admin\.rpc\(/g)).toHaveLength(1);
    expect(helper).not.toMatch(/chat_turn_id/);
    // The function the helper names is the one the migration makes, with those argument names, for service_role only.
    const migration = read('db/migrations/0255_chat_turn_refund_bound_to_audit.sql');
    expect(migration).toMatch(
      /CREATE OR REPLACE FUNCTION public\.claim_chat_turn_for_audit\(p_user_id uuid, p_audit_id uuid, p_turn_id uuid\)\s+RETURNS boolean/,
    );
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.claim_chat_turn_for_audit\(uuid, uuid, uuid\) TO service_role;/);
    expect(migration).toMatch(
      /CREATE OR REPLACE FUNCTION public\.begin_chat_turn_attempt\(p_user_id uuid, p_audit_id uuid, p_turn_id uuid\)\s+RETURNS boolean/,
    );
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.begin_chat_turn_attempt\(uuid, uuid, uuid\) TO service_role;/);
    // No Deno-only import: the unit test runs it as it is.
    expect(helper).not.toMatch(/^import /m);
  });
});
