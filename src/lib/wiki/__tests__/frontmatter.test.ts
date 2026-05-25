import { extractCommonFields, joinFrontmatter, splitFrontmatter } from "../frontmatter";

describe("splitFrontmatter", () => {
  test("clipper-style block + body", () => {
    const md = `---
title: "Big Five Personality"
url: "https://example.com/article"
tags:
  - psychology
  - personality
status: inbox
ingested: false
simon-relevance: 4
---

# Big Five Personality

The article text.`;
    const r = splitFrontmatter(md);
    expect(r.hadFrontmatter).toBe(true);
    expect(r.frontmatter.title).toBe("Big Five Personality");
    expect(r.frontmatter.url).toBe("https://example.com/article");
    expect(r.frontmatter.tags).toEqual(["psychology", "personality"]);
    expect(r.frontmatter.status).toBe("inbox");
    expect(r.frontmatter.ingested).toBe(false);
    expect(r.frontmatter["simon-relevance"]).toBe(4);
    expect(r.body.startsWith("# Big Five Personality")).toBe(true);
  });

  test("no frontmatter → empty object + original body", () => {
    const md = "# Just a heading\n\nBody.";
    const r = splitFrontmatter(md);
    expect(r.hadFrontmatter).toBe(false);
    expect(r.frontmatter).toEqual({});
    expect(r.body).toBe(md);
  });

  test("CRLF line endings", () => {
    const md = "---\r\ntitle: Hello\r\n---\r\n\r\nBody.";
    const r = splitFrontmatter(md);
    expect(r.hadFrontmatter).toBe(true);
    expect(r.frontmatter.title).toBe("Hello");
    expect(r.body).toBe("Body.");
  });

  test("empty frontmatter block", () => {
    const md = "---\n---\n\nBody.";
    const r = splitFrontmatter(md);
    expect(r.hadFrontmatter).toBe(true);
    expect(r.frontmatter).toEqual({});
    expect(r.body).toBe("Body.");
  });

  test("malformed YAML inside frontmatter degrades gracefully", () => {
    const md = "---\nkey: : : broken\n  -wrong\n---\n\nBody.";
    const r = splitFrontmatter(md);
    expect(r.hadFrontmatter).toBe(true);
    expect(r.frontmatter).toEqual({});
    expect(r.body).toBe("Body.");
  });

  test("scalar-only frontmatter is rejected (not a useful object)", () => {
    const md = '---\n"just a string"\n---\n\nBody.';
    const r = splitFrontmatter(md);
    expect(r.hadFrontmatter).toBe(true);
    expect(r.frontmatter).toEqual({});
  });

  test("--- in body is NOT treated as frontmatter when not at start", () => {
    const md = "intro\n---\nkey: value\n---\n\nbody.";
    const r = splitFrontmatter(md);
    expect(r.hadFrontmatter).toBe(false);
    expect(r.body).toBe(md);
  });

  test("YouTube clipper fixture", () => {
    const md = `---
title: "Some Talk Title"
channel: "Some Channel"
video-id: "abcdef12345"
duration: "PT45M30S"
url: "https://www.youtube.com/watch?v=abcdef12345"
tags:
  - psychology
  - lecture
status: inbox
ingested: false
simon-relevance: 5
target-category: videos
---

# Transcript

Speaker: ...`;
    const r = splitFrontmatter(md);
    expect(r.hadFrontmatter).toBe(true);
    expect(r.frontmatter["video-id"]).toBe("abcdef12345");
    expect(r.frontmatter.channel).toBe("Some Channel");
    expect(r.frontmatter["target-category"]).toBe("videos");
  });

  test("Academic paper fixture with authors list", () => {
    const md = `---
title: "Attachment styles in adulthood"
authors:
  - "Hazan, C."
  - "Shaver, P."
doi: "10.1037/0022-3514.52.3.511"
venue: "Journal of Personality and Social Psychology"
year: 1987
tags:
  - attachment
  - relationships
ingested: false
simon-relevance: 5
---

Abstract: ...`;
    const r = splitFrontmatter(md);
    expect(r.frontmatter.authors).toEqual(["Hazan, C.", "Shaver, P."]);
    expect(r.frontmatter.doi).toBe("10.1037/0022-3514.52.3.511");
    expect(r.frontmatter.year).toBe(1987);
  });
});

describe("joinFrontmatter", () => {
  test("emits canonical block + body", () => {
    const out = joinFrontmatter({ title: "Hi", tags: ["a", "b"] }, "Body text.");
    expect(out.startsWith("---\n")).toBe(true);
    expect(out).toContain("title: Hi");
    expect(out).toContain("tags:");
    expect(out.endsWith("Body text.")).toBe(true);
  });

  test("empty frontmatter → just body, no block", () => {
    expect(joinFrontmatter({}, "Body.")).toBe("Body.");
  });

  test("round-trips parse → join → parse", () => {
    const original = { title: "Round Trip", tags: ["x", "y"], simon_relevance: 3, ingested: false };
    const md = joinFrontmatter(original, "Body.");
    const back = splitFrontmatter(md);
    expect(back.frontmatter).toEqual(original);
    expect(back.body).toBe("Body.");
  });
});

describe("extractCommonFields", () => {
  test("happy path with hyphenated keys (clipper default)", () => {
    const fm = {
      title: "T",
      url: "https://example.com",
      tags: ["a", "b"],
      status: "inbox",
      ingested: false,
      "simon-relevance": 4,
      "target-category": "articles",
      "wiki-target": "Some Wiki Page",
    };
    expect(extractCommonFields(fm)).toEqual({
      title: "T",
      url: "https://example.com",
      tags: ["a", "b"],
      status: "inbox",
      ingested: false,
      simon_relevance: 4,
      target_category: "articles",
      wiki_target: "Some Wiki Page",
    });
  });

  test("also accepts underscore variants", () => {
    const fm = {
      title: "T",
      tags: [],
      simon_relevance: 5,
      target_category: "videos",
      wiki_target: "WP",
    };
    const r = extractCommonFields(fm);
    expect(r.simon_relevance).toBe(5);
    expect(r.target_category).toBe("videos");
    expect(r.wiki_target).toBe("WP");
  });

  test("falls back to `source` when `url` is missing", () => {
    expect(extractCommonFields({ source: "https://example.com" }).url).toBe("https://example.com");
  });

  test("missing fields → null / empty array", () => {
    expect(extractCommonFields({})).toEqual({
      title: null,
      url: null,
      tags: [],
      status: null,
      ingested: null,
      simon_relevance: null,
      target_category: null,
      wiki_target: null,
    });
  });

  test("wrong-shape tags drop to empty array", () => {
    expect(extractCommonFields({ tags: "not-an-array" }).tags).toEqual([]);
    expect(extractCommonFields({ tags: [1, 2, 3] }).tags).toEqual([]);
    expect(extractCommonFields({ tags: ["a", "", "b"] }).tags).toEqual(["a", "b"]);
  });

  test("ingested accepts string 'true'/'false'", () => {
    expect(extractCommonFields({ ingested: "true" }).ingested).toBe(true);
    expect(extractCommonFields({ ingested: "false" }).ingested).toBe(false);
    expect(extractCommonFields({ ingested: 1 }).ingested).toBe(null);
  });

  test("simon-relevance accepts string number from YAML", () => {
    expect(extractCommonFields({ "simon-relevance": "3" }).simon_relevance).toBe(3);
    expect(extractCommonFields({ "simon-relevance": "high" }).simon_relevance).toBe(null);
  });
});
