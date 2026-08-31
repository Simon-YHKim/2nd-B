// REQ-260901-02 (a): backfillAllRecordEmbeddings — the consent-flip batch.
// Drives the real pagination + consent gate over a mocked supabase client and
// a mocked LLM boundary (embedTexts). The boundary mock mirrors the contract:
// one vector per input text, zero vector for red-zone texts (marked "RED").

jest.mock("../../llm/boundary", () => ({
  EMBED_DIM: 4,
  embedTexts: jest.fn(async ({ texts }: { texts: string[] }) => ({
    vectors: texts.map((t) => (t.includes("RED") ? [0, 0, 0, 0] : [1, 2, 3, 4])),
    audit: { modelUsed: "test-embed" },
  })),
}));

const mockDb = {
  pages: [] as Row[][],
  selectCalls: 0,
  cursors: [] as (string | undefined)[],
  updates: [] as string[],
};

type Row = { id: string; topic: string | null; summary: string | null; body: string; created_at: string };

function mockChain() {
  const c: Record<string, unknown> = {};
  let kind = "";
  let cursor: string | undefined;
  let updatedId: string | undefined;
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
  c.not = self;
  c.order = self;
  c.limit = self;
  c.lt = (_col: string, val: string) => ((cursor = val), c);
  c.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
    if (kind !== "update") {
      mockDb.cursors.push(cursor);
      const page = mockDb.pages[mockDb.selectCalls] ?? [];
      mockDb.selectCalls += 1;
      return Promise.resolve({ data: page, error: null }).then(resolve, reject);
    }
    if (updatedId) mockDb.updates.push(updatedId);
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
  mockDb.updates = [];
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
    expect(r).toEqual({ rounds: 0, fetched: 0, embedded: 0, capped: false });
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
});

describe("pagination", () => {
  test("walks every page with the created_at keyset cursor and stops on the short page", async () => {
    mockDb.pages = [
      [row("a", "t9"), row("b", "t8")],
      [row("c", "t7"), row("d", "t6")],
      [row("e", "t5")],
    ];
    const r = await backfillAllRecordEmbeddings("u1", { consented: true, batchSize: 2 });
    expect(r).toEqual({ rounds: 3, fetched: 5, embedded: 5, capped: false });
    expect(mockDb.cursors).toEqual([undefined, "t8", "t6"]);
    expect(mockDb.updates).toEqual(["a", "b", "c", "d", "e"]);
  });

  test("a red-zone row does not block older rows and is never stored", async () => {
    mockDb.pages = [[row("red", "t9", "RED text"), row("ok", "t8")], []];
    const r = await backfillAllRecordEmbeddings("u1", { consented: true, batchSize: 2 });
    expect(r.fetched).toBe(2);
    expect(r.embedded).toBe(1);
    expect(mockDb.updates).toEqual(["ok"]);
    // The cursor stepped PAST the sticky row instead of refetching it forever.
    expect(mockDb.cursors).toEqual([undefined, "t8"]);
  });

  test("an empty-text row is paged past without an embed call for it", async () => {
    mockDb.pages = [[row("empty", "t9", "   "), row("ok", "t8")], []];
    const r = await backfillAllRecordEmbeddings("u1", { consented: true, batchSize: 2 });
    expect(r.embedded).toBe(1);
    expect(embedTexts).toHaveBeenCalledTimes(1);
    expect((embedTexts as jest.Mock).mock.calls[0][0].texts).toEqual(["body of ok"]);
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
