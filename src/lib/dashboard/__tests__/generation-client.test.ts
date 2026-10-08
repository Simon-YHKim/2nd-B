let mockCurrent = true;
const mockAbort = jest.fn(); const mockRelease = jest.fn(); const mockInvoke = jest.fn();
jest.mock("../../auth/account-epoch", () => ({
  captureAccountOwnerLease: () => ({ isCurrent: () => mockCurrent }), subscribeAccountTransition: () => () => undefined,
}));
jest.mock("../../auth/account-session-lease", () => ({ beginAccountSessionLease: () => ({
  authenticate: async () => ({ accessToken: "captured-owner-token", signal: new AbortController().signal, assertCurrent: () => undefined }),
  abort: mockAbort, release: mockRelease,
}) }));
jest.mock("../../supabase/captured-session-client", () => ({ invokeFunctionWithCapturedSession: (...args: unknown[]) => mockInvoke(...args) }));
import { beginPrivacyChange, resetPrivacyChangesForTests } from "../../privacy/changes";
let request: typeof import("../generation-client").requestBoardGeneration;
const note = { slot: "morning", line: "Read", basis_refs: [{ kind: "routine", id: "r" }], reminder_suggestions: [] };
const reply = { data: { kind: "ready", purpose: "daily_note", value: note }, error: null };
beforeAll(() => {
  process.env.EXPO_PUBLIC_DASHBOARD_GENERATION = "true";
  request = require("../generation-client").requestBoardGeneration;
  delete process.env.EXPO_PUBLIC_DASHBOARD_GENERATION;
});
beforeEach(() => { mockCurrent = true; mockInvoke.mockReset(); mockAbort.mockClear(); mockRelease.mockClear(); resetPrivacyChangesForTests(); });
test("only intent and time settings leave the device, using a captured token", async () => {
  mockInvoke.mockResolvedValue(reply); expect((await request("owner", "open", "ko-KR")).ok).toBe(true);
  expect(mockInvoke).toHaveBeenCalledWith("dashboard-generate", "captured-owner-token", expect.objectContaining({ body: { action: "open", timeZone: expect.any(String), locale: "ko" } }));
  expect(mockRelease).toHaveBeenCalledTimes(1);
});
test("a late account response cannot become the next user's board", async () => {
  let finish!: (value: typeof reply) => void;
  mockInvoke.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const pending = request("owner", "open", "ko"); await Promise.resolve(); mockCurrent = false; finish(reply);
  expect((await pending).ok).toBe(false); expect(mockRelease).toHaveBeenCalledTimes(1);
});
test("immediate withdrawal cancels pending work and cannot be overtaken by its response", async () => {
  let finish!: (value: typeof reply) => void;
  mockInvoke.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const pending = request("owner", "summary", "ko"); await Promise.resolve();
  beginPrivacyChange("owner", { recommendations: false }); finish(reply);
  expect(mockAbort).toHaveBeenCalled(); expect((await pending).ok).toBe(false);
  await request("owner", "open", "ko"); expect(mockInvoke).toHaveBeenCalledTimes(1);
});
test("unavailable server returns no fallback model call or unchecked text", async () => {
  mockInvoke.mockRejectedValue(new Error("private")); expect((await request("owner", "open", "en")).ok).toBe(false);
  expect(mockInvoke).toHaveBeenCalledTimes(1); expect(mockRelease).toHaveBeenCalledTimes(1);
});
test.each(["empty", "denied", "busy", "limited", "disabled", "unavailable"])("preserves the server's %s state without reflecting text", async (kind) => {
  mockInvoke.mockResolvedValue({ data: { kind, message: "unchecked private prose" }, error: null });
  expect(await request("owner", "open", "ko")).toEqual({ ok: false, reason: kind });
});
test("a response for another seat cannot populate the requested card", async () => {
  mockInvoke.mockResolvedValue(reply);
  expect((await request("owner", "triage", "ko")).ok).toBe(false);
});
