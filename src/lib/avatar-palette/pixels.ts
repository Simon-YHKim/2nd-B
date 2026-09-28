/**
 * Avatar palette's versioned, deliberately small pixel contract. A drawing
 * is a 64 × 64 transparent layer, never executable SVG or an image URL.
 * Index characters 0-9A-F address this exact palette; changing it requires a
 * new palette version so existing local drafts keep their colours.
 */
export const AVATAR_PALETTE_VERSION = 1 as const;
export const AVATAR_PALETTE = [
  "#2b211b", "#5c4a3f", "#c98e5e", "#f7dcc0",
  "#f7f2e8", "#696949", "#7d9463", "#d97757",
  "#4d7a8c", "#e0a63c", "#bf4a44", "#8f6fb5",
  "#3f8fbf", "#e278a1", "#a8917d", "#4a4a52",
] as const;

export const AVATAR_PALETTE_SLOTS = ["hair", "accessory", "garment"] as const;
export type AvatarPaletteSlot = typeof AVATAR_PALETTE_SLOTS[number];
export type AvatarPaletteRect = [x: number, y: number, width: number, height: number, color: string];

export const AVATAR_PALETTE_GRID = 64;
export const AVATAR_PALETTE_MAX_OPAQUE_PIXELS = 1024;
export const EMPTY_PIXELS = ".".repeat(AVATAR_PALETTE_GRID * AVATAR_PALETTE_GRID);
const INDEX_CHARS = "0123456789ABCDEF";
const PIXEL_PATTERN = /^[.0-9A-F]{4096}$/;

export function isAvatarPaletteSlot(value: unknown): value is AvatarPaletteSlot {
  return value === "hair" || value === "accessory" || value === "garment";
}

export function countOpaquePixels(pixels: string): number {
  let count = 0;
  for (let i = 0; i < pixels.length; i++) if (pixels[i] !== ".") count++;
  return count;
}

/** Empty layers are valid local drafts while drawing. */
export function isAvatarPalettePixels(value: unknown): value is string {
  return typeof value === "string" && PIXEL_PATTERN.test(value) &&
    countOpaquePixels(value) <= AVATAR_PALETTE_MAX_OPAQUE_PIXELS;
}

export function setPixel(pixels: string, x: number, y: number, paletteIndex: number | null): string {
  if (!isAvatarPalettePixels(pixels)) throw new TypeError("Invalid Avatar palette pixels");
  if (!Number.isInteger(x) || x < 0 || x >= AVATAR_PALETTE_GRID ||
      !Number.isInteger(y) || y < 0 || y >= AVATAR_PALETTE_GRID) {
    throw new RangeError("Pixel position must fit the 64 × 64 grid");
  }
  if (paletteIndex !== null &&
      (!Number.isInteger(paletteIndex) || paletteIndex < 0 || paletteIndex >= AVATAR_PALETTE.length)) {
    throw new RangeError("Palette index must be between 0 and 15");
  }
  const at = y * AVATAR_PALETTE_GRID + x;
  const next = paletteIndex === null ? "." : INDEX_CHARS[paletteIndex];
  if (pixels[at] === next) return pixels;
  if (pixels[at] === "." && next !== "." &&
      countOpaquePixels(pixels) >= AVATAR_PALETTE_MAX_OPAQUE_PIXELS) {
    throw new RangeError("Avatar palette layers can paint at most 1024 cells");
  }
  return pixels.slice(0, at) + next + pixels.slice(at + 1);
}

/** Row runs remain integer rects on the approved renderer's 64-cell grid. */
export function pixelsToRects(pixels: string): AvatarPaletteRect[] {
  if (!isAvatarPalettePixels(pixels)) throw new TypeError("Invalid Avatar palette pixels");
  const rects: AvatarPaletteRect[] = [];
  for (let y = 0; y < AVATAR_PALETTE_GRID; y++) {
    for (let x = 0; x < AVATAR_PALETTE_GRID;) {
      const ink = pixels[y * AVATAR_PALETTE_GRID + x];
      if (ink === ".") { x++; continue; }
      let end = x + 1;
      while (end < AVATAR_PALETTE_GRID && pixels[y * AVATAR_PALETTE_GRID + end] === ink) end++;
      rects.push([x, y, end - x, 1, AVATAR_PALETTE[INDEX_CHARS.indexOf(ink)]]);
      x = end;
    }
  }
  return rects;
}
