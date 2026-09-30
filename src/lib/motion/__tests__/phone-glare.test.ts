// The phone glare (눈부심) schedule and geometry. Render tests are blocked in
// this repo, so the whole promise lives in values: one flash, strongest first,
// stepped decay, never more than one glare per second, integer layers that
// cover the pocket phone's real display and a halo that spreads around it.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ditherCells } from "@/components/pixel/pixel-dither-cells";
import { PIXEL_STEP_MS } from "../pixel-physical";
import {
  markPhoneStowed,
  PHONE_GLARE_FULL,
  PHONE_GLARE_HALO_PROFILE,
  PHONE_GLARE_READAPT_MS,
  PHONE_GLARE_RING_DP,
  PHONE_GLARE_SPREAD,
  PHONE_GLARE_STEPS,
  PHONE_GLARE_TOTAL_MS,
  phoneGlareHaloLevels,
  phoneGlareLayers,
  phoneGlareLevelAt,
  phoneLastStowedAt,
  POCKET_PHONE_ART,
  pocketPhoneScreen,
  shouldPlayPhoneGlare,
} from "../phone-glare";

const everyMs = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const pocketSource = readFileSync(join(process.cwd(), "src/components/deep-space/PocketPhone.tsx"), "utf8");
const pocketFrame = {
  width: Number(pocketSource.match(/POCKET_PHONE_WIDTH = (\d+)/)?.[1]),
  height: Number(pocketSource.match(/POCKET_PHONE_HEIGHT = (\d+)/)?.[1]),
};

describe("schedule", () => {
  test("is blinding for the first 120 ms and never as bright again", () => {
    for (const ms of everyMs(0, 119)) expect(phoneGlareLevelAt(ms)).toBe(PHONE_GLARE_FULL);
    for (const ms of everyMs(120, PHONE_GLARE_TOTAL_MS)) expect(phoneGlareLevelAt(ms)).toBeLessThan(PHONE_GLARE_FULL);
  });

  test("lasts 600-900 ms and ends dark", () => {
    expect(PHONE_GLARE_TOTAL_MS).toBeGreaterThanOrEqual(600);
    expect(PHONE_GLARE_TOTAL_MS).toBeLessThanOrEqual(900);
    expect(phoneGlareLevelAt(PHONE_GLARE_TOTAL_MS - 1)).toBeGreaterThan(0);
    expect(phoneGlareLevelAt(PHONE_GLARE_TOTAL_MS)).toBe(0);
    expect(phoneGlareLevelAt(PHONE_GLARE_TOTAL_MS + 5_000)).toBe(0);
    expect(phoneGlareLevelAt(-1)).toBe(0);
    expect(phoneGlareLevelAt(Number.NaN)).toBe(0);
  });

  test("is exactly one flash (WCAG 2.3.1): luminance rises once, then only falls", () => {
    let rises = 0;
    let falls = 0;
    let previous = phoneGlareLevelAt(-1);
    for (const ms of everyMs(0, PHONE_GLARE_TOTAL_MS + 200)) {
      const level = phoneGlareLevelAt(ms);
      if (level > previous) rises += 1;
      if (level < previous) falls += 1;
      previous = level;
    }
    expect(rises).toBe(1);
    // Stepped, not a single cut: the eyes adjust over several visible steps.
    expect(falls).toBeGreaterThanOrEqual(4);
  });

  test("steps sit on the 40 ms pixel frame and hold longer as the eyes adjust", () => {
    const bounds = [...PHONE_GLARE_STEPS.map((step) => step.atMs), PHONE_GLARE_TOTAL_MS];
    for (const at of bounds) expect(at % PIXEL_STEP_MS).toBe(0);
    const holds = bounds.slice(1).map((at, i) => at - bounds[i]);
    for (let i = 1; i < holds.length; i += 1) expect(holds[i]).toBeGreaterThanOrEqual(holds[i - 1]);
    for (let i = 1; i < PHONE_GLARE_STEPS.length; i += 1) {
      expect(PHONE_GLARE_STEPS[i].level).toBeLessThan(PHONE_GLARE_STEPS[i - 1].level);
    }
  });

  test("the halo is strongest at the phone, thins with distance, and decays with the display", () => {
    expect(phoneGlareHaloLevels(PHONE_GLARE_FULL)).toEqual([...PHONE_GLARE_HALO_PROFILE]);
    for (const { level } of PHONE_GLARE_STEPS) {
      const halo = phoneGlareHaloLevels(level);
      expect(halo).toHaveLength(PHONE_GLARE_HALO_PROFILE.length);
      // Never brighter than the display it comes from.
      for (const ring of halo) expect(ring).toBeLessThan(level);
      // Falls (or stays) with distance: strongest at the frame.
      for (let i = 1; i < halo.length; i += 1) expect(halo[i]).toBeLessThanOrEqual(halo[i - 1]);
    }
    // Strictly thinning outward at full glare, so it reads as spreading light.
    for (let i = 1; i < PHONE_GLARE_HALO_PROFILE.length; i += 1) {
      expect(PHONE_GLARE_HALO_PROFILE[i]).toBeLessThan(PHONE_GLARE_HALO_PROFILE[i - 1]);
    }
    // Every ring only ever dims, step by step, and is gone with the display.
    for (let ring = 0; ring < PHONE_GLARE_HALO_PROFILE.length; ring += 1) {
      let previous = Infinity;
      for (const ms of everyMs(0, PHONE_GLARE_TOTAL_MS)) {
        const lit = phoneGlareHaloLevels(phoneGlareLevelAt(ms))[ring];
        expect(lit).toBeLessThanOrEqual(previous);
        previous = lit;
      }
      expect(previous).toBe(0);
    }
  });

  test("dither levels nest, so nested halo rects paint as the brighter of the two", () => {
    for (let low = 0; low < PHONE_GLARE_FULL; low += 1) {
      const high = new Set(ditherCells(low + 1).map((c) => `${c.x},${c.y}`));
      for (const c of ditherCells(low)) expect(high.has(`${c.x},${c.y}`)).toBe(true);
    }
    expect(ditherCells(PHONE_GLARE_FULL)).toHaveLength(16);
  });
});

