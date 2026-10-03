import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const { PNG } = require("pngjs") as {
  PNG: { sync: { read: (bytes: Buffer) => { width: number; height: number; data: Buffer } } };
};

const ROOT = path.resolve(__dirname, "../../..");
const SOURCE = path.join(ROOT, "design/hustlek-opening-v1/hustlek-opening-atlas.png");
const ATLAS = path.join(ROOT, "assets/deepspace/hustlek-opening-v2.json");
const BUILDER = path.join(ROOT, "scripts/build-hustlek-opening-v2.py");

const SOURCE_FILE_SHA256 = "2780df89aa6f1d472ec82a03610a6d7e81a20dbf9e767103cd198233e44213be";
const SOURCE_RGBA_SHA256 = "b077a2d1a4c77c320e92a18b92a722f4a2905340e7b1ba27c47d6a0cf2c8cc49";
const PALETTE = [
  "#fdfbef",
  "#fbe5bb",
  "#fad69e",
  "#e9c185",
  "#ce9a55",
  "#bc733e",
  "#7d743a",
  "#645e35",
  "#5a4f2d",
  "#653d24",
  "#433e2a",
  "#332a20",
  "#252417",
  "#181611",
  "#100a09",
  "#040303",
] as const;

type RectRun = [palette: number, x: number, y: number, width: number, height: number];
type RleAtlas = {
  v: 2;
  u: 1;
  q: 4;
  p: string[];
  s: {
    png: string;
    rgba: string;
    alpha: "nonzero-to-opaque";
    color: "nearest-source-band-rgb-squared";
    rect: "horizontal-rle-vertical-merge";
  };
  w: RectRun[][];
  k: RectRun[][];
  t: RectRun[];
};

function sha256(bytes: Buffer | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function readAtlas(): RleAtlas {
  return JSON.parse(readFileSync(ATLAS, "utf8")) as RleAtlas;
}

function hexRgb(value: string): [number, number, number] {
  return [1, 3, 5].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16)) as [number, number, number];
}

function reconstruct(rects: RectRun[], width: number, height: number, palette: string[]): Uint8Array {
  const rgba = new Uint8Array(width * height * 4);
  const occupied = new Uint8Array(width * height);
  for (const rect of rects) {
    expect(rect).toHaveLength(5);
    expect(rect.every(Number.isInteger)).toBe(true);
    const [band, x, y, rectWidth, rectHeight] = rect;
    expect(band).toBeGreaterThanOrEqual(0);
    expect(band).toBeLessThan(palette.length);
    expect(x).toBeGreaterThanOrEqual(0);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(rectWidth).toBeGreaterThan(0);
    expect(rectHeight).toBeGreaterThan(0);
    expect(x + rectWidth).toBeLessThanOrEqual(width);
    expect(y + rectHeight).toBeLessThanOrEqual(height);
    const [red, green, blue] = hexRgb(palette[band]);
    for (let row = y; row < y + rectHeight; row += 1) {
      for (let column = x; column < x + rectWidth; column += 1) {
        const pixel = row * width + column;
        expect(occupied[pixel]).toBe(0);
        occupied[pixel] = 1;
        rgba[pixel * 4] = red;
        rgba[pixel * 4 + 1] = green;
        rgba[pixel * 4 + 2] = blue;
        rgba[pixel * 4 + 3] = 255;
      }
    }
  }
  return rgba;
}

function sourceCrop(
  source: { width: number; data: Buffer },
  left: number,
  top: number,
  width: number,
  height: number,
): Uint8Array {
  const result = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceOffset = ((top + y) * source.width + left + x) * 4;
      result.set(source.data.subarray(sourceOffset, sourceOffset + 4), (y * width + x) * 4);
    }
  }
  return result;
}

