// Unit tests for the STEP 3 lightweight clustering engine (clusters.ts).

import { clusterGraph, type ClusterEdge } from "../clusters";
import type { WikiPageRow } from "../types";

function page(id: string, tags: string[] = [], title = ""): WikiPageRow {
  return {
    id,
    user_id: "u1",
    slug: id,
    kind: "concept",
    title,
    body_md: "",
    frontmatter: {},
    tags,
    source_id: null,
    created_at: "2026-06-19T00:00:00Z",
    updated_at: "2026-06-19T00:00:00Z",
  };
}

describe("clusterGraph — connected components", () => {
  test("groups connected pages into one island, counts singletons", () => {
    const pages = [
      page("a", ["design"]),
      page("b", ["design"]),
      page("c", ["design"]),
      page("lonely", ["misc"]),
    ];
    const edges: ClusterEdge[] = [
      { from_page: "a", to_page: "b" },
      { from_page: "b", to_page: "c" },
    ];
    const r = clusterGraph(pages, edges);
    expect(r.clusters).toHaveLength(1);
    expect(r.clusters[0].size).toBe(3);
    expect(new Set(r.clusters[0].members)).toEqual(new Set(["a", "b", "c"]));
    expect(r.clusters[0].label).toBe("design");
    expect(r.singletonCount).toBe(1); // "lonely"
  });

  test("two disjoint islands, sorted largest first", () => {
    const pages = [
      page("a", ["x"]),
      page("b", ["x"]),
      page("c", ["x"]),
      page("d", ["y"]),
      page("e", ["y"]),
    ];
    const edges: ClusterEdge[] = [
      { from_page: "a", to_page: "b" },
      { from_page: "b", to_page: "c" },
      { from_page: "d", to_page: "e" },
    ];
    const r = clusterGraph(pages, edges);
    expect(r.clusters.map((c) => c.size)).toEqual([3, 2]);
    expect(r.clusters[0].label).toBe("x");
    expect(r.clusters[1].label).toBe("y");
    expect(r.clusters[0].id).toBe(0);
    expect(r.clusters[1].id).toBe(1);
  });

  test("empty graph → no clusters, no surprise", () => {
    const r = clusterGraph([], []);
    expect(r.clusters).toEqual([]);
    expect(r.singletonCount).toBe(0);
    expect(r.surprise).toBeNull();
  });
});

describe("clusterGraph — surprise (cross-topic bridge)", () => {
  test("finds an edge between pages that share no tags", () => {
    const pages = [
      page("art", ["창작"], "글쓰기"),
      page("mood", ["감정"], "기분 기록"),
    ];
    const edges: ClusterEdge[] = [{ from_page: "art", to_page: "mood" }];
    const r = clusterGraph(pages, edges);
    expect(r.surprise).not.toBeNull();
    expect(r.surprise?.fromTitle).toBe("글쓰기");
    expect(r.surprise?.toTitle).toBe("기분 기록");
  });

  test("no surprise when the bridged pages share a tag", () => {
    const pages = [page("a", ["창작", "감정"]), page("b", ["감정"])];
    const edges: ClusterEdge[] = [{ from_page: "a", to_page: "b" }];
    expect(clusterGraph(pages, edges).surprise).toBeNull();
  });

  test("no surprise when either side is untagged", () => {
    const pages = [page("a", ["창작"]), page("b", [])];
    const edges: ClusterEdge[] = [{ from_page: "a", to_page: "b" }];
    expect(clusterGraph(pages, edges).surprise).toBeNull();
  });

  test("prefers the highest combined-degree bridge", () => {
    const pages = [
      page("hub", ["창작"], "허브"),
      page("x", ["감정"], "감정노트"),
      page("y", ["관계"], "관계노트"),
      page("z", ["관계"], "관계노트2"),
    ];
    // hub<->x is a cross-topic bridge; hub also connects to y and z, raising
    // hub's degree, so the hub<->x bridge outscores a lone y<->z (same tag, not
    // a bridge anyway).
    const edges: ClusterEdge[] = [
      { from_page: "hub", to_page: "x" },
      { from_page: "hub", to_page: "y" },
      { from_page: "hub", to_page: "z" },
    ];
    const r = clusterGraph(pages, edges);
    expect(r.surprise?.fromTitle).toBe("허브");
    expect(r.surprise?.toTitle).toBe("감정노트");
  });
});
