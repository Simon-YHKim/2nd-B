// Wave 2 — upsertItems dedupes on UNIQUE(user_id, url) so a re-pull is a no-op
// (idempotent) and an article is cached/summarized once. We mock the supabase
// client and capture the upsert shape (onConflict + ignoreDuplicates + RLS
// user_id on every row). setSummary scopes by user_id + id.

const upsertMock = jest.fn();
const selectMock = jest.fn();
const updateMock = jest.fn();
const selectFromMock = jest.fn();

jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({
    from: () => ({
      upsert: upsertMock,
      update: updateMock,
      select: selectFromMock,
    }),
  }),
}));

import { upsertItems, setSummary, claimSummarySlot, releaseSummarySlot, listDigest } from "../queries";
import type { NewsItem } from "../parse";

/**
 * Build a chainable `.eq().eq()...` thunk that resolves to `result` after all
 * the `.eq` links, and optionally exposes a terminal `.select`. Captures the eq
 * calls so tests can assert the scoping (user_id, id, summary_status).
 */
function chain(result: unknown, opts: { withSelect?: unknown } = {}) {
  const eqCalls: [string, unknown][] = [];
  const node: Record<string, unknown> = {};
  const eq = jest.fn((col: string, val: unknown) => {
    eqCalls.push([col, val]);
    return node;
  });
  node.eq = eq;
  if (opts.withSelect !== undefined) {
    node.select = jest.fn(() => Promise.resolve(opts.withSelect));
  }
  // Make the node thenable so `await update().eq().eq()` resolves to `result`.
  node.then = (resolve: (v: unknown) => void) => resolve(result);
  return { node, eq, eqCalls };
}

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

describe("setSummary (owner-scoped, pending-gated, marks done)", () => {
  test("updates summary + status='done' scoped by user_id, id, status='pending'", async () => {
    const { node, eqCalls } = chain({ error: null });
    updateMock.mockReset().mockReturnValue(node);
    await setSummary("user-1", "n-1", "one-line summary");
    expect(updateMock).toHaveBeenCalledWith({ summary: "one-line summary", summary_status: "done" });
    expect(eqCalls).toContainEqual(["user_id", "user-1"]);
    expect(eqCalls).toContainEqual(["id", "n-1"]);
    // Only the caller that won the claim ('pending') commits the result.
    expect(eqCalls).toContainEqual(["summary_status", "pending"]);
  });
});

describe("claimSummarySlot (atomic compare-and-set, double-bill guard)", () => {
  test("WIN: one affected row -> true (flips none -> pending, owner-scoped)", async () => {
    const { node, eqCalls } = chain(undefined, { withSelect: { data: [{ id: "n-1" }], error: null } });
    updateMock.mockReset().mockReturnValue(node);
    const ok = await claimSummarySlot("user-1", "n-1");
    expect(ok).toBe(true);
    expect(updateMock).toHaveBeenCalledWith({ summary_status: "pending" });
    expect(eqCalls).toContainEqual(["user_id", "user-1"]);
    expect(eqCalls).toContainEqual(["id", "n-1"]);
    // The compare half: only claims a row currently in 'none'.
    expect(eqCalls).toContainEqual(["summary_status", "none"]);
  });

  test("RACE LOSS: zero affected rows -> false (second caller must skip the LLM)", async () => {
    const { node } = chain(undefined, { withSelect: { data: [], error: null } });
    updateMock.mockReset().mockReturnValue(node);
    const ok = await claimSummarySlot("user-1", "n-1");
    expect(ok).toBe(false);
  });

  test("propagates a DB error", async () => {
    const { node } = chain(undefined, { withSelect: { data: null, error: { message: "boom" } } });
    updateMock.mockReset().mockReturnValue(node);
    await expect(claimSummarySlot("user-1", "n-1")).rejects.toBeTruthy();
  });
});

describe("releaseSummarySlot (only frees rows left pending)", () => {
  test("flips pending -> none scoped by user_id, id, status='pending'", async () => {
    const { node, eqCalls } = chain({ error: null });
    updateMock.mockReset().mockReturnValue(node);
    await releaseSummarySlot("user-1", "n-1");
    expect(updateMock).toHaveBeenCalledWith({ summary_status: "none" });
    expect(eqCalls).toContainEqual(["user_id", "user-1"]);
    expect(eqCalls).toContainEqual(["id", "n-1"]);
    expect(eqCalls).toContainEqual(["summary_status", "pending"]);
  });
});

describe("listDigest (only status='done' counts as a real summary)", () => {
  function digestChain(rows: unknown[]) {
    const limit = jest.fn(() => Promise.resolve({ data: rows, error: null }));
    const order = jest.fn(() => ({ limit }));
    const eq = jest.fn(() => ({ order }));
    selectFromMock.mockReset().mockReturnValue({ eq });
  }

  test("nulls out summary for non-'done' rows; keeps 'done' summaries", async () => {
    digestChain([
      { id: "a", summary: "hotline-or-half-written", summary_status: "pending" },
      { id: "b", summary: "real summary", summary_status: "done" },
      { id: "c", summary: "legacy", summary_status: null },
    ]);
    const out = await listDigest("user-1");
    expect(out.find((r) => r.id === "a")?.summary).toBeNull();
    expect(out.find((r) => r.id === "b")?.summary).toBe("real summary");
    expect(out.find((r) => r.id === "c")?.summary).toBeNull();
  });
});
