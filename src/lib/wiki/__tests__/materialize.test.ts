// Unit tests for materializeGraphFromPhase1 — get-or-create entity/concept
// pages + source→node edges from Phase 1 output. No Gemini, no live DB: a
// slug-aware in-memory Supabase mock so get-or-create and edge-dedupe can be
// exercised distinctly (the shared queries.test harness returns one fixed row
// per table, which can't model per-slug get-or-create).

interface PageRow {
  id: string;
  user_id: string;
  slug: string;
  kind: string;
  title: string;
  body_md: string;
}

const store = {
  pagesBySlug: new Map<string, PageRow>(),
  edges: new Set<string>(), // `${from}|${to}`
  seq: 0,
  inserts: [] as { table: string; payload: unknown }[],
};

function reset() {
  store.pagesBySlug.clear();
  store.edges.clear();
  store.seq = 0;
  store.inserts.length = 0;
}

/** Seed an existing page so get-or-create takes the reuse branch. */
function seedPage(p: Partial<PageRow> & { slug: string; id: string }) {
  store.pagesBySlug.set(p.slug, {
    user_id: "user-1",
    kind: "entity",
    title: p.slug,
    body_md: "existing body — must never be overwritten",
    ...p,
  });
}

// --- minimal chainable query mock -------------------------------------------

function wikiPagesChain(op: "select" | "upsert", payload?: unknown) {
  const filters: Record<string, unknown> = {};
  const chain: Record<string, unknown> = {
    select() {
      return chain;
    },
    eq(col: string, val: unknown) {
      filters[col] = val;
      return chain;
    },
    maybeSingle() {
      const slug = filters.slug as string;
      const found = store.pagesBySlug.get(slug) ?? null;
      return Promise.resolve({ data: found, error: null });
    },
    single() {
      // upsert path: create-or-return by (user_id, slug).
      const input = payload as Omit<PageRow, "id">;
      const existing = store.pagesBySlug.get(input.slug);
      if (existing) return Promise.resolve({ data: existing, error: null });
      const row: PageRow = { ...input, id: `pg-${++store.seq}` };
      store.pagesBySlug.set(row.slug, row);
      return Promise.resolve({ data: row, error: null });
    },
  };
  void op;
  return chain;
}

function wikiLinksChain(op: "select" | "insert", payload?: unknown) {
  const filters: Record<string, unknown> = {};
  const chain: Record<string, unknown> = {
    select() {
      return chain;
    },
    eq(col: string, val: unknown) {
      filters[col] = val;
      return chain;
    },
    then(resolve: (v: { data: unknown[] | null; error: null }) => void) {
      if (op === "insert") {
        store.inserts.push({ table: "wiki_links", payload });
        for (const r of payload as { from_page: string; to_page: string }[]) {
          store.edges.add(`${r.from_page}|${r.to_page}`);
        }
        return resolve({ data: null, error: null });
      }
      // getOutgoingLinks: edges out of filters.from_page
      const from = filters.from_page as string;
      const rows = [...store.edges]
        .filter((e) => e.startsWith(`${from}|`))
        .map((e) => {
          const to = e.split("|")[1];
          const page = [...store.pagesBySlug.values()].find((p) => p.id === to);
          return { to_page: to, wiki_pages: { slug: page?.slug ?? "" } };
        });
      return resolve({ data: rows, error: null });
    },
  };
  return chain;
}

jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({
    from(table: string) {
      if (table === "wiki_pages") {
        return {
          select: () => wikiPagesChain("select"),
          upsert: (p: unknown) => wikiPagesChain("upsert", p),
        };
      }
      if (table === "wiki_links") {
        return {
          select: () => wikiLinksChain("select"),
          insert: (p: unknown) => wikiLinksChain("insert", p),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

import { materializeGraphFromPhase1 } from "../materialize";

const SRC = { id: "pg-src" };

describe("materializeGraphFromPhase1", () => {
  beforeEach(reset);

  test("no entities/concepts → no-op", async () => {
    const r = await materializeGraphFromPhase1("user-1", SRC, { entities: [], concepts: [] });
    expect(r).toEqual({ entityPagesCreated: 0, conceptPagesCreated: 0, pagesReused: 0, linksAdded: 0 });
    expect(store.inserts).toHaveLength(0);
  });

  test("creates entity + concept pages and links the source to each", async () => {
    const r = await materializeGraphFromPhase1("user-1", SRC, {
      entities: ["Carl Jung"],
      concepts: ["Shadow Self", "Individuation"],
    });
    expect(r.entityPagesCreated).toBe(1);
    expect(r.conceptPagesCreated).toBe(2);
    expect(r.pagesReused).toBe(0);
    expect(r.linksAdded).toBe(3);

    // three pages materialized with empty bodies and source_id null
    const jung = store.pagesBySlug.get("carl-jung");
    expect(jung?.kind).toBe("entity");
    expect(jung?.body_md).toBe("");
    expect(store.pagesBySlug.get("shadow-self")?.kind).toBe("concept");

    // edges: source → each node
    expect(store.edges.has(`pg-src|${jung!.id}`)).toBe(true);
    expect(store.edges.size).toBe(3);
  });

  test("reuses an existing page and never overwrites its body", async () => {
    seedPage({ slug: "carl-jung", id: "pg-existing", kind: "concept" });
    const r = await materializeGraphFromPhase1("user-1", SRC, { entities: ["Carl Jung"], concepts: [] });
    expect(r.pagesReused).toBe(1);
    expect(r.entityPagesCreated).toBe(0);
    expect(r.linksAdded).toBe(1);
    // untouched: original kind + body survive
    const page = store.pagesBySlug.get("carl-jung");
    expect(page?.id).toBe("pg-existing");
    expect(page?.kind).toBe("concept");
    expect(page?.body_md).toBe("existing body — must never be overwritten");
    expect(store.edges.has("pg-src|pg-existing")).toBe(true);
  });

  test("dedupes names that collapse to one slug (first-seen wins)", async () => {
    const r = await materializeGraphFromPhase1("user-1", SRC, {
      entities: ["AI"],
      concepts: ["ai"], // same slug as entity → not re-created
    });
    expect(r.entityPagesCreated).toBe(1);
    expect(r.conceptPagesCreated).toBe(0);
    expect(r.linksAdded).toBe(1);
    expect(store.pagesBySlug.get("ai")?.kind).toBe("entity");
  });

  test("skips empty / whitespace names", async () => {
    const r = await materializeGraphFromPhase1("user-1", SRC, {
      entities: ["   ", ""],
      concepts: ["Real Concept"],
    });
    expect(r.entityPagesCreated).toBe(0);
    expect(r.conceptPagesCreated).toBe(1);
    expect(r.linksAdded).toBe(1);
  });

  test("skips a self-link when a node resolves to the source page", async () => {
    // seed a page whose slug matches the entity name AND whose id is the source
    seedPage({ slug: "self", id: "pg-src" });
    const r = await materializeGraphFromPhase1("user-1", SRC, { entities: ["Self"], concepts: [] });
    expect(r.pagesReused).toBe(1);
    expect(r.linksAdded).toBe(0); // self-link skipped
    expect(store.inserts).toHaveLength(0);
  });

  test("re-running on the same source adds no duplicate edges", async () => {
    const input = { entities: ["Carl Jung"], concepts: ["Individuation"] };
    const first = await materializeGraphFromPhase1("user-1", SRC, input);
    expect(first.linksAdded).toBe(2);
    const second = await materializeGraphFromPhase1("user-1", SRC, input);
    expect(second.linksAdded).toBe(0); // edges already exist
    expect(second.pagesReused).toBe(2); // pages already exist
    expect(store.edges.size).toBe(2);
  });

  test("scopes inserts to the user", async () => {
    await materializeGraphFromPhase1("user-XYZ", SRC, { entities: ["Node"], concepts: [] });
    const edgeInsert = store.inserts.find((i) => i.table === "wiki_links");
    expect((edgeInsert?.payload as { user_id: string }[])[0].user_id).toBe("user-XYZ");
  });
});
