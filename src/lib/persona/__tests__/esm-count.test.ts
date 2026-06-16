// ESM count loader. Mocks the supabase count query (head:true -> { count }).

interface CountResult {
  count: number | null;
  data: unknown;
  error: { message: string } | null;
}

const fixtures: Record<string, CountResult> = {};

function chainable(result: CountResult) {
  const promise = Promise.resolve(result);
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    then: (...args: unknown[]) => promise.then(...(args as Parameters<typeof promise.then>)),
    catch: (...args: unknown[]) => promise.catch(...(args as Parameters<typeof promise.catch>)),
    finally: (...args: unknown[]) => promise.finally(...(args as Parameters<typeof promise.finally>)),
  };
  return chain;
}

jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({
    from: (table: string) => ({
      select: () => chainable(fixtures[`${table}:select`] ?? { count: null, data: null, error: null }),
    }),
  }),
}));

import { loadEsmCount } from "../esm-count";

function reset() {
  for (const k of Object.keys(fixtures)) delete fixtures[k];
}

describe("loadEsmCount", () => {
  beforeEach(reset);

  test("returns the exact count from esm_responses", async () => {
    fixtures["esm_responses:select"] = { count: 8, data: null, error: null };
    expect(await loadEsmCount("u1")).toBe(8);
  });

  test("returns 0 when there is no count", async () => {
    fixtures["esm_responses:select"] = { count: null, data: null, error: null };
    expect(await loadEsmCount("u1")).toBe(0);
  });
});
