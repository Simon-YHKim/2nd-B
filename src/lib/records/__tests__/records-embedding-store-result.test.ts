const mockResult = { data: null as unknown, error: null as Error | null };
const mockSelect = jest.fn();
const mockEq = jest.fn();
const mockUpdate = jest.fn();
const mockEmbed = jest.fn();
const mockRows = [{ id: "record", body: "I sorted my notes today.", created_at: "2026-10-19" }];

jest.mock("../../llm/boundary", () => ({
  EMBED_DIM: 2,
  embedTexts: (...args: unknown[]) => mockEmbed(...args),
}));
jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({ from: () => {
    let writing = false;
    const chain = {
      update: (value: unknown) => { writing = true; mockUpdate(value); return chain; },
      select: (value: string) => { mockSelect(value); return chain; },
      eq: (...args: unknown[]) => { mockEq(...args); return chain; },
      is: () => chain, order: () => chain, limit: () => chain,
      maybeSingle: async () => ({ data: mockRows[0], error: null }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(
        writing ? mockResult : { data: mockRows, error: null },
      ).then(resolve),
    };
    return chain;
  } }),
}));

import { backfillRecordEmbeddings, embedAndStoreRecord, storeRecordEmbedding } from "../records-embeddings";

beforeEach(() => {
  jest.clearAllMocks();
  mockResult.data = [{ id: "record", embedding_model: "model" }];
  mockResult.error = null;
  mockEmbed.mockReset().mockResolvedValue({ vectors: [[1, 2]], audit: { modelUsed: "model" } });
});

test("requests the stored row and scopes the write to owner and record", async () => {
  await expect(storeRecordEmbedding("owner", "record", [1, 2], "model")).resolves.toBe(true);
  expect(mockUpdate).toHaveBeenCalledWith({ embedding: "[1,2]", embedding_model: "model" });
  expect(mockEq.mock.calls).toEqual([["user_id", "owner"], ["id", "record"]]);
  expect(mockSelect).toHaveBeenCalledWith("id, embedding_model");
});

test.each([
  ["server clears the vector and model", [{ id: "record", embedding_model: null }]],
  ["RLS or deletion race returns zero rows", []],
  ["no representation", null],
  ["unexpected multiple rows", [{ id: "record", embedding_model: "model" }, { id: "other", embedding_model: "model" }]],
  ["wrong row", [{ id: "other", embedding_model: "model" }]],
  ["different stored model", [{ id: "record", embedding_model: "other-model" }]],
])("%s is not a stored embedding", async (_label, data) => {
  mockResult.data = data;
  await expect(storeRecordEmbedding("owner", "record", [1, 2], "model")).resolves.toBe(false);
  await expect(embedAndStoreRecord("owner", mockRows[0], "en", false, true)).resolves.toBe(false);
  await expect(backfillRecordEmbeddings("owner", { consented: true })).resolves.toMatchObject({ scanned: 1, embedded: 0 });
});

test("single and batch paths count a confirmed stored row", async () => {
  await expect(embedAndStoreRecord("owner", mockRows[0], "en", false, true)).resolves.toBe(true);
  await expect(backfillRecordEmbeddings("owner", { consented: true })).resolves.toMatchObject({ embedded: 1 });
});

test("batch rescue also rejects a server-cleared write", async () => {
  mockEmbed.mockRejectedValueOnce(new Error("batch unavailable"));
  mockResult.data = [{ id: "record", embedding_model: null }];
  await expect(backfillRecordEmbeddings("owner", { consented: true })).resolves.toMatchObject({ embedded: 0 });
  expect(mockEmbed).toHaveBeenCalledTimes(2);
});

test("database errors propagate from the store and single-record path", async () => {
  mockResult.error = new Error("write failed");
  await expect(storeRecordEmbedding("owner", "record", [1, 2], "model")).rejects.toThrow("write failed");
  await expect(embedAndStoreRecord("owner", mockRows[0], "en", false, true)).rejects.toThrow("write failed");
});
