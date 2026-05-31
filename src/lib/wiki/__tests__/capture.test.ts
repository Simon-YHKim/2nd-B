// Orchestration tests for captureFromMarkdown. Verifies the function calls
// buildSourcePayload → uploadRawClipping → createSource in the right order
// with the right arguments. The body-only markdown (frontmatter stripped)
// is what lands in Storage, not the raw input.

interface Captured {
  fn: string;
  args: unknown[];
}

const captured: Captured[] = [];
const fixtures: Record<string, unknown> = {};

jest.mock("../storage", () => ({
  uploadRawClipping: jest.fn((userId: string, slug: string, content: string) => {
    captured.push({ fn: "uploadRawClipping", args: [userId, slug, content] });
    return Promise.resolve({ path: `${userId}/${slug}.md` });
  }),
}));

jest.mock("../queries", () => ({
  createSource: jest.fn((input: unknown) => {
    captured.push({ fn: "createSource", args: [input] });
    return Promise.resolve(fixtures.sourceRow);
  }),
}));

import { captureFromMarkdown } from "../capture";

function reset() {
  captured.length = 0;
  for (const k of Object.keys(fixtures)) delete fixtures[k];
}

describe("captureFromMarkdown", () => {
  beforeEach(reset);

  test("happy path: clipper md → storage upload → source insert", async () => {
    fixtures.sourceRow = { id: "s1", user_id: "u1", kind: "article", title: "Foo" };
    const md = `---
title: "Foo"
url: "https://example.com/foo"
tags:
  - psychology
simon-relevance: 4
---

# Foo

Body content with [[some link]].`;

    const r = await captureFromMarkdown({ userId: "u1", rawMd: md });

    expect(captured.map((c) => c.fn)).toEqual(["uploadRawClipping", "createSource"]);

    const upload = captured[0];
    expect(upload.args[0]).toBe("u1");
    expect(upload.args[1]).toBe("foo"); // slug from title
    // The body uploaded to Storage has the frontmatter stripped.
    expect(upload.args[2]).not.toContain("---");
    expect(upload.args[2]).toContain("# Foo");
    expect(upload.args[2]).toContain("[[some link]]");

    const insert = captured[1];
    expect(insert.args[0]).toMatchObject({
      user_id: "u1",
      kind: "article",
      title: "Foo",
      source_url: "https://example.com/foo",
      storage_path: "u1/foo.md",
      tags: ["psychology"],
      simon_relevance: 4,
    });

    expect(r.hadFrontmatter).toBe(true);
    expect(r.suggested_slug).toBe("foo");
    expect(r.storage_path).toBe("u1/foo.md");
  });

  test("fallback URL drives kind detection when frontmatter has no url", async () => {
    fixtures.sourceRow = { id: "s1", user_id: "u1", kind: "code", title: "T" };
    const md = `---
title: "T"
---
Body.`;
    await captureFromMarkdown({
      userId: "u1",
      rawMd: md,
      fallbackUrl: "https://github.com/anthropics/claude-code",
    });
    const insert = captured.find((c) => c.fn === "createSource")!;
    expect((insert.args[0] as { kind: string; source_url: string }).kind).toBe("code");
    expect((insert.args[0] as { source_url: string }).source_url).toBe(
      "https://github.com/anthropics/claude-code",
    );
  });

  test("kindOverride wins over URL-based detection", async () => {
    fixtures.sourceRow = { id: "s1", user_id: "u1", kind: "self_knowledge", title: "T" };
    const md = `---
title: "T"
url: "https://github.com/x/y"
---
Body.`;
    await captureFromMarkdown({
      userId: "u1",
      rawMd: md,
      kindOverride: "self_knowledge",
    });
    const insert = captured.find((c) => c.fn === "createSource")!;
    expect((insert.args[0] as { kind: string }).kind).toBe("self_knowledge");
  });

  test("no-frontmatter input: title from H1, kind = inbox, tags empty", async () => {
    fixtures.sourceRow = { id: "s1", user_id: "u1", kind: "inbox", title: "Heading" };
    const r = await captureFromMarkdown({
      userId: "u1",
      rawMd: "# Heading\n\nFree-form note.",
    });
    expect(r.hadFrontmatter).toBe(false);
    expect(r.suggested_slug).toBe("heading");

    const insert = captured.find((c) => c.fn === "createSource")!;
    expect((insert.args[0] as { kind: string; tags: string[] }).kind).toBe("inbox");
    expect((insert.args[0] as { tags: string[] }).tags).toEqual([]);
  });

  test("storage_path uses suggested_slug (Hangul-safe)", async () => {
    fixtures.sourceRow = { id: "s1", user_id: "u1", kind: "self_knowledge", title: "T" };
    const r = await captureFromMarkdown({
      userId: "u1",
      rawMd: "# 민지의 성장 노트\n\n자기 노트.",
    });
    expect(r.suggested_slug).toBe("민지의-성장-노트");
    expect(r.storage_path).toBe("u1/민지의-성장-노트.md");
    const upload = captured.find((c) => c.fn === "uploadRawClipping")!;
    expect(upload.args[1]).toBe("민지의-성장-노트");
  });

  test("userTags merged with frontmatter tags, deduped + lowercased", async () => {
    fixtures.sourceRow = { id: "s1", user_id: "u1", kind: "article", title: "Foo", tags: [] };
    const md = `---
title: "Foo"
tags:
  - psychology
  - habits
---
Body.`;
    await captureFromMarkdown({
      userId: "u1",
      rawMd: md,
      userTags: ["Productivity", "psychology", "  Reading  ", ""],
    });
    const insert = captured.find((c) => c.fn === "createSource")!;
    // Order: frontmatter first, then user tags (in order); psychology dedup'd; empty dropped.
    expect((insert.args[0] as { tags: string[] }).tags).toEqual([
      "psychology",
      "habits",
      "productivity",
      "reading",
    ]);
  });

  test("track is persisted to frontmatter.wiki_track when provided", async () => {
    fixtures.sourceRow = { id: "s1", user_id: "u1", kind: "self_knowledge", title: "T", tags: [] };
    await captureFromMarkdown({
      userId: "u1",
      rawMd: "# T\n\nBody.",
      track: "pro",
    });
    const insert = captured.find((c) => c.fn === "createSource")!;
    expect((insert.args[0] as { frontmatter: { wiki_track?: string } }).frontmatter.wiki_track).toBe("pro");
  });

  test("track omitted → frontmatter has no wiki_track key", async () => {
    fixtures.sourceRow = { id: "s1", user_id: "u1", kind: "self_knowledge", title: "T", tags: [] };
    await captureFromMarkdown({ userId: "u1", rawMd: "# T\n\nBody." });
    const insert = captured.find((c) => c.fn === "createSource")!;
    expect((insert.args[0] as { frontmatter: Record<string, unknown> }).frontmatter.wiki_track).toBeUndefined();
  });

  // The AI clipper classifier reports relevance on a 0..1 scale; the
  // sources.simon_relevance column is the clipper 1..5 integer with a CHECK.
  // captureFromMarkdown must rescale so a save never violates the CHECK.
  test("AI simon_relevance (0..1) is rescaled to the clipper 1..5 integer", async () => {
    fixtures.sourceRow = { id: "s1", user_id: "u1", kind: "article", title: "T", tags: [] };
    await captureFromMarkdown({ userId: "u1", rawMd: "# T\n\nBody.", simonRelevance: 0.8 });
    const insert = captured.find((c) => c.fn === "createSource")!;
    expect((insert.args[0] as { simon_relevance: number }).simon_relevance).toBe(4);
  });

  test("AI relevance of 0 floors to 1 (never violates the 1..5 CHECK)", async () => {
    fixtures.sourceRow = { id: "s1", user_id: "u1", kind: "inbox", title: "T", tags: [] };
    await captureFromMarkdown({ userId: "u1", rawMd: "# T\n\nBody.", simonRelevance: 0 });
    const insert = captured.find((c) => c.fn === "createSource")!;
    expect((insert.args[0] as { simon_relevance: number }).simon_relevance).toBe(1);
  });

  test("no AI relevance → falls back to the frontmatter simon-relevance", async () => {
    fixtures.sourceRow = { id: "s1", user_id: "u1", kind: "article", title: "Foo", tags: [] };
    const md = `---
title: "Foo"
simon-relevance: 3
---
Body.`;
    await captureFromMarkdown({ userId: "u1", rawMd: md });
    const insert = captured.find((c) => c.fn === "createSource")!;
    expect((insert.args[0] as { simon_relevance: number }).simon_relevance).toBe(3);
  });
});
