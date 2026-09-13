// Audit HIGH (deleteAllUserData incomplete erasure): asserts the content wipe
// now also clears the client-deletable derived tables (self_contexts, owned
// clipper_templates) on top of records/sources/wiki/chat, and that terminal
// account deletion routes through the delete-account Edge Function (the only
// path that reaches RLS-protected tables + the public.users cascade).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FunctionsHttpError } from "@supabase/functions-js";

function mockAccessToken(userId: string, sessionId: string, version = "1"): string {
  const payload = Buffer.from(JSON.stringify({ sub: userId, session_id: sessionId }))
    .toString("base64url");
  return `header.${payload}.${version}`;
}

jest.mock("../../supabase/client", () => {
  const tablesDeleted: string[] = [];
  const invoke = jest.fn().mockResolvedValue({ data: { deleted: true }, error: null });
  const getSession = jest.fn().mockResolvedValue({
    data: { session: { access_token: mockAccessToken("u1", "session-a"), user: { id: "u1" } } },
    error: null,
  });
  const refreshSession = jest.fn().mockResolvedValue({
    data: { session: { access_token: mockAccessToken("u1", "session-a", "2"), user: { id: "u1" } } },
    error: null,
  });
  const from = jest.fn((table: string) => {
    const chain: Record<string, unknown> = {
      delete: () => {
        tablesDeleted.push(table);
        return chain;
      },
      update: () => chain,
      eq: () => chain,
      // thenable so `await from(t).delete().eq(...)` resolves
      then: (resolve: (v: { count: number; error: null }) => unknown) =>
        resolve({ count: 0, error: null }),
    };
    return chain;
  });
  const mock = { from, auth: { getSession, refreshSession }, functions: { invoke } };
  return {
    getSupabaseClient: () => mock,
    __tablesDeleted: tablesDeleted,
    __invoke: invoke,
    __getSession: getSession,
    __refreshSession: refreshSession,
    __reset: () => {
      tablesDeleted.length = 0;
      invoke.mockReset().mockResolvedValue({ data: { deleted: true }, error: null });
      getSession.mockReset().mockResolvedValue({
        data: { session: { access_token: mockAccessToken("u1", "session-a"), user: { id: "u1" } } },
        error: null,
      });
      refreshSession.mockReset().mockResolvedValue({
        data: { session: { access_token: mockAccessToken("u1", "session-a", "2"), user: { id: "u1" } } },
        error: null,
      });
    },
  };
});

jest.mock("../../account/local-deletion-fence", () => {
  const installFence = jest.fn().mockResolvedValue(true);
  return {
    installAccountLocalDeletionFence: installFence,
    __installFence: installFence,
    __reset: () => installFence.mockReset().mockResolvedValue(true),
  };
});

import {
  ACCOUNT_DELETION_DEADLINE_MS,
  ACCOUNT_DELETION_MAX_ATTEMPTS,
  deleteAllUserData,
  requestAccountDeletion,
} from "../delete-bulk";
import type { AuthSessionExpectation } from "../../auth/session-mutation";

const EXPECTED: AuthSessionExpectation = {
  userId: "u1",
  sessionId: "session-a",
  accessToken: mockAccessToken("u1", "session-a"),
};

const clientMock = require("../../supabase/client") as {
  __tablesDeleted: string[];
  __invoke: jest.Mock;
  __getSession: jest.Mock;
  __refreshSession: jest.Mock;
  __reset: () => void;
};
const fenceMock = require("../../account/local-deletion-fence") as {
  __installFence: jest.Mock;
  __reset: () => void;
};

describe("deleteAllUserData (content wipe)", () => {
  beforeEach(() => clientMock.__reset());

  test("clears records, sources, wiki, chat AND the client-deletable derived tables", async () => {
    const result = await deleteAllUserData("u1");
    // The four originally-covered tables plus the two derived tables the audit
    // flagged as residual PII after a 'full wipe'.
    expect(clientMock.__tablesDeleted).toEqual(
      expect.arrayContaining([
        "wiki_pages",
        "sources",
        "records",
        "chat_usage",
        "self_contexts",
        "clipper_templates",
      ]),
    );
    expect(result).toHaveProperty("selfContexts");
    expect(result).toHaveProperty("clipperTemplates");
  });
});

