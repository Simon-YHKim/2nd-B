// Deterministic force layout for the wiki node graph (rev2 P4b) — the
// force-directed SVG view that graph-stats.ts deferred until react-native-svg
// shipped. Pure and seed-free: nodes start on a golden-angle spiral (by index)
// and run a fixed number of ticks, so the same input always yields the same
// picture (testable; no Math.random / Date).
//
// Scale: the deep-space wiki loads <= 200 pages; O(n^2) repulsion x 90 ticks
// stays a one-shot few-ms cost, memoized by the caller.

export interface GraphEdge {
  from_page: string;
  to_page: string;
}

export interface LayoutNode {
  id: string;
  /** Position in the unit square [0,1]^2. */
  x: number;
  y: number;
  /** Undirected degree (in + out, self-loops ignored). */
  degree: number;
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export function layoutWikiGraph(
  nodeIds: readonly string[],
  edges: readonly GraphEdge[],
  ticks: number = 90,
): LayoutNode[] {
  const n = nodeIds.length;
  if (n === 0) return [];
  const index = new Map<string, number>();
  nodeIds.forEach((id, i) => index.set(id, i));

  // Undirected unique edge list between known nodes.
  const pairs: [number, number][] = [];
  const seen = new Set<string>();
  const degree = new Array<number>(n).fill(0);
  for (const e of edges) {
    const a = index.get(e.from_page);
    const b = index.get(e.to_page);
    if (a === undefined || b === undefined || a === b) continue;
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push([a, b]);
    degree[a] += 1;
    degree[b] += 1;
  }

  // Golden-angle spiral start: deterministic, well spread.
  const xs = new Array<number>(n);
  const ys = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const r = 0.42 * Math.sqrt((i + 0.5) / n);
    const a = i * GOLDEN_ANGLE;
    xs[i] = 0.5 + r * Math.cos(a);
    ys[i] = 0.5 + r * Math.sin(a);
  }
  if (n === 1) return [{ id: nodeIds[0], x: 0.5, y: 0.5, degree: 0 }];

  const k = 0.9 / Math.sqrt(n); // ideal spacing
  const rest = Math.min(0.28, k * 2.2); // spring rest length
  for (let t = 0; t < ticks; t++) {
    const cool = 1 - t / ticks; // linear cooling
    const step = 0.045 * cool + 0.005;
    const fx = new Array<number>(n).fill(0);
    const fy = new Array<number>(n).fill(0);
    // Pairwise repulsion.
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = xs[i] - xs[j];
        let dy = ys[i] - ys[j];
        let d2 = dx * dx + dy * dy;
        if (d2 < 1e-6) {
          // Deterministic tie-break for coincident points.
          dx = 1e-3 * ((i - j) % 3);
          dy = 1e-3;
          d2 = dx * dx + dy * dy;
        }
        const rep = (k * k) / d2;
        const d = Math.sqrt(d2);
        const ux = (dx / d) * Math.min(rep, 2);
        const uy = (dy / d) * Math.min(rep, 2);
        fx[i] += ux;
        fy[i] += uy;
        fx[j] -= ux;
        fy[j] -= uy;
      }
    }
    // Springs along edges.
    for (const [a, b] of pairs) {
      const dx = xs[b] - xs[a];
      const dy = ys[b] - ys[a];
      const d = Math.max(1e-3, Math.hypot(dx, dy));
      const pull = (d - rest) * 1.6;
      const ux = (dx / d) * pull;
      const uy = (dy / d) * pull;
      fx[a] += ux;
      fy[a] += uy;
      fx[b] -= ux;
      fy[b] -= uy;
    }
    // Gentle gravity to the center keeps disconnected islands on canvas.
    for (let i = 0; i < n; i++) {
      fx[i] += (0.5 - xs[i]) * 0.06;
      fy[i] += (0.5 - ys[i]) * 0.06;
      const mag = Math.hypot(fx[i], fy[i]);
      const lim = Math.min(mag, 0.12) * step * 10;
      if (mag > 1e-9) {
        xs[i] += (fx[i] / mag) * lim;
        ys[i] += (fy[i] / mag) * lim;
      }
    }
  }

  // Normalize into the unit square with a small margin.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    if (xs[i] < minX) minX = xs[i];
    if (xs[i] > maxX) maxX = xs[i];
    if (ys[i] < minY) minY = ys[i];
    if (ys[i] > maxY) maxY = ys[i];
  }
  const spanX = Math.max(1e-6, maxX - minX);
  const spanY = Math.max(1e-6, maxY - minY);
  const M = 0.06;
  return nodeIds.map((id, i) => ({
    id,
    x: M + ((xs[i] - minX) / spanX) * (1 - 2 * M),
    y: M + ((ys[i] - minY) / spanY) * (1 - 2 * M),
    degree: degree[i],
  }));
}
