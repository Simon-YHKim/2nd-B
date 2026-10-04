import { createSignInProgress, SIGN_IN_PROGRESS_NOTICE_MS } from "../sign-in-progress";

describe("slow web sign-in stage diagnostic", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test("a completed sign-in emits no diagnostic", () => {
    const log = jest.fn();
    const progress = createSignInProgress(log, () => Date.now());
    progress.mark("sdk-response");
    progress.finish();
    jest.advanceTimersByTime(SIGN_IN_PROGRESS_NOTICE_MS);
    expect(log).not.toHaveBeenCalled();
  });

  test("a stalled sign-in reports its current stage, then later transitions", () => {
    const log = jest.fn();
    const progress = createSignInProgress(log, () => Date.now());
    progress.mark("storage-lock");
    jest.advanceTimersByTime(SIGN_IN_PROGRESS_NOTICE_MS);
    expect(log).toHaveBeenCalledWith("storage-lock", SIGN_IN_PROGRESS_NOTICE_MS);
    progress.mark("sdk-response");
    expect(log).toHaveBeenLastCalledWith("sdk-response", SIGN_IN_PROGRESS_NOTICE_MS);
    progress.finish();
    progress.mark("session-refresh");
    expect(log).toHaveBeenCalledTimes(2);
  });
});