function nearestBand(red: number, green: number, blue: number): number {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  PALETTE.forEach((hex, index) => {
    const [candidateRed, candidateGreen, candidateBlue] = hexRgb(hex);
    const distance =
      (red - candidateRed) ** 2 + (green - candidateGreen) ** 2 + (blue - candidateBlue) ** 2;
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}

function expectLineagePreserved(source: Uint8Array, rendered: Uint8Array): void {
  expect(rendered).toHaveLength(source.length);
  let sourceFloor = -1;
  let renderedFloor = -1;
  const width = source.length === 128 * 128 * 4 ? 128 : 96;
  const height = width;
  for (let offset = 0; offset < source.length; offset += 4) {
    const sourceVisible = source[offset + 3] > 0;
    const renderedVisible = rendered[offset + 3] > 0;
    expect(renderedVisible).toBe(sourceVisible);
    expect([0, 255]).toContain(rendered[offset + 3]);
    if (!sourceVisible) continue;
    sourceFloor = Math.max(sourceFloor, Math.floor(offset / 4 / width));
    renderedFloor = Math.max(renderedFloor, Math.floor(offset / 4 / width));
  }

  for (let blockY = 0; blockY < height; blockY += 4) {
    for (let blockX = 0; blockX < width; blockX += 4) {
      let red = 0;
      let green = 0;
      let blue = 0;
      let count = 0;
      for (let y = blockY; y < Math.min(blockY + 4, height); y += 1) {
        for (let x = blockX; x < Math.min(blockX + 4, width); x += 1) {
          const offset = (y * width + x) * 4;
          if (source[offset + 3] === 0) continue;
          red += source[offset];
          green += source[offset + 1];
          blue += source[offset + 2];
          count += 1;
        }
      }
      if (count === 0) continue;
      const expected = hexRgb(PALETTE[nearestBand(red / count, green / count, blue / count)]);
      for (let y = blockY; y < Math.min(blockY + 4, height); y += 1) {
        for (let x = blockX; x < Math.min(blockX + 4, width); x += 1) {
          const offset = (y * width + x) * 4;
          if (source[offset + 3] === 0) continue;
          expect(Array.from(rendered.slice(offset, offset + 3))).toEqual(expected);
        }
      }
    }
  }
  expect(renderedFloor).toBe(sourceFloor);
}

describe("HustleK opening v2 historical rect atlas lineage", () => {
  test("builder --check returns PASS for one compact source-derived atlas", () => {
    expect(existsSync(BUILDER)).toBe(true);
    expect(existsSync(ATLAS)).toBe(true);
    const result = spawnSync(process.platform === "win32" ? "uv.exe" : "uv", [
      "run",
      "--with",
      "Pillow==12.2.0",
      BUILDER,
      "--check",
    ], { cwd: ROOT, encoding: "utf8", timeout: 90_000 });
    expect(result.error).toBeUndefined();
    expect(result.signal).toBeNull();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('"status": "PASS"');
  }, 120_000);

  test("locks v1 hashes, palette, deterministic bytes, and 12+6+1 cell contract", () => {
    const sourcePng = readFileSync(SOURCE);
    const source = PNG.sync.read(sourcePng);
    const atlasBytes = readFileSync(ATLAS);
    const atlas = readAtlas();
    expect(sha256(sourcePng)).toBe(SOURCE_FILE_SHA256);
    expect(sha256(source.data)).toBe(SOURCE_RGBA_SHA256);
    expect(atlas).toMatchObject({
      v: 2,
      u: 1,
      q: 4,
      p: [...PALETTE],
      s: {
        png: SOURCE_FILE_SHA256,
        rgba: SOURCE_RGBA_SHA256,
        alpha: "nonzero-to-opaque",
        color: "nearest-source-band-rgb-squared",
        rect: "horizontal-rle-vertical-merge",
      },
    });
    expect(atlas.w).toHaveLength(12);
    expect(atlas.k).toHaveLength(6);
    expect(atlas.t.length).toBeGreaterThan(0);
    expect(atlasBytes.byteLength).toBeLessThan(180_000);
    expect(readFileSync(BUILDER, "utf8")).toContain(sha256(atlasBytes));
  });

  test("reconstruction has binary alpha, approved bands, exact silhouettes and floor anchors", () => {
    const atlas = readAtlas();
    const source = PNG.sync.read(readFileSync(SOURCE));
    atlas.w.forEach((rects, index) => {
      const rowTop = index < 6 ? 360 : 456;
      const sourcePixels = sourceCrop(source, (index % 6) * 96, rowTop, 96, 96);
      expectLineagePreserved(sourcePixels, reconstruct(rects, 96, 96, atlas.p));
    });
    atlas.k.forEach((rects, index) => {
      const sourcePixels = sourceCrop(source, index * 96, 552, 96, 96);
      expectLineagePreserved(sourcePixels, reconstruct(rects, 96, 96, atlas.p));
    });
    expectLineagePreserved(sourceCrop(source, 0, 648, 128, 128), reconstruct(atlas.t, 128, 128, atlas.p));
  });

  test("DPR 3 raster keeps every source unit as a uniform 3x3 block", () => {
    const rects = readAtlas().w[0];
    const width = 96 * 3;
    const raster = new Int16Array(width * width).fill(-1);
    rects.forEach(([band, x, y, rectWidth, rectHeight]) => {
      for (let row = y * 3; row < (y + rectHeight) * 3; row += 1) {
        raster.fill(band, row * width + x * 3, row * width + (x + rectWidth) * 3);
      }
    });
    let nonUniformBlocks = 0;
    for (let y = 0; y < 96; y += 1) {
      for (let x = 0; x < 96; x += 1) {
        const expected = raster[(y * 3) * width + x * 3];
        for (let blockY = 0; blockY < 3; blockY += 1) {
          for (let blockX = 0; blockX < 3; blockX += 1) {
            if (raster[(y * 3 + blockY) * width + x * 3 + blockX] !== expected) nonUniformBlocks += 1;
          }
        }
      }
    }
    expect(nonUniformBlocks).toBe(0);
  });
});
