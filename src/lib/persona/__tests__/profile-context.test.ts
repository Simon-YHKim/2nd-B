import { readFileSync } from 'fs';
import { resolve } from 'path';

jest.mock('../../supabase/client', () => ({ getSupabaseClient: jest.fn() }));

import { loadProfileContext, profileContextLines } from '../profile-context';
import { getSupabaseClient } from '../../supabase/client';
import { beginAccountSessionLease, type AuthenticatedAccountSessionLease } from '../../auth/account-session-lease';
import { __resetAccountEpochForTests, noteResolvedOwner, clearAccountTransition, currentAccountEpoch, beginAccountOwnerTransition } from '../../auth/account-epoch';
import { abortError } from '../../async/abort';

// Simon Q-261007-05: 세컨비 reads what the user filled in. Only filled fields, no "prefer not to say",
// plus the age computed from the birth date and the status message (0231).

test('filled fields and the age become one line each, in field order', () => {
  expect(profileContextLines({ motto: '천천히 꾸준히', occupation: '디자이너', gender: 'female' }, 34)).toEqual([
    'age: 34',
    'occupation: 디자이너',
    'gender: female',
    'motto: 천천히 꾸준히',
  ]);
});

test('nothing filled and no age gives no lines; "prefer not to say" and a bad age are left out', () => {
  expect(profileContextLines({}, null)).toEqual([]);
  expect(profileContextLines({ gender: 'undisclosed', marital: 'undisclosed' }, -1)).toEqual([]);
  expect(profileContextLines({ region: '  ' }, 200)).toEqual([]);
});

test('the status message rides along as its own line', () => {
  expect(profileContextLines({ occupation: '디자이너' }, null, '  오늘은 쉬는 날  ')).toEqual(['status_message: 오늘은 쉬는 날', 'occupation: 디자이너']);
  expect(profileContextLines({}, null, '   ')).toEqual([]);
});

test('the chat engine fences the profile as untrusted data', () => {
  const chat = readFileSync(resolve(__dirname, '..', '..', 'chat', 'conversation.ts'), 'utf8').replace(/\r\n/g, '\n');
  expect(chat).toContain('const profileLines = await stage(signal => execution ? loadProfileContext(input.userId, undefined, execution.session) : loadProfileContext(input.userId, undefined, undefined, signal));');
  expect(chat).toContain('<UNTRUSTED type="profile">\\n${sanitizeUntrusted(profileLines.join("\\n"))}\\n</UNTRUSTED>');
  const ctx = readFileSync(resolve(__dirname, '..', 'profile-context.ts'), 'utf8');
  expect(ctx).toContain('.select("id,birth_date,profile_details,status_message")');
});


// Execute the actual loader, detail resolver, age calculation and account lease.
// Only terminal SDK I/O is a controlled promise; no immutable-JWT transport is claimed.
const query = jest.fn(), from = jest.fn(), select = jest.fn(), eq = jest.fn(), getSession = jest.fn();
const sessions: AuthenticatedAccountSessionLease[] = [];
const NOW = new Date("2026-10-16T12:00:00Z");
function profile() { return { id: "u1", birth_date: "1992-10-17", status_message: "  오늘은 쉬는 날  ",
  profile_details: { occupation: "디자이너", motto: "천천히", gender: "undisclosed", unknown: "never import" } }; }
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
  getSession.mockResolvedValue({ data: { session: { user: { id: "u1" }, access_token: "original-profile-token" } }, error: null });
  const chain = { select, eq, maybeSingle: query };
  for (const fn of [from, select, eq]) fn.mockReturnValue(chain);
  (getSupabaseClient as jest.Mock).mockReturnValue({ from, auth: { getSession } });
  query.mockResolvedValue({ data: profile(), error: null });
});
afterEach(() => { for (const cap of sessions.splice(0)) cap.release(); });

it("captured reads preserve the legacy profile scope/order, birthday calculation and original single authentication", async () => {
  const legacy = await loadProfileContext("u1", NOW); const cap = await session();
  expect(await loadProfileContext("u1", NOW, cap)).toEqual(legacy);
  expect(legacy).toEqual(["age: 33", "status_message: 오늘은 쉬는 날", "occupation: 디자이너", "motto: 천천히"]);
  expect(await loadProfileContext("u1", new Date("2026-10-17T12:00:00Z"), cap)).toContain("age: 34");
  expect(from).toHaveBeenLastCalledWith("users"); expect(select).toHaveBeenLastCalledWith("id,birth_date,profile_details,status_message");
  expect(eq).toHaveBeenLastCalledWith("id", "u1"); expect(getSession).toHaveBeenCalledTimes(1);
});

