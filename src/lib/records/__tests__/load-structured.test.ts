// Execute the real reader, structured parser and account lease. Only the query
// transport/auth response are controlled so each read boundary can be suspended.
const mockQuery = jest.fn();
const mockGetSession = jest.fn();
const mockFrom = jest.fn();
const mockSelect = jest.fn();
const mockEq = jest.fn();
const mockNot = jest.fn();
const mockOrder = jest.fn();

jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({ from: mockFrom, auth: { getSession: mockGetSession } }),
}));

import { loadStructuredContext } from "../load-structured";
import { beginAccountSessionLease, type AuthenticatedAccountSessionLease } from "../../auth/account-session-lease";
import { __resetAccountEpochForTests, noteResolvedOwner, clearAccountTransition, currentAccountEpoch, beginAccountOwnerTransition } from "../../auth/account-epoch";
import { abortError } from "../../async/abort";

const payload = () => ({ form: "fourw", version: 1, fields: { what: "원본 내용" } });
const row = () => ({ topic: "운동", created_at: "2026-05-25T23:00:00.000Z", structured: payload() });
const sessions: AuthenticatedAccountSessionLease[] = [];
function owner(id: string) { noteResolvedOwner(id); clearAccountTransition(currentAccountEpoch()); }
async function session() {
  const result = await beginAccountSessionLease("u1").authenticate(); sessions.push(result); return result;
}
function invalidate(cap: AuthenticatedAccountSessionLease, cause: "abort" | "hold" | "aba" | "release") {
  if (cause === "abort") cap.abort();
  else if (cause === "release") cap.release();
  else if (cause === "hold") beginAccountOwnerTransition(null);
  else { owner("other"); owner("u1"); }
}
function pending<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  jest.resetAllMocks(); __resetAccountEpochForTests(); owner("u1");
  mockGetSession.mockResolvedValue({ data: { session: { user: { id: "u1" }, access_token: "original-test-token" } }, error: null });
  const chain = { select: mockSelect, eq: mockEq, not: mockNot, order: mockOrder, limit: mockQuery };
  for (const fn of [mockFrom, mockSelect, mockEq, mockNot, mockOrder]) fn.mockReturnValue(chain);
  mockQuery.mockResolvedValue({ data: [row()], error: null });
});
afterEach(() => { for (const cap of sessions.splice(0)) cap.release(); });

it("dates legacy context by KST rather than raw UTC and uses the actual structured parser", async () => {
  const out = await loadStructuredContext("u1", 5);
  expect(out).toBe("운동 · 2026-05-26\n[form:fourw]\nwhat: 원본 내용");
  expect(out).not.toContain("2026-05-25");
});

it("keeps the owner-filtered query, requested limit, original formatting and one original authentication", async () => {
  const legacy = await loadStructuredContext("u1", 3);
  const cap = await session();
  expect(await loadStructuredContext("u1", 3, cap)).toBe(legacy);
  expect(mockFrom).toHaveBeenLastCalledWith("records_ai_eligible");
  expect(mockSelect).toHaveBeenLastCalledWith("topic, created_at, structured");
  expect(mockEq).toHaveBeenLastCalledWith("user_id", "u1");
  expect(mockNot).toHaveBeenLastCalledWith("structured", "is", null);
  expect(mockOrder).toHaveBeenLastCalledWith("created_at", { ascending: false });
  expect(mockQuery).toHaveBeenLastCalledWith(3);
  expect(mockGetSession).toHaveBeenCalledTimes(1);
});

it.each(["empty", "null", "query-error", "reject", "malformed-result", "invalid-payload", "parse-error"])("ordinary %s keeps both legacy and captured empty fallback", async cause => {
  const cap = await session();
  if (cause === "reject") mockQuery.mockRejectedValue(new Error("ordinary query failure"));
  else if (cause === "malformed-result") mockQuery.mockResolvedValue(undefined);
  else if (cause === "parse-error") mockQuery.mockResolvedValue({ data: [{ ...row(), structured: { get form() { throw new Error("bad field"); } } }], error: null });
  else mockQuery.mockResolvedValue({ data: cause === "null" ? null : cause === "empty" ? [] : [{ ...row(), structured: { form: "unknown" } }],
    error: cause === "query-error" ? { message: "query failed" } : null });
  await expect(loadStructuredContext("u1")).resolves.toBe("");
  await expect(loadStructuredContext("u1", 5, cap)).resolves.toBe("");
});

