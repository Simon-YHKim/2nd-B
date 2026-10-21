import {
  admitChatTurn, CHAT_TURN_ADMISSION_FN, CHAT_TURN_ADMISSION_TIMEOUT_MS,
  legacyTurnAdmission, readChatAttemptIntent, resolveChatTurnAdmissionMode,
} from '../chat-turn-admission';

const ids = { userId: 'user', auditId: 'audit', turnId: 'turn' };
const first = {
  allowed: true, kind: 'first', attempt: 1, quotaCharged: true,
  bindingEligible: true, reaskAvailable: true, error: null,
};
const reask = { ...first, kind: 'reask', attempt: 2, quotaCharged: false, reaskAvailable: false };
const unbound = { ...first, kind: 'unbound', attempt: null, bindingEligible: false, reaskAvailable: false };
const rejected = {
  allowed: false, kind: 'rejected', attempt: null, quotaCharged: false,
  bindingEligible: false, reaskAvailable: false, error: 'reask_ineligible',
};

describe('대화 허가 결과', () => {
  beforeEach(() => { jest.spyOn(console, 'warn').mockImplementation(() => {}); });
  afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

  it.each([undefined, '', 'legacy', 'ENFORCE', ' enforce ', 'paused'])('기본 모드 %s', (value) => {
    const read = jest.fn(() => value);
    expect(resolveChatTurnAdmissionMode(read)).toBe('legacy');
    expect(read).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledWith('CHAT_TURN_ADMISSION_MODE');
    expect(console.warn).toHaveBeenCalledTimes(value && value !== 'legacy' ? 1 : 0);
  });
  it('정확한 enforce', () => {
    expect(resolveChatTurnAdmissionMode(() => 'enforce')).toBe('enforce');
  });
  it.each([undefined, 'first', 'reask', null, '', false, {}, 'FIRST'])('요청 의도 %s', (value) => {
    expect(readChatAttemptIntent(value)).toBe(value === undefined ? 'first' : value === 'first' || value === 'reask' ? value : null);
  });
  it('legacy는 재질문 권리를 추정하지 않음', () => {
    expect(legacyTurnAdmission(true, true)).toEqual({
      mode: 'legacy', allowed: true, kind: null, attempt: null, quotaCharged: true,
      bindingEligible: null, reaskAvailable: null,
    });
  });
  it.each([first, reask, unbound])('서버가 반환한 $kind', async (row) => {
    const rpc = jest.fn().mockResolvedValue({ data: row });
    const result = await admitChatTurn(rpc, ids, 'reask');
    const { error: _error, ...fields } = row;
    expect(result).toEqual({ admission: { mode: 'enforce', ...fields } });
    expect(rpc.mock.calls).toEqual([[CHAT_TURN_ADMISSION_FN, {
      p_user_id: 'user', p_audit_id: 'audit', p_turn_id: 'turn', p_provider: 'openai', p_attempt_intent: 'reask',
    }]]);
  });
  it.each(['reask_ineligible', 'first_already_registered'])('확정 거절 %s', async (error) => {
    expect(await admitChatTurn(jest.fn().mockResolvedValue({ data: { ...rejected, error } }), ids, 'first'))
      .toEqual({ admission: { mode: 'enforce', ...Object.fromEntries(Object.entries(rejected).filter(([key]) => key !== 'error')) }, denial: { error, status: 409 } });
  });
  it.each(['T3901', '22023', 'P0001', '42501', '55000', 'PGRST202', undefined])('RPC 오류 %s', async (code) => {
    const rpc = jest.fn().mockResolvedValue({ error: { code, message: 'purpose_limit_exceeded' } });
    const result = await admitChatTurn(rpc, ids, 'first');
    expect(result.denial).toEqual(code === 'T3901'
      ? { status: 429, error: 'purpose_limit_exceeded' } : { status: 503, error: 'chat_admission_unavailable' });
    expect(result.admission.allowed).toBe(code === 'T3901' ? false : null);
    expect(result.admission.quotaCharged).toBe(code === 'T3901' ? false : null);
    expect(result.admission.reaskAvailable).toBeNull();
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it.each([
    null, undefined, [], [first], JSON.stringify(first), {},
    { ...first, allowed: 'true' }, { ...first, error: undefined },
    { ...first, attempt: 2 }, { ...first, quotaCharged: false },
    { ...first, bindingEligible: false }, { ...first, reaskAvailable: null },
    { ...reask, reaskAvailable: true }, { ...reask, quotaCharged: true },
    { ...unbound, attempt: 1 }, { ...unbound, bindingEligible: true },
    { ...rejected, error: 'unknown' }, { ...rejected, quotaCharged: true },
  ])('해석할 수 없는 응답 %#', async (data) => {
    const result = await admitChatTurn(jest.fn().mockResolvedValue({ data }), ids, 'first');
    expect(result).toEqual({
      admission: { mode: 'enforce', allowed: null, kind: null, attempt: null, quotaCharged: null, bindingEligible: null, reaskAvailable: null },
      denial: { status: 503, error: 'chat_admission_unavailable' },
    });
  });
  it.each([false, true])('RPC 예외의 재호출 없음 %s', async (sync) => {
    const rpc = jest.fn(() => { if (sync) throw new Error('fixture'); return Promise.reject(new Error('fixture')); });
    expect((await admitChatTurn(rpc, ids, 'first')).denial?.status).toBe(503);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it('허가 기한 5초와 늦은 완료', async () => {
    jest.useFakeTimers();
    let resolve!: (value: { data: unknown }) => void;
    const rpc = jest.fn(() => new Promise<{ data: unknown }>((done) => { resolve = done; }));
    let settled = false;
    const pending = admitChatTurn(rpc, ids, 'first').then((result) => { settled = true; return result; });
    expect(CHAT_TURN_ADMISSION_TIMEOUT_MS).toBe(5000);
    await jest.advanceTimersByTimeAsync(1500);
    expect(settled).toBe(false);
    await jest.advanceTimersByTimeAsync(3499);
    expect(settled).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    const result = await pending;
    expect(result.denial?.status).toBe(503);
    resolve({ data: first });
    await jest.advanceTimersByTimeAsync(1);
    expect(result.admission.allowed).toBeNull();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });
});
