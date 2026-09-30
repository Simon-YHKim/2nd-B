import { runCommunityJoinAttempt } from "../join-attempt";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

describe("community invite attempt lifecycle", () => {
  it("joins and publishes only the active invite", async () => {
    const join = jest.fn(async () => "room-a");
    const onJoined = jest.fn();
    const onError = jest.fn();

    await runCommunityJoinAttempt("token-a", async () => undefined, join, () => true, onJoined, onError);

    expect(join).toHaveBeenCalledWith("token-a");
    expect(onJoined).toHaveBeenCalledWith("room-a");
    expect(onError).not.toHaveBeenCalled();
  });

  it("does not redeem an invite after its profile step is superseded", async () => {
    const profile = deferred<void>();
    const join = jest.fn(async () => "room-a");
    const onJoined = jest.fn();
    const onError = jest.fn();
    let active = true;

    const attempt = runCommunityJoinAttempt("token-a", () => profile.promise, join, () => active, onJoined, onError);
    active = false;
    profile.resolve();
    await attempt;

    expect(join).not.toHaveBeenCalled();
    expect(onJoined).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("does not navigate when an old join settles after a new invite opens", async () => {
    const room = deferred<string>();
    const join = jest.fn(() => room.promise);
    const onJoined = jest.fn();
    const onError = jest.fn();
    let active = true;

    const attempt = runCommunityJoinAttempt("token-a", async () => undefined, join, () => active, onJoined, onError);
    await Promise.resolve();
    expect(join).toHaveBeenCalledWith("token-a");
    active = false;
    room.resolve("room-a");
    await attempt;

    expect(onJoined).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("ignores stale errors but reports the current invite error", async () => {
    const profile = deferred<void>();
    const onError = jest.fn();
    let active = true;
    const stale = runCommunityJoinAttempt("token-a", () => profile.promise, jest.fn(), () => active, jest.fn(), onError);
    active = false;
    profile.reject(new Error("old failure"));
    await stale;
    expect(onError).not.toHaveBeenCalled();

    active = true;
    const currentError = new Error("current failure");
    await runCommunityJoinAttempt("token-b", async () => { throw currentError; }, jest.fn(), () => active, jest.fn(), onError);
    expect(onError).toHaveBeenCalledWith(currentError);
  });
});
