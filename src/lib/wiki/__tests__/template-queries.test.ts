// Same supabase mocking approach as queries.test.ts: capture the table +
// operation + filters/payload so the thin wrappers and the defensive row
// mapper are exercised without a live DB.

interface Captured {
  table: string;
  operation: "select" | "insert" | "update" | "delete" | "upsert";
  filters: Record<string, unknown>;
  payload?: unknown;
}

const captured: Captured[] = [];
const tableRows: Record<string, unknown[]> = {};

function makeChain(table: string, op: Captured["operation"], payload?: unknown) {
  const entry: Captured = { table, operation: op, filters: {}, payload };
  captured.push(entry);
  const chain: Record<string, unknown> = {};
  Object.assign(chain, {
    select() {
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
    single() {
      const rows = tableRows[table];
      return Promise.resolve({ data: rows && rows.length > 0 ? rows[0] : null, error: null });
    },
    maybeSingle() {
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

import {
  mapTemplateRow,
  listAccessibleTemplates,
  saveTemplate,
  setTemplateShared,
} from "../template-queries";

function reset() {
  captured.length = 0;
  for (const k of Object.keys(tableRows)) delete tableRows[k];
}

function row(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "t1",
    owner_id: "u1",
    slug: "podcast",
    base_kind: "video",
    name: { en: "Podcast", ko: "팟캐스트" },
    what: { en: "A podcast.", ko: "팟캐스트." },
    triggers: ["https://open.spotify.com/*"],
    default_tags: ["podcast", "audio"],
    target_category: "concepts",
    wiki_target: "",
    ai_properties: [{ name: "host", type: "text", describe: { en: "Host", ko: "진행자" } }],
    is_shared: true,
    created_at: "2026-06-01T00:00:00Z",
    updated_at: "2026-06-01T00:00:00Z",
    ...over,
  };
}

describe("mapTemplateRow", () => {
  beforeEach(reset);

  test("maps a full row into the bundled-template shape", () => {
    const t = mapTemplateRow(row() as never);
    expect(t.ownerId).toBe("u1");
    expect(t.baseKind).toBe("video");
    expect(t.name.ko).toBe("팟캐스트");
    expect(t.defaultTags).toEqual(["podcast", "audio"]);
    expect(t.targetCategory).toBe("concepts");
    expect(t.aiProperties).toEqual([{ name: "host", type: "text", describe: { en: "Host", ko: "진행자" } }]);
    expect(t.isShared).toBe(true);
  });

  test("defends against junk jsonb / invalid enum values", () => {
    const t = mapTemplateRow(
      row({ base_kind: "nope", target_category: "weird", name: "oops", triggers: 5, ai_properties: { bad: 1 } }) as never,
    );
    expect(t.baseKind).toBe("inbox"); // invalid → safe fallback
    expect(t.targetCategory).toBe(""); // invalid → empty
    expect(t.name).toEqual({ en: "", ko: "" }); // non-object → empty pair
    expect(t.triggers).toEqual([]); // non-array → empty
    expect(t.aiProperties).toEqual([]); // non-array → empty
  });
});

describe("template query wrappers", () => {
  beforeEach(reset);

  test("saveTemplate upserts owner-scoped payload and maps the returned row", async () => {
    tableRows.clipper_templates = [row({ slug: "podcast" })];
    const saved = await saveTemplate({
      ownerId: "u1",
      slug: "podcast",
      baseKind: "video",
      name: { en: "Podcast", ko: "팟캐스트" },
      what: { en: "A podcast.", ko: "팟캐스트." },
      defaultTags: ["podcast"],
      shared: true,
    });
    const up = captured.find((c) => c.operation === "upsert")!;
    expect(up.table).toBe("clipper_templates");
    expect(up.payload).toMatchObject({ owner_id: "u1", slug: "podcast", base_kind: "video", is_shared: true });
    expect(saved.slug).toBe("podcast");
    expect(saved.baseKind).toBe("video");
  });

  test("setTemplateShared updates is_shared scoped to owner + id", async () => {
    await setTemplateShared("u1", "t1", true);
    const upd = captured.find((c) => c.operation === "update")!;
    expect(upd.payload).toEqual({ is_shared: true });
    expect(upd.filters.owner_id).toBe("u1");
    expect(upd.filters.id).toBe("t1");
  });

  test("listAccessibleTemplates returns own formats before community ones", async () => {
    tableRows.clipper_templates = [
      row({ id: "shared", owner_id: "other", is_shared: true }),
      row({ id: "mine", owner_id: "u1", is_shared: false }),
    ];
    const list = await listAccessibleTemplates("u1");
    expect(list.map((t) => t.id)).toEqual(["mine", "shared"]);
  });
});
