// Phase 1b (D-27): deterministic domain constellation layout + palette for the
// records tag-graph (buildRecordsGraph). Polaris stays at center and every
// domain/record occupies a stable integer-lattice slot. Positions are in 0..1
// canvas space (same convention as wiki graph-layout.ts). Pure + testable.

import { getDomainStar, type DomainId } from "../persona/domain-stars";
import { recordDomain, type GraphRecord, type RecordsGraph } from "./records-graph";

// Domain palette — app DomainId mapped to the proto wiki.json domain colors so
// the graph matches the reference (career blue, relation rose, growth violet...).
export const DOMAIN_COLOR: Record<DomainId, string> = {
  career: "#6FB1FF",
  finance: "#5BD6B0",
  growth: "#A78BFA",
  relation: "#FF9DB0",
  health: "#7BE0A3",
  recreation: "#FFCF6E",
  collect: "#9AA7C7",
};

export interface Pt {
  x: number;
  y: number;
}

const CENTER: Pt = { x: 0.5, y: 0.5 };
export const RECORDS_GRAPH_MIN_CANVAS_EXTENT = 320;
export const RECORDS_GRAPH_CANVAS = 1000;
export const RECORDS_GRAPH_GRID_STEP = 0.14;
export const MAX_RECORDS_PER_GRAPH_DOMAIN = 3;

// The graph reserves enough room for its bounded 29 nodes (polaris + seven
// domains + 21 records), their labels, hit targets, and PixelStarSvg internals.
// Edges receive the rest. The renderer flattens edge cells directly under Svg,
// so this is a real primitive ceiling rather than a per-edge suggestion.
export const RECORDS_GRAPH_SVG_PRIMITIVE_BUDGET = 1200;
export const RECORDS_GRAPH_NON_EDGE_PRIMITIVE_RESERVE = 176;
export const RECORDS_GRAPH_EDGE_PRIMITIVE_BUDGET =
  RECORDS_GRAPH_SVG_PRIMITIVE_BUDGET - RECORDS_GRAPH_NON_EDGE_PRIMITIVE_RESERVE;

/**
 * Match the SVG viewBox to the viewport. On a tall phone, bend the safe
 * lattice's square perimeter into an ellipse so records radiate from Polaris
 * instead of tracing a visible rectangular frame. Short/square canvases keep
 * the lattice, where its 44dp hit-target spacing is needed most.
 */
export function recordsGraphViewport(width: number, height: number) {
  const extent = Math.max(1, Math.min(width, height));
  const canvasWidth = (RECORDS_GRAPH_CANVAS * width) / extent;
  const canvasHeight = (RECORDS_GRAPH_CANVAS * height) / extent;
  // The view switch/count rail occupies the top 56dp. Preserve the 320dp
  // lattice floor so 44dp record targets remain separated on short screens.
  const topInset = (
    RECORDS_GRAPH_CANVAS * Math.min(72, Math.max(0, height - RECORDS_GRAPH_MIN_CANVAS_EXTENT))
  ) / extent;
  return {
    width: canvasWidth,
    height: canvasHeight,
    project: (point: Pt): Pt => {
      if (height / width < 1.35 || width < 360) {
        return {
          x: point.x * canvasWidth,
          y: topInset + point.y * (canvasHeight - topInset),
        };
      }
      const dx = (point.x - 0.5) / 0.42;
      const dy = (point.y - 0.5) / 0.42;
      // Concentric square-to-disc mapping: equal steps along the original
      // perimeter become equal angular steps, preventing corner clustering.
      const alongX = Math.abs(dx) > Math.abs(dy);
      const radius = alongX ? dx : dy;
      const angle = radius === 0 ? 0 : alongX
        ? (Math.PI / 4) * (dy / dx)
        : Math.PI / 2 - (Math.PI / 4) * (dx / dy);
      return {
        x: canvasWidth * (0.5 + 0.44 * radius * Math.cos(angle)),
        y: topInset + (canvasHeight - topInset) * (0.5 + 0.44 * radius * Math.sin(angle)),
      };
    },
  };
}

export interface RecordsGraphCamera {
  zoom: number;
  x: number;
  y: number;
}

export const RECORDS_GRAPH_MAX_ZOOM = 2.6;

/** The sky has no canvas edge; only the lens magnification has stops. */
export function clampRecordsGraphCamera(camera: RecordsGraphCamera, viewport: { width: number; height: number }): RecordsGraphCamera {
  void viewport;
  const zoom = Math.min(RECORDS_GRAPH_MAX_ZOOM, Math.max(1, camera.zoom));
  return { zoom, x: camera.x, y: camera.y };
}

