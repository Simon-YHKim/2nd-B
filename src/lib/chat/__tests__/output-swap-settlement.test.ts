const mockSession = jest.fn();
jest.mock("../../supabase/client", () => ({ getSupabaseClient: () => ({ auth: { getSession: mockSession } }) }));
jest.mock("../../env", () => ({ getEnv: () => ({ EXPO_PUBLIC_SUPABASE_URL: "https://fixture.invalid", EXPO_PUBLIC_SUPABASE_ANON_KEY: "public-fixture" }) }));

import { createSwapSettlement } from "../output-swap-settlement";
import { canUseSwapUsage, createSwapCandidate, isRefundCount, swapCandidateKey, type SwapCandidate } from "../output-swap-state";
import { __resetAccountEpochForTests, captureAccountOwnerLease, noteResolvedOwner } from "../../auth/account-epoch";
import type { LlmResult } from "../../llm/types";

const TURN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const AUDIT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SECOND = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const NOW = new Date("2026-10-22T03:00:00Z");
function candidate(auditId = AUDIT, attemptId = 1): SwapCandidate {
  return { reservationId: TURN, auditId, ticket: { ownerId: "owner-a", ownerEpoch: captureAccountOwnerLease("owner-a")!.epoch,
    conversationId: "conversation-1", pairId: "pair-1", generation: 1, attemptId, day: "2026-10-22" } };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const reply = (outputSwap: LlmResult["outputSwap"], zone = "red") => ({ text: "fixed guidance", safety: { zone }, audit: {}, outputSwap } as LlmResult);
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const manager = () => createSwapSettlement(captureAccountOwnerLease("owner-a")!);
const flush = async () => { for (let i = 0; i < 60; i++) await Promise.resolve(); };
const rpcCalls = () => jest.mocked(fetch).mock.calls.filter(([url]) => String(url).includes("/rpc/"));
const reads = () => jest.mocked(fetch).mock.calls.filter(([url]) => String(url).includes("/chat_usage?"));

beforeEach(() => {
  jest.useFakeTimers(); jest.setSystemTime(NOW);
  __resetAccountEpochForTests(); noteResolvedOwner("owner-a");
  mockSession.mockReset().mockResolvedValue({ data: { session: { user: { id: "owner-a" }, access_token: "fixture-session-a" } }, error: null });
  jest.spyOn(globalThis, "fetch").mockImplementation(async url => String(url).includes("/rpc/") ? json(0) : json([{ count: 0, ad_bonus: 2 }]));
});
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

test("only matching reservation output swaps create immutable per-attempt candidates", () => {
  const c = candidate(), receipt = { count: 5, turnId: TURN }, evidence = { auditId: AUDIT, reservationId: TURN };
  expect(createSwapCandidate(c.ticket, receipt, reply(evidence))).toEqual(c);
  expect(createSwapCandidate(c.ticket, receipt, reply(undefined))).toBeNull();
  expect(createSwapCandidate(c.ticket, receipt, reply(evidence, "green"))).toBeNull();
  expect(createSwapCandidate(c.ticket, { ...receipt, turnId: null }, reply(evidence))).toBeNull();
  expect(createSwapCandidate(c.ticket, receipt, reply({ ...evidence, reservationId: SECOND }))).toBeNull();
  const ticket = { ...c.ticket };
  const frozen = createSwapCandidate(ticket, receipt, reply(evidence))!;
  ticket.attemptId = 9;
  expect(frozen.ticket.attemptId).toBe(1);
  expect(swapCandidateKey(frozen)).not.toBe(swapCandidateKey(candidate(SECOND, 2)));
});

test.each([0, 1, 2_147_483_647])("accepts SQL int %s including zero, reads the counted day with the captured session", async count => {
  jest.mocked(fetch).mockResolvedValueOnce(json(count));
  const m = manager();
  expect(await m.start(candidate())).toMatchObject({ status: "confirmed", refundedCount: count, calls: 1 });
  expect(rpcCalls()[0]).toEqual(["https://fixture.invalid/rest/v1/rpc/refund_chat_turn_after_output_swap", expect.objectContaining({
    body: JSON.stringify({ p_audit_id: AUDIT }), headers: expect.objectContaining({ Authorization: "Bearer fixture-session-a" }),
  })]);
  expect(reads()[0][0]).toContain("user_id=eq.owner-a&day=eq.2026-10-22");
  expect(reads()[0][1]?.headers).toMatchObject({ Authorization: "Bearer fixture-session-a" });
  expect(m.readUsage()).toMatchObject({ used: 0, adBonus: 2, day: "2026-10-22" });
  expect(mockSession).toHaveBeenCalledTimes(1);
});

test.each([-1, 0.5, 2_147_483_648, "0", {}, undefined, NaN, Infinity])("rejects malformed refund count %p", async value => {
  expect(isRefundCount(value)).toBe(false);
  const response = json({});
  jest.spyOn(response, "json").mockResolvedValue(value);
  jest.mocked(fetch).mockResolvedValueOnce(response);
  const result = await manager().start(candidate());
  expect(result.status).toBe("unresolved");
  expect(result).not.toHaveProperty("refundedCount");
});

test("NULL is unresolved, retries only once with the same audit, and cannot consume the reask", async () => {
  jest.mocked(fetch).mockImplementation(async (url, options) => String(url).includes("/rpc/")
    ? json(JSON.parse(String(options?.body)).p_audit_id === AUDIT ? null : 0) : json([{ count: 0, ad_bonus: 2 }]));
  const m = manager(), first = m.start(candidate());
  const duplicate = m.start(candidate());
  await jest.advanceTimersByTimeAsync(250);
  expect(await first).toMatchObject({ status: "unresolved", calls: 2 });
  expect(await duplicate).toEqual(await first);
  expect(await m.start(candidate(SECOND, 2))).toMatchObject({ status: "confirmed", calls: 1 });
  expect(rpcCalls().map(([, args]) => JSON.parse(String(args?.body)))).toEqual([
    { p_audit_id: AUDIT }, { p_audit_id: AUDIT }, { p_audit_id: SECOND },
  ]);
  expect(m.read().map(s => s.status)).toEqual(["unresolved", "confirmed"]);
});

test.each(["serialization", "mixed"])("%s retries have a finite budget and one audit ID", async kind => {
  let calls = 0;
  jest.mocked(fetch).mockImplementation(async url => {
    if (!String(url).includes("/rpc/")) return json([]);
    calls++;
    return kind === "mixed" && calls % 2 === 1 ? json(null) : json({ code: "40001" }, 500);
  });
  const pending = manager().start(candidate());
  await jest.advanceTimersByTimeAsync(3_000);
  expect(rpcCalls()).toHaveLength(3);
  expect(await pending).toMatchObject({ status: "unresolved", calls: 3 });
  expect(rpcCalls().every(([, args]) => args?.body === JSON.stringify({ p_audit_id: AUDIT }))).toBe(true);
});

test("two serialization retries and one NULL retry may succeed on call four", async () => {
  jest.mocked(fetch).mockResolvedValueOnce(json({ code: "40001" }, 500)).mockResolvedValueOnce(json(null))
    .mockResolvedValueOnce(json({ code: "40001" }, 500)).mockResolvedValueOnce(json(0));
  const pending = manager().start(candidate());
  await jest.advanceTimersByTimeAsync(750);
  expect(await pending).toMatchObject({ status: "confirmed", calls: 4 });
});

test.each(["network", "permission", "bad-error"])("%s failure is not retried and reads authoritative usage", async kind => {
  if (kind === "network") jest.mocked(fetch).mockRejectedValueOnce(new Error("offline"));
  else jest.mocked(fetch).mockResolvedValueOnce(kind === "permission" ? json({ code: "42501" }, 403) : new Response("bad", { status: 500 }));
  const m = manager();
  expect(await m.start(candidate())).toMatchObject({ status: "unresolved", calls: 1 });
  expect(reads()).toHaveLength(1);
  expect(m.readUsage()?.used).toBe(0);
});

test.each(["before", "authentication", "retry", "read"])("account epoch fences %s, including A -> B -> A", async point => {
  const m = manager(), c = candidate(), gate = deferred<Response>(), auth = deferred<unknown>();
  if (point === "authentication") mockSession.mockReturnValueOnce(auth.promise);
  if (point === "retry") jest.mocked(fetch).mockResolvedValueOnce(json(null));
  if (point === "read") jest.mocked(fetch).mockResolvedValueOnce(json(0)).mockReturnValueOnce(gate.promise);
  if (point === "before") { noteResolvedOwner("owner-b"); noteResolvedOwner("owner-a"); }
  const pending = m.start(c);
  await flush();
  if (point !== "before") { noteResolvedOwner("owner-b"); noteResolvedOwner("owner-a"); }
  auth.resolve({ data: { session: { user: { id: "owner-a" }, access_token: "fixture-new-session" } }, error: null });
  gate.resolve(json([{ count: 0, ad_bonus: 0 }]));
  await jest.advanceTimersByTimeAsync(250);
  expect(await pending).toEqual({ status: "stale" });
  expect(rpcCalls()).toHaveLength(point === "read" || point === "retry" ? 1 : 0);
  expect(m.readUsage()).toBeNull();
});

test.each(["authenticate", "refund", "read"])("deadline during %s ends the job and late completion causes no more I/O or publication", async point => {
  const gate = deferred<Response>(), auth = deferred<unknown>(), m = manager();
  if (point === "authenticate") mockSession.mockReturnValueOnce(auth.promise);
  else if (point === "refund") jest.mocked(fetch).mockReturnValueOnce(gate.promise);
  else jest.mocked(fetch).mockResolvedValueOnce(json(0)).mockReturnValueOnce(gate.promise);
  const pending = m.start(candidate());
  await jest.advanceTimersByTimeAsync(8_000);
  expect(await pending).toMatchObject(point === "read" ? { status: "confirmed", refundedCount: 0 } : { status: "expired" });
  if (point !== "authenticate") {
    const request = point === "refund" ? rpcCalls()[0] : reads()[0];
    expect(request[1]?.signal?.aborted).toBe(true);
  }
  const calls = jest.mocked(fetch).mock.calls.length;
  auth.resolve({ data: { session: { user: { id: "owner-a" }, access_token: "fixture-session-a" } }, error: null });
  gate.resolve(point === "refund" ? json(null) : json([{ count: 0, ad_bonus: 2 }]));
  await jest.advanceTimersByTimeAsync(1_000);
  expect(fetch).toHaveBeenCalledTimes(calls);
  expect(m.readUsage()).toBeNull();
  expect(m.read()[0].status).toBe(point === "read" ? "confirmed" : "expired");
});

test.each(["switch", "return"])("B1 settlement accessors hide completed records and usage after owner %s", async change => {
  const m = manager(), c = candidate();
  await m.start(c);
  expect(m.read()).toHaveLength(1);
  expect(m.readUsage()).toMatchObject({ used: 0, adBonus: 2 });
  noteResolvedOwner("owner-b");
  if (change === "return") noteResolvedOwner("owner-a");
  expect(m.read()).toEqual([]);
  expect(m.readUsage()).toBeNull();
  expect(await m.start(c)).toEqual({ status: "stale" });
  expect(rpcCalls()).toHaveLength(1);
});

test.each(["ownerId", "ownerEpoch"])("B1 rejects a candidate with a different %s before authentication or I/O", async field => {
  const m = manager(), c = candidate();
  const ticket = { ...c.ticket, [field]: field === "ownerId" ? "owner-b" : c.ticket.ownerEpoch + 1 };
  expect(await m.start({ ...c, ticket })).toEqual({ status: "stale" });
  expect(m.read()).toEqual([]);
  expect(mockSession).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  expect(m.readUsage()).toBeNull();
  await m.start(c);
  expect(m.read()).toEqual([expect.objectContaining({ candidate: c, status: "confirmed" })]);
});

test.each(["refund", "read"])("B1 initial and duplicate promises redact after visibility changes during %s without losing confirmation", async point => {
  const owner = captureAccountOwnerLease("owner-a")!;
  let visible = true;
  const m = createSwapSettlement({ ...owner, isCurrent: () => visible && owner.isCurrent() });
  const c = candidate(), gate = deferred<Response>();
  if (point === "read") jest.mocked(fetch).mockResolvedValueOnce(json(3));
  jest.mocked(fetch).mockReturnValueOnce(gate.promise);
  const pending = m.start(c), duplicate = m.start(c);
  await flush();
  expect(point === "refund" ? rpcCalls() : reads()).toHaveLength(1);
  visible = false;
  gate.resolve(point === "refund" ? json(3) : json([{ count: 3, ad_bonus: 2 }]));
  expect(await pending).toEqual({ status: "stale" });
  expect(await duplicate).toEqual({ status: "stale" });
  expect(await m.start(c)).toEqual({ status: "stale" });
  expect(m.read()).toEqual([]);
  // Only the same owner AND epoch may see the retained record again.
  visible = true;
  expect(m.read()).toEqual([expect.objectContaining({ candidate: c, status: "confirmed", refundedCount: 3, calls: 1 })]);
  expect(m.readUsage()).toBeNull();
  expect(rpcCalls()).toHaveLength(1);
});

test("B1 a duplicate promise rechecks the owner even after the job has already resolved", async () => {
  const m = manager(), c = candidate();
  expect(await m.start(c)).toMatchObject({ status: "confirmed", refundedCount: 0 });
  const duplicate = m.start(c);
  noteResolvedOwner("owner-b");
  expect(await duplicate).toEqual({ status: "stale" });
  expect(rpcCalls()).toHaveLength(1);
});

test.each([0, 3].flatMap(count => ["deadline", "switch", "return"].map(stop => ({ count, stop }))))(
  "B1 records confirmed refund $count before the post-RPC $stop fence", async ({ count, stop }) => {
    const gate = deferred<Response>(), m = manager();
    jest.mocked(fetch).mockReturnValueOnce(gate.promise);
    const pending = m.start(candidate());
    await flush();
    expect(rpcCalls()).toHaveLength(1);
    if (stop === "deadline") jest.setSystemTime(NOW.getTime() + 8_000);
    else {
      noteResolvedOwner("owner-b");
      if (stop === "return") noteResolvedOwner("owner-a");
    }
    gate.resolve(json(count));
    if (stop === "deadline") expect(await pending).toMatchObject({ status: "confirmed", refundedCount: count, calls: 1 });
    else expect(await pending).toEqual({ status: "stale" });
    expect(reads()).toHaveLength(0);
    expect(m.readUsage()).toBeNull();
    if (stop === "deadline") expect(m.read()[0]).toMatchObject({ status: "confirmed", refundedCount: count });
    else expect(m.read()).toEqual([]);
  },
);

test("B1 a confirmed late transport result replaces unknown expiry without publishing usage or retrying", async () => {
  const gate = deferred<Response>(), m = manager(), c = candidate();
  jest.mocked(fetch).mockReturnValueOnce(gate.promise);
  const pending = m.start(c);
  await jest.advanceTimersByTimeAsync(8_000);
  expect(await pending).toMatchObject({ status: "expired", calls: 1 });
  expect(m.read()[0]).not.toHaveProperty("refundedCount");
  expect(rpcCalls()[0][1]?.signal?.aborted).toBe(true);
  // Cancellation cannot retract an already committed server result.
  gate.resolve(json(0));
  await flush();
  expect(m.read()[0]).toMatchObject({ status: "confirmed", refundedCount: 0, calls: 1 });
  expect(await m.start(c)).toEqual(await pending);
  expect(rpcCalls()).toHaveLength(1);
  expect(reads()).toHaveLength(0);
  expect(m.readUsage()).toBeNull();
});

test.each([0, 1, 5])("B1 expiry snapshot cannot overwrite confirmation before publication with %s extra body awaits", async extraAwaits => {
  const gate = deferred<Response>(), response = json(0), m = manager();
  const captured = deferred<void>(), runFinished = deferred<void>(), publish = deferred<void>();
  const race = Promise.race.bind(Promise);
  // Hold the selected expiry snapshot until the issued RPC is fully recorded.
  // This fixes the interleaving without depending on transport microtask depth.
  jest.spyOn(Promise, "race").mockImplementationOnce(<T>(values: Iterable<T | PromiseLike<T>>) => {
    const racers = [...values];
    void Promise.resolve(racers[0]).then(() => runFinished.resolve());
    return race(racers).then(snapshot => { captured.resolve(); return publish.promise.then(() => snapshot); });
  });
  jest.spyOn(response, "json").mockImplementation(async () => {
    for (let i = 0; i < extraAwaits; i++) await Promise.resolve();
    return 0;
  });
  jest.mocked(fetch).mockReturnValueOnce(gate.promise);
  const pending = m.start(candidate());
  await jest.advanceTimersByTimeAsync(8_000);
  await captured.promise;
  expect(rpcCalls()[0][1]?.signal?.aborted).toBe(true);
  gate.resolve(response);
  await runFinished.promise;
  expect(m.read()[0]).toMatchObject({ status: "confirmed", refundedCount: 0, calls: 1 });
  publish.resolve();
  expect(await pending).toMatchObject({ status: "confirmed", refundedCount: 0, calls: 1 });
  expect(m.read()[0]).toMatchObject({ status: "confirmed", refundedCount: 0, calls: 1 });
  expect(reads()).toHaveLength(0);
  expect(m.readUsage()).toBeNull();
});

test("wall-clock expiry before retry also stops calls when timers have not fired", async () => {
  jest.mocked(fetch).mockResolvedValueOnce(json(null));
  const pending = manager().start(candidate());
  await flush();
  jest.setSystemTime(NOW.getTime() + 8_000);
  await jest.advanceTimersByTimeAsync(250);
  expect(await pending).toMatchObject({ status: "expired", calls: 1 });
  expect(reads()).toHaveLength(0);
});

test.each(["midnight", "send", "ad", "new-read"])("%s cannot be overwritten by a stale usage response", async change => {
  if (change === "midnight") jest.setSystemTime(new Date("2026-10-22T14:59:59Z"));
  const gate = deferred<Response>(), m = manager();
  jest.mocked(fetch).mockResolvedValueOnce(json(0)).mockReturnValueOnce(gate.promise);
  const pending = m.start(candidate());
  await flush();
  expect(reads()).toHaveLength(1);
  if (change === "midnight") jest.setSystemTime(new Date("2026-10-22T15:00:00Z"));
  else if (change === "new-read") await m.start(candidate(SECOND, 2));
  else m.invalidateUsage();
  gate.resolve(json([{ count: 4, ad_bonus: 0 }]));
  await pending;
  if (change === "new-read") expect(m.readUsage()).toMatchObject({ used: 0, adBonus: 2 });
  else expect(m.readUsage()).toBeNull();
});

test("yesterday's count is queried as yesterday and never presented as today's count", async () => {
  const m = manager(), c = candidate();
  const yesterday = { ...c, ticket: { ...c.ticket, day: "2026-10-21" } };
  await m.start(yesterday);
  expect(reads()[0][0]).toContain("day=eq.2026-10-21");
  expect(m.readUsage()).toBeNull();
});

test("confirmed count is a dated fallback when the usage read fails; NULL supplies no fallback", async () => {
  const m = manager();
  jest.mocked(fetch).mockResolvedValueOnce(json(0)).mockRejectedValueOnce(new Error("offline"));
  await m.start(candidate());
  expect(m.readUsage()).toMatchObject({ used: 0, day: "2026-10-22" });
  expect(m.readUsage()).not.toHaveProperty("adBonus");
  m.invalidateUsage();
  jest.mocked(fetch).mockResolvedValueOnce(json(null)).mockResolvedValueOnce(json(null)).mockResolvedValueOnce(json([{ count: -1, ad_bonus: 0 }]));
  const pending = m.start(candidate(SECOND, 2));
  await jest.advanceTimersByTimeAsync(250); await pending;
  expect(m.readUsage()).toBeNull();
});

test("publication requires owner, epoch, day, latest sequence, and remaining time independently", () => {
  const current = { ownerId: "a", ownerEpoch: 1, day: "2026-10-22", sequence: 3 };
  const value = { ...current, used: 0, deadline: 50 };
  expect(canUseSwapUsage(value, current, true, 49)).toBe(true);
  for (const changed of [{ ownerId: "b" }, { ownerEpoch: 2 }, { day: "2026-10-23" }, { sequence: 4 }]) {
    expect(canUseSwapUsage(value, { ...current, ...changed }, true, 49)).toBe(false);
  }
  expect(canUseSwapUsage(value, current, false, 49)).toBe(false);
  expect(canUseSwapUsage(value, current, true, 50)).toBe(false);
});
