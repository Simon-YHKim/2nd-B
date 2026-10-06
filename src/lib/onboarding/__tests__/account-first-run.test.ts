// Q-261004-40 = A (migration 0219): the welcome and the first-day review are
// once per ACCOUNT. These pin the store that reads and writes the server marks,
// and the two decisions that turn them into "show the welcome?" and "send to
// /ttfv?". The W-12 cases are the ones that failed before: an existing account
// on an empty browser must not see either screen again.

const mockGetSupabaseClient = jest.fn();
jest.mock("../../supabase/client", () => ({ getSupabaseClient: mockGetSupabaseClient }));

import { __resetAccountEpochForTests, noteResolvedOwner } from "../../auth/account-epoch";
import {
  ACCOUNT_FIRST_RUN_MAX_RESENDS,
  ACCOUNT_FIRST_RUN_TIMEOUT_MS,
  __resetAccountFirstRunForTests,
  accountFirstRunAnswer,
  accountFirstRunConfirmations,
  accountFirstRunSnapshot,
  fetchAccountFirstRunMarks,
  markAccountOnboardingComplete,
  markAccountTTFVSeen,
  parseAccountFirstRunMarks,
  probeAccountFirstRun,
  revalidateAccountFirstRun,
  subscribeAccountFirstRun,
  type AccountFirstRunMarks,
} from "../account-first-run";
import { ONBOARDING_KEY, __resetOnboardingStateForTests, markOnboardingComplete, onboardingDecision } from "../state";
import { FIRST_DAY_MS, TTFV_SEEN_KEY, markTTFVSeen, ttfvAwaitsConfirmation, ttfvDecision } from "../ttfv-gate";

const A = "a0219000-0000-4000-8000-00000000000a";
const B = "a0219000-0000-4000-8000-00000000000b";
const OLD = "2026-01-01T00:00:00+00:00";
const NONE: AccountFirstRunMarks = { onboardingCompletedAt: null, ttfvSeenAt: null };

type Reply = { data: unknown; error: unknown };

interface FakeServer {
  reads: Array<{ table: string; columns: string; column: string; owner: string }>;
  rpcs: Array<{ name: string; args: Record<string, unknown> }>;
}

function fakeServer(
  read: (owner: string) => Reply | Promise<Reply>,
  rpc: (name: string, args: Record<string, unknown>) => Reply | Promise<Reply> = () => ({ data: null, error: null }),
): FakeServer {
  const server: FakeServer = { reads: [], rpcs: [] };
  mockGetSupabaseClient.mockReturnValue({
    from: (table: string) => ({
      select: (columns: string) => ({
        eq: (column: string, owner: string) => ({
          maybeSingle: () => {
            server.reads.push({ table, columns, column, owner });
            return Promise.resolve(read(owner));
          },
        }),
      }),
    }),
    rpc: (name: string, args: Record<string, unknown>) => {
      server.rpcs.push({ name, args });
      return Promise.resolve(rpc(name, args));
    },
  });
  return server;
}

const row = (onboarding: string | null, ttfv: string | null = null) => ({
  onboarding_completed_at: onboarding,
  ttfv_seen_at: ttfv,
});

const flush = async () => {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
};

