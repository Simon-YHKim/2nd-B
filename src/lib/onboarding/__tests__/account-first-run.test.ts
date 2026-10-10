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

// Invoke route functions and commit their effects explicitly, without a renderer.
const mockRouteParams: { auto?: string | string[] } = {};
const mockEntry = { cursor: 0, slots: [] as Array<{ current: unknown }>, effects: [] as Array<() => void> };
jest.mock("react", () => ({
  ...jest.requireActual("react"),
  useRef: (initial: unknown) => {
    const index = mockEntry.cursor++;
    return mockEntry.slots[index] ?? (mockEntry.slots[index] = { current: initial });
  },
  useState: (initial: unknown) => {
    const index = mockEntry.cursor++;
    const slot = mockEntry.slots[index] ?? (mockEntry.slots[index] = { current: initial });
    return [slot.current, (next: unknown) => { slot.current = next; }];
  },
  useEffect: (effect: () => void) => { mockEntry.effects.push(effect); },
}));
jest.mock("expo-router", () => ({ Redirect: "Redirect", useLocalSearchParams: () => mockRouteParams }));
jest.mock("@/lib/nav/go-home", () => ({ RedirectHome: "RedirectHome" }));
jest.mock("@/lib/auth/AuthContext", () => ({
  useAuth: () => ({ userId: mockAuth.published, sessionId: mockAuth.sessionId, loading: false, isMinor: false }),
}));
jest.mock("@/screens/deepspace/onboarding/TTFVScreen", () => ({ TTFVScreen: "TTFVScreen" }));

import type { ReactElement } from "react";
import TtfvRoute from "../../../app/ttfv";

function mountDestination() {
  const route = TtfvRoute();
  if (typeof route.type !== "function") return route;
  const entry = route.type as (props: unknown) => ReactElement<Record<string, unknown>>;
  mockEntry.cursor = 0;
  const firstMount = mockEntry.slots.length === 0;
  const pending = entry(route.props);
  if (firstMount) expect(pending.props.mode).not.toBe("authenticated");
  for (const effect of mockEntry.effects.splice(0)) effect();
  mockEntry.cursor = 0;
  const destination = entry(route.props);
  mockEntry.effects.length = 0;
  return destination;
}

