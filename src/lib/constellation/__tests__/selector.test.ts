// Tests for the self-understanding constellation selector. The Supabase client
// is mocked per-table with a head:true count terminus; we assert per-stage
// lighting (litCount), the sequential gated `level`, signed-out behaviour, and
// graceful absorption of a failed query. We also verify the wiki_links stage
// counts over `from_page` (no `id` column — composite PK).

interface CountResult {
  count: number | null;
  error: { message: string } | null;
}

// Per-table count fixtures (keyed by table name). Default = 0 rows.
const tableCounts: Record<string, CountResult> = {};
// Records the (table, column) passed to select() so we can assert wiki_links
// uses from_page rather than the default id.
const selectColumns: { table: string; column: string }[] = [];
// eq() filter calls per table, so we can confirm the consent multi-filter chain.
const eqCalls: { table: string; column: string; value: unknown }[] = [];

function makeFilter(table: string): unknown {
  const result = tableCounts[table] ?? { count: 0, error: null };
  const promise = Promise.resolve(result);
  // eq() is both chainable (consent chains three) and a thenable terminus.
  const node: Record<string, unknown> = {
    eq: (column: string, value: unknown) => {
      eqCalls.push({ table, column, value });
      return node;
    },
    then: (...args: unknown[]) => promise.then(...(args as Parameters<typeof promise.then>)),
    catch: (...args: unknown[]) => promise.catch(...(args as Parameters<typeof promise.catch>)),
    finally: (...args: unknown[]) => promise.finally(...(args as Parameters<typeof promise.finally>)),
  };
  return node;
}

jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({
    from: (table: string) => ({
      select: (column: string, _opts: unknown) => {
        selectColumns.push({ table, column });
        return makeFilter(table);
      },
    }),
  }),
}));

import { selectConstellationLevel, STAGES } from "../selector";

function reset() {
  for (const k of Object.keys(tableCounts)) delete tableCounts[k];
  selectColumns.length = 0;
  eqCalls.length = 0;
}

// Convenience: mark a table as "has rows" so its stage is done.
function setCount(table: string, count: number) {
  tableCounts[table] = { count, error: null };
}

describe("selectConstellationLevel", () => {
  beforeEach(reset);

  test("uid null → all dim, level 0, litCount 0 (no queries)", async () => {
    const s = await selectConstellationLevel(null);
    expect(s.level).toBe(0);
    expect(s.litCount).toBe(0);
    expect(s.stages).toHaveLength(7);
    expect(s.stages.every((st) => st.done === false)).toBe(true);
    // self_context still reports gated even when signed out.
    expect(s.stages.find((st) => st.key === "self_context")?.gated).toBe(true);
    // No table queries were issued.
    expect(selectColumns).toHaveLength(0);
  });

  test("stages 1 & 2 done, 3 gated → level 2 (sequential halts at gate)", async () => {
    setCount("consent_records", 1); // Alkaid done
    setCount("records", 3); // Mizar done
    // self_contexts left at 0 (and gated anyway)
    const s = await selectConstellationLevel("u1");
    expect(s.level).toBe(2); // halts before the gated self_context star
    expect(s.stages.find((st) => st.key === "consent_profile")?.done).toBe(true);
    expect(s.stages.find((st) => st.key === "first_capture")?.done).toBe(true);
    expect(s.stages.find((st) => st.key === "self_context")?.done).toBe(false);
    expect(s.litCount).toBe(2);
  });

  test("gated self_context never advances level even if its count passes", async () => {
    setCount("consent_records", 1);
    setCount("records", 1);
    setCount("self_contexts", 5); // query would pass…
    setCount("memorized_patterns", 1); // …and stage 4 is done independently
    const s = await selectConstellationLevel("u1");
    // Sequential level halts at the GATE regardless of the passing count.
    expect(s.level).toBe(2);
    // But the star lights per-stage: self_context done is true, stage 4 too.
    expect(s.stages.find((st) => st.key === "self_context")?.done).toBe(true);
    expect(s.stages.find((st) => st.key === "pattern_memory")?.done).toBe(true);
    // litCount counts every done stage independently (consent, capture, self, pattern).
    expect(s.litCount).toBe(4);
  });

  test("later stages light per-stage even with earlier gaps (litCount, not level)", async () => {
    // Only stages 5,6,7 done — earlier ones empty. Sequential level = 0,
    // but three stars still light.
    setCount("wiki_pages", 1);
    setCount("wiki_links", 2);
    setCount("personas", 1);
    const s = await selectConstellationLevel("u1");
    expect(s.level).toBe(0); // stage 1 not done → no sequential run
    expect(s.litCount).toBe(3);
    expect(s.stages.find((st) => st.key === "wiki_grounding")?.done).toBe(true);
    expect(s.stages.find((st) => st.key === "graph_linking")?.done).toBe(true);
    expect(s.stages.find((st) => st.key === "persona_reflection")?.done).toBe(true);
  });

  test("all seven counts run → all stars considered (parallel)", async () => {
    setCount("consent_records", 1);
    setCount("records", 1);
    setCount("memorized_patterns", 1);
    setCount("wiki_pages", 1);
    setCount("wiki_links", 1);
    setCount("personas", 1);
    // self_contexts stays 0 (gated, unreachable).
    const s = await selectConstellationLevel("u1");
    // Six independent stars lit; level halts at the gated self_context (after 2).
    expect(s.litCount).toBe(6);
    expect(s.level).toBe(2);
  });

  test("a failed query is absorbed (stage done:false), others still resolve", async () => {
    setCount("consent_records", 1);
    setCount("records", 1);
    // records query OK, but make memorized_patterns error out.
    tableCounts["memorized_patterns"] = { count: null, error: { message: "boom" } };
    setCount("personas", 1);
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const s = await selectConstellationLevel("u1");
    expect(s.stages.find((st) => st.key === "pattern_memory")?.done).toBe(false);
    // persona stage unaffected by the sibling failure.
    expect(s.stages.find((st) => st.key === "persona_reflection")?.done).toBe(true);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  test("wiki_links stage counts over from_page (no id column)", async () => {
    setCount("wiki_links", 1);
    await selectConstellationLevel("u1");
    const wikiLinksSelect = selectColumns.find((c) => c.table === "wiki_links");
    expect(wikiLinksSelect?.column).toBe("from_page");
  });

  test("consent stage applies the required_ack + llm_processing_ack filters", async () => {
    setCount("consent_records", 1);
    await selectConstellationLevel("u1");
    const consentEq = eqCalls.filter((c) => c.table === "consent_records");
    expect(consentEq.map((c) => c.column)).toEqual(
      expect.arrayContaining(["user_id", "required_ack", "llm_processing_ack"]),
    );
    expect(consentEq.find((c) => c.column === "required_ack")?.value).toBe(true);
    expect(consentEq.find((c) => c.column === "llm_processing_ack")?.value).toBe(true);
  });

  test("STAGES order matches the handle→bowl star sequence", () => {
    expect(STAGES.map((s) => s.star)).toEqual([
      "Alkaid",
      "Mizar",
      "Alioth",
      "Megrez",
      "Phecda",
      "Merak",
      "Dubhe",
    ]);
    // Only self_context is gated.
    expect(STAGES.filter((s) => s.gated).map((s) => s.key)).toEqual(["self_context"]);
  });
});
