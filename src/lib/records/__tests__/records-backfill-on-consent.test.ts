// REQ-260901-02 (a): backfillAllRecordEmbeddings — the consent-flip batch.
// Drives the real pagination + consent gate over a mocked supabase client and
// a mocked LLM boundary (embedTexts). The boundary mock mirrors the contract:
// one vector per input text, zero vector for red-zone texts (marked "RED"),
// and a whole-batch throw for pages marked "BOOM" (proxy 422/5xx).

jest.mock("../../llm/boundary", () => ({
  EMBED_DIM: 4,
  embedTexts: jest.fn(async ({ texts }: { texts: string[] }) => {
    if (texts.length > 1 && texts.some((t) => t.includes("BOOM"))) {
      throw new Error("proxy 422 on the batch");
    }
    return {
      vectors: texts.map((t) => (t.includes("RED") ? [0, 0, 0, 0] : [1, 2, 3, 4])),
      audit: { modelUsed: "test-embed" },
    };
  }),
}));

type Row = { id: string; topic: string | null; summary: string | null; body: string; created_at: string };

const mockDb = {
  pages: [] as Row[][],
  selectCalls: 0,
  cursors: [] as ({ col: string; val: string } | undefined)[],
  orders: [] as { col: string; ascending: unknown }[],
  updates: [] as string[],
  clears: 0,
};

function mockChain() {
  const c: Record<string, unknown> = {};
  let kind = "";
  let cursor: { col: string; val: string } | undefined;
  let updatedId: string | undefined;
  let sawNot = false;
  let eqCalls = 0;
  const self = () => c;
  c.select = self;
  c.update = () => ((kind = "update"), c);
  c.eq = (_col: string, val: string) => {
    eqCalls += 1;
    if (kind === "update" && eqCalls === 2) updatedId = val;
    return c;
  };
  c.is = self;
  c.not = () => ((sawNot = true), c);
  c.order = (col: string, opts: { ascending: unknown }) => {
    mockDb.orders.push({ col, ascending: opts?.ascending });
    return c;
  };
  c.limit = self;
  c.lt = (col: string, val: string) => ((cursor = { col, val }), c);
  c.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
    if (kind !== "update") {
      mockDb.cursors.push(cursor);
      const page = mockDb.pages[mockDb.selectCalls] ?? [];
      mockDb.selectCalls += 1;
      return Promise.resolve({ data: page, error: null }).then(resolve, reject);
    }
    if (sawNot) mockDb.clears += 1; // clearRecordEmbeddings: update().eq().not()
    else if (updatedId) mockDb.updates.push(updatedId);
    return Promise.resolve({ error: null }).then(resolve, reject);
  };
  return c;
}

jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({ from: () => mockChain() }),
}));

import { embedTexts } from "../../llm/boundary";
import { backfillAllRecordEmbeddings } from "../records-embeddings";

const row = (id: string, at: string, body = `body of ${id}`): Row => ({
  id,
  topic: null,
  summary: null,
  body,
  created_at: at,
});

beforeEach(() => {
  mockDb.pages = [];
  mockDb.selectCalls = 0;
  mockDb.cursors = [];
  mockDb.orders = [];
  mockDb.updates = [];
  mockDb.clears = 0;
  (embedTexts as jest.Mock).mockClear();
  jest.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  (console.log as jest.Mock).mockRestore();
});

describe("consent gate (D5 + 0072 posture)", () => {
  test("no consent → nothing is fetched or embedded", async () => {
    mockDb.pages = [[row("a", "t9")]];
    const r = await backfillAllRecordEmbeddings("u1", { consented: false });
    expect(r).toEqual({ rounds: 0, fetched: 0, embedded: 0, capped: false, aborted: false, cleared: false });
    expect(mockDb.selectCalls).toBe(0);
    expect(embedTexts).not.toHaveBeenCalled();
  });

  test("minor is hard-blocked even with consented: true (clamp is belt-and-braces)", async () => {
    mockDb.pages = [[row("a", "t9")]];
    const r = await backfillAllRecordEmbeddings("u1", { minor: true, consented: true });
    expect(r.fetched).toBe(0);
    expect(mockDb.selectCalls).toBe(0);
    expect(embedTexts).not.toHaveBeenCalled();
  });

  test("stillConsented false BEFORE round 1 (0072 clamp echo) → zero fetches", async () => {
    mockDb.pages = [[row("a", "t9")]];
    const r = await backfillAllRecordEmbeddings("u1", {
      consented: true,
      stillConsented: () => false,
    });
    expect(r.aborted).toBe(true);
    expect(r.fetched).toBe(0);
    expect(mockDb.selectCalls).toBe(0);
    // The final check also read false → the run cleans up (idempotent no-op here).
    expect(mockDb.clears).toBe(1);
  });
});

