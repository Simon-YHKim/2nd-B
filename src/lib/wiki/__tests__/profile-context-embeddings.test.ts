jest.mock("../../llm/boundary", () => ({ EMBED_DIM: 2, embedTexts: jest.fn() }));
jest.mock("../queries", () => ({ listWikiPages: jest.fn(), insertInferredLinks: jest.fn() }));
const writes: Array<{ field: string; value: string }> = [];
const from = jest.fn(() => {
  const query: Record<string, unknown> = {
    update: jest.fn(() => query),
    eq: (field: string, value: string) => { writes.push({ field, value }); return query; },
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve),
  };
  return query;
});
jest.mock("../../supabase/client", () => ({ getSupabaseClient: () => ({ from }) }));

import { embedTexts } from "../../llm/boundary";
import { listWikiPages } from "../queries";
import { backfillEmbeddings, embedAndStorePage } from "../embeddings";
import type { WikiPageRow } from "../types";

const page = (id: string, managed = false): WikiPageRow => ({
  id, user_id: "owner-a", slug: id, kind: "source", title: id, body_md: `Body for ${id}`,
  frontmatter: managed ? { profile_context_import_id: "batch-1" } : {},
  tags: [], source_id: id, created_at: "2026-10-09T00:00:00Z", updated_at: "2026-10-09T00:00:00Z",
});

beforeEach(() => {
  jest.clearAllMocks();
  writes.length = 0;
  jest.mocked(embedTexts).mockImplementation(async (input) => ({
    vectors: input.texts.map(() => [1, 2]), audit: { modelUsed: "test-model" },
  }) as Awaited<ReturnType<typeof embedTexts>>);
});

describe("profile import embedding guard", () => {
  test("direct embedding stops before the provider call and database write", async () => {
    await expect(embedAndStorePage("owner-a", page("managed", true))).resolves.toBe(false);
    expect(embedTexts).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  test("an all-import backfill sends no text to the provider", async () => {
    jest.mocked(listWikiPages).mockResolvedValue([page("managed", true)]);
    await expect(backfillEmbeddings("owner-a")).resolves.toEqual({ scanned: 0, embedded: 0 });
    expect(embedTexts).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  test("imports do not consume the batch limit and only ordinary text reaches the provider", async () => {
    jest.mocked(listWikiPages).mockResolvedValue([page("managed", true), page("ordinary"), page("later")]);
    await expect(backfillEmbeddings("owner-a", { limit: 1 })).resolves.toEqual({ scanned: 1, embedded: 1 });
    expect(embedTexts).toHaveBeenCalledWith(expect.objectContaining({ texts: ["ordinary\n\nBody for ordinary"] }));
    expect(writes).toContainEqual({ field: "id", value: "ordinary" });
    expect(writes).not.toContainEqual({ field: "id", value: "managed" });
  });

  test("batch recovery also excludes imported text from every retry", async () => {
    jest.mocked(listWikiPages).mockResolvedValue([page("first"), page("managed", true), page("second")]);
    jest.mocked(embedTexts).mockRejectedValueOnce(new Error("batch unavailable"));
    await expect(backfillEmbeddings("owner-a")).resolves.toEqual({ scanned: 2, embedded: 2 });
    expect(embedTexts).toHaveBeenCalledTimes(3);
    for (const [input] of jest.mocked(embedTexts).mock.calls) {
      expect(input.texts.every((text) => !text.includes("managed"))).toBe(true);
    }
    expect(writes.filter((entry) => entry.field === "id").map((entry) => entry.value)).toEqual(["first", "second"]);
  });

  test("ordinary page embedding remains available", async () => {
    await expect(embedAndStorePage("owner-a", page("ordinary"))).resolves.toBe(true);
    expect(embedTexts).toHaveBeenCalledTimes(1);
    expect(writes).toContainEqual({ field: "user_id", value: "owner-a" });
    expect(writes).toContainEqual({ field: "id", value: "ordinary" });
  });
});
