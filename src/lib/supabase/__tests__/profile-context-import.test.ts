type Result = { data?: unknown; error: unknown };
const calls: Array<[string, unknown[]]> = [];
const getSession = jest.fn();
let response: Result;
let onBuild: (() => void) | undefined;

function builder(): unknown {
  const query: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order", "limit", "lt", "or", "setHeader"]) {
    query[method] = (...args: unknown[]) => {
      calls.push([method, args]);
      return query;
    };
  }
  query.single = () => Promise.resolve(response);
  query.then = (resolve: (result: Result) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(response).then(resolve, reject);
  onBuild?.();
  return query;
}

jest.mock("../client", () => ({
  getSupabaseClient: () => ({
    auth: { getSession },
    from: (...args: unknown[]) => { calls.push(["from", args]); return builder(); },
    rpc: (...args: unknown[]) => { calls.push(["rpc", args]); return builder(); },
  }),
}));

import {
  applyProfileContextImport, fetchProfileImportSnapshot,
  fetchProfileImportedContext, listProfileContextImports, withdrawProfileContextImport, type ProfileImportRequest,
} from "../profile-context-import";
import { parseProfileContext } from "../../import/profile-context";

const owner = "owner-a";
const receipt = {
  id: "batch-1", item_count: 1, profile_change_count: 1,
  created_at: "2026-10-09T00:00:00.000Z", status: "active", source_id: "source-1", profile_restored: false,
};
const makeRequest = (): ProfileImportRequest => ({
  requestId: "request-1",
  document: parseProfileContext(JSON.stringify({
    format: "polascope.user-context", version: "1.0-draft",
    origin: { service: "unknown", model: null, exported_at: null },
    coverage: { accessed: ["current_chat"], unavailable: [], omissions: [], more_items: "unknown", account_completeness: "unknown" },
    sources: [{ id: "s1", kind: "chat_excerpt", speaker: "user", conversation_id: null, message_id: null, label: null, occurred_at: null, excerpt: "I prefer mornings." }],
    items: [{ id: "i1", category: "preference", statement: "I prefer mornings.", reported_basis: "user_statement", evidence_ids: ["s1"], valid_time: { from: null, to: null, description: null }, conflicts_with: [] }],
  })),
  confirmedIds: [], profilePatch: { occupation: "Designer" }, expectedRevision: 4,
});

beforeEach(() => {
  calls.length = 0;
  onBuild = undefined;
  response = { data: receipt, error: null };
  getSession.mockReset().mockResolvedValue({
    data: { session: { user: { id: owner }, access_token: "captured-session-a" } }, error: null,
  });
});

describe("profile import account and request boundary", () => {
  const operations = [
    () => fetchProfileImportSnapshot(owner),
    () => applyProfileContextImport(owner, makeRequest()),
    () => listProfileContextImports(owner),
    () => withdrawProfileContextImport(owner, "batch-1"),
    () => fetchProfileImportedContext(owner, "source-1"),
  ];

  test.each(operations)("an account change never reaches a query or RPC", async (run) => {
    getSession.mockResolvedValue({ data: { session: { user: { id: "owner-b" }, access_token: "session-b" } }, error: null });
    await expect(run()).rejects.toThrow("profile_import_owner_changed");
    expect(calls).toEqual([]);
  });

  test.each([
    { data: { session: null }, error: null },
    { data: { session: { user: { id: owner }, access_token: "" } }, error: null },
    { data: { session: { user: { id: owner }, access_token: "token" } }, error: new Error("auth unavailable") },
  ])("missing credentials or an auth failure cannot fall through to the current session", async (session) => {
    getSession.mockResolvedValue(session);
    await expect(applyProfileContextImport(owner, makeRequest())).rejects.toThrow("profile_import_owner_changed");
    expect(calls).toEqual([]);
  });

  test.each(operations)("Authorization stays pinned if the global account changes while building the query", async (run) => {
    response = { data: receipt, error: null };
    onBuild = () => {
      getSession.mockResolvedValue({ data: { session: { user: { id: "owner-b" }, access_token: "session-b" } }, error: null });
    };
    // Response validation differs by operation, so only transport ownership is asserted here.
    await run().catch(() => undefined);
    expect(getSession).toHaveBeenCalledTimes(1);
    expect(calls.filter(([name]) => name === "setHeader"))
      .toEqual([["setHeader", ["Authorization", "Bearer captured-session-a"]]]);
  });

  test("a retry preserves the request id and exact selected payload without inventing an owner parameter", async () => {
    const request = makeRequest();
    const error = new Error("response interrupted");
    response = { data: null, error };
    await expect(applyProfileContextImport(owner, request)).rejects.toBe(error);
    response = { data: receipt, error: null };
    await expect(applyProfileContextImport(owner, request)).resolves.toEqual(receipt);
    const args = ["apply_profile_context_import", {
      p_request_id: request.requestId, p_document: request.document,
      p_confirmed_ids: [], p_profile_patch: { occupation: "Designer" }, p_expected_revision: 4,
    }];
    expect(calls.filter(([name]) => name === "rpc"))
      .toEqual([["rpc", args], ["rpc", args]]);
  });

  test("invalid or oversized documents are rejected before any session lookup or write", async () => {
    const request = makeRequest();
    request.document.items[0].statement = "a".repeat(801);
    await expect(applyProfileContextImport(owner, request)).rejects.toThrow("profile_context_contract");
    expect(getSession).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });
});

