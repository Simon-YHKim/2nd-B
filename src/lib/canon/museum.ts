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

/**
 * The language the pack's editorial content is written in, as a BCP 47 tag.
 *
 * `lanes` carry `label` (ko) and `en`; the 43 events and their details carry only
 * Korean - title, sub, body, facts, cause, effect. That is the canon's own
 * decision ("KO canonical ... data, not chrome"), and changing it is a product
 * call. Telling assistive technology which language it is looking at is not:
 * without it an English screen reader voices Korean glyphs in an English voice,
 * which is noise rather than "untranslated".
 *
 * Declared here, beside the pack, so the screen never writes "ko" itself and the
 * two cannot drift apart.
 */
export const CANON_MUSEUM_LANGUAGE = "ko";

export const canonMuseum = {
  lanes: museumPack.lanes as Record<string, { label: string; en: string; icon: string; accent: string; tint: string; ink: string }>,
  events: museumPack.events as CanonMuseumEvent[],
  extra: museumPack.extra as CanonMuseumEvent[],
  detail: museumPack.detail as Record<string, CanonMuseumDetail>,
  refKo: museumPack.refKo as Record<string, string>,
  refIcon: museumPack.refIcon as Record<string, string>,
  decades: museumPack.decades as number[],
};
