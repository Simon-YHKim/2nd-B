// createRecord + records.system_tags (0218).
//
// What is pinned: the app's markers go to system_tags and never into the user's
// tags; a save without markers never names the column (so an un-migrated
// database sees exactly the pre-0218 insert); and when the database has no such
// column, the one retry writes the pre-0218 layout, which every pre-0218 reader
// recognizes. Nothing is remembered between saves (design P6).
// The fake table answers like PostgREST: an unknown column in the JSON body is
// PGRST204 and nothing is written. PGRST204 comes from PostgREST's schema cache,
// so the fake keeps the table and the cache apart: a cache can be behind a table
// that already has the column (gate ST-01), and a select naming the column is
// resolved by Postgres itself (42703 only when the table really lacks it).

const mockPgrst204 = {
  code: "PGRST204",
  message: "Could not find the 'system_tags' column of 'records' in the schema cache",
};
const mockWire: Record<string, unknown>[] = [];
const mockStored: Record<string, unknown>[] = [];
let mockProbes = 0;
/** The table has no system_tags, and the cache agrees. */
let mockNoSystemTagsColumn = false;
/** The table has the column; this many inserts naming it still meet a cache that does not. */
let mockStaleCacheInserts = 0;
/** The table has no column any more; the cache still lists it, so Postgres answers 42703. */
let mockDroppedColumnCachedInsert = false;
let mockProbeError: { code: string; message: string } | null = null;
let mockInsertError: { code: string; message: string } | null = null;

jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({
    from: (table: string) => {
      if (table !== "records") throw new Error(`unexpected table: ${table}`);
      return {
        insert: (row: Record<string, unknown>) => ({
          select: () => ({
            single: async () => {
              // What supabase-js actually sends: JSON drops `undefined`.
              const wire = JSON.parse(JSON.stringify(row)) as Record<string, unknown>;
              mockWire.push(wire);
              if (mockInsertError) return { data: null, error: mockInsertError };
              if ("system_tags" in wire) {
                if (mockNoSystemTagsColumn) return { data: null, error: mockPgrst204 };
                if (mockStaleCacheInserts > 0) {
                  mockStaleCacheInserts -= 1;
                  return { data: null, error: mockPgrst204 };
                }
                if (mockDroppedColumnCachedInsert) {
                  return {
                    data: null,
                    error: { code: "42703", message: 'column "system_tags" of relation "records" does not exist' },
                  };
                }
              }
              mockStored.push(wire);
              return { data: { id: `rec-${mockStored.length}` }, error: null };
            },
          }),
        }),
        select: (columns: string) => ({
          limit: async (count: number) => {
            mockProbes += 1;
            expect([columns, count]).toEqual(["system_tags", 0]);
            if (mockProbeError) return { data: null, error: mockProbeError };
            if (mockNoSystemTagsColumn || mockDroppedColumnCachedInsert) {
              return { data: null, error: { code: "42703", message: "column records.system_tags does not exist" } };
            }
            return { data: [], error: null };
          },
        }),
      };
    },
  }),
}));
jest.mock("../../llm/boundary", () => ({
  callAdvisor: jest.fn(),
  callLlm: jest.fn(),
  classifyRecordTextForCrisis: jest.fn().mockResolvedValue(null),
}));
jest.mock("../../progression/xp", () => ({ awardXpSafe: jest.fn().mockResolvedValue(null) }));
jest.mock("../../persona/load-domain-levels", () => ({ invalidateDomainLevels: jest.fn() }));
jest.mock("../../env", () => ({ getEnv: () => ({ EXPO_PUBLIC_LLM_MODE: "mock" }) }));
jest.mock("../records-embeddings", () => ({ embedAndStoreRecord: jest.fn(), recordsEmbeddingAllowed: jest.fn() }));
jest.mock("../../supabase/privacy", () => ({ fetchPrivacyPrefs: jest.fn() }));
jest.mock("../../knowledge/engines", () => ({ buildMemorizedPattern: jest.fn() }));

import { createRecord } from "../create";
import { firstLightSystemTags, recallInterviewSystemTags } from "../system-tags";

beforeEach(() => {
  mockWire.length = 0;
  mockStored.length = 0;
  mockProbes = 0;
  mockNoSystemTagsColumn = false;
  mockStaleCacheInserts = 0;
  mockDroppedColumnCachedInsert = false;
  mockProbeError = null;
  mockInsertError = null;
});

const interview = {
  userId: "owner-a",
  locale: "ko" as const,
  kind: "audit_response" as const,
  body: "Q: 그때 어땠어요?\n\nA: 밴드를 했다",
  auditPeriod: "school",
  domainIntent: "growth" as const,
  withFollowup: false,
  systemTags: recallInterviewSystemTags("ko"),
};

