// Tests for deleteWikiPage()'s source lifecycle: when a page promoted from a
// capture source is deleted, that source must return to the un-ingested state
// so the inbox re-offers "Generate wiki page" instead of stranding it on a
// dead "View in wiki" link. Supabase is mocked with a small chainable stub.

interface QueryResult {
  data: unknown;
  error: { message: string } | null;
}

const fixtures: Record<string, QueryResult> = {};
const updateCalls: { table: string; payload: Record<string, unknown> }[] = [];
const deleteCalls: { table: string }[] = [];

function chainable(result: QueryResult) {
  const promise = Promise.resolve(result);
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: () => promise,
    single: () => promise,
    then: (...args: unknown[]) => promise.then(...(args as Parameters<typeof promise.then>)),
    catch: (...args: unknown[]) => promise.catch(...(args as Parameters<typeof promise.catch>)),
    finally: (...args: unknown[]) => promise.finally(...(args as Parameters<typeof promise.finally>)),
  };
  return chain;
}

jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({
    from: (table: string) => ({
      select: () => chainable(fixtures[`${table}:select`] ?? { data: null, error: null }),
      delete: () => {
        deleteCalls.push({ table });
        return chainable({ data: null, error: null });
      },
      update: (payload: Record<string, unknown>) => {
        updateCalls.push({ table, payload });
        return chainable({ data: null, error: null });
      },
    }),
  }),
}));

import { deleteWikiPage } from "../queries";

function reset() {
  for (const k of Object.keys(fixtures)) delete fixtures[k];
  updateCalls.length = 0;
  deleteCalls.length = 0;
}

describe("deleteWikiPage source lifecycle", () => {
  beforeEach(reset);

  test("page promoted from a source → source reset to un-ingested", async () => {
    fixtures["wiki_pages:select"] = { data: { source_id: "s1" }, error: null };
    await deleteWikiPage("u1", "p1");
    expect(deleteCalls.find((c) => c.table === "wiki_pages")).toBeDefined();
    const srcUpdate = updateCalls.find((c) => c.table === "sources");
    expect(srcUpdate).toBeDefined();
    expect(srcUpdate?.payload.ingested).toBe(false);
    expect(srcUpdate?.payload.ingested_at).toBeNull();
  });

  test("page with no linked source → sources untouched", async () => {
    fixtures["wiki_pages:select"] = { data: { source_id: null }, error: null };
    await deleteWikiPage("u1", "p1");
    expect(deleteCalls.find((c) => c.table === "wiki_pages")).toBeDefined();
    expect(updateCalls.find((c) => c.table === "sources")).toBeUndefined();
  });
});
