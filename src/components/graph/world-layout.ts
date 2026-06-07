// World-coordinate layout for the graph (queue A). The graph lives in a fixed
// portrait "world" and is fitted into whatever viewport the device has, instead
// of being laid out relative to the live viewport center. A fixed world means
// the map is stable as you pan/zoom — nodes keep their place, so the graph reads
// as a real place you navigate rather than a layout that re-flows.
//
// 2026-06-08 — Tree redesign (Simon reference 4-AI direction): the model is now
// a BOTTOM-ROOTED, UPWARD-GROWING crystalline tree, not a center radial village.
// The Soul Core sits near the bottom-center as the root; the 5 Pattern Cores
// form a 2-2-1 canopy ABOVE it; Pattern Data shards bloom in an upward cone off
// each parent core. This module is pure + tested. NavGraph maps these through
// `worldToScreen` for rendering (with a bottom-reserved viewport so the root
// frames just above the insight cards), so the gesture / clamp / spawn / sheet
// machinery is untouched.

export interface WP {
  x: number;
  y: number;
}

export interface Viewport {
  width: number;
  height: number;
}

// Portrait 9:16 world to match the tall phone composition of the references.
export const WORLD = { width: 1080, height: 1920 } as const;
// Geometric center — retained for backward-compat with callers/tests that still
// reference it. The tree root is NOT here; see ROOT_ANCHOR / rootPoint().
export const WORLD_CENTER: WP = { x: WORLD.width / 2, y: WORLD.height / 2 };

// Tree root (Soul Core) anchored near bottom-center; the canopy grows upward.
export const ROOT_ANCHOR: WP = { x: 0.5, y: 0.82 };

/** Soul Core root world point. */
export function rootPoint(world = WORLD): WP {
  return { x: world.width * ROOT_ANCHOR.x, y: world.height * ROOT_ANCHOR.y };
}

// Explicit 2-2-1 canopy anchors (fraction of world), every core ABOVE the root.
// Positions track REF1's colour spots so each baked-colour cube lands where the
// reference shows it: knowledge(teal) top, records(silver) upper-left,
// taste(violet) upper-right, relation(rose) lower-left, work(green) lower-right
// (work/green = the core REF2 drills into).
const CORE_ANCHORS: Record<string, WP> = {
  knowledge: { x: 0.5, y: 0.17 },
  records: { x: 0.27, y: 0.35 },
  taste: { x: 0.73, y: 0.35 },
  relation: { x: 0.3, y: 0.56 },
  work: { x: 0.7, y: 0.56 },
};

/** Deterministic 0..1 hash for a node id + salt (mirrors NavGraph's seeded). */
export function seeded(id: string, salt: number): number {
  let h = 5381 + salt * 31;
  for (let i = 0; i < id.length; i++) h = (h * 33) ^ id.charCodeAt(i);
  return ((h >>> 0) % 10000) / 10000;
}

/** Contain-fit scale: the largest scale at which the whole world fits the
 *  viewport, with a small padding so the edges aren't flush. */
export function fitScale(vp: Viewport, world = WORLD, padding = 0.92): number {
  return Math.min(vp.width / world.width, vp.height / world.height) * padding;
}

/** Translation that centers the fitted world in the viewport. */
export function fitTranslate(vp: Viewport, scale: number, world = WORLD): WP {
  return {
    x: (vp.width - world.width * scale) / 2,
    y: (vp.height - world.height * scale) / 2,
  };
}

/** Map a world point into screen space for the given viewport (base fit).
 *  Pass a bottom-reserved viewport (height minus the insight-card stack) so the
 *  bottom-rooted tree frames above the cards instead of behind them. */
export function worldToScreen(p: WP, vp: Viewport, world = WORLD): WP {
  const s = fitScale(vp, world);
  const t = fitTranslate(vp, s, world);
  return { x: p.x * s + t.x, y: p.y * s + t.y };
}

/** Clamp a world point inside the world bounds with a margin. */
function clampToWorld(p: WP, margin = 48): WP {
  return {
    x: Math.max(margin, Math.min(WORLD.width - margin, p.x)),
    y: Math.max(margin, Math.min(WORLD.height - margin, p.y)),
  };
}

export interface MenuLike {
  id: string;
  tier: 1 | 2 | 3 | 4;
  parentId?: string;
}

export interface WorldNode {
  x: number;
  y: number;
  /** Direction from the root to this node, radians (for worker/sector math). */
  angle: number;
  /** Index of the tier-2 core this node belongs to (tier-2 nodes own a branch;
   *  their tier-3/4 children inherit it). Root = -1. */
  sector: number;
}

/** Half-width of each branch fan, in radians, given N cores. Retained for
 *  callers/tests; the tree uses upward cones rather than full-circle sectors. */
export function sectorHalfWidth(domainCount: number): number {
  return ((Math.PI * 2) / Math.max(1, domainCount) / 2) * 0.86;
}

/** Place a child above a parent in an upward cone: angleFromUp spreads the fan
 *  left/right of vertical, radius pushes it up the tree. */
function upwardConePoint(parent: WP, angleFromUp: number, radius: number): WP {
  return {
    x: parent.x + Math.sin(angleFromUp) * radius,
    y: parent.y - Math.cos(angleFromUp) * radius,
  };
}