it("skips invalid payloads and preserves valid records with missing date/topic", async () => {
  mockQuery.mockResolvedValue({ data: [{ ...row(), structured: null }, { topic: null, created_at: "invalid", structured: payload() }], error: null });
  const cap = await session();
  await expect(loadStructuredContext("u1", 5, cap)).resolves.toBe("[form:fourw]\nwhat: 원본 내용");
});

it.each(["other", ""])("mismatched or missing owner %s cannot begin a read", async userId => {
  const cap = await session();
  await expect(loadStructuredContext(userId, 5, cap)).rejects.toThrow("context_session_owner_mismatch");
  expect(mockFrom).not.toHaveBeenCalled(); expect(mockQuery).not.toHaveBeenCalled();
});

it.each(["abort", "hold", "aba", "release"] as const)("%s before entry stops query initiation", async cause => {
  const cap = await session(); invalidate(cap, cause);
  await expect(loadStructuredContext("u1", 5, cap)).rejects.toMatchObject({ name: "AbortError" });
  expect(mockFrom).not.toHaveBeenCalled(); expect(mockQuery).not.toHaveBeenCalled();
});

it.each(["abort", "hold", "aba"] as const)("late success after %s never returns old context", async cause => {
  const cap = await session(); const wait = pending<{ data: ReturnType<typeof row>[]; error: null }>();
  mockQuery.mockReturnValue(wait.promise);
  const result = loadStructuredContext("u1", 5, cap); const rejection = expect(result).rejects.toMatchObject({ name: "AbortError" });
  expect(mockQuery).toHaveBeenCalledTimes(1);
  invalidate(cap, cause); wait.resolve({ data: [row()], error: null }); await rejection;
  expect(mockQuery).toHaveBeenCalledTimes(1); expect(mockGetSession).toHaveBeenCalledTimes(1);
});

it.each(["abort", "hold", "aba"] as const)("ordinary rejection after %s cannot disguise cancellation as empty context", async cause => {
  const cap = await session(); const wait = pending<never>(); mockQuery.mockReturnValue(wait.promise);
  const result = loadStructuredContext("u1", 5, cap); const rejection = expect(result).rejects.toMatchObject({ name: "AbortError" });
  invalidate(cap, cause); wait.reject(new Error("ordinary network error")); await rejection;
  expect(mockQuery).toHaveBeenCalledTimes(1); expect(mockGetSession).toHaveBeenCalledTimes(1);
});

it.each(["reject", "returned-error"])("query AbortError via %s is preserved for captured callers even if their signal is current", async path => {
  const cap = await session(); const error = abortError("query stopped");
  if (path === "reject") mockQuery.mockRejectedValue(error);
  else mockQuery.mockResolvedValue({ data: null, error });
  await expect(loadStructuredContext("u1")).resolves.toBe("");
  await expect(loadStructuredContext("u1", 5, cap)).rejects.toBe(error);
  expect(cap.signal.aborted).toBe(false);
});

it.each([false, true])("owner loss during real parsing (throw=%s) is fenced before context return", async throws => {
  const cap = await session(); const fields = { get what() {
    beginAccountOwnerTransition(null); if (throws) throw new Error("field unavailable"); return "previous owner body";
  } };
  mockQuery.mockResolvedValue({ data: [{ ...row(), structured: { form: "fourw", version: 1, fields } }], error: null });
  await expect(loadStructuredContext("u1", 5, cap)).rejects.toMatchObject({ name: "AbortError" });
});

it("a one-shot execution assertion failure after await is not consumed as an ordinary data failure", async () => {
  const cap = await session(); const failure = new Error("content generation invalidated"); let checks = 0;
  const execution = { userId: cap.userId, signal: cap.signal, assertCurrent() { if (++checks === 2) throw failure; cap.assertCurrent(); } };
  await expect(loadStructuredContext("u1", 5, execution)).rejects.toBe(failure);
});
