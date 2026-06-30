// Cheap no-Gemini star-level loader. Mocks supabase per-table (same pattern as
// build.test.ts) and asserts loadStarLevels reads the signals without an LLM call.

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

import { loadStarLevels } from "../load-star-levels";

function reset() {
  for (const k of Object.keys(tableFixtures)) delete tableFixtures[k];
}

describe("loadStarLevels (cheap, no-Gemini)", () => {
  beforeEach(reset);

  test("no data -> every star L1, Soul Core 0.2", async () => {
    tableFixtures["records:select"] = { data: [], error: null };
    tableFixtures["memorized_patterns:select"] = { data: [], error: null };
    const { starLevels, soulCoreBrightness } = await loadStarLevels("u1");
    expect(Object.values(starLevels).every((l) => l === 1)).toBe(true);
    expect(soulCoreBrightness).toBeCloseTo(0.2);
  });

  test("a BFI record lights star1 (지금의 나) to L4", async () => {
    tableFixtures["records:select"] = {
      data: [
        {
          body: JSON.stringify({
            scores: { openness: 4, conscientiousness: 3.5, extraversion: 2, agreeableness: 4, neuroticism: 1.5 },
          }),
          created_at: "2026-05-01T00:00:00Z",
        },
      ],
      error: null,
    };
    tableFixtures["memorized_patterns:select"] = { data: [], error: null };
    const { starLevels } = await loadStarLevels("u1");
    expect(starLevels.now).toBe(4);
  });

  test("an IPIP-NEO-120 record (no BFI) lights star1 (지금의 나) to L4", async () => {
    // Previously only BFI counted here, so a 120-item IPIP result with no BFI was
    // treated as heuristic. IPIP is a validated instrument, so it must light L4.
    tableFixtures["records:select"] = {
      data: [
        {
          body: JSON.stringify({
            domains: { openness: 4, conscientiousness: 3.5, extraversion: 2, agreeableness: 4, neuroticism: 1.5 },
            facets: { anxiety: 2 },
          }),
          created_at: "2026-05-10T00:00:00Z",
        },
      ],
      error: null,
    };
    tableFixtures["memorized_patterns:select"] = { data: [], error: null };
    const { starLevels } = await loadStarLevels("u1");
    expect(starLevels.now).toBe(4);
  });

  test("an ECR-S attachment record lights star5 (관계의 나) to L4", async () => {
    tableFixtures["records:select"] = {
      data: [
        {
          body: JSON.stringify({ style: "secure", anxiety: 2.5, avoidance: 1.8 }),
          created_at: "2026-05-01T00:00:00Z",
        },
      ],
      error: null,
    };
    tableFixtures["memorized_patterns:select"] = { data: [], error: null };
    const { starLevels } = await loadStarLevels("u1");
    expect(starLevels.relational).toBe(4);
  });
});
