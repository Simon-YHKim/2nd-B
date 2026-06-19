// Tests focus on syncWikiLinks — the one query function with real
// orchestration logic. The thin CRUD wrappers (createSource, getWikiPage,
// etc.) are just supabase pass-throughs; their value is in integration,
// not unit, and PR 2 will exercise them end-to-end against a live DB.

interface Captured {
  table: string;
  operation: "select" | "insert" | "update" | "delete" | "upsert";
  filters: Record<string, unknown>;
  payload?: unknown;
}

const captured: Captured[] = [];
// Per-table fixture data the chain returns for `then` (list) and
// `maybeSingle/single` (one row).
const tableRows: Record<string, unknown[]> = {};

function makeChain(table: string, op: Captured["operation"], payload?: unknown) {
  const entry: Captured = { table, operation: op, filters: {}, payload };
  captured.push(entry);

  const chain: Record<string, unknown> = {};
  Object.assign(chain, {
    select(_cols?: string) {
      return chain;
    },
    eq(col: string, val: unknown) {
      entry.filters[col] = val;
      return chain;
    },
    in(col: string, vals: unknown[]) {
      entry.filters[`${col}__in`] = vals;
      return chain;
    },
    order() {
      return chain;
    },
    limit() {
      return chain;
    },
    overlaps() {
      return chain;
    },
    maybeSingle() {
      const rows = tableRows[table];
      return Promise.resolve({ data: rows && rows.length > 0 ? rows[0] : null, error: null });
    },
    single() {
      const rows = tableRows[table];
      return Promise.resolve({ data: rows && rows.length > 0 ? rows[0] : null, error: null });
    },
    then(resolve: (v: { data: unknown[]; error: null }) => void) {
      resolve({ data: tableRows[table] ?? [], error: null });
    },
  });
  return chain;
}

jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({
    from(table: string) {
      return {
        select: () => makeChain(table, "select"),
        insert: (p: unknown) => makeChain(table, "insert", p),
        update: (p: unknown) => makeChain(table, "update", p),
        delete: () => makeChain(table, "delete"),
        upsert: (p: unknown) => makeChain(table, "upsert", p),
      };
    },
  }),
}));

jest.mock("../../env", () => ({
  getEnv: () => ({
    EXPO_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
    EXPO_PUBLIC_SUPABASE_ANON_KEY: "x".repeat(40),
  }),
}));

import {
  insertInferredLinks,
  listInferredLinkDetails,
  listInferredLinks,
  ratifyLink,
  rejectInferredLink,
  syncWikiLinks,
} from "../queries";

function reset() {
  captured.length = 0;
  for (const k of Object.keys(tableRows)) delete tableRows[k];
}

function findFirst(table: string, op: Captured["operation"]): Captured | undefined {
  return captured.find((c) => c.table === table && c.operation === op);
}
function findAll(table: string, op: Captured["operation"]): Captured[] {
  return captured.filter((c) => c.table === table && c.operation === op);
}

describe("syncWikiLinks", () => {
  beforeEach(reset);

  test("empty body + no current edges → no DB writes", async () => {
    tableRows.wiki_links = [];
    const r = await syncWikiLinks("user-1", { id: "p-src", body_md: "no links here" });
    expect(r).toEqual({ added: 0, removed: 0, dangling: [] });
    expect(findAll("wiki_links", "insert")).toHaveLength(0);
    expect(findAll("wiki_links", "delete")).toHaveLength(0);
  });

  test("body references one known page → inserts one edge", async () => {
    tableRows.wiki_links = []; // no current outgoing
    tableRows.wiki_pages = [{ id: "p-foo", slug: "foo" }];

    const r = await syncWikiLinks("user-1", { id: "p-src", body_md: "see [[Foo]] for details" });

    expect(r.added).toBe(1);
    expect(r.removed).toBe(0);
    expect(r.dangling).toEqual([]);

    const insert = findFirst("wiki_links", "insert");
    expect(insert?.payload).toEqual([{ user_id: "user-1", from_page: "p-src", to_page: "p-foo" }]);
    expect(findAll("wiki_links", "delete")).toHaveLength(0);
  });

  test("body drops a previously-linked page → deletes the edge", async () => {
    tableRows.wiki_links = [{ to_page: "p-old", wiki_pages: { slug: "old" } }];
    tableRows.wiki_pages = [];

    const r = await syncWikiLinks("user-1", { id: "p-src", body_md: "nothing referenced now" });

    expect(r.added).toBe(0);
    expect(r.removed).toBe(1);

    const del = findFirst("wiki_links", "delete");
    expect(del?.filters.from_page).toBe("p-src");
    expect(del?.filters.to_page__in).toEqual(["p-old"]);
  });

  test("body has unresolved slug → reported as dangling, no insert", async () => {
    tableRows.wiki_links = [];
    tableRows.wiki_pages = [];

    const r = await syncWikiLinks("user-1", { id: "p-src", body_md: "[[Ghost Page]]" });

    expect(r.added).toBe(0);
    expect(r.removed).toBe(0);
    expect(r.dangling).toEqual(["ghost-page"]);
    expect(findAll("wiki_links", "insert")).toHaveLength(0);
  });

  test("self-link in body is silently dropped (no DB write)", async () => {
    tableRows.wiki_links = [];
    tableRows.wiki_pages = [{ id: "p-src", slug: "me" }];

    const r = await syncWikiLinks("user-1", { id: "p-src", body_md: "[[Me]]" });

    expect(r.added).toBe(0);
    expect(r.removed).toBe(0);
    expect(r.dangling).toEqual([]);
    expect(findAll("wiki_links", "insert")).toHaveLength(0);
  });

  test("mixed: keeps one, drops one, adds one, reports one dangling", async () => {
    tableRows.wiki_links = [
      { to_page: "p-keep", wiki_pages: { slug: "keep" } },
      { to_page: "p-old", wiki_pages: { slug: "old" } },
    ];
    tableRows.wiki_pages = [
      { id: "p-keep", slug: "keep" },
      { id: "p-new", slug: "new" },
    ];

    const r = await syncWikiLinks("user-1", {
      id: "p-src",
      body_md: "linked: [[Keep]], [[New]], and [[Ghost]]",
    });

    expect(r.added).toBe(1);
    expect(r.removed).toBe(1);
    expect(r.dangling).toEqual(["ghost"]);

    const insert = findFirst("wiki_links", "insert");
    expect(insert?.payload).toEqual([{ user_id: "user-1", from_page: "p-src", to_page: "p-new" }]);

    const del = findFirst("wiki_links", "delete");
    expect(del?.filters.to_page__in).toEqual(["p-old"]);
  });

  test("scopes reads and writes to the user via user_id filter", async () => {
    tableRows.wiki_links = [];
    tableRows.wiki_pages = [{ id: "p-foo", slug: "foo" }];

    await syncWikiLinks("user-XYZ", { id: "p-src", body_md: "[[Foo]]" });

    const reads = captured.filter((c) => c.operation === "select");
    for (const r of reads) expect(r.filters.user_id).toBe("user-XYZ");
    const insert = findFirst("wiki_links", "insert");
    expect((insert?.payload as { user_id: string }[])[0].user_id).toBe("user-XYZ");
  });
});

