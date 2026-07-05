// Phase 1b (D-27): deterministic domain-ring layout + palette for the records
// tag-graph (buildRecordsGraph). Ports the proto sb-wikigraph geometry
// (public/proto/sb-wikigraph.jsx:31-55): polaris at center, the domain stars on
// a ring around it (stable direction per DomainId, not per presence order), and
// each domain's records fanned out around their star. Positions are in 0..1
// canvas space (same convention as wiki graph-layout.ts). Pure + testable.

import { getDomainStar, type DomainId } from "../persona/domain-stars";
import type { RecordsGraph } from "./records-graph";

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
const R_DOMAIN = 0.34; // domain-star ring radius from center
const R_RECORD = 0.11; // record cluster radius around a domain star
const CLAMP_MIN = 0.05;
const CLAMP_MAX = 0.95;

function clamp01(v: number): number {
  return Math.min(CLAMP_MAX, Math.max(CLAMP_MIN, v));
}

/** Stable angle for a domain: keyed on its Big-Dipper index so a domain always
 *  sits in the same direction regardless of which other domains are present. */
function domainAngle(id: DomainId): number {
  const idx = getDomainStar(id).index; // 1..7
  return -Math.PI / 2 + ((idx - 1) / 7) * Math.PI * 2;
}

export function layoutRecordsGraph(graph: RecordsGraph): Record<string, Pt> {
  const pos: Record<string, Pt> = { polaris: { ...CENTER } };

  // Domain stars on the ring.
  const angleOf: Partial<Record<DomainId, number>> = {};
  for (const n of graph.nodes) {
    if (n.kind === "domain" && n.domain) {
      const ang = domainAngle(n.domain);
      angleOf[n.domain] = ang;
      pos[n.id] = {
        x: clamp01(CENTER.x + Math.cos(ang) * R_DOMAIN),
        y: clamp01(CENTER.y + Math.sin(ang) * R_DOMAIN),
      };
    }
  }

  // Records fanned around their domain star, biased outward from center.
  const byDomain: Record<string, string[]> = {};
  for (const n of graph.nodes) {
    if (n.kind === "record" && n.domain) (byDomain[n.domain] ??= []).push(n.id);
  }
  for (const [dom, ids] of Object.entries(byDomain)) {
    const star = pos[`domain:${dom}`];
    if (!star) continue;
    const baseAng = angleOf[dom as DomainId] ?? -Math.PI / 2;
    const m = ids.length;
    const rr = R_RECORD * (m > 6 ? 1.5 : 1);
    ids.forEach((id, k) => {
      const spread = m === 1 ? 0 : (k / (m - 1) - 0.5) * Math.PI * 0.95;
      const ra = baseAng + spread;
      pos[id] = {
        x: clamp01(star.x + Math.cos(ra) * rr),
        y: clamp01(star.y + Math.sin(ra) * rr),
      };
    });
  }

  return pos;
}
