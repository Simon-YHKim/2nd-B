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

import {
  upsertItems,
  setSummary,
  claimSummarySlot,
  releaseSummarySlot,
  listDigest,
  SUMMARY_CLAIM_TTL_MS,
} from "../queries";
import type { NewsItem } from "../parse";

/**
 * Build a chainable `.eq().eq()...` thunk that resolves to `result` after all
 * the `.eq` links, and optionally exposes a terminal `.select`. Captures the eq
 * calls so tests can assert the scoping (user_id, id, summary_status).
 */
function chain(result: unknown, opts: { withSelect?: unknown } = {}) {
  const eqCalls: [string, unknown][] = [];
  const orCalls: string[] = [];
  const node: Record<string, unknown> = {};
  const eq = jest.fn((col: string, val: unknown) => {
    eqCalls.push([col, val]);
    return node;
  });
  const or = jest.fn((filter: string) => {
    orCalls.push(filter);
    return node;
  });
  node.eq = eq;
  node.or = or;
  if (opts.withSelect !== undefined) {
    node.select = jest.fn(() => Promise.resolve(opts.withSelect));
  }
  // Make the node thenable so `await update().eq().eq()` resolves to `result`.
  node.then = (resolve: (v: unknown) => void) => resolve(result);
  return { node, eq, or, eqCalls, orCalls };
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

describe("setSummary (owner-scoped, pending-gated, token-gated, marks done)", () => {
  test("updates summary + status='done' scoped by user_id, id, status='pending', claim token", async () => {
    const { node, eqCalls } = chain({ error: null });
    updateMock.mockReset().mockReturnValue(node);
    await setSummary("user-1", "n-1", "one-line summary", "2026-06-11T00:00:00.000Z");
    expect(updateMock).toHaveBeenCalledWith({ summary: "one-line summary", summary_status: "done" });
    expect(eqCalls).toContainEqual(["user_id", "user-1"]);
    expect(eqCalls).toContainEqual(["id", "n-1"]);
    // Only the caller that won the claim ('pending') commits the result.
    expect(eqCalls).toContainEqual(["summary_status", "pending"]);
    // ...AND only with OUR claim token: a stale/reclaimed token matches 0 rows.
    expect(eqCalls).toContainEqual(["summary_claimed_at", "2026-06-11T00:00:00.000Z"]);
  });

  test("STALE TOKEN no-op: a loser's commit matches 0 rows (does not clobber a reclaim)", async () => {
    // After a TTL reclaim the row carries the reclaimer's claimed_at, so the
    // original caller's commit (its own, now-stale token) filters to 0 rows.
    const { node, eqCalls } = chain({ data: [], error: null });
    updateMock.mockReset().mockReturnValue(node);
    await setSummary("user-1", "n-1", "stale output", "1999-01-01T00:00:00.000Z");
    expect(eqCalls).toContainEqual(["summary_claimed_at", "1999-01-01T00:00:00.000Z"]);
    // No throw; 0 matched rows is a safe no-op (the reclaimer's fresh claim stands).
  });
});

describe("claimSummarySlot (atomic compare-and-set, double-bill guard)", () => {
  test("WIN: one affected row -> returns the claim token (stamps claimed_at + pending, owner-scoped)", async () => {
    const { node, eqCalls, orCalls } = chain(undefined, {
      withSelect: { data: [{ id: "n-1" }], error: null },
    });
    updateMock.mockReset().mockReturnValue(node);
    const token = await claimSummarySlot("user-1", "n-1");
    // The token IS the summary_claimed_at the win stamped (threaded to commit/release).
    expect(typeof token).toBe("string");
    const payload = updateMock.mock.calls[0][0];
    expect(payload.summary_status).toBe("pending");
    expect(typeof payload.summary_claimed_at).toBe("string");
    expect(token).toBe(payload.summary_claimed_at);
    expect(eqCalls).toContainEqual(["user_id", "user-1"]);
    expect(eqCalls).toContainEqual(["id", "n-1"]);
    // The compare half is now an .or(): claim a 'none' row OR a stale 'pending'.
    expect(orCalls).toHaveLength(1);
    expect(orCalls[0]).toMatch(/^summary_status\.eq\.none,and\(summary_status\.eq\.pending,summary_claimed_at\.lt\./);
  });

  test("STALE RECLAIM: a 'pending' row older than the TTL is reclaimable (cutoff is past)", async () => {
    const { node, orCalls } = chain(undefined, { withSelect: { data: [{ id: "n-1" }], error: null } });
    updateMock.mockReset().mockReturnValue(node);
    const before = Date.now();
    const token = await claimSummarySlot("user-1", "n-1");
    const after = Date.now();
    expect(typeof token).toBe("string");
    // The cutoff in the .or() is now - TTL (~5 min ago): a 'pending' row whose
    // summary_claimed_at is < cutoff (older than the TTL) matches and is reclaimed.
    const cutoffIso = orCalls[0].match(/summary_claimed_at\.lt\.([^)]+)\)/)?.[1];
    expect(cutoffIso).toBeTruthy();
    const cutoffMs = Date.parse(cutoffIso as string);
    expect(cutoffMs).toBeGreaterThanOrEqual(before - SUMMARY_CLAIM_TTL_MS - 50);
    expect(cutoffMs).toBeLessThanOrEqual(after - SUMMARY_CLAIM_TTL_MS + 50);
  });

  test("FRESH PENDING: a just-claimed row is NOT reclaimable (cutoff older than its stamp -> 0 rows)", async () => {
    // A fresh 'pending' row's summary_claimed_at is newer than the cutoff, so it
    // fails the .lt.<cutoff> predicate: the DB returns 0 rows and the claim fails.
    const { node } = chain(undefined, { withSelect: { data: [], error: null } });
    updateMock.mockReset().mockReturnValue(node);
    const token = await claimSummarySlot("user-1", "n-1");
    expect(token).toBeNull();
  });

  test("RACE LOSS: zero affected rows -> null (second caller must skip the LLM)", async () => {
    const { node } = chain(undefined, { withSelect: { data: [], error: null } });
    updateMock.mockReset().mockReturnValue(node);
    const token = await claimSummarySlot("user-1", "n-1");
    expect(token).toBeNull();
  });

  test("propagates a DB error", async () => {
    const { node } = chain(undefined, { withSelect: { data: null, error: { message: "boom" } } });
    updateMock.mockReset().mockReturnValue(node);
    await expect(claimSummarySlot("user-1", "n-1")).rejects.toBeTruthy();
  });
});

