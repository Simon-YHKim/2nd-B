import { computeGraphStats } from "../graph-stats";
import type { WikiPageRow } from "../types";

function page(over: Partial<WikiPageRow>): WikiPageRow {
  return {
    id: over.id ?? "p",
    user_id: "u1",
    slug: over.slug ?? "p",
    kind: over.kind ?? "concept",
    title: over.title ?? "P",
    body_md: "",
    frontmatter: {},
    tags: over.tags ?? [],
    source_id: over.source_id ?? null,
    created_at: "2026-05-25T00:00:00Z",
    updated_at: "2026-05-25T00:00:00Z",
  };
}

describe("computeGraphStats", () => {
  test("empty wiki: zero everywhere", () => {
    const s = computeGraphStats({ pages: [], edges: [] });
    expect(s.pageCount).toBe(0);
    expect(s.edgeCount).toBe(0);
    expect(s.countByKind).toEqual({ source: 0, entity: 0, concept: 0 });
    expect(s.topHubs).toEqual([]);
    expect(s.topTags).toEqual([]);
    expect(s.orphans).toEqual([]);
  });

  test("counts pages by kind", () => {
    const s = computeGraphStats({
      pages: [
        page({ id: "1", kind: "source", source_id: "s1" }),
        page({ id: "2", kind: "entity" }),
        page({ id: "3", kind: "entity" }),
        page({ id: "4", kind: "concept" }),
      ],
      edges: [],
    });
    expect(s.countByKind).toEqual({ source: 1, entity: 2, concept: 1 });
  });

  test("topHubs ordered by in-degree, capped to topHubLimit", () => {
    const s = computeGraphStats({
      pages: [
        page({ id: "1", slug: "a", title: "A" }),
        page({ id: "2", slug: "b", title: "B" }),
        page({ id: "3", slug: "c", title: "C" }),
      ],
      edges: [
        { from_page: "1", to_page: "2" },
        { from_page: "3", to_page: "2" },
        { from_page: "1", to_page: "3" },
      ],
      topHubLimit: 2,
    });
    expect(s.topHubs).toHaveLength(2);
    expect(s.topHubs[0]).toMatchObject({ slug: "b", inDegree: 2 });
    expect(s.topHubs[1]).toMatchObject({ slug: "c", inDegree: 1 });
  });

  test("topTags by frequency desc", () => {
    const s = computeGraphStats({
      pages: [
        page({ id: "1", tags: ["psychology", "growth"] }),
        page({ id: "2", tags: ["psychology"] }),
        page({ id: "3", tags: ["psychology", "growth", "career"] }),
      ],
      edges: [],
    });
    expect(s.topTags[0]).toEqual({ tag: "psychology", count: 3 });
    expect(s.topTags[1]).toEqual({ tag: "growth", count: 2 });
    expect(s.topTags[2]).toEqual({ tag: "career", count: 1 });
  });

  test("orphans = zero in-edges + zero out-edges", () => {
    const s = computeGraphStats({
      pages: [
        page({ id: "1", slug: "linked-from" }),
        page({ id: "2", slug: "links-out" }),
        page({ id: "3", slug: "alone" }), // orphan
      ],
      edges: [{ from_page: "2", to_page: "1" }],
    });
    expect(s.orphans.map((o) => o.slug)).toEqual(["alone"]);
  });

  test("orphans empty when every page has at least one edge", () => {
    const s = computeGraphStats({
      pages: [
        page({ id: "1" }),
        page({ id: "2" }),
      ],
      edges: [
        { from_page: "1", to_page: "2" },
        { from_page: "2", to_page: "1" },
      ],
    });
    expect(s.orphans).toEqual([]);
  });

  test("hub with edge to deleted page is silently filtered", () => {
    const s = computeGraphStats({
      pages: [page({ id: "1", slug: "a", title: "A" })],
      edges: [
        { from_page: "1", to_page: "GHOST" }, // GHOST not in pages
        { from_page: "GHOST", to_page: "1" },
      ],
    });
    // edgeCount still reflects raw edges
    expect(s.edgeCount).toBe(2);
    // topHubs only resolves to known pages — A has in-degree 1
    expect(s.topHubs).toEqual([{ id: "1", slug: "a", title: "A", inDegree: 1 }]);
  });
});
