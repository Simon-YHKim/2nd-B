// A slow sign-in can wait for either a lock, the SDK response, or the later
// AuthContext refresh. Record only the stage and elapsed time; credentials and
// session values must never enter this diagnostic.
export type SignInProgressStage =
  | "mutation-lock"
  | "storage-lock"
  | "sdk-response"
  | "session-refresh"
  | "route";

export const SIGN_IN_PROGRESS_NOTICE_MS = 15_000;

export function createSignInProgress(
  log: (stage: SignInProgressStage, elapsedMs: number) => void,
  now: () => number = () => performance.now(),
) {
  const started = now();
  let stage: SignInProgressStage = "mutation-lock";
  let slow = false;
  let finished = false;
  const timer = setTimeout(() => {
    if (finished) return;
    slow = true;
    log(stage, Math.round(now() - started));
  }, SIGN_IN_PROGRESS_NOTICE_MS);

  return {
    mark(next: SignInProgressStage) {
      if (finished) return;
      stage = next;
      if (slow) log(stage, Math.round(now() - started));
    },
    finish() {
      finished = true;
      clearTimeout(timer);
    },
  };
}
