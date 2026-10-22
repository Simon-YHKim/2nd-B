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
