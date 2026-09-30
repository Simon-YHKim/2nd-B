// The phone glare (눈부심) schedule. Render tests are blocked in this repo, so
// the whole promise lives in values: one flash, strongest first, stepped
// decay, never more than one glare per second, integer layers that stay inside
// the phone.
import { ditherCells } from "@/components/pixel/pixel-dither-cells";
import { PIXEL_STEP_MS } from "@/lib/motion/pixel-physical";
import { fitPhoneArtwork } from "../phone-frame";
import {
  markPhoneStowed,
  PHONE_GLARE_FULL,
  PHONE_GLARE_HALO_RINGS,
  PHONE_GLARE_READAPT_MS,
  PHONE_GLARE_RING_DP,
  PHONE_GLARE_STEPS,
  PHONE_GLARE_TOTAL_MS,
  phoneGlareHaloLevels,
  phoneGlareLayers,
  phoneGlareLevelAt,
  phoneLastStowedAt,
  shouldPlayPhoneGlare,
} from "../phone-glare";

const everyMs = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

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
      let outer = level;
      for (const ring of halo) {
        expect(ring).toBeLessThan(Math.max(1, outer));
        expect(ring).toBeGreaterThanOrEqual(0);
        outer = ring;
      }
    }
    expect(phoneGlareHaloLevels(PHONE_GLARE_FULL)[0]).toBeGreaterThan(0);
    expect(phoneGlareHaloLevels(4)).toEqual([0, 0, 0]);
  });

  test("dither levels nest, so nested halo rects paint as the brighter of the two", () => {
    for (let low = 0; low < PHONE_GLARE_FULL; low += 1) {
      const high = new Set(ditherCells(low + 1).map((c) => `${c.x},${c.y}`));
      for (const c of ditherCells(low)) expect(high.has(`${c.x},${c.y}`)).toBe(true);
    }
    expect(ditherCells(PHONE_GLARE_FULL)).toHaveLength(16);
  });
});

describe("when it plays", () => {
  const base = { fromHomeSky: true, reducedMotion: false, nowMs: 100_000, lastStowedAtMs: null };

  test("only when the phone comes out of the home sky", () => {
    expect(shouldPlayPhoneGlare(base)).toBe(true);
    expect(shouldPlayPhoneGlare({ ...base, fromHomeSky: false })).toBe(false);
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

  test("putting the phone away is remembered for the next take-out", () => {
    markPhoneStowed(42_000);
    expect(phoneLastStowedAt()).toBe(42_000);
  });
});

describe("layers", () => {
  const bounds = { width: 425, height: 677 };
  const frame = fitPhoneArtwork(bounds.width, bounds.height)!;

  test("are integer rects inside the phone, outermost halo first, display wash last", () => {
    for (const { level } of PHONE_GLARE_STEPS) {
      const layers = phoneGlareLayers(frame.screen, bounds, level);
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
    const [wash] = phoneGlareLayers(frame.screen, bounds, 4);
    expect(wash.tone).toBe("wash");
    expect(wash.x).toBeLessThanOrEqual(frame.screen.left);
    expect(wash.y).toBeLessThanOrEqual(frame.screen.top);
    expect(wash.x + wash.width).toBeGreaterThanOrEqual(frame.screen.left + frame.screen.width);
    expect(wash.y + wash.height).toBeGreaterThanOrEqual(frame.screen.top + frame.screen.height);
    expect(wash.width - frame.screen.width).toBeLessThan(2);
  });

  test("at full glare the bloom spills over the bezel in rings", () => {
    const layers = phoneGlareLayers(frame.screen, bounds, PHONE_GLARE_FULL);
    const halos = layers.filter((layer) => layer.tone === "halo");
    expect(halos).toHaveLength(PHONE_GLARE_HALO_RINGS);
    const wash = layers[layers.length - 1];
    const inner = halos[halos.length - 1];
    expect(wash.x - inner.x).toBe(PHONE_GLARE_RING_DP);
    expect(wash.y - inner.y).toBe(PHONE_GLARE_RING_DP);
  });

  test("nothing to paint when the glare is over or the phone has no size", () => {
    expect(phoneGlareLayers(frame.screen, bounds, 0)).toEqual([]);
    expect(phoneGlareLayers(frame.screen, { width: 0, height: 0 }, PHONE_GLARE_FULL)).toEqual([]);
  });
});
