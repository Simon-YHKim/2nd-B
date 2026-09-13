import { deleteAuthUserWithReconciliation } from '../delete-auth-user';

function admin(options: {
  deleteResult?: { error: unknown | null };
  deleteThrows?: unknown;
  lookupResult?: { data: { user: { id: string } | null } | null; error: unknown | null };
  lookupThrows?: unknown;
} = {}) {
  const deleteUser = jest.fn(async () => {
    if (options.deleteThrows) throw options.deleteThrows;
    return options.deleteResult ?? { error: null };
  });
  const getUserById = jest.fn(async () => {
    if (options.lookupThrows) throw options.lookupThrows;
    return options.lookupResult ?? { data: { user: null }, error: null };
  });
  return { deleteUser, getUserById };
}

describe('deleteAuthUserWithReconciliation', () => {
  test('does not spend a reconciliation request after an acknowledged delete', async () => {
    const auth = admin();
    await expect(deleteAuthUserWithReconciliation(auth, 'user-1')).resolves.toEqual({
      ok: true,
      reconciled: false,
    });
    expect(auth.getUserById).not.toHaveBeenCalled();
  });

  test('continues after a lost delete response when Auth confirms the user is absent', async () => {
    const auth = admin({
      deleteThrows: new Error('response timed out after commit'),
      lookupResult: { data: { user: null }, error: null },
    });
    await expect(deleteAuthUserWithReconciliation(auth, 'user-1')).resolves.toEqual({
      ok: true,
      reconciled: true,
    });
    expect(auth.getUserById).toHaveBeenCalledWith('user-1');
  });

  test('accepts only an explicit Auth not-found error as reconciled deletion', async () => {
    const auth = admin({
      deleteResult: { error: { status: 500 } },
      lookupResult: {
        data: { user: null },
        error: { status: 404, code: 'user_not_found' },
      },
    });
    await expect(deleteAuthUserWithReconciliation(auth, 'user-1')).resolves.toEqual({
      ok: true,
      reconciled: true,
    });
  });

  test('fails closed when the target still exists', async () => {
    const auth = admin({
      deleteResult: { error: { status: 500 } },
      lookupResult: { data: { user: { id: 'user-1' } }, error: null },
    });
    await expect(deleteAuthUserWithReconciliation(auth, 'user-1')).resolves.toEqual({
      ok: false,
      code: 'auth_delete_failed',
    });
  });

  test('does not turn an ambiguous reconciliation into deletion success', async () => {
    const auth = admin({
      deleteThrows: new Error('timeout'),
      lookupThrows: new Error('second timeout'),
    });
    await expect(deleteAuthUserWithReconciliation(auth, 'user-1')).resolves.toEqual({
      ok: false,
      code: 'auth_delete_unconfirmed',
    });
  });

  test('does not accept a mismatched user from the reconciliation response', async () => {
    const auth = admin({
      deleteThrows: new Error('timeout'),
      lookupResult: { data: { user: { id: 'user-2' } }, error: null },
    });
    await expect(deleteAuthUserWithReconciliation(auth, 'user-1')).resolves.toEqual({
      ok: false,
      code: 'auth_delete_unconfirmed',
    });
  });

  test('does not trust a contradictory not-found error that also returns a user', async () => {
    const auth = admin({
      deleteThrows: new Error('timeout'),
      lookupResult: {
        data: { user: { id: 'user-1' } },
        error: { status: 404, code: 'user_not_found' },
      },
    });
    await expect(deleteAuthUserWithReconciliation(auth, 'user-1')).resolves.toEqual({
      ok: false,
      code: 'auth_delete_failed',
    });
  });
});
