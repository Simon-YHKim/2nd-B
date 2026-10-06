// First-run claims (Q-261004-40 strict, 0219): the store that decides whether
// the home opens the welcome or the first-day review, against a fake server that
// follows the same rules as claim_first_run / finish_first_run.
//
// The describe blocks are the twelve bundles of the #2092 gate findings (design
// docs/design/onboarding-server-261006.md section 6) that the client owns, plus
// the principles P2/P3. The SQL side of the same bundles is pinned by
// db/tests/onboarding_first_run_claims_regression.sql and the workflow's race
// and rollback steps (first-run-wiring.test.ts checks they are wired).

type Marks = {
  onboarding_claimed_at: string | null;
  onboarding_completed_at: string | null;
  ttfv_claimed_at: string | null;
  ttfv_seen_at: string | null;
};
type Row = Marks & { token: string | null };
type Reply = { data: unknown; error: unknown };

// What the app sees of the sign-in and of AuthContext's published owner.
const mockAuth = {
  published: "user-a" as string | null,
  sessionUser: "user-a" as string | null,
  sessionId: "s1" as string | null,
};

// A server with the 0219 rules. Every request is decided when it is SENT (with
// the session it was sent under) and its reply can be held back and delivered
// later, which is how a late or overlapping answer is staged.
const mockServer = {
  rows: new Map<string, Row>(),
  now: () => new Date().toISOString(),
  hold: false,
  held: [] as Array<() => void>,
  failRead: null as Error | null,
  failRpc: null as { message: string } | null,
  calls: { read: 0, claim: 0, finish: 0 },
  claimed: [] as string[],
  tokens: 0,
  /** When set, the session_id the server echoes instead of the one it was sent under. */
  echo: undefined as string | null | undefined,
};

function mockMarks(row: Row): Marks {
  return {
    onboarding_claimed_at: row.onboarding_claimed_at,
    onboarding_completed_at: row.onboarding_completed_at,
    ttfv_claimed_at: row.ttfv_claimed_at,
    ttfv_seen_at: row.ttfv_seen_at,
  };
}

function mockReply(compute: () => Reply): Promise<Reply> {
  const reply = compute();
  if (!mockServer.hold) return Promise.resolve(reply);
  return new Promise((resolve) => mockServer.held.push(() => resolve(reply)));
}

function mockJwt(sessionId: string | null): string {
  const payload = sessionId ? { sub: "x", session_id: sessionId } : { sub: "x" };
  return `h.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.s`;
}

function mockClaim(owner: string, kind: string, sessionId: string | null): Reply {
  const row = mockServer.rows.get(owner);
  if (!row) return { data: null, error: { message: "profile_required" } };
  const now = mockServer.now();
  let granted = false;
  let token: string | null = null;
  if (kind === "onboarding") {
    if (row.onboarding_claimed_at === null && row.onboarding_completed_at === null) {
      row.onboarding_claimed_at = now;
      granted = true;
    }
  } else {
    const anchor = row.onboarding_completed_at ?? row.onboarding_claimed_at;
    const inWindow = anchor !== null && Date.parse(now) - Date.parse(anchor) < 24 * 60 * 60 * 1000;
    if (row.ttfv_seen_at === null && row.ttfv_claimed_at === null && inWindow) {
      mockServer.tokens += 1;
      token = `token-${mockServer.tokens}`;
      row.ttfv_claimed_at = now;
      row.token = token;
      granted = true;
    }
  }
  return {
    data: { granted, reason: granted ? "granted" : "held", token, session_id: sessionId, marks: mockMarks(row) },
    error: null,
  };
}

function mockFinish(owner: string, kind: string, outcome: string, token: string | null, sessionId: string | null): Reply {
  const row = mockServer.rows.get(owner);
  if (!row) return { data: null, error: { message: "profile_required" } };
  const now = mockServer.now();
  let applied = false;
  if (kind === "onboarding") {
    if (row.onboarding_completed_at === null) {
      row.onboarding_completed_at = now;
      applied = true;
    }
  } else if (outcome === "shown") {
    applied = row.ttfv_seen_at === null || row.ttfv_claimed_at === null;
    row.ttfv_seen_at ??= now;
    row.ttfv_claimed_at ??= now;
  } else if (token !== null && row.ttfv_seen_at === null && row.token === token) {
    row.ttfv_claimed_at = null;
    row.token = null;
    applied = true;
  }
  return { data: { applied, session_id: sessionId, marks: mockMarks(row) }, error: null };
}

