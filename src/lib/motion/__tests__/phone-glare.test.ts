// The phone glare (눈부심) schedule and geometry. Render tests are blocked in
// this repo, so the whole promise lives in values: one flash, strongest first,
// stepped decay, never more than one glare per second, integer layers that
// cover the pocket phone's real display.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ditherCells } from "@/components/pixel/pixel-dither-cells";
import { PIXEL_STEP_MS } from "../pixel-physical";
import {
  markPhoneStowed,
  PHONE_GLARE_FULL,
  PHONE_GLARE_HALO_RINGS,
  PHONE_GLARE_MARGIN,
  PHONE_GLARE_READAPT_MS,
  PHONE_GLARE_RING_DP,
  PHONE_GLARE_STEPS,
  PHONE_GLARE_TOTAL_MS,
  phoneGlareHaloLevels,
  phoneGlareLayers,
  phoneGlareLevelAt,
  phoneLastStowedAt,
  POCKET_PHONE_ART,
  pocketPhoneGlareGeometry,
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

  test("the halo is dimmer than the display and fades before it", () => {
    for (const { level } of PHONE_GLARE_STEPS) {
      const halo = phoneGlareHaloLevels(level);
      expect(halo).toHaveLength(PHONE_GLARE_HALO_RINGS);
      let inner = level;
      for (const ring of halo) {
        expect(ring === 0 || ring < inner).toBe(true);
        expect(ring).toBeGreaterThanOrEqual(0);
        inner = ring;
      }
    }
    expect(phoneGlareHaloLevels(PHONE_GLARE_FULL)).toEqual([8, 4, 2]);
    // Gone before the display: the last visible step has a display and no halo.
    const last = PHONE_GLARE_STEPS[PHONE_GLARE_STEPS.length - 1].level;
    expect(last).toBeGreaterThan(0);
    expect(phoneGlareHaloLevels(last)).toEqual([0, 0, 0]);
  });

  test("dither levels nest, so nested halo rects paint as the brighter of the two", () => {
    for (let low = 0; low < PHONE_GLARE_FULL; low += 1) {
      const high = new Set(ditherCells(low + 1).map((c) => `${c.x},${c.y}`));
      for (const c of ditherCells(low)) expect(high.has(`${c.x},${c.y}`)).toBe(true);
    }
    expect(ditherCells(PHONE_GLARE_FULL)).toHaveLength(16);
  });
});

describe("when a raise plays it", () => {
  const base = { reducedMotion: false, nowMs: 100_000, lastStowedAtMs: null };

  test("a first raise plays", () => {
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

  test("lowering the phone is remembered for the next raise", () => {
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

  test("the display sits inside the phone frame and the layer leaves room for the bloom", () => {
    const { box, screen } = pocketPhoneGlareGeometry(pocketFrame);
    expect(box).toEqual({
      left: -PHONE_GLARE_MARGIN,
      top: -PHONE_GLARE_MARGIN,
      width: pocketFrame.width + 2 * PHONE_GLARE_MARGIN,
      height: pocketFrame.height + 2 * PHONE_GLARE_MARGIN,
    });
    for (const v of Object.values(box)) expect(Number.isInteger(v)).toBe(true);
    // In phone-frame coordinates the display is inside the (clipped) phone.
    const frameLeft = screen.left - PHONE_GLARE_MARGIN;
    const frameTop = screen.top - PHONE_GLARE_MARGIN;
    expect(frameLeft).toBeGreaterThan(0);
    expect(frameTop).toBeGreaterThan(0);
    expect(frameLeft + screen.width).toBeLessThan(pocketFrame.width);
    expect(frameTop + screen.height).toBeLessThan(pocketFrame.height);
    // A real phone display, not a sliver: most of the frame's width.
    expect(screen.width).toBeGreaterThan(pocketFrame.width * 0.6);
    expect(screen.height).toBeGreaterThan(pocketFrame.height * 0.6);
  });
});

describe("layers", () => {
  const { box, screen } = pocketPhoneGlareGeometry(pocketFrame);
  const bounds = { width: box.width, height: box.height };

  test("are integer rects inside the layer, outermost halo first, display wash last", () => {
    for (const { level } of PHONE_GLARE_STEPS) {
      const layers = phoneGlareLayers(screen, bounds, level);
      expect(layers.length).toBeGreaterThan(0);
      for (const layer of layers) {
        for (const v of [layer.x, layer.y, layer.width, layer.height]) expect(Number.isInteger(v)).toBe(true);
        expect(layer.x).toBeGreaterThanOrEqual(0);
        expect(layer.y).toBeGreaterThanOrEqual(0);
        expect(layer.x + layer.width).toBeLessThanOrEqual(bounds.width);
        expect(layer.y + layer.height).toBeLessThanOrEqual(bounds.height);
      }
      expect(layers[layers.length - 1].tone).toBe("wash");
      expect(layers[layers.length - 1].level).toBe(level);
      for (let i = 1; i < layers.length; i += 1) expect(layers[i].level).toBeGreaterThan(layers[i - 1].level);
    }
  });

  test("the wash covers the whole display, rounded outward", () => {
    const wash = phoneGlareLayers(screen, bounds, 4).find((layer) => layer.tone === "wash")!;
    expect(wash.tone).toBe("wash");
    expect(wash.x).toBeLessThanOrEqual(screen.left);
    expect(wash.y).toBeLessThanOrEqual(screen.top);
    expect(wash.x + wash.width).toBeGreaterThanOrEqual(screen.left + screen.width);
    expect(wash.y + wash.height).toBeGreaterThanOrEqual(screen.top + screen.height);
    expect(wash.width - screen.width).toBeLessThan(2);
  });

  test("at full glare the bloom spills past the phone in whole rings, none cut by the layer", () => {
    const layers = phoneGlareLayers(screen, bounds, PHONE_GLARE_FULL);
    const halos = layers.filter((layer) => layer.tone === "halo");
    expect(halos).toHaveLength(PHONE_GLARE_HALO_RINGS);
    const wash = layers[layers.length - 1];
    halos.forEach((halo, i) => {
      const reach = PHONE_GLARE_RING_DP * (PHONE_GLARE_HALO_RINGS - i);
      expect(wash.x - halo.x).toBe(reach);
      expect(wash.y - halo.y).toBe(reach);
      expect(halo.x + halo.width - (wash.x + wash.width)).toBe(reach);
      expect(halo.y + halo.height - (wash.y + wash.height)).toBe(reach);
    });
    // The outer ring really does reach past the phone frame (that is why the
    // glare is a sibling of the clipped phone, not a child).
    expect(halos[0].x).toBeLessThan(PHONE_GLARE_MARGIN);
    expect(halos[0].x + halos[0].width).toBeGreaterThan(PHONE_GLARE_MARGIN + pocketFrame.width);
  });

  test("nothing to paint when the glare is over or the layer has no size", () => {
    expect(phoneGlareLayers(screen, bounds, 0)).toEqual([]);
    expect(phoneGlareLayers(screen, { width: 0, height: 0 }, PHONE_GLARE_FULL)).toEqual([]);
  });
});
