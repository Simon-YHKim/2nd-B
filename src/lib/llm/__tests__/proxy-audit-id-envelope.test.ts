import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

// Every proxy that can seat the chat. The chat screen hands the id to
// refund_chat_turn_after_output_swap (0255), so a proxy that leaves it out gives no turn back.
// What "the reply was handed back" means differs per vendor: the turn goes on that row only.
const PROXIES: [string, string][] = [
  ['openai-proxy', '!refused && !truncated'],
  ['claude-proxy', '!refused && !truncated'],
  ['gemini-proxy', "outcomeMarker === ''"],
  ['xai-proxy', '!refused && !truncated'],
];

describe('프록시는 답이 나온 턴의 감사 줄 id 를 응답에 싣는다 (Z46 · 0255)', () => {
  it.each(PROXIES)('%s: 방금 쓴 그 줄의 id 를, 그 줄이 돌아왔을 때만', (name, replied) => {
    const src = read(`supabase/functions/${name}/index.ts`);
    expect(src).toContain("import { insertLlmAuditRow, readChatTurnId } from '../_shared/llm-audit-row.ts';");
    // One reply response, and it is the one that carries the id.
    expect(src.match(/return jsonResponse\(req, \{ text, [^\n]*\);/g)).toEqual([
      'return jsonResponse(req, { text, modelUsed, latencyMs, audited, ...(audited ? { auditId: consentAuditId } : {}) });',
    ]);
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
    // The turn: read by shape for chat only, written only on the row of a reply that is handed back,
    // and left out of the row altogether when there is none (old clients, other purposes).
    expect(tail).toContain('const chatTurnId = readChatTurnId(purpose, body?.chatTurnId);');
    expect(tail).toContain(`...(chatTurnId && ${replied} ? { chat_turn_id: chatTurnId } : {}),`);
    expect(src.match(/chat_turn_id/g)).toHaveLength(1);
    expect(src).toMatch(/chatTurnId\?: unknown/);
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
      expect(block).not.toMatch(/auditId|ai_audit_log|insertLlmAuditRow/);
    }
  });

  it('공용 넣기는 넣은 줄이 돌아왔는지 보고, 턴이 이미 쓰였으면 턴 없이 한 번 더 넣는다', () => {
    const helper = read('supabase/functions/_shared/llm-audit-row.ts');
    expect(helper).toContain("await admin.from('ai_audit_log').insert(candidate).select('id').single();");
    expect(helper).toMatch(/const stored = !error && !!data && typeof data === 'object' && \(data as \{ id\?: unknown \}\)\.id === row\.id;/);
    expect(helper).toContain("export const CHAT_TURN_INDEX = 'ai_audit_log_chat_turn_id_key';");
    expect(helper).toMatch(/code === '23505' && errorText\(error\)\.includes\(CHAT_TURN_INDEX\)/);
    expect(helper).toMatch(/if \(purpose !== 'secondb_chat' \|\| typeof raw !== 'string'\) return null;/);
    // The index the helper names is the one the migration makes.
    expect(read('db/migrations/0255_chat_turn_refund_bound_to_audit.sql')).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS ai_audit_log_chat_turn_id_key\s+ON public\.ai_audit_log \(chat_turn_id\)\s+WHERE chat_turn_id IS NOT NULL;/,
    );
    // No Deno-only import: the unit test runs it as it is.
    expect(helper).not.toMatch(/^import /m);
  });
});
