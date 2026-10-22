import { abortError, throwIfAborted } from "../async/abort";
import { captureAccountOwnerLease, subscribeAccountTransition } from "./account-epoch";

/** Identity/epoch only. Never reads, saves or supplies an authentication token. */
export function captureLiveOwnerCheck(ownerId: string): () => void {
  const owner = captureAccountOwnerLease(ownerId);
  return () => { if (!owner?.isCurrent()) throw abortError(); };
}

/** Abort even while the SDK is awaiting its current session before fetch. */
export function observeLiveOwner(assertOwner: () => void, parent?: AbortSignal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const assertCurrent = () => { throwIfAborted(controller.signal); assertOwner(); };
  const unsubscribe = subscribeAccountTransition(() => {
    try { assertOwner(); } catch { abort(); }
  });
  parent?.addEventListener("abort", abort, { once: true });
  if (parent?.aborted) abort();
  return {
    signal: controller.signal,
    assertCurrent,
    release: () => { unsubscribe(); parent?.removeEventListener("abort", abort); },
  };
}

/** Scope a live transport's subscription to its wait, without wrapping its caller. */
export async function withLiveOwnerSignal<T>(
  assertOwner: (() => void) | undefined,
  parent: AbortSignal | undefined,
  operation: (signal: AbortSignal | undefined) => PromiseLike<T>,
): Promise<T> {
  if (!assertOwner) return operation(parent);
  const owner = observeLiveOwner(assertOwner, parent);
  try {
    owner.assertCurrent();
    // The caller owns the result fence: a received RED verdict must be recorded
    // for its original account before stale UI delivery is refused.
    return await operation(owner.signal);
  } finally { owner.release(); }
}
