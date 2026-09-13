// One device-wide ordering boundary for local notification mutations.
//
// Account cleanup and OS scheduling must observe one order. Otherwise cleanup
// can snapshot A, then an already-started A schedule can land after that
// snapshot and survive into B. Permission prompts stay outside this queue; the
// final native/storage mutation and its owner-lease check run inside it.

let notificationMutationTail: Promise<void> = Promise.resolve();

export function runLocalNotificationMutation<T>(operation: () => Promise<T>): Promise<T> {
  const run = notificationMutationTail
    .catch(() => undefined)
    .then(operation);
  notificationMutationTail = run.then(() => undefined, () => undefined);
  return run;
}
