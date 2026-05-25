// Orchestration tests for generateSourcePage. Verifies the function calls
// the right sequence of queries/storage helpers with the right arguments.
// Doesn't test syncWikiLinks internals (covered by queries.test.ts) or the
// real DB (PR 4 integration tests).

interface Captured {
  fn: string;
  args: unknown[];
}

const captured: Captured[] = [];
const fixtures: Record<string, unknown> = {};

jest.mock("../queries", () => ({
  getSource: jest.fn((userId: string, sourceId: string) => {
    captured.push({ fn: "getSource", args: [userId, sourceId] });
    return Promise.resolve(fixtures.source);
  }),
  upsertWikiPage: jest.fn((input: unknown) => {
    captured.push({ fn: "upsertWikiPage", args: [input] });
    return Promise.resolve(fixtures.upsertWikiPage);
  }),
  syncWikiLinks: jest.fn((userId: string, page: unknown) => {
    captured.push({ fn: "syncWikiLinks", args: [userId, page] });
    return Promise.resolve(fixtures.syncResult ?? { added: 0, removed: 0, dangling: [] });
  }),
  markSourceIngested: jest.fn((sourceId: string) => {
    captured.push({ fn: "markSourceIngested", args: [sourceId] });
    return Promise.resolve();
  }),
}));

jest.mock("../storage", () => ({
  downloadRawClipping: jest.fn((path: string) => {
    captured.push({ fn: "downloadRawClipping", args: [path] });
    return Promise.resolve(fixtures.body ?? "body content");
  }),
}));

import { generateSourcePage, SourceNotFoundError } from "../phase2";

function reset() {
  captured.length = 0;
  for (const k of Object.keys(fixtures)) delete fixtures[k];
}

function callOrder(): string[] {
  return captured.map((c) => c.fn);
}

describe("generateSourcePage", () => {
  beforeEach(reset);

  test("throws SourceNotFoundError when getSource returns null", async () => {
    fixtures.source = null;
    await expect(generateSourcePage("u1", "missing")).rejects.toBeInstanceOf(SourceNotFoundError);
    expect(callOrder()).toEqual(["getSource"]);
  });

  test("happy path: fetches → downloads → upserts → syncs → marks ingested", async () => {
    fixtures.source = {
      id: "s1",
      user_id: "u1",
      kind: "article",
      title: "Big Five Personality",
      source_url: "https://example.com",
      storage_path: "u1/big-five-personality.md",
      frontmatter: { foo: "bar" },
      tags: ["psychology", "personality"],
      simon_relevance: 4,
      ingested: false,
      ingested_at: null,
      captured_at: "2026-05-25T00:00:00Z",
    };
    fixtures.body = "# Big Five Personality\n\nBody with [[Other Page]] link.";
    fixtures.upsertWikiPage = { id: "p1", user_id: "u1", slug: "big-five-personality", kind: "source" };
    fixtures.syncResult = { added: 0, removed: 0, dangling: ["other-page"] };

    const r = await generateSourcePage("u1", "s1");

    expect(callOrder()).toEqual([
      "getSource",
      "downloadRawClipping",
      "upsertWikiPage",
      "syncWikiLinks",
      "markSourceIngested",
    ]);

    const upsert = captured.find((c) => c.fn === "upsertWikiPage")!;
    expect(upsert.args[0]).toMatchObject({
      user_id: "u1",
      slug: "big-five-personality",
      kind: "source",
      title: "Big Five Personality",
      tags: ["psychology", "personality"],
      source_id: "s1",
      frontmatter: { foo: "bar" },
    });

    expect(r.linksAdded).toBe(0);
    expect(r.danglingSlugs).toEqual(["other-page"]);
    expect(r.slug).toBe("big-five-personality");
  });

  test("skips markSourceIngested when source is already ingested", async () => {
    fixtures.source = {
      id: "s1",
      user_id: "u1",
      kind: "article",
      title: "T",
      source_url: null,
      storage_path: "u1/t.md",
      frontmatter: {},
      tags: [],
      simon_relevance: null,
      ingested: true, // already
      ingested_at: "2026-05-25T00:00:00Z",
      captured_at: "2026-05-25T00:00:00Z",
    };
    fixtures.upsertWikiPage = { id: "p1", user_id: "u1", slug: "t", kind: "source" };

    await generateSourcePage("u1", "s1");

    expect(callOrder()).not.toContain("markSourceIngested");
  });

  test("Hangul title slugifies preserving syllables", async () => {
    fixtures.source = {
      id: "s1",
      user_id: "u1",
      kind: "self_knowledge",
      title: "민지의 성장 노트",
      source_url: null,
      storage_path: "u1/x.md",
      frontmatter: {},
      tags: [],
      simon_relevance: null,
      ingested: false,
      ingested_at: null,
      captured_at: "2026-05-25T00:00:00Z",
    };
    fixtures.upsertWikiPage = { id: "p1", user_id: "u1", slug: "민지의-성장-노트", kind: "source" };

    const r = await generateSourcePage("u1", "s1");
    expect(r.slug).toBe("민지의-성장-노트");
    const upsert = captured.find((c) => c.fn === "upsertWikiPage")!;
    expect((upsert.args[0] as { slug: string }).slug).toBe("민지의-성장-노트");
  });

  test("passes the page id (not source id) to syncWikiLinks", async () => {
    fixtures.source = {
      id: "s1",
      user_id: "u1",
      kind: "article",
      title: "T",
      source_url: null,
      storage_path: "u1/t.md",
      frontmatter: {},
      tags: [],
      simon_relevance: null,
      ingested: false,
      ingested_at: null,
      captured_at: "2026-05-25T00:00:00Z",
    };
    fixtures.upsertWikiPage = { id: "p-NEW", user_id: "u1", slug: "t", kind: "source" };

    await generateSourcePage("u1", "s1");

    const sync = captured.find((c) => c.fn === "syncWikiLinks")!;
    expect(sync.args[0]).toBe("u1");
    expect((sync.args[1] as { id: string }).id).toBe("p-NEW");
  });
});
