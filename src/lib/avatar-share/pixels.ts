/**
 * Avatar Share's versioned, deliberately small pixel contract. A submitted
 * asset is a 64 × 64 transparent layer, never executable SVG or an image URL.
 * Index characters 0-9A-F address this exact palette; changing it requires a
 * new palette version so previously approved work keeps its colours.
 */
export const AVATAR_SHARE_PALETTE_VERSION = 1 as const;
export const AVATAR_SHARE_PALETTE = [
  "#2b211b", "#5c4a3f", "#c98e5e", "#f7dcc0",
  "#f7f2e8", "#696949", "#7d9463", "#d97757",
  "#4d7a8c", "#e0a63c", "#bf4a44", "#8f6fb5",
  "#3f8fbf", "#e278a1", "#a8917d", "#4a4a52",
] as const;

export const AVATAR_SHARE_SLOTS = ["hair", "accessory", "garment"] as const;
export type AvatarShareSlot = typeof AVATAR_SHARE_SLOTS[number];
export type AvatarShareRect = [x: number, y: number, width: number, height: number, color: string];

export const AVATAR_SHARE_GRID = 64;
export const AVATAR_SHARE_MAX_OPAQUE_PIXELS = 1024;
export const EMPTY_PIXELS = ".".repeat(AVATAR_SHARE_GRID * AVATAR_SHARE_GRID);
const INDEX_CHARS = "0123456789ABCDEF";
const PIXEL_PATTERN = /^[.0-9A-F]{4096}$/;

export function isAvatarShareSlot(value: unknown): value is AvatarShareSlot {
  return value === "hair" || value === "accessory" || value === "garment";
}

export function countOpaquePixels(pixels: string): number {
  let count = 0;
  for (let i = 0; i < pixels.length; i++) if (pixels[i] !== ".") count++;
  return count;
}

/** Empty layers are valid while drawing; submission requires at least one cell. */
export function isAvatarSharePixels(value: unknown): value is string {
  return typeof value === "string" && PIXEL_PATTERN.test(value) &&
    countOpaquePixels(value) <= AVATAR_SHARE_MAX_OPAQUE_PIXELS;
}

export function setPixel(pixels: string, x: number, y: number, paletteIndex: number | null): string {
  if (!isAvatarSharePixels(pixels)) throw new TypeError("Invalid Avatar Share pixels");
  if (!Number.isInteger(x) || x < 0 || x >= AVATAR_SHARE_GRID ||
      !Number.isInteger(y) || y < 0 || y >= AVATAR_SHARE_GRID) {
    throw new RangeError("Pixel position must fit the 64 × 64 grid");
  }
  if (paletteIndex !== null &&
      (!Number.isInteger(paletteIndex) || paletteIndex < 0 || paletteIndex >= AVATAR_SHARE_PALETTE.length)) {
    throw new RangeError("Palette index must be between 0 and 15");
  }
  const at = y * AVATAR_SHARE_GRID + x;
  const next = paletteIndex === null ? "." : INDEX_CHARS[paletteIndex];
  if (pixels[at] === next) return pixels;
  if (pixels[at] === "." && next !== "." &&
      countOpaquePixels(pixels) >= AVATAR_SHARE_MAX_OPAQUE_PIXELS) {
    throw new RangeError("Avatar Share layers can paint at most 1024 cells");
  }
  return pixels.slice(0, at) + next + pixels.slice(at + 1);
}

/** Row runs remain integer rects on the approved renderer's 64-cell grid. */
export function pixelsToRects(pixels: string): AvatarShareRect[] {
  if (!isAvatarSharePixels(pixels)) throw new TypeError("Invalid Avatar Share pixels");
  const rects: AvatarShareRect[] = [];
  for (let y = 0; y < AVATAR_SHARE_GRID; y++) {
    for (let x = 0; x < AVATAR_SHARE_GRID;) {
      const ink = pixels[y * AVATAR_SHARE_GRID + x];
      if (ink === ".") { x++; continue; }
      let end = x + 1;
      while (end < AVATAR_SHARE_GRID && pixels[y * AVATAR_SHARE_GRID + end] === ink) end++;
      rects.push([x, y, end - x, 1, AVATAR_SHARE_PALETTE[INDEX_CHARS.indexOf(ink)]]);
      x = end;
    }
  }
  return rects;
}
