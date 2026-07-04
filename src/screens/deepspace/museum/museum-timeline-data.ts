// AI 뮤지엄 — rev2 2-axis timeline data (P5), transcribed 1:1 from the rev2
// prototype `sb-museum.jsx` (MZ_LANES + MUSEUM + MZ_EXTRA merge + MZ_DETAIL +
// MZ geometry incl. mzPlace). X = time (linear, 100px/yr), Y = lane (world
// ABOVE the shared axis, ai BELOW). The terminal `here` node is 두 번째 뇌 —
// the product's own place on the timeline.
//
// Content is product copy (KR canonical, PRD §15 lexicon-safe) — edits go
// through the normal PR review, not through code refactors.

import { canonMuseum, type CanonMuseumDetail, type CanonMuseumEvent } from "@/lib/canon";

export type MuseumLaneId = "world" | "ai";

export interface MuseumLane {
  id: MuseumLaneId;
  label: string;
  en: string;
  icon: string;
  accent: string;
  tint: string;
  ink: string;
}

export type MuseumRefKind = "paper" | "product" | "event" | "film";

export interface MuseumRef {
  kind: MuseumRefKind;
  label: string;
}

export interface MuseumEvent {
  id: string;
  icon: string;
  lane: MuseumLaneId;
  /** Numeric year — drives the X position. */
  year: number;
  /** Display label (may differ from year: '1939–45', '2023–', '곧'). */
  ylabel: string;
  title: string;
  sub: string;
  body: string;
  tags: string[];
  /** Related event ids — drawn as bezier connectors + "이어진 사건" jumps. */
  rel: string[];
  refs: MuseumRef[];
  /** The terminal 2nd-brain node ("지금 여기"). */
  here?: boolean;
}

// KO copy sourced from the design canon (src/lib/canon → public/proto/data)
export const MZ_LANES: Record<MuseumLaneId, MuseumLane> = {
  world: { ...canonMuseum.lanes.world, id: "world" },
  ai: { ...canonMuseum.lanes.ai, id: "ai" },
};

/** Timeline geometry (prototype MZ) — X is linear in years. */
export const MZ = {
  START: 1936,
  END: 2028,
  /** px per year */
  PXY: 100,
  PAD: 88,
  /** canvas height */
  TH: 400,
  /** the shared horizontal axis Y */
  AXIS: 196,
  NODE_W: 118,
  NODE_H: 84,
  /** node band offset from the axis */
  GAP: 16,
  /** gap between the near and far stagger rows */
  VGAP: 10,
} as const;

export const MZ_CANVAS_W = MZ.PAD * 2 + (MZ.END - MZ.START) * MZ.PXY;

export const mzX = (year: number): number => MZ.PAD + (year - MZ.START) * MZ.PXY;

// KO copy sourced from the design canon (src/lib/canon → public/proto/data)
const REF_KIND: Record<string, MuseumRefKind | undefined> = {
  paper: "paper",
  product: "product",
  event: "event",
  film: "film",
};

function toMuseumEvent(e: CanonMuseumEvent): MuseumEvent {
  const lane: MuseumLaneId = e.lane === "ai" ? "ai" : "world";
  return {
    id: e.id,
    icon: e.icon,
    lane,
    year: e.year,
    ylabel: e.ylabel,
    title: e.title,
    sub: e.sub,
    body: e.body,
    tags: e.tags ?? [],
    rel: e.rel ?? [],
    refs: (e.refs ?? []).map((r) => ({ kind: REF_KIND[r.kind] ?? "event", label: r.label })),
    here: e.here,
  };
}

// Prototype merge: `MUSEUM = events.slice(); push(MZ_EXTRA); sort(year)`.
// Array.prototype.sort is stable, so same-year events keep base-before-extra
// order exactly like the prototype's module-scope push + sort.
export const MUSEUM: MuseumEvent[] = [...canonMuseum.events, ...canonMuseum.extra]
  .map(toMuseumEvent)
  .sort((a, b) => a.year - b.year);

