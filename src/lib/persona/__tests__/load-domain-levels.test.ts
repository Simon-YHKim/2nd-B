// Cheap no-Gemini domain-level loader. Mocks supabase per-table (same pattern as
// load-star-levels.test.ts) and asserts loadDomainLevels groups records by their
// `domain:` tag and lights the stars from coverage alone — no LLM call.

interface QueryResult {
  data: unknown;
  error: { message: string } | null;
}

const tableFixtures: Record<string, QueryResult> = {};

function chainable(result: QueryResult) {
  const promise = Promise.resolve(result);
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    contains: () => chain,
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
    from: (table: string) => ({
      select: () => chainable(tableFixtures[`${table}:select`] ?? { data: [], error: null }),
    }),
  }),
}));

import { loadDomainLevels } from "../load-domain-levels";

function reset() {
  for (const k of Object.keys(tableFixtures)) delete tableFixtures[k];
}

// n records in one domain, each "organized" (carries a real user tag besides the
// system domain: tag). createdAt is constant — recency is deferred (§4.5 ④).
function organizedRows(domain: string, n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `${domain}-${i}`,
    created_at: "2026-05-01T00:00:00Z",
    tags: [`domain:${domain}`, "mytag"],
  }));
}

function rawRows(domain: string, n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `${domain}-raw-${i}`,
    created_at: "2026-05-01T00:00:00Z",
    tags: [`domain:${domain}`], // only the system tag -> not organized
  }));
}

describe("loadDomainLevels (cheap, no-Gemini)", () => {
  beforeEach(reset);

  test("no data -> every domain L1, 북극성 0.2", async () => {
    tableFixtures["records:select"] = { data: [], error: null };
    const { domainLevels, northStarBrightness } = await loadDomainLevels("u1");
    expect(Object.values(domainLevels)).toHaveLength(7);
    expect(Object.values(domainLevels).every((l) => l === 1)).toBe(true);
    expect(northStarBrightness).toBeCloseTo(0.2);
  });

  test("groups records by their domain: tag and lights each star from coverage", async () => {
    tableFixtures["records:select"] = {
      data: [
        ...organizedRows("career", 15), // -> L4
        ...organizedRows("finance", 5), // -> L3
        ...organizedRows("growth", 1), // -> L2
      ],
      error: null,
    };
    const { domainLevels } = await loadDomainLevels("u1");
    expect(domainLevels.career).toBe(4);
    expect(domainLevels.finance).toBe(3);
    expect(domainLevels.growth).toBe(2);
    expect(domainLevels.health).toBe(1); // untouched domain stays dark
  });

  test("brightness-honesty: raw-heavy domain is capped one band lower", async () => {
    // 20 records, organized only by the auto domain: tag (no user tag) -> raw ->
    // high band drops to medium -> L3, not L4. Proves the system domain: tag is
    // NOT counted as organizing the entry.
    tableFixtures["records:select"] = { data: rawRows("career", 20), error: null };
    const { domainLevels } = await loadDomainLevels("u1");
    expect(domainLevels.career).toBe(3);
  });

  test("ignores records with no domain: tag (pre-migration rows stay dark)", async () => {
    tableFixtures["records:select"] = {
      data: [
        { id: "old1", created_at: "2026-01-01T00:00:00Z", tags: ["random"] },
        { id: "old2", created_at: "2026-01-02T00:00:00Z", tags: [] },
        { id: "old3", created_at: "2026-01-03T00:00:00Z", tags: null },
      ],
      error: null,
    };
    const { domainLevels, northStarBrightness } = await loadDomainLevels("u1");
    expect(Object.values(domainLevels).every((l) => l === 1)).toBe(true);
    expect(northStarBrightness).toBeCloseTo(0.2);
  });

  test("ignores unknown / malformed domain slugs", async () => {
    tableFixtures["records:select"] = {
      data: [
        { id: "x1", created_at: "2026-05-01T00:00:00Z", tags: ["domain:bogus", "mytag"] },
        ...organizedRows("health", 5),
      ],
      error: null,
    };
    const { domainLevels } = await loadDomainLevels("u1");
    expect(domainLevels.health).toBe(3);
    // bogus slug contributed to no domain
    expect(domainLevels.career).toBe(1);
  });
});
