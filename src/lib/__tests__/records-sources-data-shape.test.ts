import type { SourceRow, WikiPageRow } from "../wiki/types";

type InsertRecordRow = {
  user_id: string;
  kind: string;
  body: string;
  topic: string | null;
  tags: string[];
};

const recordRows: Array<InsertRecordRow & { id: string; created_at: string }> = [];
const sourceRows: SourceRow[] = [];
const wikiRows: WikiPageRow[] = [];

jest.mock("../llm/gemini", () => ({
  callAdvisor: jest.fn(),
  callGemini: jest.fn(),
  classifyRecordTextForCrisis: jest.fn().mockResolvedValue(null),
}));

jest.mock("../progression/xp", () => ({
  awardXpSafe: jest.fn().mockResolvedValue(null),
}));

jest.mock("../knowledge/engines", () => ({
  buildMemorizedPattern: jest.fn(() => ({ user_id: "u1" })),
}));

jest.mock("../wiki/storage", () => ({
  rawClippingPath: (userId: string, slug: string) => `${userId}/${slug}.md`,
  uploadRawClipping: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../wiki/queries", () => ({
  createSource: jest.fn((input: Omit<SourceRow, "id" | "captured_at" | "ingested" | "ingested_at">) => {
    const row: SourceRow = {
      ...input,
      id: `s${sourceRows.length + 1}`,
      captured_at: "2026-06-14T03:10:00Z",
      ingested: false,
      ingested_at: null,
    };
    sourceRows.push(row);
    return Promise.resolve(row);
  }),
  listSources: jest.fn(() => Promise.resolve(sourceRows)),
  listWikiPages: jest.fn(() => Promise.resolve(wikiRows)),
}));

jest.mock("../supabase/client", () => ({
  getSupabaseClient: () => ({
    from: (table: string) => {
      if (table !== "records") throw new Error(`unexpected table ${table}`);
      return {
        insert: (row: InsertRecordRow) => ({
          select: () => ({
            single: async () => {
              const stored = {
                ...row,
                id: `r${recordRows.length + 1}`,
                created_at: "2026-06-14T03:00:00Z",
              };
              recordRows.push(stored);
              return { data: { id: stored.id }, error: null };
            },
          }),
        }),
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: async () => ({
                data: recordRows.map((r) => ({
                  kind: r.kind,
                  topic: r.topic,
                  body: r.body,
                  created_at: r.created_at,
                  tags: r.tags,
                })),
                error: null,
              }),
            }),
          }),
        }),
      };
    },
  }),
}));

import { createRecord } from "../records/create";
import { mergeEvidence } from "../persona/evidence";
import { captureFromMarkdown } from "../wiki/capture";
import { exportUserWiki } from "../wiki/export";

describe("records and sources data-shape contract", () => {
  beforeEach(() => {
    recordRows.length = 0;
    sourceRows.length = 0;
    wikiRows.length = 0;
  });

  test("createRecord and captureFromMarkdown rows remain consumable by evidence merge and wiki export", async () => {
    await createRecord({
      userId: "u1",
      locale: "en",
      kind: "journal",
      body: "Journal body that should survive export.",
      topic: "Morning review",
      tags: ["daily", "work"],
      withFollowup: false,
    });

    await captureFromMarkdown({
      userId: "u1",
      rawMd: "# Captured insight\n\nA source body that should survive source export.",
      kindOverride: "self_knowledge",
      userTags: ["taste"],
      simonRelevance: 0.6,
    });

    expect(recordRows).toHaveLength(1);
    expect(sourceRows).toHaveLength(1);

    const evidence = mergeEvidence(recordRows, sourceRows, "en");
    expect(evidence.map((row) => [row.origin, row.id, row.type, row.title, row.route])).toEqual([
      ["source", "s1", "capture", "Captured insight", "/capture"],
      ["record", "r1", "journal", "Morning review", "/capture"],
    ]);
    expect(Object.fromEntries(evidence.map((row) => [row.id, row.domain]))).toMatchObject({
      r1: "work",
      s1: "taste",
    });

    const exported = await exportUserWiki("u1", {
      asOf: "2026-06-14",
      includeRecords: true,
    });

    expect(exported.sourceCount).toBe(1);
    expect(exported.recordCount).toBe(1);
    expect(exported.prompt).toContain("[Self-Knowledge] Captured insight");
    expect(exported.prompt).toContain("tags: taste");
    expect(exported.prompt).toContain("relevance 3/5");
    expect(exported.prompt).toContain("### 2026-06-14");
    expect(exported.prompt).toMatch(/Journal\s+\S+\s+Morning review/);
    expect(exported.prompt).toContain("tags: daily, work");
    expect(exported.prompt).toContain("Journal body that should survive export.");
  });
});
