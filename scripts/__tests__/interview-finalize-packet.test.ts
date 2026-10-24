import { createHash, webcrypto } from 'node:crypto';
import {
  canonicalInterviewFinalizePacket as canonical, decodeInterviewFinalizePacket as decode,
  digestInterviewFinalizePacket as digest, parseInterviewFinalizePacket as parse,
  renderInterviewFinalizeRecord as render, InterviewFinalizePacketError,
  INTERVIEW_FINALIZE_PACKET_MAX_BYTES,
} from '../../supabase/functions/_shared/interview-finalize-packet';
import { storedTurns, storyTitle } from '../../src/lib/interview/saved-story';

const owner = '11111111-1111-4111-8111-111111111111';

test.each(['ko', 'en', 'es', 'pt', 'id'])('T37 dormant record renderer preserves explicit opener provenance for %s', uiLanguage => {
  const value = fixture(); value.uiLanguage = uiLanguage;
  value.conversationLocale = uiLanguage === 'ko' ? 'ko' : 'en';
  value.turns[1].openerUnedited = true;
  expect(render(value, 'Star').body).toContain(uiLanguage === 'ko' ? '답변(제안 그대로): A!' : 'A (suggested, sent as is): A!');
});
const fixture = () => ({
  v: 1,
  intent: {
    requestId: '22222222-2222-4222-8222-222222222222',
    sessionId: '33333333-3333-4333-8333-333333333333',
    draftId: '44444444-4444-4444-8444-444444444444',
    revision: 7,
    contentGeneration: '55555555-5555-4555-8555-555555555555',
  },
  ruleSet: 'r1-q5', period: 'now', conversationLocale: 'en', uiLanguage: 'es', growthOrigin: false,
  turns: [
    { n: 1, scene: 1, role: 'interviewer' as const, text: 'Q?', layer: 'fact', origin: 'fixed', askKind: 'seed', openerUnedited: null as boolean | null, state: null as string | null },
    { n: 2, scene: 1, role: 'user' as const, text: 'A!', layer: 'fact', origin: 'user', askKind: null as string | null, openerUnedited: false as boolean | null, state: 'judged' as string | null },
  ],
});
const canonicalGolden = 'T16-FINALIZE-PACKET/1\n'
  + 'S36:11111111-1111-4111-8111-111111111111;S36:22222222-2222-4222-8222-222222222222;'
  + 'S36:33333333-3333-4333-8333-333333333333;S36:44444444-4444-4444-8444-444444444444;'
  + 'I7;S36:55555555-5555-4555-8555-555555555555;S5:r1-q5;S3:now;S2:en;S2:es;F;I2;'
  + 'I1;I1;S11:interviewer;S4:fact;S5:fixed;S4:seed;N;N;S2:Q?;'
  + 'I2;I1;S4:user;S4:fact;S4:user;N;F;S6:judged;S2:A!;';

function rejects(value: unknown, code = 'invalid_packet') {
  try { parse(value); throw new Error('unexpected success'); }
  catch (error) {
    expect(error).toBeInstanceOf(InterviewFinalizePacketError);
    expect((error as InterviewFinalizePacketError).code).toBe(code);
    expect((error as Error).message).toBe(code);
  }
}

