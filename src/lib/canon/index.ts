// Canon data layer: typed access to the proto_rev2 JSON canon (public/proto/data).
// The prototype (live at /proto/) and the app read the SAME files, so screen
// metadata, nav, and constellation geometry have a single source of truth.
// Import only the small structural packs here - content packs (museum, wiki,
// lenses...) stay proto-side until a screen actually needs them, to keep the
// app bundle lean. Values are a pixel contract (design/proto_rev2/CLAUDE.md):
// do not edit them from the app side.

import manifest from "../../../public/proto/data/index.json";
import screensPack from "../../../public/proto/data/app/screens.json";
import navPack from "../../../public/proto/data/app/nav.json";
import constellationPack from "../../../public/proto/data/core/constellation.json";
import captureModesPack from "../../../public/proto/data/core/capture-modes.json";
import museumPack from "../../../public/proto/data/screens/museum.json";
import morePack from "../../../public/proto/data/screens/more.json";
import knowPack from "../../../public/proto/data/screens/know.json";
import surfacesPack from "../../../public/proto/data/screens/surfaces.json";
import validatePack from "../../../public/proto/data/screens/validate.json";
import starLensesPack from "../../../public/proto/data/screens/star-lenses.json";
import flowsPack from "../../../public/proto/data/screens/flows.json";
import gapsPack from "../../../public/proto/data/screens/gaps.json";
import tokensPack from "../../../public/proto/data/app/tokens.json";

export type CanonLayout = "immersive" | "museumLike" | "windowed";

export interface CanonScreen {
  id: string;
  component: string;
  layout: CanonLayout;
  root?: boolean;
  companion?: boolean;
  title?: string;
  label?: string;
}

export interface CanonNavTab {
  id: string;
  label: string;
  icon: string;
}

export interface CanonStar {
  id: string;
  x: number;
  y: number;
  kind: string;
  star: string;
  line: string;
  route: string;
  big?: boolean;
  label?: string;
  domain?: string;
  level?: number;
}

export const canonCanvas = screensPack.canvas as { w: number; h: number };
export const canonScreens = screensPack.screens as CanonScreen[];
export const canonNav = navPack.tabs as CanonNavTab[];
export const canonStars = constellationPack.stars as CanonStar[];
export const canonManifestFiles = manifest.files as Record<string, string>;

const byId = new Map(canonScreens.map((s) => [s.id, s]));

export function getCanonScreen(id: string): CanonScreen | undefined {
  return byId.get(id);
}

export function canonRoots(): CanonScreen[] {
  return canonScreens.filter((s) => s.root);
}

export function canonLayoutOf(id: string): CanonLayout {
  return byId.get(id)?.layout ?? "windowed";
}

export function canonStats(): {
  screens: number;
  roots: number;
  byLayout: Record<CanonLayout, number>;
  packs: number;
} {
  const byLayout: Record<CanonLayout, number> = { immersive: 0, museumLike: 0, windowed: 0 };
  for (const s of canonScreens) byLayout[s.layout] += 1;
  return {
    screens: canonScreens.length,
    roots: canonRoots().length,
    byLayout,
    packs: Object.keys(canonManifestFiles).length,
  };
}

/* ── Content packs ─────────────────────────────────────────────
   Korean copy and data below are the design canon (pixel contract) —
   screens source their KO content here; EN mirrors stay app-side.
   Values that must track LIVE state (prices via TIER_PRICE_KRW,
   real ratification rows, live reminders) are intentionally NOT
   exported: the entitlement/data layer stays the source of truth. */

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

export interface CanonImagineSeed {
  angle: string;
  icon: string;
  title: string;
  body: string;
  steps: string[];
}

export interface CanonReminder {
  id: number;
  title: string;
  when: string;
  star: string;
  src: string;
  on: boolean;
  repeat: string;
}

export const canonMore = {
  imagineSeeds: morePack.imagineSeeds as CanonImagineSeed[],
  reminders: morePack.reminders as CanonReminder[],
  focusPresets: morePack.focusPresets as number[],
  focusStars: morePack.focusStars as string[],
};