describe("profile import readable context", () => {
  test("reads only the owner's active ledger for the requested source and returns its validated context", async () => {
    const document = makeRequest().document;
    response = { data: { document, confirmed_ids: [] }, error: null };
    await expect(fetchProfileImportedContext(owner, "source-1")).resolves.toEqual({ document, confirmedIds: [] });
    expect(calls).toContainEqual(["select", ["document,confirmed_ids"]]);
    expect(calls.filter(([method]) => method === "eq")).toEqual([
      ["eq", ["user_id", owner]], ["eq", ["source_id", "source-1"]], ["eq", ["status", "active"]],
    ]);
    expect(calls).toContainEqual(["setHeader", ["Authorization", "Bearer captured-session-a"]]);
  });

  test.each([null, {}, { document: { raw: "internal metadata" }, confirmed_ids: [] }])("missing or malformed ledger data cannot become raw text", async (data) => {
    response = { data, error: null };
    await expect(fetchProfileImportedContext(owner, "source-1")).rejects.toThrow();
    expect(calls.filter(([method]) => method === "from")).toEqual([["from", ["profile_context_imports"]]]);
  });

  test.each([null, [7], ["missing"], ["i1", "i1"]].map((confirmed_ids) => ({ confirmed_ids })))("rejects malformed confirmation ids $confirmed_ids", async ({ confirmed_ids }) => {
    response = { data: { document: makeRequest().document, confirmed_ids }, error: null };
    await expect(fetchProfileImportedContext(owner, "source-1")).rejects.toThrow("profile_import_context_invalid");
  });

  test("legacy stored stories retain their actual confirmation state without authorizing new imports", async () => {
    const document = makeRequest().document;
    document.items[0].reported_basis = "assistant_inference";
    response = { data: { document, confirmed_ids: [] }, error: null };
    await expect(fetchProfileImportedContext(owner, "source-1")).resolves.toEqual({ document, confirmedIds: [] });
    response = { data: { document, confirmed_ids: ["i1"] }, error: null };
    await expect(fetchProfileImportedContext(owner, "source-1")).resolves.toEqual({ document, confirmedIds: ["i1"] });
  });

  test("read errors propagate and never trigger another source lookup", async () => {
    const error = new Error("ledger unavailable");
    response = { data: null, error };
    await expect(fetchProfileImportedContext(owner, "source-1")).rejects.toBe(error);
    expect(calls.filter(([method]) => method === "from")).toHaveLength(1);
  });
});

describe("profile snapshot revisions", () => {
  test("loads the owner revision and normalizes only permitted profile fields", async () => {
    response = { data: { profile_details: { occupation: " Designer ", region: "Seoul", extra: "ignored" }, profile_details_revision: "7" }, error: null };
    await expect(fetchProfileImportSnapshot(owner)).resolves.toEqual({ details: { occupation: "Designer", region: "Seoul" }, revision: 7 });
    expect(calls).toContainEqual(["select", ["profile_details,profile_details_revision"]]);
    expect(calls).toContainEqual(["eq", ["id", owner]]);
  });

  test("zero is a valid initial revision", async () => {
    response = { data: { profile_details: {}, profile_details_revision: 0 }, error: null };
    await expect(fetchProfileImportSnapshot(owner)).resolves.toEqual({ details: {}, revision: 0 });
  });

  test.each([null, undefined, "", " ", false, [], {}, -1, 0.5, Number.MAX_SAFE_INTEGER + 1])("rejects a missing or invalid revision %p instead of guessing zero", async (revision) => {
    response = { data: { profile_details: {}, profile_details_revision: revision }, error: null };
    await expect(fetchProfileImportSnapshot(owner)).rejects.toThrow("profile_import_snapshot_missing");
  });

  test("propagates read errors without presenting an empty profile", async () => {
    const error = new Error("read failed");
    response = { data: null, error };
    await expect(fetchProfileImportSnapshot(owner)).rejects.toBe(error);
  });
});

