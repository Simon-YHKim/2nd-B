// App launcher / web icons, rasterised from the Polaris star the app already draws.
//
// WHY THIS FILE EXISTS. Simon asked on 2026-09-30 for the app icon to be the purple
// Polaris pixel star instead of the SecondB robot head. That star is already defined
// in code: `SignInPolaris` (src/screens/deepspace/dds-sign-in-screen.tsx) stacks
// three `pixelStarRects` layers in a 112x112 viewBox centred at (56,56):
//   r=44 m3.accent.polarisEdge, r=28 m3.accent.polaris, r=10 m3.accent.skyStarWhite
// (`LoadingPolaris` uses the same three layers). The icons are derived copies of that
// star, so they are generated here from the same geometry
// (src/components/pixel/pixel-star.ts) and the same colours (src/lib/theme/m3.ts).
// Do not hand-edit the PNGs: change the source and rerun this.
// scripts/__tests__/build-app-icons.test.ts fails when the committed PNGs drift
// from what this script renders.
//
// Run from the repo root:  npx tsx scripts/build-app-icons.ts
//
// PIXELS. Integer rects times an integer scale, binary alpha, no smoothing: every
// output pixel is one of the three star colours or the background. The 64 px
// favicon cannot hold the 88-unit star at any integer scale (88 > 64), so it and
// the 192 px web icon call pixelStarRects at half radii (22/14/5), which is how the
// app itself draws a smaller star. PNG encoding uses node:zlib only, so there is no
// image dependency (blueprint section 5 promises $0/mo).
//
// splash-icon.png is deliberately NOT generated here (splash is a separate decision).

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync, inflateSync } from "node:zlib";

import { pixelStarRects } from "../src/components/pixel/pixel-star";
import { m3Accent } from "../src/lib/theme/m3";

const ROOT = join(__dirname, "..");

type Rgb = readonly [number, number, number];

/** Bottom to top, exactly as SignInPolaris stacks them (`m3.accent.<token>`). */
export const POLARIS_LAYERS = [
  { radius: 44, token: "polarisEdge" },
  { radius: 28, token: "polaris" },
  { radius: 10, token: "skyStarWhite" },
] as const satisfies readonly { radius: number; token: keyof typeof m3Accent }[];

/**
 * Android adaptive icons are 108dp; launchers may crop everything outside the
 * centre 66dp circle, so the whole foreground must sit inside it.
 */
export const ADAPTIVE_SAFE_RADIUS_FRACTION = 66 / 108 / 2;

type Fill =
  | { kind: "opaque"; background: Rgb } // RGB PNG, no alpha (App Store rejects alpha)
  | { kind: "transparent" } // RGBA PNG, star colours
  | { kind: "silhouette" }; // RGBA PNG, white union of all layers

export type IconSpec = {
  /** Repo-relative output path. */
  path: string;
  size: number;
  /** Integer px per star unit. */
  scale: number;
  /** 1 = the exact SignInPolaris radii, 2 = half radii for the small icons. */
  radiusDivisor: 1 | 2;
  fill: Fill;
  /** Assert the star stays inside the adaptive-icon safe circle. */
  adaptiveSafeZone?: boolean;
};

