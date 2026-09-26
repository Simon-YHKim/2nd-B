import { buildRecordsGraph, buildRoleRecordsGraph, type GraphRecord } from "../records-graph";
import {
  layoutRecordsGraph,
  recordsGraphViewport,
  panRecordsGraphCamera,
  pinchRecordsGraphCamera,
  zoomRecordsGraphCamera,
  DOMAIN_COLOR,
} from "../records-graph-layout";

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

  it("places approved role cards around Polaris and their evidence nearby", () => {
    const graph = buildRoleRecordsGraph(
      [{ id: "record-1", topic: "기록" }],
      [{ id: "builder", label: "만드는 사람", summary: "요약", status: "ratified", evidenceRefs: ["record:record-1"] }],
    );
    const positions = layoutRecordsGraph(graph);
    expect(positions["persona:builder"]).toBeDefined();
    expect(positions["record-1"]).toBeDefined();
    expect(Math.hypot(
      positions["persona:builder"].x - positions["record-1"].x,
      positions["persona:builder"].y - positions["record-1"].y,
    )).toBeLessThan(0.25);
  });

  it("bends a phone graph into radial spokes while preserving node tap spacing", () => {
    const domains = ["career", "finance", "growth", "relation", "health", "recreation", "collect"];
    const dense = buildRecordsGraph(domains.flatMap((domain) =>
      Array.from({ length: 3 }, (_, index) => rec(`${domain}:${index}`, domain)),
    ));
    const viewport = recordsGraphViewport(425, 747);
    const positions = layoutRecordsGraph(dense);
    const points = dense.nodes.map((node) => viewport.project(positions[node.id]));
    const toScreen = (point: { x: number; y: number }) => ({
      x: (point.x / viewport.width) * 425,
      y: (point.y / viewport.height) * 747,
    });
    const screen = points.map(toScreen);
    const outer = dense.nodes.filter((node) => node.kind === "record").map((node) => toScreen(viewport.project(positions[node.id])));
    // The old projection put all outer records on x=34/391 or y=126/694.
    expect(new Set(outer.map((point) => Math.round(point.x))).size).toBeGreaterThan(12);
    expect(new Set(outer.map((point) => Math.round(point.y))).size).toBeGreaterThanOrEqual(12);
    for (let a = 0; a < screen.length; a += 1) {
      for (let b = a + 1; b < screen.length; b += 1) {
        const gap = Math.max(Math.abs(screen[a].x - screen[b].x), Math.abs(screen[a].y - screen[b].y));
        if (gap < 44) throw new Error(`${dense.nodes[a].id} / ${dense.nodes[b].id}: ${gap}`);
      }
    }
  });

  it("pans the whole canvas at 1x and keeps zoom anchored under the pointer", () => {
    const viewport = { width: 1000, height: 1758 };
    const canvas = { width: 425, height: 747 };
    const start = { zoom: 1, x: 0, y: 0 };
    const dragged = panRecordsGraphCamera(start, 30, -20, canvas, viewport);
    expect(dragged.x).toBeLessThan(0);
    expect(dragged.y).toBeGreaterThan(0);
    const fx = 0.4;
    const fy = 0.55;
    const zoomed = zoomRecordsGraphCamera(start, 1.6, fx, fy, viewport);
    expect(zoomed.x + (fx * viewport.width) / zoomed.zoom).toBeCloseTo(fx * viewport.width);
    expect(zoomed.y + (fy * viewport.height) / zoomed.zoom).toBeCloseTo(fy * viewport.height);
  });

  it("lets the telescope travel past every edge of the drawn constellation", () => {
    const viewport = { width: 1000, height: 1758 };
    const canvas = { width: 425, height: 747 };
    const start = { zoom: 1, x: 0, y: 0 };
    const far = panRecordsGraphCamera(start, -1700, 1800, canvas, viewport);
    expect(far.x).toBeGreaterThan(viewport.width);
    expect(far.y).toBeLessThan(-viewport.height);
    const zoomed = zoomRecordsGraphCamera(far, 2, 0.5, 0.5, viewport);
    expect(zoomed.x).toBeGreaterThan(viewport.width);
    expect(zoomed.y).toBeLessThan(-viewport.height);
  });

  it("keeps the same star under a moving two-finger focal point", () => {
    const viewport = { width: 1000, height: 1758 };
    const start = { zoom: 1.4, x: -280, y: 120 };
    const startFocal = { x: 0.4, y: 0.55 };
    const currentFocal = { x: 0.65, y: 0.3 };
    const next = pinchRecordsGraphCamera(start, 2, startFocal, currentFocal, viewport);
    expect(next.x + currentFocal.x * viewport.width / next.zoom)
      .toBeCloseTo(start.x + startFocal.x * viewport.width / start.zoom);
    expect(next.y + currentFocal.y * viewport.height / next.zoom)
      .toBeCloseTo(start.y + startFocal.y * viewport.height / start.zoom);
  });
});
