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

describe("buildExportFilename", () => {
  test("builds a sortable timestamped filename", () => {
    expect(buildExportFilename("2026-06-14T13:45:00.000Z")).toBe("2nd-brain-data-20260614-134500.json");
  });

  test("falls back on a malformed timestamp", () => {
    expect(buildExportFilename("nonsense")).toBe("2nd-brain-data-export.json");
  });
});
