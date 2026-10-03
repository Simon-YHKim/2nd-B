// Opening pixel fade-in from the right (Simon 2026-10-03). Render tests are
// blocked in this repo (RN 0.85), so the schedule and geometry are pinned here
// and the renderer's contract is read from source.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  OPENING_FADE_BANDS,
  OPENING_FADE_CELL_DP,
  OPENING_FADE_LEVELS,
  OPENING_FADE_STEP_MS,
  OPENING_FADE_TOTAL_MS,
  openingFadeBands,
  openingFadeLevel,
} from "../opening-fade";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8").replace(/\r\n/g, "\n");

describe("schedule", () => {
  test("steps on two pixel frames and lasts under a second", () => {
    expect(OPENING_FADE_STEP_MS % 40).toBe(0);
    expect(OPENING_FADE_TOTAL_MS).toBe((OPENING_FADE_BANDS - 1 + OPENING_FADE_LEVELS.length - 1) * OPENING_FADE_STEP_MS);
    expect(OPENING_FADE_TOTAL_MS).toBeLessThan(1000);
  });

  test("every band starts fully covered and only ever thins", () => {
    for (let band = 0; band < OPENING_FADE_BANDS; band++) {
      expect(openingFadeLevel(0, band)).toBe(16);
      let previous = 16;
      for (let t = 0; t <= OPENING_FADE_TOTAL_MS; t += 10) {
        const level = openingFadeLevel(t, band);
        expect(OPENING_FADE_LEVELS).toContain(level);
        expect(level).toBeLessThanOrEqual(previous);
        previous = level;
      }
      expect(openingFadeLevel(OPENING_FADE_TOTAL_MS, band)).toBe(0);
    }
  });

  test("the right edge clears first; each band to its left follows one step later", () => {
    const firstStep = (band: number) => {
      for (let t = 0; t <= OPENING_FADE_TOTAL_MS; t += 1) if (openingFadeLevel(t, band) < 16) return t;
      return -1;
    };
    for (let band = 0; band < OPENING_FADE_BANDS; band++) expect(firstStep(band)).toBe((band + 1) * OPENING_FADE_STEP_MS);
  });

  test("levels change only on step boundaries (no interpolation)", () => {
    for (let t = 0; t < OPENING_FADE_TOTAL_MS; t += OPENING_FADE_STEP_MS) {
      for (let band = 0; band < OPENING_FADE_BANDS; band++) {
        expect(openingFadeLevel(t + OPENING_FADE_STEP_MS - 1, band)).toBe(openingFadeLevel(t, band));
      }
    }
  });
});

describe("geometry", () => {
  test("bands tile the screen as integer rects, left to right", () => {
    const bands = openingFadeBands(390, 844, 0);
    expect(bands).toHaveLength(OPENING_FADE_BANDS);
    expect(bands[0].x).toBe(0);
    for (let i = 0; i < bands.length; i++) {
      for (const v of [bands[i].x, bands[i].y, bands[i].width, bands[i].height]) expect(Number.isInteger(v)).toBe(true);
      if (i > 0) expect(bands[i].x).toBe(bands[i - 1].x + bands[i - 1].width);
    }
    const last = bands[bands.length - 1];
    expect(last.x + last.width).toBe(390);
  });

  test("mid-fade the right side is thinner than the left, and the end draws nothing", () => {
    const mid = openingFadeBands(390, 844, 3 * OPENING_FADE_STEP_MS);
    const levels = mid.map((band) => band.level);
    expect(levels[levels.length - 1]).toBeLessThan(levels[0]);
    expect(openingFadeBands(390, 844, OPENING_FADE_TOTAL_MS)).toEqual([]);
    expect(openingFadeBands(0, 844, 0)).toEqual([]);
  });
});

describe("renderer contract", () => {
  const source = read("src/components/ui/OpeningFade.tsx");
  const screen = read("src/components/ui/LoadingScreen.tsx");

  test("dither, not opacity; one tile grid; no touches; hidden from screen readers", () => {
    // Code, not prose: the header comment names opacity to say it is not used.
    expect(source).not.toMatch(/opacity\s*[=:]|fillOpacity|Opacity=/);
    expect(source).toContain('patternUnits="userSpaceOnUse" x={0} y={0}');
    expect(source).toContain("ditherCells(level)");
    expect(source).toContain('pointerEvents="none"');
    expect(source).toContain('importantForAccessibility="no-hide-descendants"');
    expect(source).toContain("if (reducedMotion) return null;");
    expect(OPENING_FADE_CELL_DP).toBeGreaterThanOrEqual(2);
  });

  test("the opening mounts it on its own clock, once the scene is up", () => {
    expect(screen).toContain("{sceneVisible ? <OpeningFade elapsedMs={elapsedMs} width={viewport.width} height={viewport.height} reducedMotion={reducedMotion} /> : null}");
  });
});
