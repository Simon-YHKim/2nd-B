// AI 뮤지엄 — rev2 2-axis timeline data (P5), transcribed 1:1 from the rev2
// prototype `sb-museum.jsx` (MZ_LANES + MUSEUM + MZ geometry). X = time (linear,
// 100px/yr), Y = lane (world ABOVE the shared axis, ai BELOW). The terminal
// `here` node is 두 번째 뇌 — the product's own place on the timeline.
//
// Content is product copy (KR canonical, PRD §15 lexicon-safe) — edits go
// through the normal PR review, not through code refactors.

import { canonMuseum, type CanonMuseumEvent } from "@/lib/canon";

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

export const MUSEUM: MuseumEvent[] = canonMuseum.events.map(toMuseumEvent);

/** Chronological order (year, then lane) — drives the sheet prev/next stepping. */
export const MUSEUM_BY_YEAR: MuseumEvent[] = [...MUSEUM].sort(
  (a, b) => a.year - b.year || (a.lane < b.lane ? -1 : 1),
);

export const museumEventById = (id: string): MuseumEvent | undefined =>
  MUSEUM.find((e) => e.id === id);

/** Ref-kind → KR label (prototype mapping: paper/product/event/film). */
// KO copy sourced from the design canon (src/lib/canon → public/proto/data)
export const MUSEUM_REF_LABEL: Record<MuseumRefKind, string> = {
  paper: canonMuseum.refKo.paper,
  product: canonMuseum.refKo.product,
  event: canonMuseum.refKo.event,
  film: canonMuseum.refKo.film,
};
