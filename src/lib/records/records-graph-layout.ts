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