jest.mock("../../auth/account-epoch", () => ({
  currentAccountOwner: () => mockAuth.published,
}));

jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({
    auth: {
      getSession: () =>
        Promise.resolve({
          data: {
            session: mockAuth.sessionUser
              ? { user: { id: mockAuth.sessionUser }, access_token: mockJwt(mockAuth.sessionId) }
              : null,
          },
          error: null,
        }),
    },
    from: (table: string) => ({
      select: (columns: string) => ({
        eq: (_column: string, owner: string) => ({
          maybeSingle: () => {
            mockServer.calls.read += 1;
            if (table !== "users" || !columns.includes("onboarding_claimed_at")) throw new Error("unexpected read");
            return mockReply(() => {
              if (mockServer.failRead) return { data: null, error: mockServer.failRead };
              const row = mockServer.rows.get(owner);
              return { data: row ? mockMarks(row) : null, error: null };
            });
          },
        }),
      }),
    }),
    rpc: (name: string, args: Record<string, unknown>) => {
      const sessionId = mockServer.echo === undefined ? mockAuth.sessionId : mockServer.echo;
      if (name === "claim_first_run") mockServer.claimed.push(String(args.p_kind));
      const owner = String(args.p_user_id);
      if (name === "claim_first_run") mockServer.calls.claim += 1;
      else if (name === "finish_first_run") mockServer.calls.finish += 1;
      else throw new Error(`unexpected rpc ${name}`);
      return mockReply(() => {
        if (mockServer.failRpc) return { data: null, error: mockServer.failRpc };
        return name === "claim_first_run"
          ? mockClaim(owner, String(args.p_kind), sessionId)
          : mockFinish(
              owner,
              String(args.p_kind),
              String(args.p_outcome),
              (args.p_token as string | null) ?? null,
              sessionId,
            );
      });
    },
  }),
}));

import {
  FIRST_RUN_MAX_READS,
  FIRST_RUN_TIMEOUT_MS,
  __resetFirstRunForTests,
  endFirstRunHomeVisit,
  finishFirstRun,
  firstRunHomeGateFor,
  firstRunSnapshot,
  firstRunTTFVToken,
  loadFirstRunMarks,
  mergeFirstRunMarks,
  onboardingNeeded,
  parseClaimAnswer,
  parseFirstRunMarks,
  retryFirstRunHomeVisit,
  startFirstRunHomeVisit,
  ttfvOpen,
  type FirstRunGate,
  type FirstRunMarks,
} from "../account-first-run";

const A = "user-a";
const B = "user-b";
const DAY = 24 * 60 * 60 * 1000;
const longAgo = new Date(Date.now() - 30 * DAY).toISOString();

function newRow(overrides: Partial<Row> = {}): Row {
  return {
    onboarding_claimed_at: null,
    onboarding_completed_at: null,
    ttfv_claimed_at: null,
    ttfv_seen_at: null,
    token: null,
    ...overrides,
  };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 40; i += 1) await Promise.resolve();
}

function gate(owner: string | null = A): FirstRunGate {
  return firstRunHomeGateFor(firstRunSnapshot(), owner, true);
}

/** One home visit, as the shell runs it on mount. */
async function visit(owner = A): Promise<FirstRunGate> {
  startFirstRunHomeVisit(owner);
  await settle();
  return gate(owner);
}

function releaseHeld(): void {
  const held = mockServer.held.splice(0);
  for (const deliver of held) deliver();
}

