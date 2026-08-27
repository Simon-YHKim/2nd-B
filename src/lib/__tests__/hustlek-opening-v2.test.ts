import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import React from "react";
import ts from "typescript";

const { renderToStaticMarkup } = require("react-dom/server") as {
  renderToStaticMarkup: (element: React.ReactNode) => string;
};

const { PNG } = require("pngjs") as {
  PNG: { sync: { read: (bytes: Buffer) => { width: number; height: number; data: Buffer } } };
};

const ROOT = path.resolve(__dirname, "../../..");
const SOURCE = path.join(ROOT, "design/hustlek-opening-v1/hustlek-opening-atlas.png");
const ATLAS = path.join(ROOT, "assets/deepspace/hustlek-opening-v2.json");
const BUILDER = path.join(ROOT, "scripts/build-hustlek-opening-v2.py");
const LOADING_SCREEN = path.join(ROOT, "src/components/ui/LoadingScreen.tsx");

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

type OpeningPlan = {
  frame: number;
  phase: "story" | "waiting-ready" | "ready" | "exiting" | "done";
  shouldContinue: boolean;
};

type ScenePlan = {
  character: { kind: "walk" | "key"; index: number; centerX: number } | null;
  cameraTop: number;
  polarisSize: number;
  veilHeight: number;
};