describe("requestAccountDeletion (terminal erasure)", () => {
  beforeEach(() => {
    clientMock.__reset();
    fenceMock.__reset();
  });

  function conflict(body: Record<string, unknown>) {
    // Exercise the exact @supabase/functions-js 2.106.1 producer: rejected
    // responses are preserved on FunctionsHttpError.context.
    return new FunctionsHttpError(
      new Response(JSON.stringify(body), {
        status: 409,
        headers: { "content-type": "application/json" },
      }),
    );
  }

  function cleanupInProgress(removed: number) {
    return conflict({
        error: "deletion_cleanup_in_progress",
        deletion_fenced: true,
        raw_clippings_erased: false,
        raw_clippings_removed: removed,
    });
  }

  test("refreshes and binds the same user's token while preserving the receipt", async () => {
    // Returns the receipt rather than void. This mock answers with { deleted:
    // true } alone, so both post-cascade sweeps come back unconfirmed — which
    // is not the same as failed. Sweep-level behaviour lives in
    // delete-bulk-receipt.test.ts.
    const receipt = await requestAccountDeletion(EXPECTED);
    expect(receipt.deleted).toBe(true);
    expect(receipt.incomplete).toEqual([]);
    expect(receipt.unconfirmed).toEqual(["profile", "rawClippings"]);
    expect(clientMock.__getSession).toHaveBeenCalledTimes(2);
    expect(clientMock.__refreshSession).toHaveBeenCalledTimes(1);
    expect(fenceMock.__installFence).toHaveBeenCalledWith("u1");
    expect(fenceMock.__installFence.mock.invocationCallOrder[0])
      .toBeLessThan(clientMock.__invoke.mock.invocationCallOrder[0]);
    expect(clientMock.__invoke).toHaveBeenCalledWith("delete-account", expect.objectContaining({
      body: {},
      headers: { Authorization: `Bearer ${mockAccessToken("u1", "session-a", "2")}` },
    }));
  });

  test("never invokes the remote function unless the durable local fence acknowledges", async () => {
    fenceMock.__installFence.mockResolvedValueOnce(false);

    await expect(requestAccountDeletion(EXPECTED)).rejects.toThrow("local deletion fence");
    expect(fenceMock.__installFence).toHaveBeenCalledWith("u1");
    expect(clientMock.__getSession).not.toHaveBeenCalled();
    expect(clientMock.__refreshSession).not.toHaveBeenCalled();
    expect(clientMock.__invoke).not.toHaveBeenCalled();
  });

  test("does not permanently fence a session that lacks a stable session id", async () => {
    await expect(requestAccountDeletion({ ...EXPECTED, sessionId: null })).rejects.toMatchObject({
      name: "AuthSessionOwnerChangedError",
    });
    expect(fenceMock.__installFence).not.toHaveBeenCalled();
    expect(clientMock.__invoke).not.toHaveBeenCalled();
  });

  test("fails closed when the active user already changed after confirmation", async () => {
    clientMock.__getSession.mockResolvedValueOnce({
      data: { session: { access_token: mockAccessToken("u2", "session-b"), user: { id: "u2" } } },
      error: null,
    });
    clientMock.__refreshSession.mockResolvedValueOnce({
      data: { session: { access_token: mockAccessToken("u2", "session-b"), user: { id: "u2" } } },
      error: null,
    });

    await expect(requestAccountDeletion(EXPECTED)).rejects.toMatchObject({
      name: "AuthSessionOwnerChangedError",
    });
    expect(clientMock.__refreshSession).not.toHaveBeenCalled();
    expect(clientMock.__invoke).not.toHaveBeenCalled();
  });

  test("fails closed when refresh switches to a different user", async () => {
    clientMock.__refreshSession.mockResolvedValueOnce({
      data: { session: { access_token: mockAccessToken("u2", "session-b"), user: { id: "u2" } } },
      error: null,
    });

    await expect(requestAccountDeletion(EXPECTED)).rejects.toMatchObject({
      name: "AuthSessionOwnerChangedError",
    });
    expect(clientMock.__invoke).not.toHaveBeenCalled();
  });

  test("fails closed when a fresh session cannot be issued", async () => {
    clientMock.__refreshSession.mockResolvedValueOnce({ data: { session: null }, error: new Error("offline") });

    await expect(requestAccountDeletion(EXPECTED)).rejects.toThrow("offline");
    expect(clientMock.__invoke).not.toHaveBeenCalled();
  });

  test("throws when the function reports failure", async () => {
    clientMock.__invoke.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    await expect(requestAccountDeletion(EXPECTED)).rejects.toBeDefined();
  });

  test("recovers 409 cleanup progress and retries with a newly bound token", async () => {
    clientMock.__refreshSession
      .mockResolvedValueOnce({
        data: { session: { access_token: mockAccessToken("u1", "session-a", "3"), user: { id: "u1" } } },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { session: { access_token: mockAccessToken("u1", "session-a", "4"), user: { id: "u1" } } },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { session: { access_token: mockAccessToken("u1", "session-a", "5"), user: { id: "u1" } } },
        error: null,
      });
    clientMock.__invoke
      .mockResolvedValueOnce({ data: null, error: cleanupInProgress(1_000) })
      .mockResolvedValueOnce({ data: null, error: cleanupInProgress(1_000) })
      .mockResolvedValueOnce({
        data: {
          deleted: true,
          profile_erased: true,
          deletion_fenced: true,
          raw_clippings_erased: true,
          raw_clippings_empty_at_check: true,
          raw_clippings_removed: 3,
        },
        error: null,
      });

    await expect(requestAccountDeletion(EXPECTED)).resolves.toMatchObject({
      deleted: true,
      rawClippingsRemoved: 2_003,
    });
    expect(clientMock.__getSession).toHaveBeenCalledTimes(6);
    expect(clientMock.__refreshSession).toHaveBeenCalledTimes(3);
    expect(clientMock.__invoke.mock.calls.map(([, options]) => options.headers.Authorization))
      .toEqual([
        `Bearer ${mockAccessToken("u1", "session-a", "3")}`,
        `Bearer ${mockAccessToken("u1", "session-a", "4")}`,
        `Bearer ${mockAccessToken("u1", "session-a", "5")}`,
      ]);
  });

  test("bounds automatic cleanup retries", async () => {
    clientMock.__invoke.mockResolvedValue({ data: null, error: cleanupInProgress(1_000) });

    await expect(requestAccountDeletion(EXPECTED)).rejects.toBeDefined();
    expect(clientMock.__invoke).toHaveBeenCalledTimes(ACCOUNT_DELETION_MAX_ATTEMPTS);
    expect(clientMock.__refreshSession).toHaveBeenCalledTimes(ACCOUNT_DELETION_MAX_ATTEMPTS);
  });

  test("also stops at an explicit wall-clock deadline before another invoke", async () => {
    let now = 1_000;
    const nowSpy = jest.spyOn(Date, "now").mockImplementation(() => now);
    clientMock.__invoke.mockImplementationOnce(async () => {
      now += ACCOUNT_DELETION_DEADLINE_MS;
      return { data: null, error: cleanupInProgress(1_000) };
    });

    try {
      await expect(requestAccountDeletion(EXPECTED)).rejects.toBeDefined();
      expect(clientMock.__invoke).toHaveBeenCalledTimes(1);
      expect(clientMock.__refreshSession).toHaveBeenCalledTimes(1);
    } finally {
      nowSpy.mockRestore();
    }
  });

  test("does not start an Edge invoke when session refresh consumes the deadline", async () => {
    let now = 2_000;
    const nowSpy = jest.spyOn(Date, "now").mockImplementation(() => now);
    clientMock.__refreshSession.mockImplementationOnce(async () => {
      now += ACCOUNT_DELETION_DEADLINE_MS;
      return {
        data: {
          session: {
            access_token: mockAccessToken("u1", "session-a", "deadline"),
            user: { id: "u1" },
          },
        },
        error: null,
      };
    });

    try {
      await expect(requestAccountDeletion(EXPECTED)).rejects.toThrow("deadline exhausted");
      expect(clientMock.__refreshSession).toHaveBeenCalledTimes(1);
      expect(clientMock.__invoke).not.toHaveBeenCalled();
    } finally {
      nowSpy.mockRestore();
    }
  });

  test("stops before another invoke when the active account switches during cleanup retries", async () => {
    clientMock.__invoke.mockResolvedValueOnce({ data: null, error: cleanupInProgress(1_000) });
    clientMock.__getSession
      .mockResolvedValueOnce({
        data: { session: { access_token: mockAccessToken("u1", "session-a"), user: { id: "u1" } } },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { session: { access_token: mockAccessToken("u1", "session-a", "2"), user: { id: "u1" } } },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { session: { access_token: mockAccessToken("u2", "session-b"), user: { id: "u2" } } },
        error: null,
      });

    await expect(requestAccountDeletion(EXPECTED)).rejects.toMatchObject({
      name: "AuthSessionOwnerChangedError",
    });
    expect(clientMock.__invoke).toHaveBeenCalledTimes(1);
    expect(clientMock.__refreshSession).toHaveBeenCalledTimes(1);
  });

  test("does not retry an unrecognized 409 body", async () => {
    clientMock.__invoke.mockResolvedValueOnce({
      data: null,
      error: { context: { status: 409, json: async () => ({ error: "different_conflict" }) } },
    });

    await expect(requestAccountDeletion(EXPECTED)).rejects.toBeDefined();
    expect(clientMock.__invoke).toHaveBeenCalledTimes(1);
  });

  test.each([
    ["missing deletion fence", {
      error: "deletion_cleanup_in_progress", raw_clippings_erased: false, raw_clippings_removed: 1,
    }],
    ["false deletion fence", {
      error: "deletion_cleanup_in_progress", deletion_fenced: false,
      raw_clippings_erased: false, raw_clippings_removed: 1,
    }],
    ["missing unfinished marker", {
      error: "deletion_cleanup_in_progress", deletion_fenced: true, raw_clippings_removed: 1,
    }],
    ["contradictory erased marker", {
      error: "deletion_cleanup_in_progress", deletion_fenced: true,
      raw_clippings_erased: true, raw_clippings_removed: 1,
    }],
    ["unsafe removed count", {
      error: "deletion_cleanup_in_progress", deletion_fenced: true,
      raw_clippings_erased: false, raw_clippings_removed: Number.MAX_SAFE_INTEGER + 1,
    }],
  ])("does not retry a 409 with %s", async (_label, body) => {
    clientMock.__invoke.mockResolvedValueOnce({ data: null, error: conflict(body) });

    await expect(requestAccountDeletion(EXPECTED)).rejects.toBeDefined();
    expect(clientMock.__invoke).toHaveBeenCalledTimes(1);
  });
});