/** Chronological order (year, then lane) — drives the sheet prev/next stepping. */
export const MUSEUM_BY_YEAR: MuseumEvent[] = [...MUSEUM].sort(
  (a, b) => a.year - b.year || (a.lane < b.lane ? -1 : 1),
);

export const museumEventById = (id: string): MuseumEvent | undefined =>
  MUSEUM.find((e) => e.id === id);

/** Rich per-event detail (prototype MZ_DETAIL): long copy, fact rows,
 *  cause/effect. Canon KO copy verbatim — data, not chrome. */
export type MuseumDetail = CanonMuseumDetail;

export const museumDetailById = (id: string): MuseumDetail | undefined =>
  canonMuseum.detail[id];

/** Prototype mzPlace, ported 1:1: per lane, stagger events across a near and a
 *  far row. When both rows are free, balance toward the emptier one; when both
 *  are blocked, take the soonest-free row and NUDGE the node right by minGap so
 *  dense year-clusters (2022-2026) never overlap. Returns the node's top-left. */
export interface MuseumNodePos {
  x: number;
  y: number;
  row: 0 | 1;
}

// Row tops per lane (prototype nearW/farW, nearA/farA): world stacks upward
// from the axis (near row first), ai stacks downward.
const ROW_TOPS: Record<MuseumLaneId, [number, number]> = {
  world: [
    MZ.AXIS - MZ.GAP - MZ.NODE_H,
    MZ.AXIS - MZ.GAP - MZ.NODE_H - MZ.VGAP - MZ.NODE_H,
  ],
  ai: [MZ.AXIS + MZ.GAP, MZ.AXIS + MZ.GAP + MZ.NODE_H + MZ.VGAP],
};

export function placeMuseumNodes(events: MuseumEvent[]): Map<string, MuseumNodePos> {
  const out = new Map<string, MuseumNodePos>();
  const minGap = MZ.NODE_W + 8;
  (["world", "ai"] as const).forEach((lane) => {
    // lastX tracks node CENTER x per row, like the prototype.
    const lastX: [number, number] = [-1e9, -1e9];
    events
      .filter((e) => e.lane === lane)
      .sort((a, b) => a.year - b.year)
      .forEach((ev) => {
        const natural = mzX(ev.year);
        const fits0 = natural - lastX[0] >= minGap;
        const fits1 = natural - lastX[1] >= minGap;
        let row: 0 | 1;
        if (fits0 && fits1) row = lastX[0] <= lastX[1] ? 0 : 1; // both free → balance
        else if (fits0) row = 0;
        else if (fits1) row = 1;
        else row = lastX[0] <= lastX[1] ? 0 : 1; // both blocked → soonest-free
        const x = (row === 0 ? fits0 : fits1) ? natural : lastX[row] + minGap; // nudge only if needed
        lastX[row] = x;
        out.set(ev.id, { x: x - MZ.NODE_W / 2, y: ROW_TOPS[lane][row], row });
      });
  });
  return out;
}

/** Ref-kind → KR label (prototype mapping: paper/product/event/film). */
// KO copy sourced from the design canon (src/lib/canon → public/proto/data)
export const MUSEUM_REF_LABEL: Record<MuseumRefKind, string> = {
  paper: canonMuseum.refKo.paper,
  product: canonMuseum.refKo.product,
  event: canonMuseum.refKo.event,
  film: canonMuseum.refKo.film,
};

/** Ref-kind → Material-Symbols glyph id (prototype refIcon mapping). */
export const MUSEUM_REF_ICON: Record<MuseumRefKind, string> = {
  paper: canonMuseum.refIcon.paper,
  product: canonMuseum.refIcon.product,
  event: canonMuseum.refIcon.event,
  film: canonMuseum.refIcon.film,
};