describe("when a swipe-up plays it", () => {
  const base = { reducedMotion: false, nowMs: 100_000, lastStowedAtMs: null };

  test("a first swipe-up plays", () => {
    expect(shouldPlayPhoneGlare(base)).toBe(true);
  });

  test("never with reduced motion", () => {
    expect(shouldPlayPhoneGlare({ ...base, reducedMotion: true })).toBe(false);
  });

  test("not again while the eyes are still adjusted to the phone", () => {
    expect(PHONE_GLARE_READAPT_MS).toBeGreaterThan(1_000);
    const stowed = base.nowMs - PHONE_GLARE_READAPT_MS;
    expect(shouldPlayPhoneGlare({ ...base, lastStowedAtMs: stowed + 1 })).toBe(false);
    expect(shouldPlayPhoneGlare({ ...base, lastStowedAtMs: base.nowMs })).toBe(false);
    expect(shouldPlayPhoneGlare({ ...base, lastStowedAtMs: stowed })).toBe(true);
  });

  test("lowering the phone is remembered for the next swipe-up", () => {
    markPhoneStowed(42_000);
    expect(phoneLastStowedAt()).toBe(42_000);
  });
});

describe("pocket phone geometry", () => {
  test("the artwork rect is the one PocketPhone actually draws", () => {
    const m = pocketSource.match(/artwork: \{ position: 'absolute', width: (\d+), height: (\d+), left: (-?\d+), top: (-?\d+) \}/);
    expect(m).not.toBeNull();
    const [, width, height, left, top] = m!.map(Number);
    expect(POCKET_PHONE_ART.drawn).toEqual({ left, top, width, height });
  });

  test("the measured display belongs to the PNG PocketPhone loads", () => {
    expect(pocketSource).toContain("require('../../../assets/images/secondb-cellphone-night.png')");
    const png = readFileSync(join(process.cwd(), "assets/images/secondb-cellphone-night.png"));
    expect(png.readUInt32BE(16)).toBe(POCKET_PHONE_ART.png.width);
    expect(png.readUInt32BE(20)).toBe(POCKET_PHONE_ART.png.height);
    const { screen, png: size } = POCKET_PHONE_ART;
    expect(screen.left).toBeGreaterThan(0);
    expect(screen.top).toBeGreaterThan(0);
    expect(screen.right).toBeLessThan(size.width);
    expect(screen.bottom).toBeLessThan(size.height);
  });

  test("the display sits inside the phone frame wherever the frame is", () => {
    for (const at of [{ left: 0, top: 0 }, { left: 271.5, top: 488.25 }]) {
      const frame = { ...at, ...pocketFrame };
      const screen = pocketPhoneScreen(frame);
      expect(screen.left).toBeGreaterThan(frame.left);
      expect(screen.top).toBeGreaterThan(frame.top);
      expect(screen.left + screen.width).toBeLessThan(frame.left + frame.width);
      expect(screen.top + screen.height).toBeLessThan(frame.top + frame.height);
      // A real phone display, not a sliver: most of the frame.
      expect(screen.width).toBeGreaterThan(frame.width * 0.6);
      expect(screen.height).toBeGreaterThan(frame.height * 0.6);
    }
  });

  test("the halo reaches about one phone-width past the phone", () => {
    expect(PHONE_GLARE_SPREAD).toBe(PHONE_GLARE_HALO_PROFILE.length * PHONE_GLARE_RING_DP);
    expect(PHONE_GLARE_SPREAD).toBeGreaterThanOrEqual(pocketFrame.width * 0.9);
    expect(PHONE_GLARE_SPREAD).toBeLessThanOrEqual(pocketFrame.width * 1.1);
  });
});

