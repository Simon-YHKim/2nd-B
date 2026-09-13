const getSession = jest.fn();

jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({ auth: { getSession } }),
}));

import {
  __resetAccountEpochForTests,
  noteResolvedOwner,
} from "../account-epoch";
import { beginAccountSessionLease } from "../account-session-lease";

beforeEach(() => {
  getSession.mockReset();
  __resetAccountEpochForTests();
  noteResolvedOwner("account-a");
});

afterEach(() => {
  __resetAccountEpochForTests();
});

describe("account-bound session lease", () => {
  test("aborts synchronously when A changes to B while getSession is pending", async () => {
    let resolveSession: ((value: unknown) => void) | undefined;
    getSession.mockReturnValue(new Promise((resolve) => {
      resolveSession = resolve;
    }));
    const pending = beginAccountSessionLease("account-a");
    const authentication = pending.authenticate();

    noteResolvedOwner("account-b");
    expect(pending.signal.aborted).toBe(true);
    resolveSession?.({
      data: { session: { user: { id: "account-a" }, access_token: "token-a" } },
      error: null,
    });

    await expect(authentication).rejects.toMatchObject({ name: "AbortError" });
  });

  test("rejects immediately on A to B even when getSession never settles", async () => {
    let rejectSession: ((error: Error) => void) | undefined;
    getSession.mockReturnValue(new Promise((_resolve, reject) => {
      rejectSession = reject;
    }));
    const pending = beginAccountSessionLease("account-a");
    const authentication = pending.authenticate();

    noteResolvedOwner("account-b");

    await expect(authentication).rejects.toMatchObject({ name: "AbortError" });
    // A late native/client rejection is already observed by awaitWithAbort and
    // cannot surface as an unhandled rejection after the account moved on.
    rejectSession?.(new Error("private late auth detail"));
    await Promise.resolve();
  });

  test("sanitizes a current-owner getSession rejection", async () => {
    getSession.mockRejectedValue(new Error("private auth transport detail"));
    const pending = beginAccountSessionLease("account-a");

    await expect(pending.authenticate()).rejects.toThrow("voice_session_unavailable");
  });

  test("rejects a session belonging to B even while the published owner is A", async () => {
    getSession.mockResolvedValue({
      data: { session: { user: { id: "account-b" }, access_token: "token-b" } },
      error: null,
    });
    const pending = beginAccountSessionLease("account-a");

    await expect(pending.authenticate()).rejects.toMatchObject({ name: "AbortError" });
    expect(pending.signal.aborted).toBe(true);
  });

  test("captures an immutable A token and fences every later owner change", async () => {
    const session = { user: { id: "account-a" }, access_token: "token-a" };
    getSession.mockResolvedValue({ data: { session }, error: null });
    const pending = beginAccountSessionLease("account-a");
    const authenticated = await pending.authenticate();

    session.access_token = "token-b";
    expect(authenticated.accessToken).toBe("token-a");
    noteResolvedOwner("account-b");
    expect(() => authenticated.assertCurrent()).toThrow(expect.objectContaining({ name: "AbortError" }));
  });

  test("links lifecycle cancellation without exposing a mutable global session", async () => {
    getSession.mockResolvedValue({
      data: { session: { user: { id: "account-a" }, access_token: "token-a" } },
      error: null,
    });
    const lifecycle = new AbortController();
    const pending = beginAccountSessionLease("account-a", lifecycle.signal);
    await pending.authenticate();

    lifecycle.abort();
    expect(pending.signal.aborted).toBe(true);
    expect(() => pending.assertCurrent()).toThrow(expect.objectContaining({ name: "AbortError" }));
  });

  test("release revokes the captured capability and aborts any late transport", async () => {
    getSession.mockResolvedValue({
      data: { session: { user: { id: "account-a" }, access_token: "token-a" } },
      error: null,
    });
    const pending = beginAccountSessionLease("account-a");
    const authenticated = await pending.authenticate();

    authenticated.release();

    expect(authenticated.signal.aborted).toBe(true);
    expect(() => authenticated.accessToken).toThrow(expect.objectContaining({ name: "AbortError" }));
  });
});
