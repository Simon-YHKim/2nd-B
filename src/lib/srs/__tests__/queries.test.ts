// RLS-scoped query tests (mock Supabase). Verifies the due-query filter shape
// (user-scoped, due <= now, ordered), countDueToday, and that recordReview
// applies the scheduler then writes BOTH the updated card row and a review log,
// each scoped to the user. The scheduler itself is exercised in scheduler.test.

const NOW = new Date("2026-06-19T09:00:00.000Z");

// --- A tiny builder that records the call chain so each query's filters can
//     be asserted, while resolving the data the code under test expects. ---
type Call = { table: string; method: string; args: unknown[] };
let calls: Call[];
let dueRows: Record<string, unknown>[];
let singleCardRow: Record<string, unknown> | null;
let updatedRow: Record<string, unknown> | null;
let insertedReview: Record<string, unknown> | null;
let countValue: number | null;

function makeClient() {
  return {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      const rec = (method: string, ...args: unknown[]) => {
        calls.push({ table, method, args });
        return chain;
      };
      chain.select = (...a: unknown[]) => rec("select", ...a);
      chain.insert = (...a: unknown[]) => {
        rec("insert", ...a);
        if (table === "srs_reviews") insertedReview = a[0] as Record<string, unknown>;
        return chain;
      };
      chain.update = (...a: unknown[]) => rec("update", ...a);
      chain.eq = (...a: unknown[]) => rec("eq", ...a);
      chain.lte = (...a: unknown[]) => {
        rec("lte", ...a);
        // countDueToday awaits the builder right after .lte(); when a count is
        // staged, resolve it as a thenable. Otherwise return the chain (the
        // listDueCards path continues to .order()).
        if (countValue !== null) {
          return Promise.resolve({ count: countValue, error: null });
        }
        return chain;
      };
      chain.order = (...a: unknown[]) => {
        rec("order", ...a);
        return Promise.resolve({ data: dueRows, error: null });
      };
      // single() terminates either the read (srs_cards select) or the update.
      chain.single = () => {
        const wasUpdate = calls.some((c) => c.table === table && c.method === "update");
        if (table === "srs_reviews") return Promise.resolve({ data: null, error: null });
        if (wasUpdate) return Promise.resolve({ data: updatedRow, error: null });
        return Promise.resolve({ data: singleCardRow, error: null });
      };
      // head/count terminal for countDueToday: resolve from the last lte().
      chain.then = undefined;
      return chain;
    },
  };
}

// countDueToday uses select(..,{count,head}).eq().lte() and awaits the builder.
// Model that by making the lte() of a count query thenable.
jest.mock("../../supabase/client", () => ({ getSupabaseClient: () => makeClient() }));

import { listDueCards, countDueToday, recordReview, createCard } from "../queries";
import { reviewCard, type SrsCardState } from "../scheduler";

beforeEach(() => {
  calls = [];
  dueRows = [];
  singleCardRow = null;
  updatedRow = null;
  insertedReview = null;
  countValue = null;
});

function newCardRow(id: string): Record<string, unknown> {
  const state: SrsCardState = {
    due: NOW.toISOString(),
    stability: null,
    difficulty: null,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: 0,
    lapses: 0,
    state: 0,
    last_review: null,
  };
  return { id, user_id: "user-1", front: "hola", back: "hello", deck: "es", created_at: NOW.toISOString(), ...state };
}

describe("listDueCards (RLS-scoped, due <= now, ordered)", () => {
  test("scopes to the user, filters due<=now, orders by due ascending", async () => {
    dueRows = [newCardRow("c1"), newCardRow("c2")];
    const out = await listDueCards("user-1", NOW);
    expect(out).toHaveLength(2);
    const eq = calls.find((c) => c.method === "eq");
    expect(eq?.args).toEqual(["user_id", "user-1"]);
    const lte = calls.find((c) => c.method === "lte");
    expect(lte?.args).toEqual(["due", NOW.toISOString()]);
    const order = calls.find((c) => c.method === "order");
    expect(order?.args).toEqual(["due", { ascending: true }]);
  });
});

describe("createCard (new card is immediately due, state New)", () => {
  test("inserts a user-scoped row due=now in state 0 with zeroed reps/lapses", async () => {
    singleCardRow = newCardRow("c-new");
    updatedRow = null;
    // createCard ends on .single() after insert().select(); reuse the read path.
    await createCard("user-1", { front: "hola", back: "hello", deck: "es" }, NOW);
    const insert = calls.find((c) => c.method === "insert");
    const row = insert?.args[0] as Record<string, unknown>;
    expect(row.user_id).toBe("user-1");
    expect(row.due).toBe(NOW.toISOString());
    expect(row.state).toBe(0);
    expect(row.reps).toBe(0);
    expect(row.lapses).toBe(0);
    expect(row.front).toBe("hola");
  });
});

describe("recordReview (apply scheduler -> update card + insert review)", () => {
  test("updates the card with the scheduler result and logs the review, both user-scoped", async () => {
    singleCardRow = newCardRow("c1");
    const expected = reviewCard(singleCardRow as unknown as SrsCardState, 3, NOW).card;
    updatedRow = { ...singleCardRow, ...expected };

    await recordReview("user-1", "c1", 3, NOW);

    // The card update carried the ts-fsrs-advanced state.
    const update = calls.find((c) => c.method === "update");
    const patch = update?.args[0] as Record<string, unknown>;
    expect(patch.reps).toBe(expected.reps);
    expect(patch.state).toBe(expected.state);
    expect(patch.due).toBe(expected.due);

    // Both the update and the read were scoped to (user_id, id).
    const eqUserCalls = calls.filter((c) => c.method === "eq" && c.args[0] === "user_id");
    expect(eqUserCalls.length).toBeGreaterThanOrEqual(2);

    // A review log row was appended for this user+card with the rating.
    expect(insertedReview).toMatchObject({ user_id: "user-1", card_id: "c1", rating: 3 });
    expect(insertedReview?.reviewed_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("countDueToday", () => {
  test("returns the count from a user-scoped, due<=now head query", async () => {
    countValue = 3;
    const n = await countDueToday("user-1", NOW);
    expect(n).toBe(3);
    const eq = calls.find((c) => c.method === "eq");
    expect(eq?.args).toEqual(["user_id", "user-1"]);
    const lte = calls.find((c) => c.method === "lte");
    expect(lte?.args).toEqual(["due", NOW.toISOString()]);
  });
});
