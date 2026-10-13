import { CHAT_TURN_INDEX, insertLlmAuditRow, readChatTurnId } from '../llm-audit-row';

const TURN = '26101346-7000-4000-8000-000000007001';
const ROW_ID = '26101346-4000-4000-8000-000000000011';

type Answer = { data: unknown; error: unknown } | Error;

/** A stand-in for the service-role client: records each inserted row and answers from a queue. */
function fakeAdmin(answers: Answer[]) {
  const inserted: Record<string, unknown>[] = [];
  const admin = {
    from: (table: string) => {
      expect(table).toBe('ai_audit_log');
      return {
        insert: (row: Record<string, unknown>) => {
          inserted.push(row);
          return {
            select: (columns: string) => {
              expect(columns).toBe('id');
              return {
                single: async () => {
                  const next = answers.shift();
                  if (!next) throw new Error('no answer queued');
                  if (next instanceof Error) throw next;
                  return next;
                },
              };
            },
          };
        },
      };
    },
  };
  return { admin, inserted };
}

const turnTaken = {
  code: '23505',
  message: `duplicate key value violates unique constraint "${CHAT_TURN_INDEX}"`,
  details: `Key (chat_turn_id)=(${TURN}) already exists.`,
};

describe('readChatTurnId', () => {
  it('대화 호출의 uuid 모양만 받는다', () => {
    expect(readChatTurnId('secondb_chat', TURN)).toBe(TURN);
    expect(readChatTurnId('secondb_chat', TURN.toUpperCase())).toBe(TURN);
    expect(readChatTurnId('ops_recommend', TURN)).toBeNull();
    expect(readChatTurnId(null, TURN)).toBeNull();
    for (const raw of [undefined, null, 7, {}, [TURN], '', 'not-a-uuid', `${TURN} `, `${TURN}'; --`, TURN.slice(1)]) {
      expect(readChatTurnId('secondb_chat', raw)).toBeNull();
    }
  });
});

describe('insertLlmAuditRow', () => {
  let warn: jest.SpyInstance;
  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => warn.mockRestore());

  it('넣은 그 줄이 돌아왔을 때만 참이다', async () => {
    const { admin, inserted } = fakeAdmin([{ data: { id: ROW_ID }, error: null }]);
    await expect(insertLlmAuditRow(admin, { id: ROW_ID, purpose: 'secondb_chat', chat_turn_id: TURN }, 'openai-proxy')).resolves.toBe(true);
    expect(inserted).toEqual([{ id: ROW_ID, purpose: 'secondb_chat', chat_turn_id: TURN }]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('오류 없이 아무 줄도 안 돌아오면 거짓이다(규칙이나 트리거가 넣기를 삼킨 경우)', async () => {
    for (const data of [null, undefined, {}, { id: 'another-id' }, [], 'ok']) {
      const { admin } = fakeAdmin([{ data, error: null }]);
      await expect(insertLlmAuditRow(admin, { id: ROW_ID }, 'openai-proxy')).resolves.toBe(false);
    }
    expect(warn).toHaveBeenCalledTimes(6);
  });

  it('오류가 나면 거짓이고, 줄이 같이 돌아와도 믿지 않는다', async () => {
    const { admin, inserted } = fakeAdmin([{ data: { id: ROW_ID }, error: { code: '42501', message: 'permission denied' } }]);
    await expect(insertLlmAuditRow(admin, { id: ROW_ID }, 'claude-proxy')).resolves.toBe(false);
    expect(inserted).toHaveLength(1);
    expect(warn.mock.calls[0][0]).toBe('[claude-proxy] audit insert failed:');
  });

  it('턴에 이미 감사 줄이 있으면 턴 없이 한 번 더 넣는다(호출은 감사되고 그 줄은 돌려받을 근거가 못 된다)', async () => {
    const { admin, inserted } = fakeAdmin([{ data: null, error: turnTaken }, { data: { id: ROW_ID }, error: null }]);
    await expect(insertLlmAuditRow(admin, { id: ROW_ID, safety_zone: 'red', chat_turn_id: TURN }, 'openai-proxy')).resolves.toBe(true);
    expect(inserted).toEqual([
      { id: ROW_ID, safety_zone: 'red', chat_turn_id: TURN },
      { id: ROW_ID, safety_zone: 'red' },
    ]);
    expect(Object.keys(inserted[1])).not.toContain('chat_turn_id');
  });

  it('다시 넣기는 그 인덱스의 충돌일 때만, 한 번만 한다', async () => {
    // Another unique rule, or a row without a turn: no second attempt.
    const other = { code: '23505', message: 'duplicate key value violates unique constraint "ai_audit_log_pkey"' };
    let fake = fakeAdmin([{ data: null, error: other }]);
    await expect(insertLlmAuditRow(fake.admin, { id: ROW_ID, chat_turn_id: TURN }, 'xai-proxy')).resolves.toBe(false);
    expect(fake.inserted).toHaveLength(1);
    fake = fakeAdmin([{ data: null, error: turnTaken }]);
    await expect(insertLlmAuditRow(fake.admin, { id: ROW_ID }, 'xai-proxy')).resolves.toBe(false);
    expect(fake.inserted).toHaveLength(1);
    // The second attempt fails too: false, and no third.
    fake = fakeAdmin([{ data: null, error: turnTaken }, { data: null, error: { code: '57014', message: 'canceling statement' } }]);
    await expect(insertLlmAuditRow(fake.admin, { id: ROW_ID, chat_turn_id: TURN }, 'xai-proxy')).resolves.toBe(false);
    expect(fake.inserted).toHaveLength(2);
  });

  it('던지지 않는다: 감사 쓰기의 실패가 호출을 실패시키면 안 된다', async () => {
    const { admin } = fakeAdmin([new Error('fetch failed')]);
    await expect(insertLlmAuditRow(admin, { id: ROW_ID }, 'gemini-proxy')).resolves.toBe(false);
    expect(warn.mock.calls[0][0]).toBe('[gemini-proxy] audit insert threw:');
  });
});
