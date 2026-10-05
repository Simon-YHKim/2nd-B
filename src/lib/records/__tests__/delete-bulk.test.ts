// Audit HIGH (deleteAllUserData incomplete erasure): asserts the content wipe
// now also clears the client-deletable derived tables (self_contexts, owned
// clipper_templates) on top of records/sources/wiki/chat, and that terminal
// account deletion routes through the delete-account Edge Function (the only
// path that reaches RLS-protected tables + the public.users cascade).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FunctionsFetchError, FunctionsHttpError } from "@supabase/functions-js";

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
  // 2026-09-30: record deletes now return the deleted rows' `structured`, so the
  // photos a 글 note carries (records.structured.photos) leave Storage with it.
  // `recordRows` is what the records delete hands back; `remove` records which
  // photo objects Storage was asked to delete.
  const recordRows: { structured: unknown }[] = [];
  const removedObjects: string[][] = [];
  const remove = jest.fn(async (paths: string[]) => {
    removedObjects.push(paths);
    return { data: paths.map((name) => ({ name })), error: null };
  });
  const from = jest.fn((table: string) => {
    const chain: Record<string, unknown> = {
      delete: () => {
        tablesDeleted.push(table);
        return chain;
      },
      update: () => chain,
      eq: () => chain,
      select: () => chain,
      // thenable so `await from(t).delete().eq(...)` resolves
      then: (resolve: (v: { count: number; error: null; data: unknown[] }) => unknown) =>
        resolve(
          table === "records"
            ? { count: recordRows.length, error: null, data: recordRows }
            : { count: 0, error: null, data: [] },
        ),
    };
    return chain;
  });
  const storage = { from: () => ({ remove }) };
  const mock = { from, storage, auth: { getSession, refreshSession }, functions: { invoke } };
  return {
    getSupabaseClient: () => mock,
    __tablesDeleted: tablesDeleted,
    __invoke: invoke,
    __getSession: getSession,
    __refreshSession: refreshSession,
    __recordRows: recordRows,
    __removedObjects: removedObjects,
    __reset: () => {
      tablesDeleted.length = 0;
      recordRows.length = 0;
      removedObjects.length = 0;
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

// The terminal local fence is no longer delete-bulk's to install (Q-261004-42 =
// A): purgeDeletedAccountLocalData installs it after the server confirms. This
// mock only proves delete-bulk never reaches for it.
jest.mock("../../account/local-deletion-fence", () => {
  const installFence = jest.fn().mockResolvedValue(true);
  return {
    installAccountLocalDeletionFence: installFence,
    __installFence: installFence,
    __reset: () => installFence.mockReset().mockResolvedValue(true),
  };
});

jest.mock("../../account/deletion-pending", () => {
  const add = jest.fn().mockResolvedValue(true);
  const remove = jest.fn().mockResolvedValue(true);
  const resolve = jest.fn().mockResolvedValue({ kind: "none" });
  return {
    addPendingAccountDeletion: add,
    removePendingAccountDeletion: remove,
    resolvePendingAccountDeletion: resolve,
    __add: add,
    __remove: remove,
    __resolve: resolve,
    __reset: () => {
      add.mockReset().mockResolvedValue(true);
      remove.mockReset().mockResolvedValue(true);
      resolve.mockReset().mockResolvedValue({ kind: "none" });
    },
  };
});

import {
  ACCOUNT_DELETION_DEADLINE_MS,
  ACCOUNT_DELETION_MAX_ATTEMPTS,
  AccountDeletionUnconfirmedError,
  deleteAllUserData,
  requestAccountDeletion as requestAccountDeletionWithDefaults,
} from "../delete-bulk";
import type { ReceiptLookup } from "../../account/deletion-receipt";
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
  __recordRows: { structured: unknown }[];
  __removedObjects: string[][];
  __reset: () => void;
};
const fenceMock = require("../../account/local-deletion-fence") as {
  __installFence: jest.Mock;
  __reset: () => void;
};
const pendingMock = require("../../account/deletion-pending") as {
  __add: jest.Mock;
  __remove: jest.Mock;
  __resolve: jest.Mock;
  __reset: () => void;
};

const REQUEST_ID = "11111111-2222-4333-8444-555555555555";
const lookupReceipt = jest.fn<Promise<ReceiptLookup>, [string]>();
// Every call injects a lookup and a fixed request id, so no test reaches the
// network and the receipt number is predictable.
function requestAccountDeletion(expected: AuthSessionExpectation) {
  return requestAccountDeletionWithDefaults(expected, {
    lookupReceipt,
    newRequestId: () => REQUEST_ID.toUpperCase(),
  });
}
function serverReceipt(id = REQUEST_ID) {
  return {
    status: "found" as const,
    receipt: {
      id,
      erasedAtIso: "2026-10-05T12:00:00.000Z",
      expiresAtIso: "2027-10-05T12:00:00.000Z",
      sweeps: {
        profile_erased: true,
        deletion_fenced: true,
        raw_clippings_erased: true,
        raw_clippings_empty_at_check: true,
        record_photos_erased: true,
        record_photos_empty_at_check: true,
      },
      sweepsReported: true,
    },
  };
}

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

  test("removes the photos the wiped records carried, and only those (2026-09-30)", async () => {
    const own = "u1/photo-0123456789abcdef.jpg";
    clientMock.__recordRows.push(
      { structured: { photos: [{ path: own, mime: "image/jpeg" }] } },
      // Another owner's path is never handed to Storage, whatever the row says.
      { structured: { photos: [{ path: "u2/photo-0123456789abcdef.jpg", mime: "image/jpeg" }] } },
      { structured: { form: "fourw", version: 1, fields: { what: "x" } } },
      { structured: null },
    );
    await deleteAllUserData("u1");
    expect(clientMock.__removedObjects).toEqual([[own]]);
  });

  test("a wipe whose records carried no photos never calls Storage", async () => {
    clientMock.__recordRows.push({ structured: null });
    await deleteAllUserData("u1");
    expect(clientMock.__removedObjects).toEqual([]);
  });
});

