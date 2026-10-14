import {
  CHAT_TURN_BEGIN_FN,
  CHAT_TURN_CLAIM_FN,
  CHAT_TURN_CLAIM_TIMEOUT_MS,
  beginChatTurnAttempt,
  claimChatTurn,
  insertLlmAuditRow,
  readChatTurnId,
} from '../llm-audit-row';

const TURN = '26101346-7000-4000-8000-000000007001';
const ROW_ID = '26101346-4000-4000-8000-000000000011';
const USER = '26101346-0000-4000-8000-00000000000a';

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

/** A stand-in for the claim call: records what it was asked and answers how and when it is told to. */
function fakeClaim(answer: () => Promise<{ data: unknown; error: unknown }>) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const admin = {
    rpc: (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      return answer();
    },
  };
  return { admin, calls };
}

const IDS = { userId: USER, auditId: ROW_ID, turnId: TURN };

describe('llm-audit-row (감사 줄 쓰기와 턴 묶기)', () => {
  let warn: jest.SpyInstance;
  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    warn.mockRestore();
    jest.useRealTimers();
  });

  describe('readChatTurnId', () => {
    it('대화 목적의 uuid 모양만 받고 소문자로 돌려준다', () => {
      expect(readChatTurnId('secondb_chat', TURN)).toBe(TURN);
      expect(readChatTurnId('secondb_chat', TURN.toUpperCase())).toBe(TURN);
    });

    it('다른 목적 · 문자열이 아닌 것 · 모양이 다른 것은 null 이다', () => {
      expect(readChatTurnId('interview_probe', TURN)).toBeNull();
      expect(readChatTurnId(null, TURN)).toBeNull();
      expect(readChatTurnId('secondb_chat', 7)).toBeNull();
      expect(readChatTurnId('secondb_chat', { id: TURN })).toBeNull();
      expect(readChatTurnId('secondb_chat', `${TURN} `)).toBeNull();
      expect(readChatTurnId('secondb_chat', `{${TURN}}`)).toBeNull();
      expect(readChatTurnId('secondb_chat', '')).toBeNull();
    });
  });

  describe('insertLlmAuditRow', () => {
    it('넣은 그 줄이 돌아왔을 때만 참이다', async () => {
      const { admin, inserted } = fakeAdmin([{ data: { id: ROW_ID }, error: null }]);
      await expect(insertLlmAuditRow(admin, { id: ROW_ID, purpose: 'secondb_chat' }, 't')).resolves.toBe(true);
      expect(inserted).toEqual([{ id: ROW_ID, purpose: 'secondb_chat' }]);
      expect(warn).not.toHaveBeenCalled();
    });

    it('오류가 없어도 줄이 안 돌아오거나 다른 줄이 돌아오면 거짓이다', async () => {
      for (const data of [null, {}, { id: 'another' }, 'text']) {
        const { admin } = fakeAdmin([{ data, error: null }]);
        await expect(insertLlmAuditRow(admin, { id: ROW_ID }, 't')).resolves.toBe(false);
      }
    });

    it('오류나 예외는 거짓으로 끝나고 던지지 않는다. 다시 넣지도 않는다', async () => {
      const failed = fakeAdmin([{ data: null, error: { code: '23505', message: 'duplicate key value' } }]);
      await expect(insertLlmAuditRow(failed.admin, { id: ROW_ID }, 't')).resolves.toBe(false);
      expect(failed.inserted).toHaveLength(1);
      const threw = fakeAdmin([new Error('network down')]);
      await expect(insertLlmAuditRow(threw.admin, { id: ROW_ID }, 't')).resolves.toBe(false);
      expect(threw.inserted).toHaveLength(1);
      expect(warn).toHaveBeenCalledTimes(2);
    });

    it('턴 번호를 감사 줄에 적지 않는다(받은 줄을 그대로 넣는다)', async () => {
      const { admin, inserted } = fakeAdmin([{ data: { id: ROW_ID }, error: null }]);
      await insertLlmAuditRow(admin, { id: ROW_ID, user_id: USER }, 't');
      expect(Object.keys(inserted[0]).sort()).toEqual(['id', 'user_id']);
    });
  });

  describe('beginChatTurnAttempt (6회차: 모델 호출 전에 그 턴의 시도로 적기)', () => {
    it('서버가 true 를 돌려줄 때만 참이고, 사용자 · 이 호출의 감사 줄 id · 턴을 그대로 넘긴다', async () => {
      const { admin, calls } = fakeClaim(async () => ({ data: true, error: null }));
      await expect(beginChatTurnAttempt(admin, IDS, 't')).resolves.toBe(true);
      expect(calls).toEqual([{ fn: CHAT_TURN_BEGIN_FN, args: { p_user_id: USER, p_audit_id: ROW_ID, p_turn_id: TURN } }]);
      expect(CHAT_TURN_BEGIN_FN).toBe('begin_chat_turn_attempt');
    });

    it('false · null · 오류 · 거절 · 던짐은 모두 거짓이고 던지지 않는다', async () => {
      for (const data of [false, null, 'true', 1]) {
        const { admin } = fakeClaim(async () => ({ data, error: null }));
        await expect(beginChatTurnAttempt(admin, IDS, 't')).resolves.toBe(false);
      }
      const failed = fakeClaim(async () => ({ data: true, error: { code: '42501', message: 'permission denied' } }));
      await expect(beginChatTurnAttempt(failed.admin, IDS, 't')).resolves.toBe(false);
      const rejected = fakeClaim(() => Promise.reject(new Error('network down')));
      await expect(beginChatTurnAttempt(rejected.admin, IDS, 't')).resolves.toBe(false);
      const threw = {
        rpc: () => {
          throw new Error('client broke');
        },
      };
      await expect(beginChatTurnAttempt(threw, IDS, 't')).resolves.toBe(false);
    });

    it('묶기와 같은 상한 하나에서 거짓으로 답한다(늦게 온 true 를 기다리지 않는다)', async () => {
      jest.useFakeTimers();
      const { admin } = fakeClaim(() => new Promise((resolve) => setTimeout(() => resolve({ data: true, error: null }), CHAT_TURN_CLAIM_TIMEOUT_MS + 500)));
      const pending = beginChatTurnAttempt(admin, IDS, 't');
      jest.advanceTimersByTime(CHAT_TURN_CLAIM_TIMEOUT_MS);
      await expect(pending).resolves.toBe(false);
      expect(warn).toHaveBeenCalledWith('[t] chat turn attempt timed out after 1500ms');
    });
  });

  describe('claimChatTurn', () => {
    it('서버가 true 를 돌려줄 때만 참이고, 사용자 · 감사 줄 · 턴을 그대로 넘긴다', async () => {
      const { admin, calls } = fakeClaim(async () => ({ data: true, error: null }));
      await expect(claimChatTurn(admin, IDS, 't')).resolves.toBe(true);
      expect(calls).toEqual([{ fn: CHAT_TURN_CLAIM_FN, args: { p_user_id: USER, p_audit_id: ROW_ID, p_turn_id: TURN } }]);
      expect(CHAT_TURN_CLAIM_FN).toBe('claim_chat_turn_for_audit');
    });

    it('false · null · 다른 값 · 오류는 모두 거짓이다', async () => {
      for (const data of [false, null, 'true', 1, { ok: true }]) {
        const { admin } = fakeClaim(async () => ({ data, error: null }));
        await expect(claimChatTurn(admin, IDS, 't')).resolves.toBe(false);
      }
      const failed = fakeClaim(async () => ({ data: true, error: { code: '42501', message: 'permission denied' } }));
      await expect(claimChatTurn(failed.admin, IDS, 't')).resolves.toBe(false);
    });

    it('호출이 거절되거나 그 자리에서 던져도 거짓으로 끝나고 던지지 않는다', async () => {
      const rejected = fakeClaim(() => Promise.reject(new Error('network down')));
      await expect(claimChatTurn(rejected.admin, IDS, 't')).resolves.toBe(false);
      const threw = {
        rpc: () => {
          throw new Error('client broke');
        },
      };
      await expect(claimChatTurn(threw, IDS, 't')).resolves.toBe(false);
      expect(warn).toHaveBeenCalledTimes(2);
    });

    it('상한은 한 값이고, 넘으면 거짓으로 답을 내보낸다(늦게 온 true 를 기다리지 않는다)', async () => {
      jest.useFakeTimers();
      expect(CHAT_TURN_CLAIM_TIMEOUT_MS).toBe(1500);
      let finish: (value: { data: unknown; error: unknown }) => void = () => undefined;
      const { admin } = fakeClaim(() => new Promise((resolve) => { finish = resolve; }));
      let settled: boolean | 'pending' = 'pending';
      const bound = claimChatTurn(admin, IDS, 't').then((value) => { settled = value; return value; });
      await jest.advanceTimersByTimeAsync(CHAT_TURN_CLAIM_TIMEOUT_MS - 1);
      expect(settled).toBe('pending');
      await jest.advanceTimersByTimeAsync(1);
      await expect(bound).resolves.toBe(false);
      // the server answers true after the limit: the reply has already gone out unbound
      finish({ data: true, error: null });
      await jest.advanceTimersByTimeAsync(0);
      expect(settled).toBe(false);
    });

    it('늦는 오류도, 끝내 안 오는 답도 같은 상한에서 거짓이다', async () => {
      jest.useFakeTimers();
      for (const answer of [
        () => new Promise<{ data: unknown; error: unknown }>(() => undefined),
        () => new Promise<{ data: unknown; error: unknown }>((_, reject) => setTimeout(() => reject(new Error('late')), 60_000)),
        () => new Promise<{ data: unknown; error: unknown }>((resolve) => setTimeout(() => resolve({ data: null, error: { message: 'late error' } }), 60_000)),
      ]) {
        const { admin } = fakeClaim(answer);
        let settled: boolean | 'pending' = 'pending';
        const bound = claimChatTurn(admin, IDS, 't').then((value) => { settled = value; return value; });
        await jest.advanceTimersByTimeAsync(CHAT_TURN_CLAIM_TIMEOUT_MS - 1);
        expect(settled).toBe('pending');
        await jest.advanceTimersByTimeAsync(1);
        await expect(bound).resolves.toBe(false);
      }
    });

    it('제때 온 답은 상한을 기다리지 않고, 타이머를 남기지 않는다', async () => {
      jest.useFakeTimers();
      const { admin } = fakeClaim(async () => ({ data: true, error: null }));
      await expect(claimChatTurn(admin, IDS, 't')).resolves.toBe(true);
      expect(jest.getTimerCount()).toBe(0);
    });
  });
});
