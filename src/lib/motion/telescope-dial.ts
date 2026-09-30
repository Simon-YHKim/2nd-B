import { zoomToPosition } from './camera-remote';

/**
 * One magnification scale for the home sky (Simon 2026-09-30).
 *
 * A star tap and the telescope controls move the SAME world transform, so the
 * dial has to read the same number, at the same ruler position, for the same
 * on-screen magnification. Before this, the controls ran 1x..3x while the tap
 * flew to ~7x on a 425px phone and ~10.8x on a 1440px window, and the dial
 * silently stretched its range to the tap's peak for the duration of the
 * flight: 3x manually and ~7x after a tap sat at the same end of the ruler.
 *
 * Now the range is fixed. 1x is the default sky, 10x is the ceiling for both
 * paths, and the tap is kept inside the range instead of the dial moving to
 * fit the tap.
 */
export const SKY_ZOOM_MIN = 1;
export const SKY_ZOOM_MAX = 10;
/** Labelled landmarks on the home dial. 7x is left out: at phone width it would overlap the 5x/10x labels. */
export const SKY_ZOOM_STOPS: readonly number[] = [1, 2, 3, 5, 10];

export function clampZoom(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

/** Landmark text: whole numbers stay whole ("10"), anything else keeps one decimal ("2.6"). */
export function zoomLabel(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export type DialMark = { value: number; x: number; label: string };
export type DialTick = { x: number; major: boolean };

/**
 * Geometry of the moving ruler band under the fixed zoom index.
 *
 * The band is three rails wide; band x = `railWidth` is the minimum and the
 * range spans `rangeRatio` of a rail. The band slides by `offset` so the
 * current zoom sits under the index at the rail's centre.
 *
 * Graduations exist only between the minimum and maximum marks - nothing is
 * drawn for values below the minimum or above the maximum (Simon 2026-09-30:
 * "0보다 아래는 눈금이 안보이게 ... 10보다 큰건 눈금이 안보이게"). They are
 * also culled to what the rail can show, so an 80px-wide range still draws
 * only the visible handful.
 */
export function telescopeDial(options: {
  railWidth: number;
  zoom: number;
  minZoom: number;
  maxZoom: number;
  stops: readonly number[];
  tickSpacing: number;
  rangeRatio: number;
}) {
  const { railWidth, minZoom, maxZoom, tickSpacing } = options;
  const rangeWidth = railWidth * options.rangeRatio;
  const origin = railWidth;
  const bandWidth = railWidth * 3;
  const position = zoomToPosition(clampZoom(options.zoom, minZoom, maxZoom), minZoom, maxZoom);
  const offset = Math.round(railWidth / 2 - origin - position * rangeWidth);
  const at = (value: number) => Math.round(origin + zoomToPosition(value, minZoom, maxZoom) * rangeWidth);
  const values = [...new Set([minZoom, ...options.stops.filter((value) => value > minZoom && value < maxZoom), maxZoom])]
    .sort((a, b) => a - b);
  const marks: DialMark[] = values.map((value) => ({ value, x: at(value), label: zoomLabel(value) }));
  const start = at(minZoom);
  const end = at(maxZoom);
  // Band x that the rail shows, with a 2px margin so a tick half off the edge still fades in.
  const visibleFrom = -offset - 2;
  const visibleTo = railWidth - offset + 2;
  const first = Math.ceil(Math.max(start, visibleFrom) / tickSpacing);
  const last = Math.floor(Math.min(end, visibleTo) / tickSpacing);
  const ticks: DialTick[] = [];
  for (let index = first; index <= last; index++) ticks.push({ x: index * tickSpacing, major: index % 5 === 0 });
  return { offset, origin, rangeWidth, bandWidth, start, end, marks, ticks };
}

/**
 * The ruler's baseline, cut to [from, to) in band x and to the visible rail,
 * drawn as `cell`-wide steps shaded by screen position and merged into one
 * rect per run of equal shade (a handful of rects instead of one per cell).
 */
export function dialBaseline<T>(
  from: number, to: number, offset: number, railWidth: number, cell: number,
  shade: (screenFraction: number) => T,
): { x: number; width: number; shade: T }[] {
  const runs: { x: number; width: number; shade: T }[] = [];
  // Integer edges keep every rect on the pixel grid (PIXEL-CLAY rule 1) even when layout width is fractional.
  const left = Math.ceil(Math.max(from, -offset));
  const right = Math.floor(Math.min(to, railWidth - offset));
  for (let x = left; x < right; x += cell) {
    const width = Math.min(cell, right - x);
    const value = shade((x + offset) / railWidth);
    const previous = runs[runs.length - 1];
    if (previous && previous.shade === value && previous.x + previous.width === x) previous.width += width;
    else runs.push({ x, width, shade: value });
  }
  return runs;
}