// What the app sees of the sign-in and of AuthContext's published owner.
const mockAuth = {
  published: "user-a" as string | null,
  sessionUser: "user-a" as string | null,
  sessionId: "s1" as string | null,
  failure: null as "throw" | "error" | "timeout" | null,
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
      getSession: () => {
        if (mockAuth.failure === "throw") throw new Error("temporary session read failure");
        if (mockAuth.failure === "timeout") return new Promise(() => undefined);
        if (mockAuth.failure === "error") return Promise.resolve({ data: { session: null }, error: new Error("unavailable") });
        return Promise.resolve({
          data: {
            session: mockAuth.sessionUser
              ? { user: { id: mockAuth.sessionUser }, access_token: mockJwt(mockAuth.sessionId) }
              : null,
          },
          error: null,
        });
      },
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
  FIRST_RUN_HELD_COOLDOWN_MS,
  FIRST_RUN_MAX_READS,
  FIRST_RUN_TIMEOUT_MS,
  __resetFirstRunForTests,
  endFirstRunHomeVisit,
  finishFirstRun,
  firstRunDone,
  firstRunHomeGateFor,
  firstRunSnapshot,
  loadFirstRunMarks,
  mergeFirstRunMarks,
  onboardingNeeded,
  parseClaimAnswer,
  parseFirstRunMarks,
  refocusFirstRunHomeVisit,
  startFirstRunHomeVisit,
  syncFirstRunSession,
  subscribeFirstRun,
  takeFirstRunTTFVToken,
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

/** A second app instance (another tab) on the same server and sign-in. */
function anotherTab(): typeof import("../account-first-run") {
  let other: typeof import("../account-first-run") | null = null;
  jest.isolateModules(() => {
    other = jest.requireActual("../account-first-run") as typeof import("../account-first-run");
  });
  return other!;
}

beforeEach(() => {
  __resetFirstRunForTests();
  mockAuth.published = A;
  mockAuth.sessionUser = A;
  mockAuth.sessionId = "s1";
  mockAuth.failure = null;
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
    expect(takeFirstRunTTFVToken(A)).toBe("token-1");
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
      expect(refocusFirstRunHomeVisit(A)).toBe(true);
      await settle();
      expect(gate()).toBe("home");
      expect(mockServer.calls.read).toBe(attempt);
    }
    expect(refocusFirstRunHomeVisit(A)).toBe(false);
    expect(mockServer.calls.read).toBe(FIRST_RUN_MAX_READS);
  });

  test("a later read that answers opens the welcome on that entry", async () => {
    mockServer.failRead = new Error("503");
    expect(await visit()).toBe("home");
    mockServer.failRead = null;
    expect(refocusFirstRunHomeVisit(A)).toBe(true);
    await settle();
    expect(gate()).toBe("/onboarding");
  });

  test("a visit that decided 'home' with an answer is not decided again on focus", async () => {
    mockServer.rows.set(A, newRow({ onboarding_claimed_at: longAgo, onboarding_completed_at: longAgo }));
    expect(await visit()).toBe("home");
    expect(refocusFirstRunHomeVisit(A)).toBe(false);
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
    expect(takeFirstRunTTFVToken(A)).toBeNull();
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
    expect(refocusFirstRunHomeVisit(A)).toBe(true);
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
    expect(takeFirstRunTTFVToken(A)).toBeNull();
    mockServer.rows.set(A, newRow({ onboarding_claimed_at: new Date().toISOString() }));
    expect(await visit()).toBe("/ttfv");
    expect(takeFirstRunTTFVToken(B)).toBeNull();
    const token = takeFirstRunTTFVToken(A);
    expect(token).toBe("token-1");

    expect(await finishFirstRun(A, "ttfv", "not_shown", "someone-else")).toBe(true);
    expect(mockServer.rows.get(A)!.ttfv_claimed_at).not.toBeNull();
    expect(await finishFirstRun(A, "ttfv", "not_shown", token)).toBe(true);
    expect(mockServer.rows.get(A)!.ttfv_claimed_at).toBeNull();

    // Handed back: a later launch may open it again.
    __resetFirstRunForTests();
    expect(await visit()).toBe("/ttfv");
  });

  test("BA-02: the receipt goes to the one visit that takes it, never to a later visit", async () => {
    mockServer.rows.set(A, newRow({ onboarding_claimed_at: new Date().toISOString() }));
    expect(await visit()).toBe("/ttfv");
    const token = takeFirstRunTTFVToken(A);
    expect(token).toBe("token-1");
    // The same screen opened again in this app (a direct visit) gets nothing.
    expect(takeFirstRunTTFVToken(A)).toBeNull();

    // The first visit showed content, but its report never reached the server.
    mockServer.failRpc = { message: "network" };
    expect(await finishFirstRun(A, "ttfv", "shown", token)).toBe(false);
    mockServer.failRpc = null;
    expect(mockServer.rows.get(A)!.ttfv_seen_at).toBeNull();

    // A later visit still has no receipt, so it has nothing to hand back, and the
    // grant keeps the review from opening by itself again: here, and on the next launch.
    expect(takeFirstRunTTFVToken(A)).toBeNull();
    endFirstRunHomeVisit(A);
    expect(await visit()).toBe("home");
    __resetFirstRunForTests();
    expect(await visit()).toBe("home");
    expect(mockServer.claimed.filter((kind) => kind === "ttfv")).toHaveLength(1);
  });

  test("BA-01 / FR-01: a grant its own visit handed back is asked for again in the same sign-in, with no reset", async () => {
    mockServer.rows.set(A, newRow({ onboarding_claimed_at: new Date().toISOString() }));
    expect(await visit()).toBe("/ttfv");
    const first = takeFirstRunTTFVToken(A);
    expect(first).toBe("token-1");
    expect(await finishFirstRun(A, "ttfv", "not_shown", first)).toBe(true);
    expect(mockServer.rows.get(A)!.ttfv_claimed_at).toBeNull();

    // No __resetFirstRunForTests(): the same app, the same sign-in. The home the
    // person comes back to from the review stays home (BA-08); the next visit asks.
    endFirstRunHomeVisit(A);
    expect(await visit()).toBe("home");
    expect(refocusFirstRunHomeVisit(A)).toBe(true);
    await settle();
    expect(gate()).toBe("/ttfv");
    expect(takeFirstRunTTFVToken(A)).toBe("token-2");
    expect(mockServer.calls.read).toBe(1);
  });

  test("a hand-back the server did not apply leaves the grant used, here and on the next visit", async () => {
    mockServer.rows.set(A, newRow({ onboarding_claimed_at: new Date().toISOString() }));
    expect(await visit()).toBe("/ttfv");
    const token = takeFirstRunTTFVToken(A);
    // Another device already showed it: the server refuses to hand this grant back.
    mockServer.rows.get(A)!.ttfv_seen_at = new Date().toISOString();
    expect(await finishFirstRun(A, "ttfv", "not_shown", token)).toBe(true);
    endFirstRunHomeVisit(A);
    expect(await visit()).toBe("home");
    expect(mockServer.claimed.filter((kind) => kind === "ttfv")).toHaveLength(1);
  });

  test("FR-01: while the visit that holds the grant can still show, a second tab is held home", async () => {
    mockServer.rows.set(A, newRow({ onboarding_claimed_at: new Date().toISOString() }));
    let other: typeof import("../account-first-run") | null = null;
    jest.isolateModules(() => {
      other = jest.requireActual("../account-first-run") as typeof import("../account-first-run");
    });
    const tabB = other!;
    // Tab A opens the review; its read fails, but the visit is still on screen
    // (it may retry), so it has not handed the grant back.
    expect(await visit()).toBe("/ttfv");
    const first = takeFirstRunTTFVToken(A);
    tabB.startFirstRunHomeVisit(A);
    await settle();
    expect(tabB.firstRunHomeGateFor(tabB.firstRunSnapshot(), A, true)).toBe("home");
    // A's retry shows content: one screen showed it, once.
    expect(await finishFirstRun(A, "ttfv", "shown", first)).toBe(true);
    expect(mockServer.rows.get(A)!.ttfv_seen_at).not.toBeNull();
    expect(mockServer.tokens).toBe(1);
  });

  test("BA-08: a review that keeps failing never pulls the person straight back, and every hand-back reopens it later", async () => {
    mockServer.rows.set(A, newRow({ onboarding_claimed_at: new Date().toISOString() }));
    expect(await visit()).toBe("/ttfv");
    // More rounds than the reads a sign-in gets: no count of grants closes the slot.
    for (let grant = 1; grant <= FIRST_RUN_MAX_READS + 1; grant += 1) {
      const token = takeFirstRunTTFVToken(A);
      expect(token).toBe(`token-${grant}`);
      expect(await finishFirstRun(A, "ttfv", "not_shown", token)).toBe(true);
      // The person left the review: the home they come back to stays home.
      endFirstRunHomeVisit(A);
      expect(await visit()).toBe("home");
      // A later visit of the same sign-in asks again.
      expect(refocusFirstRunHomeVisit(A)).toBe(true);
      await settle();
      expect(gate()).toBe("/ttfv");
    }
    expect(mockServer.calls.claim).toBe(FIRST_RUN_MAX_READS + 2);
  });

  test("BA-08: the return stays home whether the hand-back lands before or after it is decided", async () => {
    mockServer.rows.set(A, newRow({ onboarding_claimed_at: new Date().toISOString() }));
    expect(await visit()).toBe("/ttfv");
    const token = takeFirstRunTTFVToken(A);
    endFirstRunHomeVisit(A);
    // The hand-back is still out when the home the person came back to decides.
    mockServer.hold = true;
    const handedBack = finishFirstRun(A, "ttfv", "not_shown", token);
    expect(await visit()).toBe("home");
    mockServer.hold = false;
    releaseHeld();
    expect(await handedBack).toBe(true);
    expect(gate()).toBe("home");
    // It lands after: the next visit asks again.
    expect(refocusFirstRunHomeVisit(A)).toBe(true);
    await settle();
    expect(gate()).toBe("/ttfv");
    expect(takeFirstRunTTFVToken(A)).toBe("token-2");
  });
});

