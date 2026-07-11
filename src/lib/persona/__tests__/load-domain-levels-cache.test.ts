// TTL cache + in-flight dedup + invalidation for loadDomainLevels. Mocks the
// supabase client per-table (same shape as load-domain-levels.test.ts) but
// counts the records-table read, which happens exactly once per underlying
// scan — so the cache's effect on scan count is directly observable.

interface QueryResult {
  data: unknown;
  error: { message: string } | null;
}

// One scan == one loadDomainLevels fetch. The records table is queried exactly
// once per fetch, so counting from("records") isolates the batch count from the
// six-table fan-out.
const stats = { recordsReads: 0 };

function chainable() {
  const promise = Promise.resolve<QueryResult>({ data: [], error: null });
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    contains: () => chain,
    in: () => chain,
    order: () => chain,
    limit: () => chain,
    then: (...args: unknown[]) => promise.then(...(args as Parameters<typeof promise.then>)),
    catch: (...args: unknown[]) => promise.catch(...(args as Parameters<typeof promise.catch>)),
    finally: (...args: unknown[]) => promise.finally(...(args as Parameters<typeof promise.finally>)),
  };
  return chain;
}

jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({
    from: (table: string) => {
      if (table === "records") stats.recordsReads += 1;
      return { select: () => chainable() };
    },
  }),
}));

import { invalidateDomainLevels, loadDomainLevels } from "../load-domain-levels";

beforeEach(() => {
  invalidateDomainLevels(); // drop the module-level cache between tests
  stats.recordsReads = 0;
});

describe("loadDomainLevels cache", () => {
  test("serves a second call within the TTL from cache (one scan)", async () => {
    await loadDomainLevels("u1");
    await loadDomainLevels("u1");
    expect(stats.recordsReads).toBe(1);
  });

  test("caches each user independently", async () => {
    await loadDomainLevels("u1");
    await loadDomainLevels("u2");
    await loadDomainLevels("u1"); // hit
    expect(stats.recordsReads).toBe(2);
  });

  test("invalidateDomainLevels(userId) forces the next read to refetch", async () => {
    await loadDomainLevels("u1");
    invalidateDomainLevels("u1");
    await loadDomainLevels("u1");
    expect(stats.recordsReads).toBe(2);
  });

  test("invalidateDomainLevels(userId) leaves other users cached", async () => {
    await loadDomainLevels("u1");
    await loadDomainLevels("u2");
    invalidateDomainLevels("u1");
    await loadDomainLevels("u1"); // miss (invalidated)
    await loadDomainLevels("u2"); // hit (untouched)
    expect(stats.recordsReads).toBe(3);
  });

  test("invalidateDomainLevels() with no argument clears every user", async () => {
    await loadDomainLevels("u1");
    await loadDomainLevels("u2");
    invalidateDomainLevels();
    await loadDomainLevels("u1");
    await loadDomainLevels("u2");
    expect(stats.recordsReads).toBe(4);
  });

  test("in-flight dedup: concurrent callers share one scan and one result", async () => {
    const [a, b] = await Promise.all([loadDomainLevels("u1"), loadDomainLevels("u1")]);
    expect(stats.recordsReads).toBe(1);
    expect(a).toBe(b); // both callers resolve to the same shared object
  });

  test("in-flight dedup does not leak: a later call after settle re-uses the cache", async () => {
    await Promise.all([loadDomainLevels("u1"), loadDomainLevels("u1")]);
    await loadDomainLevels("u1"); // still within TTL -> cache hit, no new scan
    expect(stats.recordsReads).toBe(1);
  });

  test("refetches after the TTL expires", async () => {
    jest.useFakeTimers();
    try {
      await loadDomainLevels("u1");
      await loadDomainLevels("u1");
      expect(stats.recordsReads).toBe(1); // cached inside the 45s window
      jest.advanceTimersByTime(46_000); // past the TTL
      await loadDomainLevels("u1");
      expect(stats.recordsReads).toBe(2);
    } finally {
      jest.useRealTimers();
    }
  });
});
