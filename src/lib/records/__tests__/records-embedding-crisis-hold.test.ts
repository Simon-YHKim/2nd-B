type StoredRow = {
  id: string; user_id: string; body: string; created_at: string;
  topic?: string | null; summary?: string | null; ai_followup?: unknown;
};

const mockRows: StoredRow[] = [];
const mockWrites: Array<{ id: string; userId: string; value: unknown }> = [];
const mockEmbed = jest.fn();
let mockReadError: Error | null = null;

jest.mock("../../llm/boundary", () => ({
  EMBED_DIM: 2,
  embedTexts: (...args: unknown[]) => mockEmbed(...args),
}));
jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({
    from: (table: string) => {
      if (table !== "records" && table !== "records_ai_eligible") throw new Error("unexpected table");
      let fields = "";
      const filters: Record<string, unknown> = {};
      let before: string | undefined;
      let limit = 50;
      let update: unknown;
      const query = {
        select: (projection: string) => { fields = projection; return query; },
        eq: (key: string, value: unknown) => { filters[key] = value; return query; },
        is: () => query,
        order: () => query,
        limit: (value: number) => { limit = value; return query; },
        lt: (_key: string, value: string) => { before = value; return query; },
        update: (value: unknown) => { update = value; return query; },
        maybeSingle: async () => ({ data: mockRows.find(r => r.user_id === filters.user_id && r.id === filters.id) ?? null, error: mockReadError }),
        then: (resolve: (value: unknown) => unknown) => {
          if (update !== undefined) {
            mockWrites.push({ id: filters.id as string, userId: filters.user_id as string, value: update });
            return Promise.resolve(resolve({ data: [{ id: filters.id, ...(update as object) }], error: null }));
          }
          const selected = mockRows.filter((r) => r.user_id === filters.user_id && (!before || r.created_at < before))
            .slice(0, limit).map((row) => Object.fromEntries(fields.split(",").map((f) => [f.trim(), row[f.trim() as keyof StoredRow]])));
          return Promise.resolve(resolve({ data: selected, error: mockReadError }));
        },
      };
      return query;
    },
  }),
}));

import { backfillRecordEmbeddings, embedAndStoreRecord } from "../records-embeddings";

const row: StoredRow = { id: "plain", user_id: "owner", body: "I sorted my work notes today.", created_at: "2026-10-15T10:00:00Z" };
const vectorReply = { vectors: [[1, 2]], audit: { modelUsed: "test-embedding" } };

beforeEach(() => {
  mockRows.length = 0;
  mockWrites.length = 0;
  mockReadError = null;
  mockEmbed.mockReset().mockResolvedValue(vectorReply);
});

test.each([
  ["ko", "자살하고 싶어요"],
  ["en", "I want to kill myself"],
  ["es", "quiero suicidarme"],
  ["pt", "quero me matar"],
  ["id", "ingin bunuh diri"],
  ["medical", "지금 숨을 못 쉬고 있어요"],
  ["threat", "Someone is threatening me with a knife right now"],
])("direct embedding holds an untruncated %s signal", async (_locale, signal) => {
  const original = { ...row, body: `${"ordinary work note. ".repeat(150)}\n${signal}` };
  expect(original.body.indexOf(signal)).toBeGreaterThan(2000);
  const before = JSON.stringify(original);
  expect(await embedAndStoreRecord("owner", original, "en", false, true)).toBe(false);
  expect(mockEmbed).not.toHaveBeenCalled();
  expect(mockWrites).toEqual([]);
  expect(JSON.stringify(original)).toBe(before);
});

test.each(["topic", "summary", "body"] as const)("checks the full %s independently", async (field) => {
  expect(await embedAndStoreRecord("owner", { ...row, [field]: "I want to kill myself" }, "en", false, true)).toBe(false);
  expect(mockEmbed).not.toHaveBeenCalled();
});

test("a stored RED result holds ordinary-looking text without reclassifying by model", async () => {
  expect(await embedAndStoreRecord("owner", { ...row, ai_followup: { zone: "red" } }, "en", false, true)).toBe(false);
  expect(mockEmbed).not.toHaveBeenCalled();
  expect(mockWrites).toEqual([]);
});