export const canonKnow = {
  questions: knowPack.questions as string[],
  likertOptions: knowPack.likertOptions as string[],
  ratifyProposals: knowPack.ratifyProposals as { lens: string; from: string; to: string; delta: string }[],
};

export interface CanonAxisRow {
  k: string;
  en: string;
  v: number;
  note: string;
}

export const canonSurfaces = {
  trendSeries: surfacesPack.trendSeries as number[],
  trendEvents: surfacesPack.trendEvents as { w: string; star: string; from: string; to: string; why: string; up: boolean }[],
  trendAxisLabels: surfacesPack.trendAxisLabels as string[],
  starSpark: surfacesPack.starSpark as [string, number, number][],
  sdt: surfacesPack.sdt as CanonAxisRow[],
  strengths: surfacesPack.strengths as (CanonAxisRow & { icon: string })[],
};

export const canonValidateValues = validatePack.values as CanonAxisRow[];

export const canonCaptureModes = captureModesPack.modes as { id: string; icon: string; label: string }[];

export const canonIden = {
  targets: starLensesPack.idenScreen.targets as { k: string; c: string }[],
  formats: starLensesPack.idenScreen.formats as string[],
  // rev2 IdenScreen include-toggle categories (design/proto_rev2 idenScreen.rows):
  // the 4 fixed export sections the user chooses from. NOTE: the canon `bigfive`
  // sub is a fabricated score line ("O72 C58 …") — screens MUST NOT render it as
  // real data; the iden screen substitutes the account's REAL Big Five values or
  // a neutral descriptor (see src/app/iden.tsx).
  rows: starLensesPack.idenScreen.rows as { id: string; label: string; sub: string }[],
};

export interface CanonOnboardingSlide {
  tag: string;
  title: string;
  icon: string;
  body: string;
}

export interface CanonInboxItem {
  icon: string;
  accent: string;
  title: string;
  body: string;
  time: string;
  route: string;
  cta: string;
}

export const canonFlows = {
  onboardingSlides: flowsPack.onboardingSlides as CanonOnboardingSlide[],
  inboxItems: flowsPack.inboxItems as CanonInboxItem[],
};

/* ── gaps.json additive content (support / privacy / manual screens) ──
   Content the prototype carries but the app had never wired: help FAQs, in-app
   notices, privacy-fact rows, and the rev2 manual's six core concepts. Screens
   render the KO copy straight from here (museum pattern) — no locale churn.

   DELIBERATELY EXCLUDED: gaps.json also holds `permissionRows` / `permissionDefaults`,
   but they are NOT exported. The app's live permission matrix (src/app/permissions.tsx
   ENTRIES) reflects the real OS permission set and is intentionally more honest than
   this canon mock, so the app must keep sourcing permissions from that live matrix,
   never from this pack. */

export interface CanonFaq {
  q: string;
  a: string;
}

export interface CanonNotice {
  t: string;
  d: string;
  tag: string;
}

export interface CanonPrivacyFact {
  icon: string;
  label: string;
  v: string;
}

export interface CanonManualConcept {
  icon: string;
  title: string;
  body: string;
}

export const canonGaps = {
  faqs: gapsPack.faqs as CanonFaq[],
  notices: gapsPack.notices as CanonNotice[],
  privacyFacts: gapsPack.privacyFacts as CanonPrivacyFact[],
  manualConcepts: gapsPack.manualConcepts as CanonManualConcept[],
};

/* Design-token mirror generated from m3-theme.css (design/proto_rev2/tools/gen-tokens.mjs).
   The CSS stays the token canon; this JSON lets non-CSS consumers (native theming,
   docs, audits) read the same values without a CSS parser. */
export const canonTokens = {
  palettes: tokensPack.palettes as Record<string, Record<string, string>>,
  root: tokensPack.root as Record<string, string>,
};