let warn: jest.SpyInstance;
beforeEach(() => {
  __resetAccountEpochForTests();
  __resetAccountFirstRunForTests();
  mockGetSupabaseClient.mockReset();
  warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => warn.mockRestore());

describe("parseAccountFirstRunMarks", () => {
  test("accepts NULL and timestamps", () => {
    expect(parseAccountFirstRunMarks(row(null))).toEqual(NONE);
    expect(parseAccountFirstRunMarks(row(OLD, OLD))).toEqual({ onboardingCompletedAt: OLD, ttfvSeenAt: OLD });
  });

  test("a response without the fields or with a non-timestamp is not an answer", () => {
    expect(() => parseAccountFirstRunMarks({ onboarding_completed_at: null })).toThrow("ttfv_seen_at was not returned");
    expect(() => parseAccountFirstRunMarks({ ttfv_seen_at: null })).toThrow("onboarding_completed_at was not returned");
    expect(() => parseAccountFirstRunMarks(row("yesterday"))).toThrow("not a timestamp");
    expect(() => parseAccountFirstRunMarks(null)).toThrow();
  });
});

describe("fetchAccountFirstRunMarks", () => {
  test("reads only the two marks from the owner's own users row", async () => {
    const server = fakeServer(() => ({ data: row(OLD), error: null }));
    await expect(fetchAccountFirstRunMarks(A)).resolves.toEqual({ onboardingCompletedAt: OLD, ttfvSeenAt: null });
    expect(server.reads).toEqual([
      { table: "users", columns: "onboarding_completed_at, ttfv_seen_at", column: "id", owner: A },
    ]);
  });

  test("a missing column (0219 not applied) or a missing row throws instead of answering NULL", async () => {
    fakeServer(() => ({ data: null, error: { code: "42703", message: "column does not exist" } }));
    await expect(fetchAccountFirstRunMarks(A)).rejects.toMatchObject({ code: "42703" });
    fakeServer(() => ({ data: null, error: null }));
    await expect(fetchAccountFirstRunMarks(A)).rejects.toThrow("row was not found");
  });
});

describe("probeAccountFirstRun", () => {
  test("publishes the server answer for the owner", async () => {
    fakeServer(() => ({ data: row(OLD), error: null }));
    const seen: string[] = [];
    subscribeAccountFirstRun(() => seen.push(accountFirstRunSnapshot().status));
    await probeAccountFirstRun(A);
    expect(accountFirstRunSnapshot()).toEqual({ userId: A, status: "server", confirmedSeq: 1, onboardingCompletedAt: OLD, ttfvSeenAt: null });
    expect(seen).toEqual(["loading", "server"]);
  });

  test("an unreadable answer becomes 'device', never 'not finished'", async () => {
    fakeServer(() => ({ data: null, error: { code: "42703" } }));
    await probeAccountFirstRun(A);
    expect(accountFirstRunSnapshot()).toMatchObject({ userId: A, status: "device" });
    expect(accountFirstRunAnswer(A, true, accountFirstRunSnapshot())).toBe("device");
  });

  test("a read that never settles falls back to the device after the deadline", async () => {
    jest.useFakeTimers();
    try {
      fakeServer(() => new Promise<Reply>(() => undefined));
      const probe = probeAccountFirstRun(A);
      jest.advanceTimersByTime(ACCOUNT_FIRST_RUN_TIMEOUT_MS);
      await probe;
      expect(accountFirstRunSnapshot()).toMatchObject({ userId: A, status: "device" });
    } finally {
      jest.useRealTimers();
    }
  });

  test("reads once per owner; a 'device' result is retried on the next call", async () => {
    const server = fakeServer(() => ({ data: row(OLD), error: null }));
    await probeAccountFirstRun(A);
    await probeAccountFirstRun(A);
    expect(server.reads).toHaveLength(1);

    __resetAccountFirstRunForTests();
    let fail = true;
    const retry = fakeServer(() => (fail ? { data: null, error: { code: "08006" } } : { data: row(OLD), error: null }));
    await probeAccountFirstRun(A);
    expect(accountFirstRunSnapshot().status).toBe("device");
    fail = false;
    await probeAccountFirstRun(A);
    expect(retry.reads).toHaveLength(2);
    expect(accountFirstRunSnapshot()).toMatchObject({ status: "server", onboardingCompletedAt: OLD });
  });

  test("a late answer for the previous owner never lands on the next owner", async () => {
    let releaseA: (reply: Reply) => void = () => undefined;
    fakeServer((owner) =>
      owner === A
        ? new Promise<Reply>((resolve) => { releaseA = resolve; })
        : { data: row(null), error: null },
    );
    const first = probeAccountFirstRun(A);
    await probeAccountFirstRun(B);
    releaseA({ data: row(OLD), error: null });
    await first;
    expect(accountFirstRunSnapshot()).toEqual({ userId: B, status: "server", confirmedSeq: 1, ...NONE });
    expect(accountFirstRunAnswer(A, true, accountFirstRunSnapshot())).toBeNull();
  });
});

describe("account marks", () => {
  test("completion calls the owner RPC and adopts the stored (first) value", async () => {
    const server = fakeServer(
      () => ({ data: row(null), error: null }),
      () => ({ data: row(OLD), error: null }),
    );
    await probeAccountFirstRun(A);
    const done = markAccountOnboardingComplete(A);
    // Immediately complete for this session, before the server answers.
    expect(accountFirstRunSnapshot().onboardingCompletedAt).not.toBeNull();
    await done;
    expect(server.rpcs).toEqual([{ name: "mark_onboarding_completed", args: { p_user_id: A } }]);
    // The server keeps the first value; the session clock only filled a NULL.
    expect(accountFirstRunSnapshot()).toMatchObject({ status: "server", onboardingCompletedAt: OLD });
  });

  test("a failed write never rejects and keeps the mark for this session", async () => {
    fakeServer(
      () => ({ data: row(null), error: null }),
      () => ({ data: null, error: { code: "PGRST202", message: "function not found" } }),
    );
    await probeAccountFirstRun(A);
    await expect(markAccountTTFVSeen(A)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith("[first-run] mark_ttfv_seen failed", expect.anything());
    expect(accountFirstRunSnapshot().ttfvSeenAt).not.toBeNull();
  });

  test("a read that started before the mark cannot undo it, and resends the missing write", async () => {
    let releaseRead: (reply: Reply) => void = () => undefined;
    let rpcFails = true;
    const server = fakeServer(
      () => new Promise<Reply>((resolve) => { releaseRead = resolve; }),
      () => (rpcFails ? { data: null, error: { code: "08006" } } : { data: row(OLD), error: null }),
    );
    const probe = probeAccountFirstRun(A);
    await markAccountOnboardingComplete(A);
    rpcFails = false;
    releaseRead({ data: row(null), error: null });
    await probe;
    expect(accountFirstRunSnapshot().onboardingCompletedAt).not.toBeNull();
    await flush();
    expect(server.rpcs.map((call) => call.name)).toEqual(["mark_onboarding_completed", "mark_onboarding_completed"]);
    expect(accountFirstRunSnapshot().onboardingCompletedAt).toBe(OLD);
  });

  test("a mark for a signed-out owner is a no-op, and another owner's stored value is ignored", async () => {
    const server = fakeServer(
      () => ({ data: row(null), error: null }),
      () => ({ data: row(OLD), error: null }),
    );
    await markAccountOnboardingComplete("");
    expect(server.rpcs).toEqual([]);
    await probeAccountFirstRun(B);
    await markAccountOnboardingComplete(A);
    expect(accountFirstRunSnapshot()).toEqual({ userId: B, status: "server", confirmedSeq: 1, ...NONE });
  });

  test("NULL from the RPC (no profile row yet) is a failed write, not a stored NULL", async () => {
    fakeServer(() => ({ data: row(null), error: null }), () => ({ data: null, error: null }));
    await probeAccountFirstRun(A);
    await markAccountOnboardingComplete(A);
    expect(warn).toHaveBeenCalledWith("[first-run] mark_onboarding_completed failed", expect.any(Error));
  });
});

describe("an answer belongs to one sign-in (CD-01)", () => {
  test("signing out drops it, so the same account signing back in reads the server again", async () => {
    let stored = row(OLD);
    const server = fakeServer(() => ({ data: stored, error: null }));
    noteResolvedOwner(A);
    await probeAccountFirstRun(A);
    expect(accountFirstRunAnswer(A, true, accountFirstRunSnapshot())).toEqual({ onboardingCompletedAt: OLD, ttfvSeenAt: null });

    noteResolvedOwner(null);
    expect(accountFirstRunSnapshot()).toMatchObject({ userId: null, status: "idle" });
    // Meanwhile another device showed this account the first-day review.
    stored = row(OLD, OLD);
    noteResolvedOwner(A);
    expect(accountFirstRunAnswer(A, true, accountFirstRunSnapshot())).toBeNull();
    await probeAccountFirstRun(A);
    expect(server.reads).toHaveLength(2);
    expect(accountFirstRunAnswer(A, true, accountFirstRunSnapshot())).toEqual({ onboardingCompletedAt: OLD, ttfvSeenAt: OLD });
  });

  test("a read in flight at sign-out never lands after the account signs back in", async () => {
    const releases: Array<(reply: Reply) => void> = [];
    fakeServer(() => new Promise<Reply>((resolve) => { releases.push(resolve); }));
    noteResolvedOwner(A);
    const first = probeAccountFirstRun(A);
    noteResolvedOwner(null);
    noteResolvedOwner(A);
    const second = probeAccountFirstRun(A);
    expect(releases).toHaveLength(2);
    releases[1]({ data: row(OLD, OLD), error: null });
    await second;
    releases[0]({ data: row(null), error: null });
    await first;
    expect(accountFirstRunSnapshot()).toMatchObject({ userId: A, status: "server", onboardingCompletedAt: OLD, ttfvSeenAt: OLD });
  });
});

describe("a mark the server has not stored is sent again (CDA-02)", () => {
  test("after a successful read, a failed write is resent when a screen asks again, a bounded number of times", async () => {
    const server = fakeServer(() => ({ data: row(null), error: null }), () => ({ data: null, error: { code: "08006" } }));
    await probeAccountFirstRun(A);
    await markAccountOnboardingComplete(A);
    for (let entry = 0; entry < ACCOUNT_FIRST_RUN_MAX_RESENDS + 2; entry += 1) {
      await probeAccountFirstRun(A);
      await flush();
    }
    expect(server.reads).toHaveLength(1);
    expect(server.rpcs).toHaveLength(1 + ACCOUNT_FIRST_RUN_MAX_RESENDS);
    expect(server.rpcs.every((call) => call.name === "mark_onboarding_completed")).toBe(true);
  });

  test("once a resend is stored, a re-entry sends nothing", async () => {
    let rpcFails = true;
    const server = fakeServer(
      () => ({ data: row(null), error: null }),
      () => (rpcFails ? { data: null, error: { code: "08006" } } : { data: row(OLD), error: null }),
    );
    await probeAccountFirstRun(A);
    await markAccountOnboardingComplete(A);
    rpcFails = false;
    await probeAccountFirstRun(A);
    await flush();
    expect(accountFirstRunSnapshot()).toMatchObject({ status: "server", onboardingCompletedAt: OLD });
    await probeAccountFirstRun(A);
    await flush();
    expect(server.rpcs).toHaveLength(2);
  });

  test("signing back in reads again and resends the mark the server still lacks", async () => {
    let rpcFails = true;
    const server = fakeServer(
      () => ({ data: row(null), error: null }),
      () => (rpcFails ? { data: null, error: { code: "08006" } } : { data: row(OLD, OLD), error: null }),
    );
    noteResolvedOwner(A);
    await probeAccountFirstRun(A);
    await markAccountTTFVSeen(A);
    noteResolvedOwner(null);
    noteResolvedOwner(A);
    rpcFails = false;
    await probeAccountFirstRun(A);
    await flush();
    expect(server.reads).toHaveLength(2);
    expect(server.rpcs.map((call) => call.name)).toEqual(["mark_ttfv_seen", "mark_ttfv_seen"]);
    expect(accountFirstRunSnapshot()).toMatchObject({ status: "server", ttfvSeenAt: OLD });
  });
});

describe("the first-day review waits for a server confirmation (CDA-01)", () => {
  const now = Date.parse("2026-10-06T03:00:00.000Z");
  const hourAgo = new Date(now - 60 * 60 * 1000).toISOString();
  // What the home gate does with the store: send to /ttfv, wait (null), or not.
  const decide = (since: number) => {
    const current = accountFirstRunSnapshot();
    const account = accountFirstRunAnswer(A, true, current);
    const decision = ttfvDecision(A, account, null, now);
    return ttfvAwaitsConfirmation(A, account, decision, current, since) ? null : decision;
  };

  test("another tab already showed the review: finishing the welcome here does not open it again", async () => {
    let releaseRpc: (reply: Reply) => void = () => undefined;
    // This tab read both marks empty; the other tab then finished both.
    fakeServer(
      () => ({ data: row(null), error: null }),
      () => new Promise<Reply>((resolve) => { releaseRpc = resolve; }),
    );
    await probeAccountFirstRun(A);
    const homeBeforeFinish = accountFirstRunConfirmations();
    const done = markAccountOnboardingComplete(A);
    const homeAfterFinish = accountFirstRunConfirmations();
    // The welcome mark is only local so far: neither home opens the review on it.
    expect(decide(homeBeforeFinish)).toBeNull();
    expect(decide(homeAfterFinish)).toBeNull();
    releaseRpc({ data: row(hourAgo, hourAgo), error: null });
    await done;
    expect(decide(homeBeforeFinish)).toBe(false);
    expect(decide(homeAfterFinish)).toBe(false);
  });

  test("a new entry does not reuse a cached 'not seen': it reads again and keeps the welcome's answer meanwhile", async () => {
    let stored = row(hourAgo);
    const server = fakeServer(() => ({ data: stored, error: null }));
    const firstHome = accountFirstRunConfirmations();
    await probeAccountFirstRun(A);
    // A read newer than the screen is used as it is.
    expect(decide(firstHome)).toBe(true);

    // Another tab of this browser showed the review; home mounts again here.
    stored = row(hourAgo, hourAgo);
    const nextHome = accountFirstRunConfirmations();
    expect(decide(nextHome)).toBeNull();
    const statuses: string[] = [];
    subscribeAccountFirstRun(() => statuses.push(accountFirstRunSnapshot().status));
    await revalidateAccountFirstRun(A);
    expect(server.reads).toHaveLength(2);
    expect(statuses).toEqual(["server"]);
    expect(decide(nextHome)).toBe(false);
  });

  test("an unreadable server keeps the cached answer instead of holding the review", async () => {
    let fail = false;
    fakeServer(() => (fail ? { data: null, error: { code: "08006" } } : { data: row(hourAgo), error: null }));
    await probeAccountFirstRun(A);
    fail = true;
    const home = accountFirstRunConfirmations();
    expect(decide(home)).toBeNull();
    await revalidateAccountFirstRun(A);
    expect(accountFirstRunSnapshot()).toMatchObject({ status: "server", onboardingCompletedAt: hourAgo });
    expect(decide(home)).toBe(true);
  });

  test("only a 'send' that came from the server marks waits", () => {
    const snap = { userId: A, status: "server" as const, confirmedSeq: 0, ...NONE };
    expect(ttfvAwaitsConfirmation(A, NONE, false, snap, 0)).toBe(false);
    expect(ttfvAwaitsConfirmation(A, NONE, null, snap, 0)).toBe(false);
    expect(ttfvAwaitsConfirmation(A, "device", true, snap, 0)).toBe(false);
    expect(ttfvAwaitsConfirmation(null, null, true, snap, 0)).toBe(false);
    expect(ttfvAwaitsConfirmation(A, NONE, true, snap, 0)).toBe(true);
    expect(ttfvAwaitsConfirmation(A, NONE, true, { ...snap, confirmedSeq: 2 }, 2)).toBe(true);
    expect(ttfvAwaitsConfirmation(A, NONE, true, { ...snap, confirmedSeq: 3 }, 2)).toBe(false);
    expect(ttfvAwaitsConfirmation(A, NONE, true, { ...snap, userId: B, confirmedSeq: 3 }, 2)).toBe(true);
  });
});

describe("the screens' mark helpers", () => {
  const store: Record<string, string> = {};
  beforeEach(() => {
    __resetOnboardingStateForTests();
    for (const key of Object.keys(store)) delete store[key];
    (globalThis as { localStorage?: Storage }).localStorage = {
      getItem: (key: string) => (key in store ? store[key] : null),
      setItem: (key: string, value: string) => { store[key] = value; },
      removeItem: (key: string) => { delete store[key]; },
    } as unknown as Storage;
  });
  afterEach(() => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
  });

  test("signed in: the device fallback and the account mark are both written", async () => {
    const server = fakeServer(() => ({ data: row(null), error: null }), () => ({ data: row(OLD, OLD), error: null }));
    markOnboardingComplete(A);
    markTTFVSeen(A);
    await flush();
    expect(store[ONBOARDING_KEY]).toBeDefined();
    expect(store[TTFV_SEEN_KEY]).toBeDefined();
    expect(server.rpcs).toEqual([
      { name: "mark_onboarding_completed", args: { p_user_id: A } },
      { name: "mark_ttfv_seen", args: { p_user_id: A } },
    ]);
  });

  test("signed out: the device value only", async () => {
    const server = fakeServer(() => ({ data: row(null), error: null }));
    markOnboardingComplete();
    markTTFVSeen(null);
    await flush();
    expect(store[ONBOARDING_KEY]).toBeDefined();
    expect(server.rpcs).toEqual([]);
  });
});

describe("accountFirstRunAnswer", () => {
  test("waits while not ready, for another owner, or while loading", () => {
    const server = { userId: A, status: "server" as const, confirmedSeq: 1, ...NONE };
    expect(accountFirstRunAnswer(A, false, server)).toBeNull();
    expect(accountFirstRunAnswer(B, true, server)).toBeNull();
    expect(accountFirstRunAnswer(A, true, { ...server, status: "loading" })).toBeNull();
    expect(accountFirstRunAnswer(A, true, { ...server, status: "idle" })).toBeNull();
    expect(accountFirstRunAnswer(A, true, server)).toEqual(NONE);
  });
});

describe("onboardingDecision (should the welcome be skipped?)", () => {
  test("W-12: an existing account on an empty browser skips the welcome", () => {
    expect(onboardingDecision(A, { onboardingCompletedAt: OLD, ttfvSeenAt: null }, false)).toBe(true);
  });

  test("the server NULL wins over another account's device flag", () => {
    expect(onboardingDecision(B, NONE, true)).toBe(false);
  });

  test("pending is a loader; unreadable falls back to the device; signed out is the device", () => {
    expect(onboardingDecision(A, null, true)).toBeNull();
    expect(onboardingDecision(A, "device", true)).toBe(true);
    expect(onboardingDecision(A, "device", false)).toBe(false);
    expect(onboardingDecision(A, "device", null)).toBeNull();
    expect(onboardingDecision(null, null, true)).toBe(true);
    expect(onboardingDecision(null, NONE, false)).toBe(false);
  });
});

describe("ttfvDecision (send to /ttfv now?)", () => {
  const now = Date.parse("2026-10-06T03:00:00.000Z");
  const hourAgo = new Date(now - 60 * 60 * 1000).toISOString();
  const twoDaysAgo = new Date(now - 2 * FIRST_DAY_MS).toISOString();
  const freshDevice = { seen: false, completedAt: hourAgo };

  test("W-12: an existing account is not sent to /ttfv, whatever this device says", () => {
    expect(ttfvDecision(A, { onboardingCompletedAt: twoDaysAgo, ttfvSeenAt: null }, freshDevice, now)).toBe(false);
    expect(ttfvDecision(A, { onboardingCompletedAt: twoDaysAgo, ttfvSeenAt: null }, null, now)).toBe(false);
  });

  test("once per account: a server seen mark wins over an unseen device", () => {
    expect(ttfvDecision(A, { onboardingCompletedAt: hourAgo, ttfvSeenAt: hourAgo }, freshDevice, now)).toBe(false);
  });

  test("a new account inside its first day is sent once, even if another account saw it on this device", () => {
    expect(ttfvDecision(B, { onboardingCompletedAt: hourAgo, ttfvSeenAt: null }, { seen: true, completedAt: hourAgo }, now))
      .toBe(true);
  });

  test("no completion mark means no first day", () => {
    expect(ttfvDecision(A, NONE, freshDevice, now)).toBe(false);
  });

  test("pending is a loader; unreadable and signed out use the device answer", () => {
    expect(ttfvDecision(A, null, freshDevice, now)).toBeNull();
    expect(ttfvDecision(A, "device", freshDevice, now)).toBe(true);
    expect(ttfvDecision(A, "device", { seen: true, completedAt: hourAgo }, now)).toBe(false);
    expect(ttfvDecision(A, "device", null, now)).toBeNull();
    expect(ttfvDecision(null, null, freshDevice, now)).toBe(true);
  });
});