describe("account deletion UI routing", () => {
  // 삭제 표면이 둘이었다(레거시 /account · deep-space). 레거시는 2026-09-08 에
  // 아카이브로 나갔고, **배송되는 표면은 deep-space 하나**다. 보관본은 byte-pinned라
  // 새 인자를 주입하지 않는다. 되살릴 때 컴파일 경계에서 함께 갱신해야 한다.
  const account = readFileSync(join(process.cwd(), "legacy/screens/account.tsx"), "utf8");
  const deepSpace = readFileSync(
    join(process.cwd(), "src/screens/deepspace/DeepSpaceDesignScreens.tsx"),
    "utf8",
  );

  test("full account deletion never runs the non-atomic client content wipe first", () => {
    expect(account).not.toContain("deleteAllUserData");
    expect(deepSpace).not.toContain("deleteAllUserData");
    expect(account).toContain("await requestAccountDeletion()");
    expect(deepSpace).toContain("await requestAccountDeletion(authExpectation)");
  });

  test("both deletion surfaces synchronously fence duplicate terminal calls", () => {
    expect(account).toContain("deleteConfirmUserRef.current !== userId");
    expect(account).toContain("deleteInFlightRef.current = true");
    expect(deepSpace).toContain("deleteConfirmUserRef.current !== userId");
    expect(deepSpace).toContain("deleteInFlightRef.current = true");
  });

  test("deep-space confirms twice and blocks route removal while erasure is in flight", () => {
    expect(account).toContain('navigation.addListener("beforeRemove"');
    expect(deepSpace).toContain('navigation.addListener("beforeRemove"');
    expect(deepSpace).toContain("event.preventDefault()");
    expect(deepSpace).toContain("setDeleteConfirmOpen(true)");
    expect(deepSpace).toContain("onPress={requestDeleteAccountConfirm}");
    expect(deepSpace).not.toContain("onPress={() => void runDeleteAccount()}");
  });

  test("a late deletion result cannot sign out a newly active user", () => {
    expect(account).toContain("activeUserRef.current !== targetUserId");
    expect(deepSpace).toContain("activeUserRef.current !== targetUserId");
  });

  test("a final confirmation is bound to the user who opened it", () => {
    for (const source of [account, deepSpace]) {
      expect(source).toContain("deleteConfirmUserRef.current = userId");
      expect(source).toContain("deleteConfirmUserRef.current !== userId");
      expect(source).toContain("deleteConfirmUserRef.current = null");
    }
  });

  test("local sign-out failure is not treated as a retryable deletion failure", () => {
    const surfaces = [
      [account, "await requestAccountDeletion()"],
      [deepSpace, "await requestAccountDeletion(authExpectation)"],
    ] as const;
    for (const [source, call] of surfaces) {
      const terminalCall = source.indexOf(call);
      const localSignOutWarning = source.indexOf("local sign-out after deletion failed");
      const redirect = source.indexOf('router.replace("/sign-in")', localSignOutWarning);
      expect(terminalCall).toBeGreaterThan(-1);
      expect(localSignOutWarning).toBeGreaterThan(terminalCall);
      expect(redirect).toBeGreaterThan(localSignOutWarning);
    }
  });
});
