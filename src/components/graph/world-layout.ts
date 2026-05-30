// World-coordinate layout for the graph village (queue A). Per the
// mobile-graph pack §3 the village lives in a fixed 1200×1600 "world" and
// is fitted into whatever viewport the device has, instead of being laid
// out relative to the live viewport center. A fixed world means the map is
// stable as you pan/zoom — districts keep their place, so the village reads
// as a real place you navigate rather than a layout that re-flows.
//
// This module is pure + tested. The node ring arrangement mirrors the
// previous responsive layout (tier-2 evenly spaced from the top, tier-3
// clustered in the parent's sector with a seeded jitter) but is now
// expressed in fixed world coordinates. NavGraph maps these through
// `worldToScreen` for rendering, so the existing gesture / clamp / spawn /
// sheet machinery is untouched.

export interface WP {
  x: number;
  y: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export const WORLD = { width: 1200, height: 1600 } as const;
export const WORLD_CENTER: WP = { x: WORLD.width / 2, y: WORLD.height / 2 };

// Ring radii in world units. Kept inside the world half-extents (600 × 800)
// with a margin so even the jittered tier-3 / clustered tier-4 nodes stay
// on the map.
const RING2 = 360;
const RING3 = 540;
const RING4 = 660;

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

/** Map a world point into screen space for the given viewport (base fit). */
export function worldToScreen(p: WP, vp: Viewport, world = WORLD): WP {
  const s = fitScale(vp, world);
  const t = fitTranslate(vp, s, world);
  return { x: p.x * s + t.x, y: p.y * s + t.y };
}

/** Clamp a world point inside the world bounds with a margin. */
function clampToWorld(p: WP, margin = 40): WP {
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
  angle: number;
  /** Index of the tier-2 sector this node belongs to (tier-2 nodes own a
   *  sector; their tier-3/4 children inherit it). Center = -1. */
  sector: number;
}

/** Half-width of each domain sector, in radians, given N domains. Equal
 *  division of the full circle so the six villages own 60° each. A small
 *  gap (0.86 of the slice) keeps neighbouring sectors visually separated. */
export function sectorHalfWidth(domainCount: number): number {
  return ((Math.PI * 2) / Math.max(1, domainCount) / 2) * 0.86;
}

/**
 * World positions for the center + menu nodes. `menu` is the authoritative
 * tier-2/3 node list (NavGraph's MENU_NODES); `centerId` is the tier-1 id.
 *
 * Layout contract (graph-ux-overhaul #5): the circle is divided into N equal
 * sectors, one per tier-2 domain. A domain's tier-3 children fan out WITHIN
 * that domain's sector only — they never spill into a neighbour's wedge — so
 * the village reads as six clean pie slices that grow outward with data.
 */
export function worldMenuPositions(menu: readonly MenuLike[], centerId: string): Map<string, WorldNode> {
  const map = new Map<string, WorldNode>();
  map.set(centerId, { x: WORLD_CENTER.x, y: WORLD_CENTER.y, angle: 0, sector: -1 });

  // Tier 2 — evenly spaced, each owning an equal sector indexed by order.
  const t2 = menu.filter((n) => n.tier === 2);
  const sectorOf = new Map<string, number>();
  const angleOf = new Map<string, number>();
  t2.forEach((n, i) => {
    const angle = -Math.PI / 2 + (i / t2.length) * Math.PI * 2;
    sectorOf.set(n.id, i);
    angleOf.set(n.id, angle);
    map.set(n.id, {
      x: WORLD_CENTER.x + Math.cos(angle) * RING2,
      y: WORLD_CENTER.y + Math.sin(angle) * RING2,
      angle,
      sector: i,
    });
  });

  // Tier 3 — fanned out strictly inside the parent's own sector.
  const half = sectorHalfWidth(t2.length);
  const childrenOf: Record<string, MenuLike[]> = {};
  for (const n of menu) {
    if (n.tier !== 3 || !n.parentId) continue;
    (childrenOf[n.parentId] ??= []).push(n);
  }
  for (const [parentId, kids] of Object.entries(childrenOf)) {
    const parentAngle = angleOf.get(parentId);
    const parentSector = sectorOf.get(parentId);
    if (parentAngle === undefined || parentSector === undefined) continue;
    kids.forEach((n, i) => {
      // Spread within [-half, +half] of the parent angle, leaving margin so
      // children never touch the sector boundary.
      const t = kids.length === 1 ? 0.5 : i / (kids.length - 1);
      const span = half * 1.5; // inner spread < full half-width
      const angle = parentAngle - span / 2 + span * t;
      const rJit = 0.94 + seeded(n.id, 2) * 0.12;
      const pos = clampToWorld({
        x: WORLD_CENTER.x + Math.cos(angle) * RING3 * rJit,
        y: WORLD_CENTER.y + Math.sin(angle) * RING3 * rJit,
      });
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
 * World positions for tier-4 data shards. Each shard sits INSIDE its parent
 * domain's sector (graph-ux-overhaul #5) and the wedge fans wider on the
 * outer ring, so a district that accumulates data visibly grows its fan
 * without ever overlapping a neighbouring village. `domainCount` sizes the
 * sector; `cap` bounds how many we place (matches NavGraph's 40).
 */
export function worldDataPositions(
  dataNodes: readonly DataLike[],
  menuPos: Map<string, WorldNode>,
  fallbackParent = "wiki-daily",
  cap = 40,
  domainCount = 6,
): Map<string, WorldDataNode> {
  const out = new Map<string, WorldDataNode>();
  const half = sectorHalfWidth(domainCount);
  dataNodes.slice(0, Math.min(dataNodes.length, cap)).forEach((d) => {
    const parentId = d.parentId ?? fallbackParent;
    const parent = menuPos.get(parentId);
    const parentAngle = parent?.angle ?? 0;
    // Spread within the parent's sector (a touch tighter than full half so
    // shards stay clear of the boundary), seeded per id for a stable fan.
    const ang = parentAngle + (seeded(d.id, 3) - 0.5) * 2 * (half * 0.82);
    const r = RING4 * (0.86 + seeded(d.id, 4) * 0.16);
    const pos = clampToWorld({
      x: WORLD_CENTER.x + Math.cos(ang) * r,
      y: WORLD_CENTER.y + Math.sin(ang) * r,
    });
    out.set(d.id, { x: pos.x, y: pos.y, parentId });
  });
  return out;
}

/** A domain sector's angular bounds + the world point to focus when zooming
 *  into it (graph-ux-overhaul #6: tap a village → fill the screen with its
 *  sector). Returns the mid-radius centroid of the wedge and a suggested
 *  focus scale. */
export interface SectorFocus {
  /** World point to center on (mid-radius along the sector's center angle). */
  focus: WP;
  centerAngle: number;
  halfWidth: number;
}

export function sectorFocus(node: WorldNode | undefined, domainCount = 6): SectorFocus | null {
  if (!node || node.sector < 0) return null;
  // Aim the camera at the meat of the wedge: between the domain ring and the
  // data ring, on the domain's center angle.
  const r = (RING2 + RING4) / 2;
  const focus = clampToWorld({
    x: WORLD_CENTER.x + Math.cos(node.angle) * r,
    y: WORLD_CENTER.y + Math.sin(node.angle) * r,
  });
  return { focus, centerAngle: node.angle, halfWidth: sectorHalfWidth(domainCount) };
}
