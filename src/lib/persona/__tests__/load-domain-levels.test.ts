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

// Recent (always inside the 60-day recency window) so the §4.5 ④ staleness gate —
// which loadDomainLevels feeds a real Date.now() — never fires for these coverage
// fixtures. Deriving created_at from now keeps these tests clock-independent: only
// the dedicated "recency is live" test (which uses a hardcoded 2020 stale date)
// exercises the staleness path. A fixed 2026-05-01 literal would silently flip
// these assertions once the wall clock crosses 60 days past that date.
const RECENT_ISO = new Date(Date.now() - 5 * 86_400_000).toISOString();

// n records in one domain, each "organized" (carries a real user tag besides the
// system domain: tag). createdAt is recent so recency never dims (§4.5 ④).
function organizedRows(domain: string, n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `${domain}-${i}`,
    created_at: RECENT_ISO,
    tags: [`domain:${domain}`, "mytag"],
  }));
}

function rawRows(domain: string, n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `${domain}-raw-${i}`,
    created_at: RECENT_ISO,
    tags: [`domain:${domain}`], // only the system tag -> not organized
  }));
}

// Organized rows whose newest entry is older than the 60-day staleness window,
// for asserting the live recency signal (loadDomainLevels passes Date.now()).
function staleOrganizedRows(domain: string, n: number, isoDate: string) {
  return Array.from({ length: n }, (_, i) => ({
    id: `${domain}-stale-${i}`,
    created_at: isoDate,
    tags: [`domain:${domain}`, "mytag"],
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

  test("recency is live: a long-abandoned domain dims one band (§4.5 ④)", async () => {
    // loadDomainLevels injects a real Date.now() at the read boundary. A domain
    // whose newest entry is from 2020 is always >60 days stale, so its high band
    // (15 organized rows → L4) drops to L3. A domain fed today stays at L4. This
    // proves the recency signal — dead while the loader never passed `now` — is now
    // reachable in production.
    const today = new Date().toISOString();
    tableFixtures["records:select"] = {
      data: [
        ...staleOrganizedRows("career", 15, "2020-01-01T00:00:00Z"), // stale → L3
        ...staleOrganizedRows("finance", 15, today), // fresh → L4
      ],
      error: null,
    };
    const { domainLevels } = await loadDomainLevels("u1");
    expect(domainLevels.career).toBe(3); // dimmed by recency
    expect(domainLevels.finance).toBe(4); // fresh, full band
  });

  test("structured manage-layer rows lift their domain (relation_people 0058 / recreation_items 0059)", async () => {
    // No records at all, but 5 relation_people + 5 recreation_items rows. Each
    // structured row is organized by construction, so it counts toward coverage
    // exactly like a curated record: 5 entries -> medium band -> L3. Proves the
    // 0058/0059 tables are no longer dead schema — they feed brightness.
    const recent = new Date(Date.now() - 3 * 86_400_000).toISOString();
    const structured = (n: number) =>
      Array.from({ length: n }, () => ({ created_at: recent }));
    tableFixtures["records:select"] = { data: [], error: null };
    tableFixtures["relation_people:select"] = { data: structured(5), error: null };
    tableFixtures["recreation_items:select"] = { data: structured(5), error: null };
    const { domainLevels } = await loadDomainLevels("u1");
    expect(domainLevels.relation).toBe(3);
    expect(domainLevels.recreation).toBe(3);
    expect(domainLevels.career).toBe(1); // untouched domain stays dark
  });

  test("structured recency uses the ACTIVITY date, not created_at (last_interaction_on / occurred_on)", async () => {
    // 15 rows each → high band → L4 before recency. The created_at column would
    // give the wrong recency for both: relation rows are old-created but contacted
    // today (must stay bright), recreation rows are new-created but happened long
    // ago (must dim). Proves the fold reads the activity date with a created_at
    // fallback.
    const old = "2020-01-01T00:00:00Z";
    const recent = new Date(Date.now() - 3 * 86_400_000).toISOString();
    tableFixtures["records:select"] = { data: [], error: null };
    tableFixtures["relation_people:select"] = {
      data: Array.from({ length: 15 }, () => ({ created_at: old, last_interaction_on: recent })),
      error: null,
    };
    tableFixtures["recreation_items:select"] = {
      data: Array.from({ length: 15 }, () => ({ created_at: recent, occurred_on: old })),
      error: null,
    };
    const { domainLevels } = await loadDomainLevels("u1");
    expect(domainLevels.relation).toBe(4); // old created_at ignored; recent interaction keeps it bright
    expect(domainLevels.recreation).toBe(3); // recent created_at ignored; old occurrence dims it
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
