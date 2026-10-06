// createRecord + records.system_tags (0218).
//
// What is pinned: the app's markers go to system_tags and never into the user's
// tags; a save without markers never names the column (so an un-migrated
// database sees exactly the pre-0218 insert); and when the database has no such
// column, the one retry writes the pre-0218 layout, which every pre-0218 reader
// recognizes. Nothing is remembered between saves (design P6).
// The fake table answers like PostgREST: an unknown column in the JSON body is
// PGRST204 and nothing is written.

const mockWire: Record<string, unknown>[] = [];
const mockStored: Record<string, unknown>[] = [];
let mockNoSystemTagsColumn = false;
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
              if (mockNoSystemTagsColumn && "system_tags" in wire) {
                return {
                  data: null,
                  error: {
                    code: "PGRST204",
                    message: "Could not find the 'system_tags' column of 'records' in the schema cache",
                  },
                };
              }
              mockStored.push(wire);
              return { data: { id: `rec-${mockStored.length}` }, error: null };
            },
          }),
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
  mockNoSystemTagsColumn = false;
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
    expect(mockStored).toHaveLength(1);
    expect(mockStored[0]).not.toHaveProperty("system_tags");
    // Domain tag first, then the markers, exactly as the pre-0218 interview wrote it,
    // so every pre-0218 reader still recognizes the row.
    expect(mockStored[0].tags).toEqual(["domain:growth", "interview", "recall", "screener", "entry-ui:ko"]);
    expect(res.tags).toEqual(mockStored[0].tags);

    // Nothing is remembered: the next marked save asks with the column first again.
    await createRecord(interview);
    expect(mockWire).toHaveLength(4);
    expect(mockWire[2].system_tags).toEqual(["interview", "recall", "screener", "entry-ui:ko"]);
    expect(mockWire[3]).not.toHaveProperty("system_tags");

    // And a column that appears is used on the very next save.
    mockNoSystemTagsColumn = false;
    await createRecord(interview);
    expect(mockWire).toHaveLength(5);
    expect(mockStored.at(-1)?.system_tags).toEqual(["interview", "recall", "screener", "entry-ui:ko"]);
    expect(mockStored.at(-1)?.tags).toEqual(["domain:growth"]);
  });

  test("any other insert error surfaces as it came, with no second insert", async () => {
    mockInsertError = { code: "42501", message: "new row violates row-level security policy" };
    await expect(createRecord(interview)).rejects.toMatchObject({ code: "42501" });
    expect(mockWire).toHaveLength(1);
  });
});