describe("requestAccountDeletion (terminal erasure)", () => {
  beforeEach(() => {
    clientMock.__reset();
    fenceMock.__reset();
    pendingMock.__reset();
    lookupReceipt.mockReset().mockResolvedValue({ status: "not-found" });
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
    expect(receipt.receiptId).toBeNull();
    expect(receipt.incomplete).toEqual([]);
    expect(receipt.unconfirmed).toEqual(["profile", "rawClippings"]);
    expect(clientMock.__getSession).toHaveBeenCalledTimes(2);
    expect(clientMock.__refreshSession).toHaveBeenCalledTimes(1);
    expect(clientMock.__invoke).toHaveBeenCalledWith("delete-account", expect.objectContaining({
      body: { request_id: REQUEST_ID },
      headers: { Authorization: `Bearer ${mockAccessToken("u1", "session-a", "2")}` },
    }));
  });

  test("remembers the request before it leaves and never installs the terminal fence itself", async () => {
    await requestAccountDeletion(EXPECTED);
    expect(pendingMock.__add).toHaveBeenCalledWith("u1", REQUEST_ID);
    expect(pendingMock.__add.mock.invocationCallOrder[0])
      .toBeLessThan(clientMock.__invoke.mock.invocationCallOrder[0]);
    // The note stays until the caller purged local data (finishAccountDeletion).
    expect(pendingMock.__remove).not.toHaveBeenCalled();
    expect(fenceMock.__installFence).not.toHaveBeenCalled();
  });

  test("carries the receipt number the server recorded", async () => {
    clientMock.__invoke.mockResolvedValueOnce({
      data: { deleted: true, receipt_id: REQUEST_ID, profile_erased: true },
      error: null,
    });
    const receipt = await requestAccountDeletion(EXPECTED);
    expect(receipt.receiptId).toBe(REQUEST_ID);
    expect(lookupReceipt).not.toHaveBeenCalled();
  });

  test("never invokes the remote function unless the pending note is acknowledged", async () => {
    pendingMock.__add.mockResolvedValueOnce(false);

    await expect(requestAccountDeletion(EXPECTED)).rejects.toThrow("pending note");
    expect(clientMock.__refreshSession).not.toHaveBeenCalled();
    expect(clientMock.__invoke).not.toHaveBeenCalled();
    expect(fenceMock.__installFence).not.toHaveBeenCalled();
  });

  test("does not touch any note or fence for a session that lacks a stable session id", async () => {
    await expect(requestAccountDeletion({ ...EXPECTED, sessionId: null })).rejects.toMatchObject({
      name: "AuthSessionOwnerChangedError",
    });
    expect(pendingMock.__add).not.toHaveBeenCalled();
    expect(fenceMock.__installFence).not.toHaveBeenCalled();
    expect(clientMock.__invoke).not.toHaveBeenCalled();
  });

  test("a request that never reached the server leaves no note and no fence (R3-05 / BL-07)", async () => {
    clientMock.__refreshSession.mockResolvedValueOnce({ data: { session: null }, error: new Error("offline") });

    await expect(requestAccountDeletion(EXPECTED)).rejects.toThrow("offline");
    expect(clientMock.__invoke).not.toHaveBeenCalled();
    expect(pendingMock.__remove).toHaveBeenCalledWith("u1", REQUEST_ID);
    expect(fenceMock.__installFence).not.toHaveBeenCalled();
    expect(lookupReceipt).not.toHaveBeenCalled();
  });

  test("an answer that proves nothing was erased drops the note", async () => {
    clientMock.__invoke.mockResolvedValueOnce({
      data: null,
      error: new FunctionsHttpError(new Response(JSON.stringify({ error: "fresh_session_required" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      })),
    });

    await expect(requestAccountDeletion(EXPECTED)).rejects.toBeInstanceOf(FunctionsHttpError);
    expect(pendingMock.__remove).toHaveBeenCalledWith("u1", REQUEST_ID);
    expect(lookupReceipt).not.toHaveBeenCalled();
  });

  test("an older delete-account that rejects the request id is retried once with {} (deploy order)", async () => {
    const invalidBody = () => new FunctionsHttpError(new Response(JSON.stringify({ error: "invalid_body" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    }));
    clientMock.__invoke
      .mockResolvedValueOnce({ data: null, error: invalidBody() })
      .mockResolvedValueOnce({ data: { deleted: true }, error: null });

    const receipt = await requestAccountDeletion(EXPECTED);
    expect(receipt.deleted).toBe(true);
    expect(receipt.receiptId).toBeNull();
    expect(clientMock.__invoke.mock.calls.map(([, options]) => options.body))
      .toEqual([{ request_id: REQUEST_ID }, {}]);

    // `{}` itself rejected is a real failure, not another fallback.
    clientMock.__invoke.mockReset()
      .mockResolvedValueOnce({ data: null, error: invalidBody() })
      .mockResolvedValueOnce({ data: null, error: invalidBody() });
    await expect(requestAccountDeletion(EXPECTED)).rejects.toBeInstanceOf(FunctionsHttpError);
    expect(clientMock.__invoke).toHaveBeenCalledTimes(2);
    expect(pendingMock.__remove).toHaveBeenCalledWith("u1", REQUEST_ID);
  });

  test("a lost answer is resolved by the receipt the server recorded", async () => {
    clientMock.__invoke.mockResolvedValueOnce({ data: null, error: new FunctionsFetchError(new TypeError("network")) });
    lookupReceipt.mockResolvedValueOnce(serverReceipt());

    const receipt = await requestAccountDeletion(EXPECTED);
    expect(lookupReceipt).toHaveBeenCalledWith(REQUEST_ID);
    expect(receipt.deleted).toBe(true);
    expect(receipt.receiptId).toBe(REQUEST_ID);
    expect(receipt.complete).toBe(true);
    expect(pendingMock.__remove).not.toHaveBeenCalled();
    expect(fenceMock.__installFence).not.toHaveBeenCalled();
  });

  test.each([
    ["a transport error", { data: null, error: new FunctionsFetchError(new TypeError("network")) }],
    ["an unreadable 5xx", { data: null, error: { context: { status: 503, json: async () => ({ error: "server_unavailable" }) } } }],
    ["a 200 without deleted:true", { data: { deleted: false }, error: null }],
  ])("%s without a receipt stays unconfirmed and keeps the note", async (_label, answer) => {
    clientMock.__invoke.mockResolvedValueOnce(answer);
    lookupReceipt.mockResolvedValueOnce({ status: "not-found" });

    await expect(requestAccountDeletion(EXPECTED)).rejects.toBeInstanceOf(AccountDeletionUnconfirmedError);
    expect(pendingMock.__remove).not.toHaveBeenCalled();
    expect(fenceMock.__installFence).not.toHaveBeenCalled();
  });

  test("an unreachable lookup is never read as not deleted", async () => {
    clientMock.__invoke.mockResolvedValueOnce({ data: null, error: new FunctionsFetchError(new TypeError("network")) });
    lookupReceipt.mockResolvedValueOnce({ status: "unavailable" });

    await expect(requestAccountDeletion(EXPECTED)).rejects.toBeInstanceOf(AccountDeletionUnconfirmedError);
    expect(pendingMock.__remove).not.toHaveBeenCalled();
  });

  test("an earlier unanswered request that finished is returned without erasing twice", async () => {
    pendingMock.__resolve.mockResolvedValueOnce({ kind: "deleted", receipt: serverReceipt().receipt });

    const receipt = await requestAccountDeletion(EXPECTED);
    expect(receipt.receiptId).toBe(REQUEST_ID);
    expect(clientMock.__refreshSession).not.toHaveBeenCalled();
    expect(clientMock.__invoke).not.toHaveBeenCalled();
    expect(pendingMock.__add).not.toHaveBeenCalled();
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
    // An error without a server answer proves nothing: it is checked by receipt.
    expect(lookupReceipt).toHaveBeenCalledWith(REQUEST_ID);
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

  // 2026-09-30: delete-account also sweeps record-photos (0209) after the raw
  // clippings. An unfinished photo sweep says so with record_photos_erased:false
  // while raw clippings are already done; it is the same retryable progress.
  test("retries an unfinished photo sweep and credits only the raw-clipping count", async () => {
    clientMock.__invoke
      .mockResolvedValueOnce({
        data: null,
        error: conflict({
          error: "deletion_cleanup_in_progress", deletion_fenced: true,
          raw_clippings_erased: true, raw_clippings_removed: 2,
          record_photos_erased: false, record_photos_removed: 1000,
        }),
      })
      .mockResolvedValueOnce({
        data: {
          deleted: true, profile_erased: true, deletion_fenced: true,
          raw_clippings_erased: true, raw_clippings_empty_at_check: true, raw_clippings_removed: 0,
          record_photos_erased: true, record_photos_empty_at_check: true, record_photos_removed: 5,
        },
        error: null,
      });

    const receipt = await requestAccountDeletion(EXPECTED);
    expect(clientMock.__invoke).toHaveBeenCalledTimes(2);
    expect(receipt.complete).toBe(true);
    expect(receipt.rawClippingsRemoved).toBe(2);
  });

  test("does not retry a 409 whose photo sweep is reported finished", async () => {
    clientMock.__invoke.mockResolvedValueOnce({
      data: null,
      error: conflict({
        error: "deletion_cleanup_in_progress", deletion_fenced: true,
        raw_clippings_erased: true, raw_clippings_removed: 0,
        record_photos_erased: true, record_photos_removed: 0,
      }),
    });

    await expect(requestAccountDeletion(EXPECTED)).rejects.toBeDefined();
    expect(clientMock.__invoke).toHaveBeenCalledTimes(1);
  });
});

describe("account deletion UI routing", () => {
  // 삭제 표면이 둘이었다(레거시 /account · deep-space). 레거시는 2026-09-08 에
  // 아카이브로 나갔고, **배송되는 표면은 deep-space 하나**다. 그 보관본은 2026-10-05 롤백
  // 레버 제거와 함께 E:/Legacy/2ndB 로 나갔고(Simon 결정 Q-261004-11 C), 검사는 보관본을
  // 읽지 않으므로(legacy-archive-integrity.test.ts) 아래 단언에서 보관본 쪽 절반을 걷었다.
  // 배송 표면에 대한 단언은 하나도 빼지 않았다.
  const deepSpace = readFileSync(
    join(process.cwd(), "src/screens/deepspace/DeepSpaceDesignScreens.tsx"),
    "utf8",
  );

  test("full account deletion never runs the non-atomic client content wipe first", () => {
    expect(deepSpace).not.toContain("deleteAllUserData");
    expect(deepSpace).toContain("await requestAccountDeletion(authExpectation)");
  });

  test("the deletion surface synchronously fences duplicate terminal calls", () => {
    expect(deepSpace).toContain("deleteConfirmUserRef.current !== userId");
    expect(deepSpace).toContain("deleteInFlightRef.current = true");
  });

  test("deep-space confirms twice and blocks route removal while erasure is in flight", () => {
    expect(deepSpace).toContain('navigation.addListener("beforeRemove"');
    expect(deepSpace).toContain("event.preventDefault()");
    expect(deepSpace).toContain("setDeleteConfirmOpen(true)");
    expect(deepSpace).toContain("onPress={requestDeleteAccountConfirm}");
    expect(deepSpace).not.toContain("onPress={() => void runDeleteAccount()}");
  });

  test("a late deletion result cannot sign out a newly active user", () => {
    expect(deepSpace).toContain("activeUserRef.current !== targetUserId");
  });

  test("a final confirmation is bound to the user who opened it", () => {
    for (const source of [deepSpace]) {
      expect(source).toContain("deleteConfirmUserRef.current = userId");
      expect(source).toContain("deleteConfirmUserRef.current !== userId");
      expect(source).toContain("deleteConfirmUserRef.current = null");
    }
  });

  test("local sign-out failure is not treated as a retryable deletion failure", () => {
    // 2026-10-05 (Q-261004-42 = A): a confirmed erasure no longer lands on
    // /sign-in with an in-memory notice. It opens the receipt route that reads
    // the server's record by number, even when local sign-out was unconfirmed.
    // finishAccountDeletion opens the receipt route itself and reports the
    // sign-out outcome to it; an unconfirmed sign-out is only logged here.
    const terminalCall = deepSpace.indexOf("await requestAccountDeletion(authExpectation)");
    const finish = deepSpace.indexOf("await finishAccountDeletion({", terminalCall);
    const openReceipt = deepSpace.indexOf("openReceipt: (href) => {", finish);
    const reportSignOut = deepSpace.indexOf("reportSignOut: (signout) => rootRouter.setParams({ signout })", finish);
    const localSignOutWarning = deepSpace.indexOf("local sign-out after deletion failed", finish);
    expect(terminalCall).toBeGreaterThan(-1);
    expect(finish).toBeGreaterThan(terminalCall);
    expect(openReceipt).toBeGreaterThan(finish);
    expect(reportSignOut).toBeGreaterThan(finish);
    expect(localSignOutWarning).toBeGreaterThan(reportSignOut);
    expect(deepSpace).not.toContain('router.replace("/sign-in")');
  });

  test("an unconfirmed outcome is not shown as a failure", () => {
    expect(deepSpace).toContain("e instanceof AccountDeletionUnconfirmedError");
    expect(deepSpace).toContain('consentT("account.delete.unconfirmed")');
  });
});
