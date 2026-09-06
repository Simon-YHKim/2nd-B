// Canon data layer, AI 뮤지엄 content pack (public/proto/data/screens/museum.json).
//
// Split out of ./index.ts (audit D5-13): the index promises to import only the
// small structural packs, but it carried this 62 KB pack at module scope for
// thirteen importers when a single route (src/app/museum.tsx via
// screens/deepspace/museum/*) reads it. Import from here, never from the index.
// Measured 2026-09-06: this keeps the pack off the index's dependency edge, but
// it is still in the web entry because expo-router bundles every route
// statically (no asyncRoutes) -- taking the bytes out needs the museum route
// itself to be lazy-loaded, which is a separate change.
// Values are a pixel contract (design/proto_rev2/CLAUDE.md): do not edit them
// from the app side.

import museumPack from "../../../public/proto/data/screens/museum.json";

export interface CanonMuseumEvent {
  id: string;
  icon: string;
  lane: string;
  year: number;
  ylabel: string;
  title: string;
  sub: string;
  body: string;
  tags?: string[];
  rel?: string[];
  refs?: { kind: string; label: string }[];
  here?: boolean;
}

export interface CanonMuseumDetail {
  long?: string;
  facts?: string[][];
  cause?: string;
  effect?: string;
}

export const canonMuseum = {
  lanes: museumPack.lanes as Record<string, { label: string; en: string; icon: string; accent: string; tint: string; ink: string }>,
  events: museumPack.events as CanonMuseumEvent[],
  extra: museumPack.extra as CanonMuseumEvent[],
  detail: museumPack.detail as Record<string, CanonMuseumDetail>,
  refKo: museumPack.refKo as Record<string, string>,
  refIcon: museumPack.refIcon as Record<string, string>,
  decades: museumPack.decades as number[],
};
