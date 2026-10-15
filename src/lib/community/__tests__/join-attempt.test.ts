import { communityTokenShapeOk, joinErrorKey, runCommunityJoinAttempt } from "../join-attempt";

// community_join accepts 16..128 characters (0126); since W-07 shorter tokens never leave
// the device, so the lifecycle cases use real-length tokens.
const TOKEN_A = "token-a-0123456789abcdef";
const TOKEN_B = "token-b-0123456789abcdef";

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

    await runCommunityJoinAttempt(TOKEN_A, async () => undefined, join, () => true, onJoined, onError);

    expect(join).toHaveBeenCalledWith(TOKEN_A);
    expect(onJoined).toHaveBeenCalledWith("room-a");
    expect(onError).not.toHaveBeenCalled();
  });

  it("does not redeem an invite after its profile step is superseded", async () => {
    const profile = deferred<void>();
    const join = jest.fn(async () => "room-a");
    const onJoined = jest.fn();
    const onError = jest.fn();
    let active = true;

    const attempt = runCommunityJoinAttempt(TOKEN_A, () => profile.promise, join, () => active, onJoined, onError);
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

    const attempt = runCommunityJoinAttempt(TOKEN_A, async () => undefined, join, () => active, onJoined, onError);
    await Promise.resolve();
    expect(join).toHaveBeenCalledWith(TOKEN_A);
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
    const stale = runCommunityJoinAttempt(TOKEN_A, () => profile.promise, jest.fn(), () => active, jest.fn(), onError);
    active = false;
    profile.reject(new Error("old failure"));
    await stale;
    expect(onError).not.toHaveBeenCalled();

    active = true;
    const currentError = new Error("current failure");
    await runCommunityJoinAttempt(TOKEN_B, async () => { throw currentError; }, jest.fn(), () => active, jest.fn(), onError);
    expect(onError).toHaveBeenCalledWith(currentError);
  });
});

// W-07 (QA 261004): /community/join/sample went to the server, which refused the length with
// community_token_invalid; the screen fell to "joinFailed" and offered a retry that got the
// same refusal. On the way it created a community profile for a link that could never work.
describe("a token the server would refuse for its length", () => {
  it("mirrors community_join's 16..128 character rule", () => {
    expect(communityTokenShapeOk("a".repeat(15))).toBe(false);
    expect(communityTokenShapeOk("a".repeat(16))).toBe(true);
    expect(communityTokenShapeOk("a".repeat(128))).toBe(true);
    expect(communityTokenShapeOk("a".repeat(129))).toBe(false);
    expect(communityTokenShapeOk("sample")).toBe(false);
    // Characters, not UTF-16 units: 8 astral characters are 16 units but 8 characters.
    expect(communityTokenShapeOk("\u{1F600}".repeat(8))).toBe(false);
    expect(communityTokenShapeOk("\u{1F600}".repeat(16))).toBe(true);
  });

  it("fails as community_token_invalid without creating a profile or calling join", async () => {
    const profile = jest.fn(async () => undefined);
    const join = jest.fn(async () => "room-a");
    const onJoined = jest.fn();
    const onError = jest.fn();

    await runCommunityJoinAttempt("sample", profile, join, () => true, onJoined, onError);

    expect(profile).not.toHaveBeenCalled();
    expect(join).not.toHaveBeenCalled();
    expect(onJoined).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(String((onError.mock.calls[0]?.[0] as Error).message)).toBe("community_token_invalid");
  });

  it("is a final answer on screen, not a retry", () => {
    expect(joinErrorKey("community_token_invalid")).toBe("inviteUnknown");
    expect(joinErrorKey("community_invite_unknown")).toBe("inviteUnknown");
    expect(joinErrorKey(null)).toBe("joinFailed");
  });
});