/** Telescope lens: zoom and slew together, keeping the touched star under the moving midpoint. */
export function pinchRecordsGraphCamera(
  camera: RecordsGraphCamera,
  requestedZoom: number,
  startFocal: Pt,
  currentFocal: Pt,
  viewport: { width: number; height: number },
): RecordsGraphCamera {
  const zoom = Math.min(RECORDS_GRAPH_MAX_ZOOM, Math.max(1, requestedZoom));
  return {
    zoom,
    x: camera.x + startFocal.x * viewport.width / camera.zoom - currentFocal.x * viewport.width / zoom,
    y: camera.y + startFocal.y * viewport.height / camera.zoom - currentFocal.y * viewport.height / zoom,
  };
}

/** focalX/Y are fractions of the visible canvas; the same world point stays under the fingers/cursor. */
export function zoomRecordsGraphCamera(
  camera: RecordsGraphCamera,
  requestedZoom: number,
  focalX: number,
  focalY: number,
  viewport: { width: number; height: number },
): RecordsGraphCamera {
  const zoom = Math.min(RECORDS_GRAPH_MAX_ZOOM, Math.max(1, requestedZoom));
  const fx = Math.min(1, Math.max(0, focalX));
  const fy = Math.min(1, Math.max(0, focalY));
  const worldX = camera.x + (fx * viewport.width) / camera.zoom;
  const worldY = camera.y + (fy * viewport.height) / camera.zoom;
  return clampRecordsGraphCamera({
    zoom,
    x: worldX - (fx * viewport.width) / zoom,
    y: worldY - (fy * viewport.height) / zoom,
  }, viewport);
}

export function panRecordsGraphCamera(
  camera: RecordsGraphCamera,
  deltaX: number,
  deltaY: number,
  canvas: { width: number; height: number },
  viewport: { width: number; height: number },
): RecordsGraphCamera {
  return clampRecordsGraphCamera({
    ...camera,
    x: camera.x - (deltaX * viewport.width) / (canvas.width * camera.zoom),
    y: camera.y - (deltaY * viewport.height) / (canvas.height * camera.zoom),
  }, viewport);
}

type GridPt = readonly [x: number, y: number];

interface DomainGridSlot {
  star: GridPt;
  records: readonly [GridPt, GridPt, GridPt];
}

// Seven-domain ring on a 7x7 lattice. Every occupied slot differs from every
// other one by >= one grid step on at least one axis. At the supported 320dp
// floor that is 44.8dp, so 44dp square hit targets cannot cover each other.
// The 0.08 outer margin is 25.6dp and keeps the same targets inside the canvas.
const GRID_ORIGIN = 0.08;
const DOMAIN_GRID: readonly DomainGridSlot[] = [
  { star: [3, 1], records: [[2, 0], [3, 0], [4, 0]] },
  { star: [5, 2], records: [[5, 0], [6, 1], [6, 2]] },
  { star: [5, 4], records: [[6, 3], [6, 4], [6, 5]] },
  { star: [4, 5], records: [[6, 6], [5, 6], [4, 6]] },
  { star: [2, 5], records: [[3, 6], [2, 6], [1, 6]] },
  { star: [1, 4], records: [[0, 6], [0, 5], [0, 4]] },
  { star: [1, 2], records: [[0, 3], [0, 2], [0, 1]] },
];

function gridPoint([x, y]: GridPt): Pt {
  return {
    x: GRID_ORIGIN + x * RECORDS_GRAPH_GRID_STEP,
    y: GRID_ORIGIN + y * RECORDS_GRAPH_GRID_STEP,
  };
}

function recordSlots(count: number, slot: DomainGridSlot): readonly GridPt[] {
  if (count <= 1) return [slot.records[1]];
  if (count === 2) return [slot.records[0], slot.records[2]];
  return slot.records;
}

/** Keep the newest input-order records while enforcing the layout's safe fan. */
export function selectRecordsForSafeGraph<T extends GraphRecord>(records: readonly T[]): T[] {
  const counts = new Map<DomainId, number>();
  return records.filter((record) => {
    const domain = recordDomain(record.tags);
    const count = counts.get(domain) ?? 0;
    if (count >= MAX_RECORDS_PER_GRAPH_DOMAIN) return false;
    counts.set(domain, count + 1);
    return true;
  });
}

