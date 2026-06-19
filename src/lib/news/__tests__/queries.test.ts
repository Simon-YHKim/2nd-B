// Wave 2 — upsertItems dedupes on UNIQUE(user_id, url) so a re-pull is a no-op
// (idempotent) and an article is cached/summarized once. We mock the supabase
// client and capture the upsert shape (onConflict + ignoreDuplicates + RLS
// user_id on every row). setSummary scopes by user_id + id.

const upsertMock = jest.fn();
const selectMock = jest.fn();
const updateMock = jest.fn();
const eqUserMock = jest.fn();
const eqIdMock = jest.fn();

jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({
    from: () => ({
      upsert: upsertMock,
      update: updateMock,
    }),
  }),
}));

import { upsertItems, setSummary } from "../queries";
import type { NewsItem } from "../parse";

const item: NewsItem = {
  source: "yonhap",
  title: "Headline",
  url: "https://example.com/a",
  publishedAt: "2026-06-11T00:00:00.000Z",
  snippet: "body",
};

describe("upsertItems dedupe (idempotent re-pull, summarize-once)", () => {
  beforeEach(() => {
    selectMock.mockReset().mockResolvedValue({ data: [{ id: "n-1" }], error: null });
    upsertMock.mockReset().mockReturnValue({ select: selectMock });
  });

  test("upserts on user_id,url with ignoreDuplicates and scopes user_id per row", async () => {
    await upsertItems("user-1", [item]);
    expect(upsertMock).toHaveBeenCalledTimes(1);
    const [rows, opts] = upsertMock.mock.calls[0];
    expect(rows[0].user_id).toBe("user-1");
    expect(rows[0]).toMatchObject({
      source: "yonhap",
      title: "Headline",
      url: "https://example.com/a",
      published_at: "2026-06-11T00:00:00.000Z",
      snippet: "body",
    });
    // summary is never set on insert (opt-in, filled later).
    expect("summary" in rows[0]).toBe(false);
    expect(opts).toEqual({ onConflict: "user_id,url", ignoreDuplicates: true });
  });

  test("re-pulling the same item carries an identical payload (collapses to one row)", async () => {
    await upsertItems("user-1", [item]);
    await upsertItems("user-1", [item]);
    expect(upsertMock.mock.calls[0][0]).toEqual(upsertMock.mock.calls[1][0]);
    expect(upsertMock.mock.calls[0][1]).toEqual(upsertMock.mock.calls[1][1]);
  });

  test("empty batch short-circuits without a DB call", async () => {
    const out = await upsertItems("user-1", []);
    expect(out).toEqual([]);
    expect(upsertMock).not.toHaveBeenCalled();
  });
});

describe("setSummary (owner-scoped single-row write)", () => {
  beforeEach(() => {
    eqIdMock.mockReset().mockResolvedValue({ error: null });
    eqUserMock.mockReset().mockReturnValue({ eq: eqIdMock });
    updateMock.mockReset().mockReturnValue({ eq: eqUserMock });
  });

  test("updates summary scoped by user_id then id", async () => {
    await setSummary("user-1", "n-1", "one-line summary");
    expect(updateMock).toHaveBeenCalledWith({ summary: "one-line summary" });
    expect(eqUserMock).toHaveBeenCalledWith("user_id", "user-1");
    expect(eqIdMock).toHaveBeenCalledWith("id", "n-1");
  });
});
