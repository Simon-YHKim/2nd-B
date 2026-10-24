import {
  verifyInterviewFinalizeAuth as verify,
  INTERVIEW_FINALIZE_AUTH_MAX_BYTES, INTERVIEW_FINALIZE_AUTH_TIMEOUT_MS,
} from '../../supabase/functions/_shared/interview-finalize-auth';

const owner = '11111111-1111-4111-8111-111111111111';
const session = '22222222-2222-4222-8222-222222222222';
const nowMs = 2_000_000_000_000;
const claims = () => ({ sub: owner, role: 'authenticated', session_id: session, exp: nowMs / 1000 + 60 });
const tokenFromRaw = (raw: string | Buffer) => `e30.${Buffer.from(raw).toString('base64url')}.c2ln`;
const token = (value: unknown = claims()) => tokenFromRaw(JSON.stringify(value));
const header = (value: unknown = claims()) => `Bearer ${token(value)}`;
const success = () => ({ data: { user: { id: owner } }, error: null });
const goodAuth = () => ({ getUser: jest.fn(async (_jwt: string) => success()) });
const invalid = { ok: false, code: 'invalid_authorization' };
const unavailable = { ok: false, code: 'auth_unavailable' };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}

describe('dormant finalize verified Auth adapter (no actual network)', () => {
  afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

  test('getUser verifies the exact token before extracting identity and checks a fresh clock', async () => {
    const events: string[] = [];
    const auth = { getUser: jest.fn(async (_jwt: string) => { events.push('verified'); return success(); }) };
    const result = await verify(header(), { auth, now: () => { events.push('clock'); return nowMs; } });
    expect(auth.getUser).toHaveBeenCalledWith(token());
    expect(events).toEqual(['verified', 'clock']);
    expect(result).toEqual({ ok: true, auth: {
      ownerId: owner, authSessionId: session, expiresAt: new Date(nowMs + 60_000).toISOString(), expiresAtEpochMs: nowMs + 60_000,
    } });
    expect(Object.isFrozen(result)).toBe(true);
    if (result.ok) expect(Object.isFrozen(result.auth)).toBe(true);
    expect(JSON.stringify(result)).not.toContain(token());
  });

  test.each([
    null, undefined, {}, '', 'bearer a.b.c', 'Bearer a.b', 'Bearer a.b.c.d',
    'Bearer  a.b.c', 'Bearer a.b.c\n', ' Bearer a.b.c', 'Bearer a.b=.c',
    'Bearer é.b.c', `Bearer ${'a'.repeat(INTERVIEW_FINALIZE_AUTH_MAX_BYTES)}.b.c`,
  ])('malformed/bounded header %j makes zero Auth calls', async authorization => {
    const auth = goodAuth();
    expect(await verify(authorization, { auth })).toEqual(invalid);
    expect(auth.getUser).not.toHaveBeenCalled();
  });

  test('unverified getUser failure does not decode otherwise valid claims or read time', async () => {
    const clock = jest.fn(() => nowMs); const decode = jest.spyOn(globalThis, 'atob');
    const auth = { getUser: jest.fn(async () => ({ data: { user: { id: owner } }, error: new Error(token()) })) };
    expect(await verify(header(), { auth, now: clock })).toEqual(invalid);
    expect(clock).not.toHaveBeenCalled(); expect(decode).not.toHaveBeenCalled();
    expect(await verify(header(), { auth: { getUser: async () => ({ data: { user: null }, error: null }) } })).toEqual(invalid);
  });

  test('syntactically valid but malformed payload is decoded only after successful getUser', async () => {
    const decode = jest.spyOn(globalThis, 'atob'); const pending = deferred<ReturnType<typeof success>>();
    const auth = { getUser: jest.fn(() => pending.promise) };
    const result = verify('Bearer e30.a.c2ln', { auth, now: () => nowMs });
    await Promise.resolve(); expect(auth.getUser).toHaveBeenCalledTimes(1);
    expect(decode).not.toHaveBeenCalled(); pending.resolve(success());
    expect(await result).toEqual(invalid);
  });

  test.each([
    { sub: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }, { sub: null },
    { role: 'service_role' }, { role: 'anon' }, { session_id: 'bad' }, { session_id: null },
    { exp: undefined }, { exp: null }, { exp: '2000000060' }, { exp: 0 }, { exp: -1 },
    { exp: 2000000000.5 }, { exp: Number.MAX_SAFE_INTEGER }, { exp: 8_640_000_000_001 },
  ])('verified token still rejects malformed/mismatched claims %j', async change => {
    const auth = goodAuth(); const clock = jest.fn(() => nowMs);
    expect(await verify(header({ ...claims(), ...change }), { auth, now: clock })).toEqual(invalid);
    expect(auth.getUser).toHaveBeenCalledTimes(1);
    expect(clock).not.toHaveBeenCalled();
  });

  test('duplicate claims, invalid UTF-8, arrays and excessive JSON depth are rejected', async () => {
    const duplicate = JSON.stringify(claims()).replace('"sub":', `"sub":"${owner}","sub":`);
    const raw = [duplicate, Buffer.from([0xff]), '[]', 'null', '{"a":' + '['.repeat(18) + '0' + ']'.repeat(18) + '}'];
    for (const payload of raw) {
      expect(await verify(`Bearer ${tokenFromRaw(payload)}`, { auth: goodAuth(), now: () => nowMs })).toEqual(invalid);
    }
  });

  test('sub must equal the actual verified Auth user; comparison is not a decoded-sub fallback', async () => {
    const user = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const auth = { getUser: jest.fn(async () => ({ data: { user: { id: user } }, error: null })) };
    expect(await verify(header(), { auth, now: () => nowMs })).toEqual(invalid);
    expect(await verify(header({ ...claims(), sub: user.toUpperCase() }), { auth, now: () => nowMs })).toEqual(invalid);
    const upperAuth = { getUser: async () => ({ data: { user: { id: user.toUpperCase() } }, error: null }) };
    expect(await verify(header({ ...claims(), sub: user.toUpperCase(), session_id: user.toUpperCase() }), { auth: upperAuth, now: () => nowMs }))
      .toMatchObject({ ok: true, auth: { ownerId: user, authSessionId: user } });
  });

  test.each([nowMs, nowMs + 1])('expiry at/before final clock %i is rejected', async now => {
    expect(await verify(header({ ...claims(), exp: nowMs / 1000 }), { auth: goodAuth(), now: () => now })).toEqual(invalid);
  });

  test('an Auth wait that crosses expiry cannot reuse a pre-wait clock', async () => {
    let now = nowMs; const pending = deferred<ReturnType<typeof success>>();
    const clock = jest.fn(() => now);
    const result = verify(header({ ...claims(), exp: (nowMs + 1000) / 1000 }), { auth: { getUser: () => pending.promise }, now: clock });
    await Promise.resolve(); expect(clock).not.toHaveBeenCalled();
    now += 1000; pending.resolve(success());
    expect(await result).toEqual(invalid); expect(clock).toHaveBeenCalledTimes(1);
  });

  test('live expiry after an Auth wait still admits the observed identity', async () => {
    const pending = deferred<ReturnType<typeof success>>();
    const result = verify(header(), { auth: { getUser: () => pending.promise }, now: () => nowMs + 59_999 });
    pending.resolve(success()); expect(await result).toMatchObject({ ok: true, auth: { ownerId: owner } });
  });

  test.each([NaN, Infinity, -1, 1.5])('invalid final clock %j fails closed', async now => {
    expect(await verify(header(), { auth: goodAuth(), now: () => now })).toEqual(unavailable);
  });

  test('underlying errors and timeouts never include a bearer or exception message', async () => {
    const log = jest.spyOn(console, 'log'); const error = jest.spyOn(console, 'error'); const warn = jest.spyOn(console, 'warn');
    expect(await verify(header(), { auth: { getUser: () => { throw new Error(`private ${token()}`); } } })).toEqual(unavailable);
    jest.useFakeTimers();
    const pending = deferred<ReturnType<typeof success>>();
    const auth = { getUser: jest.fn(() => pending.promise) };
    const result = verify(header(), { auth, now: () => nowMs });
    await jest.advanceTimersByTimeAsync(INTERVIEW_FINALIZE_AUTH_TIMEOUT_MS);
    const failed = await result; expect(failed).toEqual(unavailable);
    pending.resolve(success()); await Promise.resolve();
    expect(failed).toEqual(unavailable); expect(auth.getUser).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
    expect(log).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled(); expect(warn).not.toHaveBeenCalled();
  });

  test('a successful observation does not bypass later DB live-session revalidation', async () => {
    // The helper deliberately issues no DB calls/lease/retry receipt. S1 actual
    // PostgreSQL wait tests, not this Auth mock, prove DB-side revalidation.
    const result = await verify(header(), { auth: goodAuth(), now: () => nowMs });
    expect(Object.keys(result)).toEqual(['ok', 'auth']);
    if (result.ok) expect(Object.keys(result.auth)).toEqual(['ownerId', 'authSessionId', 'expiresAt', 'expiresAtEpochMs']);
  });
});
