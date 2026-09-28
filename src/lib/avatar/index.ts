import type { ImageSourcePropType } from "react-native";

import { isAvatarSharePixels, pixelsToRects } from "@/lib/avatar-share/pixels";
import { getAvatarThumbnail } from "./thumbnails";

export { getAvatarThumbnail };
export type { AvatarThumbnailCategory } from "./thumbnails";

export interface AvatarSpec {
  v: 64;
  seed: string;
  type: "human" | "animal";
  skin: string;
  hairColor: string;
  eye: string;
  cloth: string;
  cloth2: string;
  fur: string;
  hair: string;
  acc: string;
  face: string;
  expr: string;
  species: string;
  job: string | null;
  garmentId: string | null;
  wearUniform: boolean;
  /** Approved Avatar Share item IDs. The art itself is loaded separately. */
  sharedAssets?: Partial<Record<"hair" | "garment" | "accessory", string>>;
}

export interface AvatarCatalogItem {
  id: string;
  ko: string;
  en: string;
  group?: string;
}

type AvatarRect = [number, number, number, number, string];
export type AvatarSharedSlot = "garment" | "hair" | "accessory";
export type AvatarSharedOverlay = { slot: AvatarSharedSlot; pixels: string };
type EngineCatalogItem = AvatarCatalogItem & { fur?: string[] };
type AvatarEngine = {
  HAIR: EngineCatalogItem[];
  ACC: EngineCatalogItem[];
  FACE: EngineCatalogItem[];
  EXPR: EngineCatalogItem[];
  ANIMAL: EngineCatalogItem[];
  JOB: EngineCatalogItem[];
  GARMENT: EngineCatalogItem[];
  JOB_GROUPS: AvatarCatalogItem[];
  SKIN: string[];
  HAIRC: string[];
  EYEC: string[];
  CLOTH: string[];
  FUR: string[];
  ops: (spec: AvatarSpec) => AvatarRect[];
};
type AvatarRenderer = { render: (ops: AvatarRect[], size: number) => string };

// The two CommonJS files are app-owned copies of the approved generator. Their
// source parity is checked against design/avatar-style-v2 in the avatar tests.
const engine = require("./engine.js") as AvatarEngine;
const renderer = require("./renderer.js") as AvatarRenderer;

const item = ({ id, ko, en, group }: EngineCatalogItem): AvatarCatalogItem =>
  group ? { id, ko, en, group } : { id, ko, en };

export const AVATAR_CATALOG = {
  hair: engine.HAIR.map(item),
  accessory: engine.ACC.map(item),
  face: engine.FACE.map(item),
  expression: engine.EXPR.map(item),
  animal: engine.ANIMAL.map(item),
  job: engine.JOB.map(item),
  garment: engine.GARMENT.map(item),
} as const;

export const AVATAR_JOB_GROUPS = engine.JOB_GROUPS.map(item);

export const AVATAR_COLORS = {
  skin: [...engine.SKIN],
  hair: [...engine.HAIRC],
  eye: [...engine.EYEC],
  cloth: ["#696949", ...engine.CLOTH],
  fur: [...engine.FUR],
} as const;

// The default visible human portrait matches the approved reference. Species
// and fur are stored as well so switching to an animal stays deterministic.
export const DEFAULT_AVATAR_SPEC: AvatarSpec = Object.freeze({
  v: 64,
  seed: "nova",
  type: "human",
  skin: "#c98e5e",
  hairColor: "#2b211b",
  eye: "#3a2a1e",
  cloth: "#696949",
  cloth2: "#d97757",
  fur: "#cbb8d6",
  hair: "sidepart",
  acc: "none",
  face: "glasses",
  expr: "smile",
  species: "raccoon",
  job: null,
  garmentId: null,
  wearUniform: true,
});

const ids = {
  hair: new Set(AVATAR_CATALOG.hair.map((value) => value.id)),
  acc: new Set(AVATAR_CATALOG.accessory.map((value) => value.id)),
  face: new Set(AVATAR_CATALOG.face.map((value) => value.id)),
  expr: new Set(AVATAR_CATALOG.expression.map((value) => value.id)),
  species: new Set(AVATAR_CATALOG.animal.map((value) => value.id)),
  job: new Set(AVATAR_CATALOG.job.map((value) => value.id)),
  garmentId: new Set(AVATAR_CATALOG.garment.map((value) => value.id)),
};

function allowed(value: unknown, choices: ReadonlySet<string>, fallback: string): string {
  return typeof value === "string" && choices.has(value) ? value : fallback;
}

function allowedColor(value: unknown, choices: readonly string[], fallback: string): string {
  return typeof value === "string" && choices.includes(value.toLowerCase())
    ? value.toLowerCase()
    : fallback;
}