describe("profile import receipts and history", () => {
  test.each([
    null, {}, { id: "batch-1", status: "active" }, { ...receipt, id: "" },
    { ...receipt, item_count: "1" }, { ...receipt, item_count: 0 },
    { ...receipt, profile_change_count: -1 }, { ...receipt, created_at: "bad date" },
    { ...receipt, source_id: 10 }, { ...receipt, status: "withdrawn" },
  ])("never reports an invalid apply receipt as success", async (data) => {
    response = { data, error: null };
    await expect(applyProfileContextImport(owner, makeRequest())).rejects.toThrow("profile_import_result_invalid");
  });

  test("withdraws only the selected batch and accepts its complete receipt", async () => {
    const withdrawn = { ...receipt, status: "withdrawn", source_id: null, profile_restored: true };
    response = { data: withdrawn, error: null };
    await expect(withdrawProfileContextImport(owner, "batch-1")).resolves.toEqual(withdrawn);
    expect(calls).toContainEqual(["rpc", ["withdraw_profile_context_import", { p_batch_id: "batch-1" }]]);
  });

  test.each([null, { status: "withdrawn" }, receipt])("does not report an incomplete withdrawal", async (data) => {
    response = { data, error: null };
    await expect(withdrawProfileContextImport(owner, "batch-1")).rejects.toThrow("profile_import_withdrawal_incomplete");
  });

  test("propagates withdrawal errors", async () => {
    const error = new Error("withdrawal failed");
    response = { data: null, error };
    await expect(withdrawProfileContextImport(owner, "batch-1")).rejects.toBe(error);
  });

  test("reads owner-scoped history in descending pages and adds a cursor only when supplied", async () => {
    response = { data: [receipt], error: null };
    await expect(listProfileContextImports(owner)).resolves.toEqual([receipt]);
    expect(calls).toContainEqual(["from", ["profile_context_imports"]]);
    expect(calls).toContainEqual(["eq", ["user_id", owner]]);
    expect(calls).toContainEqual(["order", ["created_at", { ascending: false }]]);
    expect(calls).toContainEqual(["limit", [30]]);
    expect(calls.some(([name]) => name === "lt")).toBe(false);
    calls.length = 0;
    response = { data: [], error: null };
    await expect(listProfileContextImports(owner, { ...receipt, id: "26101042-0000-4000-8000-000000000001" })).resolves.toEqual([]);
    expect(calls).toContainEqual(["order", ["id", { ascending: false }]]);
    expect(calls).toContainEqual(["or", [`created_at.lt.${receipt.created_at},and(created_at.eq.${receipt.created_at},id.lt.26101042-0000-4000-8000-000000000001)`]]);
  });

  test.each([{}, [receipt, { status: "active" }]])("rejects malformed history rather than silently hiding rows", async (data) => {
    response = { data, error: null };
    await expect(listProfileContextImports(owner)).rejects.toThrow("profile_import_result_invalid");
  });

  test("history errors remain errors rather than an empty history", async () => {
    const error = new Error("history unavailable");
    response = { data: null, error };
    await expect(listProfileContextImports(owner)).rejects.toBe(error);
  });
});


test.each([
  { created_at: "2026-10-10T00:00:00Z),id.gt.any", id: "26101042-0000-4000-8000-000000000001" },
  { created_at: "2026-10-10T00:00:00Z", id: "bad),user_id.neq.owner" },
])("rejects cursor filter injection before transport", async (cursor) => {
  await expect(listProfileContextImports(owner, cursor)).rejects.toThrow("profile_import_cursor_invalid");
  expect(calls).toEqual([]);
});
