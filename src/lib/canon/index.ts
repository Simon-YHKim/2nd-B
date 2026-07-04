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
