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
  getWikiPage: jest.fn((userId: string, slug: string) => {
    captured.push({ fn: "getWikiPage", args: [userId, slug] });
    // fixtures.slugOwner stands in for "a page already sits on this slug".
    return Promise.resolve(fixtures.slugOwner ?? null);
  }),
  upsertWikiPage: jest.fn((input: unknown) => {
    captured.push({ fn: "upsertWikiPage", args: [input] });
    return Promise.resolve(fixtures.upsertWikiPage);
  }),
  syncWikiLinks: jest.fn((userId: string, page: unknown) => {
    captured.push({ fn: "syncWikiLinks", args: [userId, page] });
    return Promise.resolve(fixtures.syncResult ?? { added: 0, removed: 0, dangling: [] });
  }),
  markSourceIngested: jest.fn((userId: string, sourceId: string) => {
    captured.push({ fn: "markSourceIngested", args: [userId, sourceId] });
    return Promise.resolve();
  }),
}));

jest.mock("../storage", () => ({
  downloadRawClipping: jest.fn((path: string) => {
    captured.push({ fn: "downloadRawClipping", args: [path] });
    // A failed upload leaves storage_path set but the object missing — the
    // production shape that stranded every source. fixtures.storageMissing
    // reproduces it.
    if (fixtures.storageMissing) return Promise.reject(new Error("Object not found"));
    return Promise.resolve(fixtures.body ?? "body content");
  }),
}));

// materialize has its own unit test (materialize.test.ts); here we only assert
// phase2 invokes it with the Phase 1 output and surfaces its counts.
jest.mock("../materialize", () => ({
  materializeGraphFromPhase1: jest.fn((userId: string, source: unknown, phase1: unknown) => {
    captured.push({ fn: "materializeGraphFromPhase1", args: [userId, source, phase1] });
    return Promise.resolve(
      fixtures.materializeResult ?? {
        entityPagesCreated: 0,
        conceptPagesCreated: 0,
        pagesReused: 0,
        linksAdded: 0,
      },
    );
  }),
}));

import { generateSourcePage, SourceNotFoundError, SourceBodyUnavailableError } from "../phase2";

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
      // Slug-ownership check: refuses to clobber an entity/concept page or
      // another source that already sits on this slug.
      "getWikiPage",
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

  test("materializes Phase 1 nodes and surfaces their counts on the result", async () => {
    fixtures.source = {
      id: "s1",
      user_id: "u1",
      title: "Big Five Personality",
      storage_path: "u1/big-five.md",
      frontmatter: {
        __phase1__: {
          summary: "summary",
          entities: ["McCrae", "Costa"],
          concepts: ["Openness"],
          questions: ["q1", "q2", "q3", "q4"],
          generated_at: "2026-05-25T00:00:00Z",
          model: "gemini-2.5-flash",
        },
      },
      tags: [],
    };
    fixtures.upsertWikiPage = { id: "p1", user_id: "u1", slug: "big-five-personality" };
    fixtures.materializeResult = {
      entityPagesCreated: 2,
      conceptPagesCreated: 1,
      pagesReused: 0,
      linksAdded: 3,
    };

    const r = await generateSourcePage("u1", "s1");

    // materialize runs AFTER syncWikiLinks, with the page id and the Phase 1 output.
    const mat = captured.find((c) => c.fn === "materializeGraphFromPhase1")!;
    expect(mat.args[0]).toBe("u1");
    expect((mat.args[1] as { id: string }).id).toBe("p1");
    expect((mat.args[2] as { entities: string[] }).entities).toEqual(["McCrae", "Costa"]);
    expect(callOrder().indexOf("syncWikiLinks")).toBeLessThan(
      callOrder().indexOf("materializeGraphFromPhase1"),
    );

    expect(r.entityPagesAdded).toBe(2);
    expect(r.conceptPagesAdded).toBe(1);
    expect(r.nodeLinksAdded).toBe(3);
  });

  test("no Phase 1 cached → no materialize call, tags unchanged", async () => {
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
    expect(callOrder()).not.toContain("materializeGraphFromPhase1");
  });
});

