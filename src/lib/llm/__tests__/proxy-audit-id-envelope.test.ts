import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

// Every proxy that can seat the chat. The chat screen hands the id to
// refund_chat_turn_after_output_swap (0255), so a proxy that leaves it out gives no turn back.
const PROXIES = ['openai-proxy', 'claude-proxy', 'gemini-proxy', 'xai-proxy'];

describe('프록시는 답이 나온 턴의 감사 줄 id 를 응답에 싣는다 (Z46 · 0255)', () => {
  it.each(PROXIES)('%s: 방금 쓴 그 줄의 id 를, 줄이 쓰였을 때만', (name) => {
    const src = read(`supabase/functions/${name}/index.ts`);
    // One reply response, and it is the one that carries the id.
    expect(src.match(/return jsonResponse\(req, \{ text, [^\n]*\);/g)).toEqual([
      'return jsonResponse(req, { text, modelUsed, latencyMs, audited, ...(audited ? { auditId: consentAuditId } : {}) });',
    ]);
    // The id is the one the audit insert used, and `audited` is true only when that insert reported no error.
    const tail = src.slice(src.lastIndexOf('const consentAuditId = crypto.randomUUID();'));
    expect(tail).toMatch(
      /^const consentAuditId = crypto\.randomUUID\(\);\s+let audited = false;\s+try \{\s+const \{ error: auditErr \} = await supabaseAdmin\.from\('ai_audit_log'\)\.insert\(\{\s+id: consentAuditId,\s+user_id: userId,\s+event_source: 'server_verified',/,
    );
    expect(tail.match(/\baudited = [^\n]*/g)).toEqual(['audited = false;', 'audited = !auditErr;']);
    // The row's zone is the server's own reading of the reply, not something the caller sends.
    expect(tail).toMatch(/safety_zone: hasCrisisTerm\(text\) \? 'red' : 'green',/);
    expect(tail).toMatch(/\n {6}purpose,\n/);
  });

  it.each(PROXIES)('%s: 다른 응답은 id 를 싣지 않는다(막힌 입력 · 실패 · 동의 철회 · 임베딩)', (name) => {
    const src = read(`supabase/functions/${name}/index.ts`);
    expect(src.match(/auditId: consentAuditId/g)).toHaveLength(1);
    expect(src.match(/jsonResponse\([^\n]*auditId/g)).toHaveLength(1);
    for (const line of src.split('\n').filter((l) => /jsonResponse\(req, \{ (error|vectors)\b/.test(l))) {
      expect(line).not.toMatch(/auditId|consentAuditId/);
    }
    // The input block answers as it did before: nothing is written for it and nothing is added to it.
    const blocks = [...src.matchAll(/error: 'safety_red_zone'/g)].map((m) => src.slice(m.index, (m.index ?? 0) + 240));
    expect(blocks.length).toBeGreaterThanOrEqual(1);
    for (const block of blocks) {
      expect(block).toMatch(/422\)/);
      expect(block).not.toMatch(/auditId|ai_audit_log/);
    }
  });
});
