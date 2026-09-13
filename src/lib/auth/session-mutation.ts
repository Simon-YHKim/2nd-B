export interface AuthSessionMutationLease {
  readonly epoch: number;
  isCurrent(): boolean;
}

let mutationEpoch = 0;
let mutationTail: Promise<void> = Promise.resolve();

/**
 * Serialize app-owned session mutations. Taking a place in the queue advances
 * the epoch immediately, so an older destructive mutation can yield to a newer
 * login intent before it calls the SDK. The queue always recovers from rejection.
 */
export function runAuthSessionMutation<T>(
  operation: (lease: AuthSessionMutationLease) => Promise<T>,
): Promise<T> {
  const epoch = ++mutationEpoch;
  const lease: AuthSessionMutationLease = {
    epoch,
    isCurrent: () => epoch === mutationEpoch,
  };
  const run = mutationTail
    .catch(() => undefined)
    .then(() => operation(lease));
  mutationTail = run.then(() => undefined, () => undefined);
  return run;
}

/** Mark a session-owner event that originated outside the app mutation queue. */
export function noteExternalAuthSessionMutation(): void {
  mutationEpoch += 1;
}