describe("releaseSummarySlot (only frees rows left pending under OUR token)", () => {
  test("flips pending -> none scoped by user_id, id, status='pending', claim token", async () => {
    const { node, eqCalls } = chain({ error: null });
    updateMock.mockReset().mockReturnValue(node);
    await releaseSummarySlot("user-1", "n-1", "2026-06-11T00:00:00.000Z");
    expect(updateMock).toHaveBeenCalledWith({ summary_status: "none", summary_claimed_at: null });
    expect(eqCalls).toContainEqual(["user_id", "user-1"]);
    expect(eqCalls).toContainEqual(["id", "n-1"]);
    expect(eqCalls).toContainEqual(["summary_status", "pending"]);
    // ...AND only our claim token: after a reclaim, a loser's release is a no-op.
    expect(eqCalls).toContainEqual(["summary_claimed_at", "2026-06-11T00:00:00.000Z"]);
  });

  test("STALE TOKEN no-op: after a reclaim (different claimed_at) the original token matches 0 rows", async () => {
    const { node, eqCalls } = chain({ data: [], error: null });
    updateMock.mockReset().mockReturnValue(node);
    await releaseSummarySlot("user-1", "n-1", "1999-01-01T00:00:00.000Z");
    // The .eq filter carries the stale original token; the row now holds the
    // reclaimer's token, so 0 rows match — the reclaimer's claim is preserved.
    expect(eqCalls).toContainEqual(["summary_claimed_at", "1999-01-01T00:00:00.000Z"]);
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