describe("BA-07: a grant for a review already shown opens nothing", () => {
  test("a direct /ttfv shows the review while the home's claim is out: the late grant is not followed", async () => {
    mockServer.rows.set(A, newRow({ onboarding_claimed_at: new Date().toISOString() }));
    mockServer.hold = true;
    startFirstRunHomeVisit(A);
    await settle();
    releaseHeld(); // the read
    await settle();
    expect(mockServer.calls.claim).toBe(1); // stored as token-1; its answer is held
    // The same app opens /ttfv directly. The claim is out, so it has no receipt.
    expect(takeFirstRunTTFVToken(A)).toBeNull();
    const shown = finishFirstRun(A, "ttfv", "shown", null);
    await settle();
    const [claimAnswer, finishAnswer] = mockServer.held.splice(0);
    finishAnswer(); // the review was seen...
    await settle();
    claimAnswer(); // ...then the grant comes back, within its 8 seconds
    await settle();
    expect(await shown).toBe(true);
    expect(gate()).toBe("home");
    mockServer.hold = false;
    endFirstRunHomeVisit(A);
    expect(await visit()).toBe("home");
    expect(takeFirstRunTTFVToken(A)).toBeNull();
  });

  test("a grant whose home already left is closed once the review is learned to be seen", async () => {
    mockServer.rows.set(A, newRow({ onboarding_claimed_at: new Date().toISOString() }));
    mockServer.hold = true;
    startFirstRunHomeVisit(A);
    await settle();
    releaseHeld(); // the read
    await settle();
    // The home that asked leaves before the answer; the grant arrives for no one.
    endFirstRunHomeVisit(A);
    releaseHeld();
    await settle();
    // A /ttfv opened directly shows the review.
    mockServer.hold = false;
    expect(takeFirstRunTTFVToken(A)).toBeNull();
    expect(await finishFirstRun(A, "ttfv", "shown", null)).toBe(true);
    // The next home visit does not open the review the account has already seen.
    expect(await visit()).toBe("home");
    expect(takeFirstRunTTFVToken(A)).toBeNull();
    expect(mockServer.claimed).toEqual(["ttfv"]);
  });
});