describe("createRecord - 0218 system_tags", () => {
  test("the interview's markers go to system_tags, never into the user's tags", async () => {
    const res = await createRecord(interview);
    expect(mockStored).toHaveLength(1);
    expect(mockStored[0].tags).toEqual(["domain:growth"]);
    expect(mockStored[0].system_tags).toEqual(["interview", "recall", "screener", "entry-ui:ko"]);
    expect(res.tags).toEqual(["domain:growth"]);
  });

  test("TTFV's markers go to system_tags; the user's own tags stay in tags", async () => {
    await createRecord({
      userId: "owner-a",
      locale: "en",
      kind: "note",
      body: "First record review: This record still feels like me.",
      withFollowup: false,
      tags: ["mine"],
      systemTags: firstLightSystemTags("affirm"),
    });
    const stored = mockStored[0];
    expect(stored.system_tags).toEqual(["first_light", "first_light:affirm"]);
    expect((stored.tags as string[]).slice(1)).toEqual(["mine"]);
    expect(stored.tags as string[]).not.toContain("first_light");
  });

  test("a save with no markers never names the column", async () => {
    await createRecord({ userId: "owner-a", locale: "en", kind: "note", body: "plain", withFollowup: false, tags: ["x"] });
    expect(mockWire).toHaveLength(1);
    expect(mockWire[0]).not.toHaveProperty("system_tags");
  });

  test("a domain: tag handed in as a marker is dropped, never stored as a system tag", async () => {
    await createRecord({ ...interview, systemTags: ["domain:career", "interview"] });
    expect(mockStored[0].system_tags).toEqual(["interview"]);
    expect(mockStored[0].tags).toEqual(["domain:growth"]);
  });

  test("without the column, one retry writes the pre-0218 layout and nothing is lost", async () => {
    mockNoSystemTagsColumn = true;
    const res = await createRecord(interview);
    expect(mockWire).toHaveLength(2);
    expect(mockWire[0].system_tags).toEqual(["interview", "recall", "screener", "entry-ui:ko"]);
    // The PGRST204 was checked against the table before the fallback (gate ST-01).
    expect(mockProbes).toBe(1);
    expect(mockStored).toHaveLength(1);
    expect(mockStored[0]).not.toHaveProperty("system_tags");
    // Domain tag first, then the markers, exactly as the pre-0218 interview wrote it,
    // so every pre-0218 reader still recognizes the row.
    expect(mockStored[0].tags).toEqual(["domain:growth", "interview", "recall", "screener", "entry-ui:ko"]);
    expect(res.tags).toEqual(mockStored[0].tags);

    // Nothing is remembered: the next marked save asks with the column first again.
    await createRecord(interview);
    expect(mockWire).toHaveLength(4);
    expect(mockProbes).toBe(2);
    expect(mockWire[2].system_tags).toEqual(["interview", "recall", "screener", "entry-ui:ko"]);
    expect(mockWire[3]).not.toHaveProperty("system_tags");

    // And a column that appears is used on the very next save.
    mockNoSystemTagsColumn = false;
    await createRecord(interview);
    expect(mockWire).toHaveLength(5);
    expect(mockProbes).toBe(2);
    expect(mockStored.at(-1)?.system_tags).toEqual(["interview", "recall", "screener", "entry-ui:ko"]);
    expect(mockStored.at(-1)?.tags).toEqual(["domain:growth"]);
  });

  // Gate ST-01 (2026-10-07). Right after 0218 is applied, the table has the column
  // while PostgREST's schema cache has not reloaded, and an insert naming it gets
  // PGRST204. Treating that as "no column" stored the markers in `tags` of a table
  // that has system_tags, for good: readers with the column then miss the row's
  // markers and /discover shows them as the user's topics.
  test("a schema cache behind the table never gets the pre-0218 layout; the insert is asked once more", async () => {
    mockStaleCacheInserts = 1;
    const res = await createRecord(interview);
    expect(mockProbes).toBe(1);
    expect(mockWire).toHaveLength(2);
    for (const wire of mockWire) expect(wire.system_tags).toEqual(["interview", "recall", "screener", "entry-ui:ko"]);
    expect(mockStored).toHaveLength(1);
    expect(mockStored[0].system_tags).toEqual(["interview", "recall", "screener", "entry-ui:ko"]);
    expect(mockStored[0].tags).toEqual(["domain:growth"]);
    expect(res.tags).toEqual(["domain:growth"]);
  });

  test("a cache still behind on that second try fails the save, and nothing is written", async () => {
    mockStaleCacheInserts = 2;
    await expect(createRecord(interview)).rejects.toMatchObject({ code: "PGRST204" });
    expect(mockProbes).toBe(1);
    expect(mockWire).toHaveLength(2);
    for (const wire of mockWire) expect(wire).toHaveProperty("system_tags");
    expect(mockStored).toHaveLength(0);
  });

  test("a check that cannot tell fails the save with the first error, and nothing is written", async () => {
    mockStaleCacheInserts = 1;
    mockProbeError = { code: "PGRST000", message: "Could not connect to the database" };
    await expect(createRecord(interview)).rejects.toMatchObject({ code: "PGRST204" });
    expect(mockProbes).toBe(1);
    expect(mockWire).toHaveLength(1);
    expect(mockStored).toHaveLength(0);
  });

  test("a 42703 from the insert itself (the column is gone, the cache still lists it) takes the pre-0218 write", async () => {
    mockDroppedColumnCachedInsert = true;
    const res = await createRecord(interview);
    expect(mockProbes).toBe(0);
    expect(mockWire).toHaveLength(2);
    expect(mockStored).toHaveLength(1);
    expect(mockStored[0]).not.toHaveProperty("system_tags");
    expect(mockStored[0].tags).toEqual(["domain:growth", "interview", "recall", "screener", "entry-ui:ko"]);
    expect(res.tags).toEqual(mockStored[0].tags);
  });

  test("any other insert error surfaces as it came, with no second insert", async () => {
    mockInsertError = { code: "42501", message: "new row violates row-level security policy" };
    await expect(createRecord(interview)).rejects.toMatchObject({ code: "42501" });
    expect(mockWire).toHaveLength(1);
  });
});
