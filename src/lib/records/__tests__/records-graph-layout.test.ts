import { buildRecordsGraph, type GraphRecord } from "../records-graph";
import { layoutRecordsGraph, DOMAIN_COLOR } from "../records-graph-layout";

function rec(id: string, domain: string, tags: string[] = []): GraphRecord {
  return { id, topic: `t-${id}`, tags: [`domain:${domain}`, ...tags] };
}

describe("layoutRecordsGraph", () => {
  const graph = buildRecordsGraph([
    rec("r1", "career", ["burnout"]),
    rec("r2", "health", ["burnout"]),
    rec("r3", "career"),
  ]);
  const pos = layoutRecordsGraph(graph);

  it("positions polaris at the center", () => {
    expect(pos.polaris).toEqual({ x: 0.5, y: 0.5 });
  });

  it("positions every node inside the 0..1 canvas", () => {
    for (const n of graph.nodes) {
      expect(pos[n.id]).toBeDefined();
      expect(pos[n.id].x).toBeGreaterThanOrEqual(0);
      expect(pos[n.id].x).toBeLessThanOrEqual(1);
      expect(pos[n.id].y).toBeGreaterThanOrEqual(0);
      expect(pos[n.id].y).toBeLessThanOrEqual(1);
    }
  });

  it("gives a domain a stable direction regardless of which others are present", () => {
    const a = layoutRecordsGraph(buildRecordsGraph([rec("x", "career")]));
    const b = layoutRecordsGraph(buildRecordsGraph([rec("x", "career"), rec("y", "health")]));
    expect(a["domain:career"]).toEqual(b["domain:career"]);
  });

  it("places records near their own domain star", () => {
    const star = pos["domain:career"];
    const r = pos.r1;
    const dist = Math.hypot(star.x - r.x, star.y - r.y);
    expect(dist).toBeLessThan(0.2); // within the record cluster radius (+clamp)
  });

  it("has a color for every DomainId", () => {
    for (const id of ["career", "finance", "growth", "relation", "health", "recreation", "collect"] as const) {
      expect(DOMAIN_COLOR[id]).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});
