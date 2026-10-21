import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';

// Execute the real Edge entry point and local dependencies. Only the Edge host,
// SDK/database and provider transport are fixtures; no policy helper is replaced.
const edgeRoot = resolve(process.cwd(), 'supabase/functions');
const importMap = JSON.parse(readFileSync(resolve(edgeRoot, 'import_map.json'), 'utf8')).imports as Record<string, string>;
const compiled = new Map<string, string>();
const userId = '11111111-1111-4111-8111-111111111111';
const turnId = '22222222-2222-4222-8222-222222222222';
const auditId = '33333333-3333-4333-8333-333333333333';
const admissionFn = 'begin_chat_turn_attempt_with_quota';
const first = { allowed: true, kind: 'first', attempt: 1, quotaCharged: true, bindingEligible: true, reaskAvailable: true, error: null };
const second = { ...first, kind: 'reask', attempt: 2, quotaCharged: false, reaskAvailable: false };
const unbound = { ...first, kind: 'unbound', attempt: null, bindingEligible: false, reaskAvailable: false };
const rejected = { allowed: false, kind: 'rejected', attempt: null, quotaCharged: false, bindingEligible: false, reaskAvailable: false, error: 'reask_ineligible' };
type DbResult = { data?: unknown; error?: unknown };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
const wire = (row: typeof first | typeof unbound = first) => {
  const { error: _error, ...fields } = row;
  return { mode: 'enforce', ...fields };
};

function host(mode: string | undefined = 'enforce') {
  let handler!: (req: Request) => Promise<Response>;
  const events: string[] = [];
  const overrides = new Map<string, () => DbResult | Promise<DbResult>>();
  const envValues = new Map<string, string | undefined>([
    ['CHAT_TURN_ADMISSION_MODE', mode], ['LLM_CONSENT_MODE', 'enforce'],
    ['SUPABASE_URL', 'https://fixture.invalid'], ['SUPABASE_SERVICE_ROLE_KEY', 'fixture-key'],
    ['OPENAI_API_KEY', 'fixture-key'],
  ]);
  const env = jest.fn((key: string) => envValues.get(key) ?? (/^LLM_.*_CAP$/.test(key) ? '100' : undefined));
  const rpc = jest.fn(async (name: string, args: Record<string, unknown>): Promise<DbResult> => {
    events.push(name);
    if (overrides.has(name)) return overrides.get(name)!();
    if (name === admissionFn) return { data: first };
    if (name === 'effective_llm_consent_snapshot_v2') return { data: { allowed: true, token: 'a'.repeat(64) } };
    if (name === 'effective_subscription_tier') return { data: 'free' };
    if (name === 'consume_llm_proxy_purpose_quota') return { data: [{ allowed: true, used: 1, quota_limit: 5 }] };
    if (name === 'reserve_llm_proxy_capacity') return { data: { accepted: true, reservation_id: args.p_reservation_id } };
    if (['bump_gemini_spend', 'refund_gemini_spend', 'settle_llm_proxy_capacity', 'release_llm_proxy_capacity', 'begin_chat_turn_attempt', 'claim_chat_turn_for_audit'].includes(name)) return { data: true };
    throw new Error(`Unexpected fixture RPC: ${name}`);
  });
  const audit = jest.fn(async (row: Record<string, unknown>): Promise<DbResult> => ({ data: { id: row.id } }));
  const admin = { rpc, from: (table: string) => {
    if (table !== 'ai_audit_log') throw new Error(`Unexpected table: ${table}`);
    return {
      insert: (row: Record<string, unknown>) => {
        events.push('audit');
        return {
          select: () => ({ single: () => audit(row) }),
          then: (done: (value: DbResult) => unknown) => audit(row).then(done),
        };
      },
      update: () => ({ eq: () => ({ eq: async () => { events.push('withheld'); return { error: null }; } }) }),
    };
  } };
  const fetch = jest.fn(async () => {
    events.push('model');
    return Response.json({ choices: [{ message: { content: 'Fixture reply' }, finish_reason: 'stop' }], model: 'fixture-model', usage: { total_tokens: 12 } });
  });
  const modules = new Map<string, Record<string, unknown>>();
  function load(file: string): Record<string, unknown> {
    if (modules.has(file)) return modules.get(file)!;
    if (!compiled.has(file)) compiled.set(file, ts.transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText);
    const exported: Record<string, unknown> = {};
    modules.set(file, exported);
    const localRequire = (name: string) => {
      if (name === 'jsr:@supabase/functions-js/edge-runtime.d.ts') return {};
      if (name === 'jsr:@supabase/supabase-js@2') return { createClient: () => admin };
      if (!name.startsWith('.')) throw new Error(`Unexpected module: ${name}`);
      let target = resolve(dirname(file), name);
      if (!target.endsWith('.ts')) {
        const entry = Object.entries(importMap).find(([key]) => resolve(edgeRoot, key) === target);
        if (!entry) throw new Error(`Missing mapping: ${name}`);
        target = resolve(edgeRoot, entry[1]);
      }
      return load(target);
    };
    new Function('exports', 'require', 'Deno', 'fetch', 'crypto', compiled.get(file)!)(
      exported, localRequire, { env: { get: env }, serve: (fn: typeof handler) => { handler = fn; } }, fetch,
      { randomUUID: () => auditId },
    );
    return exported;
  }
  load(resolve(edgeRoot, 'openai-proxy/index.ts'));
  return {
    rpc, fetch, audit, events, env, envValues, overrides,
    count: (name: string) => rpc.mock.calls.filter(([called]) => called === name).length,
    run: (patch: Record<string, unknown> = {}) => handler(new Request('https://fixture.invalid/proxy', {
      method: 'POST', headers: {
        authorization: `Bearer fixture.${Buffer.from(JSON.stringify({ sub: userId, role: 'authenticated' })).toString('base64url')}.fixture`,
        'content-type': 'application/json',
      }, body: JSON.stringify({ purpose: 'secondb_chat', user: 'I built a desk today.', chatTurnId: turnId, ...patch }),
    })).then((response) => { events.push('response'); return response; }),
  };
}
type Host = ReturnType<typeof host>;
function expectNoDispatch(h: Host) {
  for (const name of ['consume_llm_proxy_purpose_quota', 'bump_gemini_spend', 'reserve_llm_proxy_capacity', 'begin_chat_turn_attempt', 'refund_gemini_spend', 'release_llm_proxy_capacity', 'claim_chat_turn_for_audit']) {
    expect(h.count(name)).toBe(0);
  }
  expect(h.fetch).not.toHaveBeenCalled();
}
async function waitFor(h: Host, event: string, count = 1) {
  for (let n = 0; n < 100 && h.events.filter((value) => value === event).length < count; n++) await Promise.resolve();
  expect(h.events.filter((value) => value === event)).toHaveLength(count);
}