export interface GraphEdgeCellBatch<T> {
  cells: readonly T[];
}

function evenlySample<T>(cells: readonly T[], count: number): T[] {
  if (count >= cells.length) return [...cells];
  if (count <= 0) return [];
  return Array.from({ length: count }, (_, index) =>
    cells[Math.floor(((index + 0.5) * cells.length) / count)],
  );
}

function takeBatchBudget<T>(batches: readonly GraphEdgeCellBatch<T>[], budget: number): T[] {
  if (budget <= 0 || batches.length === 0) return [];
  const quotas = batches.map(() => 0);
  let remaining = budget;
  let active = batches.map((_, index) => index).filter((index) => batches[index].cells.length > 0);

  // Fair deterministic passes keep every connection represented before any one
  // edge consumes the remaining budget. The final sampler spans the whole edge,
  // rather than drawing only a misleading prefix near endpoint A.
  while (remaining > 0 && active.length > 0) {
    const share = Math.max(1, Math.floor(remaining / active.length));
    const next: number[] = [];
    for (const index of active) {
      if (remaining === 0) {
        next.push(index);
        continue;
      }
      const capacity = batches[index].cells.length - quotas[index];
      const take = Math.min(capacity, share, remaining);
      quotas[index] += take;
      remaining -= take;
      if (quotas[index] < batches[index].cells.length) next.push(index);
    }
    active = next;
  }

  return batches.flatMap((batch, index) => evenlySample(batch.cells, quotas[index]));
}

/** Non-link spine/branch cells always consume the global budget before tag links. */
export function budgetRecordsGraphEdgeCells<T>(
  nonLinks: readonly GraphEdgeCellBatch<T>[],
  tagLinks: readonly GraphEdgeCellBatch<T>[],
  budget = RECORDS_GRAPH_EDGE_PRIMITIVE_BUDGET,
): T[] {
  const primary = takeBatchBudget(nonLinks, budget);
  const optional = takeBatchBudget(tagLinks, Math.max(0, budget - primary.length));
  return [...primary, ...optional];
}

export function layoutRecordsGraph(graph: RecordsGraph): Record<string, Pt> {
  const pos: Record<string, Pt> = { polaris: { ...CENTER } };

  // Approved roles occupy three separated second-tier slots. Their cited
  // records fan out from those slots; no retired lifestyle-domain nodes enter
  // this graph. Keep the existing domain layout for legacy callers/tests.
  const roleSlots = [0, 2, 5] as const;
  for (const node of graph.nodes) {
    if (node.kind !== "persona") continue;
    const slot = DOMAIN_GRID[roleSlots[node.personaIndex ?? 0] ?? 0];
    pos[node.id] = gridPoint(slot.star);
  }
  for (const node of graph.nodes) {
    if (node.kind !== "record" || !node.personaId) continue;
    const siblings = graph.nodes.filter((candidate) => candidate.kind === "record" && candidate.personaId === node.personaId);
    const owner = graph.nodes.find((candidate) => candidate.id === node.personaId);
    const slot = DOMAIN_GRID[roleSlots[owner?.personaIndex ?? 0] ?? 0];
    const slots = recordSlots(siblings.length, slot);
    pos[node.id] = gridPoint(slots[siblings.indexOf(node)]);
  }

  // Domain stars on stable lattice slots keyed by their Big-Dipper index.
  for (const n of graph.nodes) {
    if (n.kind === "domain" && n.domain) {
      const slot = DOMAIN_GRID[getDomainStar(n.domain).index - 1];
      pos[n.id] = gridPoint(slot.star);
    }
  }

  // Up to three records occupy unique outward lattice slots per domain. The
  // screen selects this safe subset before building the graph; slice here too
  // so an accidental future bypass fails closed instead of reviving overlap.
  const byDomain: Record<string, string[]> = {};
  for (const n of graph.nodes) {
    if (n.kind === "record" && n.domain) (byDomain[n.domain] ??= []).push(n.id);
  }
  for (const [dom, ids] of Object.entries(byDomain)) {
    const slot = DOMAIN_GRID[getDomainStar(dom as DomainId).index - 1];
    const safeIds = ids.slice(0, MAX_RECORDS_PER_GRAPH_DOMAIN);
    const slots = recordSlots(safeIds.length, slot);
    safeIds.forEach((id, index) => {
      pos[id] = gridPoint(slots[index]);
    });
  }

  return pos;
}