type LoadingModule = {
  openingStateAt?: (input: {
    elapsedMs: number;
    readyAtMs: number | null;
    tapAtMs: number | null;
    reducedMotion: boolean;
  }) => OpeningPlan;
  openingSceneForFrame?: (frame: number) => ScenePlan;
  pixelUnitScale?: (pixelRatio: number) => number;
  createOpeningTicker?: (startedAtMs: number, onTick: (elapsedMs: number) => void) => () => void;
  deliverContinueOnce?: (gate: { current: boolean }, onContinue?: () => void) => void;
  RleCell?: React.ComponentType<{ rects: RectRun[]; width: number; height: number }>;
  LoadingScreen?: React.ComponentType<{ ready?: boolean; onContinue?: () => void }>;
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

function host(tag: string): React.ComponentType<Record<string, unknown>> {
  return function Host({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) {
    return React.createElement(tag, props, children);
  };
}

function loadLoadingModule(platform: "ios" | "web" = "ios"): LoadingModule {
  const source = readFileSync(LOADING_SCREEN, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  const loaded: { exports: LoadingModule } = { exports: {} };
  const customRequire = (id: string): unknown => {
    if (id === "react" || id === "react/jsx-runtime") return require(id);
    if (id === "react-native") {
      return {
        Pressable: host("pressable"),
        Text: host("text"),
        View: host("view"),
        Platform: { OS: platform },
        PixelRatio: { get: () => (platform === "web" ? 3 : 2.625) },
        StyleSheet: { create: <T,>(styles: T) => styles },
      };
    }
    if (id === "react-native-svg") return { Svg: host("svg"), Rect: host("rect") };
    if (id === "react-i18next") return { useTranslation: () => ({ t: (key: string) => key }) };
    if (id === "@/lib/motion/use-reduced-motion") return { useReducedMotionPref: () => false };
    if (id === "@/lib/theme/tokens") {
      return {
        deepSpace: {
          accentDim: "accentDim",
          accentGlow: "accentGlow",
          bgEdge: "bgEdge",
          bgGlow: "bgGlow",
          bgMid: "bgMid",
          soul: "soul",
          soulDeep: "soulDeep",
          textHi: "textHi",
        },
        typography: { sizes: { xs: 12 } },
      };
    }
    if (id === "@/theme/typography") return { fontFamilies: { pixelKo: "Galmuri11" } };
    if (id.endsWith("hustlek-opening-v2.json")) return readAtlas();
    throw new Error(`Unexpected LoadingScreen dependency in contract test: ${id}`);
  };
  new Function("require", "module", "exports", output)(customRequire, loaded, loaded.exports);
  return loaded.exports;
}

function stateAt(
  elapsedMs: number,
  {
    readyAtMs = 0,
    tapAtMs = null,
    reducedMotion = false,
  }: { readyAtMs?: number | null; tapAtMs?: number | null; reducedMotion?: boolean } = {},
): OpeningPlan {
  const module = loadLoadingModule();
  if (!module.openingStateAt) throw new Error("LoadingScreen must export openingStateAt");
  return module.openingStateAt({ elapsedMs, readyAtMs, tapAtMs, reducedMotion });
}

describe("HustleK opening v2 deterministic rect atlas", () => {
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

describe("HustleK opening v2 integer renderer", () => {
  test.each([1, 2, 2.625, 3])("DPR %s maps one source unit to integer physical pixels", (dpr) => {
    const module = loadLoadingModule();
    if (!module.pixelUnitScale) throw new Error("LoadingScreen must export pixelUnitScale");
    const physicalPixels = module.pixelUnitScale(dpr) * dpr;
    expect(physicalPixels).toBeGreaterThanOrEqual(1);
    expect(Number.isInteger(physicalPixels)).toBe(true);
  });

  test.each(["ios", "web"] as const)("%s renders SVG rects and never a bitmap image", (platform) => {
    const module = loadLoadingModule(platform);
    const atlas = readAtlas();
    if (!module.RleCell || !module.LoadingScreen) throw new Error("rect renderer exports missing");
    const cellMarkup = renderToStaticMarkup(
      React.createElement(module.RleCell, { rects: atlas.w[0], width: 96, height: 96 }),
    );
    const screenMarkup = renderToStaticMarkup(React.createElement(module.LoadingScreen, { ready: true }));
    expect(cellMarkup).toContain("<svg");
    expect(cellMarkup).toContain("<rect");
    expect(cellMarkup).not.toContain("<img");
    expect(screenMarkup).not.toContain("<img");
    if (platform === "web") expect(cellMarkup).toContain('shape-rendering="crispEdges"');
    else expect(cellMarkup).not.toContain("shape-rendering");
    expect(readFileSync(LOADING_SCREEN, "utf8")).not.toMatch(/expo-image|<Image\b|\.png["']/i);
  });
});

describe("HustleK opening v2 readiness runtime", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(1_000));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("ticker advances on the 80ms grid and cleanup removes its interval", () => {
    const module = loadLoadingModule();
    if (!module.createOpeningTicker) throw new Error("LoadingScreen must export createOpeningTicker");
    const onTick = jest.fn();
    const cleanup = module.createOpeningTicker(Date.now(), onTick);
    expect(jest.getTimerCount()).toBe(1);
    jest.advanceTimersByTime(240);
    expect(onTick.mock.calls.map(([elapsed]) => elapsed)).toEqual([80, 160, 240]);
    cleanup();
    expect(jest.getTimerCount()).toBe(0);
    jest.advanceTimersByTime(240);
    expect(onTick).toHaveBeenCalledTimes(3);
  });

  test("exactly-once gate protects onContinue from tap/auto races", () => {
    const module = loadLoadingModule();
    if (!module.deliverContinueOnce) throw new Error("LoadingScreen must export deliverContinueOnce");
    const gate = { current: false };
    const onContinue = jest.fn();
    module.deliverContinueOnce(gate, onContinue);
    module.deliverContinueOnce(gate, onContinue);
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(gate.current).toBe(true);
  });

  test("hard-ready at 9s survives an early tap and then exits exactly once", () => {
    expect(stateAt(8_999, { readyAtMs: null, tapAtMs: 500 })).toMatchObject({
      frame: 44,
      phase: "waiting-ready",
      shouldContinue: false,
    });
    expect(stateAt(9_000, { readyAtMs: null, tapAtMs: 500 })).toMatchObject({ frame: 45, phase: "exiting" });
    expect(stateAt(9_239, { readyAtMs: null, tapAtMs: 500 }).shouldContinue).toBe(false);
    expect(stateAt(9_240, { readyAtMs: null, tapAtMs: 500 })).toMatchObject({
      phase: "done",
      shouldContinue: true,
    });
  });

  test("fast/late readiness, tap, auto and reduced-motion preserve the story contract", () => {
    expect(stateAt(2_000, { tapAtMs: 500 })).toMatchObject({ phase: "story", shouldContinue: false });
    expect(stateAt(3_600, { tapAtMs: 500 })).toMatchObject({ frame: 45, phase: "exiting" });
    expect(stateAt(3_840, { tapAtMs: 500 })).toMatchObject({ phase: "done", shouldContinue: true });
    expect(stateAt(4_999, { readyAtMs: 5_000 })).toMatchObject({ phase: "waiting-ready", frame: 44 });
    expect(stateAt(5_000, { readyAtMs: 5_000 })).toMatchObject({ phase: "exiting", frame: 45 });
    expect(stateAt(3_760)).toMatchObject({ phase: "exiting", frame: 45 });
    expect(stateAt(4_000)).toMatchObject({ phase: "done", shouldContinue: true });
    expect(stateAt(0, { reducedMotion: true })).toMatchObject({ frame: 44, phase: "ready" });
    expect(stateAt(1_000, { reducedMotion: true, tapAtMs: 1_000 })).toMatchObject({
      frame: 44,
      phase: "done",
      shouldContinue: true,
    });
  });

  test("all 48 frames preserve establish, walk, turn, hold, pan, Polaris, and exit beats", () => {
    const module = loadLoadingModule();
    if (!module.openingSceneForFrame) throw new Error("LoadingScreen must export openingSceneForFrame");
    const scenes = Array.from({ length: 48 }, (_, frame) => module.openingSceneForFrame?.(frame));
    expect(scenes.slice(0, 4).every((scene) => scene?.character === null)).toBe(true);
    expect(scenes.slice(4, 18).map((scene) => scene?.character?.kind)).toEqual(
      Array.from({ length: 14 }, () => "walk"),
    );
    expect(scenes.slice(4, 18).map((scene) => scene?.character?.index)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 1,
    ]);
    expect(scenes.slice(18, 26).map((scene) => scene?.character?.index)).toEqual([
      0, 1, 1, 2, 2, 3, 4, 5,
    ]);
    expect(scenes.slice(26, 32).every((scene) => scene?.character?.index === 5)).toBe(true);
    expect(scenes.slice(32, 40).map((scene) => scene?.cameraTop)).toEqual([
      -64, -48, -28, -4, 24, 48, 72, 96,
    ]);
    expect(scenes.slice(40, 45).map((scene) => scene?.polarisSize)).toEqual([12, 16, 20, 16, 12]);
    expect(scenes.slice(45, 48).map((scene) => scene?.veilHeight)).toEqual([86, 174, 260]);
    for (const scene of scenes) {
      expect(scene).toBeDefined();
      expect(Number.isInteger(scene?.cameraTop)).toBe(true);
      expect(Number.isInteger(scene?.polarisSize)).toBe(true);
      expect(Number.isInteger(scene?.veilHeight)).toBe(true);
      if (scene?.character) {
        expect(Number.isInteger(scene.character.index)).toBe(true);
        expect(Number.isInteger(scene.character.centerX)).toBe(true);
      }
    }
  });
});
