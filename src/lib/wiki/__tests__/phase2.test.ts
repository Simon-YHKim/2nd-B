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

  test("merges Phase 1 concepts into wiki page tags (slugified, deduped)", async () => {
    fixtures.source = {
      id: "s1",
      user_id: "u1",
      title: "Big Five Personality",
      storage_path: "u1/big-five.md",
      frontmatter: {
        __phase1__: {
          summary: "Five-factor model summary.",
          entities: ["McCrae", "Costa"],
          concepts: ["Openness to Experience", "neuroticism", "Big Five"],
          questions: ["q1", "q2", "q3", "q4"],
          generated_at: "2026-05-25T00:00:00Z",
          model: "gemini-2.5-flash",
        },
      },
      tags: ["psychology", "big-five"],
    };
    fixtures.upsertWikiPage = { id: "p1", user_id: "u1", slug: "big-five-personality" };

    await generateSourcePage("u1", "s1");

    const upsert = captured.find((c) => c.fn === "upsertWikiPage")!;
    const tags = (upsert.args[0] as { tags: string[] }).tags;
    // Original tags preserved, concepts slugified, "big-five" appears once.
    expect(tags).toContain("psychology");
    expect(tags).toContain("big-five");
    expect(tags).toContain("openness-to-experience");
    expect(tags).toContain("neuroticism");
    // "Big Five" → "big-five" — already in source tags so should appear once
    const occurrences = tags.filter((t) => t === "big-five").length;
    expect(occurrences).toBe(1);
  });

  test("no Phase 1 cached → tags unchanged (no concept merge)", async () => {
    fixtures.source = {
      id: "s1",
      user_id: "u1",
      title: "Article",
      storage_path: "u1/article.md",
      frontmatter: {}, // no __phase1__
      tags: ["one", "two"],
    };
    fixtures.upsertWikiPage = { id: "p1", user_id: "u1", slug: "article" };

    await generateSourcePage("u1", "s1");

    const upsert = captured.find((c) => c.fn === "upsertWikiPage")!;
    expect((upsert.args[0] as { tags: string[] }).tags).toEqual(["one", "two"]);
  });
});
