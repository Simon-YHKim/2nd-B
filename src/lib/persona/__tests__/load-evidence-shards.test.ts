// Verifiable-receipt loader: turns `record:<id>` evidence citations (0060) into
// openable EvidenceShards. Mocks supabase per the load-tier-shifts pattern.

import { recordIdsFromCitations } from "../evidence";

interface QueryResult {
  data: unknown;
  error: { message: string } | null;
}

let fixture: QueryResult = { data: [], error: null };
let throwOnRead = false;

function chainable() {
  if (throwOnRead) throw new Error("boom");
  const promise = Promise.resolve(fixture);
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    order: () => chain,
    then: (...a: unknown[]) => promise.then(...(a as Parameters<typeof promise.then>)),
    catch: (...a: unknown[]) => promise.catch(...(a as Parameters<typeof promise.catch>)),
    finally: (...a: unknown[]) => promise.finally(...(a as Parameters<typeof promise.finally>)),
  };
  return chain;
}

jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({ from: () => ({ select: () => chainable() }) }),
}));

import { loadEvidenceShards } from "../load-evidence-shards";

beforeEach(() => {
  fixture = { data: [], error: null };
  throwOnRead = false;
});

describe("recordIdsFromCitations (pure)", () => {
  test("extracts record: ids, dedupes preserving order, ignores non-record refs", () => {
    expect(
      recordIdsFromCitations([
        "record:a",
        "source:s1",
        "record:b",
        "doi:10.1/x",
        "record:a", // dup
        "kb:foo",
      ]),
    ).toEqual(["a", "b"]);
  });
  test("trims and is case-insensitive on the prefix; empty in → empty out", () => {
    expect(recordIdsFromCitations(["  Record:xyz  "])).toEqual(["xyz"]);
    expect(recordIdsFromCitations([])).toEqual([]);
    expect(recordIdsFromCitations(["record:"])).toEqual([]); // no id after prefix
  });
});

describe("loadEvidenceShards", () => {
  test("no record citations -> [] (no DB read needed)", async () => {
    expect(await loadEvidenceShards(["source:s1", "doi:10.1/x"], "ko")).toEqual([]);
  });

  test("maps record citations to shards, preserves citation order, drops unresolved", async () => {
    // DB returns rows out of order and is MISSING 'b' (e.g. deleted record).
    fixture = {
      data: [
        { id: "c", kind: "journal", topic: "Third", created_at: "2026-05-03T00:00:00Z", tags: [] },
        { id: "a", kind: "audit_response", topic: "First", created_at: "2026-05-01T00:00:00Z", tags: ["interview"] },
      ],
      error: null,
    };
    const shards = await loadEvidenceShards(["record:a", "record:b", "record:c"], "en");
    // 'b' dropped (no dangling receipt); order follows citations (a, then c).
    expect(shards.map((s) => s.id)).toEqual(["a", "c"]);
    expect(shards[0]!.title).toBe("First");
    expect(shards[0]!.route).toBe("/interview"); // audit_response + interview tag
    expect(shards[1]!.title).toBe("Third");
  });

  test("a read failure degrades to [] (never blocks the screen)", async () => {
    throwOnRead = true;
    expect(await loadEvidenceShards(["record:a"], "ko")).toEqual([]);
  });
});