describe("mid-run consent revocation", () => {
  test("OFF between rounds stops the batch and the run clears its own vectors", async () => {
    mockDb.pages = [
      [row("a", "t9"), row("b", "t8")],
      [row("c", "t7"), row("d", "t6")],
    ];
    const probes = [true, false]; // round 1 allowed, round 2 probe says OFF
    const r = await backfillAllRecordEmbeddings("u1", {
      consented: true,
      batchSize: 2,
      stillConsented: () => probes.shift() ?? false,
    });
    expect(r.rounds).toBe(1);
    expect(r.embedded).toBe(2);
    expect(r.aborted).toBe(true);
    expect(r.cleared).toBe(true);
    expect(mockDb.updates).toEqual(["a", "b"]); // round 1 stored…
    expect(mockDb.clears).toBe(1); // …and the run deleted them after the OFF
    expect(mockDb.selectCalls).toBe(1); // round 2 never fetched
  });

  test("consent that stays ON never triggers a self-clear", async () => {
    mockDb.pages = [[row("a", "t9")]];
    const r = await backfillAllRecordEmbeddings("u1", {
      consented: true,
      batchSize: 2,
      stillConsented: () => true,
    });
    expect(r.aborted).toBe(false);
    expect(r.cleared).toBe(false);
    expect(mockDb.clears).toBe(0);
  });
});

describe("pagination", () => {
  test("walks every page newest-first with a strict created_at cursor, stops on the short page", async () => {
    mockDb.pages = [
      [row("a", "t9"), row("b", "t8")],
      [row("c", "t7"), row("d", "t6")],
      [row("e", "t5")],
    ];
    const r = await backfillAllRecordEmbeddings("u1", { consented: true, batchSize: 2 });
    expect(r).toMatchObject({ rounds: 3, fetched: 5, embedded: 5, capped: false });
    // Predicate pins (mutation-tested by review: an ascending order or an id
    // cursor must fail here, not just "some rows came back").
    expect(mockDb.orders).toEqual([
      { col: "created_at", ascending: false },
      { col: "created_at", ascending: false },
      { col: "created_at", ascending: false },
    ]);
    expect(mockDb.cursors).toEqual([
      undefined,
      { col: "created_at", val: "t8" },
      { col: "created_at", val: "t6" },
    ]);
    expect(mockDb.updates).toEqual(["a", "b", "c", "d", "e"]);
  });

  test("a red-zone row does not block older rows and is never stored", async () => {
    mockDb.pages = [[row("red", "t9", "RED text"), row("ok", "t8")], []];
    const r = await backfillAllRecordEmbeddings("u1", { consented: true, batchSize: 2 });
    expect(r.fetched).toBe(2);
    expect(r.embedded).toBe(1);
    expect(mockDb.updates).toEqual(["ok"]);
    // The cursor stepped PAST the sticky row instead of refetching it forever.
    expect(mockDb.cursors[1]).toEqual({ col: "created_at", val: "t8" });
  });

  test("an empty-text row is paged past without an embed call for it", async () => {
    mockDb.pages = [[row("empty", "t9", "   "), row("ok", "t8")], []];
    const r = await backfillAllRecordEmbeddings("u1", { consented: true, batchSize: 2 });
    expect(r.embedded).toBe(1);
    expect(embedTexts).toHaveBeenCalledTimes(1);
    expect((embedTexts as jest.Mock).mock.calls[0][0].texts).toEqual(["body of ok"]);
  });
});

describe("batch failure falls back to per-record (with consent carried)", () => {
  test("a throwing batch rescues its innocent rows one by one", async () => {
    // Page of 2 where ONE text bombs the whole batch call: the fallback must
    // re-try per record — and it only can if `consented` reaches
    // embedAndStoreRecord (review found the 5th argument had been dropped,
    // turning the rescue loop into a silent no-op).
    mockDb.pages = [[row("boom", "t9", "BOOM text"), row("ok", "t8")], []];
    const r = await backfillAllRecordEmbeddings("u1", { consented: true, batchSize: 2 });
    // Batch call throws, then 2 per-record calls; "boom" alone embeds fine.
    expect((embedTexts as jest.Mock).mock.calls.map((c) => c[0].texts.length)).toEqual([2, 1, 1]);
    expect(r.embedded).toBe(2);
    expect(mockDb.updates.sort()).toEqual(["boom", "ok"]);
  });
});

describe("cost guard", () => {
  test("maxRounds caps the run and says so", async () => {
    mockDb.pages = [
      [row("a", "t9"), row("b", "t8")],
      [row("c", "t7"), row("d", "t6")],
      [row("e", "t5"), row("f", "t4")],
    ];
    const r = await backfillAllRecordEmbeddings("u1", { consented: true, batchSize: 2, maxRounds: 2 });
    expect(r.capped).toBe(true);
    expect(r.rounds).toBe(2);
    expect(r.fetched).toBe(4);
  });

  test("a run that did work logs its batch counts once", async () => {
    mockDb.pages = [[row("a", "t9")]];
    await backfillAllRecordEmbeddings("u1", { consented: true, batchSize: 2 });
    const lines = (console.log as jest.Mock).mock.calls.map((c) => String(c[0]));
    expect(lines.filter((l) => l.startsWith("[records-embedding] backfill"))).toHaveLength(1);
    expect(lines.find((l) => l.includes("fetched=1"))).toBeTruthy();
  });
});