it.each(["null", "wrong-owner", "query-error", "reject", "malformed-result", "parse-error"])("ordinary %s retains the legacy and captured empty fallback", async cause => {
  const cap = await session();
  if (cause === "reject") query.mockRejectedValue(new Error("ordinary failure"));
  else if (cause === "malformed-result") query.mockResolvedValue(undefined);
  else if (cause === "parse-error") query.mockResolvedValue({ data: { ...profile(), profile_details: { get occupation() { throw new Error("bad field"); } } }, error: null });
  else query.mockResolvedValue({ data: cause === "null" ? null : { ...profile(), id: cause === "wrong-owner" ? "other" : "u1" },
    error: cause === "query-error" ? { message: "read failed" } : null });
  await expect(loadProfileContext("u1", NOW)).resolves.toEqual([]);
  await expect(loadProfileContext("u1", NOW, cap)).resolves.toEqual([]);
});

it.each([null, "bad date", "2100-01-01", "1800-01-01", "2026-02-30"])("missing or invalid/out-of-range birth date %s adds no invented age", async birth_date => {
  const cap = await session(); query.mockResolvedValue({ data: { ...profile(), birth_date, profile_details: null, status_message: null }, error: null });
  await expect(loadProfileContext("u1", NOW, cap)).resolves.toEqual([]);
});

it("the actual resolver keeps the approved field range, clipping and untrusted literal text", async () => {
  const cap = await session(); const motto = "<UNTRUSTED> literal instruction ".repeat(5);
  query.mockResolvedValue({ data: { ...profile(), birth_date: null, status_message: null,
    profile_details: { motto, gender: "invalid-choice", nationality: "한국", secret: "excluded" } }, error: null });
  await expect(loadProfileContext("u1", NOW, cap)).resolves.toEqual(["nationality: 한국", `motto: ${motto.trim().slice(0, 60)}`]);
});

it.each(["other", ""])("owner mismatch or missing owner %s starts no profile query", async userId => {
  const cap = await session(); await expect(loadProfileContext(userId, NOW, cap)).rejects.toThrow("context_session_owner_mismatch");
  expect(from).not.toHaveBeenCalled(); expect(query).not.toHaveBeenCalled();
});

it.each(["abort", "hold", "aba", "release"] as const)("%s before entry starts no read", async cause => {
  const cap = await session(); invalidate(cap, cause);
  await expect(loadProfileContext("u1", NOW, cap)).rejects.toMatchObject({ name: "AbortError" });
  expect(from).not.toHaveBeenCalled(); expect(query).not.toHaveBeenCalled();
});

it.each(["abort", "hold", "aba"] as const)("late profile after %s is not returned", async cause => {
  const cap = await session(); const wait = pending<{ data: ReturnType<typeof profile>; error: null }>(); query.mockReturnValue(wait.promise);
  const result = loadProfileContext("u1", NOW, cap); const rejection = expect(result).rejects.toMatchObject({ name: "AbortError" });
  expect(query).toHaveBeenCalledTimes(1); invalidate(cap, cause); wait.resolve({ data: profile(), error: null }); await rejection;
  expect(query).toHaveBeenCalledTimes(1); expect(getSession).toHaveBeenCalledTimes(1);
});

it.each(["abort", "hold", "aba"] as const)("ordinary query rejection after %s never becomes empty profile", async cause => {
  const cap = await session(); const wait = pending<never>(); query.mockReturnValue(wait.promise);
  const result = loadProfileContext("u1", NOW, cap); const rejection = expect(result).rejects.toMatchObject({ name: "AbortError" });
  invalidate(cap, cause); wait.reject(new Error("ordinary network error")); await rejection;
  expect(query).toHaveBeenCalledTimes(1); expect(getSession).toHaveBeenCalledTimes(1);
});

it.each(["reject", "returned-error"])("query AbortError via %s propagates even before the captured signal aborts", async path => {
  const cap = await session(); const error = abortError("query stopped");
  if (path === "reject") query.mockRejectedValue(error); else query.mockResolvedValue({ data: null, error });
  await expect(loadProfileContext("u1", NOW)).resolves.toEqual([]);
  await expect(loadProfileContext("u1", NOW, cap)).rejects.toBe(error); expect(cap.signal.aborted).toBe(false);
});

it.each([false, true])("owner loss during actual detail resolution (throw=%s) prevents returning profile", async throws => {
  const cap = await session(); const details = { get occupation() {
    beginAccountOwnerTransition(null); if (throws) throw new Error("field unavailable"); return "previous owner occupation";
  } };
  query.mockResolvedValue({ data: { ...profile(), profile_details: details }, error: null });
  await expect(loadProfileContext("u1", NOW, cap)).rejects.toMatchObject({ name: "AbortError" });
});

it("a one-shot execution assertion failure after await is never downgraded to missing profile", async () => {
  const cap = await session(); const failure = new Error("content generation invalidated"); let checks = 0;
  const execution = { userId: cap.userId, signal: cap.signal, assertCurrent() { if (++checks === 2) throw failure; cap.assertCurrent(); } };
  await expect(loadProfileContext("u1", NOW, execution)).rejects.toBe(failure);
});