/**
 * Persist only known catalog choices. The approved generator accepts arbitrary
 * hex strings for its standalone prototype, but untrusted saved JSON must not
 * introduce unlimited palette values or malformed rectangles in the app.
 */
export function resolveAvatarSpec(raw: unknown): AvatarSpec {
  const value = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
  const fallback = DEFAULT_AVATAR_SPEC;
  const seed = typeof value.seed === "string" &&
      value.seed.length > 0 && value.seed.length <= 100 &&
      !/[\x00-\x1f\x7f]/.test(value.seed)
    ? value.seed
    : fallback.seed;
  const type = value.type === "animal" ? "animal" : "human";
  const species = allowed(value.species, ids.species, fallback.species);
  const animal = engine.ANIMAL.find((candidate) => candidate.id === species);
  const speciesFur = animal?.fur ?? AVATAR_COLORS.fur;
  const defaultFur = speciesFur.includes(fallback.fur) ? fallback.fur : speciesFur[0];
  const job = value.job === null
    ? null
    : allowed(value.job, ids.job, fallback.job ?? "") || null;
  const garmentId = value.garmentId === null
    ? null
    : allowed(value.garmentId, ids.garmentId, fallback.garmentId ?? "") || null;
  const rawShared = value.sharedAssets && typeof value.sharedAssets === "object" &&
      !Array.isArray(value.sharedAssets)
    ? value.sharedAssets as Record<string, unknown>
    : {};
  const sharedAssets: NonNullable<AvatarSpec["sharedAssets"]> = {};
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  for (const slot of ["garment", "hair", "accessory"] as const) {
    const id = rawShared[slot];
    if (typeof id === "string" && uuid.test(id)) sharedAssets[slot] = id.toLowerCase();
  }

  return {
    v: 64,
    seed,
    type,
    skin: allowedColor(value.skin, AVATAR_COLORS.skin, fallback.skin),
    hairColor: allowedColor(value.hairColor, AVATAR_COLORS.hair, fallback.hairColor),
    eye: allowedColor(value.eye, AVATAR_COLORS.eye, fallback.eye),
    cloth: allowedColor(value.cloth, AVATAR_COLORS.cloth, fallback.cloth),
    cloth2: allowedColor(value.cloth2, AVATAR_COLORS.cloth, fallback.cloth2),
    fur: allowedColor(value.fur, speciesFur, defaultFur),
    hair: allowed(value.hair, ids.hair, fallback.hair),
    acc: allowed(value.acc, ids.acc, fallback.acc),
    face: allowed(value.face, ids.face, fallback.face),
    expr: allowed(value.expr, ids.expr, fallback.expr),
    species,
    job,
    garmentId,
    wearUniform: typeof value.wearUniform === "boolean"
      ? value.wearUniform
      : fallback.wearUniform,
    ...(Object.keys(sharedAssets).length > 0 ? { sharedAssets } : {}),
  };
}

export function getAnimalFurColors(species: string): readonly string[] {
  return engine.ANIMAL.find((animal) => animal.id === species)?.fur ?? AVATAR_COLORS.fur;
}

export function isAvatarAccessoryOccluded(spec: AvatarSpec): boolean {
  const clean = resolveAvatarSpec(spec);
  if (clean.acc === "none") return false;
  return JSON.stringify(engine.ops(clean)) ===
    JSON.stringify(engine.ops({ ...clean, acc: "none" }));
}

export function renderAvatarSvg(
  spec: AvatarSpec,
  size: number,
  overlays: readonly AvatarSharedOverlay[] = [],
): string {
  const svg = renderer.render(engine.ops(resolveAvatarSpec(spec)), size);
  // SvgXml does not need browser-only style/ARIA attributes. All rect positions
  // and colors remain exactly those of the approved SVG renderer.
  const clean = svg.replace(/ style="[^"]*"/, "").replace(/ aria-hidden="true"/, "");
  if (overlays.length === 0) return clean;
  // Draw approved shared art on the same logical grid. A palette-only pixel
  // payload cannot inject SVG nodes or change the 1-cell edge geometry.
  const layers = (["garment", "hair", "accessory"] as const)
    .flatMap((slot) => overlays.filter((overlay) => overlay.slot === slot))
    .filter((overlay) => isAvatarSharePixels(overlay.pixels))
    .flatMap((overlay) => pixelsToRects(overlay.pixels))
    .map(([x, y, width, height, color]) =>
      `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${color}"/>`)
    .join("");
  return clean.replace("</svg>", `${layers}</svg>`);
}

// Keep the type imported so callers can pass thumbnails directly to expo-image.
export type AvatarThumbnail = ImageSourcePropType;
