// A promise that never settles is worse than one that rejects: a rejection shows the user
// an error and lets them retry; a hang shows a spinner forever and looks like the app ate
// their work.
//
// That is what /ipip-neo did. The 120-item assessment (~15 minutes of the user's life) is
// saved by createRecord(), which had no time bound anywhere in it. On a stalled connection
// -- not a failed one, a STALLED one, where the socket is open and nothing comes back --
// the await never settles, `finally` never runs, setSubmitting(false) never fires. The
// button spins forever and not even an error toast appears. The user's only move is to
// kill the app, and their answers go with it.
//
// fetch does not time out on its own. Neither does supabase-js. So we bound it.

/** Rejects with this when the deadline passes. Name matches the AbortError convention. */
export class TimeoutError extends Error {
  constructor(ms: number, label?: string) {
    super(`${label ?? "Operation"} timed out after ${ms}ms`);
    this.name = "TimeoutError";
  }
}

export function isTimeoutError(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    "name" in error &&
    (error as { name?: unknown }).name === "TimeoutError"
  );
}

/**
 * Reject if `work` has not settled within `ms`.
 *
 * Takes a PromiseLike, not a Promise: supabase-js query builders are thenable but are not
 * Promise instances, and they are exactly what needs bounding here.
 *
 * The underlying work is NOT cancelled -- it cannot be, in general. This bounds how long
 * the CALLER waits, which is the thing that was broken: the user was left staring at a
 * spinner with no way out. If the work later succeeds, that is fine and invisible.
 *
 * The timer is always cleared, so a settled promise never keeps a JS timer alive for the
 * rest of the deadline after the screen is gone.
 */
export function withTimeout<T>(work: PromiseLike<T>, ms: number, label?: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(ms, label)), ms);
  });
  return Promise.race([Promise.resolve(work), deadline]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}
