interface QueryResult {
  data: unknown;
  error: { message: string } | null;
  count?: number | null;
}

const fixtures: Record<string, QueryResult> = {};
const calls: Array<{ table: string; columns: string; countOnly: boolean }> = [];
const forbiddenWrites = {
  insert: jest.fn(() => {
    throw new Error("insert must not run");
  }),
  upsert: jest.fn(() => {
    throw new Error("upsert must not run");
  }),
  update: jest.fn(() => {
    throw new Error("update must not run");
  }),
  rpc: jest.fn(() => {
    throw new Error("rpc must not run");
  }),
};

function chainable(result: QueryResult) {
  const promise = Promise.resolve(result);
  const chain: Record<string, unknown> = {
    eq: () => chain,
    contains: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: () =>
      promise.then((value) => ({
        data: Array.isArray(value.data) ? (value.data[0] ?? null) : value.data,
        error: value.error,
        count: value.count,
      })),
    then: (...args: unknown[]) => promise.then(...(args as Parameters<typeof promise.then>)),
    catch: (...args: unknown[]) => promise.catch(...(args as Parameters<typeof promise.catch>)),
    finally: (...args: unknown[]) => promise.finally(...(args as Parameters<typeof promise.finally>)),
  };
  return chain;
}

jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({
    from: (table: string) => ({
      select: (columns: string, opts?: { count?: string; head?: boolean }) => {
        const countOnly = opts?.count === "exact" && opts?.head === true;
        calls.push({ table, columns, countOnly });
        const key = countOnly ? `${table}:count` : `${table}:${columns}`;
        return chainable(fixtures[key] ?? { data: [], error: null, count: countOnly ? 0 : undefined });
      },
      ...forbiddenWrites,
    }),
    rpc: forbiddenWrites.rpc,
    functions: { invoke: jest.fn(() => Promise.reject(new Error("functions.invoke must not run"))) },
  }),
}));

import { buildIdenExport } from "../iden-export";
import { loadPersistedIden, visibleIdenDocForExport } from "../load-persisted-iden";
import type { IdenDoc } from "../types";

const PERSONA_COLUMNS = "traits, values, patterns, created_at, version";

function resetFixtures() {
  for (const key of Object.keys(fixtures)) delete fixtures[key];
  calls.length = 0;
  for (const fn of Object.values(forbiddenWrites)) fn.mockClear();
  fixtures["users:display_name"] = { data: [{ display_name: "Simon" }], error: null };
  fixtures[`personas:${PERSONA_COLUMNS}`] = { data: [], error: null };
  fixtures["records:body, created_at"] = { data: [], error: null };
  fixtures["sources:count"] = { data: null, error: null, count: 0 };
  fixtures["records:count"] = { data: null, error: null, count: 0 };
  fixtures["wiki_pages:count"] = { data: null, error: null, count: 0 };
}

describe("loadPersistedIden", () => {
  beforeEach(resetFixtures);

  it("composes a read-only snapshot from persisted rows and the user-ratified northstar", async () => {
    fixtures[`personas:${PERSONA_COLUMNS}`] = {
      data: [{
        traits: {
          openness: 0.82,
          conscientiousness: 0.68,
          extraversion: 0.35,
          agreeableness: 0.74,
          neuroticism: 0.41,
        },
        values: ["sdt:autonomy"],
        patterns: {
          summary: "A persisted summary.",
          derived_one_liner: "This must never replace the ratified sentence.",
        },
        created_at: "2026-08-20T00:00:00Z",
        version: 1,
      }],
      error: null,
    };
    fixtures["records:body, created_at"] = {
      data: [{ body: "I build tools that help me understand myself.", created_at: "2026-08-28T00:00:00Z" }],
      error: null,
    };
    fixtures["sources:count"] = { data: null, error: null, count: 2 };
    fixtures["records:count"] = { data: null, error: null, count: 3 };
    fixtures["wiki_pages:count"] = { data: null, error: null, count: 1 };

    const doc = await loadPersistedIden("user-a", { locale: "en", generated: "2026-08-29" });

    expect(doc).not.toBeNull();
    expect(doc).toMatchObject({
      name: "Simon",
      generated: "2026-08-29",
      oneLiner: "I build tools that help me understand myself.",
      summary: { text: "A persisted summary.", source: { kind: "ai_summary" } },
    });
    expect(doc?.fields.some((field) => field.key === "cores")).toBe(false);
    expect(doc?.fields.find((field) => field.key === "traits")?.source).toEqual({ kind: "derived" });
    expect(doc?.fields.find((field) => field.key === "contents")).toMatchObject({
      data: { Sources: 2, Records: 3, Concepts: 1 },
    });
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((call) => call.columns.length > 0)).toBe(true);
    for (const fn of Object.values(forbiddenWrites)) expect(fn).not.toHaveBeenCalled();
  });

  it("returns null for a new account with no ratified northstar, persona evidence, or vault rows", async () => {
    fixtures[`personas:${PERSONA_COLUMNS}`] = {
      data: [{
        traits: {
          openness: 0.5,
          conscientiousness: 0.5,
          extraversion: 0.5,
          agreeableness: 0.5,
          neuroticism: 0.5,
        },
        values: [],
        patterns: { summary: "No written entries yet to summarize." },
        created_at: "2026-08-20T00:00:00Z",
        version: 1,
      }],
      error: null,
    };

    await expect(loadPersistedIden("empty-user", { locale: "en", generated: "2026-08-29" })).resolves.toBeNull();
  });

  it("fails loudly on a persisted snapshot read error", async () => {
    fixtures[`personas:${PERSONA_COLUMNS}`] = { data: null, error: { message: "db unavailable" } };

    await expect(loadPersistedIden("user-a", { locale: "ko" })).rejects.toEqual({ message: "db unavailable" });
  });
});

describe("visibleIdenDocForExport", () => {
  const doc: IdenDoc = {
    iden: "0.1",
    name: "Current user",
    generated: "2026-08-29",
    oneLiner: "Current ratified northstar",
    fields: [
      { key: "traits", label: "Traits", viz: "radar", source: { kind: "derived" }, data: { Openness: 0.8 } },
      { key: "contents", label: "Contents", viz: "donut", source: { kind: "count" }, data: { Records: 2 } },
    ],
    summary: { text: "HIDDEN SUMMARY MUST NOT LEAVE", source: { kind: "ai_summary" } },
  };

  it("serializes only visible rows and excludes the hidden summary by default", () => {
    const visible = visibleIdenDocForExport(doc, ["bigfive"]);
    const artifact = buildIdenExport(visible, { locale: "en" });

    expect(visible.fields.map((field) => field.key)).toEqual(["contents"]);
    expect(visible.summary).toBeUndefined();
    expect(artifact.iden).not.toContain("HIDDEN SUMMARY MUST NOT LEAVE");
    expect(artifact.json).not.toContain("HIDDEN SUMMARY MUST NOT LEAVE");
    expect(artifact.html).not.toContain("HIDDEN SUMMARY MUST NOT LEAVE");
  });

  it("removes the northstar when its visible row is disabled", () => {
    expect(visibleIdenDocForExport(doc, ["northstar"]).oneLiner).toBe("");
  });
});