describe("body fallback when the Storage upload never landed", () => {
  // capture.ts writes the canonical storage_path onto the row even when the
  // upload fails, stashing the body in frontmatter._body_fallback. Promotion
  // used to trust the path and throw, which is why the QA account's only source
  // (a KakaoTalk import, 48 bytes in _body_fallback) could never become a wiki
  // page while the detail screen rendered it fine — get-piece.ts already read
  // the same fallback.
  beforeEach(reset);

  it("promotes from _body_fallback when Storage misses", async () => {
    fixtures.storageMissing = true;
    fixtures.source = {
      id: "s1",
      title: "KakaoTalk import",
      tags: [],
      storage_path: "u/kakaotalk.md",
      frontmatter: { _body_fallback: "the rescued body" },
      ingested: false,
    };
    fixtures.upsertWikiPage = { id: "p1" };

    await generateSourcePage("u1", "s1");

    const upsert = captured.find((c) => c.fn === "upsertWikiPage");
    expect((upsert?.args[0] as { body_md: string }).body_md).toBe("the rescued body");
    expect(captured.some((c) => c.fn === "markSourceIngested")).toBe(true);
  });

  it("throws a distinct error when neither Storage nor the fallback has a body", async () => {
    fixtures.storageMissing = true;
    fixtures.source = {
      id: "s1",
      title: "Empty",
      tags: [],
      storage_path: "u/empty.md",
      frontmatter: {},
      ingested: false,
    };
    await expect(generateSourcePage("u1", "s1")).rejects.toBeInstanceOf(SourceBodyUnavailableError);
  });

  it("still prefers Storage when the object is there", async () => {
    fixtures.source = {
      id: "s1",
      title: "Fine",
      tags: [],
      storage_path: "u/fine.md",
      frontmatter: { _body_fallback: "stale copy" },
      ingested: false,
    };
    fixtures.body = "fresh from storage";
    fixtures.upsertWikiPage = { id: "p1" };

    await generateSourcePage("u1", "s1");

    const upsert = captured.find((c) => c.fn === "upsertWikiPage");
    expect((upsert?.args[0] as { body_md: string }).body_md).toBe("fresh from storage");
  });
});

describe("slug collision never overwrites somebody else's page", () => {
  // upsertWikiPage keys on (user_id, slug). materialize.ts get-or-creates and so
  // refuses to clobber; phase2 was the one writer that did not, so a source whose
  // title slugged onto an existing entity/concept page would silently flip that
  // row to kind='source', replace its body and steal its source_id.
  beforeEach(reset);

  const source = (id: string, title: string) => ({
    id,
    title,
    tags: [],
    storage_path: "u/x.md",
    frontmatter: {},
    ingested: false,
  });

  it("uses the plain slug when nothing owns it", async () => {
    fixtures.source = source("s1", "Async loops");
    fixtures.upsertWikiPage = { id: "p1" };
    await generateSourcePage("u1", "s1");
    const upsert = captured.find((c) => c.fn === "upsertWikiPage");
    expect((upsert?.args[0] as { slug: string }).slug).toBe("async-loops");
  });

  it("reuses the plain slug when the page is this source's own (idempotent re-run)", async () => {
    fixtures.source = source("s1", "Async loops");
    fixtures.slugOwner = { id: "p1", slug: "async-loops", kind: "source", source_id: "s1" };
    fixtures.upsertWikiPage = { id: "p1" };
    await generateSourcePage("u1", "s1");
    const upsert = captured.find((c) => c.fn === "upsertWikiPage");
    expect((upsert?.args[0] as { slug: string }).slug).toBe("async-loops");
  });

  it("disambiguates when an entity page already holds the slug", async () => {
    fixtures.source = source("s1abcdef-0000-0000-0000-000000000000", "Async loops");
    fixtures.slugOwner = { id: "pE", slug: "async-loops", kind: "entity", source_id: null };
    fixtures.upsertWikiPage = { id: "p2" };
    await generateSourcePage("u1", "s1abcdef-0000-0000-0000-000000000000");
    const upsert = captured.find((c) => c.fn === "upsertWikiPage");
    expect((upsert?.args[0] as { slug: string }).slug).toBe("async-loops-s1abcdef");
  });

  it("disambiguates when a DIFFERENT source already holds the slug", async () => {
    fixtures.source = source("bbbbbbbb-0000-0000-0000-000000000000", "Async loops");
    fixtures.slugOwner = { id: "pOther", slug: "async-loops", kind: "source", source_id: "aaaa" };
    fixtures.upsertWikiPage = { id: "p3" };
    await generateSourcePage("u1", "bbbbbbbb-0000-0000-0000-000000000000");
    const upsert = captured.find((c) => c.fn === "upsertWikiPage");
    expect((upsert?.args[0] as { slug: string }).slug).toBe("async-loops-bbbbbbbb");
  });
});