describe("propose->ratify edges (0046)", () => {
  beforeEach(reset);

  test("insertInferredLinks tags rows inferred, clamps confidence, drops self-links", async () => {
    const n = await insertInferredLinks("user-1", "p-src", [
      { toPageId: "p-a", confidence: 0.8 },
      { toPageId: "p-b", confidence: 1.7 }, // clamped to 1
      { toPageId: "p-src", confidence: 0.5 }, // self-link dropped
    ]);
    expect(n).toBe(2);
    const upsert = findFirst("wiki_links", "upsert");
    expect(upsert?.payload).toEqual([
      { user_id: "user-1", from_page: "p-src", to_page: "p-a", relation_type: "inferred", confidence: 0.8 },
      { user_id: "user-1", from_page: "p-src", to_page: "p-b", relation_type: "inferred", confidence: 1 },
    ]);
  });

  test("insertInferredLinks is a no-op for empty / all-self input", async () => {
    expect(await insertInferredLinks("user-1", "p-src", [])).toBe(0);
    expect(await insertInferredLinks("user-1", "p-src", [{ toPageId: "p-src", confidence: 0.9 }])).toBe(0);
    expect(findAll("wiki_links", "upsert")).toHaveLength(0);
  });

  test("listInferredLinks filters to inferred edges, scoped to the user", async () => {
    tableRows.wiki_links = [{ from_page: "p-src", to_page: "p-a", confidence: 0.8 }];
    const rows = await listInferredLinks("user-XYZ");
    expect(rows).toEqual([{ from_page: "p-src", to_page: "p-a", confidence: 0.8 }]);
    const select = findFirst("wiki_links", "select");
    expect(select?.filters.user_id).toBe("user-XYZ");
    expect(select?.filters.relation_type).toBe("inferred");
  });

  test("ratifyLink promotes the edge to ratified with confidence 1", async () => {
    await ratifyLink("user-1", "p-src", "p-a");
    const update = findFirst("wiki_links", "update");
    expect(update?.payload).toEqual({ relation_type: "ratified", confidence: 1 });
    expect(update?.filters.from_page).toBe("p-src");
    expect(update?.filters.to_page).toBe("p-a");
    expect(update?.filters.user_id).toBe("user-1");
  });

  test("rejectInferredLink deletes only the inferred edge", async () => {
    await rejectInferredLink("user-1", "p-src", "p-a");
    const del = findFirst("wiki_links", "delete");
    expect(del?.filters.from_page).toBe("p-src");
    expect(del?.filters.to_page).toBe("p-a");
    expect(del?.filters.relation_type).toBe("inferred");
  });

  test("listInferredLinkDetails resolves edges to page titles", async () => {
    tableRows.wiki_links = [{ from_page: "p-src", to_page: "p-a", confidence: 0.8 }];
    tableRows.wiki_pages = [
      { id: "p-src", title: "Source", slug: "source" },
      { id: "p-a", title: "Carl Jung", slug: "carl-jung" },
    ];
    const rows = await listInferredLinkDetails("user-1");
    expect(rows).toEqual([
      { from_page: "p-src", to_page: "p-a", from_title: "Source", to_title: "Carl Jung", confidence: 0.8 },
    ]);
  });

  test("listInferredLinkDetails falls back to slug then id for blank titles", async () => {
    tableRows.wiki_links = [{ from_page: "p-src", to_page: "p-a", confidence: 0.6 }];
    tableRows.wiki_pages = [
      { id: "p-src", title: "  ", slug: "src-slug" },
      { id: "p-a", title: "", slug: "" },
    ];
    const rows = await listInferredLinkDetails("user-1");
    expect(rows[0].from_title).toBe("src-slug");
    expect(rows[0].to_title).toBe("p-a");
  });
});