describe("layers", () => {
  // A 399x844 home with the phone raised at its bottom right, as measured in the browser.
  const home = { width: 399, height: 844 };
  const frame = { left: 279, top: 515, ...pocketFrame };
  const geometry = { frame, screen: pocketPhoneScreen(frame) };

  test("are integer rects inside the home, outermost halo first, display wash last", () => {
    for (const { level } of PHONE_GLARE_STEPS) {
      const layers = phoneGlareLayers(geometry, home, level);
      expect(layers.length).toBeGreaterThan(0);
      for (const layer of layers) {
        for (const v of [layer.x, layer.y, layer.width, layer.height]) expect(Number.isInteger(v)).toBe(true);
        expect(layer.x).toBeGreaterThanOrEqual(0);
        expect(layer.y).toBeGreaterThanOrEqual(0);
        expect(layer.x + layer.width).toBeLessThanOrEqual(home.width);
        expect(layer.y + layer.height).toBeLessThanOrEqual(home.height);
      }
      expect(layers[layers.length - 1].tone).toBe("wash");
      expect(layers[layers.length - 1].level).toBe(level);
      for (let i = 1; i < layers.length; i += 1) expect(layers[i].level).toBeGreaterThanOrEqual(layers[i - 1].level);
    }
  });

  test("the halo goes around the phone and never paints over it", () => {
    const f = {
      left: Math.floor(frame.left), top: Math.floor(frame.top),
      right: Math.ceil(frame.left + frame.width), bottom: Math.ceil(frame.top + frame.height),
    };
    for (const { level } of PHONE_GLARE_STEPS) {
      for (const band of phoneGlareLayers(geometry, home, level).filter((layer) => layer.tone === "halo")) {
        const overlaps = band.x < f.right && band.x + band.width > f.left && band.y < f.bottom && band.y + band.height > f.top;
        expect(overlaps).toBe(false);
      }
    }
  });

  test("the wash covers the whole display, rounded outward", () => {
    const wash = phoneGlareLayers(geometry, home, 4).find((layer) => layer.tone === "wash")!;
    const { screen } = geometry;
    expect(wash.x).toBeLessThanOrEqual(screen.left);
    expect(wash.y).toBeLessThanOrEqual(screen.top);
    expect(wash.x + wash.width).toBeGreaterThanOrEqual(screen.left + screen.width);
    expect(wash.y + wash.height).toBeGreaterThanOrEqual(screen.top + screen.height);
    expect(wash.width - screen.width).toBeLessThan(2);
  });

  test("at full glare the halo spreads around the phone in six rings, clipped only by the home", () => {
    const layers = phoneGlareLayers(geometry, home, PHONE_GLARE_FULL);
    const halos = layers.filter((layer) => layer.tone === "halo");
    const levels = [...new Set(halos.map((layer) => layer.level))];
    expect(levels).toEqual([...PHONE_GLARE_HALO_PROFILE].reverse());
    const edge = (level: number) => {
      const bands = halos.filter((layer) => layer.level === level);
      return {
        left: Math.min(...bands.map((b) => b.x)),
        top: Math.min(...bands.map((b) => b.y)),
        right: Math.max(...bands.map((b) => b.x + b.width)),
        bottom: Math.max(...bands.map((b) => b.y + b.height)),
      };
    };
    const outer = edge(levels[0]);
    // Up and to the left there is sky: the outer ring reaches the full spread.
    expect(frame.left - outer.left).toBe(PHONE_GLARE_SPREAD);
    expect(frame.top - outer.top).toBe(PHONE_GLARE_SPREAD);
    // To the right and below, the home's own edge is the only limit.
    expect(outer.right).toBe(home.width);
    expect(outer.bottom).toBe(Math.min(home.height, frame.top + frame.height + PHONE_GLARE_SPREAD));
    // Rings nest, each a ring width bigger than the one inside it.
    for (let i = 1; i < levels.length; i += 1) expect(edge(levels[i]).left - edge(levels[i - 1]).left).toBe(PHONE_GLARE_RING_DP);
  });

  test("nothing is left at the end, and nothing is drawn on a home with no size", () => {
    expect(phoneGlareLayers(geometry, home, phoneGlareLevelAt(PHONE_GLARE_TOTAL_MS))).toEqual([]);
    expect(phoneGlareLayers(geometry, { width: 0, height: 0 }, PHONE_GLARE_FULL)).toEqual([]);
  });
});
