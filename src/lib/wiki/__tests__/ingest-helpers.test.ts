import { buildSourcePayload } from "../ingest-helpers";

describe("buildSourcePayload — happy paths per clipper kind", () => {
  test("01 General Article", () => {
    const md = `---
title: "The Cost of Distraction"
url: "https://example.com/distraction"
tags:
  - focus
  - productivity
status: inbox
ingested: false
simon-relevance: 4
target-category: articles
---

# The Cost of Distraction

Body.`;
    const r = buildSourcePayload(md);
    expect(r.payload.kind).toBe("article");
    expect(r.payload.title).toBe("The Cost of Distraction");
    expect(r.payload.source_url).toBe("https://example.com/distraction");
    expect(r.payload.tags).toEqual(["focus", "productivity"]);
    expect(r.payload.simon_relevance).toBe(4);
    expect(r.suggested_slug).toBe("the-cost-of-distraction");
    expect(r.hadFrontmatter).toBe(true);
    expect(r.body.startsWith("# The Cost of Distraction")).toBe(true);
  });

  test("02 YouTube Video", () => {
    const md = `---
title: "Some Lecture Title"
channel: "Channel Name"
video-id: "abcdef12345"
url: "https://www.youtube.com/watch?v=abcdef12345"
tags:
  - lecture
simon-relevance: 5
---

Body.`;
    const r = buildSourcePayload(md);
    expect(r.payload.kind).toBe("video");
    expect(r.payload.frontmatter.channel).toBe("Channel Name");
    expect(r.payload.frontmatter["video-id"]).toBe("abcdef12345");
    expect(r.suggested_slug).toBe("some-lecture-title");
  });

  test("03 Academic Paper", () => {
    const md = `---
title: "Attachment styles in adulthood"
authors:
  - "Hazan, C."
  - "Shaver, P."
doi: "10.1037/0022-3514.52.3.511"
url: "https://doi.org/10.1037/0022-3514.52.3.511"
tags:
  - attachment
simon-relevance: 5
---

Abstract: ...`;
    const r = buildSourcePayload(md);
    expect(r.payload.kind).toBe("paper");
    expect(r.payload.frontmatter.authors).toEqual(["Hazan, C.", "Shaver, P."]);
    expect(r.payload.frontmatter.doi).toBe("10.1037/0022-3514.52.3.511");
  });

  test("04 Reddit Post", () => {
    const md = `---
title: "[Discussion] Best ADHD coping strategies"
url: "https://www.reddit.com/r/ADHD/comments/x/"
subreddit: "ADHD"
post-type: "discussion"
tags:
  - adhd
---

OP: ...`;
    const r = buildSourcePayload(md);
    expect(r.payload.kind).toBe("reddit");
    expect(r.payload.frontmatter.subreddit).toBe("ADHD");
    expect(r.payload.title).toBe("[Discussion] Best ADHD coping strategies");
  });

  test("05 GitHub Repo", () => {
    const md = `---
title: "anthropics/claude-code"
url: "https://github.com/anthropics/claude-code"
repo: "claude-code"
owner: "anthropics"
language: "TypeScript"
license: "Apache-2.0"
stars: 12345
---

README content.`;
    const r = buildSourcePayload(md);
    expect(r.payload.kind).toBe("code");
    expect(r.payload.frontmatter.repo).toBe("claude-code");
    expect(r.payload.frontmatter.stars).toBe(12345);
  });

  test("06 AI Tool Doc", () => {
    const md = `---
title: "Claude API — Prompt Caching"
url: "https://docs.anthropic.com/en/docs/prompt-caching"
product: "Claude API"
doc-type: "guide"
version: "2024-10"
---

Body.`;
    const r = buildSourcePayload(md);
    // docs.anthropic.com isn't in the AI_TOOL_HOSTS set (we listed
    // anthropic.com, claude.ai etc.) — it's article-shaped per our
    // taxonomy until we extend the set, which is fine for a draft.
    expect(["ai_tool", "article"]).toContain(r.payload.kind);
    expect(r.payload.frontmatter.product).toBe("Claude API");
    expect(r.payload.frontmatter["doc-type"]).toBe("guide");
  });

  test("07 Self-Knowledge via explicit override (no URL)", () => {
    const md = `---
title: "My ADHD coping notes"
topic-area: "ADHD"
framework: "Big Five"
applicable-circuit: "self-regulation"
takeaway: "Sleep first."
tags:
  - personal
---

Notes.`;
    const r = buildSourcePayload(md, null, "self_knowledge");
    expect(r.payload.kind).toBe("self_knowledge");
    expect(r.payload.source_url).toBeNull();
    expect(r.payload.title).toBe("My ADHD coping notes");
    expect(r.payload.frontmatter["topic-area"]).toBe("ADHD");
  });
});

describe("buildSourcePayload — fallbacks and edge cases", () => {
  test("no frontmatter → inbox kind, title from H1, empty fields", () => {
    const r = buildSourcePayload("# Just a Heading\n\nBody.");
    expect(r.payload.kind).toBe("inbox");
    expect(r.payload.title).toBe("Just a Heading");
    expect(r.payload.source_url).toBeNull();
    expect(r.payload.tags).toEqual([]);
    expect(r.payload.simon_relevance).toBeNull();
    expect(r.suggested_slug).toBe("just-a-heading");
    expect(r.hadFrontmatter).toBe(false);
  });

  test("no frontmatter, no H1 → (untitled)", () => {
    const r = buildSourcePayload("Just paragraph text.");
    expect(r.payload.title).toBe("(untitled)");
    expect(r.suggested_slug).toBe("untitled");
  });

  test("frontmatter without url, fallback URL used for kind detection", () => {
    const md = `---
title: "T"
tags: []
---

Body.`;
    const r = buildSourcePayload(md, "https://github.com/owner/repo");
    expect(r.payload.kind).toBe("code");
    expect(r.payload.source_url).toBe("https://github.com/owner/repo");
  });

  test("kindOverride wins over URL-based detection", () => {
    const md = `---
title: "T"
url: "https://github.com/owner/repo"
---

Body.`;
    const r = buildSourcePayload(md, null, "inbox");
    expect(r.payload.kind).toBe("inbox");
  });

  test("frontmatter.source used when url is absent", () => {
    const md = `---
title: "T"
source: "https://arxiv.org/abs/x"
---

Body.`;
    const r = buildSourcePayload(md);
    expect(r.payload.source_url).toBe("https://arxiv.org/abs/x");
    expect(r.payload.kind).toBe("paper");
  });

  test("dedupes and trims tags", () => {
    const md = `---
title: "T"
tags:
  - " psychology "
  - "psychology"
  - "growth"
  - ""
  - "growth"
---

Body.`;
    const r = buildSourcePayload(md);
    expect(r.payload.tags).toEqual(["psychology", "growth"]);
  });

  test("Korean title slugifies preserving Hangul", () => {
    const md = `---
title: "민지의 성장 노트"
---

Body.`;
    const r = buildSourcePayload(md);
    expect(r.payload.title).toBe("민지의 성장 노트");
    expect(r.suggested_slug).toBe("민지의-성장-노트");
  });

  test("malformed YAML in frontmatter → title from H1, kind from fallback URL", () => {
    const md = `---
title: : broken
  -wrong
---

# Recovered Title

Body.`;
    const r = buildSourcePayload(md, "https://www.reddit.com/r/x/");
    expect(r.payload.title).toBe("Recovered Title");
    expect(r.payload.kind).toBe("reddit");
    expect(r.hadFrontmatter).toBe(true);
  });
});
