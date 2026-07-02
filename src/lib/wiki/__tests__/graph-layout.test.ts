import { layoutWikiGraph } from "../graph-layout";

const ids = ["a", "b", "c", "d", "e", "f"];
const edges = [
  { from_page: "a", to_page: "b" },
  { from_page: "b", to_page: "c" },
  { from_page: "a", to_page: "c" },
  { from_page: "d", to_page: "e" },
];

describe("wiki graph layout (P4b)", () => {
  test("deterministic: same input yields the same picture", () => {
    const one = layoutWikiGraph(ids, edges);
    const two = layoutWikiGraph(ids, edges);
    expect(two).toEqual(one);
  });

  test("all nodes land inside the unit square", () => {
    for (const node of layoutWikiGraph(ids, edges)) {
      expect(node.x).toBeGreaterThanOrEqual(0);
      expect(node.x).toBeLessThanOrEqual(1);
      expect(node.y).toBeGreaterThanOrEqual(0);
      expect(node.y).toBeLessThanOrEqual(1);
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
    }
  });

  test("degree counts undirected unique edges, ignoring self/unknown", () => {
    const nodes = layoutWikiGraph(ids, [
      ...edges,
      { from_page: "a", to_page: "a" },
      { from_page: "b", to_page: "a" }, // duplicate of a-b
      { from_page: "a", to_page: "ghost" },
    ]);
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n.degree]));
    expect(byId.a).toBe(2);
    expect(byId.b).toBe(2);
    expect(byId.c).toBe(2);
    expect(byId.d).toBe(1);
    expect(byId.f).toBe(0);
  });

  test("linked nodes sit closer than the isolated node on average", () => {
    const nodes = layoutWikiGraph(ids, edges);
    const p = Object.fromEntries(nodes.map((n) => [n.id, n]));
    const dist = (u: string, v: string) => Math.hypot(p[u].x - p[v].x, p[u].y - p[v].y);
    const linked = (dist("a", "b") + dist("b", "c") + dist("a", "c")) / 3;
    const isolatedToTriangle = (dist("f", "a") + dist("f", "b") + dist("f", "c")) / 3;
    expect(linked).toBeLessThan(isolatedToTriangle);
  });

  test("empty and single-node graphs are safe", () => {
    expect(layoutWikiGraph([], [])).toEqual([]);
    expect(layoutWikiGraph(["only"], [])).toEqual([{ id: "only", x: 0.5, y: 0.5, degree: 0 }]);
  });
});
