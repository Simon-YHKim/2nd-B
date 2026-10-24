import { abortError, throwIfAborted } from "../async/abort";
import { captureAccountOwnerLease, subscribeAccountTransition } from "./account-epoch";

const dispatchChecks = new WeakMap<AbortSignal, { assertCurrent: () => void; parent?: AbortSignal }>();

/** Unwrap owner-only signals; user cancellation and timeouts remain live. */
export function requestCancellationSignal(signal?: AbortSignal | null): AbortSignal | undefined {
  let current = signal ?? undefined;
  while (current && dispatchChecks.has(current)) current = dispatchChecks.get(current)!.parent;
  return current;
}

/** Called synchronously after the SDK acquires its session, immediately before fetch. */
export function beforeOwnerDispatch(signal?: AbortSignal | null): AbortSignal | undefined {
  let current = signal ?? undefined;
  while (current) {
    const check = dispatchChecks.get(current);
    if (!check) break;
    check.assertCurrent();
    current = check.parent;
  }
  throwIfAborted(current);
  return current;
}

/** The shared SDK supplies authentication; this adapter never reads a token. */
export const fetchWithLiveOwnerGate: typeof fetch = (input, init) => {
  const signal = init?.signal ?? (typeof Request !== "undefined" && input instanceof Request ? input.signal : undefined);
  if (!signal || !dispatchChecks.has(signal)) return fetch(input, init);
  const dispatchedSignal = beforeOwnerDispatch(signal);
  return fetch(input, signal === dispatchedSignal ? init : { ...init, signal: dispatchedSignal ?? null });
};

/** Identity/epoch only. Never reads, saves or supplies an authentication token. */
export function captureLiveOwnerCheck(ownerId: string): () => void {
  const owner = captureAccountOwnerLease(ownerId);
  return () => { if (!owner?.isCurrent()) throw abortError(); };
}

/** Cancel pending dispatches. fetchWithLiveOwnerGate strips this owner signal at send. */
export function observeLiveOwner(assertOwner: () => void, parent?: AbortSignal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const assertCurrent = () => { throwIfAborted(controller.signal); assertOwner(); };
  dispatchChecks.set(controller.signal, { assertCurrent, parent });
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
