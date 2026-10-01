import {
  AVATAR_PALETTE_MAX_OPAQUE_PIXELS,
  AVATAR_PALETTE,
  AVATAR_PALETTE_SLOTS,
  EMPTY_PIXELS,
  countOpaquePixels,
  isAvatarPalettePixels,
  pixelsToRects,
  setPixel,
} from "../pixels";

describe("Avatar palette pixel format", () => {
  test("keeps a fixed 64 × 64 transparent grid and three compositing slots", () => {
    expect(EMPTY_PIXELS).toHaveLength(4096);
    expect(isAvatarPalettePixels(EMPTY_PIXELS)).toBe(true);
    expect(AVATAR_PALETTE_SLOTS).toEqual(["hair", "accessory", "garment"]);
    expect(AVATAR_PALETTE).toHaveLength(16);
  });

  test("rejects malformed, lowercase, or oversized untrusted drawings", () => {
    expect(isAvatarPalettePixels(EMPTY_PIXELS.slice(1))).toBe(false);
    expect(isAvatarPalettePixels("g" + EMPTY_PIXELS.slice(1))).toBe(false);
    expect(isAvatarPalettePixels("a" + EMPTY_PIXELS.slice(1))).toBe(false);
    expect(isAvatarPalettePixels("<" + EMPTY_PIXELS.slice(1))).toBe(false);
    expect(isAvatarPalettePixels("0".repeat(AVATAR_PALETTE_MAX_OPAQUE_PIXELS + 1) +
      ".".repeat(4096 - AVATAR_PALETTE_MAX_OPAQUE_PIXELS - 1))).toBe(false);
  });

  test("draws and erases exact cells, and refuses painting beyond the limit", () => {
    let pixels = setPixel(EMPTY_PIXELS, 1, 2, 15);
    expect(pixels[2 * 64 + 1]).toBe("F");
    expect(countOpaquePixels(pixels)).toBe(1);
    pixels = setPixel(pixels, 1, 2, null);
    expect(pixels).toBe(EMPTY_PIXELS);
    expect(() => setPixel(pixels, -1, 0, 1)).toThrow(RangeError);
    expect(() => setPixel(pixels, 0, 64, 1)).toThrow(RangeError);
    expect(() => setPixel(pixels, 0, 0, 16)).toThrow(RangeError);
    const full = "0".repeat(1024) + ".".repeat(3072);
    expect(() => setPixel(full, 0, 16, 0)).toThrow(/1024/);
    expect(setPixel(full, 0, 0, 1)[0]).toBe("1");
  });

  test("turns consecutive cells into approved integer rectangle operations", () => {
    const pixels = setPixel(setPixel(setPixel(EMPTY_PIXELS, 2, 3, 0), 3, 3, 0), 2, 4, 10);
    expect(pixelsToRects(pixels)).toEqual([
      [2, 3, 2, 1, AVATAR_PALETTE[0]],
      [2, 4, 1, 1, AVATAR_PALETTE[10]],
    ]);
    expect(pixelsToRects(EMPTY_PIXELS)).toEqual([]);
  });
});
