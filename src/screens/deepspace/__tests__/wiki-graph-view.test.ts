// Unit tests for the deep-space /wiki + /research view-model builders.
// Pure functions — no rendering, no DB.

import {
  buildDeepResearchView,
  buildDeepWikiView,
  buildDomainsView,
  connectionCounts,
  displayName,
  recencyLabel,
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

  test("includes connected-component island count and a cross-topic surprise", () => {
    // hub(창작,관계) bridges a(창작) and b(창작): a/b share 창작 with hub → not a
    // surprise. Add a cross-topic edge to force one.
    const p2 = [...pages, page({ id: "mood", title: "Mood", tags: ["감정"] })];
    const e2: WikiEdge[] = [...edges, { from_page: "mood", to_page: "hub" }];
    const v = buildDeepResearchView(p2, e2);
    // hub + a + b + mood are now one connected island.
    expect(v.islandCount).toBe(1);
    expect(v.surprise).not.toBeNull();
    // mood(감정) <-> hub(창작/관계) share no tag → the surprise bridge.
    const titles = [v.surprise?.fromTitle, v.surprise?.toTitle];
    expect(titles).toContain("Mood");
    expect(titles).toContain("Hub");
  });

  test("empty graph → null headline, no clusters", () => {
    const v = buildDeepResearchView([], []);
    expect(v.headline).toBeNull();
    expect(v.clusters).toEqual([]);
    expect(v.pageCount).toBe(0);
  });
});

describe("recencyLabel", () => {
  const now = new Date("2026-06-19T03:00:00Z"); // 12:00 KST
  test("오늘 / 어제 / N일 전 by KST day", () => {
    expect(recencyLabel("2026-06-19T01:00:00Z", now)).toBe("오늘");
    expect(recencyLabel("2026-06-18T05:00:00Z", now)).toBe("어제");
    expect(recencyLabel("2026-06-15T05:00:00Z", now)).toBe("4일 전");
    expect(recencyLabel("nope", now)).toBe("");
  });
});

describe("buildDomainsView", () => {
  const now = new Date("2026-06-19T03:00:00Z");
  const pages = [
    page({ id: "a", title: "A", tags: ["건강", "뇌"], updated_at: "2026-06-19T01:00:00Z" }),
    page({ id: "b", title: "B", tags: ["건강"], updated_at: "2026-06-10T01:00:00Z" }),
    page({ id: "c", title: "C", tags: ["건강"], updated_at: "2026-06-18T01:00:00Z" }),
    page({ id: "d", title: "D", tags: ["재정"], updated_at: "2026-06-01T01:00:00Z" }),
  ];
  const edges: WikiEdge[] = [
    { from_page: "b", to_page: "a" },
    { from_page: "c", to_page: "a" },
  ];

  test("ranks domains by count with recency + last activity", () => {
    const v = buildDomainsView(pages, edges, { now });
    expect(v.domains[0]).toMatchObject({ tag: "건강", count: 3, recent: true });
    // most recent 건강 page is "a" (06-19), so lastActivity reflects it
    expect(v.domains[0].lastActivity).toBe("2026-06-19T01:00:00.000Z");
    const fin = v.domains.find((d) => d.tag === "재정");
    expect(fin?.recent).toBe(false);
  });

  test("top domain topics are most-connected pages first", () => {
    const v = buildDomainsView(pages, edges, { now });
    expect(v.topTopics?.tag).toBe("건강");
    // "a" has 2 incoming connections → first
    expect(v.topTopics?.titles[0]).toBe("A");
  });

  test("empty pages → no domains, null topics", () => {
    const v = buildDomainsView([], []);
    expect(v.domains).toEqual([]);
    expect(v.topTopics).toBeNull();
  });
});