describe('dormant interview finalize packet', () => {
  beforeAll(() => { Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true }); });

  test('fixed typed canonical bytes bind the original intent revision and verified owner', async () => {
    expect(canonical(fixture(), owner)).toBe(canonicalGolden);
    const expected = createHash('sha256').update(canonicalGolden, 'utf8').digest('hex');
    // Also matched by actual PostgreSQL sha256(convert_to(..., 'UTF8')).
    expect(expected).toBe('06ae245e7f9a56a8b8f5494adfcef49cd5be600cbd2ad81ce1749aa7e36c2ce1');
    expect(await digest(fixture(), owner)).toBe(expected);
    const packet = fixture(); packet.intent.revision = 8;
    expect(await digest(packet, owner)).not.toBe(expected);
    expect(await digest(fixture(), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).not.toBe(expected);
    rejects({ ...fixture(), revision: 8 }); // outer CAS revision cannot replace intent revision
    rejects({ ...fixture(), ownerId: owner });
  });

  test('JSON field order/formatting cannot move digest; all identity and source fields do', () => {
    const packet = fixture();
    const reversed: Record<string, unknown> = Object.fromEntries(Object.entries(packet).reverse());
    reversed.intent = Object.fromEntries(Object.entries(packet.intent).reverse());
    reversed.turns = packet.turns.map(turn => Object.fromEntries(Object.entries(turn).reverse()));
    expect(canonical(decode(JSON.stringify(reversed, null, 2)), owner)).toBe(canonicalGolden);
    const changed = (change: (value: ReturnType<typeof fixture>) => void) => {
      const value = fixture(); change(value); expect(canonical(value, owner)).not.toBe(canonicalGolden);
    };
    for (const key of ['requestId', 'sessionId', 'draftId', 'contentGeneration'] as const) {
      changed(value => { value.intent[key] = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; });
    }
    changed(value => { value.ruleSet = 'r0'; });
    changed(value => { value.period = 'work'; });
    changed(value => { value.uiLanguage = 'pt'; });
    changed(value => { value.growthOrigin = true; });
    changed(value => { value.conversationLocale = value.uiLanguage = 'ko'; });
    changed(value => { value.turns.forEach(turn => { turn.scene = 2; }); });
    changed(value => { value.turns[0].origin = 'model'; });
    changed(value => { value.turns[0].askKind = 'drill'; });
    changed(value => { value.turns[1].layer = 'meaning'; });
    changed(value => { value.turns[1].state = 'unsettled'; });
    changed(value => { value.turns[1].openerUnedited = null; });
    changed(value => { value.turns[1].openerUnedited = true; });
    changed(value => { value.turns[1].text = 'A?'; });
    changed(value => { value.turns.push({ ...value.turns[1], n: 3 }); });
  });

  test('deep immutable copy captures digest input before the asynchronous hash', async () => {
    const value = fixture(); const packet = parse(value);
    expect([packet, packet.intent, packet.turns, ...packet.turns].every(Object.isFrozen)).toBe(true);
    const pending = digest(value, owner);
    value.intent.revision = 99; value.turns[1].text = 'later mutation'; value.turns.pop();
    expect(packet.intent.revision).toBe(7); expect(packet.turns[1].text).toBe('A!');
    expect(await pending).toBe(createHash('sha256').update(canonicalGolden).digest('hex'));
  });

  test('raw transcript bytes stay unchanged while real storedTurns removes only trailing questions', () => {
    const value = fixture(); value.turns[1].text = '  e\u0301\r\n가 👩🏽‍💻\t  ';
    value.turns.push({ ...value.turns[0], n: 3, text: 'unanswered' });
    value.turns.push({ ...value.turns[0], n: 4, text: 'also unanswered' });
    const selected = storedTurns(value.turns);
    expect(parse(value).turns).toEqual(selected);
    expect(render(value, 'Now')).toEqual({
      body: 'Q: Q?\n\nA:   e\u0301\r\n가 👩🏽‍💻\t  ', summary: 'Now · é 가 👩🏽‍💻',
    });
    expect(canonical(value, owner)).toBe(canonical({ ...value, turns: selected }, owner));
    expect(value.turns).toHaveLength(4);
    value.turns[3].text = '\u0000'; rejects(value);
  });

  test.each(['ko', 'en', 'es', 'pt', 'id'])('renders approved conversation locale for %s UI', uiLanguage => {
    const value = fixture(); value.uiLanguage = uiLanguage;
    value.conversationLocale = uiLanguage === 'ko' ? 'ko' : 'en';
    expect(render(value, '별').body).toBe(uiLanguage === 'ko' ? '질문: Q?\n\n답변: A!' : 'Q: Q?\n\nA: A!');
    value.conversationLocale = uiLanguage === 'ko' ? 'en' : 'ko'; rejects(value);
  });

  test.each([
    ['  first\n\t answer.  ', 'first answer'],
    ['가'.repeat(41), `${'가'.repeat(40)}…`],
    ['x'.repeat(39) + '👩🏽‍💻end', `${'x'.repeat(39)}…`],
    ['x'.repeat(39) + '🇰🇷end', `${'x'.repeat(39)}…`],
    ['가'.repeat(41), `${'가'.repeat(40)}…`],
    ['\t \n', null],
  ])('uses actual saved-story title behavior for %j', (answer, head) => {
    const value = fixture(); value.turns[1].text = answer;
    const result = render(value, 'Star');
    expect(result.summary).toBe(head === null ? 'Star' : `Star · ${head}`);
    expect(result.summary).toBe(storyTitle('Star', [answer]));
    expect(result.body).toBe(`Q: Q?\n\nA: ${answer}`);
  });

  test('length framing preserves delimiters and Unicode normalization distinctions', () => {
    const a = fixture(); const b = fixture();
    a.turns[0].text = 'é'; b.turns[0].text = 'e\u0301';
    expect(canonical(a, owner)).toContain('S2:é;');
    expect(canonical(b, owner)).toContain('S3:e\u0301;');
    expect(canonical(a, owner)).not.toBe(canonical(b, owner));
    a.turns[0].text = 'a;S1:b'; a.turns[1].text = 'c';
    b.turns[0].text = 'a'; b.turns[1].text = 'b;S1:c';
    expect(canonical(a, owner)).not.toBe(canonical(b, owner));
  });

  test.each(['answered', 'coverage', 'hold', 'summary', 'system_tags', 'clientRequestId'])('rejects client authority field %s even when false/null', key => {
    rejects({ ...fixture(), [key]: false });
    const value = fixture(); rejects({ ...value, turns: [{ ...value.turns[0], [key]: null }, value.turns[1]] });
  });

  test('missing provenance never infers model/fixed/user from old saved snapshots', () => {
    const value = fixture(); const { origin: _origin, ...old } = value.turns[1];
    rejects({ ...value, turns: [value.turns[0], old] }, 'unsupported_provenance');
    for (const key of ['openerUnedited', 'state', 'layer', 'askKind']) {
      const turn: Record<string, unknown> = { ...value.turns[1] }; delete turn[key];
      rejects({ ...value, turns: [value.turns[0], turn] });
    }
    const nullable = { ...value, turns: [value.turns[0], { ...value.turns[1], layer: null, openerUnedited: null }] };
    expect(parse(nullable).turns[1].openerUnedited).toBeNull();
  });

  test.each([
    { origin: 'model' }, { askKind: 'seed' }, { state: null }, { state: 'safe' },
    { n: 1 }, { n: 3 }, { scene: 0 }, { scene: 10001 }, { text: '' }, { openerUnedited: 0 },
  ])('rejects malformed user relation %j', change => {
    const value = fixture(); rejects({ ...value, turns: [value.turns[0], { ...value.turns[1], ...change }] });
  });

  test('rejects backwards scene, all-question packet and interviewer/user provenance confusion', () => {
    const value = fixture(); value.turns[0].scene = 2; rejects(value);
    rejects({ ...fixture(), turns: [fixture().turns[0]] });
    for (const change of [{ origin: 'user' }, { state: 'judged' }, { openerUnedited: false }]) {
      const p = fixture(); rejects({ ...p, turns: [{ ...p.turns[0], ...change }, p.turns[1]] });
    }
    rejects({ ...fixture(), intent: { ...fixture().intent, revision: Number.MAX_SAFE_INTEGER + 1 } });
  });

  test('data getters are never invoked at root, intent, turn or array-index boundaries', () => {
    const getter = jest.fn(() => 'private text');
    const candidates = [fixture(), fixture(), fixture(), fixture()];
    Object.defineProperty(candidates[0], 'period', { get: getter, enumerable: true });
    Object.defineProperty(candidates[1].intent, 'revision', { get: getter, enumerable: true });
    Object.defineProperty(candidates[2].turns[1], 'text', { get: getter, enumerable: true });
    Object.defineProperty(candidates[3].turns, '0', { get: getter, enumerable: true });
    for (const value of candidates) rejects(value);
    expect(getter).not.toHaveBeenCalled();
  });

  test('rejects exotic shapes, duplicate JSON keys, trailing data and excess depth', () => {
    const p = fixture(); rejects(Object.assign(Object.create({ inherited: true }), p));
    rejects({ ...p, [Symbol('hidden')]: true });
    const sparse = [...p.turns]; delete sparse[0]; rejects({ ...p, turns: sparse });
    const custom = [...p.turns]; Object.defineProperty(custom, 'hidden', { value: true }); rejects({ ...p, turns: custom });
    const revoked = Proxy.revocable({}, {}); revoked.revoke(); rejects(revoked.proxy);
    for (const raw of ['{"v":1,"v":1}', JSON.stringify(p) + ' false', '{"a":[[[[[[]]]]]]}']) {
      expect(() => decode(raw)).toThrow('invalid_packet');
    }
    expect(decode(JSON.stringify(p))).toEqual(parse(p));
    expect(parse(Object.assign(Object.create(null), p))).toEqual(parse(p));
  });

  test('8,000 Unicode code points are retained; NUL, lone surrogates and 8,001 are rejected', () => {
    const p = fixture(); p.turns[1].text = '😀'.repeat(8000);
    expect(parse(p).turns[1].text).toBe(p.turns[1].text);
    for (const text of ['😀'.repeat(8001), 'x'.repeat(8001), '\ud800', '\udc00', '\ud800x', 'a\u0000b']) {
      rejects({ ...p, turns: [p.turns[0], { ...p.turns[1], text }] });
    }
  });

  test('bounds raw UTF-8, full projected packet and turn count before selection', () => {
    expect(() => decode(' '.repeat(INTERVIEW_FINALIZE_PACKET_MAX_BYTES + 1))).toThrow('packet_too_large');
    expect(() => decode('가'.repeat(90_000))).toThrow('packet_too_large');
    const p = fixture();
    const turns = Array.from({ length: 40 }, (_, i) => ({ ...p.turns[1], n: i + 1, text: 'x'.repeat(8000) }));
    rejects({ ...p, turns }, 'packet_too_large');
    const metadataOnly = Array.from({ length: 4000 }, (_, i) => ({ ...p.turns[1], n: i + 1, text: 'x' }));
    rejects({ ...p, turns: metadataOnly }, 'packet_too_large');
    rejects({ ...p, turns: [...metadataOnly, { ...p.turns[1], n: 4001 }] });
    const oversizedTrailing = [p.turns[1], ...turns.map((t, i) => ({ ...p.turns[0], n: i + 2, text: t.text }))];
    oversizedTrailing[0] = { ...oversizedTrailing[0], n: 1 };
    rejects({ ...p, turns: oversizedTrailing }, 'packet_too_large');
  });
});