describe("D7-01: a first-day grant handed back elsewhere is learned on a later focus", () => {
  test("a tab held home by another tab's grant opens the review on its next focus after the hand-back", async () => {
    mockServer.rows.set(A, newRow({ onboarding_claimed_at: new Date().toISOString() }));
    const tabB = anotherTab();
    const gateB = () => tabB.firstRunHomeGateFor(tabB.firstRunSnapshot(), A, true);
    expect(await visit()).toBe("/ttfv");
    const token = takeFirstRunTTFVToken(A);
    tabB.startFirstRunHomeVisit(A);
    await settle();
    expect(gateB()).toBe("home");
    // Tab A's review could not load and its visit ended: the grant goes back.
    expect(await finishFirstRun(A, "ttfv", "not_shown", token)).toBe(true);
    // Tab B's home comes back into view: no loader, one fresh read, then the review.
    expect(tabB.refocusFirstRunHomeVisit(A)).toBe(false);
    expect(gateB()).toBe("home");
    await settle(); // the sign-in and the fresh read...
    await settle(); // ...then the visit it starts, and its claim
    expect(gateB()).toBe("/ttfv");
    expect(tabB.takeFirstRunTTFVToken(A)).toBe("token-2");
  });

  test("successful held reads stay available across later focus visits", async () => {
    jest.useFakeTimers();
    const now = new Date().toISOString();
    // Another device holds the grant; this app never did.
    mockServer.rows.set(A, newRow({ onboarding_claimed_at: now, ttfv_claimed_at: now }));
    expect(await visit()).toBe("home");
    for (let focus = 0; focus < FIRST_RUN_MAX_READS + 2; focus += 1) {
      jest.advanceTimersByTime(FIRST_RUN_HELD_COOLDOWN_MS);
      expect(refocusFirstRunHomeVisit(A)).toBe(false);
      expect(gate()).toBe("home");
      await settle();
    }
    expect(mockServer.calls.read).toBe(FIRST_RUN_MAX_READS + 3);
    expect(mockServer.calls.claim).toBe(0);
  });
});

describe("D7-02: a new sign-in of the same account is decided again on the next focus", () => {
  test("a mounted home decided for s1 is decided again for s2, without a remount", async () => {
    // s1: nothing could be read, three times. The home stays home and stops asking.
    mockServer.failRead = new Error("503");
    expect(await visit()).toBe("home");
    for (let attempt = 2; attempt <= FIRST_RUN_MAX_READS; attempt += 1) {
      expect(refocusFirstRunHomeVisit(A)).toBe(true);
      await settle();
    }
    expect(refocusFirstRunHomeVisit(A)).toBe(false);
    await settle();
    expect(mockServer.calls.read).toBe(FIRST_RUN_MAX_READS);
    // The same account signs in again (s2); the owner never changed, so nothing
    // remounted the home. Its next focus checks the sign-in off screen.
    mockServer.failRead = null;
    mockAuth.sessionId = "s2";
    expect(refocusFirstRunHomeVisit(A)).toBe(false);
    await settle();
    expect(gate()).toBe("/onboarding");
    expect(mockServer.calls.read).toBe(FIRST_RUN_MAX_READS + 1);
  });

  test("the same sign-in on a focus that can open nothing sends nothing", async () => {
    mockServer.rows.set(A, newRow({ onboarding_claimed_at: longAgo, onboarding_completed_at: longAgo }));
    expect(await visit()).toBe("home");
    expect(refocusFirstRunHomeVisit(A)).toBe(false);
    await settle();
    expect(gate()).toBe("home");
    expect(mockServer.calls).toEqual({ read: 1, claim: 0, finish: 0 });
  });
});

