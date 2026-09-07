import { loadDataReview } from "../data-read";
import { TimeoutError } from "../../async/with-timeout";

const mockRows: Record<string, unknown> = {};
const mockReads: unknown[] = [];
jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({
    from: (table: string) => ({
      select: (columns: string, options: unknown) => ({
        eq: (column: string, owner: string) => {
          mockReads.push({ table, columns, options, column, owner });
          return Promise.resolve(mockRows[table]);
        },
      }),
    }),
  }),
}));

beforeEach(() => {
  mockReads.length = 0;
  mockRows.records = { count: 8, error: null };
  mockRows.sources = { count: 5, error: null };
  mockRows.wiki_pages = { count: 3, error: null };
});

test("reads exact counts of all three categories without fetching bodies or limiting dates", async () => {
  await expect(loadDataReview("owner-a")).resolves.toEqual({ records: 8, sources: 5, wikiPages: 3 });
  expect(mockReads).toEqual(["records", "sources", "wiki_pages"].map((table) => ({
    table, columns: "id", options: { count: "exact", head: true }, column: "user_id", owner: "owner-a",
  })));
});

test("confirmed zero counts remain zero, without inventing an aggregate", async () => {
  for (const table of Object.keys(mockRows)) mockRows[table] = { count: 0, error: null };
  await expect(loadDataReview("owner-a")).resolves.toEqual({ records: 0, sources: 0, wikiPages: 0 });
});

test.each(["records", "sources", "wiki_pages"])("%s failure rejects the entire snapshot", async (table) => {
  mockRows[table] = { count: null, error: new Error("offline") };
  await expect(loadDataReview("owner-a")).rejects.toThrow("offline");
});

test.each([null, undefined, -1, 1.5, NaN, "3"])("invalid count %p cannot be treated as empty", async (count) => {
  mockRows.sources = { count, error: null };
  await expect(loadDataReview("owner-a")).rejects.toThrow("count unavailable");
});

test.each(["records", "sources", "wiki_pages"])("a pending %s query has a ten-second deadline", async (table) => {
  jest.useFakeTimers();
  try {
    mockRows[table] = new Promise(() => {});
    let result: unknown;
    void loadDataReview("owner-a").catch((error: unknown) => { result = error; });
    await jest.advanceTimersByTimeAsync(9_999);
    expect(result).toBeUndefined();
    await jest.advanceTimersByTimeAsync(1);
    expect(result).toBeInstanceOf(TimeoutError);
    expect(jest.getTimerCount()).toBe(0);
  } finally { jest.useRealTimers(); }
});

test("an absent owner never issues a database request", async () => {
  await expect(loadDataReview(" ")).rejects.toThrow("requires an owner");
  expect(mockReads).toEqual([]);
});
