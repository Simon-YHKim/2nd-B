// GDPR Art.20 export contract: the client helper must invoke export-account with an
// empty body (IDOR-safe: the function derives the user from the JWT, never the body),
// validate the bundle shape, and build a stable download filename.

jest.mock("../../supabase/client", () => {
  const invoke = jest.fn().mockResolvedValue({
    data: {
      kind: "2nd-b-account-export",
      schema_version: 1,
      exported_at: "2026-06-14T13:45:00.000Z",
      user_id: "u1",
      tables: {},
      storage: [],
      excluded: {},
      errors: {},
    },
    error: null,
  });
  return {
    getSupabaseClient: () => ({ functions: { invoke } }),
    __invoke: invoke,
    __reset: () => invoke.mockClear(),
  };
});

import { requestAccountExport, buildExportFilename } from "../export";
import * as exportHelpers from "../export";

const clientMock = require("../../supabase/client") as { __invoke: jest.Mock; __reset: () => void };

describe("requestAccountExport (GDPR Art.20 portability)", () => {
  beforeEach(() => clientMock.__reset());

  test("invokes export-account with an empty body and returns the bundle", async () => {
    const out = await requestAccountExport();
    expect(clientMock.__invoke).toHaveBeenCalledWith("export-account", { body: {} });
    expect(out.kind).toBe("2nd-b-account-export");
  });

  test("throws when the function reports an error", async () => {
    clientMock.__invoke.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    await expect(requestAccountExport()).rejects.toBeDefined();
  });

  test("throws when the payload is not an export bundle", async () => {
    clientMock.__invoke.mockResolvedValueOnce({ data: { foo: 1 }, error: null });
    await expect(requestAccountExport()).rejects.toThrow();
  });
});

const bundle = () => ({
  kind: "2nd-b-account-export", schema_version: 1,
  exported_at: "2026-06-14T13:45:00.000Z", user_id: "u1",
  tables: { users: { id: "u1" }, records: [] }, storage: [], excluded: {}, errors: {},
});

describe("reported export scope, not a complete-account guarantee", () => {
  test.each([
    // kind 는 "이게 우리 내보내기가 맞나" 의 첫 관문인데 그것만 틀린 봉투가
    // 이 목록에 없었다. 변이 검증이 그 구멍을 찾아냈다: 검증에서 kind 검사를
    // 지워도 스위트가 통과했다.
    { kind: "someone-elses-export" }, { kind: "" },
    { schema_version: 2 }, { exported_at: "invalid" }, { user_id: "" },
    { tables: [] }, { storage: null }, { excluded: null }, { errors: undefined },
    { errors: { records: 5 } }, { storage: [{ path: "a" }] },
    { storage: [{ path: "a", markdown: "ok", error: "failed" }] },
  ])("rejects an unrecognised or malformed envelope: %j", async (change) => {
    clientMock.__invoke.mockResolvedValueOnce({ data: { ...bundle(), ...change }, error: null });
    await expect(requestAccountExport()).rejects.toThrow();
  });

  test("an expected owner is a local response guard, never a request-body selector", async () => {
    clientMock.__invoke.mockResolvedValueOnce({ data: bundle(), error: null });
    const request = requestAccountExport as (owner?: string) => ReturnType<typeof requestAccountExport>;
    await expect(request("u2")).rejects.toThrow();
    expect(clientMock.__invoke).toHaveBeenLastCalledWith("export-account", { body: {} });
  });

  const summarize = (data: unknown) => (exportHelpers as unknown as {
    summarizeAccountExport: (value: unknown) => unknown;
  }).summarizeAccountExport(data);

  test("empty collections and declared exclusions are not fetch failures", () => {
    expect(summarize({ ...bundle(), excluded: { audit: "separate scope" } })).toEqual({
      tableCount: 2, fileCount: 0, failedItems: 0, excludedCategories: 1,
    });
  });

  test("storage-only and table errors both make the prepared bundle partial", () => {
    expect(summarize({ ...bundle(), errors: { records: "export_table_failed" },
      storage: [{ path: "a", markdown: "" }, { path: "b", error: "download_failed" }],
    })).toEqual({ tableCount: 2, fileCount: 1, failedItems: 2, excludedCategories: 0 });
  });
});

describe("buildExportFilename", () => {
  test("builds a sortable timestamped filename", () => {
    expect(buildExportFilename("2026-06-14T13:45:00.000Z")).toBe("2nd-brain-data-20260614-134500.json");
  });

  test("falls back on a malformed timestamp", () => {
    expect(buildExportFilename("nonsense")).toBe("2nd-brain-data-export.json");
  });
});