beforeEach(() => {
  __resetFirstRunForTests();
  mockAuth.published = A;
  mockAuth.sessionUser = A;
  mockAuth.sessionId = "s1";
  mockServer.rows = new Map([[A, newRow()], [B, newRow()]]);
  mockServer.now = () => new Date().toISOString();
  mockServer.hold = false;
  mockServer.held = [];
  mockServer.failRead = null;
  mockServer.failRpc = null;
  mockServer.calls = { read: 0, claim: 0, finish: 0 };
  mockServer.claimed = [];
  mockServer.tokens = 0;
  mockServer.echo = undefined;
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("the first run of a new account", () => {
  test("the welcome opens with a grant, then the first-day review, then nothing", async () => {
    expect(await visit()).toBe("/onboarding");
    expect(mockServer.calls).toEqual({ read: 1, claim: 1, finish: 0 });
    expect(mockServer.rows.get(A)!.onboarding_claimed_at).not.toBeNull();

    expect(await finishFirstRun(A, "onboarding", "completed", null)).toBe(true);
    endFirstRunHomeVisit(A);

    expect(await visit()).toBe("/ttfv");
    expect(firstRunTTFVToken(A)).toBe("token-1");
    expect(mockServer.calls).toEqual({ read: 1, claim: 2, finish: 1 });

    endFirstRunHomeVisit(A);
    expect(await visit()).toBe("home");
    expect(mockServer.calls.claim).toBe(2);
  });

  test("an account finished long ago reads once and asks for nothing", async () => {
    mockServer.rows.set(A, newRow({ onboarding_claimed_at: longAgo, onboarding_completed_at: longAgo }));
    expect(await visit()).toBe("home");
    expect(mockServer.calls).toEqual({ read: 1, claim: 0, finish: 0 });
  });

  test("the home waits (loader) until the decision is in, and forgets it when it leaves", async () => {
    mockServer.hold = true;
    startFirstRunHomeVisit(A);
    await settle();
    expect(gate()).toBe("wait");
    releaseHeld();
    await settle();
    releaseHeld();
    await settle();
    expect(gate()).toBe("/onboarding");
    endFirstRunHomeVisit(A);
    expect(gate()).toBe("wait");
    expect(firstRunHomeGateFor(firstRunSnapshot(), A, false)).toBe("wait");
  });
});

describe("bundle 1 (CDA-01): only a grant opens a screen, so two tabs cannot both open it", () => {
  test("marks read as 'needed' do not open the welcome when another tab took the grant", async () => {
    mockServer.hold = true;
    startFirstRunHomeVisit(A);
    await settle();
    // Our read said "needed". Before our claim is sent, another tab's grant is stored.
    mockServer.rows.get(A)!.onboarding_claimed_at = new Date().toISOString();
    releaseHeld(); // the stale read
    await settle();
    expect(mockServer.calls.claim).toBe(1);
    releaseHeld(); // our claim: held
    await settle();
    expect(gate()).toBe("home");
    // ...and this visit does not open the first-day review beside the other tab's welcome.
    expect(mockServer.claimed).toEqual(["onboarding"]);
  });

  test("two app instances (two tabs) racing for the first-day review: one opens it", async () => {
    mockServer.rows.set(A, newRow({ onboarding_claimed_at: new Date().toISOString(), onboarding_completed_at: new Date().toISOString() }));
    let other: typeof import("../account-first-run") | null = null;
    jest.isolateModules(() => {
      other = jest.requireActual("../account-first-run") as typeof import("../account-first-run");
    });
    const tabB = other!;
    startFirstRunHomeVisit(A);
    tabB.startFirstRunHomeVisit(A);
    await settle();
    const answers = [gate(), tabB.firstRunHomeGateFor(tabB.firstRunSnapshot(), A, true)].sort();
    expect(answers).toEqual(["/ttfv", "home"]);
    expect(mockServer.calls.claim).toBe(2);
  });
});

describe("bundle 2 (CD2-02): a failed read is never taken for an answer", () => {
  test("a read error opens nothing and claims nothing", async () => {
    mockServer.failRead = new Error("503");
    expect(await visit()).toBe("home");
    expect(mockServer.calls).toEqual({ read: 1, claim: 0, finish: 0 });
  });

  test("the next home entry reads again, at most three times a sign-in", async () => {
    mockServer.failRead = new Error("503");
    expect(await visit()).toBe("home");
    for (let attempt = 2; attempt <= FIRST_RUN_MAX_READS; attempt += 1) {
      expect(retryFirstRunHomeVisit(A)).toBe(true);
      await settle();
      expect(gate()).toBe("home");
      expect(mockServer.calls.read).toBe(attempt);
    }
    expect(retryFirstRunHomeVisit(A)).toBe(false);
    expect(mockServer.calls.read).toBe(FIRST_RUN_MAX_READS);
  });

  test("a later read that answers opens the welcome on that entry", async () => {
    mockServer.failRead = new Error("503");
    expect(await visit()).toBe("home");
    mockServer.failRead = null;
    expect(retryFirstRunHomeVisit(A)).toBe(true);
    await settle();
    expect(gate()).toBe("/onboarding");
  });

  test("a visit that decided 'home' with an answer is not decided again on focus", async () => {
    mockServer.rows.set(A, newRow({ onboarding_claimed_at: longAgo, onboarding_completed_at: longAgo }));
    expect(await visit()).toBe("home");
    expect(retryFirstRunHomeVisit(A)).toBe(false);
  });
});

describe("bundle 3 (CD2-01): a new sign-in of the same account is a new answer", () => {
  test("the same uid on a new session reads again instead of reusing the old marks", async () => {
    mockServer.rows.set(A, newRow({ onboarding_claimed_at: new Date().toISOString() }));
    expect(await visit()).toBe("/ttfv");
    expect(mockServer.calls.read).toBe(1);
    endFirstRunHomeVisit(A);

    // Sign out and back in as A on another device's review: the server has it seen.
    mockServer.rows.get(A)!.ttfv_seen_at = new Date().toISOString();
    mockAuth.sessionId = "s2";
    expect(await visit()).toBe("home");
    expect(mockServer.calls.read).toBe(2);
    expect(firstRunTTFVToken(A)).toBeNull();
  });
});

describe("bundle 4 (CDA2-01): an answer for an older sign-in is not adopted", () => {
  test("a grant answered after the sign-in changed does not open the screen", async () => {
    mockServer.hold = true;
    startFirstRunHomeVisit(A);
    await settle();
    releaseHeld(); // read under s1
    await settle();
    // The claim was sent under s1. Before it is answered, A signs in again (s2).
    mockAuth.sessionId = "s2";
    releaseHeld();
    await settle();
    expect(gate()).toBe("home");
    expect(mockServer.calls.claim).toBe(1);
  });

  test("a read answered after the sign-in changed is not adopted", async () => {
    mockServer.hold = true;
    const marks = loadFirstRunMarks(A);
    await settle();
    mockAuth.sessionId = "s2";
    releaseHeld();
    await settle();
    expect(await marks).toBeNull();
  });

  test("a finish answered for an older sign-in reports not stored", async () => {
    mockServer.hold = true;
    const finished = finishFirstRun(A, "onboarding", "completed", null);
    await settle();
    mockAuth.sessionId = "s2";
    releaseHeld();
    await settle();
    expect(await finished).toBe(false);
  });

  test("a grant the server tied to another sign-in (or to none) is not followed", async () => {
    mockServer.echo = null;
    expect(await visit()).toBe("home");
    __resetFirstRunForTests();
    mockServer.rows.set(A, newRow());
    mockServer.echo = "s0";
    expect(await visit()).toBe("home");
    expect(parseClaimAnswer({
      granted: true,
      reason: "granted",
      token: null,
      session_id: 7,
      marks: { onboarding_claimed_at: null, onboarding_completed_at: null, ttfv_claimed_at: null, ttfv_seen_at: null },
    }).sessionId).toBeNull();
  });
});

describe("bundle 5 (CDA-02): the chance is used on the server before the screen opens", () => {
  test("a finish that never arrives does not bring the welcome back, now or on the next launch", async () => {
    expect(await visit()).toBe("/onboarding");
    mockServer.failRpc = { message: "network" };
    expect(await finishFirstRun(A, "onboarding", "completed", null)).toBe(false);
    mockServer.failRpc = null;
    endFirstRunHomeVisit(A);
    // The first-day review follows, its window anchored on the grant.
    expect(await visit()).toBe("/ttfv");

    // A fresh launch: nothing in memory, the server holds both grants.
    __resetFirstRunForTests();
    expect(await visit()).toBe("home");
    expect(mockServer.rows.get(A)!.onboarding_completed_at).toBeNull();
    expect(mockServer.claimed.filter((kind) => kind === "onboarding")).toHaveLength(1);
  });
});

describe("bundle 6 (CDA2-02, CD2-03): a timeout ends the wait, not the request, and nothing is sent twice", () => {
  test("a grant answered after 8 seconds is not followed, and is not asked for again", async () => {
    jest.useFakeTimers();
    mockServer.hold = true;
    startFirstRunHomeVisit(A);
    await jest.advanceTimersByTimeAsync(0);
    releaseHeld(); // read
    await jest.advanceTimersByTimeAsync(0);
    expect(mockServer.calls.claim).toBe(1);
    await jest.advanceTimersByTimeAsync(FIRST_RUN_TIMEOUT_MS + 1);
    expect(gate()).toBe("home");
    releaseHeld(); // the late grant
    await jest.advanceTimersByTimeAsync(0);
    expect(gate()).toBe("home");
    endFirstRunHomeVisit(A);
    mockServer.hold = false;
    startFirstRunHomeVisit(A);
    await jest.advanceTimersByTimeAsync(0);
    expect(gate()).not.toBe("/onboarding");
    expect(mockServer.claimed.filter((kind) => kind === "onboarding")).toHaveLength(1);
  });

  test("two visits at once send one read and one claim", async () => {
    mockServer.hold = true;
    startFirstRunHomeVisit(A);
    startFirstRunHomeVisit(A);
    await settle();
    expect(mockServer.calls.read).toBe(1);
    releaseHeld();
    await settle();
    expect(mockServer.calls.claim).toBe(1);
    releaseHeld();
    await settle();
    expect(gate()).toBe("/onboarding");
  });

  test("a read still out after its wait is waited on again, never sent again", async () => {
    jest.useFakeTimers();
    mockServer.hold = true;
    startFirstRunHomeVisit(A);
    await jest.advanceTimersByTimeAsync(FIRST_RUN_TIMEOUT_MS + 1);
    expect(gate()).toBe("home");
    expect(retryFirstRunHomeVisit(A)).toBe(true);
    await jest.advanceTimersByTimeAsync(0);
    expect(mockServer.calls.read).toBe(1);
    releaseHeld();
    await jest.advanceTimersByTimeAsync(0);
    releaseHeld();
    await jest.advanceTimersByTimeAsync(0);
    expect(mockServer.calls.read).toBe(1);
    expect(gate()).toBe("/onboarding");
  });

  test("a second finish while the first is out waits on it", async () => {
    mockServer.hold = true;
    const first = finishFirstRun(A, "onboarding", "completed", null);
    await settle();
    const second = finishFirstRun(A, "onboarding", "completed", null);
    await settle();
    expect(mockServer.calls.finish).toBe(1);
    releaseHeld();
    expect(await first).toBe(true);
    expect(await second).toBe(true);
  });
});

describe("bundle 8 (CDA-04 = CD-02): a signed-in account never uses the device flag", () => {
  test("another account's device flag does not skip this account's welcome", async () => {
    const store: Record<string, string> = {
      "onboarding.cosmicPixel.v2.completedAt": "2026-01-01T00:00:00.000Z",
      "onboarding.ttfv.v1.seenAt": "2026-01-01T00:00:00.000Z",
    };
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (key: string) => store[key] ?? null,
      setItem: () => undefined,
    };
    try {
      expect(await visit()).toBe("/onboarding");
    } finally {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  });
});

describe("P2: without a sign-in to bind the answer to, nothing opens", () => {
  test("a token without a session_id: no read, no claim", async () => {
    mockAuth.sessionId = null;
    expect(await visit()).toBe("home");
    expect(mockServer.calls).toEqual({ read: 0, claim: 0, finish: 0 });
  });

  test("a session of another user, or an owner AuthContext has not published", async () => {
    mockAuth.sessionUser = B;
    expect(await visit()).toBe("home");
    mockAuth.sessionUser = A;
    mockAuth.published = B;
    expect(await visit()).toBe("home");
    expect(mockServer.calls).toEqual({ read: 0, claim: 0, finish: 0 });
  });

  test("the deletion fence (or any refusal) opens nothing and is not asked again", async () => {
    mockServer.failRpc = { message: "account_deletion_in_progress" };
    expect(await visit()).toBe("home");
    expect(mockServer.calls.claim).toBe(1);
    mockServer.failRpc = null;
    endFirstRunHomeVisit(A);
    expect(await visit()).toBe("home");
    expect(mockServer.calls.claim).toBe(1);
  });
});

describe("P5: the first-day grant goes back only with its receipt", () => {
  test("the home's grant has a receipt; a /ttfv the home did not open has none", async () => {
    expect(firstRunTTFVToken(A)).toBeNull();
    mockServer.rows.set(A, newRow({ onboarding_claimed_at: new Date().toISOString() }));
    expect(await visit()).toBe("/ttfv");
    const token = firstRunTTFVToken(A);
    expect(token).toBe("token-1");
    expect(firstRunTTFVToken(B)).toBeNull();

    expect(await finishFirstRun(A, "ttfv", "not_shown", "someone-else")).toBe(true);
    expect(mockServer.rows.get(A)!.ttfv_claimed_at).not.toBeNull();
    expect(await finishFirstRun(A, "ttfv", "not_shown", token)).toBe(true);
    expect(mockServer.rows.get(A)!.ttfv_claimed_at).toBeNull();

    // Handed back: a later launch may open it again.
    __resetFirstRunForTests();
    expect(await visit()).toBe("/ttfv");
  });
});

describe("pure rules", () => {
  const empty: FirstRunMarks = {
    onboardingClaimedAt: null,
    onboardingCompletedAt: null,
    ttfvClaimedAt: null,
    ttfvSeenAt: null,
  };
  const now = Date.parse("2026-10-07T00:00:00.000Z");

  test("the welcome is needed only when nobody was granted it and nobody finished it", () => {
    expect(onboardingNeeded(empty)).toBe(true);
    expect(onboardingNeeded({ ...empty, onboardingClaimedAt: "2026-10-06T00:00:00.000Z" })).toBe(false);
    expect(onboardingNeeded({ ...empty, onboardingCompletedAt: "2026-10-06T00:00:00.000Z" })).toBe(false);
  });

  test("the first-day review is open within 24 hours of the finish, or of the grant", () => {
    const hourAgo = new Date(now - 60 * 60 * 1000).toISOString();
    expect(ttfvOpen(empty, now)).toBe(false);
    expect(ttfvOpen({ ...empty, onboardingCompletedAt: hourAgo }, now)).toBe(true);
    expect(ttfvOpen({ ...empty, onboardingClaimedAt: hourAgo }, now)).toBe(true);
    expect(ttfvOpen({ ...empty, onboardingClaimedAt: hourAgo, ttfvClaimedAt: hourAgo }, now)).toBe(false);
    expect(ttfvOpen({ ...empty, onboardingClaimedAt: hourAgo, ttfvSeenAt: hourAgo }, now)).toBe(false);
    expect(ttfvOpen({ ...empty, onboardingCompletedAt: new Date(now - 2 * DAY).toISOString() }, now)).toBe(false);
  });

  test("an answer missing a field is not an answer", () => {
    expect(() => parseFirstRunMarks({ onboarding_claimed_at: null, onboarding_completed_at: null, ttfv_claimed_at: null }))
      .toThrow("ttfv_seen_at was not returned");
    expect(() => parseFirstRunMarks({ onboarding_claimed_at: "x", onboarding_completed_at: null, ttfv_claimed_at: null, ttfv_seen_at: null }))
      .toThrow("not a timestamp");
  });

  test("a stored mark never goes back to NULL, except a first-day grant handed back", () => {
    const at = "2026-10-06T00:00:00.000Z";
    const full: FirstRunMarks = { onboardingClaimedAt: at, onboardingCompletedAt: at, ttfvClaimedAt: at, ttfvSeenAt: null };
    expect(mergeFirstRunMarks(full, empty)).toEqual(full);
    expect(mergeFirstRunMarks(full, { ...full, ttfvClaimedAt: null }, true)).toEqual({ ...full, ttfvClaimedAt: null });
  });
});