describe("BA-03: a home that stays mounted decides again when it comes back into view", () => {
  test("a welcome held by another tab does not keep the next visit from the first-day review", async () => {
    mockServer.hold = true;
    startFirstRunHomeVisit(A);
    await settle();
    mockServer.rows.get(A)!.onboarding_claimed_at = new Date().toISOString();
    releaseHeld(); // the stale read: "needed"
    await settle();
    releaseHeld(); // our welcome claim: held by the other tab
    await settle();
    mockServer.hold = false;
    // This visit stays home and does not go straight on to the review...
    expect(gate()).toBe("home");
    expect(mockServer.claimed).toEqual(["onboarding"]);
    // ...but the next one (the home focused again, still mounted) does.
    expect(refocusFirstRunHomeVisit(A)).toBe(true);
    expect(gate()).toBe("wait");
    await settle();
    expect(gate()).toBe("/ttfv");
    expect(mockServer.claimed).toEqual(["onboarding", "ttfv"]);
  });

  test("a grant handed back is asked for again on the next focus of the same mounted home", async () => {
    mockServer.rows.set(A, newRow({ onboarding_claimed_at: new Date().toISOString() }));
    expect(await visit()).toBe("/ttfv");
    const token = takeFirstRunTTFVToken(A);
    // The home stayed mounted; the gate it holds is the route it opened.
    expect(await finishFirstRun(A, "ttfv", "not_shown", token)).toBe(true);
    // Coming back from the review is the return: it stays home (BA-08)...
    expect(refocusFirstRunHomeVisit(A)).toBe(true);
    await settle();
    expect(gate()).toBe("home");
    // ...and the next focus of the same mounted home asks again.
    expect(refocusFirstRunHomeVisit(A)).toBe(true);
    await settle();
    expect(gate()).toBe("/ttfv");
    expect(takeFirstRunTTFVToken(A)).toBe("token-2");
  });

  test("a focus that can open nothing changes nothing on screen and sends nothing", async () => {
    mockServer.rows.set(A, newRow({ onboarding_claimed_at: new Date().toISOString() }));
    expect(await visit()).toBe("/ttfv");
    takeFirstRunTTFVToken(A);
    // Back from the review that showed content: the home decides again, once, and stays.
    expect(refocusFirstRunHomeVisit(A)).toBe(true);
    await settle();
    expect(gate()).toBe("home");
    const calls = { ...mockServer.calls };
    expect(refocusFirstRunHomeVisit(A)).toBe(false);
    expect(gate()).toBe("home");
    await settle();
    expect(gate()).toBe("home");
    expect(mockServer.calls).toEqual(calls);
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

  test("a screen is gone through once the welcome was finished, or the review was seen", () => {
    const at = "2026-10-06T00:00:00.000Z";
    expect(firstRunDone(null, "ttfv")).toBe(false);
    expect(firstRunDone({ ...empty, onboardingClaimedAt: at }, "onboarding")).toBe(false);
    expect(firstRunDone({ ...empty, onboardingCompletedAt: at }, "onboarding")).toBe(true);
    expect(firstRunDone({ ...empty, ttfvClaimedAt: at }, "ttfv")).toBe(false);
    expect(firstRunDone({ ...empty, ttfvSeenAt: at }, "ttfv")).toBe(true);
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

describe("K1: late shown closes an unused home grant in either response order", () => {
  beforeEach(() => {
    delete mockRouteParams.auto;
    mockEntry.slots.length = 0;
    mockEntry.effects.length = 0;
  });

  test("navigation issued, then late shown, then destination mount never mounts automatic content", async () => {
    mockServer.rows.set(A, newRow({ onboarding_claimed_at: new Date().toISOString() }));
    mockServer.hold = true;
    startFirstRunHomeVisit(A, "s1");
    await settle();
    releaseHeld();
    await settle();
    const finish = finishFirstRun(A, "ttfv", "shown", null, "s1");
    await settle();
    const [claimReply, finishReply] = mockServer.held.splice(0);
    claimReply();
    await settle();
    expect(gate()).toBe("/ttfv");
    // Navigation is already queued; changing home's decision cannot cancel it.
    mockRouteParams.auto = "";
    finishReply();
    await finish;
    await settle();
    expect(gate()).toBe("home");
    const destination = mountDestination();
    expect(destination.type).toBe("RedirectHome");
    expect(mockServer.calls.claim).toBe(1);
  });

  test.each(["", "forged", ["", "forged"]])("a marker without a receipt only returns home (%j)", (auto) => {
    mockRouteParams.auto = auto;
    const destination = mountDestination();
    expect(destination.type).toBe("RedirectHome");
    expect(mockServer.calls.claim).toBe(0);
    expect(mockServer.calls.finish).toBe(0);
  });

  test("an automatic destination consumes once and passes the receipt to the content visit", async () => {
    mockServer.rows.set(A, newRow({ onboarding_claimed_at: new Date().toISOString() }));
    expect(await visit()).toBe("/ttfv");
    mockRouteParams.auto = "";
    const destination = mountDestination();
    expect(destination.type).toBe("TTFVScreen");
    expect(destination.props.mode).toBe("authenticated");
    const take = destination.props.takeReceipt as (owner: string) => string | null;
    expect(take(A)).toBe("token-1");
    expect(takeFirstRunTTFVToken(A, "s1")).toBeNull();
    // Effect replay must not turn a successfully acquired receipt into null.
    expect(mountDestination().props.mode).toBe("authenticated");
  });

  test("an unmarked direct URL still opens content without a receipt", () => {
    const destination = mountDestination();
    expect(destination.type).toBe("TTFVScreen");
    expect(destination.props.mode).toBe("authenticated");
    expect((destination.props.takeReceipt as (owner: string) => string | null)(A)).toBeNull();
  });

  test.each(["finish-first", "claim-first"])("%s", async (order) => {
    const published = jest.fn();
    subscribeFirstRun(() => published(gate()));
    mockServer.rows.set(A, newRow({ onboarding_claimed_at: new Date().toISOString() }));
    mockServer.hold = true;
    startFirstRunHomeVisit(A);
    await settle();
    releaseHeld(); // read -> claim is sent
    await settle();
    expect(takeFirstRunTTFVToken(A)).toBeNull(); // the direct visit has no receipt
    const finish = finishFirstRun(A, "ttfv", "shown", null);
    await settle();
    const [claimReply, finishReply] = mockServer.held.splice(0);
    if (order === "claim-first") {
      claimReply();
      await settle();
      expect(gate()).toBe("/ttfv"); // applied, but no screen took it yet
      finishReply();
    } else {
      finishReply();
      await settle();
      claimReply();
    }
    await finish;
    await settle();
    expect(gate()).toBe("home");
    expect(published).toHaveBeenLastCalledWith("home");
    expect(takeFirstRunTTFVToken(A)).toBeNull();
    mockServer.hold = false;
    expect(await visit()).toBe("home");
    expect(mockServer.calls.claim).toBe(1);
  });
});

describe("K2: a normal held answer can learn another tab's hand-back", () => {
  test("focus bursts and a timed-out refresh share one request; only failed requests spend the budget", async () => {
    jest.useFakeTimers();
    const now = new Date().toISOString();
    mockServer.rows.set(A, newRow({ onboarding_claimed_at: now, ttfv_claimed_at: now }));
    expect(await visit()).toBe("home");
    mockServer.hold = true;
    for (let i = 0; i < 8; i += 1) refocusFirstRunHomeVisit(A);
    await settle();
    expect(mockServer.calls.read).toBe(2);
    jest.advanceTimersByTime(FIRST_RUN_TIMEOUT_MS + 1);
    await settle();
    refocusFirstRunHomeVisit(A);
    await settle();
    expect(mockServer.calls.read).toBe(2);
    releaseHeld();
    await settle();
    mockServer.hold = false;
    refocusFirstRunHomeVisit(A); // cooldown from the last focus
    await settle();
    expect(mockServer.calls.read).toBe(2);
    mockServer.failRead = new Error("503");
    for (let i = 0; i < FIRST_RUN_MAX_READS + 2; i += 1) {
      jest.advanceTimersByTime(FIRST_RUN_HELD_COOLDOWN_MS);
      refocusFirstRunHomeVisit(A);
      await settle();
    }
    expect(mockServer.calls.read).toBe(2 + FIRST_RUN_MAX_READS);
    expect(mockServer.calls.claim).toBe(0);
  });

  test.each(["error", "timeout"])("an ambiguous %s claim is never reopened by a later focus", async (failure) => {
    jest.useFakeTimers();
    mockServer.rows.set(A, newRow({ onboarding_claimed_at: new Date().toISOString() }));
    mockServer.hold = true;
    startFirstRunHomeVisit(A);
    await settle();
    if (failure === "error") mockServer.failRpc = { message: "unavailable" };
    releaseHeld();
    await settle();
    if (failure === "timeout") {
      jest.advanceTimersByTime(FIRST_RUN_TIMEOUT_MS + 1);
      await settle();
    }
    releaseHeld();
    await settle();
    mockServer.hold = false;
    mockServer.failRpc = null;
    const row = mockServer.rows.get(A)!;
    row.ttfv_claimed_at = null;
    row.token = null;
    for (let i = 0; i < 4; i += 1) {
      jest.advanceTimersByTime(FIRST_RUN_HELD_COOLDOWN_MS);
      refocusFirstRunHomeVisit(A);
      await settle();
    }
    expect(gate()).toBe("home");
    expect(mockServer.calls).toEqual({ read: 1, claim: 1, finish: 0 });
  });

  test("claim reasons are preserved and unknown or inconsistent answers fail closed", () => {
    const answer = { granted: false, reason: "held", token: null, session_id: "s1", marks: mockMarks(newRow()) };
    expect(parseClaimAnswer(answer).reason).toBe("held");
    expect(() => parseClaimAnswer({ ...answer, reason: "unknown" })).toThrow("no known reason");
    expect(() => parseClaimAnswer({ ...answer, granted: true })).toThrow("disagrees");
  });

  test.each([false, true])("three held refreshes then a hand-back (lost claim race: %s)", async (race) => {
    jest.useFakeTimers();
    mockServer.rows.set(A, newRow({ onboarding_claimed_at: new Date().toISOString() }));
    if (race) {
      mockServer.hold = true;
      startFirstRunHomeVisit(A);
      await settle(); // this tab read open, before the other tab claimed
    }
    const row = mockServer.rows.get(A)!;
    row.ttfv_claimed_at = new Date().toISOString();
    row.token = "other-tab";
    if (race) {
      releaseHeld();
      await settle();
      releaseHeld(); // normal held, not a failed or ambiguous claim
      await settle();
      mockServer.hold = false;
    } else {
      expect(await visit()).toBe("home");
    }
    for (let focus = 0; focus < 3; focus += 1) {
      jest.advanceTimersByTime(5_000);
      refocusFirstRunHomeVisit(A);
      await settle();
      expect(gate()).toBe("home");
    }
    expect(mockServer.calls.read).toBe(4);
    row.ttfv_claimed_at = null;
    row.token = null;
    jest.advanceTimersByTime(5_000);
    refocusFirstRunHomeVisit(A);
    await settle();
    await settle(); // refreshed marks start a new visit, which then claims
    expect(gate()).toBe("/ttfv");
    expect(takeFirstRunTTFVToken(A)).toBe("token-1");
    expect(mockServer.calls.read).toBe(5);
    expect(mockServer.calls.claim).toBe(race ? 2 : 1);
  });
});

describe("K3: login identity changes without a focus or owner change", () => {
  // Value: protects=failed session lookup stays home and recovers on focus;
  // fails_when=expected identity turns an unknown answer into a final refusal;
  // why_new=older retry tests omit the identity passed by the real home hook;
  // seam=existing exported home-visit and snapshot boundaries.
  test.each(["throw", "error", "timeout"] as const)("a published session recovers after a %s without a remount", async (failure) => {
    jest.useFakeTimers();
    syncFirstRunSession(A, "s1");
    mockAuth.failure = failure;
    startFirstRunHomeVisit(A, "s1");
    await settle();
    if (failure === "timeout") {
      jest.advanceTimersByTime(FIRST_RUN_TIMEOUT_MS + 1);
      await settle();
    }
    expect(firstRunHomeGateFor(firstRunSnapshot(), A, true, "s1")).toBe("home");
    expect(mockServer.calls).toEqual({ read: 0, claim: 0, finish: 0 });

    mockAuth.failure = null;
    expect(refocusFirstRunHomeVisit(A)).toBe(true);
    await settle();
    expect(firstRunHomeGateFor(firstRunSnapshot(), A, true, "s1")).toBe("/onboarding");
    expect(mockServer.calls).toEqual({ read: 1, claim: 1, finish: 0 });
  });

  test.each(["throw", "error", "timeout"] as const)("a %s during a focus retry keeps the published session on its home result", async (failure) => {
    jest.useFakeTimers();
    syncFirstRunSession(A, "s1");
    mockServer.failRead = new Error("503");
    startFirstRunHomeVisit(A, "s1");
    await settle();
    expect(firstRunHomeGateFor(firstRunSnapshot(), A, true, "s1")).toBe("home");

    mockAuth.failure = failure;
    expect(refocusFirstRunHomeVisit(A)).toBe(true);
    await settle();
    if (failure === "timeout") {
      jest.advanceTimersByTime(FIRST_RUN_TIMEOUT_MS + 1);
      await settle();
    }
    expect(firstRunHomeGateFor(firstRunSnapshot(), A, true, "s1")).toBe("home");
    expect(mockServer.calls).toEqual({ read: 1, claim: 0, finish: 0 });

    mockAuth.failure = null;
    mockServer.failRead = null;
    expect(refocusFirstRunHomeVisit(A)).toBe(true);
    await settle();
    expect(firstRunHomeGateFor(firstRunSnapshot(), A, true, "s1")).toBe("/onboarding");
    expect(mockServer.calls).toEqual({ read: 2, claim: 1, finish: 0 });
  });

  test.each([true, false])("a focus preserves the published session when auth resolves another login (retryable: %s)", async (retryable) => {
    syncFirstRunSession(A, "s1");
    if (retryable) mockServer.failRead = new Error("503");
    else mockServer.rows.set(A, newRow({ onboarding_claimed_at: longAgo, onboarding_completed_at: longAgo }));
    startFirstRunHomeVisit(A, "s1");
    await settle();
    mockServer.failRead = null;
    mockAuth.sessionId = "s2";
    const calls = { ...mockServer.calls };
    for (let focus = 0; focus < 2; focus += 1) {
      refocusFirstRunHomeVisit(A);
      await settle();
      expect(firstRunHomeGateFor(firstRunSnapshot(), A, true, "s1")).toBe("home");
      expect(mockServer.calls).toEqual(calls);
    }
    syncFirstRunSession(A, "s2");
    startFirstRunHomeVisit(A, "s2");
    await settle();
    expect(firstRunHomeGateFor(firstRunSnapshot(), A, true, "s2")).toBe(retryable ? "/onboarding" : "home");
    expect(mockServer.calls.read).toBe(calls.read + 1);
  });

  test("a published session stops retrying after three unresolved reads", async () => {
    syncFirstRunSession(A, "s1");
    mockAuth.failure = "throw";
    startFirstRunHomeVisit(A, "s1");
    await settle();
    for (let attempt = 2; attempt <= FIRST_RUN_MAX_READS; attempt += 1) {
      expect(refocusFirstRunHomeVisit(A)).toBe(true);
      await settle();
      expect(firstRunHomeGateFor(firstRunSnapshot(), A, true, "s1")).toBe("home");
    }
    mockAuth.failure = null;
    expect(refocusFirstRunHomeVisit(A)).toBe(false);
    await settle();
    expect(firstRunHomeGateFor(firstRunSnapshot(), A, true, "s1")).toBe("home");
    expect(mockServer.calls).toEqual({ read: 0, claim: 0, finish: 0 });
  });

  test.each([false, true])("an exhausted lookup budget resets only for a different published login (new login: %s)", async (newLogin) => {
    syncFirstRunSession(A, "s1");
    mockAuth.failure = "throw";
    startFirstRunHomeVisit(A, "s1");
    await settle();
    for (let attempt = 2; attempt <= FIRST_RUN_MAX_READS; attempt += 1) {
      expect(refocusFirstRunHomeVisit(A)).toBe(true);
      await settle();
    }

    // Token refresh republishes the same session_id; a new sign-in changes it.
    const published = newLogin ? "s2" : "s1";
    mockAuth.sessionId = published;
    syncFirstRunSession(A, published);
    startFirstRunHomeVisit(A, published);
    await settle(); // the first lookup after publication still fails
    expect(firstRunHomeGateFor(firstRunSnapshot(), A, true, published)).toBe("home");
    expect(mockServer.calls).toEqual({ read: 0, claim: 0, finish: 0 });

    mockAuth.failure = null;
    expect(refocusFirstRunHomeVisit(A)).toBe(newLogin);
    await settle();
    expect(firstRunHomeGateFor(firstRunSnapshot(), A, true, published)).toBe(newLogin ? "/onboarding" : "home");
    expect(mockServer.calls).toEqual({ read: newLogin ? 1 : 0, claim: newLogin ? 1 : 0, finish: 0 });
  });

  test("an older marks load cannot restore the store before an older finish resumes", async () => {
    mockServer.rows.set(A, newRow({ onboarding_claimed_at: new Date().toISOString() }));
    expect(await visit()).toBe("/ttfv");
    const receipt = takeFirstRunTTFVToken(A, "s1");
    const calls = { ...mockServer.calls };
    const reading = loadFirstRunMarks(A);
    const finishing = finishFirstRun(A, "ttfv", "not_shown", receipt, "s1");
    mockAuth.sessionId = "s2";
    syncFirstRunSession(A, "s2");
    expect(await reading).toBeNull();
    expect(await finishing).toBe(false);
    expect(mockServer.calls).toEqual(calls);
    expect(mockServer.rows.get(A)!.ttfv_claimed_at).not.toBeNull();
  });

  test("a finish already resolving s1 cannot recreate s1 after s2 was published", async () => {
    mockServer.rows.set(A, newRow({ onboarding_claimed_at: new Date().toISOString() }));
    expect(await visit()).toBe("/ttfv");
    const receipt = takeFirstRunTTFVToken(A, "s1");
    const finishing = finishFirstRun(A, "ttfv", "not_shown", receipt, "s1");
    mockAuth.sessionId = "s2";
    syncFirstRunSession(A, "s2");
    expect(await finishing).toBe(false);
    expect(mockServer.calls.finish).toBe(0);
    expect(mockServer.rows.get(A)!.ttfv_claimed_at).not.toBeNull();
  });

  test.each([null, "s1"])("a home published for %s cannot claim in a different actual session", async (published) => {
    mockAuth.sessionId = "s2";
    syncFirstRunSession(A, published);
    startFirstRunHomeVisit(A, published);
    await settle();
    expect(firstRunHomeGateFor(firstRunSnapshot(), A, true, published)).toBe("home");
    expect(mockServer.calls).toEqual({ read: 0, claim: 0, finish: 0 });
  });

  test.each([false, true])("s2 cannot inherit s1's route or receipt (taken: %s)", async (taken) => {
    mockServer.rows.set(A, newRow({ onboarding_claimed_at: new Date().toISOString() }));
    expect(await visit()).toBe("/ttfv");
    const receipt = taken ? takeFirstRunTTFVToken(A, "s1") : "token-1";
    mockAuth.sessionId = "s2";
    expect(firstRunHomeGateFor(firstRunSnapshot(), A, true, "s2")).toBe("wait");
    // Same input change as the driving effect, with no refocus.
    syncFirstRunSession(A, "s2");
    expect(firstRunSnapshot().home).toBeNull();
    expect(takeFirstRunTTFVToken(A, "s2")).toBeNull();
    expect(await finishFirstRun(A, "ttfv", "not_shown", receipt, "s1")).toBe(false);
    expect(await finishFirstRun(A, "ttfv", "shown", receipt, "s1")).toBe(false);
    expect(mockServer.calls.finish).toBe(0);
    startFirstRunHomeVisit(A, "s2");
    await settle();
    expect(firstRunHomeGateFor(firstRunSnapshot(), A, true, "s2")).toBe("home");
    expect(mockServer.calls.read).toBe(2);
    expect(mockServer.calls.claim).toBe(1);
  });

  test("take checks the published session before the home's effect runs", async () => {
    mockServer.rows.set(A, newRow({ onboarding_claimed_at: new Date().toISOString() }));
    expect(await visit()).toBe("/ttfv");
    mockAuth.sessionId = "s2";
    expect(takeFirstRunTTFVToken(A, "s2")).toBeNull();
    expect(firstRunSnapshot().home).toBeNull();
    expect(takeFirstRunTTFVToken(A, "s1")).toBeNull();
  });

  test("refresh of the same session preserves the grant; absent identity cannot use it", async () => {
    mockServer.rows.set(A, newRow({ onboarding_claimed_at: new Date().toISOString() }));
    expect(await visit()).toBe("/ttfv");
    syncFirstRunSession(A, "s1");
    expect(firstRunHomeGateFor(firstRunSnapshot(), A, true, "s1")).toBe("/ttfv");
    expect(await finishFirstRun(A, "ttfv", "shown", null, null)).toBe(false);
    expect(takeFirstRunTTFVToken(A, null)).toBeNull();
    expect(mockServer.calls.finish).toBe(0);
  });

  test("a decision waiting on the old session cannot restore its discarded store", async () => {
    startFirstRunHomeVisit(A, "s1");
    mockAuth.sessionId = "s2";
    syncFirstRunSession(A, "s2");
    startFirstRunHomeVisit(A, "s2");
    await settle();
    expect(firstRunHomeGateFor(firstRunSnapshot(), A, true, "s2")).toBe("/onboarding");
    expect(mockServer.calls).toEqual({ read: 1, claim: 1, finish: 0 });
  });

  test("a new session reruns a terminal home decision without focus", async () => {
    mockServer.failRead = new Error("503");
    for (let i = 0; i < FIRST_RUN_MAX_READS; i += 1) expect(await visit()).toBe("home");
    mockServer.failRead = null;
    mockAuth.sessionId = "s2";
    syncFirstRunSession(A, "s2");
    startFirstRunHomeVisit(A, "s2");
    await settle();
    expect(firstRunHomeGateFor(firstRunSnapshot(), A, true, "s2")).toBe("/onboarding");
    expect(mockServer.calls.read).toBe(FIRST_RUN_MAX_READS + 1);
  });
});
