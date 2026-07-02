// People map layout (rev2 P4c, 관계 렌즈): a radial "who's around me" layout.
// Center = 나. Distance from center = closeness (1..5 -> closer is nearer);
// angular sector = relation kind, so 가족/파트너/친구/동료/멘토/기타 group
// naturally. Deterministic (index-spread within a sector, no randomness).
// Pure + tested; the screen renders the result as SVG.

import type { Person, RelationKind } from "./people";

export const RELATION_SECTORS: readonly RelationKind[] = [
  "family",
  "partner",
  "friend",
  "colleague",
  "mentor",
  "other",
];

export interface PeopleMapNode {
  id: string;
  name: string;
  kind: RelationKind;
  /** 1..5 (null closeness renders at the far ring). */
  closeness: number;
  /** Position in the unit disc around (0.5, 0.5). */
  x: number;
  y: number;
}

const SECTOR_SPAN = (2 * Math.PI) / RELATION_SECTORS.length;
/** Radius for closeness c: c=5 hugs the center, c=1 (or null) sits outside. */
const RING = { min: 0.16, max: 0.46 };

export function radiusForCloseness(closeness: number | null): number {
  const c = closeness === null ? 1 : Math.min(5, Math.max(1, closeness));
  return RING.max - ((c - 1) / 4) * (RING.max - RING.min);
}

export function layoutPeopleMap(people: readonly Person[]): PeopleMapNode[] {
  const bySector = new Map<RelationKind, Person[]>();
  for (const p of people) {
    const kind = RELATION_SECTORS.includes(p.relation_kind) ? p.relation_kind : "other";
    const arr = bySector.get(kind) ?? [];
    arr.push(p);
    bySector.set(kind, arr);
  }

  const nodes: PeopleMapNode[] = [];
  for (const [kind, members] of bySector) {
    const sectorIndex = RELATION_SECTORS.indexOf(kind);
    const start = -Math.PI / 2 + sectorIndex * SECTOR_SPAN;
    // Stable order inside a sector: closest first, then name (deterministic).
    const sorted = [...members].sort((a, b) => {
      const ca = a.closeness ?? 0;
      const cb = b.closeness ?? 0;
      if (cb !== ca) return cb - ca;
      return a.display_name.localeCompare(b.display_name);
    });
    sorted.forEach((p, i) => {
      // Spread members across the sector, margin at both edges.
      const t = (i + 1) / (sorted.length + 1);
      const angle = start + t * SECTOR_SPAN;
      const r = radiusForCloseness(p.closeness);
      nodes.push({
        id: p.id,
        name: p.display_name,
        kind,
        closeness: p.closeness ?? 1,
        x: 0.5 + r * Math.cos(angle),
        y: 0.5 + r * Math.sin(angle),
      });
    });
  }
  return nodes;
}
