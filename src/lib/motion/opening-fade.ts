// Opening fade-in from the right, in pixels (Simon 2026-10-03: "오프닝 시작점에,
// 픽셀느낌으로 오른쪽에서 fade-in 하는 효과").
//
// The scene starts covered by the night-sky colour. The cover is cut into
// vertical bands; the rightmost band thins first and each band to its left
// follows one step later, so the opening is uncovered from the right edge.
//
// PIXEL-CLAY rules this follows
// ------------------------------
// * Rule 4 (no alpha): the cover thins by DITHER DENSITY, never opacity. A
//   level is the number of covered cells in the 4x4 Bayer tile (0..16) that
//   `src/components/pixel/pixel-dither-cells.ts` draws.
// * Rule 5 (steps only): nothing interpolates. Levels change on a fixed beat
//   of two pixel frames (2 x PIXEL_STEP_MS = 80 ms).
// * Rule 1 (integer rects): every band is an integer rect.
//
// The fade runs on the opening's own clock, so it starts with the opening and
// pauses with it. Reduced motion draws no cover at all. This module is pure so
// jest can import it; the renderer is `src/components/ui/OpeningFade.tsx`.

/** Covered cells in the 4x4 Bayer tile at each step of one band. */
export const OPENING_FADE_LEVELS: readonly number[] = [16, 12, 8, 4, 0];
/** Vertical bands across the screen, uncovered right to left. */
export const OPENING_FADE_BANDS = 8;
/** One step: two 40 ms pixel frames. */
export const OPENING_FADE_STEP_MS = 80;
/** Dither cell edge in dp. Chunky enough to read as pixels on the opening art. */
export const OPENING_FADE_CELL_DP = 4;
/** When the leftmost band has thinned to nothing. */
export const OPENING_FADE_TOTAL_MS = ((OPENING_FADE_BANDS - 1) + (OPENING_FADE_LEVELS.length - 1)) * OPENING_FADE_STEP_MS;

/** Cover level (0..16) of a band at elapsedMs; band 0 is the rightmost. */
export function openingFadeLevel(elapsedMs: number, bandFromRight: number): number {
  if (!Number.isFinite(elapsedMs)) return 0;
  const step = Math.floor(Math.max(0, elapsedMs) / OPENING_FADE_STEP_MS) - bandFromRight;
  if (step <= 0) return OPENING_FADE_LEVELS[0];
  return OPENING_FADE_LEVELS[Math.min(step, OPENING_FADE_LEVELS.length - 1)];
}

export interface OpeningFadeBand { x: number; y: number; width: number; height: number; level: number }

/** The bands still covering something at elapsedMs, as integer rects (left to right). */
export function openingFadeBands(width: number, height: number, elapsedMs: number): OpeningFadeBand[] {
  const w = Math.max(0, Math.ceil(width)), h = Math.max(0, Math.ceil(height));
  if (w === 0 || h === 0 || elapsedMs >= OPENING_FADE_TOTAL_MS) return [];
  const bands: OpeningFadeBand[] = [];
  for (let i = 0; i < OPENING_FADE_BANDS; i++) {
    const x = Math.floor((w * i) / OPENING_FADE_BANDS), right = Math.floor((w * (i + 1)) / OPENING_FADE_BANDS);
    const level = openingFadeLevel(elapsedMs, OPENING_FADE_BANDS - 1 - i);
    if (level > 0 && right > x) bands.push({ x, y: 0, width: right - x, height: h, level });
  }
  return bands;
}