describe('OpenAI 대화 허가', () => {
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

  it.each([
    [{ data: rejected }, 409, 'reask_ineligible'],
    [{ data: { ...rejected, error: 'first_already_registered' } }, 409, 'first_already_registered'],
    [{ error: { code: 'T3901' } }, 429, 'purpose_limit_exceeded'],
    ...['22023', 'P0001', '42501', '55000', 'PGRST202'].map((code) => [{ error: { code } }, 503, 'chat_admission_unavailable']),
    [{ data: { allowed: true } }, 503, 'chat_admission_unavailable'],
  ] as [DbResult, number, string][])('허가 거절과 미확정 %#', async (result, status, error) => {
    const h = host(); h.overrides.set(admissionFn, () => result);
    const response = await h.run(); const body = await response.json();
    expect(response.status).toBe(status);
    expect(body.error).toBe(error);
    expect(body.turnAdmission).toEqual(status === 503
      ? { mode: 'enforce', allowed: null, kind: null, attempt: null, quotaCharged: null, bindingEligible: null, reaskAvailable: null }
      : { mode: 'enforce', allowed: false, kind: 'rejected', attempt: null, quotaCharged: false, bindingEligible: false, reaskAvailable: status === 429 ? null : false });
    expect(h.count(admissionFn)).toBe(1);
    expectNoDispatch(h);
  });

  it('허가 기한과 늦은 완료', async () => {
    jest.useFakeTimers();
    const h = host(); const late = deferred<DbResult>();
    h.overrides.set(admissionFn, () => late.promise);
    const pending = h.run();
    await waitFor(h, admissionFn);
    await jest.advanceTimersByTimeAsync(4999);
    expect(h.events).not.toContain('response'); expectNoDispatch(h);
    await jest.advanceTimersByTimeAsync(1);
    expect((await pending).status).toBe(503);
    late.resolve({ data: first });
    await jest.advanceTimersByTimeAsync(1);
    expect(h.count(admissionFn)).toBe(1); expectNoDispatch(h);
  });

  it.each([undefined, '', 'legacy', 'paused', 'ENFORCE'])('legacy 기본 %s', async (mode) => {
    const h = host(mode === undefined ? 'legacy' : mode);
    h.envValues.set('CHAT_TURN_ADMISSION_MODE', mode);
    const response = await h.run();
    expect(response.status).toBe(200);
    expect((await response.json()).turnAdmission).toEqual({ mode: 'legacy', allowed: true, kind: null, attempt: null, quotaCharged: true, bindingEligible: null, reaskAvailable: null });
    expect(h.count(admissionFn)).toBe(0);
    expect(h.count('consume_llm_proxy_purpose_quota')).toBe(1);
    expect(h.count('begin_chat_turn_attempt')).toBe(1);
  });
  it.each(['legacy', 'enforce'])('의도 오류와 위기 관문 %s', async (mode) => {
    const invalid = host(mode);
    const response = await invalid.run({ chatAttemptIntent: 'invalid' });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_chat_attempt_intent' });
    expect(invalid.count(admissionFn)).toBe(0); expectNoDispatch(invalid);
    const crisis = host(mode);
    expect((await crisis.run({ user: '죽고 싶어', chatAttemptIntent: 'invalid' })).status).toBe(422);
    expect(crisis.count(admissionFn)).toBe(0); expectNoDispatch(crisis);
  });
  it.each([
    ['legacy', turnId], ['legacy', undefined], ['legacy', 'bad-id'],
    ['enforce', undefined], ['enforce', 'bad-id'],
  ])('명시적 재질문보다 위기 안내 우선 %s %s', async (mode, id) => {
    const h = host(mode);
    const response = await h.run({ user: '죽고 싶어', chatAttemptIntent: 'reask', chatTurnId: id });
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body).toMatchObject({ error: 'safety_red_zone', reason: 'crisis_term_detected' });
    // The self-harm response keeps the default guidance lane (no 112/119 override).
    expect(body).not.toHaveProperty('crisis_lane');
    expect(h.count(admissionFn)).toBe(0); expectNoDispatch(h);
  });
  it.each([
    ['legacy', turnId], ['legacy', undefined], ['enforce', undefined], ['enforce', 'bad-id'],
  ])('재질문 불가 %s %s', async (mode, id) => {
    const h = host(mode);
    const response = await h.run({ chatAttemptIntent: 'reask', chatTurnId: id });
    const body = await response.json();
    expect(response.status).toBe(409); expect(body.error).toBe('reask_ineligible');
    if (id === undefined) expect(body).toEqual({ error: 'reask_ineligible' });
    else expect(body.turnAdmission).toEqual({
      mode, allowed: false, kind: 'rejected', attempt: null,
      quotaCharged: false, bindingEligible: false, reaskAvailable: false,
    });
    expect(h.count(admissionFn)).toBe(0); expectNoDispatch(h);
  });
  it.each([
    ['turn', {}],
    ['intent only', { chatTurnId: undefined, chatAttemptIntent: 'first' }],
    ['reask only', { chatTurnId: undefined, chatAttemptIntent: 'reask' }],
    ['turn and reask', { chatAttemptIntent: 'reask' }],
    ['neither', { chatTurnId: undefined }],
  ] as [string, Record<string, unknown>][])('legacy 키 누락은 main과 같은 무차감 500 %s', async (_name, patch) => {
    for (const mode of [undefined, 'legacy']) {
      const h = host();
      h.envValues.set('CHAT_TURN_ADMISSION_MODE', mode);
      h.envValues.delete('OPENAI_API_KEY');
      const response = await h.run(patch);
      expect(response.status).toBe(500);
      // Keep main's early error bytes, including the absence of an envelope.
      expect(await response.text()).toBe('{"error":"server_misconfigured_missing_OPENAI_API_KEY"}');
      expect(h.rpc).not.toHaveBeenCalled();
      expect(h.audit).not.toHaveBeenCalled();
      expectNoDispatch(h);
    }
  });
  describe.each(['legacy', 'enforce'])('새 허가 없는 키 누락 %s', (mode) => {
    it.each([undefined, null, '', 'bad-id', 7, { id: turnId }, `${turnId} `])(
      '유효하지 않은 턴 %#는 의도와 무관하게 RPC 0', async (id) => {
        for (const intent of [undefined, 'first', 'reask', 'invalid']) {
          const h = host(mode);
          h.envValues.delete('OPENAI_API_KEY');
          const response = await h.run({ chatTurnId: id, chatAttemptIntent: intent });
          expect(response.status).toBe(500);
          expect(await response.text()).toBe('{"error":"server_misconfigured_missing_OPENAI_API_KEY"}');
          expect(h.rpc).not.toHaveBeenCalled();
          expect(h.audit).not.toHaveBeenCalled();
          expectNoDispatch(h);
        }
      },
    );
  });

  // Fixed stage expectations also run against the pinned main source in the
  // local differential probe. Only enforce + valid turn changes the quota path.
  describe.each(['legacy', 'enforce'])('분기 행렬 %s', (mode) => {
    describe.each([
      ['valid turn', { chatTurnId: turnId, chatAttemptIntent: 'first' }, true],
      ['no turn', { chatTurnId: undefined }, false],
      ['intent only', { chatTurnId: undefined, chatAttemptIntent: 'first' }, false],
      ['invalid turn', { chatTurnId: 'bad-id', chatAttemptIntent: 'first' }, false],
    ] as [string, Record<string, unknown>, boolean][])('%s', (_shape, patch, validTurn) => {
      it.each([
        // failure, HTTP, error, reached quota, spend, capacity, model
        ['success', 200, undefined, 1, 1, 1, 1],
        ['missing_key', 500, 'server_misconfigured_missing_OPENAI_API_KEY', 0, 0, 0, 0],
        ['bad_key', 500, 'server_misconfigured_malformed_api_key', 1, 1, 0, 0],
        ['consent_denied', 403, 'consent_required', 0, 0, 0, 0],
        ['consent_error', 503, 'consent_check_unavailable', 0, 0, 0, 0],
        ['tier_error', 503, 'entitlement_check_unavailable', 0, 0, 0, 0],
        ['crisis', 422, 'safety_red_zone', 0, 0, 0, 0],
        ['purpose_limit', 429, 'purpose_limit_exceeded', 1, 0, 0, 0],
        ['purpose_error', 503, 'purpose_limit_unavailable', 1, 0, 0, 0],
        ['spend_limit', 429, 'daily_limit_exceeded', 1, 1, 0, 0],
        ['spend_error', 503, 'spend_check_unavailable', 1, 1, 0, 0],
        ['spend_throw', 503, 'spend_check_unavailable', 1, 1, 0, 0],
        ['capacity_limit', 429, 'llm_capacity_exceeded', 1, 1, 1, 0],
        ['capacity_error', 503, 'llm_capacity_unavailable', 1, 1, 1, 0],
        ['model_error', 502, 'upstream_error', 1, 1, 1, 1],
        ['model_throw', 502, 'upstream_unreachable', 1, 1, 1, 1],
        ['bad_payload', 502, 'upstream_bad_payload', 1, 1, 1, 1],
        ['refusal', 502, 'upstream_refusal', 1, 1, 1, 1],
        ['truncated', 502, 'upstream_truncated', 1, 1, 1, 1],
      ] as [string, number, string | undefined, number, number, number, number][])(
        '%s', async (failure, status, error, quota, spend, capacity, model) => {
          jest.useFakeTimers();
          const h = host(mode);
          const admission = mode === 'enforce' && validTurn;
          if (failure === 'missing_key') {
            h.envValues.delete('OPENAI_API_KEY');
            if (admission) { quota = 1; spend = 1; }
          }
          if (failure === 'bad_key') h.envValues.set('OPENAI_API_KEY', 'fixture\nkey');
          if (failure.startsWith('consent_')) h.overrides.set('effective_llm_consent_snapshot_v2', () =>
            failure === 'consent_denied' ? { data: { allowed: false, token: null } } : { error: {} });
          if (failure === 'tier_error') h.overrides.set('effective_subscription_tier', () => ({ error: {} }));
          if (failure.startsWith('purpose_')) {
            h.overrides.set('consume_llm_proxy_purpose_quota', () => failure === 'purpose_limit'
              ? { data: [{ allowed: false, used: 5, quota_limit: 5 }] } : { error: {} });
            h.overrides.set(admissionFn, () => ({ error: { code: failure === 'purpose_limit' ? 'T3901' : 'P0001' } }));
            if (admission && failure === 'purpose_error') error = 'chat_admission_unavailable';
          }
          if (failure.startsWith('spend_')) h.overrides.set('bump_gemini_spend', () => {
            if (failure === 'spend_throw') throw new Error('fixture');
            return { error: { message: failure === 'spend_limit' ? 'gemini_spend_exceeded' : 'unavailable' } };
          });
          if (failure.startsWith('capacity_')) h.overrides.set('reserve_llm_proxy_capacity', () => ({
            error: { message: failure === 'capacity_limit' ? 'llm_capacity_exceeded' : 'unavailable' },
          }));
          if (failure === 'model_error') h.fetch.mockResolvedValue(Response.json({ error: 'fixture' }, { status: 500 }));
          if (failure === 'model_throw') h.fetch.mockRejectedValue(new Error('fixture'));
          if (failure === 'bad_payload') h.fetch.mockResolvedValue(Response.json({ invalid: true }));
          if (failure === 'refusal' || failure === 'truncated') h.fetch.mockResolvedValue(Response.json({
            choices: [{ message: { content: 'Fixture', ...(failure === 'refusal' ? { refusal: 'no' } : {}) },
              finish_reason: failure === 'truncated' ? 'length' : 'stop' }],
          }));
          if (['model_error', 'model_throw', 'bad_payload', 'refusal', 'truncated'].includes(failure)) {
            const transport = h.fetch.getMockImplementation()!;
            h.fetch.mockImplementation(async () => { h.events.push('model'); return transport(); });
          }
          const response = await h.run({ ...patch, ...(failure === 'crisis' ? { user: '죽고 싶어' } : {}) });
          const body = await response.json();
          expect(response.status).toBe(status);
          expect(body.error).toBe(error);
          if (failure === 'missing_key' && !admission) {
            expect(body).toEqual({ error });
            expect(h.rpc).not.toHaveBeenCalled();
          }
          if (patch.chatTurnId === undefined) expect(body).not.toHaveProperty('turnAdmission');
          const quotaFn = admission ? admissionFn : 'consume_llm_proxy_purpose_quota';
          expect(h.count(quotaFn)).toBe(quota);
          expect(h.count(admission ? 'consume_llm_proxy_purpose_quota' : admissionFn)).toBe(0);
          expect(h.count('bump_gemini_spend')).toBe(spend);
          expect(h.count('refund_gemini_spend')).toBe(
            failure === 'bad_key' || failure.startsWith('capacity_') || (failure === 'missing_key' && admission) ? 1 : 0,
          );
          expect(h.count('reserve_llm_proxy_capacity')).toBe(capacity);
          expect(h.count('settle_llm_proxy_capacity')).toBe(model);
          expect(h.count('release_llm_proxy_capacity')).toBe(0);
          expect(h.count('begin_chat_turn_attempt')).toBe(!admission && validTurn ? model : 0);
          expect(h.count('claim_chat_turn_for_audit')).toBe(validTurn && failure === 'success' ? 1 : 0);
          expect(h.fetch).toHaveBeenCalledTimes(model);
          expect(h.audit).toHaveBeenCalledTimes(model);
          // This full event list pins early gate order as well as all side effects.
          const events = failure === 'missing_key' && !admission ? []
            : ['effective_llm_consent_snapshot_v2',
              ...(!failure.startsWith('consent_') && failure !== 'crisis' ? ['effective_subscription_tier'] : [])];
          if (quota) events.push(quotaFn);
          if (spend) events.push('bump_gemini_spend');
          if (capacity) events.push('reserve_llm_proxy_capacity');
          if (failure === 'bad_key' || failure.startsWith('capacity_') || (failure === 'missing_key' && admission)) events.push('refund_gemini_spend');
          if (model) {
            if (!admission && validTurn) events.push('begin_chat_turn_attempt');
            events.push('model', 'settle_llm_proxy_capacity', 'audit');
            if (failure === 'success') {
              events.push('effective_llm_consent_snapshot_v2');
              if (validTurn) events.push('claim_chat_turn_for_audit');
            }
          }
          expect(h.events).toEqual([...events, 'response']);
        },
      );
    });
  });

  it.each(['tier', 'consent_unavailable', 'consent_denied', 'input', 'crisis'])(
    '허가 전 실패 봉투는 미확정 %s', async (gate) => {
      const h = host();
      if (gate === 'tier') h.overrides.set('effective_subscription_tier', () => ({ error: {} }));
      if (gate === 'consent_unavailable') h.overrides.set('effective_llm_consent_snapshot_v2', () => ({ error: {} }));
      if (gate === 'consent_denied') h.overrides.set('effective_llm_consent_snapshot_v2', () => ({ data: { allowed: false, token: null } }));
      const response = await h.run({
        chatAttemptIntent: 'reask',
        ...(gate === 'input' ? { user: '' } : gate === 'crisis' ? { user: '죽고 싶어' } : {}),
      });
      expect(response.status).toBe(gate === 'input' ? 400 : gate === 'crisis' ? 422 : gate === 'consent_denied' ? 403 : 503);
      expect((await response.json()).turnAdmission).toEqual({
        mode: 'enforce', allowed: null, kind: null, attempt: null,
        quotaCharged: false, bindingEligible: null, reaskAvailable: null,
      });
      expect(h.count(admissionFn)).toBe(0); expectNoDispatch(h);
    },
  );
  it.each([first, second, unbound])('요청 의도와 실제 $kind', async (row) => {
    const h = host(); h.overrides.set(admissionFn, () => ({ data: row }));
    const response = await h.run({ chatAttemptIntent: 'reask' });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ turnAdmission: wire(row), turnBound: row.bindingEligible });
    expect(h.rpc.mock.calls.find(([name]) => name === admissionFn)).toEqual([admissionFn, {
      p_user_id: userId, p_audit_id: auditId, p_turn_id: turnId, p_provider: 'openai', p_attempt_intent: 'reask',
    }]);
    expect(h.count('begin_chat_turn_attempt')).toBe(0);
    expect(h.count('consume_llm_proxy_purpose_quota')).toBe(0);
    expect(h.count('claim_chat_turn_for_audit')).toBe(row.bindingEligible ? 1 : 0);
    expect(h.audit.mock.calls[0][0].id).toBe(auditId);
    const order = [admissionFn, 'bump_gemini_spend', 'reserve_llm_proxy_capacity', 'model', 'audit', 'response'].map((event) => h.events.indexOf(event));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
  it.each(['legacy', 'enforce'])('요청 중 모드 고정 %s', async (mode) => {
    const h = host(mode);
    h.overrides.set('effective_subscription_tier', () => {
      h.envValues.set('CHAT_TURN_ADMISSION_MODE', mode === 'legacy' ? 'enforce' : 'legacy');
      return { data: 'free' };
    });
    const response = await h.run();
    expect((await response.json()).turnAdmission.mode).toBe(mode);
    expect(h.env.mock.calls.filter(([name]) => name === 'CHAT_TURN_ADMISSION_MODE')).toHaveLength(1);
    expect(h.count(admissionFn)).toBe(mode === 'enforce' ? 1 : 0);
  });

  it.each(['spend_limit', 'spend_error', 'spend_throw', 'missing_key', 'bad_key', 'capacity_limit', 'capacity_error', 'model_error', 'model_throw', 'bad_payload', 'refusal', 'truncated'])(
    '허가 뒤 실패 %s', async (failure) => {
      const h = host(); h.overrides.set(admissionFn, () => ({ data: second }));
      if (failure.startsWith('spend_')) h.overrides.set('bump_gemini_spend', () => {
        if (failure === 'spend_throw') throw new Error('fixture');
        return { error: { message: failure === 'spend_limit' ? 'gemini_spend_exceeded' : 'unavailable' } };
      });
      if (failure === 'missing_key') h.envValues.delete('OPENAI_API_KEY');
      if (failure === 'bad_key') h.envValues.set('OPENAI_API_KEY', 'fixture\nkey');
      if (failure.startsWith('capacity_')) h.overrides.set('reserve_llm_proxy_capacity', () => failure === 'capacity_limit' ? { data: { accepted: false } } : { error: {} });
      if (failure === 'model_error') h.fetch.mockResolvedValue(Response.json({ error: 'fixture' }, { status: 500 }));
      if (failure === 'model_throw') h.fetch.mockRejectedValue(new Error('fixture'));
      if (failure === 'bad_payload') h.fetch.mockResolvedValue(Response.json({ invalid: true }));
      if (failure === 'refusal' || failure === 'truncated') h.fetch.mockResolvedValue(Response.json({ choices: [{ message: { content: 'Fixture', ...(failure === 'refusal' ? { refusal: 'no' } : {}) }, finish_reason: failure === 'truncated' ? 'length' : 'stop' }] }));
      const response = await h.run();
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect((await response.json()).turnAdmission).toEqual(wire(second));
      expect(h.count(admissionFn)).toBe(1);
      expect(h.count('consume_llm_proxy_purpose_quota')).toBe(0);
      expect(h.count('begin_chat_turn_attempt')).toBe(0);
      expect(h.count('claim_chat_turn_for_audit')).toBe(0);
      expect(h.count('refund_gemini_spend')).toBe(['missing_key', 'bad_key', 'capacity_limit', 'capacity_error'].includes(failure) ? 1 : 0);
      expect(h.count('release_llm_proxy_capacity')).toBe(0);
      if (failure.startsWith('spend_') || failure.endsWith('_key') || failure.startsWith('capacity_')) expect(h.fetch).not.toHaveBeenCalled();
      expect(h.rpc.mock.calls.some(([name]) => /refund_chat|refund.*purpose/.test(name))).toBe(false);
    },
  );

  it('감사와 동의 재확인과 claim을 기다림', async () => {
    const h = host(); const audit = deferred<DbResult>(); const consent = deferred<DbResult>(); const claim = deferred<DbResult>();
    h.audit.mockImplementation(() => audit.promise);
    let snapshots = 0;
    h.overrides.set('effective_llm_consent_snapshot_v2', () => ++snapshots === 1
      ? { data: { allowed: true, token: 'a'.repeat(64) } } : consent.promise);
    h.overrides.set('claim_chat_turn_for_audit', () => claim.promise);
    const pending = h.run();
    await waitFor(h, 'audit');
    expect(h.events).not.toContain('response'); expect(snapshots).toBe(1);
    audit.resolve({ data: { id: auditId } });
    await waitFor(h, 'effective_llm_consent_snapshot_v2', 2);
    expect(h.events).not.toContain('response'); expect(h.count('claim_chat_turn_for_audit')).toBe(0);
    consent.resolve({ data: { allowed: true, token: 'a'.repeat(64) } });
    await waitFor(h, 'claim_chat_turn_for_audit');
    expect(h.events).not.toContain('response');
    claim.resolve({ data: true });
    const response = await pending;
    expect(await response.json()).toMatchObject({ audited: true, auditId, turnBound: true, turnAdmission: wire() });
  });
  it.each(['audit', 'claim', 'claim_timeout', 'consent'])('결과 확인 실패 %s', async (failure) => {
    jest.useFakeTimers();
    const h = host();
    if (failure === 'audit') h.audit.mockResolvedValue({ error: {} });
    if (failure === 'claim') h.overrides.set('claim_chat_turn_for_audit', () => ({ error: {} }));
    if (failure === 'claim_timeout') h.overrides.set('claim_chat_turn_for_audit', () => new Promise(() => {}));
    if (failure === 'consent') h.audit.mockImplementation(async () => {
      h.overrides.set('effective_llm_consent_snapshot_v2', () => ({ data: { allowed: false, token: null } }));
      return { data: { id: auditId } };
    });
    const pending = h.run();
    if (failure === 'claim_timeout') {
      await waitFor(h, 'claim_chat_turn_for_audit');
      await jest.advanceTimersByTimeAsync(1499); expect(h.events).not.toContain('response');
      await jest.advanceTimersByTimeAsync(1);
    }
    const response = await pending; const body = await response.json();
    expect(body.turnAdmission).toEqual(wire());
    if (failure === 'consent') {
      expect(response.status).toBe(403); expect(body.error).toBe('consent_required'); expect(body.text).toBeUndefined();
    } else {
      expect(response.status).toBe(200); expect(body.turnBound).toBe(false);
      expect(body.audited).toBe(failure !== 'audit');
      if (failure === 'audit') expect(body.auditId).toBeUndefined();
    }
    expect(h.count('claim_chat_turn_for_audit')).toBe(failure.startsWith('claim') ? 1 : 0);
  });

  it.each(['legacy', 'enforce'])('예약 없는 응답 바이트 %s', async (mode) => {
    jest.useFakeTimers();
    const h = host(mode); const response = await h.run({ chatTurnId: undefined });
    expect(await response.text()).toBe(JSON.stringify({ text: 'Fixture reply', modelUsed: 'fixture-model', latencyMs: 0, audited: true, auditId }));
    expect(h.count(admissionFn)).toBe(0); expect(h.count('begin_chat_turn_attempt')).toBe(0);
    expect(h.count('consume_llm_proxy_purpose_quota')).toBe(1);
    const failed = host(mode); failed.overrides.set('bump_gemini_spend', () => ({ error: { message: 'gemini_spend_exceeded' } }));
    expect(await (await failed.run({ chatTurnId: undefined })).text()).toBe('{"error":"daily_limit_exceeded"}');
  });
  it('다른 목적은 새 의도를 해석하지 않음', async () => {
    const h = host(); const response = await h.run({ purpose: 'persona_narrative', chatAttemptIntent: 'invalid' });
    expect(response.status).toBe(200); expect((await response.json()).turnAdmission).toBeUndefined();
    expect(h.count(admissionFn)).toBe(0); expect(h.count('consume_llm_proxy_purpose_quota')).toBe(1);
  });
  it.each(['input', 'crisis', 'tier', 'consent', 'seat'])('기존 검사 뒤에 허가 %s', async (gate) => {
    const h = host();
    if (gate === 'tier') h.overrides.set('effective_subscription_tier', () => ({ error: {} }));
    if (gate === 'consent') h.overrides.set('effective_llm_consent_snapshot_v2', () => ({ data: { allowed: false, token: null } }));
    const response = await h.run(gate === 'input' ? { user: '' } : gate === 'crisis' ? { user: '죽고 싶어', chatAttemptIntent: 'reask' } : gate === 'seat' ? { purpose: 'unknown' } : {});
    expect(response.status).toBe(gate === 'tier' ? 503 : gate === 'consent' ? 403 : gate === 'crisis' ? 422 : 400);
    expect(h.count(admissionFn)).toBe(0); expectNoDispatch(h);
  });
  it.each(['limited', 'unavailable', 'spend'])('legacy 실패의 차감 결과 %s', async (failure) => {
    const h = host('legacy');
    if (failure === 'limited') h.overrides.set('consume_llm_proxy_purpose_quota', () => ({ data: [{ allowed: false, used: 5, quota_limit: 5 }] }));
    if (failure === 'unavailable') h.overrides.set('consume_llm_proxy_purpose_quota', () => ({ error: {} }));
    if (failure === 'spend') h.overrides.set('bump_gemini_spend', () => ({ error: { message: 'gemini_spend_exceeded' } }));
    const response = await h.run();
    expect(response.status).toBe(failure === 'unavailable' ? 503 : 429);
    expect((await response.json()).turnAdmission).toEqual({ mode: 'legacy', allowed: false, kind: null, attempt: null, quotaCharged: failure === 'spend' ? true : failure === 'limited' ? false : null, bindingEligible: null, reaskAvailable: null });
    expect(h.count(admissionFn)).toBe(0); expect(h.fetch).not.toHaveBeenCalled();
  });
});
