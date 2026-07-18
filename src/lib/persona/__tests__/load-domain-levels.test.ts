// Cheap no-Gemini domain-level loader. Mocks supabase per-table (same pattern as
// load-star-levels.test.ts) and asserts loadDomainLevels groups records by their
// `domain:` tag and lights the stars from coverage alone — no LLM call.

interface QueryResult {
  data: unknown;
  error: { message: string } | null;
}

const tableFixtures: Record<string, QueryResult> = {};
// Records the args of every .order() call so a test can assert the records scan
// is newest-first (regression: ascending kept the OLDEST rows under a max-rows cap).
const mockOrderCalls: unknown[][] = [];

function chainable(result: QueryResult) {
  const promise = Promise.resolve(result);
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    contains: () => chain,
    in: () => chain,
    order: (...a: unknown[]) => {
      mockOrderCalls.push(a);
      return chain;
    },
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

import { invalidateDomainLevels, loadDomainLevels } from "../load-domain-levels";

function reset() {
  for (const k of Object.keys(tableFixtures)) delete tableFixtures[k];
  // loadDomainLevels now memoizes per userId, so every fixture swap (beforeEach
  // and the in-test resets that reuse "u1") must also drop the cache — otherwise
  // the next call returns the previous case's cached result instead of scanning
  // the new fixtures.
  invalidateDomainLevels();
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

describe("loadDomainLevels records scan order (regression)", () => {
  test("scans records newest-first so a max-rows cap keeps recent history", async () => {
    reset();
    mockOrderCalls.length = 0;
    tableFixtures["records:select"] = { data: organizedRows("career", 3), error: null };
    await loadDomainLevels("u-order");
    // Ascending would silently keep the OLDEST rows under truncation, freezing the
    // recency signal (§4.5 ④) in the past.
    expect(mockOrderCalls).toContainEqual(["created_at", { ascending: false }]);
  });
});

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

  test("ratified sources brighten their star; un-ratified imports stay dark (P0 연동 브리지)", async () => {
    // The deep-run ratify stamps domain:<slug> onto the sources row — those are
    // deliberate propose→ratify acts, so 5 of them reach the medium band (L3)
    // exactly like organized records. A source WITHOUT a domain tag (a fresh
    // import nobody ratified) contributes nothing: honesty means an import
    // alone never lights a star.
    tableFixtures["records:select"] = { data: [], error: null };
    tableFixtures["sources:select"] = {
      data: [
        ...Array.from({ length: 5 }, (_, i) => ({
          captured_at: RECENT_ISO,
          tags: [`domain:career`, "reasoning:ratified", `clip-${i}`],
        })),
        { captured_at: RECENT_ISO, tags: ["article"] }, // un-ratified -> dark
        { captured_at: RECENT_ISO, tags: ["domain:notadomain"] }, // unknown slug -> ignored
      ],
      error: null,
    };
    const { domainLevels } = await loadDomainLevels("u1");
    expect(domainLevels.career).toBe(3);
    expect(domainLevels.growth).toBe(1);
  });

  test("records and ratified sources add up within one domain", async () => {
    // 3 organized records + 2 ratified sources = 5 career entries -> L3. The
    // two evidence kinds share one coverage ledger, so a mixed capture+import
    // life is not penalized for where each piece happened to land.
    tableFixtures["records:select"] = { data: organizedRows("career", 3), error: null };
    tableFixtures["sources:select"] = {
      data: Array.from({ length: 2 }, () => ({
        captured_at: RECENT_ISO,
        tags: ["domain:career", "reasoning:ratified"],
      })),
      error: null,
    };
    const { domainLevels } = await loadDomainLevels("u1");
    expect(domainLevels.career).toBe(3);
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

  test("ops_ledger lifts finance, ops_reading lifts growth (organized fold like 0058/0059)", async () => {
    // Manual, low-volume self-report: 5 rows each → medium band → L3, exactly like
    // the relation/recreation precedent. Proves the finance/growth behavioral
    // tables are no longer dead schema for the home sky.
    const recent = new Date(Date.now() - 3 * 86_400_000).toISOString();
    tableFixtures["records:select"] = { data: [], error: null };
    tableFixtures["ops_ledger:select"] = {
      data: Array.from({ length: 5 }, () => ({ created_at: recent, occurred_on: recent })),
      error: null,
    };
    tableFixtures["ops_reading:select"] = {
      data: Array.from({ length: 5 }, () => ({ created_at: recent, updated_at: recent })),
      error: null,
    };
    const { domainLevels } = await loadDomainLevels("u1");
    expect(domainLevels.finance).toBe(3);
    expect(domainLevels.growth).toBe(3);
    expect(domainLevels.health).toBe(1); // untouched domain stays dark
  });

  test("ledger/reading recency uses the activity date (occurred_on / updated_at)", async () => {
    const old = "2020-01-01T00:00:00Z";
    const recent = new Date(Date.now() - 3 * 86_400_000).toISOString();
    tableFixtures["records:select"] = { data: [], error: null };
    // 15 ledger rows occurred long ago → L4 base dims one band to L3 by recency.
    tableFixtures["ops_ledger:select"] = {
      data: Array.from({ length: 15 }, () => ({ created_at: recent, occurred_on: old })),
      error: null,
    };
    // 15 reading rows updated today → L4 stays (created_at is old but ignored).
    tableFixtures["ops_reading:select"] = {
      data: Array.from({ length: 15 }, () => ({ created_at: old, updated_at: recent })),
      error: null,
    };
    const { domainLevels } = await loadDomainLevels("u1");
    expect(domainLevels.finance).toBe(3); // old occurrence dims despite recent created_at
    expect(domainLevels.growth).toBe(4); // recent update keeps it bright despite old created_at
  });

  test("health triangulation: device sample + a self-report record → +1 tier; device alone never inflates", async () => {
    // The .in("source", [healthkit, health_connect, strava]) filter runs at the DB,
    // so the health_samples fixture is the POST-FILTER (device-only) result: a
    // single device row models any wearable user (1 row == 10k rows == one boolean,
    // so the +1 is volume-proof). manual/mock sources are filtered out → empty.
    const oneDevice = { data: [{ source: "healthkit" }], error: null };

    // (a) device + 1 organized health record (base L2) → triangulation lifts to L3.
    tableFixtures["records:select"] = { data: organizedRows("health", 1), error: null };
    tableFixtures["health_samples:select"] = oneDevice;
    expect((await loadDomainLevels("u1")).domainLevels.health).toBe(3);

    // (b) record present but NO device row (e.g. only manual/mock, filtered out) →
    // no bonus; health stays at its record-derived L2. Proves the +1 is what lifted (a).
    reset();
    tableFixtures["records:select"] = { data: organizedRows("health", 1), error: null };
    tableFixtures["health_samples:select"] = { data: [], error: null };
    expect((await loadDomainLevels("u1")).domainLevels.health).toBe(2);

    // (c) device data ALONE (no self-report health record) never lights health —
    // owning a wearable is not the app understanding your health (honesty rule).
    reset();
    tableFixtures["records:select"] = { data: [], error: null };
    tableFixtures["health_samples:select"] = oneDevice;
    expect((await loadDomainLevels("u1")).domainLevels.health).toBe(1);
  });
});
