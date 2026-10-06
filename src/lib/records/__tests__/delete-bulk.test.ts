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

// Lookup (2) is network; each test says what the server answers about its request.
jest.mock("../../account/deletion-receipt", () => {
  const actual = jest.requireActual("../../account/deletion-receipt");
  const opStatus = jest.fn().mockResolvedValue({ status: "unavailable" });
  return {
    ...actual,
    fetchAccountDeletionOpStatus: opStatus,
    __opStatus: opStatus,
    __reset: () => opStatus.mockReset().mockResolvedValue({ status: "unavailable" }),
  };
});

import {
  ACCOUNT_DELETION_DEADLINE_MS,
  ACCOUNT_DELETION_MAX_ATTEMPTS,
  AccountDeletionUnconfirmedError,
  deleteAllUserData,
  requestAccountDeletion,
} from "../delete-bulk";
import { __setDeletionOpMemoStorageForTests } from "../../account/deletion-op-memo";
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
const receiptMock = require("../../account/deletion-receipt") as {
  __opStatus: jest.Mock;
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

describe("requestAccountDeletion (terminal erasure, 0217 begin -> execute)", () => {
  const TOKEN = `v1.${"A".repeat(43)}`;
  type InvokeResult = { data: unknown; error: unknown };
  let executeQueue: InvokeResult[] = [];
  let executeDefault: (() => InvokeResult) | null = null;
  let beginResult: ((body: Record<string, unknown>) => InvokeResult) | null = null;
  let memory: Map<string, string>;

  beforeEach(() => {
    clientMock.__reset();
    receiptMock.__reset();
    executeQueue = [];
    executeDefault = null;
    beginResult = null;
    memory = new Map();
    __setDeletionOpMemoStorageForTests({
      getItem: async (key) => memory.get(key) ?? null,
      setItem: async (key, value) => { memory.set(key, value); },
      removeItem: async (key) => { memory.delete(key); },
      keys: async () => [...memory.keys()],
    });
    clientMock.__invoke.mockImplementation(async (_name: string, options: { body: Record<string, unknown> }) => {
      const body = options.body;
      if (body.op === "begin") {
        return beginResult ? beginResult(body) : { data: { op_id: body.op_id, op_token: TOKEN }, error: null };
      }
      if (body.op === "execute") {
        const queued = executeQueue.shift();
        if (queued) return queued;
        if (executeDefault) return executeDefault();
        return { data: { deleted: true, op_id: body.op_id }, error: null };
      }
      return { data: { deleted: true }, error: null };
    });
  });
  afterEach(() => __setDeletionOpMemoStorageForTests(null));

  const bodies = () => clientMock.__invoke.mock.calls.map(([, options]) => options.body as Record<string, unknown>);
  const executeCalls = () => bodies().filter((body) => body.op === "execute");
  const memos = () => [...memory.values()].map((raw) => JSON.parse(raw) as Record<string, unknown>);

  function httpError(status: number, body: Record<string, unknown>) {
    // Exercise the exact @supabase/functions-js 2.106.1 producer: rejected
    // responses are preserved on FunctionsHttpError.context.
    return new FunctionsHttpError(
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
    );
  }
  const conflict = (body: Record<string, unknown>) => httpError(409, body);

  function cleanupInProgress(removed: number) {
    return conflict({
        error: "deletion_cleanup_in_progress",
        deletion_fenced: true,
        raw_clippings_erased: false,
        raw_clippings_removed: removed,
    });
  }

  test("records the request (begin) before the destructive execute, both with a freshly bound token", async () => {
    // Returns the receipt rather than void. This mock answers with { deleted:
    // true } alone, so both post-cascade sweeps come back unconfirmed — which
    // is not the same as failed. Sweep-level behaviour lives in
    // delete-bulk-receipt.test.ts.
    const receipt = await requestAccountDeletion(EXPECTED);
    expect(receipt.deleted).toBe(true);
    expect(receipt.incomplete).toEqual([]);
    expect(receipt.unconfirmed).toEqual(["profile", "rawClippings"]);
    const [begin, execute] = bodies();
    expect(begin).toEqual({ op: "begin", op_id: expect.stringMatching(/^[0-9a-f-]{36}$/) });
    expect(execute).toEqual({ op: "execute", op_id: begin.op_id, op_token: TOKEN });
    expect(receipt.opId).toBe(begin.op_id);
    expect(clientMock.__refreshSession).toHaveBeenCalledTimes(2);
    expect(clientMock.__invoke).toHaveBeenCalledWith("delete-account", expect.objectContaining({
      headers: { Authorization: `Bearer ${mockAccessToken("u1", "session-a", "2")}` },
    }));
    // The armed memo (with the token) stays until the finish flow settles it.
    expect(memos()).toEqual([expect.objectContaining({ phase: "armed", owner: "u1", opId: begin.op_id, token: TOKEN })]);
  });

  test("never sends execute unless the token is durably remembered first (5절 불변식)", async () => {
    __setDeletionOpMemoStorageForTests({
      getItem: async () => null,
      setItem: async () => undefined,
      removeItem: async () => undefined,
      keys: async () => [],
    });
    await expect(requestAccountDeletion(EXPECTED)).rejects.toThrow("could not be remembered");
    expect(executeCalls()).toHaveLength(0);
  });

  test("no local write fence is installed on the way: only the server-confirmed finish flow fences (I7)", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/records/delete-bulk.ts"), "utf8");
    expect(source).not.toContain("installAccountLocalDeletionFence");
    expect(source).not.toMatch(/requireCrossTab:\s*true/);
  });

  test("an old Edge (400 on begin) falls back to the {} flow without a receipt number", async () => {
    beginResult = () => ({ data: null, error: httpError(400, { error: "invalid_body" }) });
    const receipt = await requestAccountDeletion(EXPECTED);
    expect(bodies().map((body) => body.op ?? "{}")).toEqual(["begin", "{}"]);
    expect(receipt.opId).toBeNull();
    expect(memos()).toEqual([]);
  });

  test("a begin failure is definite: nothing executed, the pending memo is cleared", async () => {
    beginResult = () => ({ data: null, error: httpError(503, { error: "server_unavailable" }) });
    await expect(requestAccountDeletion(EXPECTED)).rejects.toBeDefined();
    expect(executeCalls()).toHaveLength(0);
    expect(memos()).toEqual([]);
  });

  test("does not start anything for a session that lacks a stable session id", async () => {
    await expect(requestAccountDeletion({ ...EXPECTED, sessionId: null })).rejects.toMatchObject({
      name: "AuthSessionOwnerChangedError",
    });
    expect(clientMock.__invoke).not.toHaveBeenCalled();
    expect(memos()).toEqual([]);
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
    expect(memos()).toEqual([]);
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

  test.each([
    ["op_closed", 409, { error: "op_closed", op_status: "failed" }],
    ["op_rejected", 403, { error: "op_rejected" }],
    ["a failed precondition", 503, { error: "deletion_precondition_failed", op_status: "failed" }],
    ["a failed Auth deletion", 500, { error: "account_delete_failed", op_status: "failed" }],
  ])("a server-confirmed %s is a definite failure and forgets the request", async (_label, status, body) => {
    executeQueue.push({ data: null, error: httpError(status, body) });
    await expect(requestAccountDeletion(EXPECTED)).rejects.not.toBeInstanceOf(AccountDeletionUnconfirmedError);
    expect(executeCalls()).toHaveLength(1);
    expect(receiptMock.__opStatus).not.toHaveBeenCalled();
    expect(memos()).toEqual([]);
  });

  test("a lost answer is unconfirmed, keeps the armed memo, and asks the server first (I5)", async () => {
    executeQueue.push({ data: null, error: new Error("network down") });
    receiptMock.__opStatus.mockResolvedValueOnce({ status: "unavailable" });
    await expect(requestAccountDeletion(EXPECTED)).rejects.toBeInstanceOf(AccountDeletionUnconfirmedError);
    const [begin] = bodies();
    expect(receiptMock.__opStatus).toHaveBeenCalledWith({ opId: begin.op_id, token: TOKEN, owner: "u1" });
    expect(memos()).toEqual([expect.objectContaining({ phase: "armed", opId: begin.op_id })]);
  });

  test("a lost answer the server reports completed returns the server's receipt", async () => {
    executeQueue.push({ data: null, error: httpError(503, { error: "server_unavailable" }) });
    receiptMock.__opStatus.mockImplementationOnce(async ({ opId }: { opId: string }) => ({
      status: "known",
      op: "completed",
      receipt: {
        opId,
        erasedAtIso: "2026-10-07T00:00:00.000Z",
        expiresAtIso: "2027-10-07T00:00:00.000Z",
        sweeps: { profileErased: true, deletionFenced: true, rawClippingsErased: true, rawClippingsEmptyAtCheck: true },
        sweepsReported: true,
        unrecorded: false,
      },
    }));
    const receipt = await requestAccountDeletion(EXPECTED);
    expect(receipt).toMatchObject({ deleted: true, opId: bodies()[0].op_id, complete: true });
  });

  test("a lost answer the server reports failed is definite and forgets the request", async () => {
    executeQueue.push({ data: null, error: new Error("timeout") });
    receiptMock.__opStatus.mockResolvedValueOnce({ status: "known", op: "failed", receipt: null });
    await expect(requestAccountDeletion(EXPECTED)).rejects.toThrow("did not complete");
    expect(memos()).toEqual([]);
  });

  test("an earlier request the server reports completed is finished instead of deleting again", async () => {
    memory.set("account.deletionOp.v1:u1:0b7c2a7e-1d1f-4d3a-9a51-6f2f0c4d9e11", JSON.stringify({
      v: 1, phase: "armed", owner: "u1", opId: "0b7c2a7e-1d1f-4d3a-9a51-6f2f0c4d9e11", token: TOKEN, at: 1,
    }));
    receiptMock.__opStatus.mockResolvedValueOnce({
      status: "known",
      op: "completed",
      receipt: {
        opId: "0b7c2a7e-1d1f-4d3a-9a51-6f2f0c4d9e11",
        erasedAtIso: "2026-10-07T00:00:00.000Z",
        expiresAtIso: "2027-10-07T00:00:00.000Z",
        sweeps: { profileErased: true, deletionFenced: true, rawClippingsErased: null, rawClippingsEmptyAtCheck: true },
        sweepsReported: true,
        unrecorded: false,
      },
    });
    const receipt = await requestAccountDeletion(EXPECTED);
    expect(receipt.opId).toBe("0b7c2a7e-1d1f-4d3a-9a51-6f2f0c4d9e11");
    expect(clientMock.__invoke).not.toHaveBeenCalled();
  });

  test("an earlier request the server reports abandoned is forgotten and a new one starts", async () => {
    memory.set("account.deletionOp.v1:u1:0b7c2a7e-1d1f-4d3a-9a51-6f2f0c4d9e11", JSON.stringify({
      v: 1, phase: "armed", owner: "u1", opId: "0b7c2a7e-1d1f-4d3a-9a51-6f2f0c4d9e11", token: TOKEN, at: 1,
    }));
    receiptMock.__opStatus.mockResolvedValueOnce({ status: "known", op: "abandoned", receipt: null });
    const receipt = await requestAccountDeletion(EXPECTED);
    expect(receipt.opId).not.toBe("0b7c2a7e-1d1f-4d3a-9a51-6f2f0c4d9e11");
    expect(memos().map((memo) => memo.opId)).toEqual([receipt.opId]);
  });

  test("recovers 409 cleanup progress and retries the same op with a newly bound token", async () => {
    clientMock.__refreshSession
      .mockResolvedValueOnce({
        data: { session: { access_token: mockAccessToken("u1", "session-a", "begin"), user: { id: "u1" } } },
        error: null,
      })
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
    executeQueue.push(
      { data: null, error: cleanupInProgress(1_000) },
      { data: null, error: cleanupInProgress(1_000) },
      {
        data: {
          deleted: true,
          profile_erased: true,
          deletion_fenced: true,
          raw_clippings_erased: true,
          raw_clippings_empty_at_check: true,
          raw_clippings_removed: 3,
        },
        error: null,
      },
    );

    await expect(requestAccountDeletion(EXPECTED)).resolves.toMatchObject({
      deleted: true,
      rawClippingsRemoved: 2_003,
    });
    expect(clientMock.__refreshSession).toHaveBeenCalledTimes(4);
    const executes = clientMock.__invoke.mock.calls.filter(([, options]) => options.body.op === "execute");
    expect(new Set(executes.map(([, options]) => options.body.op_id)).size).toBe(1);
    expect(executes.map(([, options]) => options.headers.Authorization)).toEqual([
      `Bearer ${mockAccessToken("u1", "session-a", "3")}`,
      `Bearer ${mockAccessToken("u1", "session-a", "4")}`,
      `Bearer ${mockAccessToken("u1", "session-a", "5")}`,
    ]);
  });

  test("bounds automatic cleanup retries, then asks the server instead of guessing", async () => {
    executeDefault = () => ({ data: null, error: cleanupInProgress(1_000) });

    await expect(requestAccountDeletion(EXPECTED)).rejects.toBeInstanceOf(AccountDeletionUnconfirmedError);
    expect(executeCalls()).toHaveLength(ACCOUNT_DELETION_MAX_ATTEMPTS);
    expect(clientMock.__refreshSession).toHaveBeenCalledTimes(ACCOUNT_DELETION_MAX_ATTEMPTS + 1);
    expect(receiptMock.__opStatus).toHaveBeenCalledTimes(1);
  });

  test("also stops at an explicit wall-clock deadline before another execute", async () => {
    let now = 1_000;
    const nowSpy = jest.spyOn(Date, "now").mockImplementation(() => now);
    executeDefault = () => {
      now += ACCOUNT_DELETION_DEADLINE_MS;
      return { data: null, error: cleanupInProgress(1_000) };
    };

    try {
      await expect(requestAccountDeletion(EXPECTED)).rejects.toBeInstanceOf(AccountDeletionUnconfirmedError);
      expect(executeCalls()).toHaveLength(1);
    } finally {
      nowSpy.mockRestore();
    }
  });

  test("does not send begin when session refresh consumes the deadline", async () => {
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
      expect(memos()).toEqual([]);
    } finally {
      nowSpy.mockRestore();
    }
  });

  test("an account switch during cleanup retries stops before another execute", async () => {
    executeQueue.push({ data: null, error: cleanupInProgress(1_000) });
    // begin: 2 reads, execute 1: 2 reads, then the switch on the next read.
    const a = (v: string) => ({
      data: { session: { access_token: mockAccessToken("u1", "session-a", v), user: { id: "u1" } } },
      error: null,
    });
    clientMock.__getSession
      .mockResolvedValueOnce(a("1"))
      .mockResolvedValueOnce(a("2"))
      .mockResolvedValueOnce(a("2"))
      .mockResolvedValueOnce(a("2"))
      .mockResolvedValueOnce({
        data: { session: { access_token: mockAccessToken("u2", "session-b"), user: { id: "u2" } } },
        error: null,
      });

    await expect(requestAccountDeletion(EXPECTED)).rejects.toBeInstanceOf(AccountDeletionUnconfirmedError);
    expect(executeCalls()).toHaveLength(1);
  });

  test("an unrecognized 409 body is not retried; the server is asked instead", async () => {
    executeQueue.push({
      data: null,
      error: { context: { status: 409, json: async () => ({ error: "different_conflict" }) } },
    });

    await expect(requestAccountDeletion(EXPECTED)).rejects.toBeInstanceOf(AccountDeletionUnconfirmedError);
    expect(executeCalls()).toHaveLength(1);
    expect(receiptMock.__opStatus).toHaveBeenCalledTimes(1);
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
    executeQueue.push({ data: null, error: conflict(body) });

    await expect(requestAccountDeletion(EXPECTED)).rejects.toBeDefined();
    expect(executeCalls()).toHaveLength(1);
  });

  // 2026-09-30: delete-account also sweeps record-photos (0209) after the raw
  // clippings. An unfinished photo sweep says so with record_photos_erased:false
  // while raw clippings are already done; it is the same retryable progress.
  test("retries an unfinished photo sweep and credits only the raw-clipping count", async () => {
    executeQueue.push(
      {
        data: null,
        error: conflict({
          error: "deletion_cleanup_in_progress", deletion_fenced: true,
          raw_clippings_erased: true, raw_clippings_removed: 2,
          record_photos_erased: false, record_photos_removed: 1000,
        }),
      },
      {
        data: {
          deleted: true, profile_erased: true, deletion_fenced: true,
          raw_clippings_erased: true, raw_clippings_empty_at_check: true, raw_clippings_removed: 0,
          record_photos_erased: true, record_photos_empty_at_check: true, record_photos_removed: 5,
        },
        error: null,
      },
    );

    const receipt = await requestAccountDeletion(EXPECTED);
    expect(executeCalls()).toHaveLength(2);
    expect(receipt.complete).toBe(true);
    expect(receipt.rawClippingsRemoved).toBe(2);
  });

  test("does not retry a 409 whose photo sweep is reported finished", async () => {
    executeQueue.push({
      data: null,
      error: conflict({
        error: "deletion_cleanup_in_progress", deletion_fenced: true,
        raw_clippings_erased: true, raw_clippings_removed: 0,
        record_photos_erased: true, record_photos_removed: 0,
      }),
    });

    await expect(requestAccountDeletion(EXPECTED)).rejects.toBeDefined();
    expect(executeCalls()).toHaveLength(1);
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
    // The finish flow checks the published owner before it opens the receipt or
    // signs out, and an owner-changed sign-out keeps B (deletion-completion.ts).
    expect(deepSpace).toContain("await finishAccountDeletion({");
    expect(deepSpace).toContain("isOwnerChangedError: (error) => error instanceof AuthSessionOwnerChangedError");
    const completion = readFileSync(join(process.cwd(), "src/lib/account/deletion-completion.ts"), "utf8");
    expect(completion).toContain("if (active !== null && active !== owner)");
  });

  test("a final confirmation is bound to the user who opened it", () => {
    for (const source of [deepSpace]) {
      expect(source).toContain("deleteConfirmUserRef.current = userId");
      expect(source).toContain("deleteConfirmUserRef.current !== userId");
      expect(source).toContain("deleteConfirmUserRef.current = null");
    }
  });

  test("local sign-out failure is not treated as a retryable deletion failure", () => {
    const surfaces = [[deepSpace, "await requestAccountDeletion(authExpectation)"]] as const;
    for (const [source, call] of surfaces) {
      const terminalCall = source.indexOf(call);
      const finish = source.indexOf("await finishAccountDeletion({", terminalCall);
      const localSignOutWarning = source.indexOf("local sign-out after deletion failed");
      expect(terminalCall).toBeGreaterThan(-1);
      expect(finish).toBeGreaterThan(terminalCall);
      expect(localSignOutWarning).toBeGreaterThan(finish);
      // After the server confirmed, nothing sets the retryable error again.
      expect(source.slice(finish, source.indexOf("function requestDeleteAccountConfirm"))).not.toContain("setDelError(true)");
    }
  });
});