test("a signal completed across fields beyond the cap is held in direct and batch paths", async () => {
  const split = { ...row, topic: `${"ordinary note. ".repeat(150)}I want to`, summary: "die", body: "ordinary split" };
  expect(await embedAndStoreRecord("owner", split, "en", false, true)).toBe(false);
  mockRows.push(split);
  expect(await backfillRecordEmbeddings("owner", { consented: true })).toMatchObject({ scanned: 0, embedded: 0, fetched: 1 });
  expect(mockEmbed).not.toHaveBeenCalled();
  expect(mockWrites).toEqual([]);
});

test("ordinary records retain the consent and minor gates", async () => {
  mockRows.push(row);
  expect(await embedAndStoreRecord("owner", row, "en", false, false)).toBe(false);
  expect(await embedAndStoreRecord("owner", row, "en", true, true)).toBe(false);
  expect(mockEmbed).not.toHaveBeenCalled();
  expect(await embedAndStoreRecord("owner", row, "en", false, true)).toBe(true);
  expect(mockWrites).toEqual([{ id: "plain", userId: "owner", value: { embedding: "[1,2]", embedding_model: "test-embedding" } }]);
});

test("backfill omits held rows before batching and preserves vector-to-record alignment", async () => {
  mockRows.push(
    { ...row, id: "held-local", body: `${"work note. ".repeat(250)}I want to kill myself` },
    { ...row, id: "first" },
    { ...row, id: "held-result", ai_followup: { zone: "red" } },
    { ...row, id: "second", body: "I walked to the market.", created_at: "2026-10-14T10:00:00Z" },
    { ...row, id: "other-owner", user_id: "another-owner" },
  );
  mockEmbed.mockResolvedValue({ vectors: [[1, 2], [3, 4]], audit: { modelUsed: "test-model" } });
  const before = JSON.stringify(mockRows);
  expect(await backfillRecordEmbeddings("owner", { consented: true })).toEqual({ scanned: 2, embedded: 2, fetched: 4, oldest: "2026-10-14T10:00:00Z" });
  expect(mockEmbed).toHaveBeenCalledTimes(1);
  expect(mockEmbed.mock.calls[0][0].texts).toEqual([row.body, "I walked to the market."]);
  expect(mockWrites).toEqual([
    { id: "first", userId: "owner", value: { embedding: "[1,2]", embedding_model: "test-model" } },
    { id: "second", userId: "owner", value: { embedding: "[3,4]", embedding_model: "test-model" } },
  ]);
  expect(JSON.stringify(mockRows)).toBe(before);
});

test("batch failure retries only ordinary records, with consent intact", async () => {
  mockRows.push({ ...row, id: "held", ai_followup: { zone: "red" } }, row);
  mockEmbed.mockRejectedValueOnce(new Error("batch unavailable")).mockResolvedValue(vectorReply);
  expect(await backfillRecordEmbeddings("owner", { consented: true })).toMatchObject({ scanned: 1, embedded: 1, fetched: 2 });
  expect(mockEmbed).toHaveBeenCalledTimes(2);
  for (const [request] of mockEmbed.mock.calls) expect(request.texts).toEqual([row.body]);
  expect(mockWrites.map((w) => w.id)).toEqual(["plain"]);
});

test("an all-held page advances the cursor without calling a model", async () => {
  mockRows.push({ ...row, ai_followup: { zone: "red" } });
  expect(await backfillRecordEmbeddings("owner", { consented: true })).toEqual({ scanned: 0, embedded: 0, fetched: 1, oldest: row.created_at });
  expect(mockEmbed).not.toHaveBeenCalled();
  expect(mockWrites).toEqual([]);
});

test("a failed row read does not send anything", async () => {
  mockRows.push(row);
  mockReadError = new Error("unavailable");
  await expect(backfillRecordEmbeddings("owner", { consented: true })).rejects.toThrow("unavailable");
  expect(mockEmbed).not.toHaveBeenCalled();
});
