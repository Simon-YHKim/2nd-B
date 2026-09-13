interface AuthUserRecord {
  id: string;
}

export interface AuthDeletionAdmin {
  deleteUser(
    userId: string,
    shouldSoftDelete: boolean,
  ): PromiseLike<{ error: unknown | null }>;
  getUserById(
    userId: string,
  ): PromiseLike<{
    data: { user: AuthUserRecord | null } | null;
    error: unknown | null;
  }>;
}

export type AuthDeletionResult =
  | { ok: true; reconciled: boolean }
  | { ok: false; code: 'auth_delete_failed' | 'auth_delete_unconfirmed' };

function isExplicitNotFound(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { status?: unknown; code?: unknown };
  return candidate.status === 404 || candidate.code === 'user_not_found';
}

/**
 * Delete the bound Auth user, then resolve only the ambiguous response case.
 * A timed-out delete can commit upstream before its response is lost. We may
 * continue post-delete cleanup only when the same admin API explicitly
 * observes absence; an existing or unreadable result remains fail-closed.
 */
export async function deleteAuthUserWithReconciliation(
  admin: AuthDeletionAdmin,
  userId: string,
): Promise<AuthDeletionResult> {
  try {
    const deleted = await admin.deleteUser(userId, false);
    if (!deleted.error) return { ok: true, reconciled: false };
  } catch {
    // The request outcome is unknown; reconcile the exact target below.
  }

  try {
    const lookup = await admin.getUserById(userId);
    if (lookup.data?.user) {
      return lookup.data.user.id === userId
        ? { ok: false, code: 'auth_delete_failed' }
        : { ok: false, code: 'auth_delete_unconfirmed' };
    }
    if (!lookup.error && lookup.data?.user === null) {
      return { ok: true, reconciled: true };
    }
    if (isExplicitNotFound(lookup.error)) {
      return { ok: true, reconciled: true };
    }
  } catch {
    // A second transport failure cannot prove either presence or absence.
  }
  return { ok: false, code: 'auth_delete_unconfirmed' };
}
