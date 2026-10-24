import { observeReceiptCompletion, type ReceiptObservationPorts } from '../receipt-observation';

const scope = { ownerId: 'aaaaaaaa-0000-4000-8000-000000000001',
  operationId: 'bbbbbbbb-0000-4000-8000-000000000002', executionId: 'cccccccc-0000-4000-8000-000000000003',
  startedAt: '2026-10-24T10:00:00.000Z' };
const empty = { data: { objects: [], folders: [], hasNext: false }, error: null };
function harness() {
  const ports = {
    readScope: jest.fn(async () => ({ ...scope, phase: 'executing', fenceOwned: true, writesDrained: true })),
    readAuth: jest.fn(async () => ({ data: { user: null }, error: { code: 'user_not_found', status: 404 } })),
    readProfile: jest.fn(async () => ({ data: [], error: null })),
    listStorage: jest.fn(async () => empty), now: () => '2026-10-24T10:01:00.000Z',
  };
  return ports;
}
const unknown = (result: Awaited<ReturnType<typeof observeReceiptCompletion>>) => {
  expect(result).toMatchObject({ state: 'unknown', observedAt: null,
    observations: { auth: 'unknown', profile: 'unknown', raw: 'unknown', photos: 'unknown' } });
};

test('independent exact-owner Auth/profile reads and fresh first pages, without deletion', async () => {
  const p = harness();
  expect(await observeReceiptCompletion(scope, p)).toMatchObject({ state: 'observed', scope,
    observations: { auth: 'absent', profile: 'absent', raw: 'empty', photos: 'empty' } });
  expect(p.readAuth).toHaveBeenCalledWith(scope.ownerId);
  expect(p.readProfile).toHaveBeenCalledWith(scope.ownerId);
  expect(p.listStorage.mock.calls).toEqual(['raw-clippings', 'record-photos', 'raw-clippings', 'record-photos']
    .map(bucket => [bucket, { prefix: `${scope.ownerId}/`, limit: 1, with_delimiter: false }]));
  expect(p.readScope).toHaveBeenCalledTimes(2);
  expect(p.listStorage.mock.invocationCallOrder[1]).toBeLessThan(p.readAuth.mock.invocationCallOrder[0]);
  expect(p.readProfile.mock.invocationCallOrder[0]).toBeLessThan(p.listStorage.mock.invocationCallOrder[2]);
});

test.each([
  { data: { user: { id: scope.ownerId } }, error: null },
  { data: { user: { id: scope.ownerId, deleted_at: 'yesterday' } }, error: null },
  { data: { user: { id: 'other' } }, error: null },
  { data: { user: null }, error: null },
  { data: null, error: { status: 404 } },
  { data: { user: null }, error: { status: 404, code: 'not_found' } },
  { data: { user: null }, error: { status: 500, code: 'user_not_found' } },
])('Auth failure/presence/soft-delete is not hard absence: %j', async result => {
  unknown(await observeReceiptCompletion(scope, { ...harness(), readAuth: async () => result }));
});
test.each([
  { data: [{ id: scope.ownerId }], error: null }, { data: null, error: null },
  { data: [], error: new Error('private detail') }, { data: {}, error: null },
])('profile must independently be absent: %j', async result => {
  unknown(await observeReceiptCompletion(scope, { ...harness(), readProfile: async () => result }));
});
test.each([
  { data: { objects: [{ name: `${scope.ownerId}/late` }], folders: [], hasNext: false }, error: null },
  { data: { objects: [], folders: [], hasNext: true }, error: null },
  { data: { objects: [], folders: ['folder'], hasNext: false }, error: null },
  { data: { objects: [], folders: [] }, error: null },
  { data: [], error: null }, { data: null, error: null }, { ...empty, error: new Error('private path') },
])('late storage write or malformed page cannot complete: %j', async result => {
  for (const lateCall of [3, 4]) {
    let calls = 0;
    unknown(await observeReceiptCompletion(scope, { ...harness(),
      listStorage: async () => ++calls === lateCall ? result : empty }));
  }
});
test.each(['ownerId', 'operationId', 'executionId', 'startedAt', 'phase', 'writesDrained', 'fenceOwned'])
('scope change/unconfirmed %s after reads stays unknown', async key => {
  const p = harness(); let calls = 0;
  unknown(await observeReceiptCompletion(scope, { ...p, readScope: async () => {
    const value = await p.readScope();
    return ++calls === 2 ? { ...value, [key]: 'changed' } : value;
  } }));
});
test.each(['readScope', 'readAuth', 'readProfile', 'listStorage'] as const)('%s exception is unknown, no raw error', async key => {
  const p: ReceiptObservationPorts = { ...harness(), [key]: async () => { throw new Error('do-not-leak'); } };
  const result = await observeReceiptCompletion(scope, p);
  unknown(result); expect(JSON.stringify(result)).not.toContain('do-not-leak');
});
test.each(['invalid', '2026-10-24T09:59:00.000Z'])('invalid observation time %s is unknown', async now => {
  unknown(await observeReceiptCompletion(scope, { ...harness(), now: () => now }));
});
test('unsealed execution never reads account data; no timer converts unknown into failure', async () => {
  const p = harness();
  unknown(await observeReceiptCompletion(scope, { ...p, readScope: async () => ({ ...scope, phase: 'executing' }) }));
  expect(p.readAuth).not.toHaveBeenCalled(); expect(p.listStorage).not.toHaveBeenCalled();
});
test('captures immutable original scope across asynchronous owner changes', async () => {
  const input = { ...scope }; const p = harness();
  const result = await observeReceiptCompletion(input, { ...p, readAuth: async owner => {
    input.ownerId = 'dddddddd-0000-4000-8000-000000000004';
    expect(owner).toBe(scope.ownerId); return p.readAuth();
  } });
  expect(result.scope).toEqual(scope); expect(Object.isFrozen(result.scope)).toBe(true);
  expect(result.state).toBe('observed');
});
