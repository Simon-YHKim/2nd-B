import { abortError, throwIfAborted } from "../async/abort";
import { getSupabaseClient } from "../supabase/client";
import {
  currentAccountEpoch,
  currentAccountOwner,
  isCurrentAccountEpoch,
  onAccountOwnerChange,
} from "./account-epoch";

export interface AuthenticatedAccountSessionLease {
  readonly userId: string;
  readonly epoch: number;
  readonly accessToken: string;
  readonly signal: AbortSignal;
  assertCurrent(): void;
  abort(): void;
  release(): void;
}

export interface PendingAccountSessionLease {
  readonly userId: string;
  readonly epoch: number;
  readonly signal: AbortSignal;
  authenticate(): Promise<AuthenticatedAccountSessionLease>;
  assertCurrent(): void;
  abort(): void;
  release(): void;
}

function awaitWithAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (result: { ok: true; value: T } | { ok: false; error: unknown }): void => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      if (result.ok) resolve(result.value);
      else reject(result.error);
    };
    const onAbort = (): void => finish({ ok: false, error: abortError() });
    signal.addEventListener("abort", onAbort, { once: true });
    void operation.then(
      (value) => finish({ ok: true, value }),
      (error) => finish({ ok: false, error }),
    );
    if (signal.aborted) onAbort();
  });
}

/**
 * Capture an authenticated account capability without ever rereading the
 * mutable global session after the capture. Owner changes abort synchronously;
 * every consumer continuation must call assertCurrent() after each await.
 */
export function beginAccountSessionLease(
  expectedUserId: string,
  parentSignal?: AbortSignal,
): PendingAccountSessionLease {
  const epoch = currentAccountEpoch();
  const controller = new AbortController();
  let accessToken: string | null = null;
  let released = false;
  let authentication: Promise<AuthenticatedAccountSessionLease> | null = null;

  const abort = (): void => {
    if (!controller.signal.aborted) controller.abort();
  };
  const unsubscribeOwner = onAccountOwnerChange((change) => {
    if (change.epoch !== epoch || change.owner !== expectedUserId) abort();
  });
  const abortFromParent = (): void => abort();
  parentSignal?.addEventListener("abort", abortFromParent, { once: true });

  const release = (): void => {
    if (released) return;
    released = true;
    abort();
    unsubscribeOwner();
    parentSignal?.removeEventListener("abort", abortFromParent);
  };

  const assertCurrent = (): void => {
    throwIfAborted(controller.signal);
    if (
      released ||
      !isCurrentAccountEpoch(epoch) ||
      currentAccountOwner() !== expectedUserId
    ) {
      abort();
      throw abortError();
    }
  };

  if (!expectedUserId || currentAccountOwner() !== expectedUserId) abort();
  if (parentSignal?.aborted) abort();

  const lease: PendingAccountSessionLease = {
    userId: expectedUserId,
    epoch,
    signal: controller.signal,
    assertCurrent,
    abort,
    release,
    authenticate(): Promise<AuthenticatedAccountSessionLease> {
      authentication ??= (async () => {
        assertCurrent();
        let result: Awaited<ReturnType<ReturnType<typeof getSupabaseClient>["auth"]["getSession"]>>;
        try {
          const operation = getSupabaseClient().auth.getSession();
          result = await awaitWithAbort(operation, controller.signal);
        } catch {
          assertCurrent();
          throw new Error("voice_session_unavailable");
        }
        assertCurrent();
        const { data, error } = result;
        const session = data.session;
        if (
          error ||
          session?.user.id !== expectedUserId ||
          typeof session.access_token !== "string" ||
          session.access_token.length === 0
        ) {
          abort();
          throw abortError();
        }
        accessToken = session.access_token;
        assertCurrent();
        return authenticatedLease;
      })();
      return authentication;
    },
  };

  const authenticatedLease: AuthenticatedAccountSessionLease = {
    userId: expectedUserId,
    epoch,
    signal: controller.signal,
    get accessToken(): string {
      if (accessToken === null) throw abortError();
      assertCurrent();
      return accessToken;
    },
    assertCurrent,
    abort,
    release,
  };

  return lease;
}