function hexToRgb(hex: string): Rgb {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`not a #rrggbb colour: ${hex}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** The icon background is the adaptive-icon background colour app.json already declares. */
export function appIconBackground(): Rgb {
  const app = JSON.parse(readFileSync(join(ROOT, "app.json"), "utf8"));
  return hexToRgb(app.expo.android.adaptiveIcon.backgroundColor);
}

export function iconSpecs(): IconSpec[] {
  const background = appIconBackground();
  const opaque: Fill = { kind: "opaque", background };
  return [
    // 704 px star in 1024 (69%): large, with breathing room inside the iOS mask.
    { path: "assets/images/icon.png", size: 1024, scale: 8, radiusDivisor: 1, fill: opaque },
    // 528 px star: tips 264 px from centre, inside the 313 px safe circle.
    {
      path: "assets/images/android-icon-foreground.png",
      size: 1024,
      scale: 6,
      radiusDivisor: 1,
      fill: { kind: "transparent" },
      adaptiveSafeZone: true,
    },
    {
      path: "assets/images/android-icon-monochrome.png",
      size: 1024,
      scale: 6,
      radiusDivisor: 1,
      fill: { kind: "silhouette" },
      adaptiveSafeZone: true,
    },
    // manifest.webmanifest declares no `purpose`, so these are "any" icons:
    // the same opaque square as icon.png, at the same 69% fill.
    { path: "public/icons/icon-512.png", size: 512, scale: 4, radiusDivisor: 1, fill: opaque },
    { path: "public/icons/icon-192.png", size: 192, scale: 3, radiusDivisor: 2, fill: opaque },
    { path: "assets/images/favicon.png", size: 64, scale: 1, radiusDivisor: 2, fill: opaque },
  ];
}

export type RenderedIcon = { spec: IconSpec; rgba: Buffer };

/** Rasterise one icon into an RGBA buffer (size * size * 4). */
export function renderIcon(spec: IconSpec): RenderedIcon {
  const { size, scale, radiusDivisor, fill } = spec;
  if (!Number.isInteger(scale) || scale < 1) throw new Error(`${spec.path}: scale must be a positive integer`);
  if (size % 2 !== 0) throw new Error(`${spec.path}: size must be even so the star centre is a pixel edge`);

  const rgba = Buffer.alloc(size * size * 4);
  if (fill.kind === "opaque") {
    for (let i = 0; i < size * size; i++) {
      rgba[i * 4] = fill.background[0];
      rgba[i * 4 + 1] = fill.background[1];
      rgba[i * 4 + 2] = fill.background[2];
      rgba[i * 4 + 3] = 255;
    }
  }

  // Star centre sits on a pixel edge, like (56,56) in the 112 viewBox.
  const centre = size / 2;
  const safeRadius = size * ADAPTIVE_SAFE_RADIUS_FRACTION;
  for (const layer of POLARIS_LAYERS) {
    const rgb: Rgb = fill.kind === "silhouette" ? [255, 255, 255] : hexToRgb(m3Accent[layer.token]);
    for (const rect of pixelStarRects(layer.radius / radiusDivisor)) {
      const x0 = centre + rect.x * scale;
      const y0 = centre + rect.y * scale;
      const x1 = x0 + rect.w * scale;
      const y1 = y0 + rect.h * scale;
      if (x0 < 0 || y0 < 0 || x1 > size || y1 > size) {
        throw new Error(`${spec.path}: star does not fit in ${size}px at scale ${scale}`);
      }
      if (spec.adaptiveSafeZone) {
        // Farthest corner of the rect from the centre.
        const dx = Math.max(Math.abs(x0 - centre), Math.abs(x1 - centre));
        const dy = Math.max(Math.abs(y0 - centre), Math.abs(y1 - centre));
        if (Math.hypot(dx, dy) > safeRadius) {
          throw new Error(`${spec.path}: star leaves the adaptive safe zone (${Math.hypot(dx, dy)} > ${safeRadius})`);
        }
      }
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const o = (y * size + x) * 4;
          rgba[o] = rgb[0];
          rgba[o + 1] = rgb[1];
          rgba[o + 2] = rgb[2];
          rgba[o + 3] = 255;
        }
      }
    }
  }
  return { spec, rgba };
}

// ---------------------------------------------------------------------------
// Minimal PNG codec (8-bit RGB / RGBA, non-interlaced). node:zlib does the deflate.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export function encodePng(size: number, rgba: Buffer, withAlpha: boolean): Buffer {
  const channels = withAlpha ? 4 : 3;
  const stride = size * channels;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const src = (y * size + x) * 4;
      const dst = y * (stride + 1) + 1 + x * channels;
      for (let c = 0; c < channels; c++) raw[dst + c] = rgba[src + c];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = withAlpha ? 6 : 2; // colour type RGBA / RGB
  // compression, filter, interlace = 0
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Decode an 8-bit RGB/RGBA non-interlaced PNG to RGBA. Used by the drift test. */
export function decodePng(png: Buffer): { width: number; height: number; hasAlpha: boolean; rgba: Buffer } {
  if (!png.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error("not a PNG");
  let off = 8;
  let width = 0;
  let height = 0;
  let colourType = -1;
  const idat: Buffer[] = [];
  while (off < png.length) {
    const len = png.readUInt32BE(off);
    const type = png.toString("ascii", off + 4, off + 8);
    const data = png.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colourType = data[9];
      if (data[8] !== 8 || (colourType !== 2 && colourType !== 6) || data[12] !== 0) {
        throw new Error("only 8-bit non-interlaced RGB/RGBA is supported");
      }
    } else if (type === "IDAT") {
      idat.push(data);
    }
    off += 12 + len;
  }
  const bpp = colourType === 6 ? 4 : 3;
  const stride = width * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let i = 0; i < stride; i++) {
      const v = raw[y * (stride + 1) + 1 + i];
      const a = i >= bpp ? px[y * stride + i - bpp] : 0;
      const b = y > 0 ? px[(y - 1) * stride + i] : 0;
      const c = i >= bpp && y > 0 ? px[(y - 1) * stride + i - bpp] : 0;
      let pred = 0;
      if (filter === 1) pred = a;
      else if (filter === 2) pred = b;
      else if (filter === 3) pred = (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) throw new Error(`bad PNG filter ${filter}`);
      px[y * stride + i] = (v + pred) & 255;
    }
  }
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    for (let c = 0; c < 3; c++) rgba[i * 4 + c] = px[i * bpp + c];
    rgba[i * 4 + 3] = bpp === 4 ? px[i * bpp + 3] : 255;
  }
  return { width, height, hasAlpha: bpp === 4, rgba };
}

function main(): void {
  for (const spec of iconSpecs()) {
    const { rgba } = renderIcon(spec);
    const png = encodePng(spec.size, rgba, spec.fill.kind !== "opaque");
    writeFileSync(join(ROOT, spec.path), png);
    console.log(`${spec.path}  ${spec.size}x${spec.size}  ${png.length} B`);
  }
}

if (require.main === module) main();
