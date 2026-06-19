// Unit tests for the deep-space /wiki + /research view-model builders.
// Pure functions — no rendering, no DB.

import {
  buildDeepResearchView,
  buildDeepWikiView,
  connectionCounts,
  displayName,
  snippetOf,
  type WikiEdge,
} from "../wiki-graph-view";
import type { WikiPageRow } from "@/lib/wiki/types";

function page(p: Partial<WikiPageRow> & { id: string }): WikiPageRow {
  return {
    user_id: "u1",
    slug: p.id,
    kind: "source",
    title: "",
    body_md: "",
    frontmatter: {},
    tags: [],
    source_id: null,
    created_at: "2026-06-19T00:00:00Z",
    updated_at: "2026-06-19T00:00:00Z",
    ...p,
  };
}

describe("displayName", () => {
  test("prefers title, falls back to humanized slug", () => {
    expect(displayName({ title: "Carl Jung", slug: "carl-jung" })).toBe("Carl Jung");
    expect(displayName({ title: "  ", slug: "shadow-self" })).toBe("shadow self");
  });
});

describe("snippetOf", () => {
  test("collapses markdown + whitespace and caps length", () => {
    expect(snippetOf("# Title\n\nsome   body  text")).toBe("Title some body text");
    expect(snippetOf("")).toBe("");
    const long = "a".repeat(200);
    expect(snippetOf(long, 50).length).toBe(50);
  });
});

describe("connectionCounts", () => {
  test("counts in+out degree per node", () => {
    const edges: WikiEdge[] = [
      { from_page: "a", to_page: "b" },
      { from_page: "a", to_page: "c" },
      { from_page: "d", to_page: "b" },
    ];
    const m = connectionCounts(edges);
    expect(m.get("a")).toBe(2);
    expect(m.get("b")).toBe(2);
    expect(m.get("c")).toBe(1);
    expect(m.get("d")).toBe(1);
  });
});

describe("buildDeepWikiView", () => {
  const pages = [
    page({ id: "hub", title: "Hub", body_md: "## Hub\n\nbig idea", tags: ["ai", "design"] }),
    page({ id: "leaf", title: "Leaf", body_md: "small", tags: ["ai"] }),
    page({ id: "lonely", title: "Lonely", tags: ["misc"] }),
  ];
  const edges: WikiEdge[] = [
    { from_page: "leaf", to_page: "hub" },
    { from_page: "lonely", to_page: "hub" },
  ];

  test("returns counts, tag chips, and pages sorted by connections", () => {
    const v = buildDeepWikiView(pages, edges);
    expect(v.pageCount).toBe(3);
    expect(v.edgeCount).toBe(2);
    // hub has 2 connections (incoming), leaf + lonely have 1 each
    expect(v.pages[0].title).toBe("Hub");
    expect(v.pages[0].connections).toBe(2);
    expect(v.pages[0].snippet).toBe("Hub big idea");
    // tag chips surface the most frequent tag first
    expect(v.tagChips[0].tag).toBe("ai");
    expect(v.tagChips[0].count).toBe(2);
  });

  test("filters pages by active tag", () => {
    const v = buildDeepWikiView(pages, edges, { activeTag: "design" });
    expect(v.pages.map((p) => p.title)).toEqual(["Hub"]);
    // counts stay global (whole-graph headline), only the list is filtered
    expect(v.pageCount).toBe(3);
  });

  test("respects maxPages", () => {
    const v = buildDeepWikiView(pages, edges, { maxPages: 1 });
    expect(v.pages).toHaveLength(1);
  });
});

describe("buildDeepResearchView", () => {
  const pages = [
    page({ id: "hub", title: "Hub", tags: ["창작", "관계"] }),
    page({ id: "a", title: "A", tags: ["창작"] }),
    page({ id: "b", title: "B", tags: ["창작"] }),
    page({ id: "orphan", title: "Orphan", tags: [] }),
  ];
  const edges: WikiEdge[] = [
    { from_page: "a", to_page: "hub" },
    { from_page: "b", to_page: "hub" },
  ];

  test("surfaces hubs, tag clusters, orphan count, and a headline", () => {
    const v = buildDeepResearchView(pages, edges);
    expect(v.pageCount).toBe(4);
    expect(v.edgeCount).toBe(2);
    expect(v.orphanCount).toBe(1); // "orphan" has no edges
    expect(v.headline?.title).toBe("Hub");
    expect(v.headline?.inDegree).toBe(2);
    expect(v.clusters[0]).toEqual({ tag: "창작", count: 3 });
  });

  test("empty graph → null headline, no clusters", () => {
    const v = buildDeepResearchView([], []);
    expect(v.headline).toBeNull();
    expect(v.clusters).toEqual([]);
    expect(v.pageCount).toBe(0);
  });
});
