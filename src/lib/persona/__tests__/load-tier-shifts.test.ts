// D9 reader. Mocks supabase select chain to return star_tier_history rows.

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
    order: () => chain,
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

import { loadTierShifts } from "../load-tier-shifts";

function reset() {
  for (const k of Object.keys(tableFixtures)) delete tableFixtures[k];
}

describe("loadTierShifts", () => {
  beforeEach(reset);

  test("no history -> no shifts", async () => {
    tableFixtures["star_tier_history:select"] = { data: [], error: null };
    expect(await loadTierShifts("u1")).toEqual([]);
  });

  test("surfaces a star whose latest tier differs from the prior", async () => {
    tableFixtures["star_tier_history:select"] = {
      data: [
        { star_id: "now", level: 3, recorded_at: "2026-06-01T00:00:00Z" },
        { star_id: "now", level: 4, recorded_at: "2026-06-05T00:00:00Z" },
      ],
      error: null,
    };
    const shifts = await loadTierShifts("u1");
    expect(shifts).toEqual([{ starId: "now", from: 3, to: 4, direction: "up" }]);
  });
});