/**
 * World positions for the root + menu nodes. `menu` is the authoritative
 * tier-2/3 node list (NavGraph's MENU_NODES); `centerId` is the tier-1 id.
 *
 * Layout contract (tree redesign): the Soul Core root sits at ROOT_ANCHOR
 * (bottom-center); the 5 Pattern Cores sit in a fixed 2-2-1 canopy ABOVE the
 * root (every core y < root y); tier-3 children fan upward off their parent.
 */
export function worldMenuPositions(menu: readonly MenuLike[], centerId: string): Map<string, WorldNode> {
  const map = new Map<string, WorldNode>();
  const root = rootPoint();
  map.set(centerId, { x: root.x, y: root.y, angle: 0, sector: -1 });

  // Tier 2 — fixed canopy anchors above the root (fallback: even upward arc).
  const t2 = menu.filter((n) => n.tier === 2);
  const angleOf = new Map<string, number>();
  const sectorOf = new Map<string, number>();
  t2.forEach((n, i) => {
    const anchor = CORE_ANCHORS[n.id];
    const raw = anchor
      ? { x: WORLD.width * anchor.x, y: WORLD.height * anchor.y }
      : // Fallback for unknown ids: even arc across the upper canopy.
        upwardConePoint(
          root,
          (-0.5 + (t2.length === 1 ? 0.5 : i / (t2.length - 1)) * 1.0) * Math.PI * 0.5,
          WORLD.height * 0.52,
        );
    const pos = clampToWorld(raw);
    const angle = Math.atan2(pos.y - root.y, pos.x - root.x);
    angleOf.set(n.id, angle);
    sectorOf.set(n.id, i);
    map.set(n.id, { x: pos.x, y: pos.y, angle, sector: i });
  });

  // Tier 3 — fanned upward off the parent core (short reach, inside the canopy).
  const childrenOf: Record<string, MenuLike[]> = {};
  for (const n of menu) {
    if (n.tier !== 3 || !n.parentId) continue;
    (childrenOf[n.parentId] ??= []).push(n);
  }
  for (const [parentId, kids] of Object.entries(childrenOf)) {
    const parent = map.get(parentId);
    const parentSector = sectorOf.get(parentId);
    if (!parent || parentSector === undefined) continue;
    kids.forEach((n, i) => {
      const t = kids.length === 1 ? 0.5 : i / (kids.length - 1);
      const coneHalf = 0.5; // radians each side of "up"
      const angleFromUp = -coneHalf + 2 * coneHalf * t;
      const radius = WORLD.height * (0.12 + seeded(n.id, 2) * 0.03);
      const pos = clampToWorld(upwardConePoint(parent, angleFromUp, radius));
      const angle = Math.atan2(pos.y - parent.y, pos.x - parent.x);
      map.set(n.id, { x: pos.x, y: pos.y, angle, sector: parentSector });
    });
  }
  return map;
}

export interface DataLike {
  id: string;
  parentId?: string;
}

export interface WorldDataNode {
  x: number;
  y: number;
  parentId: string;
}

/**
 * World positions for tier-4 data shards. Each snowflake blooms in an UPWARD
 * cone off its parent core (short radius, seeded jitter), so a core that
 * accumulates data grows a visible upward spray of crystals. `cap` bounds how
 * many we place (matches NavGraph's cap).
 */
export function worldDataPositions(
  dataNodes: readonly DataLike[],
  menuPos: Map<string, WorldNode>,
  fallbackParent = "knowledge",
  cap = 40,
  _domainCount = 5,
): Map<string, WorldDataNode> {
  const out = new Map<string, WorldDataNode>();
  // Group by parent so each core's shards fan deterministically.
  const byParent = new Map<string, DataLike[]>();
  dataNodes.slice(0, Math.min(dataNodes.length, cap)).forEach((d) => {
    const parentId = d.parentId ?? fallbackParent;
    const list = byParent.get(parentId) ?? [];
    list.push(d);
    byParent.set(parentId, list);
  });
  for (const [parentId, shards] of byParent) {
    const parent = menuPos.get(parentId);
    const base: WP = parent ? { x: parent.x, y: parent.y } : rootPoint();
    shards.forEach((d, i) => {
      const t = shards.length === 1 ? 0.5 : i / (shards.length - 1);
      const coneHalf = 0.62; // wider than tier-3 so leaves spread
      const jitter = (seeded(d.id, 3) - 0.5) * 0.3;
      const angleFromUp = -coneHalf + 2 * coneHalf * t + jitter;
      const radius = WORLD.height * (0.07 + seeded(d.id, 4) * 0.05);
      const pos = clampToWorld(upwardConePoint(base, angleFromUp, radius));
      out.set(d.id, { x: pos.x, y: pos.y, parentId });
    });
  }
  return out;
}

/** Camera focus when zooming into a core (tree redesign): aim at the tapped
 *  core itself, not a radial sector centroid. Returns the core world point and
 *  a nominal fan half-width for callers that still read it. */
export interface SectorFocus {
  /** World point to center on (the core node). */
  focus: WP;
  centerAngle: number;
  halfWidth: number;
}

export function sectorFocus(node: WorldNode | undefined, domainCount = 5): SectorFocus | null {
  if (!node || node.sector < 0) return null;
  // Center slightly above the core so its upward data fan stays in frame.
  const focus = clampToWorld({ x: node.x, y: node.y - WORLD.height * 0.06 });
  return { focus, centerAngle: node.angle, halfWidth: sectorHalfWidth(domainCount) };
}
